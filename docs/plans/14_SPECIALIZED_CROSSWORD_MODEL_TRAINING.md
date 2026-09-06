# Specialized crossword model: fine-tuning and evaluation plan

Status: proposed experiment, 2026-09-05. No training run, corpus acquisition, or
model promotion has been performed for this plan.

## Recommendation

**Yes: test a small model fine-tuned to draft and revise crossword clues.**
Start from an instruction-tuned model and use supervised fine-tuning with LoRA.
Keep grounded senses, facts, the clue catalog, and deterministic grid construction
outside its weights. Treat better crossword writing as a hypothesis to measure.

Do not train a language model from scratch. Do not make an LLM responsible for
writing a complete, crossing-correct grid. Do not begin by feeding it an
undifferentiated archive of entire puzzles.

A specialized model could learn concise clue language, grammatical conventions,
controlled misdirection, useful recovery clues, and your editorial preferences.
It will not automatically acquire impeccable factuality, good fill judgment, or
the ability to invent elegant themes. It can also learn stale phrasing, overused
answers, and bad habits from a large corpus.

The first success criterion is **less editing for clues you enjoy solving**.
Lower training loss and resemblance to existing newspaper clues are diagnostics,
not the product goal.

This extends [plan 13](13_MEANINGFUL_PERSONALIZATION_AND_CLUE_CATALOG.md): the
trained model can first improve the offline catalog factory and, if it passes
browser gates, become the on-device composer for missing or bespoke clues.
[Plan 12](12_RUST_WASM_CONSTRUCTION_ENGINE.md) continues to own fill-engine
experiments independently. Neither experiment should delay the first reviewed
batch of enjoyable 15x15 puzzles.

## 1. What training should own

| Task | First approach | Training decision |
| --- | --- | --- |
| Write a clue from an answer, intended meaning, and permitted facts | Grounded prompting and examples, then supervised LoRA | First experiment |
| Rewrite a weak clue after a named editorial criticism | Curated before/after edits | Include in the first dataset |
| Supply a genuinely easier nudge | Paired primary/recovery examples | Include and evaluate separately |
| Rank several proposed clues | Explicit rubric, then a small classifier/ranker if useful | Separate experiment; may pay off before a generative fine-tune |
| Suggest coherent theme sets | Stronger untuned model plus reviewed examples | Later, separate dataset and test |
| Rate answer quality and naturalness | Curated vocabulary and explicit features | Improve immediately; consider a learned ranker later |
| Fill a grid and enforce crossings | Existing CSP engine | Keep deterministic |
| Remember current facts or household interests | Catalog/profile retrieval | Keep out of model weights |

Learning to answer clues is a different task from learning to write them. An
inverse clue-to-answer model could eventually help retrieve competing answers,
but its success would not demonstrate good clue generation. Train and evaluate
the direction the application actually needs.

An answer ranker also needs editorial judgments. Frequency in published grids
alone mixes familiarity with how useful a letter pattern is to constructors;
it is not an enjoyment label.

## 2. What evidence supports the idea

