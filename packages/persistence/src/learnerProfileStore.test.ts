import 'fake-indexeddb/auto';
import { createFixturePuzzle, createSession, indexPuzzle } from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import { createContinuityExport } from './archive';
import { createIndexedDbContinuityRepository } from './continuityRepository';

function baseArchive() {
  const puzzle = createFixturePuzzle();
  const session = createSession(puzzle, indexPuzzle(puzzle), 123);
  return { puzzle, session };
}

describe('typed learner profile storage (ADR 0008)', () => {
  it('round-trips a valid profile and rejects drifted shapes', async () => {
    const repository = createIndexedDbContinuityRepository(`profile-store-${Date.now()}`);

    expect(await repository.loadLearnerProfile()).toBeUndefined();

    const profile = {
      schemaVersion: 1 as const,
      id: 'household-1',
      consent: 'local-personalization' as const,
      updatedAt: '2026-09-04T00:00:00.000Z',
      clueStylePreferences: { direct: 0.4 },
      topicPreferences: {},
      repetition: { recentAnswerIds: [], avoidUntilByAnswerId: {} }
    };
    await repository.saveLearnerProfile(profile);
    expect(await repository.loadLearnerProfile()).toEqual(profile);

    await expect(repository.saveLearnerProfile({ ...profile, consent: 'always-on' as never })).rejects.toThrow('invalid learner profile');
    // The stored profile survives a rejected write untouched.
    expect(await repository.loadLearnerProfile()).toEqual(profile);
    await repository.close?.();
  });

  it('resets every category back to the neutral profile', async () => {
    const repository = createIndexedDbContinuityRepository(`profile-reset-${Date.now()}`);
    await repository.saveLearnerProfile({
      schemaVersion: 1,
      id: 'household-1',
      consent: 'local-personalization',
      updatedAt: '2026-09-04T00:00:00.000Z',
      clueStylePreferences: { direct: 0.9 },
      topicPreferences: { ecology: 0.5 },
      repetition: { recentAnswerIds: ['CAT'], avoidUntilByAnswerId: { DOG: '2026-09-05T00:00:00.000Z' } }
    });

    const reset = await repository.resetLearnerProfile('2026-09-06T00:00:00.000Z');

    expect(reset.consent).toBe('disabled');
    expect(reset.clueStylePreferences).toEqual({});
    expect(reset.repetition.recentAnswerIds).toEqual([]);
    expect(await repository.loadLearnerProfile()).toEqual(reset);
    await repository.close?.();
  });

  it('keeps the profile inside the full continuity export', async () => {
    const name = `profile-export-${Date.now()}`;
    const { puzzle, session } = baseArchive();
    const repository = createIndexedDbContinuityRepository(name);
    await repository.replace(await createContinuityExport({ preferences: {}, profiles: {}, puzzles: [puzzle], sessions: [session] }));
    await repository.saveLearnerProfile({
      schemaVersion: 1,
      id: 'household-1',
      consent: 'disabled',
      updatedAt: '2026-09-04T00:00:00.000Z',
      clueStylePreferences: {},
      topicPreferences: {},
      repetition: { recentAnswerIds: [], avoidUntilByAnswerId: {} }
    });

    const exported = JSON.parse(await repository.exportAll());
    expect(exported.profiles).toEqual({ 'learner-profile': expect.objectContaining({ id: 'household-1' }) });
    await repository.close?.();
  });
});
