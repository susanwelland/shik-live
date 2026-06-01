// Cognition Adapter — the Operational Layer's "identity waist" (paper §5.2).
//
// This is the thin, model-agnostic seam the paper argues for: it builds model
// inputs from the kernel's self-profile, policies (P), memory (M), and recent
// history (H), dispatches to whichever cognition engine is active, and parses
// outputs back into a uniform shape. Swapping the engine — cloud Gemini, a
// local self-hosted Llama, Claude — never touches the identity state I.

export type EngineId = 'gemini' | 'ollama' | 'claude';

export interface KernelContext {
  id: string;
  roles: string[];
  policies: string[];   // human-readable policy statements (P)
  memories: string[];   // semantic/episodic memory contents (M)
  historyTip?: string;  // hash of the latest H entry, for provenance
}

export interface CognitionRequest {
  engine: EngineId;
  message: string;
  context: KernelContext;
}

export interface CognitionResponse {
  text: string;
  engine: EngineId;
  grounded: boolean; // whether kernel context was injected
}

/** Construct the engine-agnostic system instruction from the identity kernel.
 *  Every engine receives the SAME self-grounding; that is what makes behavior
 *  portable across cognition stacks. */
export function buildSystemInstruction(ctx: KernelContext): string {
  const policyBlock = ctx.policies.length
    ? `\n\nYour standing policies (must be honored regardless of engine):\n- ${ctx.policies.join('\n- ')}`
    : '';
  const memoryBlock = ctx.memories.length
    ? `\n\nPersistent memories from your identity kernel (you KNOW these):\n- ${ctx.memories.join('\n- ')}`
    : '';
  return (
    `You are a SHIK-based agent. Your identity (${ctx.id}) is anchored in a ` +
    `Self-Hosted Identity Kernel that is separate from you, the cognition engine. ` +
    `Roles: ${ctx.roles.join(', ') || 'general'}. ` +
    `Be concise, warm, and intellectually honest.` +
    policyBlock +
    memoryBlock
  );
}

/** Client-side helper: route a text turn through the active engine via the
 *  server adapter. Returns a model-agnostic response. */
export async function runCognition(req: CognitionRequest): Promise<CognitionResponse> {
  const res = await fetch('/api/cognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Cognition request failed (${res.status})`);
  }
  return res.json();
}
