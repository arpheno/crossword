# Mission 6 — Personalize for delight without creating homework

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

Research a restrained personalization system that helps a household enjoy broad,
surprising crosswords and occasionally learn through play. The decision is:
**which small, inspectable adaptations improve personal fit, and what should
remain unmodeled until evidence exists?**

Own evidence interpretation, profile policy, recurrence, household fairness, and
evaluation of personalization. Treat a good neutral constructor and catalog as
prerequisites. Do not replace editorial standards or build a cloud recommender.

## Questions that need real answers

- Separate interests, familiarity, sense-level recall, clue-mechanism skill,
  cultural/locale knowledge, and recent exposure. What can explicit feedback and
  ordinary solving establish, and what is fundamentally ambiguous?
- How do crossings, checks, nudges, reveals, voice mistakes, paste, idle time,
  and another household player's contributions censor evidence? Do not equate
  a completed word or long pause with a cognitive diagnosis.
- What evidence transfers from retrieval practice and spaced repetition to
  recreational crosswords? Which claims remain hypotheses? Is an adaptive
  schedule worth its complexity relative to simple answer/clue recency rules?
- How should repetition balance crossword fluency, boredom, discovery, and varied
  retrieval cues? Does spacing a sense mean avoiding all other senses of its word?
  How should known short staples differ from distinctive long answers?
- How can two people with uneven interests and knowledge both get entry points?
  Separate jointly solved puzzles from individually attributable observations.
- How should comfort/stretch controls change clue selection without making
  personalized fill worse or removing broad cultural surprises?
- Which data deserve storage, confidence, decay, correction, export, and reset?
  How can a neutral mode and an explanation of actual applied effects stay honest?

## Required concrete outputs

Recommend a first version with no more than three adaptive mechanisms. Compare
it with a neutral baseline and an explicit-preferences-plus-recency baseline.
Argue for each added field using a producer, consumer, and falsifiable benefit.

Existing plans propose 45% broad material, 20% adjacent interests, 15% reinforcement,
15% staples/glue, and 5% exploration. Treat these as unvalidated starting ideas.
Investigate whether categories overlap, how cold start reallocates an empty role,
and whether quotas would distort fill. Recommend tolerances or replacing quotas
when justified. Measure the final puzzle, not only the candidate bag.

Provide a small profile/event schema and conservative update rules, with uncertainty
and neutral behavior. Show at least six synthetic replay cases: sparse evidence,
interest without expertise, revealed answer, crossing-only completion, unequal
household expertise, and a recently repeated clue for an otherwise due sense.
Include explicit signals that should NOT cause an update.

Design a local crossover experiment with fresh puzzles, novelty controls,
optional feedback, delayed retrieval, and no covert telemetry. Separate enjoyment,
learning, personal fit, and editorial quality rather than collapsing them into
a single reward. Explain household-scale uncertainty and when no learning claim
is supportable.

Specify a hard cap on personalization's influence, regression cases protecting
neutral fill/clue quality, and a one-switch rollback. Do not propose online neural
training, a bandit, or a latent ability vector without identifying the evidence
needed to beat the simple baseline.

End with what belongs before the ten-puzzle pilot, what can follow it, and what
should remain a research idea.

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

Save/title your report: `06_PERSONALIZATION_WITHOUT_AN_EXAM_REPORT.md`.
