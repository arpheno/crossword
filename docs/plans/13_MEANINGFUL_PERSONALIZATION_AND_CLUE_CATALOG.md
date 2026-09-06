# Meaningful personalization and precomputed clue catalog

Status: product/architecture decision and Luna implementation handoff,
2026-09-04.

## Outcome

Make each puzzle feel chosen for the household rather than generated from a
topic filter. The system should create pleasure first, with learning emerging
through varied retrieval, well-spaced recurrence, interesting explanations,
and occasional productive struggle. It must preserve the broad cultural,
linguistic, scientific, historical, and playful range that makes a crossword a
crossword.

At the same time, remove the current latency cliff in which a filled 15x15 grid
causes roughly seventy serial LLM clue calls. Build a versioned, grounded,
multi-variant clue catalog **ahead of play**, indexed by stable lexeme and sense
IDs. At construction time the application selects a coherent puzzle-wide clue
slate from that catalog. The local LLM remains required for semantic candidate
planning, themes, bespoke wordplay, explanations, and a first-class batched
runtime path whenever catalog clues are missing or not good enough in context;
it is no longer asked to reinvent every routine clue after every fill.

## Decisions

1. **Optimize a whole puzzle, not seventy independent words.** Personalization
   is a constrained slate-selection problem with breadth, delight, learning,
   novelty, clue variety, crossing fairness, and fill quality terms.
2. **Separate preference from knowledge.** “Likes chemistry,” “recognizes
   AUXIN,” and “is good at misdirection clues” are different uncertain facts.
3. **Model sense-level retrieval, not spelling exposure.** Solving `BASS` as a
   fish is not evidence for the musical sense; seeing crossing letters is not
   equivalent to recalling either sense from its clue.
4. **Difficulty is a clue-answer-context property.** It is not a permanent word
   number or an LLM's confidence score. Day, clue mechanism, intended sense,
   locale, crossings, and prior clue exposure all matter.
5. **Precompute generic clue inventory; dynamically compose every unresolved
   requirement.** Dictionary/sense clues can be prepared in a resumable offline
   pipeline. Missing, weak, stale/repeated, theme-dependent,
   puzzle-referential, newly coined, and household-specific clues use the
   on-device model in bounded batches. Catalog presence never forces use of a
   clue that is poor for the actual puzzle.
6. **No opaque learner embedding controls the product.** Sparse vectors may be
   derived for retrieval, but stored profile fields, evidence, uncertainty, and
   effects remain inspectable and resettable.
7. **No “adaptive exam” loop.** A better player does not receive an endlessly
   harder syllabus. Day identity remains stable, broad material remains the
   majority, and users can ask for more comfort, more surprise, or more stretch.
8. **Learning claims require delayed evidence.** Immediate completion and fast
   typing are not proof of durable knowledge. The system measures later
   retrieval with different clues and preserves uncertainty.

## Current-state diagnosis

The repository has useful fragments but not meaningful personalization yet:

- `packages/construction/src/adaptive.ts` stores one global `theta` and a
  word-keyed memory record, then perturbs candidate ranking.
- `LearnerMemoryState.difficulty` is present but does not affect scoring.
- `applyLearnerPreferences` is applied before the live CSP context exists, so it
  assumes zero filled crossing letters and cannot use actual domain entropy.
- the web construction client does not yet supply a durable, inspectable profile;
- the current concept paper overstates what timing and navigation can infer;
- clue requests contain only answer plus an often synthetic `web2:WORD` sense;
- `constructPuzzle` makes one `composeClues` request per entry, serially;
- clue difficulty is model-authored `0..1`, not behaviorally calibrated;
- clue selection distributes mechanisms by entry index, without considering
  answer/sense, crossing fairness, recent clues, or whole-puzzle repetition;
- the laboratory lexicon has 227,485 surface forms but no production sense
  inventory. Generating four clues for every string would turn historical,
  inflected, malformed, offensive, or unclueable material into false product
  coverage.

This plan replaces those shortcuts without discarding the existing worker,
manifest, recipe, lexicon, and clue-ladder boundaries.

## What to retain and reject from the concept paper

Retain:

- crossing state changes the evidential value and effective difficulty of a
  solve;
- word/sense recurrence should be spaced rather than immediately repeated;
- varied retrieval cues can teach more than memorizing one clue-answer pair;
- clue difficulty can change independently from grid fill;
- learner-fit is a bounded search preference, never a validity rule;
- all computation and retained behavior data remain local.

Reject for the first product model:

- millisecond key-hold, inter-key interval, or cursor tracking as a proxy for
  cognitive state;
- labels such as “blind guessing,” “phonotactic deduction,” or diagnosis-like
  ability claims inferred from ordinary play;
- mapping behavior directly into FSRS grades without calibration or confirmation;
- unidimensional `theta` as a summary of crossword ability;
- DKT, GCNs, or other data-hungry neural learner models trained on one household;
- WebSockets, Kafka, backend ingestion, or cloud model training;
- changing a completed crossword topology reactively during play;
- hard-pruning fill domains to an ability corridor, which can damage validity,
  fill quality, breadth, and surprise;
- treating wall time, abandonment, navigation, or voice use alone as evidence
  of knowledge or enjoyment.

The privacy boundary is stronger and the inference claims are deliberately
smaller: collect an entry-level evidence summary needed for named features, not
a biometric exhaust stream.

## Product contract: delight with a learning current

### Stable crossword identity

- The puzzle is fully constructed, symmetric, and immutable when play begins.
- Monday through Saturday retain distinct editorial contracts. Personalization
  moves within a day's band; it does not relabel a Thursday as Monday.
- Broad language and general knowledge remain the plurality of every ordinary
  puzzle.
- Crossword staples remain present in a controlled amount so repeated grid
  vocabulary becomes fluent rather than mysteriously disappearing.
- Long entries and central clues carry more puzzle identity than three-letter
  glue; personalization budgets reflect that asymmetry.
- No contiguous crossing cluster may contain only stretch material for either
  named player in a household puzzle.

### Starting composition prior

Keep the existing recipe as an explicit, testable prior rather than a hidden
recommendation loop:

| Role | Starting share | Function |
| --- | ---: | --- |
| Broad crossword/world/language material | 45% | Surprise, common culture, word intelligence, and breadth |
| Adjacent to demonstrated interests | 20% | Personal recognition without topic saturation |
| Spaced reinforcement | 15% | Revisit due lexeme-senses using varied clues |
| Controlled crossword staples/glue | 15% | Grid quality and useful crossword fluency |
| Deliberate exploration outside profile | 5% | Serendipity and profile discovery |

These are selection targets with tolerances, not candidate-level score weights.
A 78-entry puzzle does not need exact integer percentages. Theme days may reserve
theme slots first; the remaining fill is balanced against the same intentions.

### Challenge distribution

Treat these as initial hypotheses to calibrate with real play:

- **anchors:** predicted accessible with little help; keep the grid inviting;
- **productive:** uncertain but realistically retrievable through clue plus fair
  crossings;
- **stretch:** unfamiliar or obliquely clued, sparse and well-crossed;
- **recovery:** direct/nudge variants available around predicted hard clusters.

Do not maximize estimated difficulty or learning gain. Constrain frustration
risk first, then optimize delight and learning within that safe set. A puzzle
can be a success because it was funny, elegant, or surprising even if it taught
no scheduled word.

### Gentle explicit controls

Offer controls whose meaning a player can understand:

