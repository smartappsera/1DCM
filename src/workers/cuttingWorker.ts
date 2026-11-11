/**
 * Web Worker for Linear Cutting Optimization
 * Executes off-thread to prevent browser tab freezing and maintain 60fps UI responsiveness
 */
import {
  solveLinearCutting,
  runComprehensiveSuite,
  ComprehensiveSuiteItem,
  solveNaiveSequentialCutting,
} from '../utils/cuttingEngine';
import { StockItem, DemandItem, AppSettings, CalculationProgressInfo, FullOptimizationSolution } from '../types/cutting';

export interface WorkerStartPayload {
  stockInput: StockItem[];
  demandInput: DemandItem[];
  settings: AppSettings;
  isComprehensive?: boolean;
}

export interface WorkerStartMessage {
  type: 'START';
  payload: WorkerStartPayload;
}

export interface WorkerAbortMessage {
  type: 'ABORT';
}

export type WorkerInMessage = WorkerStartMessage | WorkerAbortMessage;

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  payload: CalculationProgressInfo;
}

export interface WorkerDoneMessage {
  type: 'DONE';
  payload: FullOptimizationSolution;
}

export interface WorkerComprehensiveDoneMessage {
  type: 'COMPREHENSIVE_DONE';
  payload: {
    suite: ComprehensiveSuiteItem[];
    bestSolution: FullOptimizationSolution;
  };
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  payload: string;
}

export type WorkerOutMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerComprehensiveDoneMessage
  | WorkerErrorMessage;

let isAborted = false;

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { data } = e;

  if (data.type === 'ABORT') {
    isAborted = true;
    return;
  }

  if (data.type === 'START') {
    isAborted = false;
    const { stockInput, demandInput, settings, isComprehensive } = data.payload;

    try {
      if (isComprehensive || settings.optimizationGoal === 'comprehensive') {
        const result = runComprehensiveSuite(stockInput, demandInput, settings, {
          onProgress: (progress: CalculationProgressInfo) => {
            self.postMessage({ type: 'PROGRESS', payload: progress });
          },
          shouldAbort: () => isAborted,
        });

        self.postMessage({
          type: 'COMPREHENSIVE_DONE',
          payload: result,
        });
        self.postMessage({ type: 'DONE', payload: result.bestSolution });
      } else {
        let solution = solveLinearCutting(stockInput, demandInput, settings, {
          onProgress: (progress: CalculationProgressInfo) => {
            self.postMessage({ type: 'PROGRESS', payload: progress });
          },
          shouldAbort: () => isAborted,
        });

        if ((!solution || solution.rows.length === 0) && demandInput.length > 0) {
          solution = solveNaiveSequentialCutting(stockInput, demandInput, settings, 12000);
        }

        self.postMessage({ type: 'DONE', payload: solution });
      }
    } catch (err: any) {
      console.warn('Worker execution error, falling back to sequential:', err);
      try {
        const fallback = solveNaiveSequentialCutting(stockInput, demandInput, settings, 12000);
        self.postMessage({ type: 'DONE', payload: fallback });
      } catch (e2: any) {
        self.postMessage({
          type: 'ERROR',
          payload: err?.message || 'Непредвиденная ошибка в процессе оптимизации раскроя',
        });
      }
    }
  }
};
