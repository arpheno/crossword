/**
 * Versioned lexical and semantic records used by the offline inventory build.
 *
 * These records deliberately separate an answer's grid spelling from its
 * meanings, source evidence, ranking signals, and editorial status. A source
 * score or a parsed gloss is evidence; neither one is an approval.
 */

export const INVENTORY_SCHEMA_VERSION = 1 as const;

export type InventoryCategory =
  | 'STANDARD_WORD'
  | 'MULTIWORD_PHRASE'
  | 'PROPER_NAME'
  | 'INITIALISM'
  | 'LOANWORD'
  | 'INFLECTED_FORM'
  | 'FORM_LEVEL';

export type InventoryEligibility = 'accepted' | 'review' | 'rejected';
export type SemanticStatus = 'grounded' | 'limited' | 'unresolved';
export type SourceLicense =
  | 'MIT'
  | 'CC-BY-SA-4.0'
  | 'CC0-1.0'
  | 'ESDB-CUSTOM'
  | 'PUBLIC-DOMAIN'
  | 'NOASSERTION';

export type SourceReceipt = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceVersion: string;
  artifactUrl: string;
  artifactSha256: string;
  license: SourceLicense;
  attribution: string;
  recordLocator: string;
  transformVersion: string;
}>;

export type LexicalRelation = Readonly<{
  type: 'inflection-of' | 'derived-from' | 'variant-of' | 'alias-of';
  targetLexemeId: string;
}>;

export type FactAssertion = Readonly<{
  factId: string;
  entityId: string;
  propertyId: string;
  value: string;
  statementId?: string;
  retrievedAt: string;
  source: SourceReceipt;
  status: 'accepted' | 'review' | 'rejected';
}>;

export type SenseRecord = Readonly<{
  senseId: string;
  lexemeId: string;
  gloss: string;
  partOfSpeech?: string;
  registerTags: readonly string[];
  localeTags: readonly string[];
  factIds: readonly string[];
  source: readonly SourceReceipt[];
  status: SemanticStatus;
}>;

export type InventorySignals = Readonly<{
  cwlScore?: number;
  esdbSize?: number;
  spellingEvidence: 'esdb' | 'cwl' | 'both' | 'none';
  wordfreqZipf?: number;
  phraseEvidence?: 'source' | 'editorial' | 'none';
  entityEvidence?: 'wikidata' | 'editorial' | 'none';
  diagnosticFlags: readonly string[];
}>;

export type EditorialDecision = Readonly<{
  action: 'approve' | 'review' | 'reject';
  reviewerId: string;
  reason: string;
  policyVersion: string;
  decidedAt: string;
}>;

export type LexemeRecord = Readonly<{
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION;
  lexemeId: string;
  answerForm: string;
  displayForm: string;
  length: number;
  categories: readonly InventoryCategory[];
  language: 'en-US' | 'en';
  lemmaId?: string;
  relations: readonly LexicalRelation[];
  eligibility: InventoryEligibility;
  rejectionReason?: string;
  signals: InventorySignals;
  senses: readonly SenseRecord[];
  facts: readonly FactAssertion[];
  sources: readonly SourceReceipt[];
  editorial?: EditorialDecision;
}>;

export type InventoryArtifact = Readonly<{
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION;
  artifactId: string;
  buildVersion: string;
  generatedAt: string;
  sourceDigests: Readonly<Record<string, string>>;
  records: readonly LexemeRecord[];
}>;

export type NormalizedInventorySurface = Readonly<{
  answerForm: string;
  displayForm: string;
  length: number;
}>;

/**
 * Normalize only supported alphabetic crossword forms. Accents are folded to
 * their ASCII base while the original display spelling is retained. Digits,
 * symbols, and punctuation that would change an answer are rejected instead
 * of silently removed.
 */
