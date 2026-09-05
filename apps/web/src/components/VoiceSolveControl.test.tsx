// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFixturePuzzle,
  createSession,
  enterLetter,
  indexPuzzle,
  type Entry,
} from '@crossword/domain';
import type { SpokenAnswerRequest } from '@crossword/model-runtime';
import type { SpeechWorkerClient } from '../workers/speechClient';
import { createMicrophoneCapture } from '../voiceCapture';
import { VoiceSolveControl } from './VoiceSolveControl';

vi.mock('../voiceCapture', () => ({
  createMicrophoneCapture: vi.fn()
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createCapture = vi.mocked(createMicrophoneCapture);
const puzzle = createFixturePuzzle();
const index = indexPuzzle(puzzle);
const session = createSession(puzzle, index);
const speechCapability = { supported: true, device: 'wasm' as const };

function fakeSpeechClient(text: string): SpeechWorkerClient {
  return {
    prepare: vi.fn(async () => ({ ok: true as const, value: undefined })),
    transcribe: vi.fn(async () => ({ ok: true as const, value: { text } })),
    unload: vi.fn(async () => ({ ok: true as const, value: undefined })),
    state: () => 'ready',
    dispose: vi.fn()
  };
}

function renderControl(options: Readonly<{
  text: string;
  llmCandidates?: readonly { surface: string; note?: string }[];
  speechReady?: boolean;
  speechClient?: SpeechWorkerClient | null;
  puzzle?: typeof puzzle;
  session?: typeof session;
  resolveSpokenAnswer?: (request: SpokenAnswerRequest, signal: AbortSignal) => Promise<readonly { surface: string; note?: string }[]>;
  onFill?: (entry: Entry, answer: string) => boolean;
  onSelectEntry?: (entry: Entry) => void;
  onOpenSetup?: () => void;
}>) {
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const onFill = options.onFill ?? vi.fn(() => true);
  const onSelectEntry = options.onSelectEntry ?? vi.fn();
  const onOpenSetup = options.onOpenSetup ?? vi.fn();
  const resolveSpokenAnswer = options.resolveSpokenAnswer ?? vi.fn(async () => options.llmCandidates ?? []);
  const client = options.speechClient === undefined ? fakeSpeechClient(options.text) : options.speechClient;

  const renderView = (nextPuzzle = options.puzzle ?? puzzle, nextSession = options.session ?? session) => {
    root.render(
      <VoiceSolveControl
        enabled
        llmReady={Boolean(options.llmCandidates)}
        onFill={onFill}
        onSelectEntry={onSelectEntry}
        onOpenSetup={onOpenSetup}
        puzzle={nextPuzzle}
        resolveSpokenAnswer={resolveSpokenAnswer}
        session={nextSession}
        speechCapability={speechCapability}
        speechClient={client}
        speechReady={options.speechReady ?? true}
      />
    );
  };

  act(() => {
    renderView();
  });

  return {
    rootElement,
    onFill,
    onSelectEntry,
    onOpenSetup,
    resolveSpokenAnswer,
    rerender(next: Readonly<{ puzzle?: typeof puzzle; session?: typeof session }> = {}) {
      act(() => renderView(next.puzzle ?? options.puzzle ?? puzzle, next.session ?? options.session ?? session));
    },
    unmount() {
      act(() => root.unmount());
      rootElement.remove();
    }
  };
}

function microphoneCapture() {
  return {
    stop: vi.fn(async () => new Float32Array([0.1, 0.2])),
    cancel: vi.fn()
  };
}

describe('VoiceSolveControl', () => {
  beforeEach(() => {
    createCapture.mockReset();
  });

  it('proposes an exact spoken answer and requires confirmation', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({ text: '1 across care' });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());

    expect(rendered.rootElement.querySelectorAll('.voice-candidate')).toHaveLength(1);
    expect(rendered.resolveSpokenAnswer).not.toHaveBeenCalled();
    expect(rendered.onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({ number: 1, direction: 'across' }));
    expect(rendered.onFill).not.toHaveBeenCalled();
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')?.textContent).toContain('pattern ....');
    await act(async () => rendered.rootElement.querySelector<HTMLButtonElement>('.voice-candidate-dialog .blue-action')?.click());
    expect(rendered.onFill).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1, direction: 'across' }),
      'CARE',
      expect.objectContaining({ entryId: expect.any(String), pattern: '....', puzzleId: puzzle.id })
    );
    expect(rendered.rootElement.querySelector('.voice-candidate-overlay')).toBeNull();
    rendered.unmount();
  });

  it('uses the local model for homophones and lets the user choose a compatible candidate', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({
      text: '1 across see',
      llmCandidates: [
        { surface: 'CARE', note: 'attention' },
        { surface: 'CARD', note: 'greeting' }
      ]
    });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());

    expect(rendered.rootElement.querySelectorAll('.voice-candidate')).toHaveLength(2);
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')?.textContent).toContain('heard “1 across see”');
    expect(document.activeElement).toBe(rendered.rootElement.querySelector('.voice-candidate'));
    await act(async () => rendered.rootElement.querySelectorAll<HTMLButtonElement>('.voice-candidate')[1]?.click());
    expect(rendered.onFill).not.toHaveBeenCalled();
    await act(async () => rendered.rootElement.querySelector<HTMLButtonElement>('.voice-candidate-dialog .blue-action')?.click());
    expect(rendered.onFill).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1, direction: 'across' }),
      'CARD',
      expect.objectContaining({ entryId: expect.any(String), pattern: '....', puzzleId: puzzle.id })
    );
    expect(rendered.resolveSpokenAnswer).toHaveBeenCalledWith(expect.objectContaining({ pattern: '....', targetLength: 4 }), expect.any(AbortSignal));
    rendered.unmount();
  });

  it('shows deterministic homophones without requiring the local model', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const entry = puzzle.entries.find((candidate) => candidate.cellIds.length === 4);
    if (!entry) throw new Error('Four-cell fixture entry is missing');
    const rendered = renderControl({
      text: `${entry.number} ${entry.direction} pair`,
      puzzle,
      session,
      llmCandidates: undefined
    });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());

    expect(rendered.rootElement.querySelectorAll('.voice-candidate')).toHaveLength(3);
    expect(rendered.resolveSpokenAnswer).not.toHaveBeenCalled();
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')?.textContent).toContain('PARE');
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')?.textContent).toContain('PEAR');
    rendered.unmount();
  });

  it('selects the focused candidate during keyboard navigation before confirmation', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({
      text: '1 across see',
      llmCandidates: [
        { surface: 'CARE' },
        { surface: 'CARD' }
      ]
    });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());

    const choices = rendered.rootElement.querySelectorAll<HTMLButtonElement>('.voice-candidate');
    const first = choices[0];
    const second = choices[1];
    if (!first || !second) throw new Error('Voice candidates are missing');
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })));

    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-checked')).toBe('true');
    await act(async () => rendered.rootElement.querySelector<HTMLButtonElement>('.voice-candidate-dialog .blue-action')?.click());
    expect(rendered.onFill).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1, direction: 'across' }),
      'CARD',
      expect.anything()
    );
    rendered.unmount();
  });

  it('restores focus to the microphone after canceling a pending answer', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({ text: '1 across care' });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');
    trigger.focus();

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    const cancel = [...rendered.rootElement.querySelectorAll<HTMLButtonElement>('.voice-candidate-dialog button')]
      .find((button) => button.textContent === 'Cancel');
    if (!cancel) throw new Error('Voice cancel button is missing');
    await act(async () => cancel.click());

    expect(document.activeElement).toBe(trigger);
    expect(rendered.onFill).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('does not confirm when Enter is pressed on Cancel', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({ text: '1 across care' });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    const cancel = [...rendered.rootElement.querySelectorAll<HTMLButtonElement>('.voice-candidate-dialog button')]
      .find((button) => button.textContent === 'Cancel');
    if (!cancel) throw new Error('Voice cancel button is missing');
    await act(async () => cancel.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));

    expect(rendered.onFill).not.toHaveBeenCalled();
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')).not.toBeNull();
    await act(async () => cancel.click());
    rendered.unmount();
  });

  it('cancels the chooser on Escape and restores opener focus', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({ text: '1 across care' });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');
    trigger.focus();

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    const candidate = rendered.rootElement.querySelector<HTMLButtonElement>('.voice-candidate');
    if (!candidate) throw new Error('Voice candidate is missing');
    candidate.focus();
    await act(async () => candidate.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));

    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')).toBeNull();
    expect(rendered.onFill).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    rendered.unmount();
  });

  it('discards a delayed transcription after the session changes', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const client = fakeSpeechClient('unused');
    let releaseTranscription: (() => void) | undefined;
    client.transcribe = vi.fn(() => new Promise<Awaited<ReturnType<SpeechWorkerClient['transcribe']>>>((resolve) => {
      releaseTranscription = () => resolve({ ok: true, value: { text: '1 across care' } });
    }));
    const rendered = renderControl({ text: 'unused', speechClient: client });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    await vi.waitFor(() => expect(client.transcribe).toHaveBeenCalledTimes(1));

    rendered.rerender({ session: enterLetter(session, puzzle, index, 'X') });
    releaseTranscription?.();
    await act(async () => undefined);

    expect(rendered.onFill).not.toHaveBeenCalled();
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')).toBeNull();
    rendered.unmount();
  });

  it('discards a delayed resolution after same-id puzzle replacement', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    let releaseResolution: (() => void) | undefined;
    const resolveSpokenAnswer = vi.fn(() => new Promise<readonly { surface: string }[]>((resolve) => {
      releaseResolution = () => resolve([{ surface: 'CARE' }]);
    }));
    const rendered = renderControl({ text: '1 across see', llmCandidates: [], resolveSpokenAnswer });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    await vi.waitFor(() => expect(resolveSpokenAnswer).toHaveBeenCalledTimes(1));

    const replacement = { ...puzzle, title: `${puzzle.title} replacement` };
    rendered.rerender({ puzzle: replacement, session: createSession(replacement, indexPuzzle(replacement)) });
    releaseResolution?.();
    await act(async () => undefined);

    expect(rendered.onFill).not.toHaveBeenCalled();
    expect(rendered.rootElement.querySelector('.voice-candidate-dialog')).toBeNull();
    rendered.unmount();
  });

  it('releases listening capture resources on unmount', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const rendered = renderControl({ text: '1 across care' });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    rendered.unmount();

    expect(capture.cancel).toHaveBeenCalledTimes(1);
  });

  it('aborts transcription when unmounted', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    const client = fakeSpeechClient('unused');
    let transcriptionSignal: AbortSignal | undefined;
    client.transcribe = vi.fn((_samples, signal) => {
      transcriptionSignal = signal;
      return new Promise<Awaited<ReturnType<SpeechWorkerClient['transcribe']>>>(() => undefined);
    });
    const rendered = renderControl({ text: 'unused', speechClient: client });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    await vi.waitFor(() => expect(transcriptionSignal).toBeDefined());
    rendered.unmount();

    expect(transcriptionSignal?.aborted).toBe(true);
  });

  it('aborts resolution when unmounted', async () => {
    const capture = microphoneCapture();
    createCapture.mockResolvedValue(capture);
    let resolutionSignal: AbortSignal | undefined;
    const resolveSpokenAnswer = vi.fn((_request: SpokenAnswerRequest, signal: AbortSignal) => {
      resolutionSignal = signal;
      return new Promise<readonly { surface: string }[]>(() => undefined);
    });
    const rendered = renderControl({ text: '1 across see', llmCandidates: [], resolveSpokenAnswer });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());
    await act(async () => trigger.click());
    await vi.waitFor(() => expect(resolutionSignal).toBeDefined());
    rendered.unmount();

    expect(resolutionSignal?.aborted).toBe(true);
  });

  it('opens model setup when the speech model is not ready', async () => {
    const rendered = renderControl({ text: '1 across care', speechReady: false, speechClient: null });
    const trigger = rendered.rootElement.querySelector<HTMLButtonElement>('#voice-solve-button');
    if (!trigger) throw new Error('Voice trigger is missing');

    await act(async () => trigger.click());

    expect(rendered.onOpenSetup).toHaveBeenCalledTimes(1);
    expect(createCapture).not.toHaveBeenCalled();
    rendered.unmount();
  });
});