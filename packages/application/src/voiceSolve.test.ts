import {
  createFixturePuzzle,
  createSession,
  enterLetter,
  indexPuzzle
} from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import {
  confirmVoiceEntry,
  filterVoiceCandidates,
  lookupVoiceEntry,
  parseVoiceCommand,
  voicePhoneticCandidates,
  voiceEntryHasRebus,
  voiceEntryPattern,
  voicePuzzleFingerprint,
  voiceSessionFingerprint,
  type VoiceAnswerIntent
} from './voiceSolve';

describe('voice solve application rules', () => {
  const puzzle = createFixturePuzzle();
  const index = indexPuzzle(puzzle);

  it('parses digit and number-word clue references', () => {
    expect(parseVoiceCommand('1 across oreo')).toEqual({
      ok: true,
      command: { number: 1, direction: 'across', spokenAnswer: 'oreo' }
    });
    expect(parseVoiceCommand('twenty-three down sea')).toEqual({
      ok: true,
      command: { number: 23, direction: 'down', spokenAnswer: 'sea' }
    });
    expect(parseVoiceCommand('clue one hundred and two vertical answer')).toEqual({
      ok: true,
      command: { number: 102, direction: 'down', spokenAnswer: 'answer' }
    });
    expect(parseVoiceCommand('twenty-third a cross sea')).toEqual({
      ok: true,
      command: { number: 23, direction: 'across', spokenAnswer: 'sea' }
    });
    expect(parseVoiceCommand('for down care')).toEqual({
      ok: true,
      command: { number: 4, direction: 'down', spokenAnswer: 'care' }
    });
  });

  it('rejects incomplete commands', () => {
    expect(parseVoiceCommand('one across')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('oreo')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('zero down word')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('one two across word')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('one one across word')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('twenty thirty across word')).toMatchObject({ ok: false });
    expect(parseVoiceCommand(`1 across ${'word '.repeat(100)}`)).toMatchObject({ ok: false });
  });

  it('keeps command parsing bounded across common ASR variants', () => {
    const cases = [
      ['the 12th a cross, answer is care', 12, 'across', 'care'],
      ['twenty-third down sea', 23, 'down', 'sea'],
      ['number for across care', 4, 'across', 'care'],
      ['to down care', 2, 'down', 'care'],
      ['won across care', 1, 'across', 'care'],
      ['one hundred and two vertical care', 102, 'down', 'care']
    ] as const;
    for (const [transcript, number, direction, spokenAnswer] of cases) {
      expect(parseVoiceCommand(transcript)).toEqual({
        ok: true,
        command: { number, direction, spokenAnswer }
      });
    }
    expect(parseVoiceCommand('one and two across care')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('twenty thirty across care')).toMatchObject({ ok: false });
    expect(parseVoiceCommand('one one across care')).toMatchObject({ ok: false });
    expect(voicePhoneticCandidates('see')).toEqual([{ surface: 'SEA', note: 'phonetic alternative' }]);
  });

  it('filters candidates by length, crossings, and normalized duplicates', () => {
    let session = createSession(puzzle, index);
    session = {
      ...session,
      entered: { ...session.entered, 'cell-0-1': 'A' }
    };
    const entry = puzzle.entries.find((candidate) => candidate.number === 1 && candidate.direction === 'across');
    if (!entry) throw new Error('Fixture entry is missing');

    expect(voiceEntryPattern(entry, session)).toBe('.A..');
    expect(filterVoiceCandidates(entry, session, [
      { surface: 'care' },
      { surface: 'CARE', note: 'duplicate' },
      { surface: 'card' },
      { surface: 'car' },
      { surface: 'C4RE' }
    ])).toEqual([{ surface: 'CARE' }, { surface: 'CARD' }]);
  });

  it('fills through domain events and preserves crossings', () => {
    const entry = puzzle.entries.find((candidate) => candidate.number === 1 && candidate.direction === 'across');
    if (!entry) throw new Error('Fixture entry is missing');
    const session = createSession(puzzle, index);
    const result = confirmVoiceEntry(session, puzzle, index, entry, 'care', intentFor(puzzle, session, entry), 1_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(entry.cellIds.map((cellId) => result.snapshot.entered[cellId])).toEqual(['C', 'A', 'R', 'E']);
    expect(result.snapshot.events.slice(1).map((event) => event.type)).toEqual([
      'cell-entered',
      'cell-entered',
      'cell-entered',
      'cell-entered'
    ]);
    expect(result.snapshot.selection.direction).toBe('across');
  });

  it('does not mutate a paused or incompatible session', () => {
    const entry = puzzle.entries.find((candidate) => candidate.number === 1 && candidate.direction === 'across');
    if (!entry) throw new Error('Fixture entry is missing');
    const session = createSession(puzzle, index);
    expect(confirmVoiceEntry({ ...session, paused: true }, puzzle, index, entry, 'care', intentFor(puzzle, session, entry))).toMatchObject({
      ok: false,
      reason: 'paused'
    });
    const incompatibleSession = {
      ...session,
      entered: { ...session.entered, 'cell-0-1': 'A' }
    };
    const incompatible = confirmVoiceEntry(
      incompatibleSession,
      puzzle,
      index,
      entry,
      'cord',
      intentFor(puzzle, incompatibleSession, entry)
    );
    expect(incompatible).toMatchObject({ ok: false, reason: 'incompatible-answer' });
    expect(incompatible.snapshot.entered['cell-0-1']).toBe('A');
  });

  it('rejects duplicate references and rebus entries explicitly', () => {
    const entry = puzzle.entries.find((candidate) => candidate.number === 1 && candidate.direction === 'across');
    if (!entry) throw new Error('Fixture entry is missing');
    const duplicate = { ...entry, id: 'duplicate-entry' as typeof entry.id };
    expect(lookupVoiceEntry({ ...puzzle, entries: [...puzzle.entries, duplicate] }, {
      number: entry.number,
      direction: entry.direction,
      spokenAnswer: 'care'
    })).toMatchObject({ status: 'ambiguous' });

    const rebusPuzzle = {
      ...puzzle,
      cells: puzzle.cells.map((cell) => cell.id === entry.cellIds[0] ? { ...cell, rebus: 'AN' } : cell)
    };
    const rebusIndex = indexPuzzle(rebusPuzzle);
    const rebusEntry = rebusPuzzle.entries.find((candidate) => candidate.id === entry.id);
    if (!rebusEntry) throw new Error('Rebus entry is missing');
    expect(voiceEntryHasRebus(rebusPuzzle, rebusEntry)).toBe(true);
    expect(confirmVoiceEntry(createSession(rebusPuzzle, rebusIndex), rebusPuzzle, rebusIndex, rebusEntry, 'care', intentFor(rebusPuzzle, createSession(rebusPuzzle, rebusIndex), rebusEntry))).toMatchObject({
      ok: false,
      reason: 'unsupported-rebus'
    });
  });

  it('rejects confirmation after a crossing edit or same-id puzzle replacement', () => {
    const entry = puzzle.entries.find((candidate) => candidate.number === 1 && candidate.direction === 'across');
    if (!entry) throw new Error('Fixture entry is missing');
    const session = createSession(puzzle, index);
    const intent = intentFor(puzzle, session, entry);
    const changed = enterLetter(session, puzzle, index, 'X');
    expect(confirmVoiceEntry(changed, puzzle, index, entry, 'care', intent)).toMatchObject({
      ok: false,
      reason: 'stale-intent'
    });

    const replacement = { ...puzzle, title: `${puzzle.title} replacement` };
    const replacementIndex = indexPuzzle(replacement);
    const replacementSession = createSession(replacement, replacementIndex);
    expect(confirmVoiceEntry(replacementSession, replacement, replacementIndex, entry, 'care', intent)).toMatchObject({
      ok: false,
      reason: 'stale-intent'
    });
  });
});

function intentFor(puzzle: ReturnType<typeof createFixturePuzzle>, session: ReturnType<typeof createSession>, entry: ReturnType<typeof createFixturePuzzle>['entries'][number]): VoiceAnswerIntent {
  return {
    puzzleId: puzzle.id,
    puzzleRevision: voicePuzzleFingerprint(puzzle),
    entryId: entry.id,
    pattern: voiceEntryPattern(entry, session),
    sessionRevision: voiceSessionFingerprint(session)
  };
}