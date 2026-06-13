// SHIK v2 — client helper for the Claude cognition (mind) layer.
// Calls the server-side /api/cognition route, which runs Claude (Opus 4.8) to
// curate the Identity Kernel and propose Action-Bus actions. See the route for
// the decomposed-cognition rationale.

export interface CognitionResult {
  kernelUpdates: {
    newCoreMemories: { content: string; sourceType: 'voice' | 'visual' | 'inferred'; confidence: number }[];
    newSessionContext: { content: string; sourceType: 'voice' | 'visual' | 'inferred' }[];
    currentTopic: string | null;
  };
  selfReflection: string;
  actions: { kind: 'light' | 'display' | 'notify'; intent?: string; text?: string }[];
  events: string[];
}

export async function runCognition(input: {
  userText: string;
  agentText: string;
  currentMemories: string[];
  currentContext: string[];
  bodyName: string;
}): Promise<CognitionResult | null> {
  try {
    const response = await fetch('/api/cognition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Cognition API failed: ${response.status}`);
    return (await response.json()) as CognitionResult;
  } catch (e) {
    console.error('Cognition failed:', e);
    return null;
  }
}
