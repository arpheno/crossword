# Voice solve mode

## Goal

Add an optional, local-first voice input mode that lets a solver say a clue
reference and answer, for example, "1 across oreo". The app resolves the
referenced entry and fills the answer when exactly one compatible spelling is
available. When speech could map to multiple compatible spellings, it presents
the choices for the solver to confirm by click, tap, or keyboard.

Typing, existing grid navigation, and the normal solve flow remain unchanged.

## Product decisions

- Voice mode is off by default and persisted as a local preference.
- Speech recognition, transcript parsing, candidate filtering, and LLM
  inference remain in the browser. No microphone audio, transcript, grid, or
  clue text is sent to an application server.
- Use `@huggingface/transformers` in a dedicated module worker with a pinned,
  English Whisper-compatible ONNX model. Start with a small English model that
  fits the device budget; require WebGPU when available and permit a documented
  WASM fallback only if its latency is acceptable on the supported hardware.
- Lazy-download the STT model only after the solver enables voice mode and
  explicitly chooses to install it. Cache it through the browser runtime;
  expose its download size and a clear uninstall action.
- Treat the STT transcript as untrusted. Never fill an entry solely because a
  model claims it is correct. The final answer must match entry length, the
  letters already in the grid, and the candidate selection rules below.
- The existing WebLLM model is optional and distinct from the STT model. It is
  used only to expand a recognized answer phrase into spelling/homophone
  candidates after deterministic local normalization fails to find a unique
  match.

## Interaction design

1. Add a microphone icon button beside the existing solve controls. It is
   visible only when Voice mode is enabled, has an accessible name, and exposes
   `aria-pressed` while recording.
2. In Model setup, add a Voice mode preference and a separate Speech model
   section with install, readiness, storage, and uninstall states. Enabling the
   preference does not start recording or download a model.
3. Pressing the microphone requests browser microphone permission, records one
   utterance, and shows a compact live state: listening, transcribing,
   resolving, or an actionable error. Pressing it again cancels the operation.
4. Parse utterances such as `1 across oreo`, `one down oreo`, and
   `twenty-three across oreo` into `{ number, direction, spokenAnswer }`.
   Normalize case, punctuation, spacing, and number words. Reject incomplete
   commands with a short status and leave the grid unchanged.
5. Resolve the clue number and direction against the active puzzle. If no entry
   exists, report that fact; if exactly one entry exists, select it before any
   candidate work begins.
6. Build the entry pattern from the current session, for example `O_E_`, and
   filter every candidate by normalized entry length and all fixed characters.
7. If one candidate remains, open a confirmation surface that states the clue
   reference and proposed answer. A solver can confirm with Enter/click/tap or
   cancel with Escape. Confirmation fills every cell through the same domain
   event path as typed letters, then selects/focuses the entry.
8. If several candidates remain, present them as a single accessible dialog
   list. Each option includes its spelling; selecting one performs the same
   confirmation/fill flow. Keep the original transcript available as secondary
   context, not as an answer option.
9. If no candidates remain, offer retry and cancel only. Do not overwrite
   existing letters or guess a replacement.

## Architecture

### Domain and application

- Add a pure voice-command module in `packages/application` with types for
  `VoiceCommand`, `VoiceParseResult`, `VoiceCandidate`, and resolution states.
- Implement parsing of clue numbers and directions independently of browser
  speech APIs. Unit-test number words, ordinal-like noise, malformed commands,
  and duplicate/invalid clue references.
- Implement deterministic candidate normalization and pattern matching there.
  This module owns the rule that a candidate must be alphabetic after crossword
  normalization, exactly match entry length, and agree with all entered cells.
- Add an application operation to turn an accepted entry answer into repeated
  domain `enterLetter` calls (or a domain-level transactional entry-fill use
  case if event history requires one). It must preserve crossing behavior,
  timestamps, completion detection, and persistence semantics.

### Speech recognition

- Create `apps/web/src/workers/speechClient.ts` and `speechWorker.ts` following
  the existing model worker client protocol: typed request/response messages,
  request IDs, cancellation, worker disposal, and no React state inside the
  worker.
- The worker receives microphone audio chunks or a completed `AudioBuffer`,
  resamples them to the model's expected sample rate, invokes the pinned
  Transformers.js ASR pipeline, and returns a transcript plus confidence data
  when available.
