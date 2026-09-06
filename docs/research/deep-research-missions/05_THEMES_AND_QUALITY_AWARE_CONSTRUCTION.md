# Mission 5 — Construct coherent themes and fills worth cluing

You are conducting a focused Deep Research mission for a crossword project.
Produce an evidence-backed plan that a coding assistant can later implement.

## Project briefing — treat this as supplied context, not code you inspected

I am building an original English, American-style crossword generator for my
household. I have wanted this for a long time: I want fresh puzzles I actually
look forward to solving, with the breadth, wit, fair challenge, natural phrases,
surprise, and satisfying discoveries I associate with good edited crosswords.
I want independence from the NYT service and content pipeline. Replacing that
habit requires reliable enjoyment, not merely grids that validate.

Personalization should add recognition and occasional useful learning without
turning play into a topic quiz, vocabulary syllabus, or endlessly harder exam.
Both ordinary broad puzzles and thoughtful themes matter. Start with accessible
15x15 puzzles; harder styles and 21x21 need separate evidence.

The following is a repository snapshot supplied by the coding assistant on
2026-09-05. You have NO repository access. Implementation is changing; do not
claim to have inspected, run, benchmarked, or modified it.

- Product: static React/TypeScript PWA, no application backend. Private profiles,
  sessions, and locally generated clues use browser storage.
- Product inference: required local LLM through WebLLM/WebGPU in a worker.
  Generation can prepare a queue and unload the model before solving. Offline
  workstation training/catalog building is allowed; a cloud or localhost model
  service is not the current product architecture.
- Deterministic construction: TypeScript CSP with per-length bitsets, crossing
  propagation, answer uniqueness, reversible trails, seeded search, budgets, and
  anytime results. An experimental Rust/Wasm kernel now exists; TypeScript remains
  default. Browser deployment and fair performance evidence for Wasm remain open.
- A lab dictionary has about 227,000 surface forms, without a production semantic
  inventory. Current quality heuristics are weak: 72% of a post-fill score depends
  on fixed grid shape; its other 28% counts entries above a heuristic threshold.
  A private frequency prior was derived from NYT answers. It is not an independent
  production foundation.
- Clue/catalog/batch interfaces have begun, but the browser path still uses serial
  clue requests. Structural validation does not establish clue fairness or truth.
- Current plans propose curated eligible answers and senses; a precomputed,
  grounded, multi-variant clue catalog; puzzle-wide clue selection; and batched
  on-device generation for missing, unsuitable, or bespoke clues. These are plans,
  not proven production capabilities.
- Development default: Llama-3.2-1B-Instruct in MLC q4f16 format, WebLLM 0.2.84.
  The local training workstation is Apple Silicon with 36 GiB memory. This is not
  the minimum supported player device.
- A training proposal would compare better prompting, a stronger untuned 3–4B
  model, LoRA specialization, and reranking. No crossword fine-tune has been
  trained or evaluated here.
- Existing policy excludes proprietary puzzle archives unless a specific source
  receives an appropriate permission and policy decision. Research useful real
  puzzle sources; do not assume downloadable archives are cleared for training.
  The project owner is in Germany, and eventual distribution may be wider.
- Near-term proof: ten fresh, fully reviewed 15x15 puzzles, followed by solving
  without prior answer exposure, with editing burden and enjoyment recorded.

Preserve the signature solver interface and these architectural boundaries.
Challenge proposed model sizes, algorithms, scores, quotas, or sequencing if the
evidence warrants it. Describe a constraint-changing alternative separately,
with the benefit that would justify reconsidering the constraint.

## Your mission

Design how theme ideas, lively answers, topology choices, deterministic search,
and clue feasibility should cooperate. The decision is:
**what is the smallest construction-policy improvement that materially raises
the yield of enjoyable original 15x15 puzzles?**

Own theme planning, theme-to-grid placement, the editorial search objective, and
the outer search/repair policy. Treat vocabulary/sense quality and clue production
as supplied interfaces. Do not propose a general application rewrite or treat
Rust speed as editorial progress.

## Supplied construction detail

The current fill engine assigns a candidate word to each slot under crossing,
uniqueness, exclusion, pattern, lock, and poor-entry quota constraints. The live
objective is an additive candidate score; the separate post-fill quality score
is mostly constant for a fixed topology. It returns incumbents, termination reason,
node counts, bounds/gaps where valid, and supports budgeted search. Experiments
must distinguish feasibility, first acceptable fill, better fill, and proof.

An experimental Rust port shares the TypeScript boundary. No comparative
performance or enjoyment gain is established. Prefer changes to policy and
benchmarks that remain useful regardless of implementation language.

## Questions that need real answers

- What makes a theme coherent, elegant, discoverable, and worth its constraints?
  Distinguish semantic sets, phrase transformations, revealers, visual mechanisms,
  and rebus-like mechanics. Choose a small initial scope with the best likelihood
  of success; special cell mechanics are not free.
