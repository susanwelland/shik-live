# PhD-level review: the SHIK papers

A committee-style review of two manuscripts, with concrete rewrites of the
mathematics, sharpened assumptions, and an accurate, recent reference set.

**Papers under review**
- **P1** — Kingsley, *Self-Hosted Identity Kernels for Multi-Agent Systems* (Dec 2025).
- **P2** — Kingsley & Kingsley, *MCP as a Standardized Cognition–Identity Interface for Self-Hosted Identity Kernels* (Mar 2026).

The work is a genuine contribution: it names a real gap (identity as **internal
computational selfhood** vs. **external access-control identity**) and proposes a
minimal, self-hostable substrate with a clean three-layer architecture and a
concrete protocol direction (MCP). For a CS PhD the **vision is defensible**; what
needs strengthening for a top venue / thesis chapter is **formal rigor**,
**assumption discipline**, and **evaluation**. The notes below are ordered by
impact: §1 mathematics, §2 assumptions, §3 the MCP paper, §4 references, §5
editorial, §6 a proposed thesis framing.

---

## 1. Mathematics — make the central claims into theorems

### 1.1 The relation `∼` is mis-typed: identity continuity is a *preorder*, not an equivalence (highest priority)

P1 defines `C₁ ∼ C₂` through component relations `equiv_K, equiv_P, equiv_M,
equiv_H` that explicitly capture **"acceptable drift"** — "key rotation with
proper lineage; summarized rather than raw memories; compressed rather than raw
histories." Drift is **directional**: summarization `M ↦ M′` is lossy and
irreversible; key rotation moves forward along a lineage; history is append-only.
These component relations are therefore **reflexive and transitive but not
symmetric**, so their conjunction is a **preorder**, not an equivalence — yet the
symbol `∼` and the word "equivalence" assert symmetry the construction does not
have. Worse, forcing symmetry (taking the symmetric–transitive closure) is not a
fix: it would identify a kernel with its arbitrarily-summarized descendant,
making "drift" unbounded and destroying the very tamper-detection the handshake
(§6) relies on.

**Recommended rewrite.** Introduce a **continuity (refinement) preorder** `⊑` and
*derive* equivalence from it:

```
C₁ ⊑ C₂   ("C₂ is an identity-faithful successor of C₁")
   ⇔  id₁ = id₂
   ∧ K₂ extends K₁ along an auditable key lineage      (drift_K, transitive)
   ∧ P_core,1 ⊆ P_core,2                                (policy monotonicity)
   ∧ M₂ is reachable from M₁ by insert/summarize/prune  (drift_M, transitive)
   ∧ H₂ extends H₁ as an order-preserving append+summary (drift_H, transitive)

C₁ ≈ C₂   :=   C₁ ⊑ C₂  ∧  C₂ ⊑ C₁     (mutual refinement = true equivalence)
```

`⊑` is a preorder by construction; `≈` is its induced equivalence (provably
reflexive/symmetric/transitive). Crucially, the verifier in §6 is actually
testing `⊑` (version ↑, `history_tip` extends, `policy_core_root` only changes via
an authenticated governance event) — a **directed** successor test — so naming it
a preorder makes the protocol's monotonic checks first-class rather than
after-thoughts. State as **Definition 1 (Identity continuity)** and **Definition 2
(Identity equivalence)**; prove the preorder/equivalence laws as **Lemma 1**
(each requires the corresponding component relation to be a preorder — make those
hypotheses explicit).

### 1.2 "Identity preserved under transitions" should be a *simulation/bisimulation* theorem

P1's informal claim — "if `C₁ ∼ C₂` and both take corresponding
invariant-preserving transitions `σ`, then `C₁′ ∼ C₂′`" — is exactly a
**bisimulation/congruence** condition on the labeled transition system
`(C, Σ, →)`. Give it the standard coinductive footing (Park 1981; Milner 1989;
Sangiorgi 2011):

> **Theorem 1 (Continuity is a simulation w.r.t. invariant-respecting transitions).**
> Let `→_I ⊆ →` be the sub-relation of transitions that preserve the identity
> invariants (§1.3). Then `⊑` is a simulation on `(C, Σ, →_I)`: for all `C₁ ⊑ C₂`
> and every `C₁ —σ→_I C₁′`, there exists `C₂ —σ→_I C₂′` with `C₁′ ⊑ C₂′`; and `≈`
> is a bisimulation (the symmetric case). Hence identity continuity is preserved
> along all invariant-respecting runs.