- Probe feature support before installation: secure context, `getUserMedia`,
  `MediaRecorder` or Web Audio capture, worker support, WebGPU/WASM capability,
  storage quota, and browser model compatibility. Unsupported environments
  show a disabled control with an explanatory status rather than attempting a
  network download.
- Cancel must stop media tracks immediately, abort transcription, ignore late
  worker responses, and clear recording UI state. Dispose tracks and workers on
  unmount.

### LLM spelling expansion

- Extend the existing `ModelWorkerClient` and model-runtime broker with a
  narrow `resolve-spoken-answer` operation rather than overloading candidate
  generation for construction.
- Define a strict structured response: an array of at most eight candidate
  spellings, each with an optional short pronunciation/sense note. The prompt
  receives only the spoken answer phrase, target length, known-letter pattern,
  and locale; it must return JSON only and must not generate clue answers from
  clue text.
- Validate returned JSON at the worker boundary, then run every result through
  the application pattern matcher. Deduplicate normalized spellings. Model
  output never bypasses deterministic filtering or user confirmation.
- Candidate resolution order: exact normalized transcript match; local spelling
  variants; LLM expansion if the local model is loaded; otherwise show the
  transcript-compatible candidates already known locally or an unavailable
  status. Do not auto-load the LLM during an active solve.

### Web integration

- Keep voice UI state in a focused `VoiceSolveControl` component and hook;
  `App.tsx` remains the owner of puzzle/session mutations and passes the current
  entry pattern plus an accepted-answer callback.
- Persist only the Voice mode preference. Do not persist microphone audio or
  raw transcripts. Add an opt-in local diagnostic event only if the product
  event schema and retention policy permit it.
- Use the existing modal/dialog conventions for the candidate picker. Support
  touch targets, focus trapping, Escape cancellation, Enter selection, and an
  `aria-live` status region for recording/transcription progress.

## Delivery phases

### Phase 1: deterministic command resolution

- Add application parsing, entry lookup, pattern matching, and accepted-answer
  fill use cases with exhaustive unit coverage.
- Add the disabled Voice mode preference, feature probe, microphone control
  shell, and a fake transcript provider for development.
- Verify that a fake `1 across oreo` command selects the intended entry and
  cannot change a mismatched or partially conflicting fill.

### Phase 2: browser speech worker

- Add and pin the Transformers.js and ONNX runtime dependencies, speech model
  manifest, install lifecycle, cache/storage reporting, and worker protocol.
- Implement capture, cancellation, permissions, and error recovery.
- Test the worker client with a fake worker and exercise one real-device smoke
  path with a recorded fixture, avoiding microphone dependence in CI.

### Phase 3: LLM disambiguation and picker

- Add the typed model-broker operation, constrained prompt, schema validation,
  deterministic post-filtering, and candidate dialog.
- Add click, tap, keyboard, cancellation, and stale-result tests. Verify that
  every ambiguous command requires explicit selection and that candidates
  incompatible with crossings never render.

### Phase 4: hardening and release

- Add supported-browser matrix testing on desktop and touch hardware, including
  denied permissions, offline first use, low storage, missing WebGPU, model
  download interruption, puzzle replacement during transcription, and rapid
  start/cancel cycles.
- Review model licenses, download sizes, CSP/worker asset paths, accessibility,
  local privacy disclosure, and battery/network behavior.
- Instrument only opt-in, local diagnostics; confirm that active solving does
  not trigger model downloads, network inference, or unsolicited LLM loading.

## Acceptance criteria

- With Voice mode enabled and models installed, saying a valid command fills an
  entry only after deterministic validation and explicit confirmation.
- A single compatible spelling is proposed once; multiple compatible spellings
  are selectable by mouse, touch, and keyboard; zero matches leave the grid
  untouched.
- Existing letters at crossings are always preserved and incompatible proposed
  spellings are never shown.
- Recording and inference can be canceled at every stage without leaked tracks,
  stale dialog updates, or session mutations.
- Voice mode stays optional, works offline after model installation, and sends
  no speech, transcript, puzzle, or clue data to a server.
- Unit, worker-client, component, and Playwright coverage pass alongside the
  existing web build and accessibility checks.