# SHIK Live

**A real-time multimodal agent with a visible identity kernel.**

SHIK Live demonstrates that AI agent continuity should exist as an explicit substrate, not as an accidental byproduct of transient model state.

## The Concept

Most AI agents today are just prompt templates + transient state. When the model swaps or the session ends, the agent's identity vanishes. SHIK proposes that **identity and continuity should be an explicit architectural layer**, separate from any particular cognition engine.

This prototype makes the separation between live reasoning (Gemini) and persistent identity (the kernel) visually and architecturally obvious.

## Architecture

```
[Browser Client]
    ├── Mic Audio ──→ [Gemini 2.0 Flash Live API]
    ├── Camera/Screen Frames ──→ [Gemini 2.0 Flash Live API]
    │                                    │
    │                              [Live Reasoning]
    │                                    │
    │                         ┌──────────┴──────────┐
    │                         │                     │
    │                    [Audio Response]    [Identity Updates]
    │                         │                     │
    ├── ← Audio Playback ─────┘                     │
    │                                               ▼
    │                                    [Identity Kernel Layer]
    │                                    ┌──────────────────┐
    │                                    │ Core Memory      │
    │                                    │ Session Context  │
    │                                    │ Provenance       │
    │                                    │ Continuity State │
    │                                    └────────┬─────────┘
    │                                             │
    │                                             ▼
    │                                    [Cloud Firestore]
    │                                             │
    └── ← Real-time UI Updates ──────────────────┘

    All hosted on [Google Cloud Run]
```

**Key insight:** Gemini handles live reasoning. The Identity Kernel handles continuity. These are architecturally separate — that's the SHIK thesis.

## Quick Start

### Prerequisites
- Node.js 18+
- Google Cloud account with billing enabled
- Gemini API key

### Setup
```bash
git clone [repo-url]
cd shik-live
npm install
cp .env.example .env
# Add your GEMINI_API_KEY and GCP_PROJECT_ID to .env
npm run dev
```

### Deploy to Cloud Run
```bash
gcloud run deploy shik-live --source . --region us-central1
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `FIREBASE_PROJECT_ID` | Firestore project ID (optional) |

## Features

- **Real-time voice interaction** — Speak naturally with the agent
- **Interruptibility** — Interrupt mid-response, agent handles gracefully
- **Visual input** — Camera or screen capture, agent references what it sees
- **Self-Hosted Identity Kernel** — a faithful implementation of the paper's formal model `I = ⟨id, K, P, M, H⟩`, computed client-side and stored on-device:
  - **Identity anchor** — a self-certifying `did:shik:…` derived from a real ECDSA P-256 keypair (WebCrypto), with auditable key lineage.
  - **Policy & values (P)** — versioned core (safety-critical) and soft policies.
  - **Memory (M)** — semantic + episodic, each with provenance.
  - **History (H)** — an append-only, hash-chained interaction trace.
  - **State commitments** — live `policy_core_root`, `memory_root` (Merkle), and `history_tip`.
  - **Invariant monitor** — the paper's five invariants re-checked on every transition.
- **Model independence** — swap the cognition engine and watch the identity persist untouched.
- **Portability** — export the signed kernel to a `.shik.json` file and re-import it on any node (identity-equivalent restore).
- **SHIK Handshake v0** — generate and verify the inter-agent identity handshake exactly as specified in §6.
- **Event Log** — Real-time feed of kernel operations.

See **`/research`** in the running app (`src/app/research/page.tsx`) for a full paper → implementation mapping, gap analysis, evaluation plan, and roadmap.

## Research Context

SHIK Live is a prototype implementation of concepts from "Self-Hosted Identity Kernels for Multi-Agent Systems" (Kingsley, 2025). The paper proposes SHIK as a minimal architectural substrate for persistent, portable agent identity, distinguishing **external security identity** (DIDs/VCs, zero-trust) from **internal computational selfhood** (who the agent is across time, models, and substrates).

### Hardware (self-hosting path)

The kernel itself is light — a small DB, hashing, and signatures — so it targets resource-constrained, self-owned hardware:

| Tier | Hardware | Role |
|------|----------|------|
| Kernel node (min) | Raspberry Pi 4/5 (2–4 GB) + optional USB HSM (YubiKey / SE050) | Hosts `I`, signs handshakes, serves the SHIK API (~tens of MB RAM). |
| Kernel node (comfortable) | Jetson Orin Nano / mini-PC / home server (NVMe + UPS) | Adds headroom for replication, logs, and a local vector store. |
| Local cognition (optional) | 16–24 GB GPU / Jetson Orin / Apple Silicon ≥16 GB | Run a 7–8B local model so identity *and* cognition are self-hosted, no cloud. |
| Cloud cognition | None — just an API key | The current demo. The kernel never depends on it. |

A compelling, low-cost PhD demo: **two Raspberry Pis** (two agents performing a SHIK handshake over the LAN) plus a laptop for the UI.

## Built With

- **Frontend:** Next.js, React, Tailwind CSS
- **AI Engine:** Google GenAI SDK → Gemini 2.0 Flash (Live API)
- **Persistence:** Cloud Firestore
- **Hosting:** Google Cloud Run

## License

MIT

---

*Built for the Gemini Live Agent Challenge 2026*