- `Comfort / Balanced / Stretch` for the next puzzle;
- topic preferences with `more`, `normal`, `less`, and `exclude` rather than an
  inscrutable percentage;
- clue-style preferences such as definitions, trivia, wordplay, and lateral
  misdirection;
- locale/language tolerances and hard content exclusions;
- after-puzzle signals: `Loved this`, `More like this`, `Too niche`, `Unfair`,
  `Already knew it`, and `Worth remembering`.

Do not interrupt individual entries for ratings. Feedback is optional, local,
and higher-confidence than inferred preference when it exists.

## Personalization model

### Separate ledgers

```ts
type PlayerProfileV1 = Readonly<{
  schemaVersion: 1;
  profileId: string;
  consent: 'disabled' | 'local-personalization';
  explicit: ExplicitPreferencePolicy;
  senseMemory: Readonly<Record<SenseId, SenseMemoryEstimate>>;
  conceptAffinity: Readonly<Record<ConceptId, AffinityEstimate>>;
  mechanismSkill: Readonly<Record<ClueMechanism, SkillEstimate>>;
  localePolicy: LocalePolicy;
  recentAnswers: readonly RecentAnswerExposure[];
  recentClues: readonly RecentClueExposure[];
  evidenceSummary: EvidenceSummary;
  updatedAt: string;
}>;
```

The ledgers mean different things:

- **explicit policy**: user-stated interests, exclusions, desired challenge, and
  clue-style choices; authoritative until changed;
- **sense memory**: uncertain retrievability of an encountered lexeme-sense;
- **concept affinity**: preference/enjoyment evidence, never automatically
  called expertise;
- **mechanism skill**: ability to solve clue forms such as direct definition,
  fill-in, trivia, pun, abbreviation, or oblique wordplay;
- **locale policy**: familiar, tolerated, or excluded language/cultural regions;
- **recency ledgers**: answer and exact-clue fatigue, which decay independently;
- **evidence summary**: counts and confidence needed to explain why a profile
  field exists without retaining raw interaction streams forever.

Only encountered IDs are stored. The profile never allocates records for the
whole lexicon or clue catalog.

### Preference is not mastery

An entry can yield several distinct observations:

- the player probably retrieved a sense;
- the player benefited from orthographic scaffolding;
- the clue mechanism appeared approachable or difficult;
- the subject may be enjoyed, disliked, or merely known;
- the exact clue/answer pair has recently been seen.

None implies the others. Completion cannot silently increase topic affinity;
time spent cannot silently mean enjoyment; an explicit `Loved this` must not
pretend the answer was known.

### Entry-level evidence event

Persist a small semantic event when an entry attempt reaches a named outcome,
not raw key telemetry:

```ts
type EntryEvidenceEventV1 = Readonly<{
  schemaVersion: 1;
  eventId: string;
  profileId: string | 'household-unattributed';
  puzzleId: string;
  entryId: string;
  answerId: AnswerId;
  senseId: SenseId | 'unresolved';
  clueId: ClueId;
  mechanism: ClueMechanism;
  outcome: 'retrieved' | 'corrected' | 'revealed' | 'unresolved';
  inputSource: 'keyboard' | 'voice' | 'paste' | 'mixed';
  crossingsAtFirstCorrect: CrossingEvidence;
  assistance: readonly ('nudge' | 'check' | 'reveal')[];
  activeTimeBand: 'brief' | 'ordinary' | 'long' | 'unknown';
  wrongCommittedAnswers: number;
  occurredAt: string;
}>;
```

`CrossingEvidence` records both the visible crossing count and a deterministic
information-reduction estimate from the eligible lexicon domain. Two common
letters and one rare initial do not provide equal scaffolding.

High-resolution timings may be aggregated ephemerally into broad bands after
idle removal, then discarded. Raw audio is never stored. Voice transcripts are
not profile evidence and default to no retention. Joint household play remains
`household-unattributed` unless players explicitly identify who supplied an
answer.

### Evidence strength

Let \(D_0\) be the eligible answer domain for the clue's length and \(D_p\) the
domain after the letters visible when the entry first became correct. Define
orthographic information assistance:

\[
I_{cross} = 1 - \frac{\log(1 + |D_p|)}{\log(1 + |D_0|)}
\]

This is zero with no domain reduction and approaches one when crossings nearly
determine the answer. It is a feature, not a psychometric truth.

A conservative positive retrieval-evidence weight can begin as:

\[
e^+ = 1[outcome=retrieved]\,(1-I_{cross})\,w_{help}\,w_{source}
\]

where `reveal` makes `w_help = 0`, nudge/check reduce it, and voice/keyboard are
semantically equal unless calibration proves otherwise. Negative evidence is
smaller and more cautious: one wrong entry may be a typo, clue disagreement, or
crossing error. No single puzzle may sharply change an estimate.

Every factor and cap is versioned. Until replay calibration supports a factor,
its weight is neutral.

### Memory and skill estimates

Start interpretable and sparse:

- use a decaying recall estimate per resolved sense only after enough valid
  evidence exists;
- represent uncertainty explicitly with observation count/effective weight and
  confidence interval, not just one scalar;
- use a simple half-life model \(R(t)=2^{-t/h}\) or an equally inspectable
  Bayesian estimate before attempting full FSRS-style scheduling;
- ship clue/item difficulty priors from catalog calibration, then allow only
  bounded local correction because a household has little data;
- keep mechanism-skill estimates independent rather than forcing one global
  ability `theta`;
- treat revealed material as exposure eligible for later review, never as a
  successful retrieval;
- call an item `due` only when its model and evidence version are known.

The existing `LearnerMemoryState.difficulty` must not survive as a ceremonial
field. It is either replaced by these explicit estimates or connected to a
documented, tested update rule.

### Whole-puzzle utility

For a legal answer/sense/clue candidate \(i\), define normalized estimates:

\[
u_i = w_f F_i + w_d D_i + w_l L_i + w_n N_i + w_s S_i
      - w_r R_i - w_o O_i
\]

where:

- \(F\): base fill/editorial quality;
- \(D\): predicted delight/affinity, with uncertainty bonus for exploration;
- \(L\): expected learning value from due, varied retrieval;
- \(N\): novelty and serendipity;
- \(S\): crossing/scaffolding fairness;
- \(R\): exact-answer and exact-clue recency fatigue;
- \(O\): obscurity/unfairness risk.

This score orders legal alternatives; it cannot override hard eligibility,
crossings, provenance, clue coverage, or day gates. Puzzle selection then adds
slate terms:

\[
U(P) = \sum_{i \in P}u_i
       + \lambda_{coverage}\,Coverage(P)
       - \lambda_{redundancy}\,Redundancy(P)
       - \lambda_{cluster}\,HardClusterRisk(P)
\]

Use an interpretable MMR-style greedy-plus-repair policy initially. Do not add a
contextual bandit until there is enough consented evidence, a stable reward
definition, and an offline replay estimator. `Loved this` and delayed varied
retrieval are different rewards and must not be collapsed into completion time.

### Household fairness

For two named players, build separate predictions and optimize a bounded
max-min term for accessible anchors while using the union of positive interests.
Either player's hard exclusion wins. Do not average two profiles into a person
who exists nowhere.

At minimum:

- each player gets several predicted anchors or shared-interest entries;
- no hard cluster is inaccessible to both;
- reinforcement targets belong to a named player or are omitted from individual
  learning updates when attribution is unknown;
- one expert cannot cause every clue to exceed the other's day band;
- the manifest records the household policy and profile digests, never private
  profile contents.

