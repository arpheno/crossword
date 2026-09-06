import {
  createModelBroker,
  createWebLLMAdapter,
  parseModelWorkerRequest,
  type BrokerResult,
  type CandidateRequest,
  type ModelBroker,
  type ModelWorkerOperation,
  type ModelWorkerRequest,
  type ModelWorkerResponse,
  type SpokenAnswerRequest
} from '@crossword/model-runtime';
import { createModelJobQueue } from './modelJobQueue';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ModelWorkerRequest>) => void) | null;
  postMessage: (message: ModelWorkerResponse) => void;
};
let broker: ModelBroker | undefined;

const post = (message: ModelWorkerResponse) => workerScope.postMessage(message);

const runOperation = (job: { requestId: string; operation: ModelWorkerOperation; payload: unknown; signal: AbortSignal }): Promise<BrokerResult<unknown>> => {
  if (!broker) return Promise.reject(new Error('Configure the model worker before use'));
  const payload = job.payload;
  switch (job.operation) {
    case 'inspect-cache': return broker.inspectCache();
    case 'install': return broker.install(job.signal, (progress) => post({ version: 1, type: 'progress', requestId: job.requestId, progress }));
    case 'load': return broker.load(job.signal, (progress) => post({ version: 1, type: 'progress', requestId: job.requestId, progress }));
    case 'generate-candidates':
      post({ version: 1, type: 'progress', requestId: job.requestId, progress: { phase: 'generating', progress: null, text: 'Generating local candidates' } });
      return broker.generateCandidates(payload as CandidateRequest, job.signal);
    case 'resolve-spoken-answer':
      post({ version: 1, type: 'progress', requestId: job.requestId, progress: { phase: 'generating', progress: null, text: 'Resolving spoken answer locally' } });
      return broker.resolveSpokenAnswer(payload as SpokenAnswerRequest, job.signal);
    case 'compose-clues':
      post({ version: 1, type: 'progress', requestId: job.requestId, progress: { phase: 'generating', progress: null, text: 'Drafting clues locally' } });
      return broker.composeClues(payload as Parameters<ModelBroker['composeClues']>[0], job.signal);
    case 'unload':
      post({ version: 1, type: 'progress', requestId: job.requestId, progress: { phase: 'unloading', progress: null, text: 'Releasing model memory' } });
      return broker.unload();
    case 'delete-cache':
      post({ version: 1, type: 'progress', requestId: job.requestId, progress: { phase: 'deleting-cache', progress: null, text: 'Deleting downloaded model files' } });
      return broker.deleteCache(job.signal);
  }
};

// Single-command arbiter (ADR 0004 §4): model commands run one at a time in
// arrival order; later commands queue instead of racing the single engine.
const queue = createModelJobQueue(post, runOperation, () => broker?.state());

workerScope.onmessage = (event) => {
  const message = parseModelWorkerRequest(event.data);
  if (!message) {
    post({ version: 1, type: 'protocol-error', message: 'Unsupported model worker message' });
    return;
  }
  if (message.type === 'cancel') {
    queue.cancel(message.requestId);
    return;
  }
  if (message.type === 'configure') {
    if (!queue.isIdle()) {
      post({ version: 1, type: 'protocol-error', requestId: message.requestId, message: 'Cannot reconfigure while model work is running' });
      return;
    }
    try {
      broker = createModelBroker(message.config.manifest, createWebLLMAdapter(), message.config.runtime);
      post({ version: 1, type: 'result', requestId: message.requestId, operation: 'configure', result: { ok: true, value: undefined } });
      post({ version: 1, type: 'state', state: broker.state() });
    } catch (error) {
      post({ version: 1, type: 'protocol-error', requestId: message.requestId, message: error instanceof Error ? error.message : 'Model worker configuration failed' });
    }
    return;
  }
  if (!broker) {
    post({ version: 1, type: 'protocol-error', requestId: message.requestId, message: 'Configure the model worker before use' });
    return;
  }
  queue.enqueue({ requestId: message.requestId, operation: message.operation, payload: message.payload });
};
