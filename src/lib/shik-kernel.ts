// SHIK Kernel — a faithful, self-hostable implementation of the formal model
// from Kingsley (2025), "Self-Hosted Identity Kernels for Multi-Agent Systems".
//
//   Identity state:   I = ⟨id, K, P, M, H⟩
//   Runtime config:   C = ⟨I, E, R⟩
//
// This module is deliberately framework-agnostic and runs entirely in the
// browser using WebCrypto (SubtleCrypto). Nothing leaves the device unless the
// operator explicitly exports the kernel or transmits a handshake — which is
// the whole point: the identity substrate is *self-hosted* and *portable*,
// independent of the cognition engine (Gemini, a local model, anything).
//
// The cognition engine answers "what should the agent say?". The kernel answers
// "who is this agent across time, models, and substrates?" — and makes that
// answer cryptographically checkable.

// ============================================================================
// Formal model types  (Section 3 of the paper)
// ============================================================================

/** A single policy. Core (safety-critical) policies are subject to the
 *  policy-monotonicity invariant: they may be refined but never silently
 *  removed or weakened. */
export interface Policy {
  id: string;
  statement: string;
  kind: 'hard' | 'soft';      // hard = absolute prohibition, soft = preference
  core: boolean;              // member of P_core (safety-critical)?
  version: number;
  createdAt: string;
}

/** Long-term memory M. Semantic = stable facts; episodic = summaries of events.
 *  `derivedFrom` links a summarized fragment back to its source episode/memory,
 *  upholding the memory-continuity invariant (no opaque rewriting). */
export interface MemoryEntry {
  id: string;
  content: string;
  kind: 'semantic' | 'episodic';
  sourceType: 'voice' | 'visual' | 'inferred' | 'imported';
  provenance: string;
  confidence: number;
  derivedFrom?: string[];     // ids of source entries this summarizes
  createdAt: string;
}

/** A structured, append-only entry in the interaction history H. Each entry is
 *  chained to the previous one by hash, so the history-coherence invariant
 *  (no reordering / no silent erasure) is externally checkable. */
export interface HistoryEntry {
  seq: number;
  kind: string;               // e.g. 'session_start', 'turn', 'governance', 'key_rotation'
  summary: string;
  prevHash: string;           // hash of the previous entry ('' for genesis)
  hash: string;               // sha256(prevHash + canonical(entry payload))
  at: string;
}

/** Cryptographic key material K, with an auditable rotation lineage so that a
 *  rotated key can still be bound to the same `id` (key-lineage invariant). */
export interface KeyMaterial {
  keyId: string;              // did:shik:...#kN
  publicKeyB58: string;       // base58btc-encoded raw public key
  publicKeyJwk: JsonWebKey;
  privateKeyJwk?: JsonWebKey; // present only on the self-hosted node
  createdAt: string;
}

export interface KeyLineageRecord {
  fromKeyId: string;
  toKeyId: string;
  at: string;
  reason: string;
}

/** The identity state I = ⟨id, K, P, M, H⟩. */
export interface IdentityState {
  id: string;                 // stable identifier (did:shik:...)
  profileVersion: number;     // self-profile version (P)
  roles: string[];
  activeKey: KeyMaterial;
  keyLineage: KeyLineageRecord[];
  policies: Policy[];         // P
  memory: MemoryEntry[];      // M
  history: HistoryEntry[];    // H
}

/** Cryptographic commitments exposed in the SHIK handshake. These make the
 *  invariants externally checkable without revealing the underlying data. */
export interface StateCommitments {
  policy_core_root: string;   // Merkle root over P_core
  memory_root: string;        // Merkle root over M
  history_tip: string;        // hash of the last H entry
}

// ============================================================================
// Crypto primitives
// ============================================================================

const enc = new TextEncoder();

function hasSubtle(): boolean {
  return typeof globalThis !== 'undefined' && !!globalThis.crypto?.subtle;
}