## Precomputed clue catalog

### Catalog the product lexicon, not every raw dictionary line

The current 227,485-line `web2` artifact is a laboratory spelling list. It is
not a clueable semantic inventory. “Generate clues for every word” must mean
**every production-eligible answer-sense**, after lexical curation—not every
historical surface in that file or proper-looking sequence.

Use coverage tiers:

| Tier | Eligibility | Required catalog coverage | Runtime behavior |
| --- | --- | --- | --- |
| A: core | Ordinary fill on all graduated days | Multiple validated primary clues across difficulty/technique plus one easier nudge per common sense | Usually catalog-only; runtime generation remains available when every stored variant is contextually unsuitable |
| B: extended | Fill when day, crossings, and quality permit | At least grounded direct/standard clues and an easier alternate | Catalog-first; bounded batch enrichment before publication when the selected day/context needs more |
| C: provisional | Candidate/theme exploration and budgeted fill | Stable sense or generated-answer record, incomplete clue ladder | Creates a declared runtime-generation obligation before publication |
| Q: quarantine | Not fill-eligible | Missing/ambiguous sense, unsuitable form, policy concern, or failed clues | Diagnostics/editorial review only |

Clue coverage is known before CSP fill and influences eligibility, resource
planning, and ranking, but it is not an absolute requirement that suppresses
good new material. Every candidate carries `catalog-ready`, `runtime-required`,
or `quarantined`. A recipe sets a bounded runtime-generation budget; ordinary
catalog-ready answers are preferred when editorial quality is otherwise equal.
Long thematic answers proposed by the LLM are expected to be
`runtime-required`: select/lock the coherent theme set, create grounded
generated-answer records, and generate their clue ladders as one checkpointed
batch. Publication—not necessarily fill—waits for successful validation.

If final grid context invalidates every catalog clue for an ordinary answer,
that answer joins the same runtime batch. The constructor may regenerate the
clue, choose another fill, or restart according to a versioned policy; it may
never publish an unsuitable catalog clue or placeholder merely to avoid a model
call.

### Sense-first schema

```ts
type LexemeRecord = Readonly<{
  lexemeId: LexemeId;
  canonicalForm: string;
  crosswordForm: string;
  language: string;
  partOfSpeech: readonly string[];
  inflectionOf?: LexemeId;
  sourceRecordIds: readonly string[];
  policyTags: readonly string[];
  coverageTier: 'A' | 'B' | 'C' | 'Q';
}>;

type SenseRecord = Readonly<{
  senseId: SenseId;
  lexemeId: LexemeId;
  gloss: string;
  partOfSpeech?: string;
  conceptIds: readonly ConceptId[];
  localeTags: readonly string[];
  factIds: readonly FactId[];
  provenance: readonly SourceReceipt[];
  status: 'grounded' | 'limited' | 'unresolved';
}>;

type GeneratedAnswerRecord = Readonly<{
  answerId: AnswerId;
  crosswordForm: string;
  displayForm: string;
  intendedMeaning: string;
  themeRelationship?: string;
  supportingFactIds: readonly FactId[];
  generationReceipt: GenerationReceipt;
  validationStatus: 'accepted' | 'review' | 'rejected';
}>;

type ClueCandidateV1 = Readonly<{
  clueId: ClueId;
  answerId: AnswerId;
  senseId: SenseId | 'form-level';
  text: string;
  ladderRole: 'nudge' | 'direct' | 'standard' | 'oblique';
  technique: ClueTechnique;
  localeTags: readonly string[];
  knowledgeConceptIds: readonly ConceptId[];
  factIds: readonly FactId[];
  difficultyPrior: DifficultyEstimate;
  generationReceipt: GenerationReceipt;
  validationReceipt: ClueValidationReceipt;
  status: 'accepted' | 'review' | 'rejected';
}>;
```

`ladderRole` expresses how the clue is used; `technique` explains what it does.
Do not overload `direct/standard/oblique` with technique. Initial techniques may
include definition, synonym, antonym, contextual fill, grounded fact, word
association, abbreviation, foreign-language, pun, letter/wordplay, and
puzzle-reference. Each technique has its own fairness rules.

Some clues target the written form rather than one dictionary sense. Mark those
`form-level` explicitly; do not fabricate a semantic sense for a letter trick,
prefix, suffix, homophone, or hidden-word clue.

Likewise, a newly generated long theme answer may not have a catalog sense ID.
It receives a `GeneratedAnswerRecord` that states the intended meaning and theme
relationship honestly. Any factual claim still points to approved facts; model
prose is provenance for an idea, not evidence that the idea is true.

### Difficulty model

An LLM-authored number is only a prior. Store uncertainty and facets:

```ts
type DifficultyEstimate = Readonly<{
  priorMean: number;
  priorStdDev: number;
  source: 'editorial-rubric' | 'model-prior' | 'outcome-calibrated';
  sampleWeight: number;
  calibrationVersion: string;
  facets: Readonly<{
    answerObscurity: number;
    requiredKnowledge: number;
    indirectness: number;
    wordplayLoad: number;
    ambiguity: number;
    localeDistance: number;
  }>;
}>;
```

The player-specific solve probability is computed later from clue prior,
resolved-sense memory, concept familiarity, mechanism skill, and actual crossing
information. Conceptually:

\[
P(solve_i) = \sigma(\theta_{mechanism} + m_{sense} + k_{concept}
                       - b_{clue} + a_{crossing})
\]

This is a prediction with a confidence interval, not an ability verdict. Cold
start uses broad priors and day recipes. Local household observations may make
small updates; robust population calibration can only enter a release through
consented, anonymized, separately governed evaluation—not covert telemetry.

### Clue ladder contract

For a cataloged sense, the ladder should offer genuinely different retrieval
routes:

- `nudge`: easier and more explicit than the selected primary, but does not leak
  the normalized answer or a trivial inflection;
- `direct`: fair definition, synonym, contextual use, or grounded fact;
- `standard`: day-appropriate indirection or knowledge/wordplay demand;
- `oblique`: controlled misdirection or lateral mechanism with a defensible path;
- optional post-solve explanation: the intended sense, wordplay derivation, and
  grounded fact attribution.

Do not generate the ladder by mechanically paraphrasing one definition four
times. Varied retrieval cues are part of the learning value and protect against
memorizing a specific clue. The same answer can recur only after its spacing
policy permits it, and preferably under a different accepted clue/technique.

### Ahead-of-time generation pipeline

The catalog pipeline is an offline build tool, not an application backend and
not a runtime database. It runs through the pinned repository toolchain, uses
content-addressed tasks, and writes immutable distributable artifacts plus
review receipts.

```text
licensed lexical/sense/fact sources
              |
       normalize + resolve IDs
              |
   coverage policy / task planner
              |
 checkpointed batched LLM generation
              |
 deterministic validators + alternate-answer retrieval
              |
 bounded critic/rewrite queue + human samples
              |
 difficulty priors / calibration metadata
              |
 content-addressed clue packs + manifest
```

#### 1. Source normalization

- Approve licenses and redistribution requirements before generation.
- Preserve source IDs; assign stable internal IDs from canonical source records,
  not array order.
- Resolve spelling, multiword forms, punctuation, inflection, part of speech,
  senses, concepts, facts, locale, and policy tags.
- Reject or quarantine forms without a defensible clueable interpretation.
- Keep facts as typed claims with citations and expiry/review metadata where
  temporal change is possible.

