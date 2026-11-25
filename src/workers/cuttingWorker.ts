/**
 * Web Worker Coordinator for Linear Cutting Optimization
 * Executes off-thread to prevent browser tab freezing and orchestrates helper passWorker pool
 */
import {
  solveLinearCuttingAsync,
  runBalanceSuiteAsync,
  SuiteItem,
  solveNaiveSequentialCutting,
  ParallelPassExecutor,
  ParallelPassSearchRequest,
  ParallelPassSearchResult,
  WorkerPoolProgressInfo,
  executeWorkerPool,
  getAvailableHelperThreadLimit,
} from '../utils/cuttingEngine';
import {
  StockItem,
  DemandItem,
  AppSettings,
  CalculationProgressInfo,
  FullOptimizationSolution,
} from '../types/cutting';

export interface WorkerStartPayload {
  stockInput: StockItem[];
  demandInput: DemandItem[];
  settings: AppSettings;
}

export interface WorkerStartMessage {
  type: 'START';
  payload: WorkerStartPayload;
}

export interface WorkerAbortMessage {
  type: 'ABORT';
}

export interface WorkerPoolResultMessage {
  type: 'POOL_RESULT';
  payload: {
    reqId: number;
    result: ParallelPassSearchResult;
  };
}

export interface WorkerPoolProgressMessage {
  type: 'POOL_PROGRESS';
  payload: {
    reqId: number;
    progress: WorkerPoolProgressInfo;
  };
}

export type WorkerInMessage =
  | WorkerStartMessage
  | WorkerAbortMessage
  | WorkerPoolResultMessage
  | WorkerPoolProgressMessage;

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  payload: CalculationProgressInfo;
}

export interface WorkerDoneMessage {
  type: 'DONE';
  payload: FullOptimizationSolution;
}

export interface WorkerSuiteDoneMessage {
  type: 'SUITE_DONE';
  payload: {
    suite: SuiteItem[];
    bestSolution: FullOptimizationSolution;
  };
}

export interface WorkerRunPoolInMainMessage {
  type: 'RUN_POOL_IN_MAIN';
  payload: {
    reqId: number;
    request: ParallelPassSearchRequest;
  };
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  payload: string;
}

export type WorkerOutMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerSuiteDoneMessage
  | WorkerRunPoolInMainMessage
  | WorkerErrorMessage;

let isAborted = false;
const nestedHelperPool: Worker[] = [];
let nestedWorkersUnsupported = typeof Worker === 'undefined';
let poolReqSeq = 0;

interface PendingMainPoolEntry {
  resolve: (result: ParallelPassSearchResult) => void;
  onProgress?: (progress: WorkerPoolProgressInfo) => void;
}

const pendingMainPools = new Map<number, PendingMainPoolEntry>();

const parallelExecutor: ParallelPassExecutor = async (request, onProgress) => {
  if (!nestedWorkersUnsupported) {
    const poolResult = await executeWorkerPool({
      poolCache: nestedHelperPool,
      createWorker: () =>
        new Worker(new URL('./passWorker.ts', import.meta.url), { type: 'module' }),
      request,
      maxHelpers: getAvailableHelperThreadLimit(),
      shouldAbort: () => isAborted,
      onProgress,
    });
    if (!poolResult.nestedUnsupported) {
      return poolResult;
    }
    nestedWorkersUnsupported = true;
  }

  const reqId = ++poolReqSeq;
  return new Promise<ParallelPassSearchResult>((resolve) => {
    pendingMainPools.set(reqId, { resolve, onProgress });
    const msg: WorkerRunPoolInMainMessage = {
      type: 'RUN_POOL_IN_MAIN',
      payload: { reqId, request },
    };
    self.postMessage(msg);
  });
};

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const { data } = e;

  if (data.type === 'ABORT') {
    isAborted = true;
    return;
  }

  if (data.type === 'POOL_PROGRESS') {
    const entry = pendingMainPools.get(data.payload.reqId);
    entry?.onProgress?.(data.payload.progress);
    return;
  }

  if (data.type === 'POOL_RESULT') {
    const entry = pendingMainPools.get(data.payload.reqId);
    if (entry) {
      pendingMainPools.delete(data.payload.reqId);
      entry.resolve(data.payload.result);
    }
    return;
  }

  if (data.type === 'START') {
    isAborted = false;
    const { stockInput, demandInput, settings } = data.payload;

    try {
      if (settings.optimizationGoal === 'balance') {
        const result = await runBalanceSuiteAsync(
          stockInput,
          demandInput,
          settings,
          {
            onProgress: (progress: CalculationProgressInfo) => {
              self.postMessage({ type: 'PROGRESS', payload: progress });
            },
            shouldAbort: () => isAborted,
          },
          parallelExecutor
        );

        self.postMessage({
          type: 'SUITE_DONE',
          payload: { suite: result.suite, bestSolution: result.bestSolution },
        });
      } else {
        let solution = await solveLinearCuttingAsync(
          stockInput,
          demandInput,
          settings,
          {
            onProgress: (progress: CalculationProgressInfo) => {
              self.postMessage({ type: 'PROGRESS', payload: progress });
            },
            shouldAbort: () => isAborted,
          },
          parallelExecutor
        );

        if ((!solution || solution.rows.length === 0) && demandInput.length > 0) {
          solution = solveNaiveSequentialCutting(stockInput, demandInput, settings, 12000);
        }

        self.postMessage({ type: 'DONE', payload: solution });
      }
    } catch (err: unknown) {
      console.warn('Worker execution error, falling back to sequential:', err);
      try {
        const fallback = solveNaiveSequentialCutting(stockInput, demandInput, settings, 12000);
        self.postMessage({ type: 'DONE', payload: fallback });
      } catch (_e2: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Непредвиденная ошибка в процессе оптимизации раскроя';
        self.postMessage({
          type: 'ERROR',
          payload: message,
        });
      }
    }
  }
};

