import { ActiveClueBridge } from '../components/ActiveClueBridge';
import { ClueSpine } from '../components/ClueSpine';
import { CrosswordGrid } from '../components/CrosswordGrid';
import { SolveCommands } from '../components/SolveCommands';
import type { CompletionPolicy } from '../cluePlacement';
import { resolveHarnessFixture, resolveHarnessMode, type HarnessMode } from './fixtures';

const noop = () => undefined;

const noopFile = (_file: File) => undefined;

export function HarnessPage({ fixtureId, mode, policy }: { fixtureId: string | null; mode: HarnessMode; policy: CompletionPolicy }) {
  const fixture = resolveHarnessFixture(fixtureId);
  const { puzzle, index, session, incorrectCellIds } = fixture.build();
  const activeEntry = index.entriesById.get(session.selection.entryId);
  const acrossEntries = puzzle.entries.filter((entry) => entry.direction === 'across');
  const downEntries = puzzle.entries.filter((entry) => entry.direction === 'down');

  return (
    <main className={`harness-root${mode === 'dark' ? ' theme-dark' : ''}`} data-mode={mode}>
      <header className="identity-rail" aria-label="Harness identity">
        <div className="identity-copy">
          <p className="eyebrow">Harness · {fixture.id} · {policy} · {mode}</p>
          <h1>{fixture.title}</h1>
        </div>
      </header>

      <section className="workspace" aria-label="Harness workspace">
        <ClueSpine
          completionPolicy={policy}
          direction="across"
          entries={acrossEntries}
          incorrectCellIds={incorrectCellIds}
          index={index}
          onSelectEntry={noop}
          onSelectPattern={noop}
          session={session}
          side="left"
        />
        <div className="solve-stage">
          <div className="grid-frame">
            <CrosswordGrid
              index={index}
              incorrectCellIds={incorrectCellIds}
              onClearCell={noop}
              onEnterLetter={noop}
              onMove={noop}
              onSelectCell={noop}
              onStepEntry={noop}
              onToggleDirection={noop}
              puzzle={puzzle}
              session={session}
            />
          </div>
          {activeEntry && (
            <ActiveClueBridge
              entry={activeEntry}
              index={index}
              onNudge={noop}
              onSelectPattern={noop}
              session={session}
            />
          )}
          <SolveCommands
            onCheck={noop}
            onExport={noop}
            onImport={noopFile}
            onLoadDate={noop}
            onLoadRandom={noop}
            onModelSetup={noop}
            onNewPuzzle={noop}
            onPause={noop}
            onReveal={noop}
            paused={session.paused}
            puzzleDate=""
            puzzleLoading={false}
            randomWeekday="monday"
            setPuzzleDate={noop}
            setRandomWeekday={noop}
          />
        </div>
        <ClueSpine
          completionPolicy={policy}
          direction="down"
          entries={downEntries}
          incorrectCellIds={incorrectCellIds}
          index={index}
          onSelectEntry={noop}
          onSelectPattern={noop}
          session={session}
          side="right"
        />
      </section>

      <section className="harness-notes" aria-label="Fixture notes">
        <ul>
          {fixture.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          {mode === 'forced' && <li>Placeholder: forced-colors cannot be emulated in-page; Playwright forced-colors emulation covers it later.</li>}
          {mode === 'zoom' && <li>Placeholder: 200% zoom is a browser-level state; use browser zoom or Playwright zoom emulation.</li>}
        </ul>
      </section>

      <nav className="harness-index" aria-label="Fixture index">
        {['empty-15', 'active-across', 'active-down-typed', 'check-error', 'half-collapsed', 'long-clue', 'special-cells'].map((id) => (
          <a key={id} href={`/harness?fixture=${id}&policy=${policy}&mode=${mode}`}>{id}</a>
        ))}
        <span className="harness-modes">
          {(['light', 'dark', 'forced', 'zoom'] as const).map((candidate) => (
            <a key={candidate} href={`/harness?fixture=${fixture.id}&policy=${policy}&mode=${candidate}`}>{candidate}</a>
          ))}
        </span>
      </nav>
    </main>
  );
}