**Proof obligation = one case per transition label**, which is the right level of
rigor and is tractable:
- `migrate(E′)` preserves `I` exactly ⇒ stays in `≈` (only `E, R` change; identity
  projection is invariant — note migration is **process mobility**, cf. the
  π-calculus framing, Milner–Parrow–Walker 1992, if you want the operational
  semantics).
- `mem_update(ΔM)`: pure insertion stays in `≈`; summarization/prune moves *down*
  `⊑` (faithful successor, not equal) — exactly the asymmetry §1.1 captures.
- `rotate_keys(ΔK)`: stays in `≈` **iff** the lineage is bijective/auditable
  (otherwise continuity is *broken*, which is the desired alarm).
- `policy_update(ΔP)`: in `⊑` **iff** `P_core` is only refined/extended.

This converts the paper's one-sentence assertion into its strongest technical
result and gives readers a *method* (exhibit a bisimulation) to prove that a
given implementation preserves identity.

### 1.3 Prove the five invariants are closed under `→_I` (induction)

The invariant table is stated but never shown to be **closed**. Add:

> **Theorem 2 (Invariant preservation).** If `Inv(C₀)` holds at a well-formed
> genesis configuration and `C₀ —→_I* C`, then `Inv(C)`.

Proof by induction on run length; base = genesis well-formedness; step = a small
lemma per (invariant × transition-type) cell. Formalize each invariant as a
predicate and give it a standard type:
- **Identifier immutability** — `id` constant: a trivial invariant.
- **Policy monotonicity for core safety** — `P_core` only grows: this is a
  **safety property** in the Alpern–Schneider (1985) sense ("nothing bad is ever
  removed"); state it as such. Model `P_core` as an element of a policy lattice
  and `policy_update` as a monotone map.
- **History coherence** — `H` append-only up to order-preserving summarization:
  formalize `H` as a DAG under happens-before (Lamport 1978) and summarization as
  an order-preserving **quotient** `q: H ↠ H/≈_H` that respects the causal order.
- **Memory continuity** — make the "mapping back to source" a **total retraction**
  `ρ: M′ → 2^{H ∪ M}` with a coverage axiom (`∀ m′ ∈ M′, ρ(m′) ≠ ∅`), so identity
  never rests on opaque rewriting.
- **Key lineage** — formalize as a hash-chained, append-only log (next item).

### 1.4 Commitments need a stated security property (and a real flaw to fix)

`state_commitments` are Merkle roots over `P_core`, `M`, and the tip of `H`
(Merkle 1987). Two additions:

1. **Soundness (binding).** Under a collision-resistant hash `H`, the probability
   that an agent exhibits two distinct identity states sharing the same
   `(memory_root, policy_core_root, history_tip)` is negligible. *Therefore* the
   §6 continuity checks are sound: an adversary cannot forge a continuous-looking
   history except with negligible probability. State this as **Proposition 1**;
   it reduces identity-tamper-evidence to standard CR-hash assumptions and to
   tamper-evident-log constructions (RFC 6962 Certificate Transparency, Laurie et
   al.; CONIKS for the *monitoring* pattern, Melara et al. 2015).
2. **Hiding (a concrete flaw).** The handshake sends `values_hash`,
   `capability_hash` as **plain SHA-256 of low-entropy fields**. Plain hashes of
   enumerable values are **not hiding** — a verifier (or eavesdropper) brute-forces
   the preimage from a small dictionary of roles/values. If these are meant to be
   privacy-preserving "commitments," use **salted/HMAC commitments** or
   **Pedersen commitments** (binding *and* hiding). This is a real, fixable
   cryptographic defect, not a stylistic note.

### 1.5 The handshake needs a security model and goal

*SHIK Handshake v0* is a signed, nonce-carrying exchange but states **no security
goal** and has gaps: (i) no derived session key and only one-sided freshness
binding (the request signs its own nonce; the response binds `in_reply_to`, but
the initiator never commits to the responder's freshness) — fragile against
relay/reflection unless the channel is *already* mutually authenticated; (ii) no
forward secrecy; (iii) identities/credentials are revealed before peer
authentication (no identity protection). For a PhD treatment:

- State the **threat model** (Dolev–Yao network attacker) and the **goal**:
  mutual entity authentication with matching conversations / SK-security
  (Bellare–Rogaway 1993; Canetti–Krawczyk 2001).
- **Don't hand-roll AKE.** Layer SHIK's self-model commitments as authenticated
  payload over a vetted handshake — **SIGMA** (Krawczyk 2003) or a **Noise**
  pattern — which give mutual auth, forward secrecy, and identity protection for
  free. SHIK then contributes only the *self-model commitment* semantics, which
  is the novel part.
- Give the protocol as a message-sequence with an explicit property proven (even
  a symbolic ProVerif/Tamarin sketch would substantially raise the bar).

### 1.6 Replace overhead hand-waving with bounds + an evaluation protocol

P1 §10.3 asks the right empirical questions but the body asserts "cheap on a
Raspberry Pi," "~50MB" (P2) without analysis. Add a short complexity section:

- `memory_root` maintenance: `O(log n)` amortized with an incremental Merkle tree
  over `n` memories; `O(n)` for a full rebuild. Handshake: `1` sign + `1` verify +
  `|creds|` VC verifications = `O(1) + O(|creds|)`. Sync: bound message size by the
  CRDT delta (see §2.2), not the full state.
- **Steady-state size.** Define a memory-growth model and a summarization
  compression ratio `r ∈ (0,1]`; show that under a pruning policy with rate
  matched to ingestion, kernel size is bounded rather than monotone — this is the
  formal content behind "manage growth through summarization."
- **Evaluation protocol** answering §10.3 quantitatively: sign/verify latency and
  kernel size vs. turns on a Pi 5; sync bandwidth vs. divergence; and a
  **model-swap behavioral-stability** study (§2.1). The `shik-agent` reference
  daemon in this repository is the natural artifact to measure.

---

## 2. Assumptions — three are too strong, two are missing

### 2.1 "Model independence as a protocol-level *guarantee*" overclaims (P2, central)

P2's thesis sentence — MCP turns model independence "from an architectural
aspiration into a protocol-level guarantee" — conflates two different properties:

- **Syntactic interoperability** (what MCP actually gives): any MCP-compatible
  engine *can call* the kernel's tools. True and valuable.
- **Behavioral/semantic continuity** (what "the same agent" needs): different
  engines *use* the kernel differently — what each deems a "core memory," how it
  styles output, how reliably it extracts — so swapping engines does **not** by
  itself preserve the agent's behavior. MCP cannot guarantee this; it is an
  evaluation question.

**Recommendation.** Downgrade "guarantee" → "necessary substrate," and add a
**behavioral continuity criterion**: define agent behavior as a distribution over
actions given kernel state, and measure *swap-invariance* (A/B the agent across
engines on a *fixed* kernel and a fixed task suite). This is precisely P1's own
open question (i) and is the empirical heart of the thesis. Distinguish
**interface-equivalence** (syntactic) from **policy-equivalence** (behavioral)
explicitly.

### 2.2 The kernel is treated as one consistency domain; it is not (CAP)

Both papers want decentralized replication; P2 correctly notes MCP "is not a
replication protocol" and gestures at CRDTs/Merkle sync — but the design treats
`⟨id, K, P, M, H⟩` as a single replicated blob. The components have **different
consistency requirements**:

- `M` (memory), `H` (history), and the social graph are **monotone /
  append-only** ⇒ they are naturally **CRDTs** (grow-only sets, op-based logs;
  Shapiro et al. 2011), and can be **AP** (eventually consistent under partition).
- `P_core` (safety policy) and `id`/`K` are **safety-critical and must not
  diverge**. Under partition you must prefer **C over A** for these (Gilbert &
  Lynch 2002): a partitioned replica must not unilaterally weaken `P_core`.

**Recommendation.** Adopt an explicit **mixed-consistency** design: CRDT
convergence for `M/H/social`, single-writer-or-consensus authority for
`P_core, id, K`. This is a substantive, citable refinement the papers currently
miss, and it makes "decentralization awareness" precise rather than aspirational.

### 2.3 Self-modification: turn P2's noted risk into a designed threat model

P2 §9.1 flags that a model can call `shik_store_memory()` with fabricated content
or `shik_update_style()` with manipulated preferences — i.e., it can rewrite its
own self-model. Frame this rigorously as **identity/memory poisoning under
(indirect) prompt injection** (Greshake et al. 2023; and the MCP-ecosystem
security SoK, 2025). Policy monotonicity protects `P_core` but **not** `M` or the
style profile, which are writable by any connected engine. Recommended defenses,
stated as design requirements:

1. **Provenance-authenticated writes** — the kernel accepts a memory only if its
   `provenance` chains to an authenticated input percept (sign the percept at the
   sensor boundary). This operationalizes the *memory-continuity* invariant as a
   *security* control, not just a bookkeeping one.
2. **Confidence + human-in-the-loop promotion** for high-impact memories/policy.
3. **A write-side policy monitor** at the MCP server (the read/write asymmetry P2
   already advocates, extended to content checks).
4. **Treat the cognition engine as untrusted w.r.t. the kernel** — zero-trust
   *internally*, which connects directly to the zero-trust-agentic-AI line P1
   already cites.

This converts a limitation paragraph into a contribution.

### 2.4 "Minimal substrate" is asserted, not characterized

Both papers call `⟨id, K, P, M, H⟩` "minimal." Make it an argument: a **necessity**
(drop-one) analysis — removing `H` breaks the history-coherence continuity check;
removing `K` breaks external binding; removing `M` collapses the self to a policy
shell — and a **sufficiency** claim (the five fields suffice to state and preserve
the five invariants). "Minimal" should be a small theorem, not an aesthetic.

### 2.5 Name the identity theory you are assuming (one paragraph)

The "same agent across time and substrate" criterion is a **psychological/
continuity** account (identity grounded in memory + causal-historical lineage),
not a numerical-substrate account — which is *why* model independence is even
coherent (the substrate/brain can change). One explicit paragraph framing `⊑` as a
**diachronic identity criterion** of the bundle/continuity family pre-empts the
obvious philosophical objection and sharpens the novelty: SHIK encodes a
*continuity* theory of machine identity in a checkable data structure.

---

## 3. P2-specific (MCP paper)

- **Strong, correct core mapping.** The component→tool mapping (`I = ⟨id,K,P,M,H⟩`
  → tool groups) and the read/write asymmetry enforcing policy monotonicity at the
  protocol boundary are the paper's best ideas — keep and formalize them
  (the asymmetry is a *capability-security* argument: withhold the write
  capability and the invariant holds by construction).
- **Real-time caveat is right and worth elevating.** §9.2's point — MCP is
  turn-level, not frame-level, so the realtime voice loop cannot be mediated by
  MCP tool calls — is exactly the decomposition the `shik-live` prototype now
  implements (voice engine for the media layer; the kernel interface for the
  identity layer). Cite the prototype as evidence.
- **Concurrency.** §7.3 (multiple simultaneous engines on one kernel) needs the
  consistency model of §2.2 and an explicit conflict policy (last-writer-wins is
  wrong for `M`; use the CRDT merge).
- **"The protocol SHIK was waiting for"** — rhetoric; for a thesis, replace with
  the precise claim: *MCP supplies the syntactic cognition–identity interface;
  cryptographic identity, replication, and media streaming remain out of scope*
  (which §9.2 already concedes — promote it to the framing).

---

## 4. References — corrections and additions (all verified)

**Fix in existing lists.** Ref [6] (CradleTek/Academia.edu) is non-peer-reviewed
yet load-bearing — demote to "motivating" and add peer-reviewed cognitive-agent
work (CoALA below). Refs [11], [12] cite arXiv/preprints without IDs — pin exact
identifiers/venues or drop. Ensure equation/inline math survives typesetting (the
current PDF shows mangled operators).

**Add — LLM agents, memory, cognitive architecture** (the papers under-cite the
very literature `M`/`H` live in):
- Park, O'Brien, Cai, Morris, Liang, Bernstein. *Generative Agents: Interactive
  Simulacra of Human Behavior.* UIST 2023. arXiv:2304.03442.
- Packer, Wooders, Lin, Fang, Patil, Gonzalez, et al. *MemGPT: Towards LLMs as
  Operating Systems.* 2023. arXiv:2310.08560.
- Zhang, Bo, Dai, et al. *A Survey on the Memory Mechanism of LLM-based Agents.*
  ACM TOIS 2025. arXiv:2404.13501.
- Sumers, Yao, Narasimhan, Griffiths. *Cognitive Architectures for Language
  Agents (CoALA).* TMLR 2024. arXiv:2309.02427. — position SHIK as the
  identity/long-term-memory slice of CoALA's memory taxonomy.
- Xi, Chen, Guo, et al. *The Rise and Potential of LLM-Based Agents: A Survey.*
  Sci. China Inf. Sci. 2024. arXiv:2309.07864.

**Add — distributed systems (for §1.3, §2.2):**
- Lamport. *Time, Clocks, and the Ordering of Events in a Distributed System.*
  CACM 21(7), 1978.
- Shapiro, Preguiça, Baquero, Zawirski. *Conflict-Free Replicated Data Types.*
  SSS 2011.
- Gilbert, Lynch. *Brewer's Conjecture and the Feasibility of Consistent,
  Available, Partition-Tolerant Web Services* (CAP). ACM SIGACT News 33(2), 2002.
- Alpern, Schneider. *Defining Liveness.* Inf. Process. Lett. 21(4), 1985. — for
  framing policy monotonicity as a safety property.

**Add — formal methods (for §1.1–1.2):**
- Park. *Concurrency and Automata on Infinite Sequences.* 1981 (bisimulation).
- Milner. *Communication and Concurrency.* 1989. / Sangiorgi. *Introduction to
  Bisimulation and Coinduction.* 2011.
- (Optional, for `migrate`) Milner, Parrow, Walker. *A Calculus of Mobile
  Processes (π-calculus).* Inf. & Comput. 1992.

**Add — cryptography / authenticated data structures (for §1.4–1.5):**
- Merkle. *A Digital Signature Based on a Conventional Encryption Function.*
  CRYPTO 1987.
- Laurie, Langley, Kasper. *Certificate Transparency.* RFC 6962, 2013.
- Melara, Blankstein, Bonneau, Felten, Freedman. *CONIKS: Bringing Key
  Transparency to End Users.* USENIX Security 2015.
- Krawczyk. *SIGMA: the SIGn-and-MAc Approach to Authenticated Diffie-Hellman.*
  CRYPTO 2003.
- Bellare, Rogaway. *Entity Authentication and Key Distribution.* CRYPTO 1993.

**Add — identity & MCP security (deepen P1 §2.2 and P2 §9):**
- Mühle, Grüner, Gayvoronskaya, Meinel. *A Survey on Essential Components of a
  Self-Sovereign Identity.* Computer Science Review 30, 2018.
- Greshake, Abdelnabi, et al. *Not What You've Signed Up For: Compromising
  Real-World LLM-Integrated Applications with Indirect Prompt Injection.*
  AISec@CCS 2023. arXiv:2302.12173.
- *Systematization of Knowledge: Security and Safety in the MCP Ecosystem.* 2025,
  arXiv:2512.08290 (and *MCP Safety Audit*, arXiv:2504.03767) — for §2.3.

---

## 5. Editorial / presentation

- **Unify the two papers** or cross-reference tightly: P2 strictly depends on P1.
  For the thesis, P1 = "the substrate & its formal model," P2 = "the interface,"
  one continuous argument (see §6).
- Abstract of P1 has a stray quote ("artificial agents”); equations rendered with
  broken operators in the PDF — re-typeset and number all displayed math.
- Give every protocol JSON a companion **formal message definition**; the JSON is
  illustrative, not a spec.
- The corporate-personhood and biological analogies (P1 §7–8) are good intuition
  pumps but currently sit at the same weight as technical sections — compress to a
  half-page "Discussion" and reinvest the space in §1 theorems and §2.2 / §2.3.

---

## 6. Suggested thesis framing (for a CS PhD)

A defensible three-contribution arc, each with a provable or measurable core:

1. **Formal model (P1, hardened).** The continuity preorder `⊑` / equivalence `≈`,
   the simulation theorem (Thm 1), invariant preservation (Thm 2), and commitment
   soundness (Prop 1). *Contribution: a checkable, coinductive criterion for
   machine identity across substrate.*
2. **Interface (P2, scoped).** The kernel as an MCP server with capability-secured
   read/write asymmetry; the syntactic-vs-behavioral distinction; the
   mixed-consistency replication model (§2.2). *Contribution: model-independence
   as a necessary substrate plus a behavioral continuity criterion.*
3. **System + evaluation (new chapter).** The `shik-agent` prototype on a Pi as
   the artifact; measure model-swap behavioral stability, kernel overhead, and
   sync bandwidth (§1.6) — answering P1 §10.3 with numbers. *Contribution: the
   first end-to-end demonstration that an agent's self survives a complete
   cognition-engine replacement, with quantified overhead.*

This turns two strong position papers into a thesis whose central claims are
*proved* (identity continuity), *measured* (swap-invariance, overhead), and
*defended* against the obvious attacks (self-model poisoning).

---

*Prepared as an internal review artifact for the SHIK research line. References
were verified against primary sources (ACM DL, USENIX, Springer LNCS, arXiv,
W3C/IETF) in June 2026.*
