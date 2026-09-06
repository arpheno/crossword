# Mission 2 — Build the vocabulary and meaning inventory

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

Find a realistic path from a large spelling list to the language inventory that
can support enjoyable original 15x15 puzzles. The decision is:
**what sources, curation, and scoring should we implement first to obtain natural,
clueable, culturally broad fill without the NYT frequency prior?**

Own answer eligibility, lexical scoring, stable meanings/facts, and source
acquisition. Supply contracts for construction and clue generation. Do not build
a learner model, train a clue LLM, or redesign search.

## Questions that need real answers

- Identify actual candidate sources for modern words, everyday multiword phrases,
  names/entities, crossword staples, senses, grammatical features, register, locale,
  and frequency. Investigate sources such as WordNet, Wiktionary, Wikidata, spelling
  lists, corpus-frequency resources, and constructor-contributed word lists as leads,
  not pre-approved answers.
- For each shortlisted source, verify the exact artifact, maintainer, version,
  download/API path, field availability, maintenance status, size where documented,
  and actual license/terms. Distinguish source text, database, software, derived
  records, training use, browser distribution, and attribution. State ambiguities
  and a practical fallback; do not treat a repository license as blanket ownership
  of third-party content.
- Which useful lexical categories will dictionaries miss? How can original or
  contributor-supplied natural phrases and themes enter with honest records?
- Separate frequency in language, constructor convenience, household familiarity,
  and editorial appeal. Design a small interpretable score that cannot reward
  strange words simply for familiar letter sequences.
- What does sense resolution require for polysemy, names, inflections, acronyms,
  foreign terms, and form-based wordplay? How do source disagreements and uncertain
  meanings enter quarantine instead of silently becoming facts?
- How does coverage relate to fill feasibility? Avoid claiming that an arbitrary
  vocabulary size is enough. Specify how to measure candidate-domain coverage and
  accepted-puzzle yield across a small independent layout bank.

## Required concrete outputs

Provide a source decision matrix with a recommended minimal source stack and
a fallback stack. Explain which information remains manual. Keep legal discussion
tied to source decisions and implementation consequences.

Specify versioned records for answer/display form, lexeme, sense, root/inflection,
fact, locale/register, editorial rating, and source receipt. Show at least eight
original illustrative records across hard categories, including one intentionally
unresolved case. Use schema placeholders for source IDs not actually retrieved;
never fabricate source receipts.

Design a reproducible ingestion -> normalization -> deduplication -> sense mapping
-> eligibility -> scoring -> clue-coverage pipeline. Include update/deletion
behavior and artifact hashes. Distinguish a raw lab source from product eligibility.

Create a curation queue prioritized by marginal usefulness to good grids, not
just raw frequency. Address the cold start: we cannot hand-review 227,000 lines
or precompute clues for everything before solving anything.

Give a concrete bootstrap experiment for a few layouts: what subset to curate,
what statistics to collect, how to expand around failing slots without overfitting
to one grid, and how to validate with fresh layouts/seeds. Bound contributor/editor
work and identify what can genuinely be automated.

End with the inventory and measurable coverage report the clue and construction
missions can consume immediately.

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

Save/title your report: `02_LEXICON_SENSES_AND_DATA_SOURCES_REPORT.md`.