export function normalizeInventorySurface(value: string): NormalizedInventorySurface | undefined {
  const displayForm = value.trim();
  if (!displayForm) return undefined;
  const folded = displayForm
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
  if (!/^[A-Z]+(?:[\s'-]+[A-Z]+)*$/.test(folded)) return undefined;
  const answerForm = folded.replace(/[\s'-]+/g, '');
  if (answerForm.length < 3 || answerForm.length > 15) return undefined;
  return { answerForm, displayForm, length: answerForm.length };
}

/** Return stable, human-readable validation errors for build and review tools. */
export function validateLexemeRecord(record: LexemeRecord): readonly string[] {
  const errors: string[] = [];
  if (record.schemaVersion !== INVENTORY_SCHEMA_VERSION) errors.push('unsupported schema version');
  if (!record.lexemeId.trim()) errors.push('missing lexemeId');
  const normalized = normalizeInventorySurface(record.displayForm);
  if (!normalized) errors.push('displayForm is not a supported alphabetic form');
  else {
    if (record.answerForm !== normalized.answerForm) errors.push('answerForm does not match displayForm');
    if (record.length !== normalized.length) errors.push('length does not match answerForm');
  }
  if (record.categories.length === 0) errors.push('missing category');
  if (record.sources.length === 0) errors.push('missing source receipt');
  for (const source of record.sources) {
    if (!source.sourceId.trim() || !source.sourceVersion.trim() || !source.artifactUrl.trim()) errors.push(`incomplete source receipt ${source.sourceId || '(missing)'}`);
    if (!/^[a-f0-9]{64}$/i.test(source.artifactSha256)) errors.push(`source ${source.sourceId || '(missing)'} has no pinned sha256`);
  }
  const senseIds = new Set<string>();
  for (const sense of record.senses) {
    if (!sense.senseId || sense.lexemeId !== record.lexemeId) errors.push(`invalid sense ${sense.senseId || '(missing)'}`);
    if (!sense.gloss.trim() && sense.status !== 'unresolved') errors.push(`empty gloss for ${sense.senseId}`);
    if (senseIds.has(sense.senseId)) errors.push(`duplicate sense ${sense.senseId}`);
    senseIds.add(sense.senseId);
  }
  for (const fact of record.facts) {
    if (!fact.factId || !fact.entityId || !fact.propertyId) errors.push(`incomplete fact ${fact.factId || '(missing)'}`);
    if (fact.status === 'accepted' && !fact.source.sourceId.trim()) errors.push(`accepted fact ${fact.factId} has no source`);
  }
  if (record.eligibility === 'rejected' && !record.rejectionReason?.trim()) errors.push('rejected record has no reason');
  if (record.eligibility === 'accepted' && record.senses.length > 0 && !record.senses.some((sense) => sense.status !== 'unresolved')) {
    errors.push('accepted record has no resolved sense');
  }
  return errors;
}

export function isPublishableLexeme(record: LexemeRecord): boolean {
  return record.eligibility === 'accepted' && validateLexemeRecord(record).length === 0;
}

/** Convert approved records to the compact surface-level candidate contract. */
export function inventoryCandidateRecords(records: readonly LexemeRecord[]): readonly {
  word: string;
  score: number;
  lexemeId: string;
  senseId?: string;
  sourceIds: readonly string[];
}[] {
  return records
    .filter(isPublishableLexeme)
    .map((record) => ({
      word: record.answerForm,
      score: inventoryPreferenceScore(record),
      lexemeId: record.lexemeId,
      ...(record.senses.find((sense) => sense.status !== 'unresolved')?.senseId ? { senseId: record.senses.find((sense) => sense.status !== 'unresolved')!.senseId } : {}),
      sourceIds: record.sources.map((source) => source.sourceId)
    }))
    .sort((left, right) => right.score - left.score || left.word.localeCompare(right.word));
}

function inventoryPreferenceScore(record: LexemeRecord): number {
  const cwl = record.signals.cwlScore === undefined ? 0.5 : Math.min(1, Math.max(0, record.signals.cwlScore / 100));
  const zipf = record.signals.wordfreqZipf === undefined
    ? 0.5
    : Math.min(1, Math.max(0, (record.signals.wordfreqZipf - 2) / 6));
  const evidence = record.senses.some((sense) => sense.status === 'grounded') ? 0.1 : 0;
  return Math.min(1, Math.max(0, 0.45 * cwl + 0.45 * zipf + evidence));
}
