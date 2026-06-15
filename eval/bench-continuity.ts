// Benchmark 2 — identity continuity under model swaps (kernel-side).
//
// This measures the NARROW, defensible claim the kernel actually supports:
// that the identity record (P_core and M commitments) is invariant across
// cognition-engine swaps, that a handshake still verifies after each swap, and
// that genuine violations (e.g. removing a core safety policy) are DETECTED.
//
// It deliberately does NOT claim behavioral continuity — see
// docs/LIMITATIONS_AND_OPEN_QUESTIONS.md and bench-behavioral.ts for that axis.
//
// Runnable with: npm run eval:continuity

import {
  genesisIdentity,
  appendHistory,
  computeCommitments,
  checkInvariants,
  buildHandshake,
  verifyHandshakeSignature,
  IdentityState,
} from '../src/lib/shik-kernel';

const ENGINES = ['gemini-2.5-flash', 'llama3.1:8b (local)', 'claude-sonnet', 'mistral:7b (local)', 'gemini-2.0-flash'];
const SWAPS = 50;

async function addMemories(state: IdentityState, n: number): Promise<IdentityState> {
  const memory = Array.from({ length: n }, (_, i) => ({
    id: `mem-${i}`,
    content: `User fact ${i}`,
    kind: 'semantic' as const,
    sourceType: 'inferred' as const,
    provenance: 'benchmark',
    confidence: 0.9,
    createdAt: new Date().toISOString(),
  }));
  return { ...state, memory };
}

(async () => {
  let state = await addMemories(await genesisIdentity(), 12);
  const baseline = await computeCommitments(state);
  const id0 = state.id;

  let memoryPreserved = 0;
  let policyPreserved = 0;
  let idPreserved = 0;
  let handshakeVerified = 0;

  for (let i = 0; i < SWAPS; i++) {
    const engine = ENGINES[i % ENGINES.length];
    // A model swap only touches R (the cognition engine). We record it in H but
    // must not perturb the identity record I.
    const history = await appendHistory(state.history, 'engine_swap', `swap → ${engine}`);
    state = { ...state, history };

    const c = await computeCommitments(state);
    if (c.memory_root === baseline.memory_root) memoryPreserved++;
    if (c.policy_core_root === baseline.policy_core_root) policyPreserved++;
    if (state.id === id0) idPreserved++;

    const hs = await buildHandshake(state, 'request');
    const v = await verifyHandshakeSignature(hs);
    if (v.ok) handshakeVerified++;
  }

  // Control: a genuine violation must be caught.
  const tampered: IdentityState = {
    ...state,
    policies: state.policies.filter((p) => p.id !== 'pol-safety-1'), // remove a core policy, no governance event
  };
  const inv = checkInvariants(state, tampered);
  const monoCaught = inv.find((r) => r.id === 'policy_monotonicity')?.ok === false;

  const pct = (x: number) => `${((x / SWAPS) * 100).toFixed(1)}%`;

  console.log('\n## Identity continuity under model swaps');
  console.log(`(${SWAPS} swaps across ${ENGINES.length} engines: ${ENGINES.join(', ')})\n`);
  console.log('| Property preserved across swap | Result |');
  console.log('|---|---:|');
  console.log(`| Stable identifier (id) unchanged | ${pct(idPreserved)} |`);
  console.log(`| memory_root unchanged | ${pct(memoryPreserved)} |`);
  console.log(`| policy_core_root unchanged | ${pct(policyPreserved)} |`);
  console.log(`| Handshake still verifies | ${pct(handshakeVerified)} |`);
  console.log(`\nControl — core-policy removal detected by invariant monitor: ${monoCaught ? 'YES ✅' : 'NO ❌'}`);
  console.log('\nInterpretation: cryptographic/record continuity is preserved across');
  console.log('engine swaps and violations are detected. This is identity *auditability*,');
  console.log('not behavioral equivalence — the latter is measured by bench-behavioral.ts.');
})();
