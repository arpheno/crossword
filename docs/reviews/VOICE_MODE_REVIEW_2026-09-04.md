# Voice Mode Review — 2026-09-04

**Status:** critical product, architecture, implementation, and specification review; not release-ready

**Snapshot:** current working-tree implementation and validation pass

**Implementation scope:** current Voice Mode source, runtime, cache, UI, tests, and release evidence

**Authority:** product goals, observed code, and measured platform behavior. `08_VOICE_MODE.md` is reviewed as a proposal, not treated as a specification that is correct by definition.

**Primary files:**

- `apps/web/src/components/VoiceSolveControl.tsx`
- `packages/application/src/voiceSolve.ts`
- `packages/model-runtime/src/broker.ts`

**Boundary files reviewed:** staged/current `App.tsx`, `voiceCapture.ts`, `speechConfig.ts`, `speechClient.ts`, `speechWorker.ts`, model-worker protocol/client/adapter changes, CSS, tests, dependencies, and `docs/plans/08_VOICE_MODE.md`

---

## 1. Executive verdict

The architecture contains useful ingredients: parsing and compatibility rules are pure application code, audio and model work are separated behind workers, answer candidates are filtered against entry length and crossings, and no application server receives audio or transcripts.

The overall product shape should not be accepted unchanged, even if every item in Terra's plan were implemented perfectly. The plan puts an LLM in a bounded spelling-resolution problem before establishing a deterministic phonetic baseline, makes every successful answer pass through modal confirmation, and treats browser/runtime caching as if it were a durable, user-controlled installation. Those are design errors, not implementation omissions.

The product requirement confirmed by the two active players is **command-first voice entry**: say the clue number, direction, and answer in one utterance, for example `12 down mitochondria`. This is the canonical flow and must remain first-class. It makes the intended target explicit and supports the partners' established way of solving rather than depending on whichever cell happens to have focus. The answer should then preview directly in the named entry before commit. Resolution should be an evidence pipeline—ASR hypotheses, crossword normalization, phonetic/lexical expansion, length and crossing constraints, then an optional local-LLM fallback—not “trust the transcript unless it fails.” Ambiguity belongs beside the entry, not in a global modal.

Several serious defects were corrected in the worktree during this review. A unique candidate now requires an explicit Confirm action; the named entry is selected before resolution; puzzle/session intent fingerprints and current-state revalidation protect the commit path; rebus and duplicate-entry cases are explicit; unmount cleanup no longer writes React state; and microphone tracks are stopped before decode. These changes are source-reviewed and targeted tests remain green, but most of the new concurrency and resource guarantees still lack adversarial tests.

The answer-resolution path now treats the exact ASR spelling as one proposal and always merges deterministic phonetic alternatives before considering the local LLM. `SEA`/`SEE`-style ambiguity therefore remains visible to the player instead of being silently collapsed. Recognition quality is still unproven on recorded speech, especially for crosswordese, names, accents, and noisy input.

The implementation now has an immutable speech manifest, verified model and ONNX Runtime artifacts, measured progress/cache state, separate memory unload and cache deletion, and hard-cancel worker replacement with App state subscription. Real WASM preparation, transcription, unload, fresh offline reload, and offline transcription have passed in the current browser environment. The feature remains short of release because recorded-speech accuracy, WebGPU/device coverage, mutation evidence, privacy trace breadth, performance/energy budgets, and an exact staged artifact are still open.

Voice mode should remain behind a development flag until the open/partial critical findings and the release gates in this review are closed.

---

## 2. Design-decision review — what to keep, revise, and replace

### 2.1 Product definition: preserve command-first voice entry

The canonical utterance is a fixed product requirement derived from actual two-player use:

```text
<clue number> <across|down> <answer>
```

That interaction must stay primary. The app should recognize variants such as digits/number words, hyphenated numbers, `a cross` ASR output, and limited filler without weakening the grammar so far that unrelated speech can become a command. Once the number and direction resolve uniquely, the named entry should become visibly selected and the interface should echo the parse—such as `12 Down — heard “mitochondria”`—before any proposed letters commit.

Selected-entry answer-only dictation may be added as an optional shortcut, but it cannot replace, hide, or delay the three-part command. It must have a distinct affordance or mode so the same utterance cannot be interpreted under two competing target-selection rules.

The current feature is still not a complete hands-free accessibility interface: it cannot read clues, erase, check, reveal, undo, pause, or recover entirely by speech. Do not claim that broader capability yet. Later commands such as “next clue,” “erase that,” “repeat clue,” “yes,” and “no” should extend the same explicit grammar and recovery model.

### 2.2 The best interaction is preview → commit, not transcript → modal → fill

Terra's universal confirmation rule is directionally safe but mechanically clumsy. The earlier unique-candidate auto-fill was unsafe and has now been removed. A global modal for every accepted transcript is still not the best interaction.

Use a transactional preview:

- proposed letters appear as visually distinct, non-persistent “ghost ink” in the selected entry;
- crossings that conflict are never previewed;
- Enter, a second microphone action, click/tap, or “yes” commits the whole entry;
- Escape, “no,” deletion, puzzle replacement, or target-entry change cancels it;
- multiple plausible spellings appear in a small anchored chooser attached to the clue/entry, not a page-blocking modal;
- focus and the clue spine remain visible, so voice enhances the app's central design language instead of replacing it with generic dialog UI.

The preview is one application transaction. It does not enter N independent letters while resolving, alter score, trigger completion, or enter persistence/history until commit. Commit re-resolves the entry by stable ID and revalidates the current revision, length, rebus policy, and crossings atomically. Undo treats the committed voice answer as one player action while the domain may still emit per-cell facts internally if analytics require them.

An opt-in rapid mode can be evaluated later. It may auto-commit only after measured evidence supports a threshold and it provides immediate single-action undo. It must never be the initial default, and raw model “confidence” alone is not a sufficient threshold.

### 2.3 The LLM belongs at the edge of resolution, not in the common path

