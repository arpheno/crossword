import { describe, expect, it } from 'vitest';
import {
  INVENTORY_SCHEMA_VERSION,
  inventoryCandidateRecords,
  normalizeInventorySurface,
  validateLexemeRecord,
  type LexemeRecord,
  type SourceReceipt
} from './inventory';
import { loadLexicon } from './lexicon';

const source: SourceReceipt = {
  sourceId: 'fixture',
  sourceName: 'original fixture',
  sourceVersion: '1',
  artifactUrl: 'https://example.test/fixture',
  artifactSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  license: 'PUBLIC-DOMAIN',
  attribution: 'original test data',
  recordLocator: 'fixture:1',
  transformVersion: 'test-1'
};

function record(overrides: Partial<LexemeRecord> = {}): LexemeRecord {
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    lexemeId: 'lex:crane',
    answerForm: 'CRANE',
    displayForm: 'crane',
    length: 5,
    categories: ['STANDARD_WORD'],
    language: 'en-US',
    relations: [],
    eligibility: 'accepted',
    signals: { spellingEvidence: 'both', cwlScore: 80, wordfreqZipf: 4.5, diagnosticFlags: [] },
    senses: [{
      senseId: 'sense:crane-bird',
      lexemeId: 'lex:crane',
      gloss: 'A large long-necked bird.',
      registerTags: [],
      localeTags: ['en-US'],
      factIds: [],
      source: [source],
      status: 'grounded'
    }],
    facts: [],
    sources: [source],
    ...overrides
  };
}

describe('inventory records', () => {
  it('folds accents but rejects digits and unsupported punctuation', () => {
    expect(normalizeInventorySurface('café')).toMatchObject({ answerForm: 'CAFE', length: 4 });
    expect(normalizeInventorySurface('cold snap')).toMatchObject({ answerForm: 'COLDSNAP', length: 8 });
    expect(normalizeInventorySurface('R2D2')).toBeUndefined();
    expect(normalizeInventorySurface('foo/bar')).toBeUndefined();
  });

  it('keeps answer identity separate from a grounded sense', () => {
    expect(validateLexemeRecord(record())).toEqual([]);
    expect(validateLexemeRecord(record({ answerForm: 'WRONG' }))).toContain('answerForm does not match displayForm');
    expect(validateLexemeRecord(record({ eligibility: 'rejected' }))).toContain('rejected record has no reason');
  });

  it('exports only approved records and preserves sense/source IDs', () => {
    const candidates = inventoryCandidateRecords([
      record(),
      record({ lexemeId: 'lex:bad', answerForm: 'BAD', displayForm: 'bad', length: 3, eligibility: 'rejected', rejectionReason: 'fixture' })
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ word: 'CRANE', lexemeId: 'lex:crane', senseId: 'sense:crane-bird' });
    expect(candidates[0]?.sourceIds).toEqual(['fixture']);
  });

  it('chooses a grounded sense when an unresolved sense sorts first', () => {
    const candidates = inventoryCandidateRecords([record({
      senses: [
        { ...record().senses[0]!, senseId: 'sense:unresolved', status: 'unresolved', gloss: '' },
        { ...record().senses[0]!, senseId: 'sense:grounded' }
      ]
    })]);
    expect(candidates[0]?.senseId).toBe('sense:grounded');
  });

  it('lets approved inventory records replace synthetic surface IDs in the fill loader', () => {
    const lexicon = loadLexicon('ACE\n', { inventoryRecords: [record()] });
    expect(lexicon.wordCount).toBe(2);
    expect(lexicon.resolve('CRANE')).toMatchObject({ lexemeId: 'lex:crane', senseId: 'sense:crane-bird' });
    expect(lexicon.resolve('ACE')?.lexemeId).toBe('web2:ACE');
  });
});
