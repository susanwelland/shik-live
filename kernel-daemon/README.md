# SHIK Kernel Daemon

A minimal, self-hosted **Self-Hosted Identity Kernel** service — the systems
contribution of Kingsley (2025), made real. It runs the agent's identity
`I = ⟨id, K, P, M, H⟩` on hardware *you* own (a Raspberry Pi, a home server, a
mini-PC) and exposes the SHIK API. Cognition (Gemini, a local Llama, Claude…)
lives elsewhere and is swappable; this node never depends on it.

> This is the artifact that makes the paper's "self-hosted, portable, decentralized"
> claims demonstrable on real, cheap hardware.

## What it does

- Generates a **self-certifying identity** on first boot: a `did:shik:…` derived
  from a real ECDSA P-256 keypair (WebCrypto), persisted on disk.
- Serves the **SHIK API** over HTTP.
- Performs **SHIK Handshake v0** with other nodes — cryptographically verifying
  signatures, binding keys to ids, recording peers in a social graph with
  evolving trust, and rejecting forged handshakes.
- Maintains an **append-only, hash-chained history** and live **state commitments**
  (`policy_core_root`, `memory_root`, `history_tip`).

## API

| Method & path | Purpose |
|---|---|
| `GET /shik/whoami` | Public self-description: id, key, profile, commitments. |
| `GET /shik/state` | Full local identity state `I` (this node only). |
| `GET /shik/invariants` | Live status of the five identity invariants. |
| `GET /shik/peers` | Social graph of recognized counterparts. |
| `POST /shik/memory` | Commit a memory: `{ "content": "...", "kind": "semantic" }`. |
| `POST /shik/handshake` | Accept a peer's handshake, verify, respond (§6). |
| `POST /shik/connect` | Initiate a handshake to a peer: `{ "url": "http://host:port" }`. |

## Run locally (two-agent handshake demo)

From the repo root:

```bash
npm install
npm run kernel:a    # agent-A on :4710  (negotiation_agent)
npm run kernel:b    # agent-B on :4711  (coordination_agent)   — in a second terminal
```

Then drive a real, signed handshake between the two agents:

```bash
# A introduces itself to B; both verify signatures and record each other
curl -s -X POST localhost:4710/shik/connect \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:4711"}' | jq

# Inspect the social graph (trust rises with each verified encounter)
curl -s localhost:4710/shik/peers | jq
curl -s localhost:4711/shik/peers | jq
```

Expected: `"peer_signature": { "ok": true, "reason": "Signature valid and key bound to id." }`,
and each node lists the other with a `trust_score` that increases on repeat encounters.
Forged or mismatched handshakes return `401 handshake rejected`.

## Deploy on a Raspberry Pi

A Pi 4/5 (2 GB is plenty) is the canonical SHIK node. The kernel uses tens of
MB of RAM — hashing and signatures only.

### One-shot setup

```bash
# On the Pi (Raspberry Pi OS / Debian, 64-bit recommended):
git clone <your-repo-url> shik-live && cd shik-live
./kernel-daemon/setup-pi.sh
```

`setup-pi.sh` installs Node 20 LTS (if missing), runs `npm install`, and
installs a **systemd** service so the kernel starts on boot and restarts on
failure.

### Manual setup

```bash
# 1. Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Dependencies
cd ~/shik-live && npm install

# 3. Install the service (edit User/paths in the unit first if needed)
sudo cp kernel-daemon/shik-kernel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shik-kernel

# 4. Check it
systemctl status shik-kernel
curl -s localhost:4710/shik/whoami | jq
journalctl -u shik-kernel -f      # follow logs
```

The identity and social graph persist in `~/shik-live/.shik-data/`. **Back this
directory up** — it *is* the agent's self. To move the agent to a new node,
copy the data file (or use the UI's signed Export/Import).

### Two physical Pis (the decentralized demo)

Run the daemon on two Pis on the same LAN, then from Pi-A:

```bash
curl -s -X POST localhost:4710/shik/connect \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://<pi-B-ip>:4710"}' | jq
```

You now have two independently owned agents that recognize each other across the
network purely via signed identity commitments — no central registry.

### Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `4710` | HTTP port. |
| `SHIK_DATA` | `./.shik-data/node-<port>.json` | Identity + social-graph file. |
| `SHIK_NAME` | `node-<port>` | Log label. |
| `SHIK_ROLES` | `research_companion,org:HappyAlien` | Comma-separated roles in the self-profile. |

### Hardening (production / thesis defense)

- **Key custody:** move the private key into a USB HSM / secure element
  (YubiKey, NXP SE050) so signing happens in hardware. The daemon currently
  stores the JWK in the data file for simplicity.
- **Transport:** put the daemon behind TLS (a reverse proxy or DIDComm-style
  encrypted envelopes) — the handshake is designed to ride any authenticated channel.
- **Local cognition:** run Ollama on the same Pi/GPU box and point the web app's
  cognition adapter at it (`OLLAMA_URL`) for an entirely cloud-free agent.

## Relationship to the web app

The Next.js app in `src/` is the *visualization* and live multimodal demo; this
daemon is the *self-hosted substrate*. They share the same kernel logic
(`src/lib/shik-kernel.ts`), so a handshake generated in the browser and one
generated by the daemon are the same protocol.
