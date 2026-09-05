import { useEffect, useRef, useState } from 'react';
import {
  filterVoiceCandidates,
  lookupVoiceEntry,
  parseVoiceCommand,
  voiceEntryHasRebus,
  voiceEntryPattern,
  voicePhoneticCandidates,
  voicePuzzleFingerprint,
  voiceSessionFingerprint,
  type VoiceAnswerIntent,
  type VoiceCandidate
} from '@crossword/application';
import type { SpokenAnswerRequest } from '@crossword/model-runtime';
import type { Entry, PuzzleDocument, SolveSessionSnapshot } from '@crossword/domain';
import type { SpeechCapability } from '../speechConfig';
import { createMicrophoneCapture, type MicrophoneCapture } from '../voiceCapture';
import type { SpeechWorkerClient } from '../workers/speechClient';

type VoiceSolveControlProps = Readonly<{
  enabled: boolean;
  llmReady: boolean;
  puzzle: PuzzleDocument;
  session: SolveSessionSnapshot;
  speechClient: SpeechWorkerClient | null;
  speechReady: boolean;
  speechCapability: SpeechCapability;
  onFill: (entry: Entry, answer: string, intent: VoiceAnswerIntent) => boolean;
  onSelectEntry: (entry: Entry) => void;
  onPreviewChange?: (preview: VoicePreview | null) => void;
  onOpenSetup: () => void;
  resolveSpokenAnswer: (request: SpokenAnswerRequest, signal: AbortSignal) => Promise<readonly VoiceCandidate[]>;
}>;

export type VoicePreview = Readonly<{
  entryId: Entry['id'];
  answer: string;
}>;

type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'resolving';

type PendingAnswer = Readonly<{
  entry: Entry;
  transcript: string;
  pattern: string;
  candidates: readonly VoiceCandidate[];
  intent: VoiceAnswerIntent;
  selectedSurface?: string;
}>;

type OperationContext = Readonly<{
  id: number;
  puzzleId: string;
  puzzleRevision: string;
  sessionRevision: string;
}>;

const MAX_RECORDING_MS = 10_000;

