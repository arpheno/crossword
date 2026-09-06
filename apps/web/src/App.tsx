import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkSession,
  clearCell,
  clearIncorrect,
  checksUsed,
  createRealPuzzle,
  entrySolveState,
  enterLetter,
  enterRebus,
  hideCheck,
  indexPuzzle,
  moveSelection,
  pauseSession,
  revealCell,
  resumeSession,
  selectCell,
  touchSession,
  toggleDirection,
  updateActiveTime,
  revealsUsed,
  scoreForSession,
  type CellId,
  type Direction,
  type Entry,
  type PuzzleDocument,
  type SolveSessionSnapshot
} from '@crossword/domain';
import { confirmVoiceEntry, createSessionUseCases, voiceEntryPattern, voicePuzzleFingerprint, voiceSessionFingerprint, type ConstructionProgress, type VoiceAnswerIntent, type VoiceCandidate } from '@crossword/application';
import {
  createContinuityExport,
  createIndexedDbContinuityRepository,
  createIndexedDbPuzzleRepository,
  createIndexedDbSessionRepository,
  parseContinuityExport
} from '@crossword/persistence';
import type { SpokenAnswerRequest } from '@crossword/model-runtime';
import { ClueColumn } from './components/legacy/ClueColumn';
import { LegacyGrid } from './components/legacy/LegacyGrid';
import { SolveClock } from './components/SolveClock';
import { VoiceSolveControl, type VoicePreview } from './components/VoiceSolveControl';
import { useLocalModelController, type ModelSetupIntent } from './localModelController';
import type { ModelWorkerClient } from './workers/modelClient';
import { createBrowserConstructorWorker, type ConstructorWorkerClient } from './workers/constructorClient';
import { createConstructionClient, loadConstructionAssets } from './constructionClient';
import { DAY_RECIPES, constructableDays, dayRecipe, type DayOfWeek } from '@crossword/application';
import { localModelManifest } from './modelConfig';
import { createNytCrosswordClient, type NytWeekday } from './nytApi';
import { browserSpeechCapability, speechModel } from './speechConfig';
import { deleteSpeechModelCache, inspectSpeechModelCache, type SpeechCacheReport } from './speechCache';
import { createBrowserSpeechWorkerClient, type SpeechProgress, type SpeechState, type SpeechWorkerClient } from './workers/speechClient';

const initialPuzzle = createRealPuzzle();
const initialIndex = indexPuzzle(initialPuzzle);
const sessionUseCases = createSessionUseCases(createIndexedDbSessionRepository());
const nytClient = createNytCrosswordClient();
const continuityRepository = createIndexedDbContinuityRepository();
const puzzleRepository = createIndexedDbPuzzleRepository();

function focusInput(cellId: CellId) {
  // scoped to the grid: clue-column answer cells share data-cell-id
  const input = document
    .querySelector<HTMLInputElement>(`#crossword-container input[data-cell-id="${cellId}"]`)
  if (!input) return false;
  input.focus({ preventScroll: true });
  return true;
}