The current plan jumps from one normalized transcript to WebLLM when that spelling does not fit. That is both too little and too much:

- too little, because an exact ASR spelling can be the wrong homophone and therefore needs competing hypotheses;
- too much, because length/pattern-constrained phonetic spelling is a small search/ranking problem that should be deterministic, fast, testable, and available without waking a large generative model.

Use this ordered resolver:

1. Obtain one or more ASR hypotheses and any token scores the chosen runtime can truthfully supply. Never invent a calibrated confidence value if the model/API does not expose one.
2. Normalize each hypothesis with the same alphabet/rebus rules as the crossword domain.
3. Expand only the spoken answer portion through a local pronunciation index and crossword lexicon. Rank by phonetic edit distance, ASR evidence, answer familiarity, and user locale—never by popularity alone.
4. Apply hard entry constraints: cell-token count, known crossings, supported alphabet, and rebus policy.
5. If the bounded candidate set is empty or genuinely ambiguous, ask the already-installed local LLM for **additional phonetic spellings**, using schema-constrained generation. Merge, deduplicate, and deterministically filter its output.
6. Present evidence to the player; the model never commits.

The LLM remains an important app capability, especially for construction and clue work, but making every mic action depend on it would increase latency, memory pressure, battery use, and failure modes without improving the common case. “AI-enabled” should mean that the model is used where semantic reasoning adds value, not that every bounded operation is routed through generation.

Do not pass clue text to an answer-generating LLM. That would let voice entry quietly become a solve-the-clue button. If clue context is ever used, it may only rank an already bounded phonetic candidate set, behind an explicit product decision and gameplay test.

### 2.4 Clean architecture: split capabilities and move orchestration out of React

`VoiceSolveControl.tsx` currently owns capture, lifecycle, parsing, entry lookup, candidate resolution, cancellation, and presentation. The component is acting as UI, controller, and application service. Refs and string phases are compensating for the missing orchestration boundary.

Use these ports instead:

```text
VoiceEntryView
    -> VoiceEntryController (tagged state machine)
        -> AudioCapturePort
        -> SpeechRecognizerPort
        -> SpokenAnswerResolverPort
        -> VoicePreviewStore / current SolveSession gateway
        -> InferenceResourceCoordinator
```

Keep React as a projection of a tagged state machine such as:

```text
disabled
ready
requesting-permission(intent)
recording(intent)
transcribing(intent)
resolving(intent)
previewing(intent, candidates, selected)
committing(intent)
failed(recoverable, intent?)
```

Every async message carries `intentId`, `puzzleId`, `entryId`, and the session revision used to derive it. The controller rejects stale messages. The commit gateway reads the current session rather than a captured React prop and performs compare/revalidate/commit atomically.

`broker.ts` should not be the single fat interface for construction candidates, clue composition, model lifecycle, and spoken spelling. Apply interface segregation:

- `ConstructionCandidateGenerator`
- `ClueComposer`
- `SpokenAnswerExpander`
- `LocalModelLifecycle`
- `InferenceResourceCoordinator`

Adapters can share one WebLLM engine underneath, but application callers depend only on the capability they use. The coordinator, not an incidental `busy` return from the broker, owns GPU/memory admission, cancellation priority, and transitions between speech and language models.

### 2.5 Model/runtime decision: benchmark a tiered local stack

Choosing `onnx-community/whisper-tiny.en` up front is a hypothesis, not an architecture decision. Crossword answers contain exactly the material most likely to expose a tiny general ASR model's weaknesses: proper nouns, abbreviations, scientific vocabulary, foreign words, and homophones spoken by non-native English speakers.

Keep Transformers.js + ONNX Runtime as the first implementation candidate because it supports in-browser ASR and both WebGPU and WASM execution paths. Do not make a browser API presence check the compatibility contract. Run an install-time smoke inference and maintain measured device tiers:

- **Tier A:** WebGPU ASR meeting the latency, peak-memory, and energy budgets;
- **Tier B:** WASM ASR meeting a relaxed latency budget for short utterances;
- **Tier C:** feature unavailable, with typed solving unchanged and an honest explanation.

Benchmark at least two model/quantization profiles on the actual crossword corpus before pinning one. Optimize for **entry exact-match and candidate recall**, not generic word-error rate alone. The winning model may differ by device class; a deterministic manifest may map a supported tier to a reviewed model artifact without making behavior mutable.

Speech and WebLLM can compete for the same WebGPU device and memory. Measure co-residency. If it is unstable or expensive, explicitly schedule unload/load boundaries or run short ASR on WASM while the language model owns the GPU. Never discover this policy through random out-of-memory failures in two independent workers.

### 2.6 Installation and privacy: browser cache is not a product lifecycle

“Downloaded once and cached by the runtime” does not by itself mean installed, durable, offline-ready, or removable. The app needs an owned artifact lifecycle:

- immutable model ID, source revision/commit, runtime version, quantization, license, expected files, bytes, and digests;
- explicit download consent and progress based on received bytes;
- verified receipts only after every required artifact is present;
- an offline smoke inference before reporting Ready;
- separate states for `not downloaded`, `downloading`, `cached`, `loaded in memory`, `unloaded`, `update available`, and `corrupt/incomplete`;
- separate actions for **Unload from memory** and **Delete downloaded model**;
- deletion verification and truthful handling of browser eviction or denied persistent-storage requests;
- preferably same-origin, immutable assets for a deployable privacy story, or a clear disclosure that initial installation contacts the model host.

Do not promise that inference cancellation aborts compute unless the actual runtime can do it. The upstream Transformers.js project still tracks pipeline abortability as an open problem. For a short, bounded job, UI cancellation may invalidate the result; for resource cancellation, terminate and recreate the dedicated speech worker and measure how quickly GPU/CPU/memory are released.

### 2.7 Decision matrix

