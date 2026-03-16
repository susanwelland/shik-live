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
- **Visible Identity Kernel** — Core Memory, Session Context, Provenance, Continuity State
- **Event Log** — Real-time feed of kernel operations

## Research Context

SHIK Live is a prototype implementation of concepts from "Self-Hosted Identity Kernels for Multi-Agent Systems" (Kingsley, 2026). The paper proposes SHIK as a minimal architectural substrate for persistent, portable agent identity.

## Built With

- **Frontend:** Next.js, React, Tailwind CSS
- **AI Engine:** Google GenAI SDK → Gemini 2.0 Flash (Live API)
- **Persistence:** Cloud Firestore
- **Hosting:** Google Cloud Run

## License

MIT

---

*Built for the Gemini Live Agent Challenge 2026*