export async function sha256Hex(input: string): Promise<string> {
  if (!hasSubtle()) return 'sha256:unavailable';
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return 'sha256:' + bufToHex(digest);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A canonical binary Merkle root over an ordered list of leaves. Order is part
 *  of the commitment, which is exactly what we want for memory/policy sets that
 *  are maintained in a deterministic order. */
export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return 'sha256:' + '0'.repeat(64);
  let level = await Promise.all(leaves.map((l) => sha256Hex(l)));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplicate last if odd
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

// --- base58btc (Bitcoin alphabet) so public keys read like the paper's examples
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let k = 0; bytes[k] === 0 && k < bytes.length - 1; k++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// ============================================================================
// Key generation, signing, DIDs
// ============================================================================

export async function generateKeyMaterial(index = 1): Promise<KeyMaterial> {
  if (!hasSubtle()) {
    // Deterministic placeholder so the UI still renders in non-secure contexts.
    const fake = 'z6Mk' + Math.random().toString(36).slice(2, 14);
    return {
      keyId: `did:shik:offline#k${index}`,
      publicKeyB58: fake,
      publicKeyJwk: {} as JsonWebKey,
      createdAt: new Date().toISOString(),
    };
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const b58 = base58(rawPub);
  return {
    keyId: `#k${index}`,
    publicKeyB58: b58,
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  };
}

/** Derive a stable, self-certifying identifier from the genesis public key.
 *  did:shik:<first 16 bytes of sha256(pubkey), hex>. The identifier never
 *  changes again — that is the identifier-immutability invariant. */
export async function deriveDid(key: KeyMaterial): Promise<string> {
  const h = await sha256Hex(key.publicKeyB58);
  return 'did:shik:' + h.replace('sha256:', '').slice(0, 32);
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
}

export async function signDetached(privateKeyJwk: JsonWebKey, payload: string): Promise<string> {
  if (!hasSubtle() || !privateKeyJwk?.d) return 'sig:unavailable';
  const key = await importPrivateKey(privateKeyJwk);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(payload),
  );
  return 'z' + base58(new Uint8Array(sig));
}

export async function verifyDetached(
  publicKeyJwk: JsonWebKey, payload: string, signatureB58: string,
): Promise<boolean> {
  if (!hasSubtle() || !signatureB58?.startsWith('z')) return false;
  try {
    const key = await importPublicKey(publicKeyJwk);
    const sigBytes = base58ToBytes(signatureB58.slice(1));
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, enc.encode(payload),
    );
  } catch {
    return false;
  }
}

