# ADR 0008: local learner profile contract

Date: 2026-09-04

Status: accepted for the personalization increment (PP-P0-1/PP-P1-1/PP-P1-2/PP-P1-3 partial; FULL_REVIEW_PASS_2026-09-04_04)

## Scope

A deliberately minimal, versioned, strictly validated local profile. No
behavior inference is enabled yet: per the review contract, a profile field
may be inferred only after its source-event coverage and calibration test
exist, so today the neutral (no-profile) behavior is the complete product
behavior.

## Decisions

### 1. One versioned, strict schema (`LearnerProfileV1`)

`packages/domain/src/learnerProfile.ts` owns the schema: `schemaVersion: 1`,
`id`, `consent`, ISO `updatedAt`, bounded `clueStylePreferences` and
`topicPreferences` maps (weights in [-1, 1], ≤ 64 entries), and bounded
`repetition` records. `parseLearnerProfile` rejects unknown fields, wrong
versions, out-of-range weights, malformed timestamps, and oversized
collections, so shape drift cannot reach storage or exports.

### 2. Consent gates the construction path; neutral behavior is complete

`profileForConstruction` currently returns an explicit `undefined` for every
profile: the reviewed FSRS memory profile has no validated derivation from
V1 fields, and inventing one would be an editorial decision without
evidence. When a calibrated rule exists it will live behind this gate so
construction receives an immutable snapshot or an explicit none.

### 3. Privacy rules

- Raw audio is never persisted anywhere in the product.
- Transcripts are not retained (default: none). Any future retention is a
  separate, owner-approved decision.
- The profile is local household data; it leaves the device only through a
  user-initiated continuity export, which now includes the typed profile.
- Retention: the profile exists until the user resets it; reset returns
  every retained category to the neutral profile and is independently
  tested.

### 4. Removed unused state (PP-P1-2)

`LearnerMemoryState.difficulty` was removed: no scoring rule consumed it.
Reintroduce only with a documented, tested calibration rule.

### 5. Preference cannot bypass hard constraints (PP-P1-3)

`applyLearnerPreferences` reweights candidate ordering only. Property-style
tests pin that an aggressive profile preserves the candidate set, keeps
scores bounded, and stays deterministic; eligibility remains the lexicon's
and the CSP's job. The `filledCrossLetters = 0` value at ranking time is the
truthful pre-fill context (no crossings exist yet); a live-crossing feature
would require a validated post-fill re-ranking seam and is deferred.

## DECISION REQUIRED (owner)

- Consent default: this ADR ships `disabled` as the safe neutral. The owner
  must confirm the product default (opt-in vs an approved
  local-personalization default) before any UI claims personalization.
- Which V1 fields (if any) eventually feed construction, with ablation
  evidence per field.
