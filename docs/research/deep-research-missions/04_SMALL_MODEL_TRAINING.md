# Mission 4 — Decide whether a crossword specialist earns its place

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

Independently challenge and refine the proposal to train a small crossword model.
The owner suspects that many real puzzles could teach a specialized small LLM to
outperform a generic model. The decision is:
**should we fine-tune, distill, train a ranker, improve prompting/retrieval, or use
a stronger untuned model—and what is the smallest decisive experiment?**

Own model/data experiments and deployment feasibility. Do not assume fine-tuning
is necessary, choose the product lexicon wholesale, or ask an LLM to replace grid
constraints.

## Questions that need real answers

- Separate learning to WRITE clues from learning to SOLVE them, to rank clues,
  to judge fill, and to propose coherent theme sets. Which target has the strongest
  evidence and best likely return at household-project scale?
- What can raw published puzzle data actually teach? Which sense/context, editorial
  rejection, difficulty, mechanism, and fairness labels are missing? How should
  real puzzles be transformed into task records rather than whole-grid text?
- Compare supervised LoRA/QLoRA, distillation from accepted teacher outputs,
  a small discriminative reranker, and later preference learning. What failure
  would each fix, and what failures would it preserve or amplify?
- Find a small shortlist of currently available base models, exact official model
  cards, licenses, supported training frameworks, and browser export paths.
  Reevaluate the earlier Llama-3.2-3B and Qwen3-4B-Instruct-2507 candidates; do not
  silently call them the newest or best. The 1B development model is our baseline.
- Verify actual Apple Silicon training feasibility and the MLX/PEFT -> merged
  checkpoint -> MLC/WebLLM path. Identify format, tensor layout, quantization,
  tokenizer/template, and custom-model registry problems. Do not confuse MLX,
  GGUF, adapters, and MLC weights.
- How do answer repetition, related clues, author style, theme families, synthetic
  variants, teacher overlap, and unknown base pretraining contaminate evaluation?
  How can unseen-sense and newly authored tests complement realistic familiar-word
  tests without making the corpus impossible to split?
- What source and teacher-model permissions affect training and distributed
  artifacts? Distinguish verified source conditions from unresolved legal analysis.

## Required concrete outputs

Recommend one first target, one first base model plus a fallback, and one cheap
non-training control. Provide a model decision matrix with direct primary sources
and an explicit column for verified versus untested WebLLM compatibility.

Specify training records, loss masking, data mixture, split strategy, rejection
labels, and data-size experiments. Include one original positive record, one
editorial rewrite record, and one preference pair. Mark source metadata synthetic
where appropriate. Explain how an accepted public-puzzle clue becomes grounded
training material without inventing context.

Design a controlled ladder: current model; improved prompting; stronger untuned
small model; the SAME model after tuning; reranking; exported/quantized tuned
model. Include both equal candidate-budget and measured equal-time comparisons.
Separate capacity improvements from training improvements and raw quality from
post-filter accepted yield.

Propose bounded smoke/pilot runs for the 36 GiB Mac, with compatible framework
versions to verify, initial settings, measurement instructions, and stopping rules.
Estimate resource use with stated assumptions, not invented timings. Identify an
early synthetic-adapter export test so we do not train an unusable browser model.

Define human and automatic gates against copying, false facts, formulaic clues,
forgetting basic instructions, and reduced novelty. Explain how many independent
observations and how much human review the proposed inference actually needs.
A model trained on a critic's taste must not be approved only by that critic.

End with separate promote/defer decisions for an offline catalog model and a
browser runtime specialist. If a small fine-tune is not the best immediate move,
say so and provide the better experiment.

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

Save/title your report: `04_SMALL_MODEL_TRAINING_REPORT.md`.
