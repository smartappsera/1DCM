import {
  CutContext,
  CuttingStrategy,
  ForcedRemnantShapingStrategy,
  MinimizeBalanceStrategy,
  PassRangeExecutionResult,
  PassSearchProfile,
  StrategyType,
  executePassRange,
  getStrategy,
} from '../utils/cutting';

export type SerializableCutContext = Omit<CutContext, 'onProgress' | 'shouldAbort'>;

export interface PassWorkerInitPayload {
  jobId: number;
  context: SerializableCutContext;
  strategyType: StrategyType;
  materialCapMm?: number;
  cutoffMm?: number;
}

export interface PassWorkerRunChunkPayload {
  jobId: number;
  chunkId: number;
  fromPass: number;
  toPass: number;
  profiles: readonly PassSearchProfile[];
}

export type PassWorkerInMessage =
  | { type: 'INIT'; payload: PassWorkerInitPayload }
  | { type: 'RUN_CHUNK'; payload: PassWorkerRunChunkPayload };

export type PassWorkerOutMessage =
  | { type: 'INIT_OK'; payload: { jobId: number } }
  | {
      type: 'CHUNK_DONE';
      payload: {
        jobId: number;
        chunkId: number;
        result: PassRangeExecutionResult;
      };
    }
  | {
      type: 'ERROR';
      payload: {
        jobId: number;
        chunkId?: number;
        message: string;
      };
    };

let activeJobId = -1;
let activeContext: CutContext | null = null;
let activeStrategy: CuttingStrategy | null = null;

self.onmessage = (e: MessageEvent<PassWorkerInMessage>) => {
  const msg = e.data;
  if (msg.type === 'INIT') {
    const { jobId, context, strategyType, materialCapMm, cutoffMm } = msg.payload;
    try {
      activeJobId = jobId;
      activeContext = context;
      activeStrategy =
        strategyType === 'balance' && materialCapMm !== undefined
          ? new MinimizeBalanceStrategy(materialCapMm)
          : strategyType === 'forced_remnant_shaping'
            ? new ForcedRemnantShapingStrategy(cutoffMm ?? 0)
            : getStrategy(strategyType, context.settings);
      const reply: PassWorkerOutMessage = {
        type: 'INIT_OK',
        payload: { jobId },
      };
      self.postMessage(reply);
    } catch (err: unknown) {
      const reply: PassWorkerOutMessage = {
        type: 'ERROR',
        payload: {
          jobId,
          message: err instanceof Error ? err.message : 'Ошибка инициализации рабочего потока',
        },
      };
      self.postMessage(reply);
    }
    return;
  }

  if (msg.type === 'RUN_CHUNK') {
    const { jobId, chunkId, fromPass, toPass, profiles } = msg.payload;
    if (jobId !== activeJobId || !activeContext || !activeStrategy) {
      const reply: PassWorkerOutMessage = {
        type: 'ERROR',
        payload: {
          jobId,
          chunkId,
          message: 'Контекст рабочего потока не инициализирован для текущей задачи',
        },
      };
      self.postMessage(reply);
      return;
    }

    try {
      const result = executePassRange(
        activeContext,
        activeStrategy,
        fromPass,
        toPass,
        profiles
      );
      const reply: PassWorkerOutMessage = {
        type: 'CHUNK_DONE',
        payload: { jobId, chunkId, result },
      };
      self.postMessage(reply);
    } catch (err: unknown) {
      const reply: PassWorkerOutMessage = {
        type: 'ERROR',
        payload: {
          jobId,
          chunkId,
          message: err instanceof Error ? err.message : 'Ошибка выполнения диапазона проходов',
        },
      };
      self.postMessage(reply);
    }
  }
};
