# SHIK v2 — Hardware: the Raspberry Pi body (`shik-pi-01`)

This is the first **physical embodiment** of SHIK. It turns the agent from a
browser tab into a thing on a shelf that can see, hear, speak, and signal its
state — while its identity lives in the kernel and syncs to the cloud.

Design goals, in priority order:

1. **Prove portable identity.** The Pi must be able to lose power / network and
   re-bind the same SHIK identity when it returns. Hardware choices serve this.
2. **Full perception + expressive action on a small budget.** Mic, camera,
   speaker, and at minimum a status light, so the action bus has something
   visible to render.
3. **Headless-first, no-soldering-first.** Everything below has a USB or HAT
   (hat = stackable board, no soldering) option so a v2 can be built in an
   afternoon. Soldered alternatives are noted as upgrades.

---

## Recommended build (tier 1 — "an afternoon")

| Role | Part | Why | Interface |
|---|---|---|---|
| **Compute** | Raspberry Pi 5 (4 GB) | Enough for real-time audio + camera + on-device pre/post-processing; PCIe path for later AI HAT | — |
| **Storage** | 32 GB+ A2 microSD (or NVMe HAT) | Local kernel store + buffering when offline | — |
| **Power** | Official 27 W USB-C PD | Pi 5 is power-hungry under camera+audio load; undervolting causes dropouts | USB-C |
| **Microphone** | ReSpeaker 2-Mic HAT *or* a decent USB mic | Far-field voice, hardware that the action bus can also light (the HAT has onboard LEDs) | I2S HAT / USB |
| **Speaker** | USB speaker *or* I2S DAC + small speaker | Agent voice output (TTS / Gemini audio) | USB / I2S |
| **Camera** | Raspberry Pi Camera Module 3 | Vision percepts; autofocus; libcamera-native | CSI ribbon |
| **Status light** | The ReSpeaker HAT's onboard RGB LEDs (or a single WS2812) | The cheapest, most legible "action" — presence/thinking/speaking states | controlled by HAT / GPIO |

> **Why ReSpeaker 2-Mic HAT specifically:** it folds *two* manifest entries into
> one no-solder board — a far-field stereo mic (perception) **and** an
> addressable RGB LED ring (action). That makes the action bus visible on day one
> without extra wiring, which is exactly what the agent-perspective UI needs to
> demonstrate.

## Optional add-ons (tier 2 — richer body)

| Role | Part | Adds to manifest |
|---|---|---|
| Small display | Waveshare 1.28" round LCD **or** 2.13" e-ink HAT | `display` actuator — show current word / mood / who's present |
| Motion | PIR sensor (HC-SR501) on a GPIO pin | `motion` percept — "someone entered the room" |
| Ambient light | BH1750 (I2C) | `light_level` percept — day/night awareness |
| Attention gesture | 1–2 micro servos + pan/tilt bracket | `move` actuator — turn toward a speaker |
| On-device inference | Raspberry Pi AI HAT (Hailo) | local wake-word / face presence without cloud round-trip |

None of these require core changes — each is just another entry in the
embodiment manifest (`src/lib/embodiment.ts`).

---

## How the body maps to the buses

```
                         shik-pi-01 (the body)
  PERCEPTION (in)                                   ACTION (out)
  ┌────────────────────┐                      ┌────────────────────────┐
  │ mic   → audio       │                      │ speaker → speak (TTS)   │
  │ camera→ vision frame│   ── perception ──▶  │ LED ring→ light(intent) │
  │ PIR   → motion      │       bus            │ display → display(text) │
  │ BH1750→ light_level │                      │ servos  → move(gesture) │
  │ system→ battery/temp│   ◀── action ──      │                         │
  └────────────────────┘        bus            └────────────────────────┘
            │                                              ▲
            └──────────► COGNITION: Gemini Live ───────────┘
                         (cloud, replaceable)
                                  │
                    IDENTITY KERNEL  (local store ⇄ Firestore)
                    survives power loss / offline; re-binds on boot
```

The agent never addresses `GPIO pin 12`. It emits `light: { intent: "thinking" }`
and the **device runtime** on the Pi maps that intent to the actual LED ring.
Swap the LED ring for an e-ink face later and only the runtime's mapping changes
— the agent's vocabulary doesn't.

---

## On-device runtime (`shik-agent` daemon) — M2 target

A small service running on the Pi (`systemd` unit, auto-restart, auto-start on
boot). Reference stack: **Python** for clean access to `libcamera`,
`sounddevice`, and HAT libraries; it talks to the same cloud services the browser
body does.

Responsibilities:

1. **Boot & bind.** On start, read local identity → contact cloud → confirm "I am
   SHIK, now embodied here." Append to **presence history** in continuity state.
2. **Perceive.** Capture mic audio + camera frames (+ optional sensors) and emit
   normalized `Percept`s onto the perception bus.
3. **Cognize.** Stream audio/vision to Gemini Live (same pipeline as the browser
   today); receive audio + text + kernel-extraction.
4. **Act.** Render `Action`s: play audio through the speaker, drive the LED ring
   for `idle/listening/thinking/speaking`, (later) write the display, move servos.
5. **Persist & sync.** Write kernel updates to the **local store first**
   (SQLite/JSON), then sync to Firestore when online. Buffer when offline so
   identity is never lost between power cycles.
6. **Health.** Publish `battery/temp/throttling` as percepts so the self-model
   reflects the body's real condition (a thermally-throttled Pi is a tired SHIK).

```
shik-agent (systemd) ── on boot ──▶ bind identity ──▶ presence_history += shik-pi-01
        │
        ├─ perception loop ─▶ mic/camera/sensors ─▶ Percept[] ─▶ Gemini Live
        ├─ action loop      ◀─ Action[] ◀─ Gemini Live / kernel ─▶ speaker/LEDs/display
        └─ sync loop        ─▶ local store (SQLite) ⇄ Firestore (when online)
```

> **Browser body vs Pi body — same contracts.** The existing Next.js app becomes
> the `browser` embodiment; the Pi daemon is the `shik-pi-01` embodiment. Both
> publish a manifest, both speak Percept/Action, both sync the same kernel. That
> symmetry is what makes migrating SHIK between them meaningful instead of a
> rewrite.

---

## Network & resilience

- **Connectivity:** Wi-Fi for tier 1. The runtime assumes intermittent network
  and degrades gracefully (buffer percepts/kernel writes; queue cloud cognition).
- **Offline behavior (future M4):** optional local wake-word + a canned "I can
  hear you but I can't think clearly right now" response when the cognition
  engine is unreachable — the body stays *present* even when the brain is offline.
- **Security:** the Pi authenticates to the cloud with a per-device credential
  (service-account key or scoped token), never the raw Gemini key baked into the
  image. Rotate per device. Keep the device identity separate from the agent
  identity.

---

## Build checklist (tier 1)

- [ ] Flash Raspberry Pi OS (64-bit, Bookworm+), enable SSH headless
- [ ] Attach Camera Module 3 to CSI, verify with `libcamera-hello`
- [ ] Seat ReSpeaker 2-Mic HAT, install driver, verify mic + LEDs
- [ ] Attach speaker (USB or I2S DAC), verify playback
- [ ] Provision a scoped cloud credential for `shik-pi-01`
- [ ] Install `shik-agent` daemon (M2), enable `systemd` unit
- [ ] First boot: confirm presence appears in the kernel's continuity state
- [ ] Pull the power, plug back in: confirm SHIK re-binds with memory intact

When that last box is checked, the portability thesis is no longer a slide — it's
a thing on your desk that remembers you.
