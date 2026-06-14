// SHIK v2 — Embodiment contracts
// ---------------------------------------------------------------------------
// These types are the "interface from the agent's perspective." They describe a
// BODY the agent can inhabit (the Embodiment Manifest), the normalized senses
// flowing in (the Perception Bus), and the abstract acts flowing out (the Action
// Bus). The browser is one body; a Raspberry Pi (`shik-pi-01`) is another. Both
// publish a manifest and speak Percepts/Actions, so the same SHIK identity can
// move between them. See docs/SHIK_V2_VISION.md and docs/HARDWARE_RPI.md.
//
// M0 deliverable: contracts only. No runtime behavior change to v1 yet — these
// types are the shared vocabulary the v2 UI and the Pi daemon will both target.

// ===========================================================================
// EMBODIMENT MANIFEST — what body the agent is currently in
// ===========================================================================

/** Stable identifier for a body SHIK can inhabit, e.g. "browser" or "shik-pi-01". */
export type BodyId = string;

export type BodyKind = 'browser' | 'raspberry-pi' | 'robot' | 'kiosk' | 'wearable';

/** A sense the body can provide. The agent reads percepts of these kinds. */
export type SensorKind =
  | 'audio' // microphone
  | 'vision' // camera / screen frames
  | 'motion' // PIR / accelerometer
  | 'light_level' // ambient light sensor
  | 'temperature' // body/ambient temp
  | 'battery' // power state
  | 'touch'; // button / capacitive

/** An act the body can perform. The agent expresses intent; the body renders it. */
export type ActuatorKind =
  | 'speak' // audio out (TTS / streamed audio)
  | 'display' // text/graphics on a screen
  | 'light' // LED / LED ring presence signal
  | 'move' // servo / motor gesture
  | 'notify'; // push / system notification

export interface SensorSpec {
  kind: SensorKind;
  /** Human/agent-readable label, e.g. "ReSpeaker 2-Mic (far-field)". */
  label: string;
  /** Whether this sensor is currently streaming. */
  available: boolean;
}

export interface ActuatorSpec {
  kind: ActuatorKind;
  label: string;
  available: boolean;
}

/**
 * Published by every body. The agent-perspective UI renders this as "the body I
 * am in"; the Pi daemon and the browser app each produce one of these.
 */
export interface EmbodimentManifest {
  bodyId: BodyId;
  kind: BodyKind;
  /** Friendly name the agent uses for this body, e.g. "the Pi on the shelf". */
  displayName: string;
  sensors: SensorSpec[];
  actuators: ActuatorSpec[];
  /** Which cognition engine is driving this body right now (replaceable). */
  cognitionEngine: string; // e.g. "gemini-2.0-flash-live"
  /** True while this body is the agent's active embodiment. */
  active: boolean;
}

// ===========================================================================
// PERCEPTION BUS — normalized senses flowing IN
// ===========================================================================

/** Where a percept came from, kept for provenance in the kernel. */
export interface PerceptSource {
  bodyId: BodyId;
  sensor: SensorKind;
  /** "human" when the percept is a person interacting (speech/typing/showing). */
  origin: 'human' | 'environment' | 'system';
}

interface PerceptBase {
  id: string;
  at: number; // epoch ms
  source: PerceptSource;
}

export type Percept =
  | (PerceptBase & { kind: 'speech'; text: string; final: boolean })
  | (PerceptBase & { kind: 'vision'; thumbnailDataUrl?: string; caption?: string })
  | (PerceptBase & { kind: 'motion'; present: boolean })
  | (PerceptBase & { kind: 'light_level'; lux: number })
  | (PerceptBase & { kind: 'temperature'; celsius: number })
  | (PerceptBase & { kind: 'battery'; percent: number; charging: boolean })
  | (PerceptBase & { kind: 'touch'; control: string })
  | (PerceptBase & { kind: 'text'; text: string }); // human typed input

// ===========================================================================
// ACTION BUS — abstract intent flowing OUT
// ===========================================================================

/** Presence states a `light` action can express; the body maps them to hardware. */
export type PresenceIntent = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

interface ActionBase {
  id: string;
  at: number; // epoch ms
  /** Body asked to perform the act; resolved by that body's runtime. */
  bodyId: BodyId;
}

export type Action =
  | (ActionBase & { kind: 'speak'; text: string })
  | (ActionBase & { kind: 'display'; text: string })
  | (ActionBase & { kind: 'light'; intent: PresenceIntent })
  | (ActionBase & { kind: 'move'; gesture: string }) // e.g. "turn_toward_speaker"
  | (ActionBase & { kind: 'notify'; text: string });

// ===========================================================================
// SELF-MODEL — the agent's portable, first-person sense of self
// ===========================================================================

/** One stop in SHIK's history of bodies it has woken up in. */
export interface PresenceRecord {
  bodyId: BodyId;
  displayName: string;
  enteredAt: number;
  leftAt: number | null; // null = currently inhabited
}

/**
 * The portable identity. This is what survives a body swap or a power cycle and
 * what the v2 UI renders first-person ("I am SHIK, currently in shik-pi-01").
 * It composes — not replaces — the v1 kernel (core memory / session context /
 * continuity in src/lib/firestore.ts).
 */
export interface SelfModel {
  agentName: string; // "SHIK"
  /** The body inhabited right now, if any. */
  currentBody: EmbodimentManifest | null;
  /** Where SHIK has been — the portability thesis made legible. */
  presenceHistory: PresenceRecord[];
  /** Count of durable core memories, surfaced as "I remember N things". */
  coreMemoryCount: number;
  /** True once identity has been confirmed against the cloud kernel this session. */
  bound: boolean;
}

// ===========================================================================
// Reference manifest — the browser body (M1 uses this; no hardware required)
// ===========================================================================

export const BROWSER_MANIFEST: EmbodimentManifest = {
  bodyId: 'browser',
  kind: 'browser',
  displayName: 'this browser',
  cognitionEngine: 'gemini-2.0-flash-live',
  active: true,
  sensors: [
    { kind: 'audio', label: 'Microphone', available: false },
    { kind: 'vision', label: 'Camera / screen share', available: false },
  ],
  actuators: [
    { kind: 'speak', label: 'Speaker (streamed audio)', available: true },
    { kind: 'display', label: 'On-screen text', available: true },
    { kind: 'light', label: 'Status indicator', available: true },
  ],
};