[Clue-Instruct](https://arxiv.org/abs/2404.06186) constructs 44,075 educational
text/keyword examples with three clues each and investigates instruction tuning.
It supports testing context-grounded specialization. Its explicitly educational,
more factual clue style is narrower than this project's recreational goal.

The [Italian crossword generation study](https://aclanthology.org/2024.clicit-1.110.pdf)
fine-tunes Mistral-7B and Llama3-8B and reports improvements under its evaluations.
Its automatic comparison measures overlap with teacher-generated clues, and the
paper itself explains that ROUGE does not establish semantic clue quality.
This is encouraging precedent, not proof that a 1–4B model will produce witty,
fair English daily crosswords.

[LoRA](https://arxiv.org/abs/2106.09685) adapts a pretrained model through small
trainable updates while freezing the underlying weights.
[QLoRA](https://arxiv.org/abs/2305.14314) reduces the memory needed for adaptation
using a quantized base. These make a bounded local experiment plausible; neither
method compensates for weak examples or an inadequate evaluation set.

**Working hypothesis:** a 3–4B specialist may beat its untuned counterpart on
clue craft and output discipline, and may approach a larger model on routine
grounded clues. Whether it does so on wordplay and whole-puzzle enjoyment remains
an open question.

## 3. Repository and hardware baseline

Checked on 2026-09-05:

- `apps/web/src/modelConfig.ts` pins
  `Llama-3.2-1B-Instruct-q4f16_1-MLC` as the development default.
- ADR 0002 requires product inference in a WebLLM/WebGPU worker, with no local
  HTTP model service or hidden cloud fallback.
- The installed WebLLM package lists a Llama-3.2-3B q4f16 model, making that a
  relatively direct larger baseline. A listed model is not a device benchmark.
- `webllmAdapter.ts` currently checks the prebuilt catalog and creates the engine
  without a custom `appConfig`. A custom fine-tune requires integration work.
- Catalog/batch abstractions have started, but the browser construction client
  still supplies the singular clue operation. Fine-tuning alone will not remove
  serial-call latency or add checkpointing.
- This Mac reports `Mac15,6` and 38,654,705,664 bytes of physical memory: 36 GiB.
  This is a development-machine observation, not the supported browser floor.

Use the Mac for an initial 1–4B adapter experiment with short contexts and a
small batch. Start with a measured smoke run before predicting training time.
Memory depends on activations, sequence length, optimizer, precision, and which
layers are adapted; a model fitting for inference does not prove it fits for
training.

Training and catalog building may run as offline workstation tools. That does
not change the browser-only product runtime. Keep their dependencies out of the
web application and its normal install path.

## 4. Choose a base through a small comparison

| Candidate | Purpose | Constraint |
| --- | --- | --- |
| Current Llama-3.2-1B-Instruct | Actual product baseline; possible later compression target | Establish what better prompting alone achieves |
| Llama-3.2-3B-Instruct | First compatibility-oriented tuning candidate | Custom Llama license and release obligations |
| Qwen3-4B-Instruct-2507 | One alternative 4B instruction-model baseline | Prove MLX and pinned MLC/WebLLM compatibility before investing |
| One stronger 7–8B instruction model | Offline quality reference and possible catalog drafter | No assumption that it belongs on every player's device |

These are concrete experiment candidates, not claims about the latest or best
available models. The [Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
identifies a 4B, non-thinking model with Apache-2.0 licensing. The
[Llama model card and license](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct)
describe its custom conditions, including attribution and naming requirements
that also matter when using Llama outputs to improve a distributed model.

First compare the 1B baseline and both 3–4B candidates with the same grounded
inputs. Give each a small, equal prompt-tuning budget on development data. Select
one small base for the first fine-tune. Use the larger reference only where it
helps establish whether the bottleneck is model capacity or missing context.

A stronger untuned model might already meet the need. Adopt that result if its
browser cost is acceptable; training is not a milestone that must happen.

## 5. Using real puzzles: useful material, different training records

Real puzzles are valuable because they contain edited language, conventions,
theme relationships, and clues used in a crossing context. Preserve that context
when converting an approved source, rather than flattening everything into text.

Extract three separate record families:

1. **Clue records:** answer/display form, clue, resolved sense, technique,
   grammatical signals, locale, source puzzle, author, and publisher's day label.
2. **Theme records:** complete theme set, common rule, revealer if present,
   entry lengths/placements, and why each member obeys the same rule.
3. **Editorial records:** rejected and accepted alternatives, the reason for the
   edit, and any tradeoff between cleverness, fairness, and naturalness.

Published puzzles mostly supply positives. They do not reveal all the drafts an
editor rejected, why an answer was tolerated, or how hard a clue felt to this
household. Those missing labels are a major reason that volume alone is weak
supervision. Preserve publisher day as metadata, not a universal difficulty score.

### Source policy for this experiment

Use original work, commissioned examples, or sources whose permissions cover
the intended training and resulting distribution. Record acquisition and model
release rights separately. Public availability, a subscription, or a repository
license attached to an aggregated dataset is not sufficient evidence about every
underlying puzzle's permissions.

Plan 13 currently excludes NYT and other proprietary clue archives from training
and evaluation. This document proposes a permissioned real-puzzle route; it does
not silently approve the existing NYT archive. A specific newly licensed source
can receive a documented source-policy decision before ingestion. Independent
constructors willing to contribute or license work are a practical acquisition
route to investigate, without contacting anyone as part of writing this plan.

Do not assume that all AI training uses are either automatically permitted or
automatically prohibited. The [U.S. Copyright Office's AI initiative](https://www.copyright.gov/ai/)
documents the separate training-policy issues; it does not settle the applicable
position for this Germany-based project. This plan chooses documented permissions
as its operational route, rather than relying on an unresolved legal theory.

Use this minimal ledger before importing a source:

```text
source ID and exact version/digest
creator/publisher and acquisition URL or agreement reference
permitted uses: train / evaluate / retrieve / redistribute examples
conditions on released weights, adapters, and generated artifacts
attribution and retention/removal requirements
source-policy decision and date
```

An educational or synthetic dataset may be useful for formatting and grounding,
but must pass its own source review and must not dominate the recreational style.
Teacher-generated material also carries the teacher's applicable output-use terms.

## 6. Build examples that teach the desired behavior

Begin with **500 carefully reviewed training examples**, plus a separate
development set and locked evaluation set. If the pilot is promising, expand to
5,000 examples and then, only if a learning curve justifies it, 10,000–20,000.
These are experiment budgets, not established minimum data requirements.

An initial training mixture to test:

| Share | Example type |
| ---: | --- |
| 40% | Fair, concise primary clues across everyday words, phrases, and knowledge |
| 25% | Revising a flawed clue into an accepted one, with a named reason |
| 20% | Wordplay or misdirection with a short, defensible mechanism explanation |
| 15% | Primary/recovery pairs with a meaningful reduction in difficulty |

Balance answer lengths, ordinary phrases, polysemy, grammatical forms, locale,
and content domains. Cap repeated short answers and boilerplate clue patterns.
Measure the mix after deduplication. Do not manufacture weak puns to fill a quota.

Give the model the same information it can receive in production:

```json
{
  "task": "compose_clue",
  "answer": "BASS",
  "displayForm": "bass",
  "sense": {"id": "example:musical-bass", "gloss": "a low singing voice or range"},
  "allowedFacts": [],
  "dayBand": "accessible",
  "locale": "en",
  "requestedTechnique": "definition",
  "avoidClueSurfaces": [],
  "context": {"theme": null, "crossReferences": []}
}
```

An illustrative authored target, not a production-approved catalog record:

```json
{
  "primary": {"text": "Low end of a choir", "technique": "definition"},
  "nudge": {"text": "Lowest usual male singing range", "technique": "definition"},
  "explanation": "Uses the musical sense, not the fish.",
  "factIdsUsed": []
}
```

The wrapper stores source receipts, reviewer decisions, and split-group IDs.
The actual supervised record uses the chosen model's chat template: structured
request as user content and accepted response as assistant content. Train on the
assistant response, not on predicting the supplied answer and source packet.

An explanation is a concise explanation of the clue mechanism, not proof that
the clue is correct. Verify factual assertions separately. Do not invent sense
records or label a model-authored explanation as source evidence.

For context-dependent published clues, retain the needed theme/referent or omit
the example. The model must not learn that “See 42-Across” is a usable standalone
clue. Use the final grid's crossing context only where the deployed operation can
actually supply it; never train on hidden solver knowledge unavailable at runtime.

Create a rejection set for answer leakage, wrong sense, factual errors, forced
abbreviations, number/tense mismatch, and invented meanings. The local demo's
`HRAP` / “A hurried rap, compressed” is a useful failure case, not a positive
training example.

## 7. Avoid an evaluation that rewards memorization

Split before generating paraphrases, teacher variants, or editorial rewrites.
Keep each original and all derivatives in one partition. Deduplicate both exact
records and near-identical clue families across the entire corpus.

Use separate evaluation slices:

- **Familiar answers, unseen clues:** an ordinary answer may appear in training,
  but its test wording and close variants do not. This reflects catalog enrichment.
- **Held-out answer families/senses:** test new material and meanings absent from
  supervised training. Keep inflections and closely related forms grouped.
- **Held-out puzzle/theme families:** all related entries and revealers stay
  together; test theme generalization separately from clue craft.
- **Fresh authored challenge cases:** new factual packets, ambiguous senses,
  awkward requested techniques, and unfamiliar but valid phrases.

Hold out authors or sources where the corpus permits, and report results by
source/era. Do not force every ubiquitous short answer into one split if that
destroys the dataset; keep the answer-generalization challenge as a distinct slice.

A held-out fine-tuning example may still have appeared in base-model pretraining.
Call the split “held out from our training,” not “provably never seen.” Fresh
authored inputs reduce that uncertainty. Compare normalized generated wording
against the approved training corpus; short conventional coincidences need
adjudication, while distinctive copied phrasing is a failure to investigate.

## 8. Freeze a fair baseline before training

Create 200 development packets and 200 locked final-test packets, disjoint from
training. Cover the four slices above and report each separately. Keep final-test
targets out of prompt selection, synthetic generation, and checkpoint choice.

| Experiment | What it isolates |
| --- | --- |
| A: current 1B with current prompt | Existing product behavior |
| B: current 1B with better grounding and examples | Gains without training |
| C: selected 3–4B base with the same information and tuned prompt | Capacity/base-model effect |
| D: same 3–4B after supervised LoRA | Fine-tuning effect against C |
| E: C with candidate generation and editorial reranking | Whether selection beats adaptation |
| F: D after browser conversion/quantization | Whether the deployable artifact retains the gain |

Run the other small candidate and larger reference during base selection, not as
an unbounded model tournament. Log prompts, base revisions, decoding parameters,
validator versions, and generated bytes. Seed where supported; retain outputs
because a seed does not guarantee identical inference across runtimes.

For C versus D, hold factual inputs, task mix, candidate count, and permitted
rewrites fixed. Also compare under equal wall-time budgets. Report both raw model
quality and post-validation accepted yield so rejection does not hide failures.

## 9. First training recipe and resource stop rules

Use a separate pinned MLX-LM environment on this Apple Silicon workstation.
Its [official LoRA guide](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)
documents LoRA/QLoRA, JSONL chat data, adapter checkpoints, prompt masking, and
fusing. A quantized base selects its quantized adaptation path. Verify the exact
model and export path rather than treating every family as interchangeable.

Illustrative commands after the environment, compatible model, and dataset exist:

```sh
mlx_lm.lora --help
mlx_lm.lora --model /path/to/pinned-compatible-model --train \
  --data /path/to/split-jsonl --iters 100 --mask-prompt \
  --adapter-path /path/to/crossword-pilot-adapter
```

These commands are a smoke experiment, not a ready-to-run repository script.
The implementing task must pin versions and check their actual CLI/config schema.
Start with batch size 1, sequence length 1,024, and LoRA rank 8 or 16. Record
target modules/layers and effective batch size explicitly. Try one learning rate
first (for example `1e-5`), then at most one alternative chosen on development
evidence. These are proposed starting settings, not validated hyperparameters.

Profile 100 optimizer steps before scheduling the pilot. Record peak memory,
swap growth, tokens/second, tokens/step, elapsed time, and thermals. Stop a run
that exhausts memory or causes sustained swapping; reduce sequence length or
adapted layers before adding complexity. Gradient accumulation changes effective
batch size but does not eliminate a single example's activation memory.

After the smoke run, target one effective pass over the pilot and inspect held-out
outputs. Allow up to three passes only while development quality improves. Use
validation and editorial scores for checkpoint selection, not training loss alone.
Repeat a promising configuration with a second seed before widening the dataset.

Bound the first pilot to the export smoke and two substantive adapter runs.
Estimate duration from measured tokens/second and actual dataset tokens; leave
time and cost as unmeasured until then. Do not download a succession of large
models or rent GPUs to rescue a weak dataset. A CUDA/PEFT route remains an optional
separate experiment if measured local limits justify it.

## 10. Test browser export before substantial training

Use a tiny adapter trained on synthetic examples to prove this path early:

```text
pinned base + adapter
        -> fused checkpoint with compatible config/tokenizer and tensors
        -> MLC weight conversion and chosen quantization
        -> matching WebGPU model library and chat configuration
        -> custom WebLLM model record in the existing worker
```

MLX quantized tensors, PEFT adapters, GGUF, and MLC artifacts are different
formats. Preserve the exact base revision and verify merge/dequantization/export
support with a numerical and text smoke comparison. Do not assume an arbitrary
MLX checkpoint can be passed directly to MLC. If the bridge fails, an offline-only
catalog model remains useful; select a compatible training/export route before
promising a browser model.

MLC's [WebLLM deployment guide](https://llm.mlc.ai/docs/deploy/webllm.html)
requires converted weights and a compatible model library. Custom records can
be supplied through `appConfig`; architecture, quantization, and relevant model
metadata determine library compatibility. Reusing a library needs verification,
and incompatible configurations require compilation.

Repository integration must replace the prebuilt-only check with an explicit
approved custom-model registry and supply it to worker engine creation. Preserve
request cancellation, cache ownership, install/load/unload, and a known-good model
selection for rollback. Pin model/config/tokenizer/library hashes and avoid mutable
`latest` artifact URLs. Training weights and datasets stay outside Git.

Evaluate the actual browser artifact on the same packets. Measure download bytes,
cold load, warm clue latency, batch throughput, peak memory, cache/offline reload,
and cancellation. Quantization or a wrong chat template can erase the benefit.
The Mac's 36 GiB does not establish acceptable memory on another player's device.

## 11. Acceptance: better clues and better complete puzzles

Freeze these provisional decision rules before seeing final-test outputs:

| Dimension | Pilot rule |
| --- | --- |
| Structural reliability | At least 99% schema-valid responses on final packets; report raw and repaired counts |
| Semantic validity | No regression in wrong-sense, factual-error, or invented-meaning rates; adjudicate all final cases |
| Editorial preference | At least 60% preference score versus C, counting ties as half, with a 95% interval above 50% |
| Editing burden | At least 25% lower median editing time per accepted clue; also report rejects and total effort per requested clue |
| Recovery clues | Review every requested pair for easier access without answer leakage; report failures by technique |
| Variety | No collapse into repetitive phrasing or a narrower range of techniques/subjects |
| Browser retention | Exported model still passes the semantic gates and retains a measured preference advantage |
| Resource cost | Meets device budgets declared after the initial baseline, before final testing |

Have reviewers compare anonymized, randomly ordered C/D outputs with the same
answer/sense/context and rubric. Group repeated observations by original packet
when computing uncertainty; multiple clues for one answer are not independent
votes. Report technique-specific results even when the aggregate passes. If the
pilot cannot establish a reliable advantage, retain the baseline and collect
better development evidence rather than claiming victory.

No observed severe errors does not prove a zero population error rate. These are
pilot gates, not a claim of autonomous editorial reliability. A critic model
must not be the sole approver, especially if it supplied the training targets.

Human preferences should score correctness/fairness first, then naturalness,
economy, elegance, surprise, and day fit. Do not optimize ROUGE, teacher agreement,
LLM self-confidence, or clue-to-answer accuracy as substitutes for enjoyment.

Next prepare ten fresh 15x15 puzzles in five matched baseline/specialist pairs,
using comparable fill quality and one difficulty band. Do not show a solver the
same answer grid twice; reserve same-grid comparisons for editorial inspection.
Review every clue before household play and record every correction, then compare
fresh solving experiences without model labels or advance answers.

Record unfair crossings, forced answers, dull stretches, memorable clues, overall
enjoyment, and desire to start another puzzle. Track total editing effort and
generation failures. Ten puzzles supply qualitative product evidence, not strong
statistical proof. Expand the playtest only after diagnosing the first batch.

## 12. Theme training and preference learning come later

Theme examples require a separate output contract: rule, complete parallel answer
set, lengths, revealer when appropriate, and a concise explanation for each member.
Validate naturalness and rule consistency before testing crossability. Use held-out
theme families and whole-set review; do not treat a bag of related nouns as a theme.

Start with a few dozen reviewed theme sets as a development benchmark and prompt
library. That is not automatically enough data for effective theme fine-tuning.
Continue with a stronger offline model if it produces better themes while the
small specialist handles routine clue work. Both roles remain proposals, with
deterministic source and construction checks afterward.

Save real editorial preferences as chosen/rejected pairs with reasons. If stable
judgments accumulate, test a small reranker before preference-tuning the generator.
DPO or another preference method needs a separate experiment and regression gates;
do not start reinforcement learning against a reward made from the current fill
score or an LLM's own praise.

Keep household interests and memories in the inspectable profile. Do not train a
new personal adapter after each puzzle: reset, attribution, sparse feedback, and
forgetting become harder without evidence that weights improve personal fit.

## 13. Execution sequence and deliverables

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 0. Define and measure | Rubric, source ledger, development/final split manifest, A/B/C baselines | We can name and count the actual clue failures |
| 1. Prove deployment | Synthetic adapter through merge/export and the real browser worker | Custom artifact loads and produces validated output, or experiment is explicitly offline-only |
| 2. Curate pilot | 500 accepted training examples plus rejection fixtures and split audit | Grounding, context, permissions, and duplicate groups are reviewed |
| 3. Train narrowly | Smoke report, up to two substantive adapter runs, saved checkpoints/configs | Improvement on development cases without regression in basic instructions |
| 4. Judge once | Locked C/D/F comparison and raw output archive | Promote, continue on new development evidence, or reject against declared gates |
| 5. Prove enjoyment | Ten fresh reviewed puzzles and household feedback | Better clues translate into a desirable solving experience |
| 6. Scale selectively | 5k+ data tranche, catalog production, optional theme/ranker experiment | Additional data improves accepted yield or editing burden on new held-out cases |

Reusing an inspected final test for later model selection turns it into development
data. Keep its historical report and create a fresh locked set for the next final
decision. Maintain cumulative regression cases separately.

Proposed future paths, to create only as their phases are implemented:

```text
tools/model-training/             # isolated training/export tools and lockfile
tools/model-training/configs/     # pinned data/model/training configurations
tools/clue-evals/                 # grading, split audits, blinded review exports
docs/model-training/              # source decisions, model cards, measured reports
<private artifact directory>/     # licensed examples, outputs, adapters, weights
```

Each run receipt identifies the base model and tokenizer revisions, dataset and
split hashes, task/prompt versions, adapter settings, optimizer/seed, tool versions,
checkpoint, hardware, measured resources, evaluation version, and export digests.
Store only synthetic fixtures and suitable aggregate reports in the repository;
private prompts, training rows, and model weights are not static site assets.

Integrate accepted outputs through plan 13's catalog and batch ports. Preserve
the same clue validators for untuned and tuned models. A model version never
grants a clue automatic acceptance. Promote the offline catalog model and the
browser runtime model separately, with independent rollback decisions.

## Decision to make after the pilot

- **Fine-tune wins:** expand reviewed examples and promote only the proven role.
- **A larger untuned model wins:** use it within measured resource limits.
- **Reranking/catalog curation wins:** invest there and keep the generator simple.
- **Only offline generation improves:** ship the reviewed catalog; retain the
  current approved on-device path for remaining semantic work.
- **Nothing improves enjoyment:** inspect vocabulary, crossings, themes, and
  editorial labels before spending more on training.

The useful end product is a growing supply of crosswords worth opening. A trained
model earns its place by improving that supply and reducing the work needed to
maintain it.