#### 2. Deterministic task planning

Each generation task contains bounded senses/facts, requested ladder roles and
techniques, locale policy, exclusion examples, schema/prompt version, model
revision, sampling parameters, and a deterministic task seed when supported.

The task key is the digest of canonical task bytes:

```text
sha256(sense bytes + facts + requested roles + prompt renderer/version
       + model revision + inference parameters + validator policy version)
```

Completed task outputs are append-only JSONL/content-addressed files. Rerunning
the pipeline resumes missing or failed tasks; it never regenerates successful
work merely because a later batch failed. No server database is required.

#### 3. Batched generation

- Batch several short, unrelated sense records per model turn while keeping each
  output independently keyed and parseable.
- Benchmark batch sizes for throughput and output-quality degradation; do not
  assume the largest context is fastest.
- Generate surplus candidates, not one “final” clue. Validation/assignment owns
  selection.
- Deduplicate accepted text against the catalog before requesting rewrites.
- Separate generic factual/definition work from techniques needing stronger
  wordplay reasoning.
- Use a pinned, provider-agnostic build adapter. The default should be a local
  model on the developer workstation. Build-time generic source records contain
  no player data under any adapter.
- Record actual model revision, prompt bytes/version, seed support, temperature,
  output digest, duration, and energy/resource batch metadata.

#### 4. Deterministic validation

Reject or route to review on:

- exact, punctuation-insensitive, segmented, or trivial morphological answer
  leakage;
- wrong enumeration, part of speech, number, tense, abbreviation signal, or
  locale convention;
- intended-sense mismatch or a fabricated sense/fact;
- unsupported proper-name/factual assertion;
- circular definitions and answer-family giveaways;
- ambiguous alternate answers of the same pattern/length without a defensible
  disambiguator;
- duplicate or near-duplicate clue surfaces;
- inappropriate, exclusion-tagged, stale, or culturally parochial material;
- an oblique clue without a reproducible explanation path;
- a nudge that is not measurably/evidently easier than its primary clue.

Ambiguity checking is retrieval, not just another yes/no LLM opinion. Index the
eligible answer/sense catalog and retrieve plausible alternative answers for the
clue; deterministic pattern/part-of-speech filters plus an independent judge
then assess whether the intended answer is fair. Preserve the alternatives and
judge receipt for review.

#### 5. Bounded judging and repair

- The drafting model does not approve its own work alone.
- Run deterministic checks first; they are cheaper and auditable.
- Use a separately prompted/configured critic only for named semantic judgments.
- Give each candidate a strict rewrite budget; repeated failure quarantines it.
- Human-review statistically meaningful samples per mechanism, difficulty band,
  source type, locale, and model/prompt version before a pack is promoted.
- Preserve rejected examples for regression tests without distributing unsafe or
  unlicensed source content.

#### 6. Pack and sign

The release artifact contains only accepted records and the provenance required
for their use. Its manifest records:

- schema, pack, lexicon, sense-source, fact-source, prompt, model, validator,
  calibration, and policy versions;
- content hashes and compressed/uncompressed byte sizes;
- counts by coverage tier, sense status, ladder role, technique, locale,
  difficulty band, and rejection reason;
- coverage holes and their effect on day recipes;
- required attribution/license text;
- compatibility range for the application and service worker.

### Static delivery without a backend database

- Ship a small manifest and core Tier A clue pack with the static application.
- Benchmark sharding by stable answer-ID prefix, length/frequency tier, and day
  usage before choosing. A scheme that makes a 78-entry puzzle fetch dozens of
  tiny shards is not acceptable.
- Use content-addressed immutable files with Brotli/gzip at the host and Cache
  API/service-worker versioning in the browser.
- Keep shipped catalog data out of IndexedDB; it is immutable release content.
- Store only locally generated gap clues, local calibration deltas, profiles,
  and event summaries in versioned IndexedDB repositories.
- Prefetch required clue shards while candidate planning/fill runs, then unload
  the model only after all required bespoke/gap work is checkpointed.
- Old JS/new pack and new JS/old pack combinations fail compatibility checks
  before puzzle publication.

Do not decide the shard shape from intuition. Produce a trace from representative
puzzles and compare request count, compressed bytes, decompression time, peak
memory, cache hit rate, and offline behavior.

## Runtime construction and clue assignment

### Revised pipeline

```text
profile snapshot + day recipe
              |
local LLM semantic plan / theme ideas
              |
lexeme+sense resolution + clue-coverage lookup
              |
legal CSP fill with bounded learner-fit preferences
              |
catalog variants for every accepted answer
              |
puzzle-wide clue assignment optimizer
              |
bounded batched generation for every unresolved/unsuitable entry
              |
deterministic validators + checkpoint/retry
              |
manifest with clue/profile/selection receipts
```

Routine catalog coverage is known before fill. The construction application no
longer loops over every entry and calls `composeClues`. Its clue port accepts a
batch of only unresolved requirements and returns independently keyed results
that can be checkpointed and retried.

### Clue-resolution state machine

Every filled entry passes through the same explicit decision:

```text
look up accepted variants by answer/sense
              |
     evaluate in puzzle context
        /          |           \
 accepted      repairable       absent/inapplicable
    |              |                    |
catalog clue   runtime rewrite     runtime new ladder
        \          |                    /
           one bounded batch request
                     |
       validate each result independently
           /          |            \
       accept       retry left       exhausted
         |              |               |
     checkpoint      retry item    alternate fill/theme
                                      or typed failure
```

An entry is `runtime-required` when any of these holds:

- no accepted clue exists for the resolved sense/generated answer;
- none fits the requested day band, locale, content policy, or ladder role;
- all suitable clues were used too recently for the household;
- the clue conflicts with another clue or theme surface in this puzzle;
- catalog validation versions are stale or a current validator rejects it;
- the answer itself was created for this theme/puzzle;
- a cross-reference, meta, or other puzzle-specific mechanism is requested;
- the assignment optimizer finds that using the catalog set would violate the
  puzzle-wide difficulty, variety, recovery, or hard-cluster contract.

Collect every such entry after the tentative fill and clue assignment into one
bounded request (or a small measured number of batches), providing answer,
display form, intended sense or generated-answer record, safe facts, theme
relationship, day, requested ladder gaps, nearby clue surfaces, locale, and
validator failure reasons. Never send raw learner history; only the minimal
local audience projection needed for language/difficulty.

Checkpoint and validate each returned clue independently. A failure for one
entry must not discard successful clues for the other entries. When retries are
exhausted, ordinary fill may blacklist that answer and resume/restart; a theme
entry may request a new theme clue or cause theme-set reselection. The puzzle
remains unpublished until every entry has a valid primary and recovery path.

The application port should make the batch semantics impossible to miss:

```ts
type RuntimeClueNeed = Readonly<{
  entryId: string;
  answer: string;
  sense: SenseRecord | GeneratedAnswerRecord | 'form-level';
  reason: 'missing' | 'unsuitable' | 'stale' | 'theme' | 'puzzle-specific';
  requiredRoles: readonly ClueCandidateV1['ladderRole'][];
  safeFacts: readonly FactRecord[];
  nearbyClueSurfaces: readonly string[];
}>;

interface RuntimeClueComposer {
  composeBatch(
    needs: readonly RuntimeClueNeed[],
    context: ClueBatchContext,
    options?: { signal?: AbortSignal }
  ): Promise<Readonly<Record<string, RuntimeClueResult>>>;
}
```