| Terra-plan decision | Verdict | Replacement/qualification |
|---|---|---|
| Optional and off by default | KEEP | Preserve typed solving and require explicit model/microphone actions. |
| “Number + direction + answer” as the primary interaction | KEEP — PRODUCT REQUIREMENT | Make parsing, target echo, correction, preview, and tests first-class; selected-entry dictation is optional only. |
| Dedicated local speech worker | KEEP | Put it behind a controller port and make worker termination the hard-cancel fallback. |
| Whisper tiny English chosen before evidence | DEFER | Benchmark model/quantization tiers against accented crossword utterances. |
| WebGPU with possible WASM fallback | KEEP, MEASURE | Smoke-test real inference and enforce latency/memory/energy budgets. |
| Exact transcript first, LLM only after no fit | REPLACE | Always build a bounded evidence set; phonetic/lexical resolver first, LLM last. |
| Never give clue text to an answer generator | KEEP | At most rank a closed phonetic set with clue context after an explicit gameplay decision. |
| Modal confirmation for every answer | REPLACE | In-grid ghost preview; anchored chooser only for ambiguity. |
| Browser runtime cache equals installation | REPLACE | App-owned immutable manifest, receipts, offline proof, unload, and delete. |
| One shared model broker interface | REPLACE | Capability-specific application ports plus a shared resource coordinator. |
| Repeated `enterLetter` calls on acceptance | REPLACE | Atomic preview/commit command with current-state revalidation and one-step undo. |
| Persist only opt-in preference | KEEP | Do not retain raw audio/transcripts; define diagnostic retention separately. |

### 2.8 Evidence required before the replacement design is declared “best”

No model/runtime choice deserves that label without a local evaluation harness. Build an opt-in, privacy-reviewed corpus that includes:

- clue numbers and direction phrases, including ASR confusions such as `four/for` and `one/won`;
- single-word and multi-token answers normalized to crossword form;
- homophone sets (`SEA/SEE`, `SOLE/SOUL`, names, letters, abbreviations);
- crosswordese, history, chemistry, biology, philosophy, non-English loanwords, and proper nouns;
- the two real players' accents plus a broader consented speaker sample;
- silence, clipping, background speech, corrections, and rapid cancel/restart.

Report by device/browser/model tier:

- target-entry accuracy for command mode;
- answer exact-match and compatible-candidate recall@1/@3;
- false-commit rate (zero in the default preview design);
- warm and cold time-to-preview, p50/p95;
- peak JS/WASM/GPU memory and recovery after unload/cancel;
- energy per utterance and idle energy after voice use;
- offline install/readiness/delete outcomes;
- average confirmation actions and correction time versus typing.

The product decision is already made: command-first entry ships first because it serves the partners' established solve flow. Evidence determines the ASR/model tier, grammar details, preview treatment, and release readiness—not whether the command interaction exists. Selected-entry dictation is optional follow-on work and should ship only if it adds value without making command interpretation ambiguous.

### 2.9 Primary technical evidence

- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu) demonstrates browser Whisper inference but explicitly describes WebGPU support as experimental and not universal.
- [Transformers.js pipeline documentation](https://huggingface.co/docs/transformers.js/en/pipelines) documents default browser downloading/caching and supports pinning a model by a concrete revision rather than `main`.
- [ONNX Runtime Web execution-provider documentation](https://onnxruntime.ai/docs/tutorials/web/) exposes WebGPU, WebNN, and WASM choices; this supports measured tiering rather than a WebGPU-presence gate.
- [WebLLM's project documentation](https://github.com/mlc-ai/web-llm) supports worker isolation and schema-constrained JSON generation, while its service-worker documentation warns that browser lifecycle remains outside the app's control.
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) recommends explicitly stopping capture tracks because they consume resources and affect privacy indicators.
- [Transformers.js pipeline cancellation issue](https://github.com/huggingface/transformers.js/issues/1182) is still open in the reviewed upstream state, so cancellation semantics must be tested and described honestly rather than assumed.

### 2.10 Live implementation reconciliation

The worktree changed while this review was being written. The latest source pass supersedes earlier observations as follows:

| Earlier finding | Current source status | Remaining proof/work |
|---|---|---|
| Unique candidate auto-filled | ADDRESSED | Current component always opens confirmation; component and browser coverage prove no pre-confirm fill. Contextual preview remains a UX refinement. |
| Referenced entry selected only at fill | ADDRESSED | `onSelectEntry` now runs after unique lookup; browser coverage proves the named entry preview. |
| Late result could overwrite newer session | ADDRESSED IN MAIN PATH | Intent/fingerprint guards exist in component, application, and App; application confirmation re-resolves the current entry by ID. Broader await-boundary tests remain. |
| Tracks stopped only after audio decode | ADDRESSED | Tracks now stop before recorder stop/decode and stop has a timeout; add real capture lifecycle tests. |
| Rebus/duplicate lookup implicit | ADDRESSED | Rebus is rejected and lookup returns found/missing/ambiguous; add direct tests. |
| Loose additive numbers / voice-only answer normalization | ADDRESSED | Parser rejects malformed sequences and adds bounded ASR repairs; normalization delegates to the domain and application coverage exercises the corpus cases. |
| Unmount cleanup sets component state | ADDRESSED | Resource-only cleanup is now separate; add unmount-in-each-phase tests. |
| Working-tree build failed | PARTIAL | Production Vite build and focused type checks pass; full web typecheck remains blocked by unrelated model-worker/client/test errors, and the staged artifact remains intentionally unverified. |
| Spoken-answer prose fallback / prompt interpolation | ADDRESSED | Adapter rejects non-JSON, uses schema-constrained output, and delimits the JSON data payload; broker validation remains. |
| Speech response accepted wrong operation/value | ADDRESSED | Pending operation and per-operation payload validation are covered by focused tests. |
| Speech cancel could not stop inference | ADDRESSED IN MAIN PATH | Client terminates/recreates the worker, settles affected jobs, publishes `uninstalled`, and App subscribes to state; cancellation/retry browser coverage passes. |
| Speech model revision and runtime cache were unpinned/unverified | ADDRESSED | The manifest pins model/runtime versions and digests; cache verification owns model and browser-specific ONNX Runtime WASM files. |
| Real speech execution and offline reload were absent | ADDRESSED FOR WASM SMOKE | Online prepare/transcription/unload and fresh offline prepare/transcription/unload pass with no model/runtime network requests; this is runtime evidence, not accuracy evidence. |

---

## 3. Plan-to-code ledger

| Contract | Current implementation | Result |
|---|---|---|
| Off by default | local preference defaults false | PASS |
| Preference persisted locally | `crossword-voice` in localStorage | PASS |
| Preference in Model setup | present in current `App.tsx` snapshot | PASS |
| Enabling does not record/download | opens setup; prepare remains explicit | PASS |
| Audio/transcript never sent to application server | capture → local worker; optional local WebLLM | PASS by source inspection |
| Dedicated speech worker | separate typed client/worker protocol | PASS |
| Immutable pinned speech model | manifest pins revision, runtime version, files, bytes, digests, provenance, and license | PASS |
| Show accurate size/storage state | manifest-backed estimates, received-byte progress, measured cache bytes, and runtime assets | PASS |
| Clear uninstall action | separate memory unload and verified downloaded-artifact deletion | PASS |
| Select referenced entry before candidate work | unique lookup calls `onSelectEntry` before resolution | PASS by source/component test |
| Filter candidates by length/crossings | pure application filter | PASS for ordinary one-letter cells |
| Confirm exactly one candidate | all candidate counts enter a picker with separate Confirm | PASS by component test |
| Accessible picker for several candidates | anchored radiogroup with first focus, arrow-key navigation, Escape, and opener restoration | PARTIAL; touch/complete keyboard journey and broader focus semantics remain |
| Zero candidates leaves grid untouched | yes | PASS |
| Cancellation at every phase | aborts UI work; speech cancellation terminates/recreates the worker and settles affected jobs | PASS for speech path; capture lifecycle and broader matrix remain |
| Puzzle replacement/stale-result defense | intent token + component/application/App revalidation | PASS in the main path; broader await-boundary matrix remains |
| Rebus compatibility | explicitly rejected before candidate work and commit | PASS for declared unsupported behavior |
| Offline after install | real WASM prepare/transcribe/unload and fresh offline reload/transcribe pass; cache inspector owns runtime files | PASS for current WASM environment |
| Unit, worker, component, Playwright coverage | focused application/web/runtime suites, worker tests, and six Voice browser journeys pass | PARTIAL; release matrix and full typecheck remain |

---

## 4. Critical finding ledger

### VM-P0-1 — ADDRESSED: unique candidate previously bypassed confirmation

The earlier implementation called `onFill` immediately when one compatible candidate remained. The current component instead creates pending state for one or many candidates, preselects a unique proposal, and requires the separate Confirm action before `onFill`.

The component test was corrected in the same worktree: it now asserts selection of the named entry, unchanged committed state before confirmation, and a three-argument intent-bearing `onFill` call only after Confirm.

This closes the silent-mutation defect. It does not make the global modal the best UX; section 2.2 still recommends a contextual ghost preview with explicit commit.

**Remaining acceptance:** prove click/tap, keyboard, cancellation, and any supported spoken confirmation in browser tests. No successful ASR or LLM result may commit session state before that action.

### VM-P0-2 — ADDRESSED: exact ASR spelling is not treated as semantic certainty

The current candidate order is:

1. normalize the single transcript spelling;
2. merge deterministic phonetic alternatives with the exact spelling;
3. filter every proposal by length and fixed crossings;
4. ask the local LLM only when that deterministic set is empty;
5. require explicit confirmation for every remaining proposal.

ASR output is already an orthographic guess. “Exact transcript match” does not mean “the player intended this crossword spelling.” `SEA`/`SEE`, `PAIR`/`PEAR`, and `SOLE`/`SOUL` are now represented as alternatives where the deterministic pronunciation groups cover them.

**Current policy:** the exact transcript is one proposal, never proof. Deterministic phonetic variants are combined before optional LLM variants, and the complete set passes through pattern filtering.

No candidate source auto-commits; the component, application path, and browser journeys require an explicit Confirm action.

### VM-P0-3 — PARTIALLY ADDRESSED: stale-result protection exists, with coverage gaps

The current worktree now binds each operation to an operation ID, puzzle ID, and `voiceSessionFingerprint`. It retains current puzzle/session refs, cancels when the fingerprint changes, places puzzle/entry/pattern/revision in `VoiceAnswerIntent`, and revalidates again in both `App.tsx` and `confirmVoiceEntry` before commit. This substantially closes the originally observed captured-prop overwrite path.

Remaining weaknesses:

- tests cover delayed transcription and delayed same-ID resolution, but not every capture/STT/LLM await boundary;
- the fingerprint serializes growing session records/events during render and repeated guards instead of using a cheap monotonic domain revision;
- content changes with the same puzzle ID are included in the current puzzle fingerprint;
- `confirmVoiceEntry` resolves `entryId` again from the current puzzle, although the component/App preflight checks should use that current entry consistently too;
- the non-intent helper is private to the application module.

Replace the JSON fingerprint with an application/domain revision token when the domain exposes one, and complete the missing await-boundary adversarial tests.

**Required test:** begin recording, change a crossing and separately replace the puzzle before the transcript resolves; neither result may mutate current state or open a stale preview/chooser.

### VM-P0-4 — ADDRESSED IN SOURCE: microphone tracks now stop before decode

`voiceCapture.stop()` now calls an idempotent `stopTracksImmediately()` before stopping the recorder and before awaiting blob/decode work. Recorder stop has a two-second failure timeout; cancel stops tracks, stops the recorder when possible, and settles the recording promise.

This is the right implementation direction and matches the media-capture privacy requirement. It is not covered by a direct `voiceCapture` test, so the guarantee remains unproven across normal stop, recorder error, timeout, cancellation during decode, disabling Voice mode, puzzle replacement, and unmount.

**Required acceptance:** add those lifecycle tests and a browser check that the microphone privacy indicator/track state clears immediately when the UI leaves listening.

### VM-P0-5 — the working tree is validated, but the staged artifact is not proven

The voice files and integration moved between staged and working states during review. An earlier checkpoint failed on inconsistent solver component props. After concurrent changes, the working tree passed `npm run web:build` at 00:39 CEST and the targeted voice/model tests remained green.

The current focused working tree is validated, but a passing mutable working tree is not a reproducible release artifact. Exact index/checkout verification is intentionally not performed here because the standing session constraint forbids staging, committing, or reverting changes.

**Required acceptance:** in a release checkout, prove the intended coherent file set from a clean worktree/checkout and record the build commit hash. Do not rely on untracked files satisfying imports from a separately staged integration file.

---

## 5. `VoiceSolveControl.tsx` review

### What is strong

- The visible phases—idle, listening, transcribing, resolving—are understandable.
- A monotonically increasing operation ID plus puzzle/session fingerprints suppresses ordinary late component updates.
- Cancellation aborts the worker request, stops a retained capture, clears timers, and hides pending choices.
- Entry lookup is typed as found/missing/ambiguous, and the named entry is selected before optional LLM work.
- All candidates, including LLM candidates, pass through the deterministic application filter.
- The LLM receives the spoken phrase, length, pattern, and locale—not the clue text or solution.
- One and many candidates now both require a separate confirmation action.
- Candidate text is rendered safely through React with bounded UI structure.
- The microphone button has a visible label, accessible name, and recording pressed state.
- An aria-live status exposes the main phases.
- Resource-only unmount cleanup is separated from visible state transitions.

### VM-P1-1 — ADDRESSED: referenced entry is selected before resolution

The current component calls `onSelectEntry(entry)` immediately after unique lookup and before candidate work. Its component test checks this callback.

The Voice browser journey now proves that the referenced entry remains selected and that ghost preview letters appear in the grid before confirmation. A broader correction-flow journey remains useful.

### VM-P1-2 — ADDRESSED: compute cancellation and retry/readiness state are synchronized

The speech client now resolves cancellation immediately and terminates/recreates the worker, which is the appropriate hard-cancel fallback while Transformers.js lacks pipeline abort. It rejects every other affected pending job and publishes `uninstalled`; `App.tsx` subscribes to those transitions, and the browser journey proves cancel → retry from the setup panel without reopening the app. Model preparation cancellation is exposed through the speech setup action.

Remaining acceptance is broader device/runtime measurement rather than the previously observed stale-readiness defect.

### VM-P1-3 — the global candidate modal is the wrong default and incomplete as implemented

For a single candidate, move confirmation into the named entry and clue spine as a ghost preview. For several candidates, use an anchored chooser that preserves the grid/clue context. The current page-level picker focuses the first candidate and handles Escape, but it does not:

- restore focus to the microphone or selected grid cell;
- give correct option semantics and keyboard navigation to candidate buttons inside `role="list"`;
- preserve candidate focus when selection changes: updating `pending.selectedSurface` reruns the `[pending]` effect and focuses the first candidate again;
- restore focus on Escape, Cancel, backdrop dismissal, or invalidation (successful Confirm is the only path that currently restores the voice-button focus);
- expose a non-persistent in-grid preview; it shows the pattern in the dialog instead.

If the chooser retains `aria-modal="true"`, it must actually trap focus and make the background inert. Prefer an anchored, non-modal pattern only if its screen-reader announcement, arrow-key/Tab behavior, Escape behavior, and focus restoration are tested. Store the opener and restore it on confirm, cancel, dismissal, invalidation, and error.

### VM-P1-4 — PARTIALLY ADDRESSED: actionable status layout remains a visual gate

The current `.voice-status` allows wrapping and no longer applies the previously reported `overflow: hidden`. It remains a compact action-bar surface, so the smallest supported viewport still needs a screenshot/accessibility check for long permission and compatibility messages.

Short-lived phase text may be compact. Errors and recovery actions need a non-truncated status surface near the microphone, with a route to Model setup where appropriate.

### VM-P1-5 — ADDRESSED: unmount cleanup no longer calls React state setters

The current component has `releaseResources()` for operation invalidation, abort, capture cancellation, and timer cleanup; the unmount effect calls that resource-only function. Add unmount tests in listening, transcribing, resolving, and pending-confirmation states so this contract remains protected.

---

## 6. `voiceSolve.ts` review

### What is strong

- Browser speech APIs do not leak into application policy.
- `VoiceCommand`, parse failures, candidates, and fill failures are typed.
- Number/direction parsing is deterministic and testable.
- Answer normalization, length checks, crossing constraints, and candidate deduplication are centralized.
- Found/missing/ambiguous entry lookup is explicit.
- Rebus entries are explicitly rejected.
- Intent-bearing confirmation checks puzzle, entry, pattern, and session fingerprint.
- Fill uses existing domain entry events and refuses paused/incompatible/stale snapshots.
- Existing letters are checked before overwrite.

### VM-P1-6 — ADDRESSED: number grammar is bounded and covered

The current parser rejects malformed additive sequences such as “one two,” constrains `and`, repairs positionally interpreted `for/four`, `to/two`, and `won/one`, combines `a cross`, and removes the bounded filler `answer is`. This is substantially better for the required three-part command.

Application tests now exercise digits, ordinals, compound cardinals, punctuation, `a cross`, filler, common ASR repairs, malformed sequences, and transcript bounds. Keep the repair aliases confined to the clue-number slot, and return an ambiguity if a repair maps to two real entries.

Required corpus cases include digits, ordinals, compound cardinals, punctuation, `a cross`, filler phrases, repeated digits, common homophones, and malformed multi-number strings.

### VM-P1-7 — ADDRESSED: voice now uses canonical domain normalization

`normalizeVoiceAnswer` now delegates to `normalizeCrosswordAnswer` from the domain package, removing the earlier voice-specific duplicate.

Still make the supported alphabet/locale an explicit puzzle capability and test parity across typed import, generator, and voice paths.

### VM-P1-8 — ADDRESSED FOR V1: rebus entries are explicitly rejected

The current component rejects a referenced rebus entry before resolution, and the application commit returns `unsupported-rebus` as a second guard.

Direct application coverage protects the rejection and the UI path reports the unsupported case. A later design still needs cell-token segmentation rather than ordinary character length.

### VM-P1-9 — ADDRESSED IN THE MAIN FLOW: lookup reports ambiguity

`lookupVoiceEntry` now returns `found | missing | ambiguous`, and the component refuses ambiguous puzzle content. Duplicate-entry coverage protects that distinction; there is no exported convenience lookup that collapses it.

### VM-P1-10 — model length constraints do not match the domain

Local exact matching can handle any entry length, while `SpokenAnswerRequest` accepts only lengths 3–15. Longer themed/Sunday entries and any legal two-letter format fail only when homophone expansion is needed.

Tie bounds to the validated puzzle format or return a typed unsupported-entry result before invoking the broker.

---

## 7. `broker.ts` and model-boundary review

### What is strong

- The operation is narrow and separate from construction candidate generation.
- Request length, pattern, locale, and suggestion count are bounded.
- The broker requires the local model to be loaded and rejects work while busy.
- Adapter output is structurally validated and capped at the requested count.
- The WebLLM completion path connects abort to engine interruption.
- Application-layer filtering still owns entry compatibility.

### VM-P1-11 — ADDRESSED: spoken-answer output now rejects non-JSON

The latest adapter parses the spoken-answer response with `JSON.parse`, requires an array, and returns `undefined` for prose/non-JSON. The broker then rejects that result as invalid model output. A regression test covers newline prose.

Use WebLLM's schema-constrained JSON mode as the generation contract as well as strict post-validation; do not restore recovery parsing.

### VM-P1-12 — ADDRESSED FOR THE SPOKEN-ANSWER PROMPT: data is delimited

The spoken-answer prompt now serializes the request as JSON inside an explicit untrusted-data delimiter and tells the model not to treat its values as instructions. This is the correct minimum prompt boundary; local inference and final deterministic filtering remain important defense layers.

Move from prompt-only JSON instruction to the runtime's structured-output/schema facility and retain final deterministic filtering.

### VM-P1-13 — PARTIALLY ADDRESSED: speech is operation-safe; model client is not

The speech protocol now validates bounded finite audio, bounded transcript/error payloads, optional confidence, void prepare/unload results, and operation identity. Tests cover wrong-operation rejection. The generic model client still records no expected operation and settles a matching request ID even if the worker response names another operation; its success payload is validated only as a generic broker envelope at that boundary.

Apply the same expected-operation and operation-specific result validation to `modelClient.ts`; spoken-answer resolution must yield only bounded candidate objects before its promise resolves.

### VM-P1-14 — shared LLM contention is not surfaced as a product state

Construction, clue composition, and homophone expansion share one model broker. The broker correctly rejects overlapping work as busy, but Voice mode turns that into a generic error. The UI should say that local construction is using the model and offer deterministic confirmation/retry without losing the transcript.

Do not create a second large LLM instance merely to avoid the state. Use one explicit local-inference scheduler.

---

## 8. Speech capture, worker, and model lifecycle

### VM-P1-15 — the model is not reproducibly pinned

`speechConfig.ts` names `onnx-community/whisper-tiny.en` with `revision: 'main'`. That branch can change without a repository change. There is no model manifest recording immutable revision, expected files/hashes, license decision, runtime version, quantization, or measured bytes.

Create a speech-model manifest parallel to the LLM manifest and pin an immutable revision. Record provenance/license review and verify the actual requested artifact set in CI or release preparation.

### VM-P1-16 — unload is presented as uninstall

The worker's unload operation disposes the in-memory pipeline. Because browser caching is enabled, it does not delete the downloaded artifacts. The UI then sets state to `uninstalled` and tells the player the model was unloaded.

Separate these states and actions:

- not cached;
- downloading with progress;
- cached;
- loading into memory;
- ready;
- unloading from memory;
- deleting cached model.

Provide both **Unload from memory** and **Delete downloaded speech model**. Report measured cache/storage use after each operation.

### VM-P1-17 — device probing and fallback are optimistic

The presence of `navigator.gpu` chooses WebGPU. The probe does not request an adapter, validate required features/limits, estimate memory, validate ONNX compatibility, or exercise a tiny inference. WASM is selected only when the property is absent; a failed WebGPU prepare does not offer a deliberate WASM fallback.

Probe in stages and show the chosen backend. Benchmark WASM against the supported-device latency and battery budget before declaring it supported.

### VM-P1-18 — hard cancellation leaves application/model readiness inconsistent

The current client terminates a canceled worker and creates a fresh one, setting its own state to `uninstalled`. This is a sound way to guarantee compute release, but `App.tsx` maintains a separate `speechState` and does not observe the reset. The setup panel and `VoiceSolveControl` can therefore still treat speech as ready even though the replacement worker has no transcriber.

Unify the readiness source or expose client state transitions as an observable subscription. State transitions, affected pending jobs, and retry behavior should be tested as a table, including cancel before start, during prepare, during inference, after result, and during unload.

### VM-P1-19 — capture resampling is a quality risk

The capture code downmixes and linearly interpolates to 16 kHz. Linear interpolation is simple, but downsampling without a low-pass filter can alias high-frequency content and reduce command accuracy on noisy microphones.

Treat resampling as measurable signal-processing infrastructure. Prefer a browser/native offline audio resampler or a tested band-limited implementation, and compare command-slot accuracy on representative recordings before optimizing further.

### VM-P1-20 — model download truthfulness is incomplete

The UI reports “about 75 MB” from a constant and performs a coarse free-quota check. It does not show requested files, live progress, actual cached bytes, interruption recovery, or whether first use requires contacting the remote model host.

The privacy copy should say “processed locally after a one-time model download,” identify the download host/source, and distinguish network download from inference. Offline readiness must be measured, not inferred from `useBrowserCache = true`.

### VM-P1-21 — audio validation makes an avoidable full-buffer copy

`parseSpeechWorkerRequest` validates samples with `[...value.payload.samples].every(Number.isFinite)`. At the accepted 60-second ceiling this expands 960,000 float samples into a new ordinary JavaScript array just before inference, increasing allocation, garbage collection, and battery pressure.

Use `Float32Array.prototype.every` or a bounded indexed loop without spreading. Keep the size/finite checks, add a maximum-allocation regression test, and measure the worker boundary on the largest accepted recording.

---

## 9. Privacy and security assessment

### Good boundaries already present

- Microphone capture originates only from an explicit button action.
- Audio samples are transferred to a browser worker rather than an application backend.
- Raw audio and transcripts are not written to repository persistence in the reviewed code.
- Optional spelling expansion uses the in-browser LLM worker.
- Clue text and solution are not included in the spelling-expansion request.
- React escapes transcript/candidate text before display.
- Deterministic length/crossing checks remain the final candidate gate.

### Release requirements

- Pin and inventory every remote model artifact.
- State that initial model installation is a network operation.
- Verify CSP and worker/model asset origins for the production host.
- Prove with browser network capture that recording/transcription/LLM resolution sends no audio, transcript, clue, grid, profile, or solution data.
- Provide real cache deletion and verify it from browser storage inspection.
- Bound transcript and note lengths at worker boundaries and remove control/bidi characters from secondary display.
- Add a visible microphone lifecycle indicator that cannot say idle while a track remains live.
- Keep diagnostics opt-in and local; never record raw transcript/audio by default.

---

## 10. Test review

### Current evidence

| Command | Result at review snapshot |
|---|---|
| application voice test | 5/5 pass |
| web VoiceSolveControl + speech client tests | 7/7 pass |
| model-runtime suite | 22/22 pass |
| `npm run web:build` | PASS at 00:39 CEST; earlier moving-tree checkpoint failed |

These tests establish useful pure happy paths. They do not establish a safe voice feature.

### Tests corrected during the live review

- The exact-answer component test now requires the named entry to be selected, asserts that `onFill` has not run after transcription, and clicks Confirm before expecting a fill intent.
- The local-model picker test now requires candidate selection and then a separate Confirm action.
- These are valuable corrections, but neither test re-renders with a changed puzzle/session before acceptance, and neither exercises the real application commit or browser grid.

### Missing unit/property tests

- invalid cardinal sequences and common ASR token confusions;
- the canonical `<number> <direction> <answer>` grammar as the first-class path, including unambiguous target resolution before answer expansion;
- `a cross`, ordinals above nineteenth, filler words, repeated numbers, punctuation, and bounded transcript length;
- duplicate number/direction entries;
- canonical normalization parity with typed/imported answers;
- rebus rejection;
- candidate-set commutativity/deduplication and pattern invariants;
- `VoiceAnswerIntent`, fingerprint, stale-session, same-ID puzzle replacement, and current-entry relookup;
- atomic confirm against a changed session and one-action undo semantics;
- entry lengths outside 3–15.

### Missing component tests

- visible named-entry selection and parsed `number + direction + answer` echo in the real grid/clue spine;
- single-candidate contextual preview followed by commit through click, Enter, and supported voice confirmation (the current test covers only dialog click);
- cancel/Escape/dismissal with no fill and focus restoration;
- chooser semantics, keyboard navigation, and either correct modal containment or correct non-modal behavior;
- selection of a non-first candidate without focus jumping back to the first option;
- permission denial and unsupported capability;
- recording timeout;
- cancellation during getUserMedia, decode, STT, and LLM resolution;
- disable Voice mode/unmount during every phase;
- session edit and puzzle replacement during every phase;
- replacement by different content carrying the same puzzle ID;
- LLM busy/unloaded between transcript and resolution;
- actionable status not visually clipped.

### Missing worker/capture tests

- track stop timing and idempotence;
- recorder error and missing `onstop` timeout;
- audio decode failure and empty/NaN/oversized samples;
- hard cancel followed by successful re-prepare/retry with App state synchronized;
- cancellation while another request is pending, with every affected promise settled;
- operation-specific model-client response validation (speech now has initial coverage);
- busy request isolation and dispose with pending work;
- prepare failure, WebGPU fallback, interrupted download, cache hit, actual delete;
- one recorded local fixture through the real worker/model path.

### Missing browser journeys

1. Enable Voice mode, explicitly install, reload, and prove readiness/offline behavior.
2. Use a fake transcript provider to parse the canonical three-part command, select and echo the referenced clue, preview, confirm, and atomically fill.
3. Exercise `SEA`/`SEE` ambiguity with no auto-fill.
4. Change a crossing and replace a puzzle while an operation is pending.
5. Cancel at listening/transcribing/resolving and inspect live media tracks/workers.
6. Complete preview and ambiguity choice by keyboard, voice confirmation where supported, and touch-sized controls.
7. Deny permission, retry, and continue ordinary keyboard solving unaffected.
8. Inspect network requests during recording/resolution after install.
9. Unload memory, reload it from cache, then delete cache and prove storage is reclaimed.

### Mutation targets

Mutation testing must kill changes that:

- call fill before confirmation;
- skip current-pattern revalidation;
- accept one conflicting crossing;
- retain an edited/puzzle-replaced pending intent;
- replace `every` with `some` in compatibility rules;
- remove candidate deduplication;
- accept malformed JSON or an over-limit candidate list;
- ignore abort or fail to stop a media track;
- treat unload as cache deletion;
- bypass the local-only worker route.

---

## 11. Target interaction/state machine

```text
disabled
  └─ enable ──> unavailable | model-not-cached | model-cached | ready

ready
  └─ press Mic ──> requesting-permission
       ├─ denied/error ──> ready + actionable status
       └─ granted ──> listening
            ├─ cancel ──> stop tracks immediately ──> ready
            └─ stop/timeout ──> stop tracks immediately ──> transcribing
                 ├─ cancel/failure ──> ready
                 └─ transcript ──> parse-reference
                      ├─ invalid ──> ready + retry
                      └─ unique entry ──> select entry + bind intent token
                           └─ resolve candidates
                                ├─ stale/zero/error ──> ready + retry
                                └─ one or many ──> in-grid preview / anchored chooser
                                     ├─ cancel/stale ──> ready, no mutation
                                     └─ confirm ──> atomic current-state revalidation/fill
```

Explicit commit is mandatory even when there is one candidate; a page-blocking modal is not. The intent token contains at least puzzle ID, entry ID, current pattern/value fingerprint, and operation ID. A changed token cannot commit.

---

## 12. Agent work packages

Agents are not alone in the worktree. Each package must preserve other agents' changes, own only its assigned files, and request cross-owner interfaces rather than editing overlapping modules concurrently.

### Voice application agent

**Own:** `packages/application/src/voiceSolve.ts`, its tests, and application exports.

- preserve the new bounded number grammar/canonical normalization and add exhaustive tests;
- preserve the new typed lookup/rebus outcomes and add their missing tests;
- replace whole-session JSON fingerprinting with a cheap monotonic revision/content identity;
- resolve the current entry by ID again at commit and remove/bury unsafe convenience APIs;
- define candidate-source merging without auto-commit;
- finish the atomic confirm operation and one-action undo semantics;
- add property/mutation coverage.

### Voice UI agent

**Own:** `VoiceSolveControl.tsx`, its tests, and voice-specific CSS.

- render one candidate as an in-grid ghost preview and ambiguity as an anchored chooser;
- keep the parsed number and direction visible throughout preview/correction;
- preserve pending intent invalidation and add delayed-operation tests;
- prove the referenced entry is visibly selected in both grid and clue spine;
- implement and test the anchored chooser's option semantics, keyboard behavior, and focus restoration;
- preserve actionable errors without truncation;
- preserve resource/state cleanup separation and test unmount in every phase.

### Speech infrastructure agent

**Own:** capture, speech config/client/worker, and their tests.

- preserve immediate/idempotent track shutdown and add direct lifecycle tests;
- validate operation-specific protocol payloads;
- preserve hard-cancel worker termination, settle all affected jobs, and synchronize App readiness/re-prepare;
- remove the full-buffer spread from finite-sample validation;
- implement immutable manifest, progress, cache detection, memory unload, and cache deletion;
- add staged capability probing and measured backend fallback;
- benchmark resampling/STT with recorded fixtures.

### Model broker agent

**Own:** broker/protocol/WebLLM spoken-answer operation and tests.

- preserve strict JSON rejection and the delimited untrusted payload;
- use WebLLM schema-constrained output instead of relying only on prompt compliance;
- align entry-length bounds with puzzle capabilities;
- preserve final application filtering;
- surface busy/cancel states precisely;
- ensure model-client pending jobs verify response operation and value shape (speech client now does).

### Integration/test agent

**Own after the interfaces settle:** the sole Voice-related `App.tsx` integration, Model setup UI, Playwright journeys, privacy/offline evidence, and build gate.

- preserve current-ref commits and add same-ID replacement/import safeguards;
- prove cancel-on-change and current-state commit behavior in Playwright;
- distinguish install/cache/load/unload/delete states;
- prove preference persistence without auto-record/download;
- integrate without regressing the solver parity contract;
- produce a clean staged artifact and exact verification log.

No two active agents should own `App.tsx`.

---

## 13. Release gate

Voice mode remains development-only until:

- [ ] every candidate requires explicit confirmation;
- [ ] exact ASR spelling is not equated with semantic certainty;
- [ ] pending results are bound to and revalidated against current puzzle/session state;
- [ ] microphone tracks stop immediately on every terminal path;
- [ ] STT/download cancellation releases compute rather than only ignoring output;
- [ ] the speech model uses an immutable, reviewed manifest;
- [ ] memory unload and cache deletion are distinct, truthful actions;
- [ ] WebGPU/WASM support is measured on the supported-device matrix;
- [ ] rebus and unsupported alphabet/length behavior is explicit;
- [ ] preview/chooser focus, cancellation, and restoration work by voice, touch, and keyboard;
- [ ] a network trace proves local-only speech and answer resolution after installation;
- [ ] offline readiness and cache deletion are browser-tested;
- [ ] targeted mutation tests pass with no critical survivor;
- [ ] the exact staged repository artifact passes typecheck, build, unit, worker, Playwright, accessibility, privacy/content, and idle-energy gates.

---

## 14. Final assessment

The best parts are worth keeping: the command-first interaction the two players actually use, pure parse/filter/fill policy, typed entry lookup, intent-bearing current-state revalidation, immediate microphone-track shutdown, worker isolation, narrow LLM operation, deterministic crossing protection, and local-first data flow. The concurrent fixes materially improved safety during this review.

The largest remaining design work is the quality and cost of the proposal pipeline: exact transcripts must not suppress homophones, the LLM should be a bounded fallback rather than the first deterministic-spelling substitute, the global modal should become a grid/clue-aware preview, and model installation/cancellation must match what the UI promises. Voice may misunderstand speech; it must never misunderstand silently, overwrite newer work, imply that cached data was deleted when it was not, or leave a microphone/compute job running after the interface says it stopped.

## Current verification checkpoint — 2026-09-05

The implementation gates now covered by deterministic tests and Chromium
journeys are green: confirmation is required before fill, current puzzle and
session fingerprints invalidate stale proposals, microphone tracks stop on
terminal paths, speech cache readiness is verified, WebGPU falls back to WASM,
and cancellation replaces a stuck worker. `npm --workspace @crossword/web run
test` passes 78 tests and `npm run e2e:ci` passes 39 journeys.

The release checklist remains intentionally open for real microphone/model
accuracy, device coverage, privacy traces, mutation review, and measured
performance/energy. No fake-worker result is being promoted as hardware proof.
