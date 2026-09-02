import { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkSession,
  clearCell,
  createRealPuzzle,
  enterLetter,
  indexPuzzle,
  moveSelection,
  nudgeEntry,
  patternForEntry,
  pauseSession,
  revealCell,
  resumeSession,
  selectCell,
  stepEntry,
  touchSession,
  toggleDirection,
  updateActiveTime,
  type CellId,
  type Direction,
  type Entry,
  type PuzzleDocument,
  type SolveSessionSnapshot
} from '@crossword/domain';
import { createSessionUseCases } from '@crossword/application';
import { createContinuityExport, createIndexedDbContinuityRepository, createIndexedDbSessionRepository, parseContinuityExport } from '@crossword/persistence';
import type { ModelState, RuntimeProbe } from '@crossword/model-runtime';
import { ActiveClueDock } from './components/ActiveClueDock';
import { ClueSpine } from './components/ClueSpine';
import { CrosswordGrid } from './components/CrosswordGrid';
import { SessionCommands } from './components/SessionCommands';
import { createBrowserModelWorkerClient, type ModelWorkerClient } from './workers/modelClient';
import { browserRuntimeProbe, localModelManifest, localModelUrl } from './modelConfig';
import { createNytCrosswordClient, type NytWeekday } from './nytApi';

const initialPuzzle = createRealPuzzle();
const initialIndex = indexPuzzle(initialPuzzle);
const sessionUseCases = createSessionUseCases(createIndexedDbSessionRepository());
const continuityRepository = createIndexedDbContinuityRepository();
const nytClient = createNytCrosswordClient();

