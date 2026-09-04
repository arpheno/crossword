import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BrokerResult,
  ModelProgress,
  ModelState,
  ModelWorkerConfig
} from '@crossword/model-runtime';
import { browserRuntimeProbe, localModelManifest } from './modelConfig';
import { createBrowserModelWorkerClient, type ModelWorkerClient } from './workers/modelClient';

export type ModelCacheStatus = 'unknown' | 'checking' | 'not-cached' | 'cached';

export type ModelSetupPhase =
  | 'idle'
  | 'checking-compatibility'
  | 'checking-cache'
  | 'downloading'
  | 'loading-runtime'
  | 'ready'
  | 'generating'
  | 'cancelling'
  | 'unloading'
  | 'deleting-cache'
  | 'cancelled'
  | 'error';

export type ModelSetupIntent =
  | { type: 'settings' }
  | { type: 'construction'; day: string };

export type LocalModelSnapshot = Readonly<{
  cacheStatus: ModelCacheStatus;
  brokerState: ModelState;
  phase: ModelSetupPhase;
  progress: number | null;
  detail: string;
  error: null | { code: string; message: string; recovery: string };
  operationStartedAt: number | null;
  intent: ModelSetupIntent | null;
}>;

export type LocalModelController = Readonly<{
  snapshot: LocalModelSnapshot;
  client: ModelWorkerClient | null;
  getClient: () => ModelWorkerClient;
  inspectCache: () => Promise<void>;
  prepare: (intent: ModelSetupIntent) => Promise<boolean>;
  cancel: () => void;
  unload: () => Promise<boolean>;
  deleteCache: () => Promise<boolean>;
  dismissError: () => void;
}>;

const initialSnapshot: LocalModelSnapshot = {
  cacheStatus: 'unknown',
  brokerState: 'uninstalled',
  phase: 'idle',
  progress: null,
  detail: '',
  error: null,
  operationStartedAt: null,
  intent: null
};

function recoveryFor(code: string): string {
  switch (code) {
    case 'unsupported-device': return 'Use a browser with WebGPU and enough available memory, then retry.';
    case 'storage-quota': return 'Free some browser storage, then retry the download.';
    case 'cancelled': return 'The downloaded files may be reusable; choose Load or Download again when ready.';
    case 'model-not-enabled': return 'Open Model settings and prepare the local model first.';
    default: return 'Retry from Model settings. Your current puzzle is safe.';
  }
}
function errorMessage(result: BrokerResult<unknown>): { code: string; message: string; recovery: string } | null {
  if (result.ok) return null;
  return { code: result.error.code, message: result.error.message, recovery: recoveryFor(result.error.code) };
}

function phaseForProgress(progress: ModelProgress): ModelSetupPhase {
  if (progress.phase === 'downloading') return 'downloading';
  if (progress.phase === 'loading-runtime') return 'loading-runtime';
  if (progress.phase === 'generating') return 'generating';
  if (progress.phase === 'unloading') return 'unloading';
  return 'deleting-cache';
}

function progressForOperation(snapshot: LocalModelSnapshot, progress: ModelProgress): ModelProgress {
  // A cache check happens before a cached install/load. The WebLLM callback
  // still labels its lower-level operation “downloading”; the user-facing
  // phase must remain honest about the known cache residency.
  if (snapshot.cacheStatus === 'cached' && progress.phase === 'downloading') {
    return { ...progress, phase: 'loading-runtime' };
  }
  return progress;
}

async function modelConfig(): Promise<ModelWorkerConfig> {
  const estimate = await navigator.storage?.estimate();
  return {
    manifest: localModelManifest,
    runtime: {
      ...browserRuntimeProbe(),
      storageQuotaBytes: estimate?.quota ?? 0,
      storageUsageBytes: estimate?.usage ?? 0
    }
  };
}