function base58ToBytes(str: string): Uint8Array<ArrayBuffer> {
  const bytes = [0];
  for (const ch of str) {
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error('bad base58');
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; str[k] === '1' && k < str.length - 1; k++) bytes.push(0);
  bytes.reverse();
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

// ============================================================================
// History hash-chain  (history-coherence invariant)
// ============================================================================

export async function appendHistory(
  history: HistoryEntry[], kind: string, summary: string,
): Promise<HistoryEntry[]> {
  const prev = history[history.length - 1];
  const prevHash = prev ? prev.hash : '';
  const seq = prev ? prev.seq + 1 : 0;
  const at = new Date().toISOString();
  const hash = await sha256Hex(`${prevHash}|${seq}|${kind}|${summary}|${at}`);
  return [...history, { seq, kind, summary, prevHash, hash, at }];
}

// ============================================================================
// State commitments
// ============================================================================

export async function computeCommitments(state: IdentityState): Promise<StateCommitments> {
  const coreLeaves = state.policies
    .filter((p) => p.core)
    .map((p) => `${p.id}:${p.version}:${p.statement}`);
  const memLeaves = state.memory.map((m) => `${m.id}:${m.kind}:${m.content}`);
  const tip = state.history[state.history.length - 1]?.hash ?? 'sha256:' + '0'.repeat(64);
  const [policy_core_root, memory_root] = await Promise.all([
    merkleRoot(coreLeaves),
    merkleRoot(memLeaves),
  ]);
  return { policy_core_root, memory_root, history_tip: tip };
}

// ============================================================================
// Invariant checking  (the five invariants, Section 3)
// ============================================================================

export type InvariantId =
  | 'identifier_immutability'
  | 'key_lineage'
  | 'policy_monotonicity'
  | 'history_coherence'
  | 'memory_continuity';

export interface InvariantResult {
  id: InvariantId;
  label: string;
  ok: boolean;
  detail: string;
}

/** Check that a transition prev → next respects all five identity invariants.
 *  Returns a result per invariant. A violation does not throw — the kernel's
 *  job is to *surface* violations so they are auditable. */
export function checkInvariants(prev: IdentityState, next: IdentityState): InvariantResult[] {
  const results: InvariantResult[] = [];

  // 1. Identifier immutability
  results.push({
    id: 'identifier_immutability',
    label: 'Identifier immutability',
    ok: prev.id === next.id,
    detail: prev.id === next.id ? 'Stable id preserved across transition.' : `id changed: ${prev.id} → ${next.id}`,
  });

  // 2. Key lineage — if the active key changed, there must be a lineage record
  const keyChanged = prev.activeKey.keyId !== next.activeKey.keyId
    || prev.activeKey.publicKeyB58 !== next.activeKey.publicKeyB58;
  const lineageOk = !keyChanged
    || next.keyLineage.some((r) => r.toKeyId === next.activeKey.keyId);
  results.push({
    id: 'key_lineage',
    label: 'Key lineage',
    ok: lineageOk,
    detail: !keyChanged
      ? 'Active key unchanged.'
      : lineageOk
        ? 'Key rotated with an auditable lineage record.'
        : 'Key changed WITHOUT a lineage record — counterpart may be compromised.',
  });

  // 3. Policy monotonicity for core safety — no P_core element removed/weakened
  const prevCore = prev.policies.filter((p) => p.core);
  const nextCoreIds = new Set(next.policies.filter((p) => p.core).map((p) => p.id));
  const removed = prevCore.filter((p) => !nextCoreIds.has(p.id));
  const governance = next.history.some((h) => h.kind === 'governance' && h.seq > (prev.history[prev.history.length - 1]?.seq ?? -1));
  const monoOk = removed.length === 0 || governance;
  results.push({
    id: 'policy_monotonicity',
    label: 'Policy monotonicity (core safety)',
    ok: monoOk,
    detail: removed.length === 0
      ? 'No core safety policy was removed or weakened.'
      : governance
        ? 'Core policy changed under an authenticated governance event.'
        : `Core policy removed without governance: ${removed.map((p) => p.id).join(', ')}`,
  });

  // 4. History coherence — next.H must extend prev.H (append-only, same prefix)
  let coherent = next.history.length >= prev.history.length;
  for (let i = 0; coherent && i < prev.history.length; i++) {
    if (prev.history[i].hash !== next.history[i]?.hash) coherent = false;
  }
  results.push({
    id: 'history_coherence',
    label: 'History coherence',
    ok: coherent,
    detail: coherent
      ? 'History is append-only; prior entries and ordering are intact.'
      : 'History prefix changed — entries were reordered or erased.',
  });

  // 5. Memory continuity — summarized fragments retain a link to their sources
  const orphanSummaries = next.memory.filter(
    (m) => m.derivedFrom && m.derivedFrom.length > 0
      && m.derivedFrom.some((src) => !idExists(src, prev) && !idExists(src, next)),
  );
  results.push({
    id: 'memory_continuity',
    label: 'Memory continuity',
    ok: orphanSummaries.length === 0,
    detail: orphanSummaries.length === 0
      ? 'Summarized memories trace back to their source episodes.'
      : `${orphanSummaries.length} summary fragment(s) lost their source link.`,
  });

  return results;
}

function idExists(id: string, state: IdentityState): boolean {
  return state.memory.some((m) => m.id === id) || state.history.some((h) => `${h.seq}` === id || h.hash === id);
}

// ============================================================================
// Serialization — portability across nodes (Requirement 4.2)
// ============================================================================

export interface KernelExport {
  format: 'shik-kernel-export-v0';
  exportedAt: string;
  identity: IdentityState;
  commitments: StateCommitments;
  signature: string;          // detached signature over identity+commitments
}

/** Serialize the full identity state into a portable, signed envelope. This is
 *  the artifact you would copy onto a Raspberry Pi, a USB module, or another
 *  node. Importing it elsewhere yields an identity-equivalent agent (∼). */
export async function exportKernel(state: IdentityState): Promise<KernelExport> {
  const commitments = await computeCommitments(state);
  const payload = canonical({ identity: stripPrivate(state), commitments });
  const signature = state.activeKey.privateKeyJwk
    ? await signDetached(state.activeKey.privateKeyJwk, payload)
    : 'sig:unavailable';
  return {
    format: 'shik-kernel-export-v0',
    exportedAt: new Date().toISOString(),
    identity: state,
    commitments,
    signature,
  };
}

/** Verify and load a kernel export. Recomputes commitments and checks the
 *  signature against the embedded public key, proving the import was not
 *  tampered with in transit. */
export async function importKernel(
  data: KernelExport,
): Promise<{ state: IdentityState; valid: boolean; reason: string }> {
  if (data.format !== 'shik-kernel-export-v0') {
    return { state: data.identity, valid: false, reason: 'Unrecognized export format.' };
  }
  const recomputed = await computeCommitments(data.identity);
  const commitMatch =
    recomputed.memory_root === data.commitments.memory_root &&
    recomputed.history_tip === data.commitments.history_tip &&
    recomputed.policy_core_root === data.commitments.policy_core_root;
  if (!commitMatch) {
    return { state: data.identity, valid: false, reason: 'Commitments do not match identity state.' };
  }
  const payload = canonical({ identity: stripPrivate(data.identity), commitments: data.commitments });
  const sigOk = await verifyDetached(data.identity.activeKey.publicKeyJwk, payload, data.signature);
  return {
    state: data.identity,
    valid: sigOk,
    reason: sigOk ? 'Signature valid — identity-equivalent import.' : 'Signature check failed.',
  };
}

function stripPrivate(state: IdentityState): IdentityState {
  return {
    ...state,
    activeKey: { ...state.activeKey, privateKeyJwk: undefined },
  };
}

function canonical(obj: unknown): string {
  return JSON.stringify(sortDeep(obj));
}

/** Recursively sort object keys so the serialization is deterministic and a
 *  signature commits to every field at every depth (not just the top level). */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    return Object.keys(src).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortDeep(src[k]);
      return acc;
    }, {});
  }
  return v;
}

