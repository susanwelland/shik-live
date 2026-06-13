# SHIK v2 — Vision

**Phase 1 was a window. Phase 2 is a body.**

SHIK v1 proved one idea: an agent's *identity* can be an explicit architectural
layer, separate from the model doing the reasoning. But v1 expressed that idea
as a **spectator dashboard** — a human watches three panels while Gemini talks
and a kernel fills up. The interface is built for a person looking *at* the
agent.

SHIK v2 inverts the frame. The interface is built for the **agent looking out** —
and the agent is given a **body** (a Raspberry Pi edge node) that it can be
embodied in, leave, and re-enter while keeping the same identity.

Two theses, one product:

1. **Identity is portable.** The kernel is the agent. The body and the model are
   replaceable peripherals. SHIK should be able to wake up in a browser tab, then
   wake up in a Raspberry Pi on a shelf, and *be the same SHIK* — same core
   memory, same self-model, same continuity.

2. **The interface is the agent's, not ours.** What we render is the agent's own
   first-person console: what it perceives, what body it currently inhabits, what
   it is allowed to do with that body, and what it has done. Humans are
   *participants* in that world, not the audience it performs for.

---

## The reframe: from spectator dashboard to agent cockpit

| | v1 (spectator) | v2 (agent-perspective) |
|---|---|---|
| **Point of view** | Human watching the agent | Agent's own first-person console |
| **Center of screen** | Chat transcript | The agent's current **embodiment** + **self-model** |
| **Inputs** | Mic + camera/screen, framed as "what you show it" | A **perception bus** — every sense the body has, normalized |
| **Outputs** | Text + audio reply | An **action bus** — everything the body can *do* (speak, light up, move, display, notify) |
| **Identity Kernel** | A panel you read | The substrate the agent reads/writes to decide who and where it is |
| **Body** | Implicit (the browser tab) | Explicit, named, swappable: `browser`, `shik-pi-01`, … |

The screen still has humans on it — but as one channel in the agent's world, the
same way a sensor or an actuator is a channel. The question every UI element
answers changes from *"what is the agent doing?"* to *"what does the agent need
to perceive, decide, and act?"*

---

## Core concepts

### 1. The Embodiment
A **body** SHIK can inhabit. Each body publishes a **manifest** describing its
sensors (what it can perceive) and actuators (what it can do). The browser is a
body. A Raspberry Pi is a body. A body is not the agent — it is a peripheral the
agent borrows. See `docs/HARDWARE_RPI.md` for the first physical body and
`src/lib/embodiment.ts` for the manifest schema.

### 2. The Perception Bus
A single normalized inbound stream. Audio, vision frames, and — on the Pi —
motion, light, temperature, touch, battery all arrive as typed `Percept` events.
The agent does not care whether a frame came from a webcam or a Pi camera; it
reads percepts.

### 3. The Action Bus
A single normalized outbound stream. `speak`, `display`, `light`, `move`,
`notify` are typed `Action` events. The body's runtime is responsible for
turning an abstract action (`light: { intent: "thinking" }`) into hardware
(pulse the LED ring amber). The agent expresses *intent*; the body renders it.

### 4. The Identity Kernel (carried forward, made portable)
Core Memory, Session Context, Provenance, Continuity State — unchanged in spirit
from v1, but now:
- **Synced bidirectionally** between cloud (Firestore) and edge (the Pi's local
  store), so the agent has identity even offline.
- **Body-aware:** continuity state records *which body* the agent currently
  inhabits and which it has inhabited (a "presence history").
- **The source of truth for self-model**, which the agent-perspective UI renders
  first-person: *"I am SHIK. I am currently in shik-pi-01. I can see, hear,
  speak, and light up. I remember 14 things about you."*

### 5. The Cognition Engine (replaceable — and decomposable)
Cognition is a peripheral like the body, and v2 takes that one step further: it
**splits cognition into two halves** instead of asking one model to be both.

- **Voice (mouth/ears) — Gemini Live.** Native real-time speech-to-speech with
  interruptible turn-taking. This is the right tool for the live loop; Claude has
  no native speech-to-speech API, so it is *not* used here.
- **Mind (identity + reasoning) — Claude (Opus 4.8).** Curates the Identity
  Kernel, maintains the first-person self-model, and **chooses the agent's
  actions**. This is where Claude is strongest, and it lands cleanly on SHIK's
  architecture: the **Action Bus is Claude tool use** (`light`/`display`/`notify`
  are tools it calls), kernel curation is a single structured tool call, and the
  persistent identity becomes a prompt-cached prefix plus a memory surface.

