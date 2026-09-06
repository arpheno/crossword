import type { PuzzleDocument } from '@crossword/domain';

/**
 * Release replacement for the local continuity bridge (ADR 0007, RS-P0-1).
 * This module is alias-swapped for `./nytApi` in release builds so the
 * deployable graph contains no legacy provider routes. It deliberately
 * contains no route literals and no provider configuration.
 */

export type NytWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type NytCrosswordClient = Readonly<{
  loadByDate: (date: string, signal?: AbortSignal) => Promise<PuzzleDocument>;
  loadRandom: (weekday: NytWeekday, signal?: AbortSignal) => Promise<PuzzleDocument>;
}>;

export function createLegacyBridgeUnavailable(): Error {
  return new Error('The local puzzle bridge is not available in release builds.');
}

export function createNytCrosswordClient(): NytCrosswordClient {
  return {
    loadByDate: async () => {
      throw createLegacyBridgeUnavailable();
    },
    loadRandom: async () => {
      throw createLegacyBridgeUnavailable();
    }
  };
}
