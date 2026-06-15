// Self-Hosted Identity Kernel — daemon.
//
// A minimal HTTP service that *is* the agent's identity, intended to run on
// self-owned hardware (Raspberry Pi, home server, USB module). It exposes the
// SHIK API described in the paper:
//
//   GET  /shik/whoami      → public self-description (id, key, profile, commitments)
//   GET  /shik/state       → full local identity state I = ⟨id,K,P,M,H⟩
//   GET  /shik/invariants  → live status of the five identity invariants
//   GET  /shik/peers       → social graph of recognized counterparts
//   POST /shik/memory      → commit a memory  { content, kind }
//   POST /shik/handshake   → accept a peer's SHIK Handshake v0, verify, respond  (§6)
//   POST /shik/connect     → initiate a handshake against a peer URL  { url }
//
// Cognition lives elsewhere; this node never depends on any particular model.

import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  buildHandshake,
  verifyHandshake,
  verifyHandshakeSignature,
  computeCommitments,
  checkInvariants,
  appendHistory,
  HandshakeMessage,
  IdentityState,
} from '../src/lib/shik-kernel';
import { loadOrCreate, save, DaemonData, PeerRecord } from './store';

const PORT = Number(process.env.PORT || process.argv[2] || 4710);
const DATA = process.env.SHIK_DATA || process.argv[3] || `./.shik-data/node-${PORT}.json`;
const NAME = process.env.SHIK_NAME || process.argv[4] || `node-${PORT}`;
const ROLES = (process.env.SHIK_ROLES || 'research_companion,org:HappyAlien').split(',');

let data: DaemonData;

function log(...args: unknown[]) {
  console.log(`[${NAME}]`, ...args);
}

function send(res: ServerResponse, code: number, body: unknown) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Record (or update) a peer in the social graph after a verified handshake. */
function recordPeer(msg: HandshakeMessage, governanceSeen = false): PeerRecord {
  const prev = data.peers[msg.shik_id];
  const rec: PeerRecord = {
    shik_id: msg.shik_id,
    key_id: msg.key_id,
    public_key: msg.public_key,
    state_commitments: msg.state_commitments,
    policy_governance_seen: governanceSeen || prev?.policy_governance_seen || false,
    trust_score: prev ? Math.min(1, prev.trust_score + 0.1) : 0.5,
    relationship_summary: prev
      ? `seen ${prev.encounters + 1}× as ${msg.self_profile.roles.join('/')}`
      : `first contact as ${msg.self_profile.roles.join('/')}`,
    encounters: (prev?.encounters || 0) + 1,
    last_seen: new Date().toISOString(),
  };
  data.peers[msg.shik_id] = rec;
  return rec;
}

async function publicSelf() {
  const i = data.identity;
  const commitments = await computeCommitments(i);
  return {
    name: NAME,
    shik_id: i.id,
    key_id: i.activeKey.keyId,
    public_key: i.activeKey.publicKeyB58,
    self_profile: { version: i.profileVersion, roles: i.roles },
    state_commitments: commitments,
    memory_count: i.memory.length,
    history_length: i.history.length,
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const route = `${req.method} ${url.pathname}`;

    switch (route) {
      case 'GET /shik/whoami':
        return send(res, 200, await publicSelf());

      case 'GET /shik/state':
        return send(res, 200, data.identity);

      case 'GET /shik/invariants': {
        // Self-check: state is consistent with itself (a no-op transition).
        const inv = checkInvariants(data.identity, data.identity);
        return send(res, 200, inv);
      }

      case 'GET /shik/peers':
        return send(res, 200, Object.values(data.peers));

      case 'POST /shik/memory': {
        const body = await readBody(req);
        if (!body.content) return send(res, 400, { error: 'content required' });
        const mem = {
          id: `mem-${Date.now()}`,
          content: String(body.content),
          kind: body.kind === 'episodic' ? 'episodic' : 'semantic',
          sourceType: 'inferred' as const,
          provenance: body.provenance || 'api',
          confidence: body.confidence ?? 0.9,
          createdAt: new Date().toISOString(),
        };
        const history = await appendHistory(
          data.identity.history, 'memory_commit', `Committed ${mem.kind} memory`,
        );
        data.identity = { ...data.identity, memory: [mem as any, ...data.identity.memory], history };
        save(DATA, data);
        return send(res, 200, { ok: true, memory_root: (await computeCommitments(data.identity)).memory_root });
      }

      // §6 — a counterpart presents its handshake; we verify and respond.
      case 'POST /shik/handshake': {
        const msg = (await readBody(req)) as HandshakeMessage;
        const prev = data.peers[msg.shik_id];
        const verification = await verifyHandshake(msg, prev);
        log(`handshake from ${msg.shik_id.slice(0, 22)}… → sig=${verification.signatureValid} (${verification.summary})`);
        if (!verification.signatureValid) {
          return send(res, 401, { error: 'handshake rejected', verification });
        }
        recordPeer(msg);
        save(DATA, data);
        const response = await buildHandshake(data.identity, 'response', msg.instance_nonce);
        return send(res, 200, { response, verification });
      }

      // Initiate: build our request, POST it to a peer, verify their response.
      case 'POST /shik/connect': {
        const body = await readBody(req);
        const peerUrl = body.url;
        if (!peerUrl) return send(res, 400, { error: 'url required' });
        const request = await buildHandshake(data.identity, 'request');
        const r = await fetch(`${peerUrl.replace(/\/$/, '')}/shik/handshake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        const peerReply = await r.json();
        if (!r.ok) return send(res, 502, { error: 'peer rejected handshake', peerReply });
        const sig = await verifyHandshakeSignature(peerReply.response as HandshakeMessage);
        if (sig.ok) {
          recordPeer(peerReply.response);
          save(DATA, data);
        }
        log(`connected to ${peerUrl} → peer sig=${sig.ok} (${sig.reason})`);
        return send(res, 200, {
          ok: sig.ok,
          peer_signature: sig,
          peer: peerReply.response && {
            shik_id: peerReply.response.shik_id,
            roles: peerReply.response.self_profile?.roles,
          },
        });
      }

      default:
        return send(res, 404, { error: 'not found', route });
    }
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

(async () => {
  data = await loadOrCreate(DATA, ROLES);
  server.listen(PORT, () => {
    log(`SHIK kernel daemon listening on http://localhost:${PORT}`);
    log(`identity: ${data.identity.id}`);
    log(`data file: ${DATA}`);
  });
})();