export function useLocalModelController(): LocalModelController {
  const [snapshot, setSnapshot] = useState<LocalModelSnapshot>(initialSnapshot);
  const [client, setClient] = useState<ModelWorkerClient | null>(null);
  const clientRef = useRef<ModelWorkerClient | null>(null);
  const configuredRef = useRef(false);
  const operationControllerRef = useRef<AbortController | null>(null);

  const getClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;
    const next = createBrowserModelWorkerClient();
    clientRef.current = next;
    setClient(next);
    next.subscribeProgress((progress) => {
      setSnapshot((current) => {
        const visible = progressForOperation(current, progress);
        return {
          ...current,
          phase: phaseForProgress(visible),
          progress: visible.progress,
          detail: visible.text,
          error: null
        };
      });
    });
    next.subscribeState((state) => {
      setSnapshot((current) => ({
        ...current,
        brokerState: state,
        phase: state === 'loaded' && !['generating', 'unloading', 'deleting-cache'].includes(current.phase) ? 'ready' : current.phase,
        detail: state === 'loaded' && current.phase === 'ready' ? 'Ready for local construction and voice solving.' : current.detail
      }));
    });
    return next;
  }, []);

  useEffect(() => () => {
    operationControllerRef.current?.abort();
    clientRef.current?.dispose();
  }, []);

  const configure = useCallback(async (next: ModelWorkerClient) => {
    if (configuredRef.current) return true;
    const result = await next.configure(await modelConfig());
    if (!result.ok) {
      setSnapshot((current) => ({ ...current, phase: 'error', error: errorMessage(result), detail: result.error.message }));
      return false;
    }
    configuredRef.current = true;
    return true;
  }, []);

  const inspectCache = useCallback(async () => {
    const next = getClient();
    setSnapshot((current) => ({ ...current, cacheStatus: 'checking', phase: 'checking-cache', progress: null, detail: 'Checking this browser for the downloaded model…', error: null }));
    if (!await configure(next)) return;
    const result = await next.inspectCache();
    if (!result.ok) {
      setSnapshot((current) => ({ ...current, cacheStatus: 'unknown', phase: 'error', error: errorMessage(result), detail: result.error.message }));
      return;
    }
    setSnapshot((current) => ({
      ...current,
      cacheStatus: result.value ? 'cached' : 'not-cached',
      phase: current.brokerState === 'loaded' ? 'ready' : 'idle',
      progress: null,
      detail: result.value ? 'On this browser · not loaded into memory.' : 'Not downloaded on this browser.',
      error: null
    }));
  }, [configure, getClient]);

  const prepare = useCallback(async (intent: ModelSetupIntent) => {
    const next = getClient();
    const controller = new AbortController();
    operationControllerRef.current?.abort();
    operationControllerRef.current = controller;
    setSnapshot((current) => ({
      ...current,
      phase: 'checking-compatibility',
      progress: null,
      detail: 'Checking browser support and available storage…',
      error: null,
      operationStartedAt: Date.now(),
      intent
    }));

    try {
      if (!await configure(next)) return false;
      let cacheStatus = snapshot.cacheStatus;
      if (cacheStatus === 'unknown' || cacheStatus === 'checking') {
        const cache = await next.inspectCache();
        if (!cache.ok) {
          setSnapshot((current) => ({ ...current, phase: 'error', error: errorMessage(cache), detail: cache.error.message }));
          return false;
        }
        cacheStatus = cache.value ? 'cached' : 'not-cached';
        setSnapshot((current) => ({ ...current, cacheStatus }));
      }
      const phase: ModelSetupPhase = cacheStatus === 'cached' ? 'loading-runtime' : 'downloading';
      setSnapshot((current) => ({ ...current, phase, progress: null, detail: phase === 'downloading' ? `Downloading ${localModelManifest.id}…` : 'Loading the model from browser storage…' }));
      const installed = await next.install(controller.signal);
      if (!installed.ok) {
        setSnapshot((current) => ({ ...current, phase: installed.error.code === 'cancelled' ? 'cancelled' : 'error', progress: null, error: errorMessage(installed), detail: installed.error.message, operationStartedAt: null }));
        return false;
      }
      setSnapshot((current) => ({ ...current, phase: 'loading-runtime', progress: null, detail: 'Finalizing the local runtime…' }));
      const loaded = await next.load(controller.signal);
      if (!loaded.ok) {
        setSnapshot((current) => ({ ...current, phase: loaded.error.code === 'cancelled' ? 'cancelled' : 'error', progress: null, error: errorMessage(loaded), detail: loaded.error.message, operationStartedAt: null }));
        return false;
      }
      setSnapshot((current) => ({ ...current, cacheStatus: 'cached', brokerState: 'loaded', phase: 'ready', progress: 1, detail: 'Ready for local construction and voice solving.', error: null, operationStartedAt: null, intent }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The local model could not be prepared.';
      setSnapshot((current) => ({ ...current, phase: controller.signal.aborted ? 'cancelled' : 'error', detail: message, error: { code: controller.signal.aborted ? 'cancelled' : 'runtime-error', message, recovery: recoveryFor(controller.signal.aborted ? 'cancelled' : 'runtime-error') }, operationStartedAt: null }));
      return false;
    } finally {
      if (operationControllerRef.current === controller) operationControllerRef.current = null;
    }
  }, [configure, getClient, snapshot.cacheStatus]);

  const cancel = useCallback(() => {
    const controller = operationControllerRef.current;
    if (!controller) return;
    setSnapshot((current) => ({ ...current, phase: 'cancelling', detail: 'Stopping model preparation…' }));
    controller.abort();
  }, []);

  const unload = useCallback(async () => {
    const next = getClient();
    setSnapshot((current) => ({ ...current, phase: 'unloading', progress: null, detail: 'Releasing model memory…', error: null }));
    const result = await next.unload();
    if (!result.ok) {
      setSnapshot((current) => ({ ...current, phase: 'error', error: errorMessage(result), detail: result.error.message }));
      return false;
    }
    setSnapshot((current) => ({ ...current, brokerState: 'installed', phase: 'idle', progress: null, detail: 'On this browser · not loaded. Downloaded files stay on this device.' }));
    return true;
  }, [getClient]);

  const deleteCache = useCallback(async () => {
    const next = getClient();
    setSnapshot((current) => ({ ...current, phase: 'deleting-cache', progress: null, detail: 'Deleting downloaded model files…', error: null }));
    const result = await next.deleteCache();
    if (!result.ok) {
      setSnapshot((current) => ({ ...current, phase: 'error', error: errorMessage(result), detail: result.error.message }));
      return false;
    }
    setSnapshot((current) => ({ ...current, cacheStatus: 'not-cached', brokerState: 'uninstalled', phase: 'idle', progress: null, detail: 'Downloaded model files deleted from this browser.' }));
    return true;
  }, [getClient]);

  const dismissError = useCallback(() => {
    setSnapshot((current) => ({ ...current, error: null, phase: current.brokerState === 'loaded' ? 'ready' : 'idle', detail: current.brokerState === 'loaded' ? 'Ready for local construction and voice solving.' : current.detail }));
  }, []);

  return { snapshot, client, getClient, inspectCache, prepare, cancel, unload, deleteCache, dismissError };
}