The result is keyed by `entryId` and carries per-item receipts/errors. The
adapter may internally split an oversized batch, but it preserves one logical
request, bounded concurrency, stable checkpoint keys, and per-entry retries.

### Clue assignment as a finite optimization problem

For each filled entry \(e\), create a variable \(C_e\) whose domain is its
accepted catalog variants. Hard constraints require:

- answer and intended-sense alignment;
- locale/content policy;
- at least one valid primary and one valid easier recovery path;
- recipe-permitted ladder role/technique;
- no exact clue duplication or answer leakage;
- factual source validity;
- explicit dependency ordering for cross-reference clues.

Optimize:

- day-level difficulty distribution, not a monotonically rising personal level;
- predicted accessibility for the current player/household;
- mechanism and surface-language variety;
- varied retrieval cue for repeated sense targets;
- clue novelty and anti-fatigue;
- broad concept coverage and low semantic redundancy;
- crossing fairness and avoidance of locally hard clusters;
- the recipe's direct/standard/oblique mix within declared tolerance;
- special emphasis on elegant clues for long/theme entries.

This is small compared with fill CSP. Start with deterministic constrained
greedy assignment followed by local repair; add exact search only if fixtures
show material failures. Selection output includes a term-by-term receipt so an
agent can explain why a variant won.

### Nudge and learning card behavior

- A nudge is selected at construction time but revealed only on request.
- Requesting a nudge changes evidence strength; it does not count as failure.
- Reveal offers an optional concise sense/fact/wordplay card after the answer is
  resolved, never a lecture while the player is trying to solve.
- A scheduled learning target should recur later under a different clue when
  possible; immediate same-clue repetition measures memory for wording.
- Players can mark a card `Worth remembering` to create high-confidence intent,
  or `Not interesting` to suppress educational recurrence without banning the
  answer from all ordinary crosswords.

### Remaining local-LLM responsibilities

The precomputed catalog does not create an LLM-free product. The configured
local model still owns semantic work that benefits from current context:

- broad personalized candidate and theme planning;
- association beyond explicit topic labels;
- coherent theme-set naming and relationships;
- clues for genuinely new/provisional theme entries;
- puzzle-specific cross-reference or meta clues;
- bounded rewrites after a named validator failure;
- post-solve explanations adapted to the player's language level;
- local catalog enrichment that can be exported separately for review.

It should not be used for ordinary Tier A definitions merely to satisfy a
ritual. A model call must add semantic value the catalog cannot supply.

Runtime-generated generic clues may enter a **private local extension catalog**
after validation, keyed by the same answer/sense/prompt/validator versions.
Theme- or puzzle-dependent clues remain scoped to their puzzle unless an
editorial review explicitly generalizes them. Nothing is promoted into the
distributed catalog merely because one local generation succeeded.

## Privacy, provenance, and lifecycle

### Consent and retention

- Personalization has an explicit local-only consent state and neutral mode.
- The UI lists each retained ledger, its purpose, last update, confidence, and
  examples of evidence that affected it.
- Raw interaction events expire after deterministic reduction and a bounded
  diagnostic window; reduced evidence counts remain until reset.
- Raw audio is never persisted. Transcripts default to none and never enter the
  learner profile.
- Profile, event summaries, locally generated clues, and calibration deltas are
  covered by export/import and full reset.
- The model worker receives an immutable profile projection containing only the
  fields required for the named semantic-planning request.
- No analytics, crash report, host request, or build artifact contains a player
  profile, prompt with profile contents, or raw solve event.

### Provenance

Every published puzzle records:

- profile schema and policy versions plus non-identifying snapshot digests;
- which profile features were actually applied and their bounded term totals;
- neutral/personalized/household mode;
- catalog pack, lexicon, sense, fact, calibration, and validator versions;
- selected clue IDs and whether each was shipped, locally generated, or rewritten;
- local model/prompt/inference receipt for only the generated entries;
- clue-assignment policy/version and rejected-alternative reason counts;
- fill engine/objective/seed/termination receipt from plan 12.

The manifest does not embed private feature values. A local diagnostic view may
join the digest back to the current profile snapshot; an exported public puzzle
cannot.

### Content and intellectual-property boundary

- Do not ingest NYT or other proprietary clue-answer archives for training,
  retrieval, evaluation, similarity matching, or “style” examples.
- Generate only from approved lexical/sense/fact sources and original prompt
  instructions stated as abstract editorial qualities.
- Preserve attribution and redistribution requirements through transformed
  artifacts.
- Keep an exact provenance trail from source sense/fact to clue candidate.
- A model-generated clue is not considered fact-grounded merely because it
  sounds plausible.
- Reject memorized-looking or externally copied text when detected; do not claim
  proof of originality from a detector score.

## Evaluation program

### Four outcomes, measured separately

| Outcome | Primary evidence | Anti-metric |
| --- | --- | --- |
| Enjoyment | optional `Loved this`/`Unfair`/`Too niche`, willingness to start another puzzle, blinded household comparison | raw completion time alone |
| Learning | delayed successful retrieval of the same sense under a different clue, adjusted for crossings/help | immediate same-clue repetition |
| Crossword quality | blinded fairness, elegance, wordplay, clue variety, fill quality, day fit | topical relevance alone |
| Personal fit | explicit preference agreement, bounded affinity prediction, household accessibility | click/selection behavior alone |

Completion, abandonment, and timing are useful operational signals but ambiguous
psychological labels. Report them; do not optimize them as ground truth.

### Offline fixture matrix

Create consent-free synthetic profiles with expected qualitative behavior:

| Fixture | Expected | Forbidden |
| --- | --- | --- |
| No profile | Stable broad baseline | invented interests or skill |
| Chemistry interest, no mastery evidence | some adjacent science material | a chemistry exam or assumed expertise |
| Due sense, recently seen exact clue | same sense may recur under a different cue | exact clue repetition |
| Revealed unfamiliar answer | future gentle exposure | mastery increase |
| Strong wordplay preference, weak observed skill | some wordplay plus recovery paths | all-oblique clue slate |
| Sparse evidence | uncertainty and small/no change | confident large rerank |
| Two unequal household profiles | anchors for both and union interests | average-person collapse |
| Hard exclusion | zero prohibited content | soft-score override |
| Voice-heavy solve | same semantic evidence as equivalent keyboard solve | transcript/audio retention |

For every feature, run an ablation from the same candidate pool, seed, topology,
catalog, and objective version. Assert both the intended directional change and
the maximum permitted effect.

### Clue-catalog evaluation

Report by coverage tier, ladder role, technique, locale, source class, answer
length, sense count, and difficulty band:

- generation throughput, tokens/energy/time, retry rate, and checkpoint reuse;
- structural parse and each deterministic validator failure rate;
- alternate-answer ambiguity and sense-mismatch rates;
- critic disagreement and rewrite exhaustion;
- exact/near-duplicate density;
- blinded human fairness, elegance, answerability, and difficulty order;
- catalog bytes per accepted clue, shard requests per puzzle, cache hit rate,
  decompression time, peak memory, and offline success;
- catalog coverage of accepted fill domains and puzzles blocked by missing clues;
- runtime model calls per puzzle, targeting zero for ordinary cataloged entries.

Difficulty calibration uses held-out items and players. Report reliability plots
or binned observed solve rates with uncertainty; a single correlation coefficient
does not prove calibration. Never train and evaluate on repeat exposure to the
same clue without identifying the leakage.

### Local household crossover

