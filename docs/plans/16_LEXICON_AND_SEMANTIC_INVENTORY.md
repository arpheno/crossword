# Lexicon and semantic inventory: research review and implementation plan

Status: proposed implementation plan, 2026-09-05. This document reviews the
user-supplied Gemini report against primary sources and the current working tree.
It does not implement a new lexicon or approve a public data release.

Adopt a layered vocabulary inventory with explicit meanings, source receipts,
independent familiarity signals, and a small editorial correction loop. Start
with Crossword Nexus CWL as a candidate source, ESDB for spelling and grammatical
evidence, selected Wiktionary senses, and narrowly selected Wikidata assertions.
Use wordfreq as an optional, dated familiarity feature. Prove the path through
one fully reviewed accessible 15x15 puzzle before expanding the inventory.

The report supplies useful acquisition and curation ideas. Its numerical
thresholds, performance promises, legal guarantees, and example records are not
ready to become requirements.

This is the lexical implementation companion to
[plan 13](13_MEANINGFUL_PERSONALIZATION_AND_CLUE_CATALOG.md) and the
[editorial pilot in plan 15](15_EDITORIAL_GATES_AND_HOUSEHOLD_PILOT.md).
[Plan 12](12_RUST_WASM_CONSTRUCTION_ENGINE.md) still owns search-engine promotion;
[plan 14](14_SPECIALIZED_CROSSWORD_MODEL_TRAINING.md) still owns training. Preserve
the static PWA, required on-device model, existing solver interface, and local
household privacy boundary.

## 1. What this research adds

| Contribution | Existing project direction | New actionable work |
| --- | --- | --- |
| Layered lexical sources | Licensed inventory and independence from provider archives were already planned | Verify actual CWL/ESDB artifacts and introduce reproducible adapters |
| Semantic grounding | Stable senses, facts, and catalog-first clueing already belong to plan 13 | Implement source-to-sense reconciliation, morphological links, and field-level provenance |
| Explainable lexical scoring | Current code has heuristic preferences | Store raw signals separately; compare source scores and familiarity without conflating eligibility |
| Failure-driven curation | Editorial review already belongs to plan 15 | Capture useful pre-failure domain evidence and prioritize bounded review batches |
| Contributor phrases | Generated-answer records already belong to plan 13 | Add reviewed phrase evidence and private household scope to that record lifecycle |
| Separate construction/semantic exports | Worker boundaries already exist | Export compact fill records and fetch only the semantic records needed for clue work |

The next milestone is a better vocabulary foundation and a complete review loop.
It does not require a new solver, a full knowledge graph, model training, or a
large editorial dashboard.

## 2. Source review and corrections

Input title: *Lexical Architecture and Semantic Inventory Design for Autonomous
American-Style Crossword Generation*. SHA-256 of the supplied text:

```text
d583cfdd2a2e68224700b15fa9085932fe9de88c7f2a6a4967e97ac3e05b240a
```

The text contains unresolved citation markers such as `[cite: 2]`, named papers,
and some source URLs, but no complete claim-to-evidence bibliography. The checks
below cover consequential decisions, not every assertion in the report.

### Candidate sources

