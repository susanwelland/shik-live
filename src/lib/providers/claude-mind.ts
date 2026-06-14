// SHIK v2 — Claude mind provider
// One implementation of the model-agnostic MindProvider seam (kernel-interface.ts).
// Claude (Opus 4.8) curates the Identity Kernel and proposes non-speech actions.
// It is deliberately interchangeable: a Gemini or local-model provider would
// implement the same interface and be selected by config — the "remove the LLM
// dependency" north star, and the MCP paper's "swap the model in one line".
import Anthropic from '@anthropic-ai/sdk';
import { CognitionTurn, KernelDelta, MindProvider, EMPTY_DELTA } from '../kernel-interface';

// Forced tool = the kernel write surface. Its fields map onto the MCP paper's
// shik_store_memory / shik_store_context / shik_update_style /
// shik_update_continuity / shik_log_event calls (see KERNEL_TOOL_SURFACE).
const COMMIT_TOOL: Anthropic.Tool = {
  name: 'commit_kernel_delta',
  description:
    "Record how this perception turn updates SHIK's persistent identity, and what SHIK should do with its body. Always call exactly once.",
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
            description: 'Durable facts about the person (shik_store_memory). Usually 0-1 per turn, only from what the USER expressed.',
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
            description: 'Transient session-only context (shik_store_context).',
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
          currentTopic: { type: ['string', 'null'], description: 'shik_update_continuity: short phrase for what is discussed now.' },
        },
        required: ['newCoreMemories', 'newSessionContext', 'currentTopic'],
      },
      selfReflection: {
        type: 'string',
        description: "shik_update_style: one short first-person sentence in SHIK's voice about its state or what it just learned. May be empty.",
      },
      actions: {
        type: 'array',
        description: 'Non-speech acts through the body (Action Bus). NEVER speech — the voice engine owns that.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['light', 'display', 'notify'] },
            intent: { type: 'string', enum: ['idle', 'listening', 'thinking', 'speaking', 'alert'] },
            text: { type: 'string' },
          },
          required: ['kind'],
        },
      },
      events: { type: 'array', description: 'shik_log_event: terse audit lines.', items: { type: 'string' } },
    },
    required: ['kernelUpdates', 'selfReflection', 'actions', 'events'],
  },
};

const SYSTEM = `You are the Identity Kernel of SHIK — a persistent AI agent whose identity is separate from the engine that voices it.

A realtime voice engine handles the live conversation. YOUR job is continuity: decide what SHIK should durably remember, maintain its sense of self, and choose what it does through its current body (lights, display, notifications) — never speech.

Be selective with core memories: capture real facts the person shares about themselves (name, role, work, projects, stated preferences), skip greetings and filler, and never store anything the agent itself said. Most turns yield zero or one core memory. Reflect in SHIK's own first-person voice.`;

export const claudeMind: MindProvider = {
  id: 'claude',
  engine: 'claude-opus-4-8',
  async reflect(turn: CognitionTurn): Promise<KernelDelta> {
    const client = new Anthropic();
    const userMsg = `SHIK is currently embodied in: ${turn.bodyName || 'this browser'}.

PERCEPTION THIS TURN
- Person said: ${turn.userText || '(nothing)'}
- SHIK responded: ${turn.agentText || '(nothing)'}

CURRENT KERNEL
- Core memories: ${JSON.stringify(turn.currentMemories || [])}
- Session context: ${JSON.stringify(turn.currentContext || [])}

Call commit_kernel_delta once.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: SYSTEM,
      tools: [COMMIT_TOOL],
      tool_choice: { type: 'tool', name: 'commit_kernel_delta' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    return (toolUse?.input as KernelDelta) ?? EMPTY_DELTA;
  },
};
