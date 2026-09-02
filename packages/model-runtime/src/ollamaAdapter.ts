import type {
  CandidateRequest,
  CandidateRole,
  CandidateSuggestion,
  LocalModelAdapter,
  ModelManifest
} from './broker';

export type LocalModelResponse = Readonly<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type LocalModelFetch = (
  input: string,
  init?: Readonly<{ method?: string; headers?: Readonly<Record<string, string>>; body?: string; signal?: AbortSignal }>
) => Promise<LocalModelResponse>;

export type OllamaAdapterOptions = Readonly<{
  baseUrl?: string;
  fetcher: LocalModelFetch;
}>;

function localBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Local model URL is invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Local model URL must use HTTP or HTTPS');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Local model URL must point to loopback');
  return parsed.toString().replace(/\/$/, '');
}

function jsonPrompt(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function looseCandidate(surface: string, role: CandidateRole): CandidateSuggestion {
  return {
    surface,
    intendedSense: 'Unresolved model association',
    associations: [],
    role,
    confidence: 0.2
  };
}

function normalizedRole(value: unknown, fallback: CandidateRole): CandidateRole {
  return typeof value === 'string' && ['theme', 'long', 'general', 'glue', 'stretch'].includes(value)
    ? value as CandidateRole
    : fallback;
}

function normalizedConfidence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  if (typeof value === 'string') {
    if (/^high$/i.test(value)) return 0.8;
    if (/^medium$/i.test(value)) return 0.5;
    if (/^low$/i.test(value)) return 0.2;
  }
  return 0.2;
}

function looseCandidates(value: string, request: CandidateRequest): CandidateSuggestion[] {
  const role = request.requestedRoles[0] ?? 'general';
  return value
    .split(/[\r\n,;]/)
    .map((line) => line
      .replace(/^\s*[-*+]\s*/, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/^["'`([{]+|["'`\])}]+$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[.!?:]+$/, '')
      .trim())
    .filter((surface) => {
      const fillLength = surface.replace(/[^A-Za-z]/g, '').length;
      return /^[A-Za-z][A-Za-z' -]*$/.test(surface)
        && fillLength >= 3
        && fillLength <= 15
           && !/^(candidate|surface|word|answer|list|error)$/i.test(surface);
    })
    .slice(0, request.maxSuggestions)
    .map((surface) => looseCandidate(surface, role));
}

function candidateOutput(value: string, request: CandidateRequest): unknown {
  const parsed = jsonPrompt(value);
  const items: unknown[] | undefined = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>).candidates)
      ? (parsed as Record<string, unknown>).candidates as unknown[]
      : undefined;
  if (!items) return looseCandidates(value, request);
  const role = request.requestedRoles[0] ?? 'general';
  return items.flatMap((item: unknown) => {
    if (typeof item === 'string') return [looseCandidate(item.trim(), role)];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [item];
    const candidate = item as Record<string, unknown>;
    const surface = typeof candidate.surface === 'string'
      ? candidate.surface
      : typeof candidate.answer === 'string'
        ? candidate.answer
        : typeof candidate.word === 'string'
          ? candidate.word
          : undefined;
    if (!surface) return [item];
    return [{
      surface,
      intendedSense: typeof candidate.intendedSense === 'string' && candidate.intendedSense.length > 0 ? candidate.intendedSense : 'Unresolved model association',
      associations: Array.isArray(candidate.associations) ? candidate.associations.filter((association): association is string => typeof association === 'string') : [],
      role: normalizedRole(candidate.role, role),
      confidence: normalizedConfidence(candidate.confidence)
    }];
  }).slice(0, request.maxSuggestions);
}

function candidatePrompt(request: CandidateRequest): string {
  return [
    'Return JSON only: an array of crossword candidate objects.',
    'Each object must contain surface, intendedSense, associations, role, and confidence.',
    'Prefer real answer surfaces suitable for a crossword; do not return clues or prose.',
    `Seed: ${request.seed}`,
    `Audience: ${request.audienceSummary}`,
    `Roles: ${request.requestedRoles.join(', ')}`,
    `Focus: ${request.focus ?? 'broad language, culture, science, history, and playful word intelligence'}`,
    `Target lengths: ${request.targetLengths?.join(', ') ?? 'mixed'}`,
    `Excluded answers: ${request.excludedAnswers.join(', ') || 'none'}`,
    `Maximum candidates: ${request.maxSuggestions}`
  ].join('\n');
}

function cluePrompt(request: Readonly<{ answer: string; intendedSense: string }>): string {
  return [
    'Return JSON only: an array of crossword clue draft objects.',
    'Each object must contain mechanism, text, and difficulty.',
    `Answer: ${request.answer}`,
    `Intended sense: ${request.intendedSense}`
  ].join('\n');
}

export function createOllamaAdapter(options: OllamaAdapterOptions): LocalModelAdapter {
  const baseUrl = localBaseUrl(options.baseUrl ?? 'http://127.0.0.1:11434');
  let modelId: string | undefined;

  async function call(path: string, body: Readonly<Record<string, unknown>> | undefined, signal?: AbortSignal): Promise<unknown> {
    const response = await options.fetcher(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
    if (!response.ok) throw new Error(`Local model request failed (${response.status})`);
    return response.json();
  }

  async function generate(prompt: string, signal?: AbortSignal): Promise<unknown> {
    if (!modelId) throw new Error('Local model is not loaded');
    const payload = await call('/api/generate', {
      model: modelId,
      prompt,
      stream: false,
      format: 'json',
      think: false,
      options: { temperature: 0.2 }
    }, signal);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
    const response = (payload as Record<string, unknown>).response;
    return typeof response === 'string' ? jsonPrompt(response) : undefined;
  }

  async function generateCandidates(request: CandidateRequest, signal?: AbortSignal): Promise<unknown> {
    if (!modelId) throw new Error('Local model is not loaded');
    const payload = await call('/api/generate', {
      model: modelId,
      prompt: candidatePrompt(request),
      stream: false,
      format: 'json',
      think: false,
      options: { temperature: 0.2 }
    }, signal);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
    const response = (payload as Record<string, unknown>).response;
    return typeof response === 'string' ? candidateOutput(response, request) : undefined;
  }

  return {
    async install(manifest: ModelManifest, signal) {
      await call('/api/pull', { name: manifest.id, stream: false }, signal);
    },
    async load(manifest: ModelManifest, signal) {
      const payload = await call('/api/tags', undefined, signal);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('Local model registry response is invalid');
      const models = (payload as Record<string, unknown>).models;
      if (!Array.isArray(models) || !models.some((model) => typeof model === 'object' && model !== null && (model as Record<string, unknown>).name === manifest.id)) {
        throw new Error(`Pinned local model ${manifest.id} is not installed`);
      }
      modelId = manifest.id;
    },
    generateCandidates,
    composeClues: (request, signal) => generate(cluePrompt(request), signal),
    async unload() {
      modelId = undefined;
    }
  };
}