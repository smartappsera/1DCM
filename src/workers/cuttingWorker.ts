/**
 * Web Worker for Linear Cutting Optimization
 * Executes off-thread to prevent browser tab freezing and maintain 60fps UI responsiveness
 */
import { solveLinearCutting } from '../utils/cuttingEngine';
import { StockItem, DemandItem, AppSettings, CalculationProgressInfo, FullOptimizationSolution } from '../types/cutting';

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

export type WorkerInMessage = WorkerStartMessage | WorkerAbortMessage;

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  payload: CalculationProgressInfo;
}

export interface WorkerDoneMessage {
  type: 'DONE';
  payload: FullOptimizationSolution;
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  payload: string;
}

export type WorkerOutMessage = WorkerProgressMessage | WorkerDoneMessage | WorkerErrorMessage;

let isAborted = false;

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { data } = e;

  if (data.type === 'ABORT') {
    isAborted = true;
    return;
  }

  if (data.type === 'START') {
    isAborted = false;
    const { stockInput, demandInput, settings } = data.payload;

    try {
      const solution = solveLinearCutting(stockInput, demandInput, settings, {
        onProgress: (progress: CalculationProgressInfo) => {
          self.postMessage({ type: 'PROGRESS', payload: progress });
        },
        shouldAbort: () => isAborted,
      });

      self.postMessage({ type: 'DONE', payload: solution });
    } catch (err: any) {
      self.postMessage({
        type: 'ERROR',
        payload: err?.message || 'Непредвиденная ошибка в процессе оптимизации раскроя',
      });
    }
  }
};