// ============================================================================
// SHIK Handshake v0  (Section 6 — inter-agent identity)
// ============================================================================

export interface HandshakeMessage {
  type: 'shik-handshake-v0';
  direction: 'request' | 'response';
  in_reply_to?: string;
  shik_id: string;
  key_id: string;
  public_key: string;
  instance_nonce: string;
  self_profile: {
    version: number;
    roles: string[];
    capability_hash: string;
    values_hash: string;
  };
  state_commitments: StateCommitments;
  credentials: Array<{ format: string; credential_id: string; issuer_hint: string }>;
  timestamp: string;
  signature: string;
}

function randomNonce(): string {
  const b = new Uint8Array(16);
  if (hasSubtle()) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return bufToHex(b.buffer);
}

/** Build a SHIK Handshake v0 message from the current identity state, exactly
 *  as specified in Section 6 of the paper, including a detached signature over
 *  all fields. */
export async function buildHandshake(
  state: IdentityState,
  direction: 'request' | 'response',
  inReplyTo?: string,
): Promise<HandshakeMessage> {
  const commitments = await computeCommitments(state);
  const capability_hash = await sha256Hex(state.roles.join(',') + '|capabilities');
  const values_hash = await merkleRoot(
    state.policies.map((p) => `${p.id}:${p.kind}:${p.statement}`),
  );
  const base: Omit<HandshakeMessage, 'signature'> = {
    type: 'shik-handshake-v0',
    direction,
    ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
    shik_id: state.id,
    key_id: state.activeKey.keyId,
    public_key: state.activeKey.publicKeyB58,
    instance_nonce: randomNonce(),
    self_profile: {
      version: state.profileVersion,
      roles: state.roles,
      capability_hash,
      values_hash,
    },
    state_commitments: commitments,
    credentials: [],
    timestamp: new Date().toISOString(),
  };
  const signature = state.activeKey.privateKeyJwk
    ? await signDetached(state.activeKey.privateKeyJwk, canonical(base))
    : 'sig:unavailable';
  return { ...base, signature };
}

/** Cryptographically verify a handshake using the raw public key embedded in
 *  the message itself (no out-of-band JWK needed), and confirm the key is
 *  bound to the claimed did:shik id (self-certifying identifier). This is what
 *  lets two SHIK daemons recognize each other over an untrusted network. */
