# Full review increment 04: personalization and provenance

Date: 2026-09-04

Priority: fourth implementation increment

Reasoning tier: superintelligence for product, data, privacy, and measurement contracts

## Outcome

The plans describe a local, inspectable learner profile that shapes puzzle construction without turning the puzzle into an exam. The current implementation has fragments of scoring and persistence, but no end-to-end profile product. Calling the current behavior personalized would overstate what the system observes, stores, and applies.

Do not start by adding preference toggles. First specify what can be inferred, what cannot be inferred, what is stored, how it is inspected and deleted, and how a construction receipt proves that a profile influenced a result.

## PP-P0-1: the profile is not wired through the construction path

Evidence:

- application construction types allow an optional `LearnerProfile`;
- the App's construction request supplies only seed/day information;
- the web construction-client interface does not carry a profile;
- continuity export currently emits an empty profile collection;
- the profiles store has no complete typed read/update/reset application flow;
- the UI has no profile inspection, editing, or reset surface.

Acceptance:

- a versioned profile can be created, read, updated, exported, imported, and reset;
- the user can see every retained category and its plain-language effect;
- construction receives an immutable profile snapshot or an explicit `none`;
- the published manifest records profile schema version and a non-identifying snapshot digest;
- an integration test proves that two materially different approved profiles affect candidate ranking under a fixed seed;
- the UI never claims personalization when the request used no profile.

## PP-P0-2: current session events cannot support the planned inferences

Selection changes do not consistently produce domain events, and the event stream does not capture enough semantic context for measures discussed in the plans. Missing or ambiguous inputs include clue focus, dwell, time to first key, inter-key intervals, entry attempt boundaries, crossing state at the time of an attempt, and input source such as keyboard versus voice.

Raw timestamps alone do not justify conclusions about ability, interest, or frustration.

Required design rule:

> Collect only events tied to a named product use, and never silently reinterpret navigation or latency as a cognitive diagnosis.

Acceptance:

- every proposed profile field has a documented source event, update rule, confidence, retention rule, and user-visible explanation;
- navigation events are distinguished from answer-attempt events;
- voice, paste, reveal, and keyboard sources do not accidentally share incompatible timing semantics;
- no field is inferred until its source event coverage and calibration test exist;
- the domain event schema is versioned before persistence.

## PP-P1-1: stored profile data is untyped and unversioned

The persistence layer treats profile payloads as generic JSON. That allows shape drift and makes migration, validation, and privacy review difficult.

Start with a deliberately small profile:

```ts
type LearnerProfileV1 = {
  schemaVersion: 1;
  id: string;
  consent: 'disabled' | 'local-personalization';
  updatedAt: string;
  clueStylePreferences: Record<string, PreferenceWeight>;
  topicPreferences: Record<string, PreferenceWeight>;
  repetition: {
    recentAnswerIds: string[];
    avoidUntilByAnswerId: Record<string, string>;
  };
};
```

This is an illustrative ceiling, not a schema decision. Do not add skill scores, demographics, or psychological labels without a specific, validated use.

Acceptance:

- strict parsing rejects unknown and invalid fields;
- schema migrations are pure, versioned, and fixture-tested;
- defaults are neutral and do not invent preferences;
- a reset is complete and independently testable.

## PP-P1-2: difficulty state does not influence adaptive scoring

`LearnerMemoryState.difficulty` is present but not consumed by `adaptiveScore`. This is worse than a missing field because it suggests the pipeline honors a signal that it currently ignores.

Acceptance:

- remove unused state until there is a validated rule, or connect it through a documented and tested rule;
- manifest/telemetry distinguishes fields applied from fields merely available;
- ablation tests show the direction and magnitude of each profile component.

## PP-P1-3: ranking lacks live crossing context

`applyLearnerPreferences` evaluates candidates with `filledCrossLetters=0`, and branching draws from global candidate information rather than the live domain and crossing state. A preference score can therefore favor an answer without representing how feasible or appropriate it is at that decision point.

