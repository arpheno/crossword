# Mission 3 — Produce clues with wit, fairness, and dependable meanings

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

Design the clue production and editing pipeline most likely to turn good answer
fills into crosswords people want to solve. The decision is:
**how do grounded generation, catalog reuse, candidate selection, and editing
produce varied, accurate, satisfying clues at acceptable local cost?**

Own drafting, validation, revision, catalog coverage, and whole-puzzle clue
assignment. Treat answer/sense/fact records and editorial rubrics as interfaces.
Do not choose a universal lexicon, rebuild CSP search, or assume fine-tuning wins.

## Questions that need real answers

- Which capabilities do contemporary studies actually establish for recreational
  clue generation, versus educational definitions or clue solving? Evaluate small
  local models and stronger offline models by task, with primary evidence.
- How should structured prompts use answer, intended sense, permitted facts, locale,
  difficulty intention, requested technique, neighboring clues, and theme context?
  Distinguish definitions, fill-ins, puns, double meanings, associations, facts,
  abbreviations, and puzzle references.
- Which defects admit deterministic detection, which need retrieval/semantic
  judgment, and which still need a human? Cover answer-family leakage, false facts,
  sense mismatch, wrong grammar, contrived meanings, and duplicate surfaces.
- How do we retrieve plausible alternative answers without demanding that every
  clue uniquely identifies an answer before crossings? How do candidate alternatives
  and actual crossing information distinguish productive ambiguity from guessing?
- How do we select primary clues and useful nudges across a whole puzzle? Include
  difficult clusters, repeated clue mechanisms, sentence openings, topical redundancy,
  answer leakage between clues, and reference dependencies.
- What does a build-time clue catalog solve, and what must remain puzzle-specific?
  How should missing, stale, recently repeated, or contextually unsuitable clues
  trigger bounded runtime work?
- How can batching and item-level checkpoints improve throughput without losing
  clue quality or making late failures discard completed work?

## Required concrete outputs

Provide a technique taxonomy and a validator capability matrix. For each validator,
state inputs, actual algorithm, likely false positives/negatives, and the route
for uncertainty. No imaginary deterministic factuality or universal ambiguity oracle.

Give eight original answer/sense examples with multiple primary candidates, a
recovery clue, a short mechanism explanation where needed, and selection/rejection
reasoning. Include a harmless ambiguous clue that should survive and a fluent
fabrication that must fail. Review your own examples critically; label unresolved
cases instead of declaring all generated examples excellent.

Specify compact proposed schemas for clue candidates, factual support, review
receipts, contextual applicability, and per-entry batch results. Explain invalidation,
recency, and exact prompt/model/validator versioning.

Provide pseudocode for: drafting surplus candidates; cheap filtering; alternate-
answer retrieval; bounded semantic review; constrained puzzle-wide selection;
repair; and typed failure or request for a different fill. Preserve successful
clues when another entry fails. State which stage owns the decision to refill.

Design a fixed-input comparison of catalog-only selection, untuned generation,
generation-plus-reranking, and a future specialist using the same information.
Measure accepted clues per unit effort, editing time, diversity, raw errors,
post-filter rejection rates, and actual whole-puzzle enjoyment.

End with the smallest working catalog/gap-generation slice and a list of the
highest-value positive, negative, and editorial-edit examples for a future model
training dataset.

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

Save/title your report: `03_CLUE_GENERATION_AND_EDITING_REPORT.md`.
