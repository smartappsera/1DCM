export type {
  StrategyType,
  CutCard,
  CutMetrics,
  CutContext,
  CutTelemetryCounters,
  CutState,
  SearchPackingConfig,
  PipelineStep,
  CuttingStrategy,
  PassSearchProfile,
  PassProfileCandidate,
  ParetoFrontPoint,
  PassRangeExecutionResult,
  MergedPassResults,
} from './types';

export type { BatchRowSplit } from './metrics';

export {
  INDEX_FLOOR,
  SETUP_WEIGHT,
  computeCuttingIndexScale,
  computeCuttingIndexFromTotals,
  computeCuttingIndexFromSolution,
  computeMaxReusableRemnantFromSolution,
  getBatchRowSplit,
  buildCardSignature,
  createCutCard,
  sortCardsDeterministically,
  groupIdenticalCards,
  calculateMetrics,
} from './metrics';

export {
  PASS_CHUNK_SIZE,
  executePassRange,
  mergePassResults,
  buildBaseStateFromMergedPassResults,
  StepGroupIdenticalCards,
  StepGenerateBasePatterns,
  StepGenerateBasePatternsForStrategies,
  Step2OptPostProcess,
  StepOptimizeWaste,
  StepConsolidateSetups,
} from './steps';

export {
  computeSearchWasteMm,
  MinimizeSetupsStrategy,
  MinimizeMaterialStrategy,
  ForcedRemnantShapingStrategy,
  RemnantFillStrategy,
  MinimizeBalanceStrategy,
  STRATEGY_REGISTRY,
  registerStrategy,
  resolveStrategyType,
  getStrategy,
  runPostGenerationSteps,
  refineBaseStateWithPipeline,
  runCuttingPipeline,
  runMultiCapBalancePipelines,
} from './strategies';

export {
  PALETTE,
  RICH_DYNAMIC_COLORS,
  getDefaultDemandColor,
  getColorForLength,
  getMemoryUsageMb,
  myGcd,
  sortLongArray,
  sortLongArrayInPlace,
  DpScratchBuffer,
  longSumElIntoBuffer,
  longSumEl,
  greedyAlgoIntoBuffer,
  greedyAlgo,
} from './helpers';

export type {
  HighsSolveOptions,
  HighsSolverRowLike,
  HighsSolverColumnLike,
  HighsSolverSolutionLike,
  HighsSolverLike,
  ExactLpCandidateResult,
} from './exactSolver';
export { computeLpCandidate } from './exactSolver';
export { loadHighsSolver } from './highsLoader';