Acceptance:

- adaptive features are computed from the live CSP variable/domain context;
- feasibility and editorial legality dominate preference;
- personalization can break ties or shape bounded choices but cannot force invalid fill;
- a property test proves preference changes never bypass hard constraints.

## PP-P1-4: privacy behavior is not yet a product contract

The local-only architecture is a strong boundary, but locality alone does not make collection understandable or proportionate. Voice adds a particular risk: raw audio and transient transcripts must not quietly become learner-history fields.

Acceptance:

- personalization is explicitly opt-in or has an equally explicit owner-approved default;
- the profile UI lists retained data, purpose, and last update;
- raw audio is never persisted;
- transcript retention is separately decided and defaults to none;
- export and reset cover every profile/event store and derived cache;
- retention limits are enforced rather than merely documented;
- no network code receives profile or event payloads.

## PP-P1-5: provenance fields are placeholders rather than evidence

Current construction receipts can name a placeholder model, disagree on prompt version, use seed-derived text as a digest, and accept a model-supplied intended sense without independent grounding. A value labeled as provenance must identify what actually happened.

Acceptance:

- model ID, immutable revision, prompt renderer version, inference parameters, lexicon revision, topology revision, validator versions, and canonical output digest come from their real owners;
- a digest is computed from canonical bytes with a named algorithm;
- validators report executed/pass/fail, not a self-asserted static list;
- unresolved sense identity is labeled unresolved rather than given a synthetic authority-like ID;
- the receipt records whether a profile was applied and which version, without exposing private contents.

## PP-P1-6: clue sense is not independently grounded

Fallback sense IDs such as `web2:${word}` identify a lexical source and spelling, not a specific meaning. A model-provided `intendedSense` can also select the wrong homonym. Personalization and clue evaluation cannot be trustworthy when they operate on an unverified sense label.

Acceptance:

- licensed lexical entries provide stable sense records where available;
- clue prompts receive a bounded sense description rather than an untrusted authority claim;
- validators test answer leakage, part-of-speech compatibility, ambiguity, and sense alignment;
- unresolved words use an explicit editorial-review path.

## Minimal measurement program

Before implementation, create a small offline evaluation fixture containing consented synthetic histories and expected qualitative effects:

| Fixture | Expected behavior | Forbidden behavior |
| --- | --- | --- |
| No profile | Neutral baseline | Invented interests |
| Repeated recent answers | Reduce immediate repeats | Ban all familiar vocabulary |
| Strong clue-style preference | Nudge clue mix | Violate day difficulty |
| Sparse evidence | Low-confidence/no change | Large score swing |
| Voice-heavy solving | Same answer evidence rules | Persist audio/transcript |

For each scoring component, report an ablation against the neutral baseline. A single generated puzzle is anecdotal, not validation.

## Implementation sequence

1. Write an ADR for consent, retained fields, retention, export, and reset.
2. Define versioned event and profile schemas with strict parsers.
3. Create pure reducers from approved events to profile updates.
4. Build synthetic calibration fixtures and ablations.
5. Add typed persistence repository methods and migrations.
6. Carry an immutable profile snapshot through the construction application port.
7. Record honest provenance in the publish manifest.
8. Add inspect/edit/reset UI through the single App integration owner.
9. Only then enable product copy that says construction is personalized.

## Ownership boundary

The first owner writes the product/data ADR and reference reducers. A persistence owner implements the typed repository. A construction owner consumes only the settled profile contract. The App integrator owns consent and inspection UI. Do not let a UI agent create new learner fields to make the screen look complete.

## Verification gate

```sh
npm run test --workspace @crossword/domain
npm run test --workspace @crossword/application
npm run test --workspace @crossword/persistence
npm run test --workspace @crossword/web
make qa
```

The evaluation artifact and ablation output are required evidence in addition to green unit tests.

## Closure evidence

Open.
