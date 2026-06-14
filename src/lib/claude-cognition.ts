// SHIK v2 — client helper for the cognition (mind) layer.
// Calls the provider-agnostic /api/cognition route. The mind behind it is
// selected server-side by config (SHIK_MIND_PROVIDER) — see kernel-interface.ts.
import { CognitionTurn, KernelDelta } from './kernel-interface';

// Back-compat alias — the browser still thinks in terms of a "cognition result".
export type CognitionResult = KernelDelta;

export async function runCognition(input: CognitionTurn): Promise<CognitionResult | null> {
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
