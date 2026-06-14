// SHIK v2 — Cognition–Identity Interface
// ---------------------------------------------------------------------------
// This is the "model independence" seam, made concrete. Per Kingsley & Kingsley
// (2026), "MCP as a Standardized Cognition-Identity Interface for Self-Hosted
// Identity Kernels", the kernel should be reachable through ONE standard tool
// surface so that any cognition engine is just a client — swapping the model
// becomes a configuration change, not a rewrite.
//
// In the browser body we don't yet run a full MCP JSON-RPC server (M3), but we
// hold the same contract: a `MindProvider` consumes a perception turn + the
// current kernel and returns a `KernelDelta` expressed in terms of the kernel
// tool surface from the paper (§3.1). Today there is one provider (Claude);
// adding Gemini, a local model, or an MCP client is a new file, not a refactor.

// The kernel tool surface (MCP paper §3.1) the mind writes back through. The
// delta below maps 1:1 onto these calls — documented here so the build and the
// paper stay in lockstep.
export const KERNEL_TOOL_SURFACE = {
  // M — long-term memory
  storeMemory: 'shik_store_memory',      // newCoreMemories[]
  storeContext: 'shik_store_context',    // newSessionContext[]
  // P — self-profile / style
  updateStyle: 'shik_update_style',      // selfReflection (style/self observation)
  // Continuity state
  updateContinuity: 'shik_update_continuity', // currentTopic
  // H — interaction history (append-only)
  logEvent: 'shik_log_event',            // events[]
} as const;

/** A single perception turn handed to the mind for kernel curation. */
export interface CognitionTurn {
  userText: string;
  agentText: string;
  currentMemories: string[];
  currentContext: string[];
  bodyName: string;
}

/** What the mind writes back to the kernel + proposes through the Action Bus. */
export interface KernelDelta {
  kernelUpdates: {
    newCoreMemories: { content: string; sourceType: 'voice' | 'visual' | 'inferred'; confidence: number }[];
    newSessionContext: { content: string; sourceType: 'voice' | 'visual' | 'inferred' }[];
    currentTopic: string | null;
  };
  selfReflection: string;
  actions: { kind: 'light' | 'display' | 'notify'; intent?: string; text?: string }[];
  events: string[];
}

/**
 * A cognition engine bound to the kernel through the standard interface.
 * `engine` is the human-readable id surfaced in the self-model ("who is
 * currently thinking"). `reflect` is the turn-level curation call.
 */
export interface MindProvider {
  id: string;
  engine: string;
  reflect(turn: CognitionTurn): Promise<KernelDelta>;
}

export const EMPTY_DELTA: KernelDelta = {
  kernelUpdates: { newCoreMemories: [], newSessionContext: [], currentTopic: null },
  selfReflection: '',
  actions: [],
  events: [],
};