- How should theme sets be generated, checked for consistent rules and natural
  phrases, placed into candidate layouts, and cheaply screened for crossability?
  When should the system replace a theme member, choose another layout, or abandon
  the set instead of accepting terrible fill around it?
- Compare lexicographic, constrained weighted, and Pareto objectives. Which terms
  can guide partial search and admit safe bounds? Which depend on complete clues
  or human judgments? A proposed quality probability is not an admissible bound.
- How do we penalize the worst answer, root repetition, guessing-only crossings,
  and difficult clusters without eliminating useful crossword staples or fair
  unfamiliar material? Specify cold-start estimates and uncertainty.
- Compare diverse top-k fills, limited discrepancy, restarts, conflict learning,
  decomposition, local repair, and theme/seed portfolios. Select at most three
  first experiments. Explain applicability of published crossword construction
  results and how competition scoring differs from our enjoyment goal.
- How should feedback from clue assignment trigger a local repair, answer exclusion,
  new fill, or new theme? Preserve good accepted work; define bounded failure paths.
- How can curated independent layouts and real editorial vocabulary form a fair
  benchmark without depending on provider-derived masks or tiny cherry-picked grids?

## Required concrete outputs

Give three original theme proposals with full answer sets, exact normalized
lengths, rule explanations, and an editorial critique. Include one tempting but
inconsistent set and explain its rejection or repair. Do not present a theme
as crossable until the stated placement/constraint checks have actually been run;
paper examples should mark that as unmeasured.

Specify a theme-plan contract and a fill/clue feasibility feedback contract.
Provide pseudocode for the outer controller from theme proposals through placement,
fill, clueability, repair, and acceptance. Include state reuse limits and when
outputs must be invalidated.

Construct a small mathematical witness where a higher average score permits one
unacceptable entry/crossing while another fill is preferable. Show how the proposed
objective and stopping policy handle it without claiming unsupported optimality.
Separate hard constraints, search proxies, complete-puzzle gates, and tie-breaking.

Provide a reproducible experiment matrix with dataset/layout versions, seeds,
warm/cold indexing, node and time budgets, accepted-fill yield, time to editorial
target, diversity, and resource use. Compare the same policy in the same language
before crediting an implementation-language change.

End with an implementation sequence that first improves accessible puzzles and
only then expands theme complexity or harder styles. State what should be deferred
even if it is academically interesting.

## Research and delivery requirements

Conduct actual deep research using sources available on the research date.
Prefer original papers, official model/tool documentation, actual source licenses,
maintainer repositories, and first-hand constructor/editor guidance. Secondary
sources may locate leads but should not establish technical claims alone.

For decisive claims, open the primary source and cite the supporting page near
the claim. Record publication/version dates where relevant. Distinguish evidence
about educational crosswords, cryptics, clue solving, American-style recreational
construction, and unrelated optimization competitions. Do not transfer a result
between them without explaining the limitation.

Label each major recommendation as supported evidence, reasoned inference, or
proposed experiment. Separate reported published measurements from estimates for
this project. Never invent our latency, benchmark results, dataset rights, memory
requirements, or existing implementation. If sources disagree, make the disagreement
and the experiment that could resolve it visible.

Stay within this mission. Name interfaces needed from neighboring missions instead
of redesigning their work. You can complete this mission independently using
explicit assumptions. Do not wait for repository access or ask a long series of
clarifying questions. Do not contact publishers, acquire private corpora, launch
training, or spend money; this is research and planning.

Return one implementation-oriented Markdown report, approximately 2,500–4,000
words plus compact technical appendices if necessary. Depth should come from
worked decisions, algorithms, schemas, and experiments rather than repetition.
Include:

1. The recommended decision and the strongest case against it.
2. An evidence table: claim, primary source/date, applicability, limitation.
3. A comparison of the serious alternatives and the cheapest credible baseline.
4. The mission-specific design, with original worked examples and proposed
   input/output contracts. Mark all examples synthetic and validate them on paper.
5. Three decisive experiments: hypothesis, controls, required data, metrics,
   uncertainty, resource measurement, stopping rule, and what each outcome changes.
6. An ordered implementation plan a coding assistant WITH repository access can
   map onto the app. Each task needs dependencies, owned responsibility, acceptance
   evidence, and rollback. Proposed module names are suggestions, not existing files.
7. A first-week slice, assuming limited developer/reviewer time; label effort
   estimates as estimates and expose external data or permission dependencies.
8. A short handoff block: recommended interfaces, artifacts, assumptions requiring
   code verification, unresolved decisions, and impact on the ten-puzzle pilot.

Do not equate a high test score or model judge's praise with enjoyment. Preserve
hard correctness and source requirements outside soft preferences. Include a
clear stop/defer decision if the evidence does not justify the proposed work.

Save/title your report: `05_THEMES_AND_QUALITY_AWARE_CONSTRUCTION_REPORT.md`.