export function VoiceSolveControl({
  enabled,
  llmReady,
  puzzle,
  session,
  speechClient,
  speechReady,
  speechCapability,
  onFill,
  onSelectEntry,
  onPreviewChange,
  onOpenSetup,
  resolveSpokenAnswer
}: VoiceSolveControlProps) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const operationContextRef = useRef<OperationContext | null>(null);
  const operationIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const firstCandidateRef = useRef<HTMLButtonElement | null>(null);
  const voiceButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const latestPuzzleRef = useRef(puzzle);
  const latestSessionRef = useRef(session);
  latestPuzzleRef.current = puzzle;
  latestSessionRef.current = session;
  const currentSessionRevision = voiceSessionFingerprint(session);
  const currentPuzzleRevision = voicePuzzleFingerprint(puzzle);

  useEffect(() => {
    onPreviewChange?.(pending ? {
      entryId: pending.entry.id,
      answer: pending.selectedSurface ?? ''
    } : null);
  }, [onPreviewChange, pending]);

  function clearTimer() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  function releaseResources() {
    operationIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    captureRef.current?.cancel();
    captureRef.current = null;
    clearTimer();
    operationContextRef.current = null;
  }

  function restoreOpenerFocus() {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else voiceButtonRef.current?.focus({ preventScroll: true });
  }

  function cancelOperation(message = 'Voice input canceled.') {
    releaseResources();
    setPhase('idle');
    setPending(null);
    setStatus(message);
    restoreOpenerFocus();
  }

  function cancelPending(message = 'Voice answer canceled.') {
    setPending(null);
    setStatus(message);
    restoreOpenerFocus();
  }

  useEffect(() => {
    if (!enabled) cancelOperation('');
  }, [enabled]);

  useEffect(() => () => releaseResources(), []);

  useEffect(() => {
    const operation = operationContextRef.current;
    if (operation && (
      operation.puzzleId !== puzzle.id
      || operation.puzzleRevision !== currentPuzzleRevision
      || operation.sessionRevision !== currentSessionRevision
    )) {
      cancelOperation('Voice input canceled because the puzzle or grid changed.');
      return;
    }
    if (pending && (
      pending.intent.puzzleId !== puzzle.id
      || pending.intent.puzzleRevision !== currentPuzzleRevision
      || pending.intent.sessionRevision !== currentSessionRevision
    )) {
      cancelPending('Voice answer canceled because the puzzle or grid changed.');
    }
  }, [currentPuzzleRevision, currentSessionRevision, pending, puzzle.id]);

  useEffect(() => {
    if (!pending) return;
    firstCandidateRef.current?.focus();
  }, [pending?.intent.entryId, pending?.intent.sessionRevision]);

  useEffect(() => {
    if (!pending && phase === 'idle' && status.startsWith('Choose')) setStatus('');
  }, [pending, phase, status]);

  function currentOperation(id: number, controller: AbortController): boolean {
    const operation = operationContextRef.current;
    return operation?.id === id
      && operation.puzzleId === latestPuzzleRef.current.id
      && operation.puzzleRevision === voicePuzzleFingerprint(latestPuzzleRef.current)
      && operation.sessionRevision === voiceSessionFingerprint(latestSessionRef.current)
      && operationIdRef.current === id
      && controllerRef.current === controller
      && !controller.signal.aborted;
  }

  function finishResolution(id: number, controller: AbortController, message: string) {
    if (!currentOperation(id, controller)) return;
    controllerRef.current = null;
    operationContextRef.current = null;
    setPhase('idle');
    setStatus(message);
    restoreOpenerFocus();
  }

  async function resolveRecording(id: number, controller: AbortController, client: SpeechWorkerClient, capture: MicrophoneCapture) {
    try {
      const samples = await capture.stop();
      if (!currentOperation(id, controller)) return;
      const transcription = await client.transcribe(samples, controller.signal);
      if (!transcription.ok) {
        finishResolution(id, controller, transcription.error.message);
        return;
      }

      const parsed = parseVoiceCommand(transcription.value.text);
      if (!parsed.ok) {
        finishResolution(id, controller, parsed.message);
        return;
      }
      const lookup = lookupVoiceEntry(puzzle, parsed.command);
      if (lookup.status === 'missing') {
        finishResolution(id, controller, `There is no ${parsed.command.number} ${parsed.command.direction} entry in this puzzle.`);
        return;
      }
      if (lookup.status === 'ambiguous') {
        finishResolution(id, controller, `The puzzle has more than one ${parsed.command.number} ${parsed.command.direction} entry.`);
        return;
      }
      const entry = lookup.entry;
      if (voiceEntryHasRebus(puzzle, entry)) {
        finishResolution(id, controller, 'Voice entry is not available for rebus answers.');
        return;
      }

      onSelectEntry(entry);
      setPhase('resolving');
      const pattern = voiceEntryPattern(entry, session);
      const intent: VoiceAnswerIntent = {
        puzzleId: puzzle.id,
        puzzleRevision: currentPuzzleRevision,
        entryId: entry.id,
        pattern,
        sessionRevision: operationContextRef.current?.sessionRevision ?? voiceSessionFingerprint(session)
      };
      let candidates = filterVoiceCandidates(entry, session, [
        { surface: parsed.command.spokenAnswer },
        ...voicePhoneticCandidates(parsed.command.spokenAnswer)
      ]);
      if (candidates.length === 0) {
        if (!llmReady && candidates.length === 0) {
          finishResolution(id, controller, 'No compatible spelling found. Load the local language model to resolve phonetic alternatives.');
          return;
        }
        if (llmReady) {
          const generated = await resolveSpokenAnswer({
            spokenAnswer: parsed.command.spokenAnswer,
            targetLength: entry.cellIds.length,
            pattern,
            locale: navigator.language || 'en-US',
            maxSuggestions: 8
          }, controller.signal);
          if (!currentOperation(id, controller)) return;
          candidates = filterVoiceCandidates(entry, session, [...candidates, ...generated]);
        }
      }

      if (candidates.length === 0) {
        finishResolution(id, controller, 'No compatible spelling was found. Try saying the clue and answer again.');
        return;
      }
      controllerRef.current = null;
      operationContextRef.current = null;
      setPhase('idle');
      setPending({
        entry,
        transcript: transcription.value.text,
        pattern,
        candidates,
        intent,
        selectedSurface: candidates.length === 1 ? candidates[0]?.surface : undefined
      });
      setStatus(candidates.length === 1 ? 'Confirm the proposed answer.' : 'Choose an answer, then confirm it.');
    } catch (error) {
      if (!currentOperation(id, controller)) return;
      finishResolution(id, controller, error instanceof Error ? error.message : 'Voice input failed.');
    } finally {
      clearTimer();
      captureRef.current = null;
    }
  }

  async function beginRecording() {
    if (!speechCapability.supported) {
      setStatus(speechCapability.reason ?? 'Voice input is unavailable in this browser.');
      return;
    }
    if (!speechReady || !speechClient) {
      setStatus('Install the speech model in Model setup before recording.');
      onOpenSetup();
      return;
    }

    const controller = new AbortController();
    const id = operationIdRef.current + 1;
    operationIdRef.current = id;
    controllerRef.current = controller;
    operationContextRef.current = {
      id,
      puzzleId: puzzle.id,
      puzzleRevision: currentPuzzleRevision,
      sessionRevision: currentSessionRevision
    };
    setPending(null);
    setPhase('listening');
    setStatus('Listening. Press the microphone again when you are done.');
    try {
      const capture = await createMicrophoneCapture();
      if (!currentOperation(id, controller)) {
        capture.cancel();
        return;
      }
      captureRef.current = capture;
      timeoutRef.current = window.setTimeout(() => {
        void stopRecording();
      }, MAX_RECORDING_MS);
    } catch (error) {
      finishResolution(id, controller, error instanceof Error ? error.message : 'Microphone permission was not granted.');
    }
  }

  async function stopRecording() {
    const controller = controllerRef.current;
    const capture = captureRef.current;
    const id = operationIdRef.current;
    if (!controller || !capture) {
      cancelOperation();
      return;
    }
    clearTimer();
    setPhase('transcribing');
    setStatus('Transcribing locally.');
    await resolveRecording(id, controller, speechClient!, capture);
  }

  function handleVoiceButton() {
    if (pending) {
      const candidate = pending.candidates.find((item) => item.surface === pending.selectedSurface);
      if (candidate) acceptCandidate(candidate);
      else setStatus('Choose an answer before confirming.');
      return;
    }
    if (phase === 'idle') {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : voiceButtonRef.current;
      void beginRecording();
      return;
    }
    if (phase === 'listening') {
      void stopRecording();
      return;
    }
    cancelOperation();
  }

  function acceptCandidate(candidate: VoiceCandidate) {
    if (!pending) return;
    const currentPuzzle = latestPuzzleRef.current;
    const currentSession = latestSessionRef.current;
    if (
      pending.intent.puzzleId !== currentPuzzle.id
      || pending.intent.puzzleRevision !== voicePuzzleFingerprint(currentPuzzle)
      || currentSession.puzzleId !== pending.intent.puzzleId
      || pending.intent.entryId !== pending.entry.id
      || pending.intent.sessionRevision !== voiceSessionFingerprint(currentSession)
      || pending.intent.pattern !== voiceEntryPattern(pending.entry, currentSession)
    ) {
      cancelPending('Voice answer canceled because the puzzle or grid changed.');
      return;
    }
    if (!onFill(pending.entry, candidate.surface, pending.intent)) {
      setStatus('That answer no longer fits the current crossing letters.');
      return;
    }
    setPending(null);
    setStatus(`Filled ${candidate.surface}.`);
    restoreOpenerFocus();
  }

  function chooseCandidate(candidate: VoiceCandidate) {
    setPending((current) => current ? { ...current, selectedSurface: candidate.surface } : current);
    setStatus(`Proposed answer ${candidate.surface}. Confirm to fill it.`);
  }

  if (!enabled) return null;

  return (
    <div className="voice-solve-control">
      <button
        aria-label={pending ? pending.selectedSurface ? 'Confirm voice answer' : 'Choose a voice answer' : phase === 'idle' ? 'Start voice solve' : 'Cancel voice solve'}
        aria-pressed={phase === 'listening'}
        className={`action-button voice-button${phase !== 'idle' ? ' is-listening' : ''}`}
        id="voice-solve-button"
        title={pending ? 'Confirm the proposed voice answer' : phase === 'idle' ? 'Say a clue number, direction, and answer' : 'Cancel voice solve'}
        type="button"
        onClick={handleVoiceButton}
        ref={voiceButtonRef}
      >
        <span aria-hidden="true">{phase === 'idle' ? 'Mic' : 'Stop'}</span>
      </button>
      <span aria-live="polite" className="voice-status" role="status">{status}</span>

      {pending && (
        <div
          className="voice-candidate-anchor"
        >
            <div
              aria-labelledby="voice-candidate-title"
              className="voice-candidate-dialog"
              role="region"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                cancelPending();
              }}
            >
            <h2 id="voice-candidate-title">{pending.candidates.length === 1 ? 'Review voice answer' : 'Choose an answer'}</h2>
            <p>
              {pending.entry.number} {pending.entry.direction} · pattern {pending.pattern} · heard “{pending.transcript}”
            </p>
            <div
              aria-label="Voice answer choices"
              className="voice-candidate-list"
              role="radiogroup"
            >
              {pending.candidates.map((candidate, index) => (
                <button
                  aria-label={candidate.note ? `${candidate.surface}, ${candidate.note}` : candidate.surface}
                  aria-checked={pending.selectedSurface === candidate.surface}
                  className="voice-candidate"
                  id={`voice-candidate-${index}`}
                  key={`${candidate.surface}-${index}`}
                  ref={index === 0 ? firstCandidateRef : undefined}
                  role="radio"
                  type="button"
                  onClick={() => chooseCandidate(candidate)}
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const choices = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.voice-candidate') ?? []);
                    const currentIndex = choices.indexOf(event.currentTarget);
                    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
                    const nextIndex = event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? choices.length - 1
                        : (currentIndex + offset + choices.length) % choices.length;
                    const nextCandidate = pending.candidates[nextIndex];
                    if (nextCandidate) {
                      chooseCandidate(nextCandidate);
                      choices[nextIndex]?.focus();
                    }
                  }}
                >
                  <strong>{candidate.surface}</strong>
                  {candidate.note && <span>{candidate.note}</span>}
                </button>
              ))}
            </div>
            <div className="voice-candidate-actions">
              <button
                className="action-button blue-action"
                disabled={!pending.selectedSurface}
                type="button"
                onClick={() => {
                  const candidate = pending.candidates.find((item) => item.surface === pending.selectedSurface);
                  if (candidate) acceptCandidate(candidate);
                }}
              >
                Confirm answer
              </button>
              <button className="action-button" type="button" onClick={() => cancelPending()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}