function formatDuration(activeMs: number): string {
  const totalSeconds = Math.floor(activeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function focusCell(cellId: CellId) {
  const focusNow = () => {
    document.querySelector<HTMLButtonElement>(`[data-cell-id="${cellId}"]`)?.focus({ preventScroll: true });
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(() => requestAnimationFrame(focusNow));
  } else {
    focusNow();
  }
}

function App() {
  const [puzzle, setPuzzle] = useState<PuzzleDocument>(initialPuzzle);
  const index = useMemo(() => indexPuzzle(puzzle), [puzzle]);
  const [session, setSession] = useState<SolveSessionSnapshot>(() =>
    sessionUseCases.restart(initialPuzzle, initialIndex, Date.now())
  );
  const [incorrectCellIds, setIncorrectCellIds] = useState<readonly CellId[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [dataNotice, setDataNotice] = useState('');
  const [puzzleDate, setPuzzleDate] = useState('');
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [randomWeekday, setRandomWeekday] = useState<NytWeekday>('monday');
  const [updateReady, setUpdateReady] = useState(false);
  const [modelState, setModelState] = useState<ModelState>('uninstalled');
  const [modelProbe, setModelProbe] = useState<RuntimeProbe>(() => browserRuntimeProbe());
  const [modelBusy, setModelBusy] = useState(false);
  const modelClientRef = useRef<ModelWorkerClient | null>(null);
  const modelAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStorageReady(false);
    sessionUseCases.load(puzzle, index)
      .then((loaded) => {
        if (cancelled) return;
        setSession(loaded);
        setStorageReady(true);
      })
      .catch(() => {
        if (!cancelled) setStorageReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [index, puzzle]);

  useEffect(() => () => {
    modelAbortRef.current?.abort();
    modelClientRef.current?.dispose();
  }, []);

  useEffect(() => {
    const handleUpdate = () => setUpdateReady(true);
    window.addEventListener('crossword-sw-update', handleUpdate);
    return () => window.removeEventListener('crossword-sw-update', handleUpdate);
  }, []);

  function handleUpdate() {
    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }

  useEffect(() => {
    if (!storageReady) return;
    const persist = () => {
      void sessionUseCases.save(puzzle, index, session).catch(() => undefined);
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
  }, [session, storageReady]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSession((current) => updateActiveTime(current, Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeEntry = index.entriesById.get(session.selection.entryId);
  const acrossEntries = puzzle.entries.filter((entry) => entry.direction === 'across');
  const downEntries = puzzle.entries.filter((entry) => entry.direction === 'down');

  function handleSelectCell(cellId: CellId, direction?: Direction, toggle = false) {
    setSession((current) => selectCell(touchSession(current, Date.now()), index, cellId, direction, toggle));
    focusCell(cellId);
  }

  function handleSelectEntry(entry: Entry) {
    const cellId = entry.cellIds.find((candidate) => !session.entered[candidate]) ?? entry.cellIds[0];
    if (!cellId) return;
    handleSelectCell(cellId, entry.direction);
  }

  function handleSelectPattern(entry: Entry, position: number) {
    const cellId = entry.cellIds[position];
    if (!cellId) return;
    handleSelectCell(cellId, entry.direction);
  }

  function handleCheck(scope: 'cell' | 'entry' | 'puzzle') {
    const result = checkSession(touchSession(session, Date.now()), puzzle, index, scope);
    setSession(result.snapshot);
    setIncorrectCellIds(result.incorrectCellIds);
  }

  function handleReveal(scope: 'cell' | 'entry' | 'puzzle') {
    const needsConfirmation = scope !== 'cell';
    if (needsConfirmation && !window.confirm(`Reveal the entire ${scope}? This counts as assistance.`)) return;
    setSession((current) => revealCell(touchSession(current, Date.now()), puzzle, index, scope));
    setIncorrectCellIds([]);
  }

  function handleNewPuzzle() {
    const nextSession = sessionUseCases.restart(puzzle, index, Date.now());
    setSession(nextSession);
    setIncorrectCellIds([]);
    setSetupOpen(false);
    focusCell(nextSession.selection.cellId);
  }

  function replacePuzzle(nextPuzzle: PuzzleDocument, notice: string) {
    const nextSession = sessionUseCases.restart(nextPuzzle, indexPuzzle(nextPuzzle), Date.now());
    setPuzzle(nextPuzzle);
    setSession(nextSession);
    setIncorrectCellIds([]);
    setDataNotice(notice);
    setSetupOpen(false);
    focusCell(nextSession.selection.cellId);
  }

  async function handleLoadDate() {
    setPuzzleLoading(true);
    try {
      const nextPuzzle = await nytClient.loadByDate(puzzleDate);
      replacePuzzle(nextPuzzle, `Loaded ${nextPuzzle.title}.`);
      setPuzzleDate(nextPuzzle.id.replace(/^nyt-/, ''));
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'NYT puzzle loading failed.');
    } finally {
      setPuzzleLoading(false);
    }
  }

  async function handleLoadRandom() {
    setPuzzleLoading(true);
    try {
      const nextPuzzle = await nytClient.loadRandom(randomWeekday);
      replacePuzzle(nextPuzzle, `Loaded a ${randomWeekday} puzzle.`);
      setPuzzleDate(nextPuzzle.id.replace(/^nyt-/, ''));
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'NYT puzzle loading failed.');
    } finally {
      setPuzzleLoading(false);
    }
  }

  function handleMove(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
    setSession((current) => moveSelection(touchSession(current, Date.now()), puzzle, index, key));
  }

  function handleEnterLetter(value: string) {
    setIncorrectCellIds([]);
    setSession((current) => enterLetter(touchSession(current, Date.now()), puzzle, index, value));
  }

  function handleClearCell() {
    setIncorrectCellIds([]);
    setSession((current) => clearCell(touchSession(current, Date.now()), puzzle, index));
  }

  function handleStepEntry(step: 'next' | 'previous') {
    const nextSession = stepEntry(touchSession(session, Date.now()), puzzle, index, step);
    setSession(nextSession);
    if (nextSession.selection.cellId) focusCell(nextSession.selection.cellId);
  }

  function handleToggleDirection() {
    setSession((current) => toggleDirection(touchSession(current, Date.now()), index));
  }

  function handleNudge() {
    setSession((current) => nudgeEntry(touchSession(current, Date.now()), puzzle));
  }

  function handlePauseToggle() {
    setSession((current) => current.paused
      ? resumeSession(current, Date.now())
      : pauseSession(current, Date.now()));
  }

  async function handleExport() {
    try {
      const serialized = await createContinuityExport({
        preferences: { theme: 'light', motion: 'subtle' },
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
      setSession(restored);
      setDataNotice('Continuity archive imported.');
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  async function handleModelInstall() {
    setModelBusy(true);
    const controller = new AbortController();
    modelAbortRef.current = controller;
    try {
      const estimate = await navigator.storage?.estimate();
      const probe = {
        ...browserRuntimeProbe(),
        storageQuotaBytes: estimate?.quota ?? 0,
        storageUsageBytes: estimate?.usage ?? 0
      };
      setModelProbe(probe);
      const client = modelClientRef.current ?? (modelClientRef.current = createBrowserModelWorkerClient());
      const configured = await client.configure({ manifest: localModelManifest, runtime: probe, baseUrl: localModelUrl });
      if (!configured.ok) throw new Error(configured.error.message);
      const installed = await client.install(controller.signal);
      if (!installed.ok) throw new Error(installed.error.message);
      setModelState('installed');
      const loaded = await client.load(controller.signal);
      if (!loaded.ok) throw new Error(loaded.error.message);
      setModelState('loaded');
      setDataNotice('Local model loaded. Original construction is available to the queue.');
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Local model setup failed.');
      setModelState(modelClientRef.current?.state() ?? 'uninstalled');
    } finally {
      modelAbortRef.current = null;
      setModelBusy(false);
    }
  }

  async function handleModelUnload() {
    const client = modelClientRef.current;
    if (!client) return;
    setModelBusy(true);
    try {
      const result = await client.unload();
      if (result.ok) {
        setModelState('installed');
        setDataNotice('Local model unloaded. Solving remains offline.');
      } else {
        setDataNotice(result.error.message);
      }
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : 'Local model unload failed.');
      setModelState(client.state());
    } finally {
      setModelBusy(false);
    }
  }

  const statusLabel = session.status === 'complete' ? 'Complete' : 'In progress';

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Crossword home">
          <span className="wordmark-mark" aria-hidden="true">+</span>
          <span>crossword</span>
        </a>
        <div className="masthead-meta" aria-label="Application status">
          <span className="status-dot" aria-hidden="true" />
          <span>Local workspace / offline ready{storageReady ? ' / saved' : ' / loading'}</span>
        </div>
      </header>

      <section className="play-header" aria-labelledby="puzzle-title">
        <div>
          <p className="eyebrow">{puzzle.provenance.source === 'import' ? 'Imported NYT puzzle' : `Local construction / ${puzzle.width}x${puzzle.height}`}</p>
          <h1 id="puzzle-title">{puzzle.title}</h1>
          <p className="puzzle-subtitle">{puzzle.subtitle}</p>
        </div>
        <div className="session-readout" aria-label="Session status">
          <span>{statusLabel}</span>
          <strong>{formatDuration(session.activeMs)}</strong>
        </div>
      </section>

      <section className="workspace" aria-label="Crossword workspace">
        <ClueSpine
          direction="across"
          entries={acrossEntries}
          index={index}
          incorrectCellIds={incorrectCellIds}
          onSelectEntry={handleSelectEntry}
          onSelectPattern={handleSelectPattern}
          session={session}
          side="left"
        />

        <div className="solve-stage">
          {session.status === 'complete' && (
            <div className="completion-banner" role="status">
              <strong>Grid complete.</strong>
              <span>Every crossing is holding.</span>
            </div>
          )}
          <div className="grid-frame">
            <CrosswordGrid
              index={index}
              incorrectCellIds={incorrectCellIds}
              onClearCell={handleClearCell}
              onEnterLetter={handleEnterLetter}
              onMove={handleMove}
              onSelectCell={handleSelectCell}
              onStepEntry={handleStepEntry}
              onToggleDirection={handleToggleDirection}
              puzzle={puzzle}
              session={session}
            />
          </div>
          {activeEntry && (
            <ActiveClueDock
              entry={activeEntry}
              index={index}
              onSelectPattern={handleSelectPattern}
              session={session}
            />
          )}
        </div>

        <ClueSpine
          direction="down"
          entries={downEntries}
          index={index}
          incorrectCellIds={incorrectCellIds}
          onSelectEntry={handleSelectEntry}
          onSelectPattern={handleSelectPattern}
          session={session}
          side="right"
        />
      </section>

      <SessionCommands
        onCheck={handleCheck}
        onExport={handleExport}
        onImport={handleImport}
        onLoadDate={handleLoadDate}
        onLoadRandom={handleLoadRandom}
        onModelSetup={() => setSetupOpen(true)}
        onNudge={handleNudge}
        onNewPuzzle={handleNewPuzzle}
        onPause={handlePauseToggle}
        onReveal={handleReveal}
        puzzleDate={puzzleDate}
        puzzleLoading={puzzleLoading}
        randomWeekday={randomWeekday}
        setPuzzleDate={setPuzzleDate}
        setRandomWeekday={setRandomWeekday}
        paused={session.paused}
      />

      {dataNotice && <p className="data-notice" role="status">{dataNotice}</p>}

      {updateReady && (
        <div className="update-banner" role="status">
          <span>A newer workspace is ready.</span>
          <button type="button" onClick={handleUpdate}>Update</button>
        </div>
      )}

      {setupOpen && (
        <aside className="setup-panel" aria-labelledby="setup-title">
          <div className="setup-panel-heading">
            <div>
              <p className="eyebrow">Local construction</p>
              <h2 id="setup-title">One device. One model.</h2>
            </div>
            <button className="close-button" type="button" onClick={() => setSetupOpen(false)} aria-label="Close model setup">Close</button>
          </div>
          <p>Original construction stays on this device and remains unavailable until the pinned local model is reachable through the broker.</p>
          <div className="setup-status"><span className="status-dot" aria-hidden="true" /> Local model {modelState}</div>
          <div className="setup-steps">
            <span>01</span><strong>Endpoint {localModelUrl}</strong>
            <span>02</span><strong>Memory floor {localModelManifest.minimumMemoryMb.toLocaleString()} MB</strong>
            <span>03</span><strong>Storage {modelProbe.storageQuotaBytes ? `${Math.round(modelProbe.storageQuotaBytes / 1_000_000)} MB available` : 'unavailable'}</strong>
          </div>
          <div className="setup-actions">
            <button className="primary-button" type="button" onClick={handleModelInstall} disabled={modelBusy || modelState === 'loaded'}>{modelBusy ? 'Working...' : modelState === 'installed' ? 'Load local model' : 'Install and load'}</button>
            <button className="close-button" type="button" onClick={handleModelUnload} disabled={modelBusy || modelState !== 'loaded'}>Unload</button>
          </div>
        </aside>
      )}

      <footer className="footer-line">
        <span>Original local construction</span>
        <span>v0.1</span>
      </footer>
    </main>
  );
}

export default App;
