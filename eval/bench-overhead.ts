// Benchmark 1 — SHIK kernel overhead vs. state size.
//
// Measures the cost of the operations a self-hosted node performs on every
// interaction and handshake, as memory M and history H grow:
//   - compute state commitments (Merkle over M, policy_core_root, history_tip)
//   - build + sign a SHIK Handshake v0
//   - verify a handshake signature (key reconstruction + ECDSA verify)
//
// Runnable with: npm run eval:overhead
// Writes eval/results/overhead.csv and prints a Markdown table.

import { mkdirSync, writeFileSync } from 'fs';
import {
  genesisIdentity,
  appendHistory,
  computeCommitments,
  buildHandshake,
  verifyHandshakeSignature,
  IdentityState,
  MemoryEntry,
} from '../src/lib/shik-kernel';

const SIZES = [0, 10, 100, 1000, 5000];
const REPS = 5;

function mem(i: number): MemoryEntry {
  return {
    id: `mem-${i}`,
    content: `Durable fact #${i}: the user mentioned detail number ${i} about their research.`,
    kind: i % 3 === 0 ? 'episodic' : 'semantic',
    sourceType: 'inferred',
    provenance: 'benchmark',
    confidence: 0.9,
    createdAt: new Date().toISOString(),
  };
}

async function buildState(n: number): Promise<IdentityState> {
  const base = await genesisIdentity();
  const memory = Array.from({ length: n }, (_, i) => mem(i));
  let history = base.history;
  for (let i = 0; i < n; i++) history = await appendHistory(history, 'turn', `turn ${i}`);
  return { ...base, memory, history };
}

async function timeit(fn: () => Promise<unknown>, reps: number): Promise<number> {
  // one warmup
  await fn();
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) await fn();
  return (performance.now() - t0) / reps;
}

(async () => {
  const rows: Array<{ n: number; commitMs: number; signMs: number; verifyMs: number }> = [];

  for (const n of SIZES) {
    const state = await buildState(n);
    const commitMs = await timeit(() => computeCommitments(state), REPS);
    const signMs = await timeit(() => buildHandshake(state, 'request'), REPS);
    const hs = await buildHandshake(state, 'request');
    const verifyMs = await timeit(() => verifyHandshakeSignature(hs), REPS);
    rows.push({ n, commitMs, signMs, verifyMs });
  }

  mkdirSync('eval/results', { recursive: true });
  const csv = ['memory_and_history_entries,commit_ms,sign_handshake_ms,verify_handshake_ms']
    .concat(rows.map((r) => `${r.n},${r.commitMs.toFixed(3)},${r.signMs.toFixed(3)},${r.verifyMs.toFixed(3)}`))
    .join('\n');
  writeFileSync('eval/results/overhead.csv', csv + '\n');

  console.log('\n## SHIK kernel overhead vs. state size');
  console.log(`(${process.arch}/${process.platform}, Node ${process.version}, mean of ${REPS} reps)\n`);
  console.log('| M+H entries | commit (ms) | sign handshake (ms) | verify handshake (ms) |');
  console.log('|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(`| ${r.n} | ${r.commitMs.toFixed(2)} | ${r.signMs.toFixed(2)} | ${r.verifyMs.toFixed(2)} |`);
  }
  console.log('\nWrote eval/results/overhead.csv');
  console.log('Note: a Raspberry Pi 4 runs ~3–6× slower than a modern x86 dev host;');
  console.log('verify is dominated by a single ECDSA P-256 op and is ~constant in state size.');
})();
