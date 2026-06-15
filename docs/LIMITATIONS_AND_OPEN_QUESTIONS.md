# Limitations and Open Questions

*Draft section for the SHIK paper / proposal. Written to pre-empt the strongest
objections rather than to defend against them — naming a limitation precisely is
itself a contribution, and it frames the research agenda.*

The Self-Hosted Identity Kernel makes agent identity an explicit, auditable,
portable construct. The prototype (a browser demo, a Raspberry Pi-hostable
daemon performing signed inter-agent handshakes, and a model-agnostic cognition
adapter) shows the architecture is implementable on commodity hardware. Several
limitations are important to state plainly, both to scope the present
contribution and to define the work ahead.

## 1. Cryptographic continuity is not behavioral continuity

The kernel preserves and proves the integrity of an agent's *record* of self —
identifier, keys, memory, policies, and an append-only history — and our
continuity benchmark shows this record is invariant across cognition-engine
swaps (100% preservation of the identifier and the memory/policy commitments
over 50 swaps), with genuine violations detected. This establishes identity
**auditability**, which we argue is valuable in its own right for governance,
accountability, and inter-agent trust.

It does **not** establish that an agent is the *same agent behaviorally* across
substrates. Two configurations can be identity-equivalent under our relation
`∼` while producing materially different behavior, because behavior is a
function of the cognition engine `R`, which `∼` deliberately abstracts away.
Swapping a strong cloud model for a small local one yields an agent that is
cryptographically identical and functionally weaker. The equivalence relations
`equiv_M`, `equiv_P`, `equiv_H` in §3 currently capture *structural* drift
(summarization, key rotation, append-only history); they do not capture
*semantic* or *behavioral* equivalence.

We regard this gap as the central open question, not a flaw to paper over. We
have built a benchmark (`bench-behavioral.ts`) that *measures* it: with
identical kernel state, the spread in how faithfully different engines honor
stored facts is an empirical estimate of the gap's size. Promising directions
include: (i) behavioral conformance tests the kernel runs against a candidate
engine before trusting it with an identity; (ii) policy-enforcement at the
adapter boundary so safety-critical invariants hold regardless of engine; and
(iii) a weaker, explicitly-scoped notion of continuity — *accountable*
continuity rather than *equivalent* continuity.

## 2. Relationship to existing memory stores and decentralized identity

A reasonable objection is that SHIK is "a portable memory store plus a DID."
SHIK reuses both ingredients deliberately; the contribution is neither the
memory layer (cf. MemGPT/Letta, Zep, mem0) nor the identifier layer (W3C
DIDs/VCs, and recent zero-trust-for-agentic-AI work). It is the **set of
invariants that make "the same agent across time and substrate" an externally
checkable condition**, exposed as compact cryptographic commitments
(`policy_core_root`, `memory_root`, `history_tip`) inside an inter-agent
handshake. Existing memory frameworks make identity *internal and implicit*;
existing DID/VC frameworks make identity *external and authorization-oriented*.
SHIK couples an internal self-model to externally verifiable commitments, so a
counterpart can check key↔id binding, policy monotonicity, and history coherence
without access to the underlying data. We should lead with this invariant-and-
commitment contribution; the "computational selfhood" framing is motivation,
not claim.

## 3. Limited empirical scope

Results to date are micro-benchmarks: kernel overhead vs. state size, and
record-level continuity under swap (see `eval/`). They do not yet include
multi-agent simulations, long-horizon relationship continuity, or behavior under
partial failure and migration — the larger questions in §10.3. The overhead
benchmark also surfaced a concrete limitation: commitments are recomputed in
full each turn (`O(|M|)`), which an incremental Merkle structure would reduce to
`O(log |M|)`. These are scoped, addressable next steps rather than open-ended
risks.

## 4. Self-hosting motivation needs a decisive use-case

The autonomy/privacy/governance arguments for self-hosting are, as presented,
asserted rather than demonstrated, and they run against the convenience of
platform-native memory and identity. The work would be considerably stronger
anchored to a scenario where centralized identity *fails*: e.g., an agent that
must outlive a discontinued provider, operate air-gapped, or carry verifiable
cross-organization credentials under conflicting trust domains. We treat
identifying and instrumenting one such scenario as a near-term priority.

## 5. Key custody, replication, and trust are unfinished

Three components are explicitly incomplete and bound the current claims:

- **Key custody.** The kernel's guarantees rest entirely on signing keys; the
  prototype stores the private key on disk. Production custody (USB HSM /
  secure element) is specified but not yet integrated.
- **Decentralized replication (§4.6).** Multi-node state synchronization,
  partial replication, and conflict resolution — arguably the hardest and most
  novel requirement — are future work; the present demo recognizes peers but
  does not replicate state among them.
- **Trust semantics.** The handshake verifies that a peer's commitments are
  well-formed and unchanged, not that the committed content is benign. Trust is
  currently a naive monotone score; a substantive trust model (reputation,
  credential-conditioned policy, revocation) remains to be designed.

## Summary of defensible claims

What the work supports today: an implementable, low-overhead substrate for
**auditable, portable, model-independent agent identity**, with cryptographically
checkable continuity invariants and a working inter-agent recognition protocol
on commodity hardware. What it does not yet support, and what the research
program targets: **behavioral** continuity guarantees, decentralized replication,
hardware-rooted key custody, and a substantive trust model.