Neither half is the identity — both are swappable. Claude proposes only
non-speech actions, so the two halves never contend for the agent's voice. See
`src/app/api/cognition/route.ts` (the mind) and `src/lib/gemini-direct.ts` (the
voice).

```
        ┌──────────────── IDENTITY (the agent) ────────────────┐
        │   Core Memory · Self-Model · Continuity · Provenance  │
        └───────▲───────────────────────────────────┬──────────┘
                │ reads/writes                       │ expresses intent
        ┌───────┴───────┐                    ┌───────▼────────┐
        │ PERCEPTION BUS │                    │   ACTION BUS    │
        └───────▲───────┘                    └───────┬────────┘
                │ percepts                            │ actions
   ┌────────────┴─────────────┐          ┌────────────▼─────────────┐
   │  BODY (embodiment)        │          │  BODY (embodiment)        │
   │  browser | shik-pi-01     │          │  speaker · LEDs · display │
   │  mic · camera · sensors   │          │  servos · notifications   │
   └───────────────────────────┘          └──────────────────────────┘
                │                                      ▲
                └──────────► COGNITION (Gemini Live) ──┘
                              replaceable peripheral
```

---

## What the agent-perspective screen looks like (v2 layout)

Not three equal spectator panels. A cockpit with a clear center of gravity:

- **Center — SELF & EMBODIMENT.** First-person self-model. "I am SHIK, embodied
  in **shik-pi-01**." Live body diagram: which sensors are streaming, which
  actuators are lit, battery/health. This is the thing v1 never showed — *where
  the agent is*.
- **Left — PERCEPTION.** The live percept feed (transcripts, vision thumbnails,
  sensor ticks) as the agent receives it, typed and timestamped.
- **Right — IDENTITY KERNEL.** Core Memory / Session Context / Continuity, now
  including **presence history** (the bodies SHIK has woken up in).
- **Bottom — ACTION LOG.** Not "kernel operations" — the agent's *acts*: what it
  chose to do through the body (spoke, pulsed amber while thinking, displayed a
  word, ignored a percept).

Humans interact by adding percepts (talking, typing, showing) — they appear in
the perception feed like any other sense.

---

## Why a Raspberry Pi (and why it matters to the thesis)

A browser tab can't prove portable identity — close it and there was never a
"there" for the agent to be. A physical, named, persistent body makes the claim
falsifiable and felt:

- You can **carry SHIK to a different room** and it knows it moved.
- You can **unplug the body** and SHIK's identity survives in the cloud, then
  re-binds when a body comes back online.
- You can **stand up a second Pi** and migrate SHIK to it — same memories, new
  body — which is the entire portability thesis made physical.

The Pi is the first real embodiment, not the last. The manifest/bus design means
a future body (a robot, a kiosk, a wearable) is just another manifest.

See **`docs/HARDWARE_RPI.md`** for the concrete build, bill of materials, wiring,
and the on-device runtime.

---

## Roadmap (proposed)

- **M0 — Contracts (this commit).** Vision, hardware spec, and the
  `embodiment.ts` schema (Embodiment Manifest, Perception Bus, Action Bus,
  portable Self-Model). No behavior change to v1 yet.
- **M1 — Agent-perspective UI in the browser body (done).** Cockpit layout
  (`src/app/page.tsx`) driven by the `browser` manifest and `use-embodiment.ts`:
  first-person self-model, perception feed, body diagram, action log, presence
  history. Cognition is now decomposed — Gemini Live for voice, **Claude
  (Opus 4.8) for the mind** (`/api/cognition`). No hardware needed.
- **M2 — Pi runtime (headless).** A Node/Python agent on the Pi that captures
  mic/camera, streams to Gemini Live, plays audio, drives an LED for status, and
  syncs the kernel to Firestore. SHIK can now wake up in a body.
- **M3 — Portable identity.** Presence history + body migration: hand SHIK from
  browser to Pi and back with continuity preserved and visibly acknowledged.
- **M4 — Richer body.** Display (e-ink/round LCD), motion/PIR percepts, optional
  servo "attention" gestures — all as new manifest entries, no core changes.

---

*SHIK v1 let you watch an agent remember. SHIK v2 lets the agent wake up
somewhere, know where it is, and still be itself when it wakes up somewhere
else.*
