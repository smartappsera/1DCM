import {
  AppSettings,
  CalculationProgressInfo,
  CustomStrategyConfig,
  StockItem,
} from '../../types/cutting';

/**
 * Supported optimization strategies in the CutMaster 1D pipeline.
 * - min_setups: Minimize unique cutting cards (saw setups).
 * - min_material: Minimize total consumed stock bars/meters (including warehouse remnants), breaking ties by fewer cards and less waste.
 * - balance: Minimize unique cutting cards subject to a material consumption cap (totalStockLengthMm <= materialCapMm).
 * - custom: User-configured strategy parameters.
 */
export type StrategyType =
  | 'min_setups'
  | 'min_material'
  | 'forced_remnant_shaping'
  | 'remnant_fill'
  | 'balance'
  | 'custom';

/**
 * Immutable representation of a grouped cutting pattern card.
 * Single source of truth for both intermediate progress and final SolutionRow generation.
 */
export interface CutCard {
  readonly signature: string; // Canonical key: `${barSize}:${piecesSortedDesc.join(',')}${isTailSingle ? ':S' : ''}`
  readonly barSize: number; // Physical stock bar length (mm)
  readonly effectiveSm: number; // Scaled usable length (NOD units)
  readonly spentSm: number; // Scaled occupied length (NOD units)
  readonly partsLengthMm: number; // Sum of cut piece lengths (mm)
  readonly kerfLossMm: number; // Saw kerf loss per bar (mm)
  readonly trimLossMm: number; // Edge trim loss per bar (mm)
  readonly remainderMm: number; // Remaining tail after parts, trim, and kerf (mm)
  readonly reusableRemnantMm: number; // Reusable remnant length (mm)
  readonly scrapRemnantMm: number; // Non-reusable scrap tail (mm)
  readonly isReusable: boolean;
  readonly isRemnantBar: boolean; // True when physical bar is a warehouse remnant (not standard stock)
  readonly isTailSingle?: boolean; // True when card belongs to a single-profile remainder tail in batch mode
  readonly isLockedRemnant?: boolean; // True when locked from Stage A remnant prioritization
  readonly count: number; // Number of identical bars using this card (>= 1)
  readonly pieceLengths: readonly number[]; // Sorted descending (mm)
}

/**
 * Unified metrics computed exclusively by calculateMetrics().
 */
export interface CutMetrics {
  readonly uniqueCardsCount: number;
  readonly totalBarsUsed: number;
  readonly totalStockLengthMm: number;
  readonly totalPartsLengthMm: number;
  readonly totalWasteMm: number;
  readonly totalScrapMm: number;
  readonly totalReusableMm: number;
  readonly maxReusableRemnantMm: number;
  readonly targetReusableMm: number;
  readonly remnantsUsedCount: number;
  readonly remnantsUsedMm: number;
  readonly overallKIM: number;
  readonly netKIM: number;
  readonly cuttingIndex: number;
  readonly cuttingIndexMaterial: number;
  readonly cuttingIndexSetup: number;
  readonly unplacedCount: number;
  readonly unplacedLengthMm: number;
}

/**
 * Immutable execution context shared across all pipeline steps.
 */
export interface CutContext {
  readonly startTime: number;
  readonly bladeWidth: number; // dRez (mm)
  readonly edgeTrim: number; // krm (mm)
  readonly reusableRemnantMin: number; // delOst (mm)
  readonly searchRemnantMin: number; // remnant threshold applied during search (0 when shapeRemnantsInSearch=false)
  readonly targetRemnantMin: number; // targetRemnantMinLength (mm)
  readonly targetRemnantKIM: number; // 0..100 (%) legacy alias for remnantMinFillPct
  readonly remnantMinFillPct?: number; // 0..100 (%) minimum remnant fill percent
  readonly dualProfileCut: boolean;
  readonly fillControlEnabled: boolean;
  readonly fillControlThreshold: number;
  readonly groupSolutions: boolean;
  readonly searchSpeed: AppSettings['searchSpeed'];
  readonly prioritizeRemnants: boolean;
  readonly nod: number; // GCD scaling factor
  readonly scaledDemand: readonly number[];
  readonly scaledStockAll: readonly number[];
  readonly scaledStockRemnants: readonly number[];
  readonly scaledStockStandard: readonly number[];
  readonly activeStandardLengths: readonly number[];
  readonly remnantBarSizes?: readonly number[];
  readonly lpMinBarsLowerBound?: number;
  readonly totalDemandLengthMm: number;
  readonly totalPartsCount: number;
  readonly totalBarsEstimate: number;
  readonly maxSortZ: number;
  readonly maxSort: number;
  readonly maxVar: number;
  readonly stockInput: readonly StockItem[];
  readonly settings: AppSettings;
  readonly materialCapMm?: number;
  readonly customConfig?: CustomStrategyConfig;
  readonly onProgress?: (progress: CalculationProgressInfo) => void;
  readonly shouldAbort?: () => boolean;
}

