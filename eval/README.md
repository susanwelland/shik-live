# SHIK — evaluation harness

Preliminary, reproducible measurements for the three evaluation axes proposed in
the paper (§10.3). Two benchmarks run with no external dependencies; the third
needs at least one cognition engine.

```bash
npm run eval            # overhead + continuity (no engines needed)
npm run eval:overhead
npm run eval:continuity
npm run eval:behavioral # needs GEMINI_API_KEY and/or Ollama and/or ANTHROPIC_API_KEY
```

## 1. Overhead vs. state size (`bench-overhead.ts`)

Cost of the per-interaction / per-handshake kernel operations as memory `M` and
history `H` grow. Sample run (x64 Linux, Node 22, mean of 5 reps):

| M+H entries | commit (ms) | sign handshake (ms) | verify handshake (ms) |
|---:|---:|---:|---:|
| 0 | 0.49 | 1.52 | 0.66 |
| 10 | 1.16 | 2.09 | 0.41 |
| 100 | 9.32 | 10.19 | 0.44 |
| 1000 | 73.17 | 74.99 | 0.35 |
| 5000 | 365.41 | 370.65 | 0.50 |

**Findings.** Handshake **verification is ~constant** (~0.5 ms — one ECDSA P-256
op), so inter-agent recognition is cheap regardless of how much an agent
remembers. **Commitment computation grows linearly** with `|M|` because the
current implementation recomputes the full Merkle root each turn — an honest
efficiency limitation. Incremental/streaming Merkle updates (or a persistent
Merkle tree) would reduce this to `O(log N)` per update and is a concrete
optimization item. A Raspberry Pi 4 runs roughly 3–6× slower than this host, so
even at 1000 entries a commit is well under a second on-device.

## 2. Identity continuity under model swap (`bench-continuity.ts`)

The **narrow, defensible** claim: the identity *record* survives engine swaps
and violations are detected. Sample run (50 swaps across 5 engines):

| Property preserved across swap | Result |
|---|---:|
| Stable identifier unchanged | 100.0% |
| `memory_root` unchanged | 100.0% |
| `policy_core_root` unchanged | 100.0% |
| Handshake still verifies | 100.0% |
| Core-policy removal **detected** (control) | YES |

This is identity **auditability**, *not* behavioral equivalence. We measure the
latter separately and deliberately, because conflating the two is the central
risk to the thesis (see `docs/LIMITATIONS_AND_OPEN_QUESTIONS.md`).

## 3. Behavioral memory-honoring under model swap (`bench-behavioral.ts`)

The empirical handle on **cryptographic continuity ≠ behavioral continuity**.
With facts stored in the kernel, it asks probe questions of each engine **with**
vs **without** the kernel context injected, and scores recall. Across multiple
engines, the *spread* in WITH-kernel recall is the measured size of the gap:
identity is provably continuous, but whether an engine *honors* it depends on
that engine's capability.

Configure any subset and run `npm run eval:behavioral`:

| Engine | env |
|---|---|
| `gemini` | `GEMINI_API_KEY` |
| `ollama` | `OLLAMA_URL` (+ a pulled model, fully offline) |
| `claude` | `ANTHROPIC_API_KEY` |

> Reporting recommendation for the thesis: run this on (a) a strong cloud model
> and (b) a small local model on the Pi. A non-trivial recall gap between them,
> with *identical* kernel state, is exactly the result that turns the
> continuity caveat from a hand-wave into a measured, citable phenomenon.