After contracts pass, offer an opt-in local experiment that alternates matched
neutral and personalized policies across different seeds. Ask for one brief
after-puzzle rating, keep assignment and results local, and provide an exportable
aggregate report. Do not show the same puzzle twice or imply clinical/educational
assessment.

A future contextual bandit is gated on:

- explicit owner approval of the reward vector;
- enough independent observations;
- propensity/action logging that supports offline policy evaluation;
- hard diversity, breadth, privacy, and day constraints outside the bandit;
- a deterministic neutral policy and one-switch rollback.

Until then, use versioned priors, uncertainty-aware bounded rules, and ablations.

### Promotion gates

Personalization copy may ship only when:

- neutral mode is complete and deterministic;
- every retained field has source events, update rule, uncertainty, retention,
  explanation, export, reset, and ablation tests;
- controlled profile changes yield expected bounded slate differences without
  validity, fill-quality, breadth, or clue-fairness regressions;
- household fixtures pass max-min accessibility and exclusions;
- no raw audio/transcript or high-resolution telemetry is retained;
- manifests truthfully distinguish applied versus merely available features;
- blinded ratings do not show a day-fit or crossword-quality regression.

Catalog-first clueing may ship only when:

- every fill-eligible answer in the released tier has required sense and clue
  coverage for its permitted recipes;
- deterministic and semantic validation receipts exist;
- ordinary cataloged puzzles make zero per-entry clue calls;
- bounded gap generation is checkpointed, retryable, and cancellable;
- pack compatibility, size, cache, offline, and memory budgets pass;
- prohibited/provider material scans pass the exact release artifact;
- catalog-based primary/nudge difficulty ordering survives blinded review.

## Clean-architecture boundary

```text
domain
  profile/event/clue/sense value objects and pure policy contracts
       ^
       |
application
  reduce evidence, plan semantic mix, assign clue slate, construct puzzle
       ^                         ^
       |                         |
persistence adapters       catalog/model ports
  IndexedDB                static packs / local LLM

offline tools -> immutable catalog artifacts -> static catalog adapter
```

- Domain code has no React, IndexedDB, model, filesystem, or network imports.
- Application code asks ports for profile snapshots, catalog variants, and
  bounded clue batches.
- The static catalog adapter verifies hashes/schema/compatibility before records
  reach the application.
- Persistence stores private local state, not the shipped catalog.
- Offline build tooling may depend on domain schemas but production code never
  imports generator scripts.
- Fill search consumes bounded numeric learner preferences and clue-coverage
  eligibility, not entire private profiles.

Proposed paths are subject to L0's dependency review:

```text
packages/domain/src/personalization.ts
packages/domain/src/clueCatalog.ts
packages/application/src/reduceLearnerEvidence.ts
packages/application/src/planPuzzleSlate.ts
packages/application/src/assignClueSlate.ts
packages/application/src/clueCatalogPort.ts
packages/persistence/src/profileRepository.ts
packages/persistence/src/learnerEventRepository.ts
apps/web/src/catalog/staticClueCatalog.ts
tools/clue-catalog/
artifacts/clue-catalog/       # manifest/fixtures only unless release policy approves packs
```

Do not create a new package merely to draw another architecture box. L0 chooses
the smallest dependency-respecting placement and records it in an ADR.

## Migration plan

### Phase 0 — freeze semantics before schemas spread

Deliver:

- ADR for consent, event minimization, retention, export/reset, and household
  attribution;
- ADR for lexeme/sense/fact/clue identity, coverage tiers, pack compatibility,
  model responsibilities, and runtime fallback;
- versioned personalization, evidence-event, clue-catalog, and receipt schemas;
- neutral policy plus synthetic profile/clue fixtures;
- explicit deletion or deprecation path for current `theta`, synthetic
  `web2:WORD` senses, and model-authored scalar difficulty.

Exit: every field has a named producer/consumer and no private/runtime concern
leaks into a static artifact.

### Phase 1 — production semantic inventory

Deliver:

- approved source/license ledger;
- stable lexeme, answer, sense, concept, and fact IDs;
- curation/quarantine rules and coverage reports over the laboratory lexicon;
- a small Tier A pilot spanning common words, glue, polysemy, science/history,
  foreign terms, abbreviations, and multiword answers;
- parsers and round-trip/property tests.

Exit: every pilot answer resolves to a defensible sense/form-level target and
all claims are traceable.

### Phase 2 — resumable catalog factory

Deliver:

- content-addressed task planner and JSONL checkpoint format;
- pinned local model adapter and batch generator;
- deterministic validators, alternate-answer retrieval, bounded critic/repair;
- human-review sampling export/import;
- pack compiler, manifest, compatibility verifier, size report, and pilot pack.

Exit: kill and resume the job at arbitrary points without duplicating accepted
work; two runs over completed tasks produce identical pack bytes.

### Phase 3 — catalog-first clue assignment

Deliver:

- catalog port and in-memory pilot adapter;
- deterministic whole-puzzle clue assignment and term receipt;
- clue coverage integrated before ordinary fill;
- a batch clue port for every runtime-required theme, gap, weak-catalog, stale,
  or puzzle-specific entry;
- checkpointed per-entry results and bounded retries;
- manifest IDs/receipts and adversarial clue fixtures.

Exit: an ordinary pilot puzzle publishes with no per-entry LLM loop and satisfies
day mix, recovery, duplication, ambiguity, and hard-cluster constraints.

### Phase 4 — honest local learner profile

Deliver:

- semantic entry-evidence events from existing domain transitions;
- pure reducers with uncertainty/caps/neutral defaults;
- typed persistence migrations and complete export/reset;
- immutable profile snapshots through construction ports;
- profile inspector/correction UI through the designated App integrator;
- neutral versus personalized ablation reports.

Exit: materially different approved profiles cause expected bounded changes from
the same legal candidate pool while no-profile output remains stable.

### Phase 5 — static delivery and generation queue

Deliver:

- measured sharding and service-worker/cache integration;
- prefetch with build/pack compatibility checks;
- offline queue creation, cancellation, restart, and model unload;
- artifact content/privacy/license scan;
- reference-device latency, memory, storage, and energy report.

Exit: catalog loading is meaningfully faster than the old clue loop and ordinary
generation remains offline after the installed static/model assets are cached.

### Phase 6 — calibration and gradual widening

Expand Tier A/B coverage only when each tranche passes the same validation and
human-sampling gates. Calibrate clue priors and learner rules from consented,
held-out evidence. Graduate one day/locale/technique at a time. Preserve old
catalogs long enough to replay manifests, then migrate with explicit compatibility
policy.

## Luna execution map

Luna agents are implementation workers, not product-policy owners. They must not
invent learner fields, psychometric claims, source licenses, difficulty budgets,
or consent defaults. Every prompt begins with repository hygiene because this
worktree contains concurrent changes.

```text
P0 contracts ─┬─> P1 semantic inventory ─> P2 catalog factory ─> P3 validators/packs
              ├─> P4 learner reducers ───────────────────────────┐
              └─> P5 slate optimizers ───────────────────────────┤
P2 + P3 + P5 ─> P6 construction integration                     │
P4 + persistence contract ─> P7 profile persistence/UI ─────────┤
P3 + P4 + P5 + P6 + P7 ─> P8 evaluation/promotion evidence <────┘
```

### Luna P0 — contracts and red fixtures

Ownership:

- two new ADRs described in Phase 0;
- schema documents and consent-free synthetic fixtures;
- red contract tests only where they can be added without choosing implementation.