export interface CutTelemetryCounters {
  readonly passesEvaluated: number;
  readonly prunedPasses?: number;
  readonly totalCombinationsChecked: number;
  readonly twoOptSwapIterations: number;
  readonly tailConsolidationCardsMerged: number;
  readonly initialCardsCount: number;
  readonly stage1Ms: number;
  readonly stage2Ms: number;
  readonly stage3Ms: number;
  readonly threadsUsed?: number;
  readonly chunksProcessed?: number;
  readonly totalPassesPlanned?: number;
  readonly abortedDuringSearch?: boolean;
  readonly abortedStageViewedPasses?: number;
  readonly abortedStageTotalPasses?: number;
}

export type PassSearchProfile = 'best' | 'fastPrefix' | 'stdPrefix' | 'front';

export interface PassProfileCandidate {
  readonly profile: PassSearchProfile;
  readonly passIndex: number;
  readonly score: number;
  readonly cards: readonly CutCard[];
  readonly unplacedScaled: readonly number[];
  readonly metrics: CutMetrics;
}

export interface ParetoFrontPoint {
  readonly passIndex: number;
  readonly score: number;
  readonly totalStockLengthMm: number;
  readonly totalBarsUsed: number;
  readonly uniqueCardsCount: number;
  readonly totalWasteMm: number;
  readonly cards: readonly CutCard[];
  readonly unplacedScaled: readonly number[];
  readonly metrics: CutMetrics;
}

export interface PassRangeExecutionResult {
  readonly fromPass: number;
  readonly toPass: number;
  readonly passesEvaluated: number;
  readonly prunedPasses: number;
  readonly totalCombinationsChecked: number;
  readonly earlyExitPassIndex: number | null;
  readonly aborted: boolean;
  readonly stage1Ms: number;
  readonly profiles: readonly PassProfileCandidate[];
  readonly front: readonly ParetoFrontPoint[];
}

export interface MergedPassResults {
  readonly best: PassProfileCandidate | null;
  readonly fastPrefix: PassProfileCandidate | null;
  readonly stdPrefix: PassProfileCandidate | null;
  readonly front: readonly ParetoFrontPoint[];
  readonly passesEvaluated: number;
  readonly prunedPasses: number;
  readonly totalCombinationsChecked: number;
  readonly earlyExitPassIndex: number | null;
  readonly aborted: boolean;
  readonly chunksCount: number;
}

/**
 * Immutable pipeline state passed from step to step.
 */
export interface CutState {
  readonly cards: readonly CutCard[];
  readonly metrics: CutMetrics;
  readonly unplacedScaled: readonly number[];
  readonly score: number;
  readonly context: CutContext;
  readonly telemetryCounters: CutTelemetryCounters;
}

export interface SearchPackingConfig {
  readonly useGreedy: boolean;
  readonly targetCap: number;
  readonly tolerance: number;
}

export type PipelineStep = (state: CutState, strategy: CuttingStrategy) => CutState;

export interface CuttingStrategy {
  readonly type: StrategyType;
  readonly name: string;
  readonly allowPatternSplitting: boolean;
  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number;
  getSearchPackingConfig(
    passVar: number,
    sm: number,
    sumData: number,
    context: CutContext
  ): SearchPackingConfig;
  getBatchCount(
    rawBatchCount: number,
    hasScrapWaste: boolean,
    barKIM: number,
    context: CutContext
  ): number;
  buildPipeline(context: CutContext): readonly PipelineStep[];
}