| Source | Verified finding | Implementation decision |
| --- | --- | --- |
| Crossword Nexus CWL | The upstream repository distributes scored `word;score` records under MIT; the author's launch post explicitly permits use of the list. [Repository](https://github.com/Crossword-Nexus/collaborative-word-list), [license](https://raw.githubusercontent.com/Crossword-Nexus/collaborative-word-list/main/LICENSE), [author statement](https://crosswordnexus.com/blog/2021/06/08/the-collaborative-word-list/) | First scored candidate pool. Pin bytes and notices; retain upstream scores as source-specific evidence. Licensing does not certify every entry's quality or establish that every upstream editorial decision was independent of published puzzles. |
| SCOWL / ESDB | The current project is ESDB, with spelling variants, basic POS/inflections, and spaced or hyphenated compounds. Size 60 is the maintainer's conservative spellchecking recommendation, not a zero-error theorem. [Project documentation](https://github.com/en-wl/wordlist) | Pin a revision and American dialect/variant settings. Use spelling membership as evidence, not a universal intersection filter that deletes names and phrases. |
| ESDB terms | The current copyright file distinguishes generated speller lists from richer database-derived exports, with additional source notices potentially relevant to POS and other subsets. [Copyright](https://raw.githubusercontent.com/en-wl/wordlist/v2/Copyright) | Preserve the exact applicable notices. Do not label the entire source `BSD-3-Clause` or copy Gemini's fixed license enum. |
| wordfreq | Its README says the frequency data reflects language through approximately 2021 and is unlikely to be updated. The library supplies tokenization-aware estimates, including multi-token queries. [README](https://github.com/rspeer/wordfreq) | Optional familiarity baseline; retain raw value, package version, lookup form, and missing-data state. It cannot establish current cultural relevance or phrase idiomaticity. |
| wordfreq terms | Code is Apache-licensed; distributed data includes CC BY-SA terms and source attribution obligations, including SUBTLEX. [NOTICE](https://raw.githubusercontent.com/rspeer/wordfreq/master/NOTICE.md) | Include an explicit derived-data packaging decision and notices. An exported number is not automatically a provenance-free value; retain an option to build without this feature. |
| Kaikki / Wiktextract | The suggested 3.0 GB postprocessed English file is deprecated. The raw English-edition dump includes many languages; the inspected page lists 22.9 GB raw / 2.6 GB gzip, based on the 2026-08-05 dump. [English download notice](https://kaikki.org/dictionary/English/index.html), [raw downloads](https://kaikki.org/dictionary/rawdata.html) | Stream the supported raw format, filter English entries, and retain only target forms. Pin dump/extractor versions and hashes. These sizes are observations, not permanent expectations. |
| Wiktionary content | Entry text has CC BY-SA/GFDL reuse conditions; embedded external quotations or media may have separate terms. [Copyright information](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) | Begin with selected glosses, tags, and form relations. Exclude quotations/media from the first export; do not infer data rights from Wiktextract's software license. |
| Wikidata | Structured data in the main/property/lexeme namespaces is CC0; this does not mean every assertion is correct or current. [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) | Resolve a small selected set of QIDs and claims. Preserve statement/revision IDs, qualifiers, references, and dates; postpone full-dump ingestion. |
| Spread the Wordlist | The site states CC BY-NC-SA 4.0, permits attributed use in free products, and explicitly permits selling puzzles made with the list. [Distribution terms](https://www.spreadthewordlist.com/) | Keep it out of the default bundled foundation under the proposed distribution policy. Reject Gemini's blanket claim that any potentially commercial project or sold puzzle is necessarily forbidden. |
| Broda / unspecified mirrors / fallback lists | Gemini does not establish the exact rights and artifacts for every fallback | No automatic promotion. A mirror is not a rights grant, and WordNet or another fallback still needs its own pinned receipt and notices. |

The CWL recommendation survives verification, but its freshness argument needs
qualification. A read-only parse of the
[pinned upstream artifact](https://raw.githubusercontent.com/Crossword-Nexus/collaborative-word-list/b51b2ad6876c1dc3f9df212e1ed8535fc9e4770a/xwordlist.dict)
on 2026-09-05 found:

- Revision: `b51b2ad6876c1dc3f9df212e1ed8535fc9e4770a`.
- Artifact: 8,301,868 bytes; SHA-256
  `a945a839a5f1e6f48caf9c8de446e5cd85f3567d7f62afcf54c6b738e8906ff4`.
- 567,657 parseable records, integer scores spanning 0–100.
- 509,173 records match ASCII A–Z and lengths 3–15; 230,500 of those have raw
  scores at least 50. This is a parser count, not an eligible/grounded count.
- The upstream history identifies the last word-list edit as 2023-02-12,
  commit `2efe76e11ef311315e76d59700752733d69733d7`.

The list was inspected in memory and was not added to the repository. These
observations provide a reproducible acquisition candidate, not production
clearance or a fill benchmark. Both CWL and wordfreq need a separate route for
new phrases and names.

### Legal conclusions to replace with a concrete source policy

Creative Commons describes NonCommercial in terms of the purpose of the actual
use; a possible future business model alone does not settle the question.
[CC's FAQ](https://creativecommons.org/faq/#does-my-use-violate-the-noncommercial-clause-of-the-licenses)
also distinguishes collections, adaptations, and applicable database rights.
Browser-memory imports do not themselves resolve licensing questions.

German [UrhG §87a](https://www.gesetze-im-internet.de/urhg/__87a.html) defines
protected databases through qualifying investment;
[§87b](https://www.gesetze-im-internet.de/urhg/__87b.html) addresses the rights in
their reuse. Citing these provisions does not prove that every word-list use is
infringement, or that the proposed hybrid stack guarantees compliance.

Record decisions separately for acquisition, build-time use, redistributed data,
clue/catalog derivatives, future training, and private household contributions.
Preserve attribution with the actual released artifacts. Proposed packaging
boundaries help inspect obligations; they are not a device for eliminating them.
The first acquisition slice prepares the evidence required by the project's
existing source-review decision before any public release. Planning can proceed
without settling every possible future monetization model.

### Technical claims that must not become requirements

| Report claim/design | Problem | Replacement |
| --- | --- | --- |
| CWL intersected with SCOWL guarantees a clean modern lexicon | A spelling list is not a complete phrase/name inventory or a semantic validator | Union candidates with category-specific evidence; report membership and exclusions |
| At least 250,000 high-scored entries guarantees fast 15x15 fills | No transferable benchmark establishes that threshold | Measure this engine, eligible set, layout bank, device, and policy |
| Ginsberg/Wallace establish the proposed construction performance | The cited work primarily concerns solving existing clued puzzles | Use it for algorithmic context, not construction-yield guarantees; [Wallace et al.](https://aclanthology.org/2022.acl-long.219/) explicitly studies solving |
| Score 50 has a universal meaning | Upstream list scales and this project's scores differ | Keep raw values and a versioned mapping; `ingrid_core`'s default 50 is a configuration, not a universal quality law. [CLI documentation](https://github.com/rf-/ingrid_core) |
| Zipf is bounded to 1–7 and phrase frequency equals the rarest token minus 0.25 | The library describes a broader practical range; token familiarity does not establish a phrase | Use the pinned library on display/token forms, preserve missingness, and require separate phrase evidence |
| Composite weights/tiers are calibrated | The weights sum to 0.8, the normalized term lacks an upper clamp, and examples lack a reproducible CWL mapping | Compare simple explicit rankers before selecting a calibrated policy; do not require a bell-shaped score distribution |
| Rare trigrams or vowel-heavy short words establish bad fill | Length bias and legitimate names, abbreviations, and loanwords create false positives | Initially diagnostic only; use adjudicated negative/positive cases before any exclusion policy |
| A minus-100 score implements a ban | The declared editorial adjustment range is minus-50 to plus-50; preference must not override exclusion | Independent eligibility state with reasons, review history, and scope |
| Slot centrality favors crossings with long words | `1 / log2(L + 1)` actually decreases with length | Start from observed domain scarcity/failure counts; test whether any structural weighting adds value |
| Review candidates from a failed empty domain | An exhausted domain contains no candidates | Record pre-deletion domains and elimination reasons, plus bounded candidate retrieval for the recorded pattern |
| 85% semantic coverage means verified meanings | A parsed gloss is evidence, not editorial verification | Report extracted, resolved, approved, and actually used coverage separately |
| Grounding eliminates hallucinations | Context does not guarantee the model uses the intended sense or only supported facts | Validate and independently review selected clues and nudges under plan 15 |
| 40 engineering hours, 10 editorial hours, and exact yield/coverage counts | No measured basis; the text also alternates 8%/10% concession limits and 35–45%/85%/90% yields | Scope milestones by output; establish effort and yield baselines before setting targets |
| A universal 25 MiB fill budget and 512-token clue context | Neither is demonstrated for this runtime/device/batch size | Measure full memory and token budgets, including copies, bitsets, prompts, and outputs |
| Zero overlap with NYT answers proves independence | Ordinary vocabulary inevitably overlaps; overlap does not identify derivation | Audit source/transformation lineage and absence of provider-derived scores/content |

The current [Crosswordsmith documentation](https://github.com/ned2/crosswordsmith)
reports engine- and mask-specific performance and memory limitations. It is
useful comparison material, but it does not justify Gemini's general sub-30-second
claim for this browser constructor.

The eight synthetic records are illustrative only. In particular, `UNPIN` is
incorrectly marked as a plural of `PIN`; prefixal derivation and grammatical
inflection need distinct relations. `EMPANADA` is admitted at a stated Zipf value
below the report's later loanword floor. Placeholder hashes, invented external
IDs, and future-dated receipts are not real provenance. Recreate fixtures from
verified examples and original annotations instead of importing these records.

## 3. Current repository integration points

This is a 2026-09-05 working-tree snapshot; several files have concurrent changes.
Re-read them before implementation and preserve unrelated work.

| Current implementation | Consequence for this plan |
| --- | --- |
| `scripts/build-fill-lexicon.mjs` and `packages/construction/data/fill-lexicon-v1.json` emit 227,485 forms from the macOS `web2` list | Preserve as a labeled laboratory baseline. Replace platform-specific acquisition with pinned source adapters. Its 1934/public-domain assertion needs evidence, not repetition as a cleared fallback. |
| `packages/construction/src/lexicon.ts` uses staples/trigraphs, optional `frequencyPrior`, and generated `web2:WORD` IDs | Add a versioned inventory loader and explicit score mapping. Existing `0..1` preference remains distinct from eligibility and editorial approval. |
| `packages/construction/data/freq-prior-v1.json` describes counts from 14,576 NYT grids and marks them private | Record this input and every derivative as laboratory-only pending replacement. |
| `apps/web/src/constructionClient.ts` fetches `/data/freq-prior-v1.txt`; that file exists under `apps/web/public/data/` | Immediate release-boundary defect: a manifest comment does not keep bytes out of public assets. Remove the default dependency and enforce output checks in the implementation slice. |
| `npm run scan:content` runs `scripts/scan-forbidden-content.mjs` with `scripts/forbidden-content.json` | This is the active release scanner; it checks configured text signatures, not complete data lineage. Extend this gate rather than only updating the older Python scanner under `tools/content_scan/`. |
| `tools/lexicon/source-ledger.json` covers an older 78-answer external-list artifact with `NOASSERTION` | Extend the ledger to actual current inputs, score features, semantic sources, and derived artifacts. Do not silently relabel old records as cleared. |
| `constructPuzzle.ts` falls back to `web2:WORD` as an intended sense | Replace in the new inventory path with an actual sense choice or explicit unresolved state; preserve old saved-puzzle compatibility. |
| `clueCatalog.ts` supports answer/sense lookup but can fall back to generic answer entries | A generic entry cannot imply that a specific dictionary sense was verified. Carry evidence for the selected clue. |
| `packages/model-runtime/src/broker.ts` already has batch shapes, while the browser adapter forwards serial calls | Extend these boundaries with grounding; coordinate the wiring with plan 13 rather than creating a second clue API. |
| `packages/construction/src/quality.ts` weights shape-derived terms at 72%, lexical threshold counts at 28% | Report lexical distributions and semantic coverage directly; a higher current aggregate score is not evidence of improved vocabulary. |
| ADR 0009 admits ASCII A–Z candidates and first-wins surface deduplication | Keep A–Z, lengths 3–15 for this slice. Digits/rebuses and 21x21 need separate contracts; do not copy Gemini's A–Z/0–9 normalizer. |

Public-build checks must cover the final artifact and provenance of generated
catalogs/frozen fills as well as source filenames. Rebuilding a file under a new
name or removing its receipt does not make it independent. Preserve private
legacy continuity data; do not delete archives or rewrite history as part of
this implementation.

## 4. Inventory design

Extend plan 13's records in a proposed ADR before changing public/persisted
formats. Avoid introducing a parallel `schema_version: 2.1.0` model copied from
the report.

### Separate identity, evidence, ranking, and approval

- **Answer form:** normalized grid spelling, length, and normalization version.
  A surface is the solver's uniqueness key, not the identity of a meaning.
- **Lexeme:** display spelling, original spacing/case/diacritics, language,
  category tags, lemma and separate inflection/derivation relationships.
  `POLISH` can lead to different lexical records; normalization must not merge
  their senses. Categories such as phrase, loanword, and inflection can overlap.
- **Sense:** stable local ID, lexeme ID, POS/morphological features, gloss,
  locale/register, source pointers, revision, and evidence/review status.
- **Fact:** entity and statement identity, property, typed value, qualifiers,
  references, snapshot date, validity period if known, and adjudication state.
  An occupation property alone does not support an arbitrary biographical clue.
- **Source receipt:** exact artifact URL/revision/hash, extractor and transform
  versions, upstream record locator, license expression or documented custom
  terms, attribution, permitted-use decision, and derivative lineage.
- **Editorial decision:** target record/sense, action, reason, reviewer, policy
  version, time, and the evidence snapshot reviewed. A score boost is not an
  approval receipt.
- **Signals:** raw source score, spelling evidence, nullable frequency estimate,
  phrase/entity evidence, editorial annotations, and diagnostic flags.
- **Readiness:** keep rights eligibility, lexical acceptability, semantic
  grounding, and clue readiness separate. Reuse plan 13's `catalog-ready`,
  `runtime-required`, and `quarantined` distinctions at the appropriate layer.

Imported senses may have source identifiers but cannot be assumed stable across
every dump. Wiktextract documents optional sense IDs, QIDs, page links, and
examples. [Schema documentation](https://github.com/tatuylonen/wiktextract)
Maintain a deterministic import key and a persistent local identity map. Record
aliases/tombstones and flag changed or ambiguous senses for reconciliation;
never silently transfer a clue approval or learner history to a different sense.

### Normalization and meaning rules

Preserve source strings before normalization. Use the domain's normalization
contract and explicit permitted transformations; reject unsupported digits or
characters with a reason instead of silently stripping them into a different
answer. Test accents, apostrophes, hyphens, spacing, capitalization collisions,
and phrase forms. Do not infer word breaks from CWL's concatenated spelling.

Inflection links must preserve the placed form's tense/number and its intended
sense. A plural or past-tense answer cannot simply inherit an unchanged lemma
clue. Missing POS, malformed source entries, conflicting facts, and uncertain
entity matches stay explicit. Prefer existing QID/sitelink evidence over matching
names by string; unresolved names can be reviewed manually in the pilot.

A household phrase can carry an original intended meaning without an invented
Wikidata fact. Factual claims need supporting evidence; family-specific facts
carry private attestations and remain private. Model suggestions enter review,
and neither a theme lock nor a high source score bypasses publication review.
Do not require every ordinary idiom to have a separate factual assertion.

### Scoring policy for the first experiments

Initially compare source-score ranking with source-score plus wordfreq ranking
over the **same eligible candidates**. Preserve scores on their upstream scale;
map to the existing finite `0..1` kernel preference through an explicit versioned
adapter. Report all components and missing values. Do not fabricate a Zipf value
of 3.5 for missing words.

Keep phrase/name approvals, hard exclusions, and unresolved semantics outside
the arithmetic. An unfamiliar loanword is not automatically invalid; a high
frequency estimate does not validate a concatenation of common tokens. Maintain
a reviewed connector set, record audience-sensitive concerns, and let plan 15
evaluate their actual clues and crossings.

No automatic score-floor reduction on timeout. Retry within the declared budget,
try another approved layout, or propose a versioned policy change. If a score
floor is tested, identify it as a separate domain-size experiment and record
which categories and slot lengths it removes.

### Build and runtime boundary

Build offline into SQLite or another streaming intermediate store. Pin sources
and transforms; keep retrieval timestamps in receipts outside the deterministic
content digest. With identical pinned inputs and decisions, the data payload and
its manifest content must reproduce byte-for-byte.

Export a small versioned manifest, construction rows, and independently indexed
semantic shards. Ship license/attribution material with exported data. Keep a
surface-to-lexeme/sense mapping so the kernel sees one candidate per spelling
while application code can select among legitimate meanings. Pass explicit
`senseId`, gloss/POS, supported fact IDs, and evidence version to clue work;
do not stuff unrelated senses into one primary-definition prompt.

Start with a simple validated JSON/JSONL adapter to the existing `FillCandidate`
contract. Binary packing is a later measured optimization, not a prerequisite.
If implemented, specify byte order, index/offset units, array types, checksums,
record IDs, and score scale; JSON serialization of typed arrays is not itself a
binary wire format. Measure JS heap, worker copies, bitsets, Wasm memory where
used, cache, and model memory separately. The fill worker does not need all
glosses, usage examples, or full source receipts resident in its hot loop.

## 5. Ordered implementation packages

Ownership below is a proposed responsibility boundary, not an instruction to
start parallel agents. Each package should be split into the repository's small
checkpoint commits where necessary. Coordinate changes to active files with
their current owners and follow required hooks; preserve existing staged work.

| Package | Responsibility / files | Dependencies | Completion evidence |
| --- | --- | --- | --- |
| L0 — Enforce the public-data boundary | `apps/web/src/constructionClient.ts`, `apps/web/public/data/`, `scripts/scan-forbidden-content.mjs`, `scripts/forbidden-content.json`, relevant release tests | None; implement first | Default app neither fetches nor ships the private prior. Inspect built output and service-worker/cache manifests; test rejected unapproved data assets and missing provenance. Audit frozen/catalog derivatives. Keep the local legacy bridge usable. |
| L1 — Source decisions and receipts | `tools/lexicon/source-ledger.json`, `tools/lexicon/README.md`, new source lock/notices and proposed ADR | Can prepare while L0 is scoped; acceptance before production exports | Verify pinned CWL and ESDB settings/terms, optional wordfreq packaging, Kaikki text subset, and selected Wikidata use. Unknown sources fail production export; no placeholder hashes. |
| L2 — Reproducible candidate import | New `tools/lexicon/` adapters/build CLI; connect `scripts/build-fill-lexicon.mjs` through a versioned path | L1 | CWL/ESDB union with source memberships, collision report, category/length counts, deterministic output, and rejected-record reasons. No expected 123,000/145,000 count hardcoded across revisions. |
| L3 — Real senses and a small review pack | Domain inventory types; `tools/lexicon/` semantic importer/reconciliation; selected entity importer and original annotations | L2 and the proposed record contract | First a stratified sample covering words, phrases, names, inflections, abbreviations, and loanwords; then enough grounded candidates/alternatives to complete one approved layout. All placed answers have an approved intended meaning or an explicit valid form-level/theme record before publication. |
| L4 — Loader and grounding integration | `packages/construction/src/lexicon.ts`, application catalog/construction owners, model broker/worker adapters | L2/L3; coordinate with plan 13 | Real IDs survive fill → sense selection → clue catalog/batch request → review. Unresolved senses cannot masquerade as `web2:WORD` evidence. Preserve cancellation, bounded batches, saved-puzzle compatibility, and model lifecycle. |
| L5 — Ranking and measured baseline | `tools/lexicon/` feature/scoring CLI, construction diagnostics, existing measurement scripts | L2; meaningful semantic quality comparison also needs L3/L4 | Paired same-domain ranker comparison, category/length coverage, full failures and runtimes; no unvalidated hard trigram/vowel gates. Store policy version and raw signals. |
| L6 — Failure-driven review | Narrow instrumentation in `packages/construction/src/csp.ts`; triage CLI and review import/export under `tools/lexicon/` | L3/L5 | Bounded reproducible traces and one 100–250-entry review batch with reasons; re-run held-out layouts. Prioritize actual marginal benefit, not the report's untested centrality formula. |
| L7 — Reviewed pilot and release candidate | Plan 15 report/queue integration; inventory manifest and artifact checks | L0–L5 for first puzzle; L6 informs expansion | One fresh reviewed puzzle, then ten, with source lineage, selected meanings, clue/nudge reviews, edit effort, all generation failures, and household feedback. Publish only the exact approved snapshots. |

### First implementation slice

Start with **L0 and L1**, then a narrow L2/L3 vertical slice. Prepare a source
decision packet using the verified CWL pin, an ESDB American size-60 extraction,
and a small original/appropriately licensed semantic pack. Use a stratified
200–500-record sample to debug ingestion and annotation; this is an engineering
sample size, not a claim that 500 records can fill arbitrary 15x15 grids.

Expand candidate coverage against one approved original layout and its needed
alternatives. The first reviewable deliverable contains the source receipts,
candidate import report, actual answer/sense records, and one complete candidate
passed through plan 15's review workflow. If the first attempt cannot fill,
retain the failure report and prioritize the observed missing domains. A
handpicked successful fill alone does not establish general construction yield.

Do not make full Wikidata ingestion, all 50,000 top-word glosses, binary export,
training, or a new editorial UI prerequisites for this milestone. The report's
five-day schedule is a scoping suggestion, not a delivery commitment. Measure
download/import and editorial effort during this slice before estimating scale.

### Triage implementation details

Capture layout/slot/pattern IDs, seed, policy version, domain cardinalities before
deletions, bounded candidate samples, and deletion causes. Distinguish lexical
scarcity from incompatible locks, uniqueness conflicts, budget exhaustion, and
search behavior; not every timeout is a dictionary problem.

Rank unresolved candidates using recurrence across failing layouts, uncertainty
in their lexical/sense decision, and estimated review cost. Retrieve candidates
from the permitted reserve pool matching a recorded pattern; verify that any
approved addition helps through reruns. Allocate part of each review batch to
phrases, new entities, and undercovered domains so the queue does not become only
short connector repair. Keep approvals, rejections, and disagreements reusable.

## 6. Experiments and acceptance gates

**E1 — Ranking and candidate breadth.** Establish a new-source baseline with no
NYT-derived prior. Compare raw source ranking against the versioned familiarity
blend on identical candidate sets. Then separately compare category/eligibility
policies. Use fixed original or cleared layouts, fixed seeds, identical engine
settings, and stated device/budgets. Keep development and held-out layouts apart;
do not truncate alphabetically or force equal counts as a substitute for equal
length/category coverage. Private old-run measurements may be historical
context, but are not required production inputs or a reason to retain the prior.

Report completion and editorially accepted yield separately, attempts/retries,
time distributions including censored timeouts, backtracks/domain failures,
memory, lexical category mix, meaning coverage, and editing burden. Freeze the
comparison policy before holdout evaluation. A ten-puzzle pilot is not evidence
for a universal 90% success guarantee.

**E2 — Review value.** Compare frequency-ordered review with failure-driven review
under equal human-time budgets using category-balanced queues and comparable
starting inventories. Start with a small batch and report usable senses gained,
newly completed held-out layouts, quality defects, and minutes spent. Keep
separate experimental branches of the decision ledger to avoid contaminating
one condition with approvals learned in another. Do not demand `p < 0.01` from
one household or repeatedly test until significance appears.

**E3 — Grounded clue usefulness.** Coordinate with plans 13/15: on a stratified
answer set, compare answer-only, sense-grounded, and sense-plus-fact prompts
using the same model and controlled generation settings. Record mismatched
senses, unsupported claims, answer leakage, grammatical mismatch, rejected
clues, accepted primary/nudge pairs, token counts, latency, and human edit time.
Blind editorial conditions where practical. Reject invalid output; a schema
pass and a low-temperature prompt do not establish truth. Escalating model size
is a separate measured choice within the existing architecture.

**Hard completion gates for the pilot:**

- Every shipped data artifact has a verified digest, transform version, source
  lineage, applicable notices, and a recorded distribution decision.
- The public build and default generation path have no provider-derived prior
  dependency; unknown-origin derivatives are not silently grandfathered in.
- All placed pilot answers resolve to reviewed meanings or approved explicit
  form-level/theme records; factual clues point to the assertions that support
  them. Every selected primary clue and nudge receives plan 15 review.
- No unresolved blocking editorial finding enters the reviewed queue; edits to
  facts, senses, or selected clues invalidate the affected approval snapshot.
- Inventory rebuilds preserve identities through documented reconciliation and
  are reproducible from pinned inputs and the decision ledger.
- Relevant parser/schema tests, construction properties for changed behavior,
  worker/application integration checks, artifact scans, and repository gates
  pass. Performance, semantic coverage, and enjoyment are reported as measured
  outcomes, not manufactured passing thresholds.

Roll back by selecting the previous approved inventory/policy pair. If none
exists, disable the reviewed-generation release path while retaining ordinary
solving. Never roll back public output to the private NYT prior, a silent
quarantine bypass, or a dictionary whose source approval is unresolved.

## 7. Evidence from reviewing this plan

The documentation checkpoint ran `make doctor` and the required pre-commit
unit/property, TypeScript/build, staged-diff, and content checks successfully.
Document links, code fences, and whitespace were also checked. No new lexicon,
clue-generation, or fill-performance experiment was run.

The build provided direct evidence for L0: it emitted
`apps/web/dist/data/freq-prior-v1.txt` while the existing release content scanner
reported zero violations. Passing the current signature scan therefore does
not establish provider-independent data provenance. L0 must add an artifact
inventory/receipt check and an explicit negative case for this prior; normal
English word overlap is not an appropriate forbidden-content detector.
