/**
 * Browser construction client: loads the public construction lexicon,
 * adapts the worker clients to the constructPuzzle ports, and runs the
 * end-to-end construction pipeline. All data is local; asset fetches come
 * from the app's own origin only.
 */
import { loadLexicon, type Lexicon } from '@crossword/construction';
import { constructPuzzle, type ConstructResult, type ConstructionProgressListener } from '@crossword/application';
import type { DayRecipe } from '@crossword/application';
import { browserRuntimeProbe } from './modelConfig';
import type { ModelWorkerClient } from './workers/modelClient';
import type { ConstructorWorkerClient } from './workers/constructorClient';

export type ConstructionClient = Readonly<{
  /** True when the lexicon artifacts are loaded and ready. */
  ready: () => boolean;
  /** Runs one construction; fails typed when the model is not enabled. */
  run: (
    request: { seed: string; day: string },
    options?: { signal?: AbortSignal; onProgress?: ConstructionProgressListener }
  ) => Promise<ConstructResult>;
}>;

export async function loadConstructionAssets(baseUrl = ''): Promise<Lexicon> {
  // The browser receives only the approved construction lexicon. The former
  // frequency-prior asset was derived from a private provider corpus and must
  // remain laboratory-only; keeping it out of this fetch path also makes the
  // public artifact boundary enforceable by inspection.
  const lexiconText = await fetch(`${baseUrl}/data/fill-lexicon-v1.txt`).then((response) => {
    if (!response.ok) throw new Error(`Lexicon artifact unavailable (${response.status})`);
    return response.text();
  });
  return loadLexicon(lexiconText);
}

export function createConstructionClient(
  modelClient: ModelWorkerClient,
  constructorClient: ConstructorWorkerClient,
  lexicon: Lexicon,
  recipeByDay: Readonly<Record<string, DayRecipe>>,
  modelId: string
): ConstructionClient {
  return {
    ready: () => lexicon.wordCount > 0,
    async run(request, options = {}) {
      return constructPuzzle(
        {
          state: modelClient.state,
          probe: () => browserRuntimeProbe(),
          install: (installSignal) => modelClient.install(installSignal),
          load: (loadSignal) => modelClient.load(loadSignal),
          generateCandidates: (candidateRequest, candidateSignal) => modelClient.generateCandidates(candidateRequest, candidateSignal),
          resolveSpokenAnswer: (spokenAnswerRequest, spokenAnswerSignal) => modelClient.resolveSpokenAnswer(spokenAnswerRequest, spokenAnswerSignal),
          composeClues: (clueRequest, clueSignal) => modelClient.composeClues(clueRequest, clueSignal),
          unload: () => modelClient.unload(),
          inspectCache: () => modelClient.inspectCache(),
          deleteCache: (deleteSignal) => modelClient.deleteCache(deleteSignal)
        },
        {
          solve: (fillRequest, fillOptions) => constructorClient.solve(fillRequest, fillOptions)
        },
        {
          recipe: recipeByDay[request.day]!,
          seed: request.seed,
          lexicon,
          modelId
        },
        options.signal,
        options.onProgress
      );
    }
  };
}