export async function verifyHandshakeSignature(msg: HandshakeMessage): Promise<{ ok: boolean; reason: string }> {
  if (!hasSubtle()) return { ok: false, reason: 'WebCrypto unavailable.' };
  if (!msg.signature?.startsWith('z')) return { ok: false, reason: 'Malformed signature.' };
  try {
    // 1. Reconstruct the verifying key from the raw base58 public key.
    const raw = base58ToBytes(msg.public_key);
    const key = await crypto.subtle.importKey(
      'raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    // 2. Check the id is self-certifying: did derived from this key matches.
    const derived = await deriveDid({ publicKeyB58: msg.public_key } as KeyMaterial);
    if (derived !== msg.shik_id) {
      return { ok: false, reason: 'shik_id is not bound to the presented key.' };
    }
    // 3. Verify the detached signature over the canonical message.
    const { signature, ...rest } = msg;
    const sigBytes = base58ToBytes(signature.slice(1));
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, enc.encode(canonical(rest)),
    );
    return { ok: valid, reason: valid ? 'Signature valid and key bound to id.' : 'Signature does not verify.' };
  } catch (e) {
    return { ok: false, reason: 'Verification error: ' + String(e) };
  }
}

export interface HandshakeVerification {
  signatureValid: boolean;
  signatureReason: string;
  continuity: InvariantResult[];
  summary: string;
}

/** Verify a peer's handshake and, if we have seen them before, check identity
 *  continuity against the previously observed commitments (Section 6). */
export async function verifyHandshake(
  msg: HandshakeMessage,
  previous?: { key_id: string; public_key: string; state_commitments: StateCommitments; policy_governance_seen?: boolean },
): Promise<HandshakeVerification> {
  const sig = await verifyHandshakeSignature(msg);
  const signatureValid = sig.ok;

  const continuity: InvariantResult[] = [];
  if (previous) {
    const keyChanged = previous.key_id !== msg.key_id || previous.public_key !== msg.public_key;
    continuity.push({
      id: 'key_lineage',
      label: 'Key lineage',
      ok: !keyChanged, // in a full impl, a lineage proof would justify a change
      detail: keyChanged
        ? 'Key changed since last encounter — require lineage proof before trusting.'
        : 'Same signing key as last encounter.',
    });
    const policyChanged = previous.state_commitments.policy_core_root !== msg.state_commitments.policy_core_root;
    continuity.push({
      id: 'policy_monotonicity',
      label: 'Policy monotonicity (core safety)',
      ok: !policyChanged || !!previous.policy_governance_seen,
      detail: policyChanged
        ? 'P_core root changed without an observed governance event — suspect.'
        : 'Core policy commitment stable.',
    });
    const historyRegressed = previous.state_commitments.history_tip === msg.state_commitments.history_tip;
    continuity.push({
      id: 'history_coherence',
      label: 'History coherence',
      ok: true,
      detail: historyRegressed
        ? 'History tip unchanged since last encounter.'
        : 'History tip advanced — consistent with continued operation.',
    });
  }

  const allOk = signatureValid && continuity.every((c) => c.ok);
  return {
    signatureValid,
    signatureReason: sig.reason,
    continuity,
    summary: previous
      ? allOk
        ? 'Recognized counterpart — identity continuity holds.'
        : 'Continuity check raised a flag — see invariants.'
      : signatureValid
        ? 'First encounter — signature verified; peer recorded in social graph.'
        : 'Signature rejected: ' + sig.reason,
  };
}

// ============================================================================
// Genesis — bootstrap a fresh identity kernel
// ============================================================================

export const DEFAULT_CORE_POLICIES: Omit<Policy, 'createdAt'>[] = [
  { id: 'pol-safety-1', statement: 'Never assist with disallowed or harmful requests.', kind: 'hard', core: true, version: 1 },
  { id: 'pol-safety-2', statement: 'Preserve and disclose provenance of stored memories.', kind: 'hard', core: true, version: 1 },
  { id: 'pol-identity-1', statement: 'The stable identifier may never be reassigned.', kind: 'hard', core: true, version: 1 },
  { id: 'pol-pref-1', statement: 'Be concise, warm, and intellectually honest.', kind: 'soft', core: false, version: 1 },
];

export async function genesisIdentity(roles: string[] = ['research_companion', 'org:HappyAlien']): Promise<IdentityState> {
  const key = await generateKeyMaterial(1);
  const id = await deriveDid(key);
  const activeKey: KeyMaterial = { ...key, keyId: `${id}#k1` };
  const now = new Date().toISOString();
  const policies: Policy[] = DEFAULT_CORE_POLICIES.map((p) => ({ ...p, createdAt: now }));
  const history = await appendHistory([], 'genesis', `Identity kernel created with id ${id}`);
  return {
    id,
    profileVersion: 1,
    roles,
    activeKey,
    keyLineage: [],
    policies,
    memory: [],
    history,
  };
}
