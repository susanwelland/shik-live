// SHIK v2 — Cognition: the "mind" layer (Claude / Opus 4.8)
// ---------------------------------------------------------------------------
// SHIK v1 used Gemini for both the realtime voice loop AND kernel extraction.
// v2 DECOMPOSES cognition (the M0 thesis: cognition is a replaceable peripheral):
//   - Voice (mouth/ears): stays on a realtime speech engine (Gemini Live) for
//     low-latency, interruptible turn-taking — Claude has no native
//     speech-to-speech API, so it is the wrong tool for that loop.
//   - Mind (identity + reasoning): Claude curates the Identity Kernel and
//     chooses non-speech actions. This is where Claude is strongest, and it
//     maps onto SHIK's architecture: the Action Bus IS Claude tool use, and
//     kernel curation IS a structured tool call.
//
// This route replaces v1's Gemini-based /api/extract. It takes a perception
// turn + the current kernel and returns kernel updates, a first-person
// self-reflection, and proposed Action-Bus actions. Speech stays with the voice
// engine; Claude proposes `light` / `display` / `notify` acts only, so the two
// cognition halves never fight over the agent's voice.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

interface CognitionResult {
  kernelUpdates: {
    newCoreMemories: { content: string; sourceType: 'voice' | 'visual' | 'inferred'; confidence: number }[];
    newSessionContext: { content: string; sourceType: 'voice' | 'visual' | 'inferred' }[];
    currentTopic: string | null;
  };
  selfReflection: string;
  actions: { kind: 'light' | 'display' | 'notify'; intent?: string; text?: string }[];
  events: string[];
}

const EMPTY: CognitionResult = {
  kernelUpdates: { newCoreMemories: [], newSessionContext: [], currentTopic: null },
  selfReflection: '',
  actions: [],
  events: [],
};

// Tool schema = the structured shape SHIK's mind must return. Forcing this one
// tool (tool_choice) gives us guaranteed, already-parsed JSON across SDK
// versions without relying on the newer output_config typing.
const RECORD_KERNEL_TOOL: Anthropic.Tool = {
  name: 'record_kernel',
  description:
    'Record how this perception turn updates SHIK\'s persistent identity, and what SHIK should do with its body. Always call this exactly once.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      kernelUpdates: {
        type: 'object',
        additionalProperties: false,
        properties: {
          newCoreMemories: {
            type: 'array',
            description: 'Durable facts about the person worth remembering across sessions. Usually 0-1 per turn. Only from what the USER expressed.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string' },
                sourceType: { type: 'string', enum: ['voice', 'visual', 'inferred'] },
                confidence: { type: 'number' },
              },
              required: ['content', 'sourceType', 'confidence'],
            },
          },
          newSessionContext: {
            type: 'array',
            description: 'Short-lived context for this session only (not durable identity).',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string' },
                sourceType: { type: 'string', enum: ['voice', 'visual', 'inferred'] },
              },
              required: ['content', 'sourceType'],
            },
          },
          currentTopic: { type: ['string', 'null'], description: 'Short phrase for what is being discussed now.' },
        },
        required: ['newCoreMemories', 'newSessionContext', 'currentTopic'],
      },
      selfReflection: {
        type: 'string',
        description: "One short first-person sentence in SHIK's voice about its own state or what it just learned (e.g. \"I now know they work on robotics.\"). May be empty.",
      },
      actions: {
        type: 'array',
        description: 'Non-speech acts for SHIK to perform through its body. Do NOT include speech — the voice engine handles that.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['light', 'display', 'notify'] },
            intent: { type: 'string', enum: ['idle', 'listening', 'thinking', 'speaking', 'alert'], description: 'For kind=light only.' },
            text: { type: 'string', description: 'For kind=display or notify.' },
          },
          required: ['kind'],
        },
      },
      events: { type: 'array', description: 'Terse log lines describing what the kernel did.', items: { type: 'string' } },
    },
    required: ['kernelUpdates', 'selfReflection', 'actions', 'events'],
  },
};

const SYSTEM = `You are the Identity Kernel of SHIK — a persistent AI agent whose identity is separate from the engine that voices it.

A realtime voice engine handles the live conversation. YOUR job is continuity: decide what SHIK should durably remember, maintain its sense of self, and choose what it does through its current body (lights, display, notifications) — never speech.

Be selective with core memories: capture real facts the person shares about themselves (name, role, work, projects, stated preferences), skip greetings, filler, and anything the agent itself said. Most turns yield zero or one core memory. Reflect in SHIK's own first-person voice.`;

export async function POST(request: NextRequest) {
  try {
    const { userText, agentText, currentMemories, currentContext, bodyName } = await request.json();

    if (!userText && !agentText) {
      return NextResponse.json({ error: 'No perception provided' }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      // Degrade gracefully when the mind isn't configured (mirrors v1 behavior).
      return NextResponse.json({ ...EMPTY, events: ['cognition_unconfigured'] });
    }

    const client = new Anthropic();

    const userMsg = `SHIK is currently embodied in: ${bodyName || 'this browser'}.

PERCEPTION THIS TURN
- Person said: ${userText || '(nothing)'}
- SHIK responded: ${agentText || '(nothing)'}

CURRENT KERNEL
- Core memories: ${JSON.stringify(currentMemories || [])}
- Session context: ${JSON.stringify(currentContext || [])}

Call record_kernel once with the updates.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: SYSTEM,
      tools: [RECORD_KERNEL_TOOL],
      tool_choice: { type: 'tool', name: 'record_kernel' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const parsed = (toolUse?.input as CognitionResult) ?? EMPTY;
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Cognition error:', error);
    return NextResponse.json({ ...EMPTY, events: ['cognition_failed'] });
  }
}
