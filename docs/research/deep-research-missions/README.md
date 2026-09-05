# Crossword Deep Research missions

Prepared 2026-09-05 for use in Gemini Deep Research or another research system.
These are research prompts, not completed research findings. Every mission includes
the project context, so no repository access or additional planning files are needed.

## How to use

Open one mission file, copy its entire contents, and start a separate Deep Research
conversation with it. Use your chosen Gemini model; these briefs do not depend on
a particular model's unverified capabilities. Ask for the finished report as Markdown
and retain its source links. No extra shared preamble is required.

Start with **1, 2, and 3**. They can run independently and address the immediate
quality bottlenecks. Run **4 and 5** next, or alongside them if research capacity
permits. **6 is optional and lower priority** until the neutral puzzles are good.

| Mission | Main decision | Prompt |
| --- | --- | --- |
| 1. Editorial quality | What makes a puzzle enjoyable, and how will we measure it? | [Copy mission 1](01_EDITORIAL_QUALITY_AND_EVALUATION.md) |
| 2. Vocabulary and meanings | Which sources and curation produce good, clueable fill? | [Copy mission 2](02_LEXICON_SENSES_AND_DATA_SOURCES.md) |
| 3. Clue craft | How do we generate, edit, and select fair, witty clues? | [Copy mission 3](03_CLUE_GENERATION_AND_EDITING.md) |
| 4. Small-model training | Does specialization outperform prompting, larger models, or reranking? | [Copy mission 4](04_SMALL_MODEL_TRAINING.md) |
| 5. Themes and construction | How do themes, layouts, and search yield better puzzles together? | [Copy mission 5](05_THEMES_AND_QUALITY_AWARE_CONSTRUCTION.md) |
| 6. Personalization | Which gentle adaptations improve enjoyment without creating homework? | [Copy mission 6](06_PERSONALIZATION_WITHOUT_AN_EXAM.md) |

With a budget for only three missions, use **1–3**. If testing training is the
immediate priority, mission 4 is self-contained and can run first; it must still
define its editorial/data dependencies.

## Bring the findings together

After the core reports return, attach them to a new research conversation and
paste [the synthesis prompt](07_SYNTHESIS.md). It inventories missing reports,
resolves conflicting recommendations, and produces a bounded build plan. Include
mission 6 only if you ran it.

Bring the reports and synthesis back to the coding task. The coding assistant
must verify the suggested interfaces and snapshot assumptions against the current
repository before treating any plan as implementation truth.

The useful deliverables are: a small approved language inventory; a practical
editorial standard; a clue production/evaluation pipeline; a decision on model
specialization; and a path to complete puzzles that survive actual solving.

## What to check before accepting a report

- Are its main recommendations supported by opened primary sources?
- Does it distinguish published results, project estimates, and proposed experiments?
- Are the sources/data actually usable under identified terms?
- Does it respect browser inference, local privacy, and the existing constraint engine?
- Does it preserve entertaining ambiguity while rejecting unfairness?
- Does it include original worked examples, implementable contracts, and decisive tests?
- Does it produce a complete-puzzle milestone rather than requiring all research first?
- Does it say what to stop or defer if the experiment fails?

If a report misses those essentials, paste this follow-up into that conversation:

> Revise this report into an implementation-ready decision. Replace unsupported
> claims with verified primary evidence or explicit uncertainty. Add the missing
> worked examples, interfaces, experiment controls, failure decisions, and first-week
> slice. Preserve the project constraints and distinguish proposed components from
> inspected code. Cut generic background and duplicate recommendations; do not
> expand the scope.

## Context accuracy

The prompts embed a checked project snapshot as of 2026-09-05, including the new
experimental Rust kernel and the currently incomplete semantic/clue pipeline.
That snapshot may become stale. No benchmark values, source permissions, model
training results, or final editorial thresholds are asserted as established.

Related planning documents:

- [Rust/Wasm construction plan](../../plans/12_RUST_WASM_CONSTRUCTION_ENGINE.md)
- [Personalization and clue catalog](../../plans/13_MEANINGFUL_PERSONALIZATION_AND_CLUE_CATALOG.md)
- [Specialized model training](../../plans/14_SPECIALIZED_CROSSWORD_MODEL_TRAINING.md)