Prompt:

```text
Work in /Users/arphen/projectc/crossword. Read AGENTS.md,
docs/plans/13_MEANINGFUL_PERSONALIZATION_AND_CLUE_CATALOG.md,
docs/plans/02_PUZZLE_INTELLIGENCE.md, and review increments 04 and 05 completely.
Run make install-hooks and make doctor. Inspect git status: other agents own
existing dirty changes. Do not revert, format, stage, or commit unrelated files.

Own only two new ADRs, versioned schema documents, synthetic fixture data, and
focused red contract tests agreed in those ADRs. Specify consent/retention/reset,
entry-level evidence semantics, household attribution, lexeme/sense/fact/clue
identity, coverage tiers, difficulty uncertainty, catalog compatibility,
generation receipts, and neutral behavior. Map every field to one producer,
consumer, retention rule, explanation, and ablation. Mark owner choices as
DECISION REQUIRED; do not invent psychometric certainty, licenses, or product
defaults. Do not touch App.tsx, CSS, voice, production construction, persistence
implementation, package manifests, lockfiles, or model prompts.
```

Exit: schemas reject unknown fields, have migration/version rules, and fixtures
cover no-profile, sparse evidence, reveal, crossing-only completion, voice,
household ambiguity, polysemy, answer-form clues, and incompatible packs.

### Luna P1 — semantic inventory pilot

Depends on: approved P0 content identity ADR.

Ownership:

- new pure semantic record/parsing modules and tests at the approved path;
- source/provenance ledger and Tier A pilot fixtures;
- curation/coverage report tooling;
- no generated clue prose beyond explicit synthetic fixtures.

Prompt:

```text
Implement only the Phase 1 semantic-inventory pilot under the paths approved by
P0. Read AGENTS.md, the personalization/clue-catalog plan, and both ADRs. You are
not alone in the repository; preserve unrelated changes and commit only owned
paths. Build strict lexeme/answer/sense/concept/fact records, stable IDs,
provenance, policy tags, coverage tiers, and pure parsers. Add a deliberately
diverse legal pilot covering polysemy, inflections, multiword forms,
abbreviations, glue, science/history, foreign language, and unresolved/quarantine
cases. Generate a coverage report over the lab spelling list but do not promote
web2 into a semantic source. Do not edit the CSP, App, CSS, voice, persistence,
model runtime, package lock, or clue generator. Stop on ambiguous license terms.
```

Exit: repeated ingestion is byte-stable, identity survives ordering changes, and
no grounded sense/fact lacks a real source receipt.

### Luna P2 — resumable bulk clue factory

Depends on: P0/P1.

Ownership:

- `tools/clue-catalog/**` or P0-approved equivalent;
- task/checkpoint/generation adapter code and direct tests;
- local build documentation;
- no runtime application code or distributed release pack.

Prompt:

```text
Build the offline clue-catalog task planner and resumable batched generator from
Phase 2. Read AGENTS.md, the approved ADRs/schemas, and semantic pilot. Own only
the offline tool directory, its tests, and build documentation. Other agents are
active; do not touch runtime packages, App/CSS/voice/persistence, the production
CSP, package lock, or committed release assets.

Use the repository's pinned uv/toolchain rather than creating ad-hoc Python
environments. Canonical task bytes must include sense/facts, roles/techniques,
model/prompt/inference/validator policy versions and seed support; key them by
SHA-256. Write append-only independently keyed checkpoints. Add a provider-
agnostic adapter with a pinned local-model implementation or deterministic fake
for tests. Batch multiple senses but make every output separately recoverable.
Prove kill/resume, duplicate suppression, cancellation, bounded retry, malformed
output quarantine, and byte-stable task planning. Generate surplus candidates;
do not approve them in this package.
```

Exit: an interrupted pilot resumes only incomplete tasks and reports throughput,
failures, tokens/time, and actual provenance without losing prior work.

### Luna P3 — clue validators and pack compiler

Depends on: P0/P1; can begin with fake P2 outputs.

Ownership:

- pure clue validators, alternate-answer retrieval, review queue, and tests;
- pack compiler/reader compatibility fixtures and size report;
- no profile reducer or puzzle construction integration.

Prompt:

```text
Implement deterministic clue validation and pilot pack compilation using the
approved schemas. Own only validator/retrieval/pack modules and direct tests.
Preserve other agents' work; do not touch App, CSS, voice, persistence,
constructPuzzle, CSP, model prompts, or package lock without explicit ownership.

Cover normalized/morphological leakage, enumeration, POS/number/tense,
abbreviation and locale signals, fact/sense grounding, circularity, duplicate
and near-duplicate surfaces, exclusions, cross-reference dependencies, nudge
ordering, and structured wordplay explanations. Retrieve plausible alternative
answers from the eligible pilot catalog before semantic judging. Compile only
accepted candidates into deterministic content-addressed packs; emit manifest,
coverage holes, rejection reasons, compatibility and raw/gzip/Brotli size
reports. Add adversarial homonym, inflection, acronym, name, multiword, and
letter-trick fixtures. Do not let an LLM self-attestation bypass a hard check.
```

Exit: deliberate validator mutants are killed and corrupt/incompatible packs
fail closed before returning a clue.

### Luna P4 — learner evidence and reducers

Depends on: P0 learner ADR.

Ownership:

- approved domain profile/event types and strict parsers;
- pure evidence-strength, memory, mechanism-skill, affinity, recency, and
  household reducers plus tests;
- no storage, UI, or construction integration.

Prompt:

```text
Implement only the pure learner domain and reducers approved in P0. Read
AGENTS.md and the full plan/ADR. Own the profile/event domain paths and their
tests. Do not edit persistence, App/CSS/voice capture, construction, clue
catalog, model runtime, lockfiles, or unrelated session behavior. Preserve all
concurrent changes.

Use entry-level semantic events, crossing-domain information, explicit help,
resolved sense, and bounded broad timing bands. Represent uncertainty and cap
per-event/profile effects. Keep preference, sense memory, mechanism skill,
locale, and recency separate. Reveal is exposure, crossings-only completion is
weak/no retrieval evidence, and voice receives equivalent semantic treatment
without transcript/audio retention. Implement deterministic neutral defaults,
pure migrations, complete reset, and two-player attribution rules. Add
property/ablation/mutation tests proving hard exclusions dominate and sparse
evidence cannot cause a large change. Replace rather than perpetuate ceremonial
theta/difficulty fields only through the ADR's migration path.
```

Exit: every synthetic fixture produces the documented bounded update and replay
of the same event log is deterministic.

### Luna P5 — answer and clue slate optimizers

Depends on: P0; use fake catalog/profile ports.

Ownership:

- pure puzzle composition prior/coverage/diversity policy;
- pure clue assignment and local-repair algorithm;
- term receipts, ablation helpers, and direct tests;
- no CSP, persistence, model, or UI integration.

Prompt:

```text
Implement the pure constrained slate policies from this plan against fake ports.
Own only new application policy modules and direct tests. Other agents are
active; do not touch constructPuzzle, manifest schemas, CSP, catalog build,
persistence, App/CSS/voice, model runtime, or lockfiles.

For answer planning, express the 45/20/15/15/5 broad/adjacent/reinforcement/glue/
exploration prior as puzzle-level targets with tolerances, long-entry weighting,
uncertainty, novelty, redundancy, hard-cluster, and household max-min terms.
For clues, choose one primary plus recovery path per entry under sense, policy,
day mix, difficulty, technique diversity, duplication, cross-reference, varied-
cue, and crossing-fairness constraints. Use deterministic MMR-style greedy plus
repair, stable ties, and a term-by-term receipt. Hard constraints cannot become
penalties. Add neutral/profile/household ablations and adversarial cases where
naive top-per-entry selection produces a bad puzzle.
```