function App() {
  const [puzzle, setPuzzle] = useState<PuzzleDocument>(initialPuzzle);
  const index = useMemo(() => indexPuzzle(puzzle), [puzzle]);
  const [session, setSession] = useState<SolveSessionSnapshot>(() =>
    sessionUseCases.restart(initialPuzzle, initialIndex, Date.now())
  );
  const [hydrated, setHydrated] = useState(false);
  const puzzleRef = useRef(puzzle);
  const indexRef = useRef(index);
  const sessionRef = useRef(session);
  puzzleRef.current = puzzle;
  indexRef.current = index;
  sessionRef.current = session;
  const [setupOpen, setSetupOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [modelSetupIntent, setModelSetupIntent] = useState<ModelSetupIntent>({ type: 'settings' });
  const [dataNotice, setDataNotice] = useState('');
  const [weekday, setWeekday] = useState<NytWeekday>('monday');
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [isDarkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('crossword-dark') === '1';
    } catch {
      return false;
    }
  });
  const [voiceMode, setVoiceMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('crossword-voice') === '1';
    } catch {
      return false;
    }
  });
  const [baseSpeechCapability] = useState(() => browserSpeechCapability());
  const [speechDevice, setSpeechDevice] = useState(baseSpeechCapability.device);
  const speechCapability = { ...baseSpeechCapability, device: speechDevice };
  const modelController = useLocalModelController();
  const modelSnapshot = modelController.snapshot;
  const modelState = modelSnapshot.brokerState;
  const modelBusy = ['checking-compatibility', 'checking-cache', 'downloading', 'loading-runtime', 'cancelling', 'unloading', 'deleting-cache'].includes(modelSnapshot.phase);
  const explicitFocusCellRef = useRef<CellId | null>(null);
  const [speechState, setSpeechState] = useState<SpeechState>('uninstalled');
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechPreparing, setSpeechPreparing] = useState(false);
  const [speechProgress, setSpeechProgress] = useState<SpeechProgress | null>(null);
  const [speechCache, setSpeechCache] = useState<SpeechCacheReport>({ status: 'unknown', bytes: 0, cachedFiles: 0, expectedFiles: 0, corruptFiles: 0 });
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const speechClientRef = useRef<SpeechWorkerClient | null>(null);
  const speechStateUnsubscribeRef = useRef<(() => void) | null>(null);
  const speechPrepareControllerRef = useRef<AbortController | null>(null);
  const constructorClientRef = useRef<ConstructorWorkerClient | null>(null);
  const constructionRef = useRef<Awaited<ReturnType<typeof createConstructionClient>> | null>(null);
  const constructionModelClientRef = useRef<ModelWorkerClient | null>(null);
  const constructionAbortControllerRef = useRef<AbortController | null>(null);
  const [constructBusy, setConstructBusy] = useState(false);
  const [constructionProgress, setConstructionProgress] = useState<ConstructionProgress | null>(null);
  const [constructVariant, setConstructVariant] = useState(0);
  const [constructDay, setConstructDay] = useState<DayOfWeek>('monday');
  const [showSolvedModal, setShowSolvedModal] = useState(false);
  const [solvedList, setSolvedList] = useState<readonly { id: string; title: string; activeMs: number; completedAt: string }[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('crossword-solved') ?? '[]');
      } catch {
        return [];
      }
    }
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let nextPuzzle = initialPuzzle;
      try {
        const currentPuzzleId = localStorage.getItem('crossword-current-puzzle-id');
        if (currentPuzzleId) {
          const storedPuzzle = await puzzleRepository.get(currentPuzzleId);
          if (storedPuzzle) nextPuzzle = storedPuzzle;
        }
      } catch {
        // A restricted or unavailable store falls back to the bundled puzzle.
      }
      const nextIndex = indexPuzzle(nextPuzzle);
      const loaded = await sessionUseCases.load(nextPuzzle, nextIndex);
      if (cancelled) return;
      setPuzzle(nextPuzzle);
      setSession(loaded);
      setHydrated(true);
    })().catch(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const announce = () => setUpdateReady(true);
    const controllerChanged = () => window.location.reload();
    window.addEventListener('crossword-sw-update', announce);
    navigator.serviceWorker?.addEventListener('controllerchange', controllerChanged);
    return () => {
      window.removeEventListener('crossword-sw-update', announce);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);

  useEffect(() => () => {
    speechPrepareControllerRef.current?.abort();
    speechStateUnsubscribeRef.current?.();
    speechClientRef.current?.dispose();
    constructionAbortControllerRef.current?.abort();
    constructorClientRef.current?.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void inspectSpeechModelCache(speechDevice).then((report) => {
      if (!cancelled) setSpeechCache(report);
    });
    return () => {
      cancelled = true;
    };
  }, [speechDevice]);

  function speechClient(): SpeechWorkerClient {
    const existing = speechClientRef.current;
    if (existing) return existing;
    const client = createBrowserSpeechWorkerClient();
    speechClientRef.current = client;
    speechStateUnsubscribeRef.current = client.subscribe?.(setSpeechState) ?? null;
    setSpeechState(client.state());
    return client;
  }

  // completion flow: when the grid fills (or the owner marks it complete),
  // record the solve and open the solved modal
  const completedRecorded = useRef('');
  function recordCompletion() {
    if (session.status !== 'complete') return;
    setShowSolvedModal(true);
    if (completedRecorded.current === puzzle.id) return;
    completedRecorded.current = puzzle.id;
    const record = {
      id: puzzle.id,
      title: puzzle.title,
      activeMs: session.activeMs,
      completedAt: new Date().toISOString()
    };
    setSolvedList((current) => {
      const next = [record, ...current.filter((item) => item.id !== puzzle.id)].slice(0, 50);
      try {
        localStorage.setItem('crossword-solved', JSON.stringify(next));
      } catch {
        // restricted storage: the modal still shows this session
      }
      return next;
    });
  }

  function handleComplete() {
    if (session.status !== 'complete') {
      setDataNotice('Complete every cell correctly before recording the puzzle.');
      return;
    }
    recordCompletion();
  }

  useEffect(() => {
    if (session.status === 'complete') recordCompletion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  // legacy hook: body[data-active-direction] drives the grid highlight
  // color (blue when Down is active, orange otherwise)
  useEffect(() => {
    document.body.dataset.activeDirection = session.selection.direction;
  }, [session.selection.direction]);

  // legacy night-mode mechanism: color-scheme on :root flips the ported
  // stylesheet's dark tokens
  useEffect(() => {
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('crossword-dark', isDarkMode ? '1' : '0');
    } catch {
      // restricted storage: night mode still applies for this session
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('crossword-voice', voiceMode ? '1' : '0');
    } catch {
      // restricted storage: voice mode still applies for this session
    }
  }, [voiceMode]);

  // Roving focus inside the grid only: after arrows, focus follows the
  // selection. Clue-list clicks focus manually (focus starts outside).
  const selectedCellId = session.selection.cellId;
  useEffect(() => {
    if (!selectedCellId) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.closest('#crossword-container')) {
      focusInput(selectedCellId);
    }
  }, [selectedCellId]);

  useEffect(() => {
    if (!hydrated) return;
    const persist = () => {
      const stamped = updateActiveTime(session, Date.now());
      void sessionUseCases.save(puzzle, index, stamped).catch(() => undefined);
    };
    const timer = window.setTimeout(persist, 250);
    const flush = () => persist();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [hydrated, session, puzzle, index]);

  const acrossEntries = puzzle.entries.filter((entry) => entry.direction === 'across');
  const downEntries = puzzle.entries.filter((entry) => entry.direction === 'down');

  const checkMode = session.checkPresentation.mode === 'on';
  const evaluations = session.checkPresentation.evaluations;
  const incorrectCellIds = Object.entries(evaluations)
    .filter(([, evaluation]) => evaluation.state === 'incorrect')
    .map(([cellId]) => cellId as CellId);
  const verifiedEntries = puzzle.entries.filter((entry) => entrySolveState(entry, session) === 'verified');
  const solvedCount = verifiedEntries.length;
  const totalEntries = puzzle.entries.length;
  const halfCompleted = totalEntries > 0 && solvedCount / totalEntries >= 0.5;
  const score = scoreForSession(session);
  const checkCount = checksUsed(session);
  const revealCount = revealsUsed(session);

  function handleSelectCell(cellId: CellId, toggleIfSelected = false) {
    setSession((currentSession) => {
      if (toggleIfSelected && currentSession.selection.cellId === cellId) {
        return selectCell(touchSession(currentSession, Date.now()), index, cellId, currentSession.selection.direction, true);
      }
      if (currentSession.selection.cellId === cellId) return currentSession;
      const current: Direction = currentSession.selection.direction;
      const keepsDirection = index.entryAt.get(cellId)?.[current];
      const nextDirection: Direction = keepsDirection
        ? current
        : index.entryAt.get(cellId)?.across
          ? 'across'
          : 'down';
      return selectCell(touchSession(currentSession, Date.now()), index, cellId, nextDirection);
    });
  }

  function handleFocusCell(cellId: CellId) {
    if (explicitFocusCellRef.current === cellId) {
      explicitFocusCellRef.current = null;
      return;
    }
    setSession((currentSession) => {
      if (currentSession.selection.cellId === cellId) return currentSession;
      const current = currentSession.selection.direction;
      const nextDirection = index.entryAt.get(cellId)?.[current]
        ? current
        : index.entryAt.get(cellId)?.across
          ? 'across'
          : 'down';
      return selectCell(touchSession(currentSession, Date.now()), index, cellId, nextDirection);
    });
  }

  function handleSelectEntry(entry: Entry) {
    const cellId = entry.cellIds.find((candidate) => !session.entered[candidate]) ?? entry.cellIds[0];
    if (!cellId) return;
    explicitFocusCellRef.current = cellId;
    setSession((current) => selectCell(touchSession(current, Date.now()), index, cellId, entry.direction));
    if (!focusInput(cellId)) explicitFocusCellRef.current = null;
  }

  function handleSelectPattern(entry: Entry, position: number) {
    const cellId = entry.cellIds[position];
    if (!cellId) return;
    explicitFocusCellRef.current = cellId;
    setSession((current) => selectCell(touchSession(current, Date.now()), index, cellId, entry.direction));
    if (!focusInput(cellId)) explicitFocusCellRef.current = null;
  }

  function handleEnterRebus(token: string) {
    setSession((current) => enterRebus(touchSession(current, Date.now()), puzzle, index, token));
  }

  function handleEnter(value: string) {
    const letters = value.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!letters) return;
    setSession((current) => {
      let next = current;
      for (const letter of letters) {
        next = enterLetter(touchSession(next, Date.now()), puzzle, index, letter);
      }
      return next;
    });
  }

  function handleClear() {
    setSession((current) => clearCell(touchSession(current, Date.now()), puzzle, index));
  }

  function handleClearIncorrect() {
    if (incorrectCellIds.length === 0) return;
    setSession((current) => clearIncorrect(current, puzzle, index));
  }

  function handleMove(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
    setSession((current) => moveSelection(touchSession(current, Date.now()), puzzle, index, key));
  }

  function handleToggleDirection() {
    setSession((current) => toggleDirection(touchSession(current, Date.now()), index));
  }

  function handleCheckAll() {
    if (checkMode) {
      setSession((current) => hideCheck(current));
      return;
    }
    setSession((current) => checkSession(touchSession(current, Date.now()), puzzle, index, 'puzzle').snapshot);
  }

  function handleRevealAll() {
    if (!window.confirm('Reveal the entire grid? This counts as assistance.')) return;
    setSession((current) => revealCell(touchSession(current, Date.now()), puzzle, index, 'puzzle'));
  }

  function handlePauseToggle() {
    setSession((current) => current.paused ? resumeSession(current, Date.now()) : pauseSession(current, Date.now()));
  }

  async function handleApplyUpdate() {
    try {
      await sessionUseCases.save(puzzle, index, updateActiveTime(session, Date.now()));
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    } catch {
      setDataNotice('The update is ready, but the current solve could not be saved. Try again.');
    }
  }

  async function replacePuzzle(nextPuzzle: PuzzleDocument, notice: string) {
    let nextNotice = notice;
    if (nextPuzzle.provenance.source === 'local-construction') {
      try {
        await puzzleRepository.publish(nextPuzzle);
        localStorage.setItem('crossword-current-puzzle-id', nextPuzzle.id);
      } catch {
        nextNotice = `${notice} It could not be saved for reload.`;
      }
    }
    setVoicePreview(null);
    setHydrated(false);
    setPuzzle(nextPuzzle);
    setSession(sessionUseCases.restart(nextPuzzle, indexPuzzle(nextPuzzle), Date.now()));
    setHydrated(true);
    setDataNotice(nextNotice);
  }

  async function handleExport() {
    try {
      const serialized = await createContinuityExport({
        preferences: { theme: isDarkMode ? 'dark' : 'light' },
        profiles: {},
        puzzles: [puzzle],
        sessions: [session],
        events: session.events
      });
      const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `crossword-${puzzle.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setDataNotice('Continuity archive exported.');
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  async function handleImport(file: File) {
    try {
      const archive = await parseContinuityExport(await file.text());
      const imported = archive.sessions.find((candidate) => candidate.puzzleId === puzzle.id);
      if (!imported) throw new Error('This archive does not contain a session for this puzzle.');
      const restored = sessionUseCases.restore(puzzle, index, imported);
      await continuityRepository.replace(JSON.stringify(archive));
      setVoicePreview(null);
      setSession(restored);
      setDataNotice('Continuity archive imported.');
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  async function handleLoadWeekday() {
    setPuzzleLoading(true);
    try {
      const nextPuzzle = await nytClient.loadRandom(weekday);
      await replacePuzzle(nextPuzzle, `Loaded a ${weekday} puzzle.`);
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Puzzle loading failed.');
    } finally {
      setPuzzleLoading(false);
    }
  }

  function openModelSetup(intent: ModelSetupIntent = { type: 'settings' }) {
    setModelSetupIntent(intent);
    setSetupOpen(true);
    void modelController.inspectCache();
  }

  async function handleModelPrepare() {
    const prepared = await modelController.prepare(modelSetupIntent);
    if (!prepared) {
      setDataNotice(modelController.snapshot.error?.message ?? 'Local model setup needs attention.');
      return;
    }
    setDataNotice('Local model ready. Original construction and voice solving are available offline.');
    if (modelSetupIntent.type === 'construction') {
      setSetupOpen(false);
      await runConstruction(modelSetupIntent.day as DayOfWeek);
    }
  }

  async function handleModelUnload() {
    const unloaded = await modelController.unload();
    if (unloaded) setDataNotice('Local model unloaded from memory. Downloaded files stay on this device.');
  }

  async function handleSpeechPrepare() {
    if (!speechCapability.supported) {
      setDataNotice(speechCapability.reason ?? 'Voice input is unavailable in this browser.');
      return;
    }
    setSpeechBusy(true);
    setSpeechPreparing(true);
    setSpeechState('loading');
    setSpeechProgress(null);
    const controller = new AbortController();
    speechPrepareControllerRef.current = controller;
    try {
      const estimate = await navigator.storage?.estimate();
      const preferredDevice = speechDevice;
      const hasStorageFor = (device: typeof speechDevice, cacheStatus: SpeechCacheReport['status']) =>
        cacheStatus === 'cached'
        || estimate?.quota === undefined
        || estimate.usage === undefined
        || estimate.quota - estimate.usage >= speechModel.estimatedBytesByDevice[device];
      const client = speechClient();
      let preparedDevice = preferredDevice;
      let fallbackUsed = false;
      let result;
      if (!hasStorageFor(preferredDevice, speechCache.status)) {
        if (preferredDevice !== 'webgpu') throw new Error('There is not enough local storage for the speech model.');
        const wasmCache = await inspectSpeechModelCache('wasm');
        if (!hasStorageFor('wasm', wasmCache.status)) throw new Error('There is not enough local storage for the speech model or its WASM fallback.');
        preparedDevice = 'wasm';
        fallbackUsed = true;
        setSpeechDevice('wasm');
        result = await client.prepare('wasm', controller.signal, setSpeechProgress, wasmCache.status === 'cached');
      } else {
        result = await client.prepare(preferredDevice, controller.signal, setSpeechProgress, speechCache.status === 'cached');
      }
      if (!result.ok && preferredDevice === 'webgpu' && !controller.signal.aborted) {
        const wasmCache = await inspectSpeechModelCache('wasm');
        if (!hasStorageFor('wasm', wasmCache.status)) throw new Error('There is not enough local storage for the WASM speech fallback.');
        const fallbackResult = await client.prepare('wasm', controller.signal, setSpeechProgress, wasmCache.status === 'cached');
        if (fallbackResult.ok) {
          preparedDevice = 'wasm';
          fallbackUsed = true;
          setSpeechDevice('wasm');
          result = fallbackResult;
        }
      }
      if (!result.ok) {
        setSpeechState('uninstalled');
        setSpeechCache(await inspectSpeechModelCache(preparedDevice));
        setDataNotice(result.error.message);
        return;
      }
      const report = await inspectSpeechModelCache(preparedDevice);
      setSpeechCache(report);
      if (report.status === 'cached') setDataNotice(`${fallbackUsed ? 'WebGPU was unavailable; using WASM. ' : ''}Local speech model ready. Voice solve is available offline.`);
      else {
        await client.unload();
        setSpeechState('uninstalled');
        setDataNotice('Speech loaded, but offline cache verification failed. Voice solve remains unavailable.');
      }
    } catch (error) {
      setSpeechState('uninstalled');
      setDataNotice(error instanceof Error ? error.message : 'Local speech model setup failed.');
    } finally {
      if (speechPrepareControllerRef.current === controller) speechPrepareControllerRef.current = null;
      setSpeechPreparing(false);
      setSpeechBusy(false);
    }
  }

  function handleSpeechCancel() {
    speechPrepareControllerRef.current?.abort();
    setSpeechPreparing(false);
    setSpeechState('uninstalled');
    setSpeechProgress(null);
    setSpeechBusy(false);
    setDataNotice('Speech model preparation canceled.');
    void inspectSpeechModelCache(speechDevice).then(setSpeechCache);
  }

  async function handleSpeechUnload() {
    const client = speechClientRef.current;
    if (!client) return;
    setSpeechBusy(true);
    try {
      const result = await client.unload();
      if (result.ok) {
        setSpeechState('uninstalled');
        setSpeechProgress(null);
        setDataNotice('Speech model unloaded from memory. Downloaded files were kept.');
      } else {
        setDataNotice(result.error.message);
      }
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Local speech model unload failed.');
    } finally {
      setSpeechBusy(false);
    }
  }

  async function handleSpeechDelete() {
    if (speechBusy || !['ready', 'uninstalled'].includes(speechState)) return;
    setSpeechBusy(true);
    try {
      const client = speechClientRef.current;
      if (client && speechState === 'ready') {
        const unloaded = await client.unload();
        if (!unloaded.ok) {
          setDataNotice(unloaded.error.message);
          return;
        }
        setSpeechState('uninstalled');
        setSpeechProgress(null);
      }
      await deleteSpeechModelCache();
      const report = await inspectSpeechModelCache(speechDevice);
      setSpeechCache(report);
      if (report.status === 'not-cached') setDataNotice('Downloaded speech model deleted.');
      else setDataNotice('Speech cache could not be verified as deleted.');
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Speech model deletion failed.');
    } finally {
      setSpeechBusy(false);
    }
  }

  function handleVoiceFill(entry: Entry, answer: string, intent: VoiceAnswerIntent): boolean {
    const currentPuzzle = puzzleRef.current;
    const currentIndex = indexRef.current;
    const currentSession = sessionRef.current;
    if (
      currentPuzzle.id !== intent.puzzleId
      || voicePuzzleFingerprint(currentPuzzle) !== intent.puzzleRevision
      || currentSession.puzzleId !== intent.puzzleId
      || entry.id !== intent.entryId
      || voiceSessionFingerprint(currentSession) !== intent.sessionRevision
      || voiceEntryPattern(entry, currentSession) !== intent.pattern
    ) {
      setDataNotice('Voice answer canceled because the puzzle or grid changed.');
      return false;
    }
    const result = confirmVoiceEntry(currentSession, currentPuzzle, currentIndex, entry, answer, intent);
    if (!result.ok) {
      setDataNotice(
        result.reason === 'paused'
          ? 'Resume the puzzle before entering a voice answer.'
          : result.reason === 'unsupported-rebus'
            ? 'Voice entry is not available for rebus answers.'
            : result.reason === 'stale-intent'
              ? 'Voice answer canceled because the puzzle or grid changed.'
              : 'That answer does not fit the current crossing letters.'
      );
      return false;
    }
    sessionRef.current = result.snapshot;
    setSession(result.snapshot);
    const focusCellId = entry.cellIds[0];
    if (focusCellId) focusInput(focusCellId);
    return true;
  }

  async function handleResolveSpokenAnswer(request: SpokenAnswerRequest, signal: AbortSignal): Promise<readonly VoiceCandidate[]> {
    const client = modelController.client;
    if (!client || modelState !== 'loaded') throw new Error('Load the local language model before resolving homophones.');
    const result = await client.resolveSpokenAnswer(request, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }

  function handleVoiceModeChange(enabled: boolean) {
    setVoiceMode(enabled);
    if (!enabled) setVoicePreview(null);
    if (enabled && (!speechCapability.supported || speechState !== 'ready')) openModelSetup();
  }

  const handleVoicePreviewChange = useCallback((preview: VoicePreview | null) => {
    setVoicePreview(preview);
  }, []);

  const infoAuthors = puzzle.provenance.records[0]?.source ?? 'local construction';
  async function runConstruction(day: DayOfWeek, variant = constructVariant + 1) {
    if (constructBusy) return;
    setConstructBusy(true);
    const controller = new AbortController();
    constructionAbortControllerRef.current = controller;
    setConstructionProgress({ phase: 'topology', progress: 0, attempt: 1, totalAttempts: 1, text: 'Starting local construction…' });
    try {
      const client = modelController.getClient();
      if (client.state() !== 'loaded') throw new Error('The local model is not ready yet.');
      const constructorClient = constructorClientRef.current ?? (constructorClientRef.current = createBrowserConstructorWorker());
      if (!constructionRef.current || constructionModelClientRef.current !== client || !constructionRef.current.ready()) {
        const lexicon = await loadConstructionAssets();
        constructionRef.current = createConstructionClient(client, constructorClient, lexicon, DAY_RECIPES, 'local-pinned-model');
        constructionModelClientRef.current = client;
      }
      const construction = constructionRef.current;
      if (!construction) throw new Error('Construction assets failed to initialize.');
      const recipe = dayRecipe(day);
      const result = await construction.run(
        { seed: `household-${new Date().toISOString().slice(0, 10)}:variant-${variant}`, day: recipe.day },
        { signal: controller.signal, onProgress: setConstructionProgress }
      );
      if (!result.ok) {
        if (controller.signal.aborted || result.error.code === 'cancelled') {
          setDataNotice('Construction canceled; the current puzzle was kept.');
          return;
        }
        setDataNotice(`Construction failed (${result.error.stage}/${result.error.code}): ${result.error.message}`);
        return;
      }
      await replacePuzzle(result.puzzle, `Constructed a fresh ${recipe.day} grid (attempt ${result.restartCount + 1}).`);
    } catch (error) {
      setDataNotice(controller.signal.aborted ? 'Construction canceled; the current puzzle was kept.' : error instanceof Error ? error.message : 'Construction failed.');
    } finally {
      if (constructionAbortControllerRef.current === controller) constructionAbortControllerRef.current = null;
      setConstructionProgress(null);
      setConstructBusy(false);
    }
  }

  function handleConstructionCancel() {
    constructionAbortControllerRef.current?.abort();
  }

  async function handleConstruct() {
    if (constructBusy) return;
    const client = modelController.getClient();
    if (client.state() !== 'loaded') {
      setModelSetupIntent({ type: 'construction', day: constructDay });
      setSetupOpen(true);
      setDataNotice('Prepare the local model once to construct an original puzzle.');
      void modelController.inspectCache();
      return;
    }
    const nextVariant = constructVariant + 1;
    setConstructVariant(nextVariant);
    await runConstruction(constructDay, nextVariant);
  }

  return (
    <div id="app" className={halfCompleted ? 'half-completed' : ''}>
      <div id="notmenu">
        <ClueColumn
          direction="across"
          entries={acrossEntries}
          index={index}
          label="ACROSS"
          onSelectEntry={handleSelectEntry}
          onSelectPattern={handleSelectPattern}
          session={session}
          voicePreview={voicePreview}
        />

        <div className="center-column">
          <div id="menu-top" className="menu-section">
            <div className="menu-row info-bar">
              <span className="puzzle-date">{puzzle.id.replace(/^nyt-/, '')}</span>
              <span className="puzzle-separator">•</span>
              <span className="puzzle-weekday">{puzzle.provenance.source === 'import' ? 'imported' : 'original'}</span>
              <span className="puzzle-separator">•</span>
              <span className="puzzle-authors" title={infoAuthors}>{infoAuthors}</span>
              {puzzle.subtitle && <div className="puzzle-notepad">{puzzle.subtitle}</div>}
            </div>

            <div className="menu-row indicator-bar">
              <div className="stat-item blue-stat">
                <span className="stat-label">Completed</span>
                <span className="stat-value">{solvedCount} / {totalEntries}</span>
              </div>
              <div className="stat-item blue-stat">
                <span className="stat-label">Checks</span>
                <span className="stat-value">{checkCount}</span>
              </div>
              <div className="stat-item blue-stat">
                <span className="stat-label">Reveals</span>
                <span className="stat-value">{revealCount}</span>
              </div>
              <div className="stat-item orange-stat">
                <span className="stat-label">Score</span>
                <span className="stat-value">{score}</span>
              </div>
              <div className="stat-item orange-stat">
                <span className="stat-label">Time</span>
                <span className="stat-value">
                  <SolveClock
                    activeMs={session.activeMs}
                    lastClockAtMs={session.lastClockAtMs}
                    lastInteractionAtMs={session.lastInteractionAtMs}
                    paused={session.paused}
                  />
                </span>
              </div>
              <button className="action-button blue-action" type="button" onClick={handlePauseToggle}>
                {session.paused ? 'Resume' : 'Pause'}
              </button>
            </div>

            <div className="menu-row action-bar">
              <button
                aria-pressed={checkMode}
                className={`action-button blue-action ${checkMode ? 'is-toggled' : ''}`}
                id="check-all"
                title={checkMode ? 'Hide check marks' : 'Check the grid'}
                type="button"
                onClick={handleCheckAll}
              >
                <span>{checkMode ? 'Hide check' : 'Check'}</span>
              </button>
              <button className="action-button blue-action" id="reveal-all" title="Reveal all" type="button" onClick={handleRevealAll}>
                <span>Reveal</span>
              </button>
              <button className="action-button orange-action" id="complete-button" title="Complete the puzzle" type="button" onClick={handleComplete}>
                <span>Complete</span>
              </button>
              <VoiceSolveControl
                enabled={voiceMode}
                llmReady={modelState === 'loaded'}
                onFill={handleVoiceFill}
                onSelectEntry={handleSelectEntry}
                onPreviewChange={handleVoicePreviewChange}
                onOpenSetup={() => openModelSetup()}
                puzzle={puzzle}
                resolveSpokenAnswer={handleResolveSpokenAnswer}
                session={session}
                speechCapability={speechCapability}
                speechClient={speechClientRef.current}
                speechReady={speechState === 'ready' && speechCache.status === 'cached'}
              />
            </div>
          </div>

          <LegacyGrid
            index={index}
            onClear={handleClear}
            onEnter={handleEnter}
            onEnterRebus={handleEnterRebus}
            onFocusCell={handleFocusCell}
            onMove={handleMove}
            onSelectCell={handleSelectCell}
            onToggleDirection={handleToggleDirection}
            puzzle={puzzle}
            session={session}
            disabled={!hydrated}
            voicePreview={voicePreview}
          />

          <div id="menu-bottom" className="menu-section">
            <div className="menu-row selection-row">
              <div className="field-group weekday-group">
                <label className="field-label" htmlFor="weekday-select">Weekday</label>
                <div className="select-wrapper">
                  <select
                    id="weekday-select"
                    onChange={(event) => setWeekday(event.target.value as NytWeekday)}
                    value={weekday}
                  >
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((option) => (
                      <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button aria-label="Get new puzzle" disabled={puzzleLoading} id="get-puzzle-button" type="button" onClick={handleLoadWeekday}>
                {puzzleLoading ? 'Loading…' : 'New puzzle'}
              </button>
              <div className="field-group weekday-group">
                <label className="field-label" htmlFor="construct-select">Construct</label>
                <div className="select-wrapper">
                  <select
                    id="construct-select"
                    onChange={(event) => setConstructDay(event.target.value as DayOfWeek)}
                    value={constructDay}
                  >
                    {(constructableDays().length > 0 ? constructableDays() : ['monday']).map((option) => (
                      <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                aria-label="Construct original puzzle"
                className="action-button"
                disabled={constructBusy}
                id="construct-button"
                title="Build a fresh original grid with the local model"
                type="button"
                onClick={() => { void handleConstruct(); }}
              >
                {constructBusy ? '…' : 'Construct'}
              </button>
              <button className="action-button blue-action" title="Export continuity archive" type="button" onClick={handleExport}>
                Export
              </button>
              <button
                className="action-button blue-action"
                title="Import continuity archive"
                type="button"
                onClick={() => document.getElementById('import-archive-input')?.click()}
              >
                Import
              </button>
              <input
                accept="application/json,.json"
                aria-label="Import continuity archive"
                id="import-archive-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImport(file);
                  event.target.value = '';
                }}
                style={{ display: 'none' }}
                type="file"
              />
              <div className="menu-spacer" />
              <button className="icon-button" title="Solved puzzles" type="button" onClick={() => setShowSolvedModal(true)}>Solved</button>
              <button className="icon-button" title="Model setup" type="button" onClick={() => openModelSetup()}>Model</button>
              {checkMode && incorrectCellIds.length > 0 && (
                <button className="action-button blue-action" type="button" onClick={handleClearIncorrect}>
                  Clear incorrect
                </button>
              )}
              <div className="theme-switch">
                <label className="switch">
                  <input
                    aria-label="Toggle dark mode"
                    checked={isDarkMode}
                    onChange={(event) => setDarkMode(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{isDarkMode ? 'Night' : 'Day'}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <ClueColumn
          direction="down"
          entries={downEntries}
          index={index}
          label="DOWN"
          onSelectEntry={handleSelectEntry}
          onSelectPattern={handleSelectPattern}
          session={session}
          voicePreview={voicePreview}
        />
      </div>

      {dataNotice && <p className="data-notice" role="status">{dataNotice}</p>}

      {updateReady && (
        <section aria-live="polite" className="model-status-panel update-status-panel">
          <div className="model-status-copy">
            <strong>A new Crossword version is ready</strong>
            <span>Your current solve will be saved before the update is applied.</span>
          </div>
          <div className="model-status-actions">
            <button className="action-button blue-action" type="button" onClick={() => { void handleApplyUpdate(); }}>Refresh to update</button>
          </div>
        </section>
      )}

      {constructBusy && constructionProgress && (
        <section aria-live="polite" className="model-status-panel construction-status-panel">
          <div className="model-status-copy">
            <strong>Constructing original puzzle</strong>
            <span>{constructionProgress.text}</span>
          </div>
          {constructionProgress.progress !== null && (
            <div className="model-status-progress" aria-label={`Construction ${Math.round(constructionProgress.progress * 100)} percent complete`}>
              <progress max="1" value={constructionProgress.progress} />
              <span>{Math.round(constructionProgress.progress * 100)}%</span>
            </div>
          )}
          <div className="model-status-actions">
            <button className="action-button" type="button" onClick={handleConstructionCancel}>Cancel construction</button>
          </div>
        </section>
      )}

      {(modelBusy || modelSnapshot.phase === 'ready' || modelSnapshot.phase === 'cancelled' || modelSnapshot.phase === 'error' || modelSnapshot.cacheStatus === 'cached') && (
        <section aria-live="polite" className={`model-status-panel model-status-${modelSnapshot.phase}`}>
          <div className="model-status-copy">
            <strong>{modelSnapshot.phase === 'ready' ? 'Local model ready' : modelSnapshot.phase === 'error' ? 'Local model needs attention' : modelSnapshot.phase === 'cancelled' ? 'Model setup canceled' : modelSnapshot.phase === 'idle' && modelSnapshot.cacheStatus === 'cached' ? 'Model available on this browser' : modelSnapshot.phase.replaceAll('-', ' ')}</strong>
            <span>{modelSnapshot.detail || 'Model status is available in Model settings.'}</span>
          </div>
          {modelSnapshot.progress !== null && modelBusy && (
            <div className="model-status-progress" aria-label={`Model setup ${Math.round(modelSnapshot.progress * 100)} percent complete`}>
              <progress max="1" value={modelSnapshot.progress} />
              <span>{Math.round(modelSnapshot.progress * 100)}%</span>
            </div>
          )}
          <div className="model-status-actions">
            {modelBusy && <button className="action-button" type="button" onClick={() => modelController.cancel()}>Cancel</button>}
            {(modelSnapshot.phase === 'error' || modelSnapshot.phase === 'cancelled' || modelSnapshot.cacheStatus !== 'cached') && <button className="action-button blue-action" type="button" onClick={() => openModelSetup(modelSetupIntent)}>Model settings</button>}
            {modelSnapshot.phase === 'ready' && <button className="action-button" type="button" onClick={() => { void handleModelUnload(); }}>Unload</button>}
          </div>
        </section>
      )}

      {showSolvedModal && (
        <div
          className="modal-overlay"
          onClick={(event) => { if (event.target === event.currentTarget) setShowSolvedModal(false); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setShowSolvedModal(false); }}
        >
          <div aria-labelledby="solved-modal-title" aria-modal="true" className="modal-content" role="dialog">
            <div className="modal-header">
              <h2 id="solved-modal-title">Solved puzzles</h2>
              <button
                autoFocus
                className="modal-close-button"
                type="button"
                aria-label="Close solved puzzles"
                onClick={() => setShowSolvedModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              {session.status === 'complete' && (
                <p><strong>{puzzle.title}</strong> — complete in {Math.round(session.activeMs / 1000)}s with {checkCount} checks and {revealCount} reveals.</p>
              )}
              {solvedList.length === 0 && <p>No solved puzzles yet.</p>}
              {solvedList.length > 0 && (
                <ul className="solved-puzzles-list">
                  {solvedList.map((item) => (
                    <li className="solved-puzzle-item" key={item.id + item.completedAt}>
                      <div className="puzzle-info">
                        <div className="puzzle-header">
                          <strong className="puzzle-title">{item.title}</strong>
                          <span className="puzzle-date">{new Date(item.completedAt).toLocaleString()}</span>
                        </div>
                        <span className="puzzle-authors">{Math.round(item.activeMs / 1000)}s</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="setup-actions">
                <button className="action-button blue-action" type="button" onClick={() => { void handleLoadWeekday(); setShowSolvedModal(false); }}>
                  New {weekday} puzzle
                </button>
                <button className="action-button" type="button" onClick={() => setShowSolvedModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {setupOpen && (
        <div
          className="modal-overlay"
          onClick={(event) => { if (event.target === event.currentTarget) setSetupOpen(false); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setSetupOpen(false); }}
        >
          <div aria-labelledby="setup-title" aria-modal="true" className="modal-content" role="dialog">
            <div className="modal-header">
              <h2 id="setup-title">Model setup</h2>
              <button
                autoFocus
                className="modal-close-button"
                type="button"
                aria-label="Close model setup"
                onClick={() => setSetupOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body model-settings-body">
              <p>Original construction and voice solving stay on this device. Inference runs locally in the browser.</p>
              <div className="model-explainer">
                <strong>{localModelManifest.id}</strong>
                <span>One-time browser download. After that, the model runs offline on this device; your puzzle data is not uploaded.</span>
                <span>Download size varies by the pinned WebLLM runtime. We show measured browser storage when available instead of inventing a byte count.</span>
              </div>
              <div className="theme-switch setup-voice-switch">
                <label className="switch">
                  <input
                    aria-label="Toggle voice mode"
                    checked={voiceMode}
                    onChange={(event) => handleVoiceModeChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Voice mode {voiceMode ? 'on' : 'off'}</span>
                </label>
              </div>
              <p className="setup-detail">Microphone audio and transcripts are used only for the current solve and are not saved.</p>
              <div className={`setup-status model-setup-status model-setup-${modelSnapshot.phase}`}><span />
                <span>
                  {modelState === 'loaded'
                    ? 'Local model ready in memory'
                    : modelSnapshot.cacheStatus === 'cached'
                      ? 'Local model on this browser · not loaded'
                      : modelSnapshot.cacheStatus === 'checking'
                        ? 'Checking browser cache…'
                        : 'Local model not downloaded'}
                </span>
              </div>
              {modelSnapshot.detail && <p className="setup-detail model-live-detail" role="status">{modelSnapshot.detail}</p>}
              {modelBusy && (
                <div className="model-progress-block" role="status">
                  <div className="model-progress-heading">
                    <strong>{modelSnapshot.phase.replaceAll('-', ' ')}</strong>
                    {modelSnapshot.progress !== null && <span>{Math.round(modelSnapshot.progress * 100)}%</span>}
                  </div>
                  {modelSnapshot.progress !== null ? <progress max="1" value={modelSnapshot.progress} /> : <div aria-label="Model setup in progress" className="model-indeterminate-progress" />}
                  <button className="action-button" type="button" onClick={() => modelController.cancel()}>Cancel model setup</button>
                </div>
              )}
              {modelSnapshot.error && (
                <div className="model-error" role="alert">
                  <strong>{modelSnapshot.error.message}</strong>
                  <span>{modelSnapshot.error.recovery}</span>
                  <button className="action-button blue-action" type="button" onClick={handleModelPrepare}>Retry model setup</button>
                </div>
              )}
              <div className="setup-actions model-actions">
                <button
                  className="action-button blue-action"
                  disabled={modelBusy || modelState === 'loaded'}
                  type="button"
                  onClick={() => { void handleModelPrepare(); }}
                >
                  {modelSnapshot.cacheStatus === 'cached' ? 'Load from browser storage' : modelSnapshot.phase === 'error' ? 'Retry download' : 'Download & load model'}
                </button>
                <button
                  className="action-button"
                  disabled={modelBusy || modelState !== 'loaded'}
                  type="button"
                  onClick={() => { void handleModelUnload(); }}
                >
                  Unload from memory
                </button>
                <button
                  className="action-button danger-action"
                  disabled={modelBusy || modelSnapshot.cacheStatus !== 'cached'}
                  type="button"
                  onClick={() => { if (window.confirm('Delete the downloaded local model from this browser?')) void modelController.deleteCache(); }}
                >
                  Delete downloaded model
                </button>
              </div>
              <div className="setup-status"><span /> Speech model {speechState}</div>
              <p className="setup-detail">
                Whisper transcription downloads about {Math.round(speechModel.estimatedBytesByDevice[speechDevice] / 1_000_000)} MB from huggingface.co once using {speechDevice.toUpperCase()}. Browser cache: {speechCache.status} ({speechCache.cachedFiles}/{speechCache.expectedFiles} files, {Math.round(speechCache.bytes / 1_000_000)} MB measured).
                {speechCapability.supported ? '' : ` ${speechCapability.reason ?? 'Voice input is unavailable.'}`}
              </p>
              <div className="setup-actions">
                <button
                  className="action-button blue-action"
                  disabled={!speechPreparing && (speechState === 'ready' || !speechCapability.supported)}
                  type="button"
                  onClick={() => { if (speechPreparing) handleSpeechCancel(); else void handleSpeechPrepare(); }}
                >
                  {speechPreparing ? 'Cancel speech setup' : speechState === 'loading' ? 'Loading speech' : speechState === 'uninstalled' && speechCache.status === 'cached' ? 'Load speech from cache' : 'Download speech model'}
                </button>
                <button
                  className="action-button"
                  disabled={speechBusy || speechState !== 'ready'}
                  type="button"
                  onClick={() => { void handleSpeechUnload(); }}
                >
                  Unload speech from memory
                </button>
                <button
                  className="action-button"
                  disabled={speechBusy || !['ready', 'uninstalled'].includes(speechState) || speechCache.status === 'not-cached' || speechCache.status === 'unknown'}
                  type="button"
                  onClick={() => { void handleSpeechDelete(); }}
                >
                  Delete downloaded speech model
                </button>
              </div>
              {speechProgress && speechPreparing && (
                <p className="setup-detail" role="status">
                  Downloading {speechProgress.file ?? 'speech artifacts'}: {Math.round(speechProgress.progress * 100)}% ({Math.round(speechProgress.loaded / 1_000_000)} / {Math.round(speechProgress.total / 1_000_000)} MB)
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