Exit: identical inputs are deterministic, controlled profile changes have
bounded intended effects, and every output independently revalidates its hard
constraints.

### Luna P6 — catalog-first construction integration

Depends on: P1/P3/P5; P2 output format stable.

Ownership:

- catalog and batch-clue application ports;
- `constructPuzzle`/manifest integration and focused tests;
- model broker/protocol batching only if separately coordinated with its current
  owner;
- no profile persistence/UI or static service-worker delivery.

Prompt:

```text
Integrate the approved catalog-first clue path into construction. Read AGENTS.md,
the plan/ADRs, and current dirty status. Own only catalog/batch-clue ports,
constructPuzzle/manifest changes, and focused application tests; coordinate
before touching broker/protocol files because another owner may be active. Do
not touch App/CSS/voice, persistence, service worker, CSP internals, offline
catalog tooling, or lockfiles.

Resolve sense and clue-coverage state before candidate planning, carrying a
bounded runtime-generation cost rather than banning every uncovered good answer.
After fill, run the pure clue-slate optimizer over accepted catalog variants.
Replace the serial per-entry composeClues loop with one bounded request containing
every unresolved, contextually unsuitable, stale, theme, or puzzle-specific
requirement. Key and checkpoint results per puzzle/answer/sense/prompt version,
retry only failures, run all validators, and publish only complete valid
manifests. Preserve cancellation without publishing partials. Record catalog/
clue IDs, selection receipt, provenance, and actual model calls. Keep current
behavior behind a temporary test flag until parity fixtures pass.
```

Exit: ordinary Tier A fixtures make zero `composeClues` calls; mixed fixtures
make one bounded batch and survive a late per-entry failure without discarding
validated entries.

### Luna P7 — profile persistence and inspection

Depends on: P0/P4 and current persistence ownership settling.

Ownership:

- typed profile/event repository methods, migrations, export/import/reset;
- one designated App integrator for consent/inspection/correction UI;
- focused tests; no personalization policy invention.

Prompt:

```text
Wire the settled learner contract through persistence and the designated single
App integration owner. Read AGENTS.md, the personalization ADR, persistence
ownership ADR, and current status. Do not begin if another agent owns overlapping
App or database files; coordinate or stop. Own typed profile/event repositories,
migrations, continuity export/import/reset, and the approved inspector/consent
UI plus focused tests. Do not change learner formulas, clue catalog, construction
objective, model prompts, solver, voice retention, CSS design language, or
lockfiles unless assigned.

Persist strict versioned data, enforce event expiration/reduction, and prove full
reset removes raw events, reduced profiles, local calibration, and local clue
caches without deleting shipped static assets. The UI shows retained categories,
purpose, confidence, applied examples, last update, and edit/reset controls. It
must say neutral when no snapshot was applied. Raw audio is impossible to store;
transcripts default to none. Carry only immutable profile snapshots through the
existing construction port and store non-identifying digests in manifests.
```

Exit: migration and round-trip fixtures pass, complete reset is independently
verified, and UI claims match the manifest receipt.

### Luna P8 — evaluation, mutation, and promotion report

Depends on: pilot path end to end.

Ownership:

- replay/ablation/calibration/benchmark harnesses and reports;
- mutation configuration for new pure modules;
- no policy tuning until baselines are frozen.

Prompt:

```text
Build and execute the evaluation program in the personalization/clue-catalog
plan. Own only evaluation/replay/benchmark harnesses, mutation configuration,
reports, and separately approved one-variable fixes. Preserve concurrent work;
do not redesign UI, learner schemas, catalog policy, CSP, model prompts, or
budgets to improve results.

Freeze artifact/profile/policy versions and candidate pools. Run neutral versus
personalized and feature-ablation fixtures, household fairness, hard exclusions,
catalog validator adversaries, pack size/cache/decompression, zero-per-entry-call
rate, gap batching, cancellation, memory/energy, and difficulty calibration.
Run mutation tests against evidence reducers, hard/soft separation, clue
validators, pack compatibility, and slate constraints. Produce aggregate
distributions and blinded human-review sheets. Conclude promote, continue, or
reject for each feature separately; do not average learning, enjoyment, and
crossword quality into one victory number.
```

Exit: the owner can reproduce every table from checked scripts and make separate
promotion decisions for clue catalog, each personalization feature, and each day.

## Owner decisions

- Approved lexical, sense, concept, and fact sources/licenses.
- Whether personalization is opt-in or an equally explicit owner-approved local
  default; neutral mode exists either way.
- Initial Tier A/B coverage targets and clue-count requirements per sense/day.
- Exact broad/reinforcement/adjacent/glue/exploration tolerances.
- Maximum permitted profile effect on fill and clue selection.
- Event diagnostic retention window and whether locally generated clues survive
  a profile reset or only a full-content reset.
- Reference model(s) for bulk catalog generation, semantic judging, and on-device
  gap repair.
- Catalog byte/storage/cache budgets and supported browser/device floor.
- Which post-solve learning cards and explicit feedback controls belong in the
  first household beta.
- What evidence permits words such as “learn,” “remember,” or “personalized” in
  product copy.

## Definition of done

- Puzzle generation no longer performs one serial LLM request per entry.
- Every routine fill answer has a grounded sense/form target and validated clue
  ladder before publication.
- Clue variants are selected as a coherent, diverse, day-appropriate slate.
- Personalization has separate inspectable preference, memory, mechanism,
  recency, locale, and household behavior with uncertainty.
- Broad crossword material remains the plurality and hard exclusions always win.
- Delayed varied-cue retrieval—not immediate completion—is the learning signal.
- Neutral mode, export/import/reset, local-only privacy, and one-switch feature
  rollback work end to end.
- Every manifest identifies exact catalog/profile/policy/model/validator inputs
  without exposing private contents.
- Fixture ablations, mutation tests, browser/offline tests, catalog quality
  reports, and blinded household evaluation support each shipped claim.

## Research notes

The cited work motivates hypotheses and measurement, not automatic product
truth:

- Roediger and Karpicke's [test-enhanced learning
  experiments](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)
  support delayed retrieval as a learning mechanism rather than equating study
  exposure with retention.
- Settles and Meeder's [half-life regression for language
  learning](https://research.duolingo.com/papers/settles.acl16.pdf) provides an
  interpretable alternative to an uncalibrated FSRS-like scalar for sparse
  vocabulary histories.
- Recent PNAS experiments on [spaced retrieval with varied
  cues](https://doi.org/10.1073/PNAS.2413511121) motivate using different clues
  for later retrieval, while requiring this product to validate the effect in
  its own crossword context.
- Carbonell and Goldstein's [maximal marginal relevance
  work](https://aclanthology.org/X98-1025/) motivates the simple explicit
  relevance/diversity tradeoff before adopting a learned recommender.
- [Clue-Instruct](https://arxiv.org/abs/2404.06186) and the ACL workshop paper on
  [crossword clue extraction for language
  learning](https://aclanthology.org/2024.bea-1.31/) show useful clue-generation
  and evaluation precedents; neither substitutes for this product's licensed
  sources, clue fairness, provenance, or human calibration.
