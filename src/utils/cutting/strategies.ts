import { AppSettings } from '../../types/cutting';
import {
  getTierPrefixStates,
  Step2OptPostProcess,
  StepConsolidateSetups,
  StepGenerateBasePatterns,
  StepGenerateBasePatternsForStrategies,
  StepGroupIdenticalCards,
  StepOptimizeWaste,
} from './steps';
import {
  CutCard,
  CutContext,
  CutMetrics,
  CutState,
  CuttingStrategy,
  PipelineStep,
  SearchPackingConfig,
  StrategyType,
} from './types';

export function computeSearchWasteMm(
  cards: readonly CutCard[],
  metrics: CutMetrics,
  context: CutContext
): number {
  const sMin = context.searchRemnantMin;
  if (sMin === context.reusableRemnantMin) {
    return metrics.totalWasteMm;
  }
  let sum = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const cnt = c.count;
    if (cnt <= 0) continue;
    const isReusableInSearch = sMin > 0 && c.remainderMm >= sMin;
    const scrap = isReusableInSearch ? 0 : c.remainderMm;
    sum += (c.trimLossMm + c.kerfLossMm + scrap) * cnt;
  }
  return sum;
}

function unplacedPenaltyScore(metrics: CutMetrics, searchWasteMm?: number): number {
  return -1e12 - metrics.unplacedLengthMm * 1e3 - (searchWasteMm ?? metrics.totalWasteMm) * 0.01;
}

/**
 * 1. MinimizeSetupsStrategy (Минимизация наладок)
 * Priority #1: Minimum number of unique cutting cards (saw setups),
 * even at the cost of a small waste increase.
 * Enforces StepConsolidateSetups and blocks steps/moves that split grouped cards.
 */
export class MinimizeSetupsStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'min_setups';
  readonly name = 'Минимум наладок';
  readonly allowPatternSplitting = false;

  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number {
    const searchWasteMm = computeSearchWasteMm(cards, metrics, context);
    if (metrics.unplacedCount > 0) return unplacedPenaltyScore(metrics, searchWasteMm);
    const wastePenalty =
      searchWasteMm <= 1e6
        ? searchWasteMm * 0.1
        : 1e5 + ((searchWasteMm - 1e6) / (searchWasteMm - 1e6 + 1e7)) * 4.9e6;
    return (
      1e14 -
      metrics.uniqueCardsCount * 1e11 -
      metrics.totalBarsUsed * 1e7 -
      wastePenalty
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    _sumData: number
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    let dm = 0;
    if (passVar === 1) dm = 0;
    else if (passVar === 2) dm = 1;
    else if (passVar === 3) dm = 2;
    else if (passVar === 4) dm = 4;
    else dm = Math.floor((sm * (passVar - 3)) / 120);

    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(
    rawBatchCount: number,
    _hasScrapWaste: boolean,
    barKIM: number,
    context: CutContext
  ): number {
    if (!context.dualProfileCut) return 1;
    if (context.fillControlEnabled && barKIM < context.fillControlThreshold) {
      return 1;
    }
    // Maximize batching to collapse setups
    return Math.max(1, rawBatchCount);
  }

  buildPipeline(context: CutContext): readonly PipelineStep[] {
    const steps: PipelineStep[] = [
      StepGenerateBasePatterns,
      StepGroupIdenticalCards,
      StepConsolidateSetups,
      Step2OptPostProcess,
      StepConsolidateSetups,
    ];
    if (context.fillControlEnabled && context.dualProfileCut) {
      steps.push(StepOptimizeWaste);
    }
    steps.push(StepGroupIdenticalCards);
    return steps;
  }
}

/**
 * 2. MinimizeMaterialStrategy (Минимум материала)
 * Priority #1: Minimum total stock length / bars consumed for the order
 * (incorporating warehouse remnants when provided); ties broken by fewer cards then less waste.
 */
export class MinimizeMaterialStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'min_material';
  readonly name = 'Минимум материала';
  readonly allowPatternSplitting = true;

  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number {
    const searchWasteMm = computeSearchWasteMm(cards, metrics, context);
    if (metrics.unplacedCount > 0) return unplacedPenaltyScore(metrics, searchWasteMm);
    const wastePenalty =
      searchWasteMm <= 5e4
        ? searchWasteMm
        : 5e4 + ((searchWasteMm - 5e4) / (searchWasteMm - 5e4 + 5e6)) * 4.5e4;
    // Keep strictly below Number.MAX_SAFE_INTEGER (9.007e15),
    // prioritizing (totalStockLengthMm + totalBarsUsed) > uniqueCardsCount > searchWasteMm.
    return (
      8.9e15 -
      (metrics.totalStockLengthMm + metrics.totalBarsUsed) * 4e7 -
      metrics.uniqueCardsCount * 1e5 -
      wastePenalty
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    sumData: number
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    const evenFill = sumData > 0 ? sm - Math.floor(sumData / Math.ceil(sumData / sm)) : 0;
    let dm = 0;
    if (passVar === 1) dm = evenFill;
    else if (passVar === 2) dm = Math.floor(evenFill / 2);
    else dm = Math.floor((sm * (passVar - 3)) / 200);

    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(
    rawBatchCount: number,
    _hasScrapWaste: boolean,
    barKIM: number,
    context: CutContext
  ): number {
    if (!context.dualProfileCut) return 1;
    if (context.fillControlEnabled && barKIM < context.fillControlThreshold) {
      return 1;
    }
    return rawBatchCount;
  }

  buildPipeline(): readonly PipelineStep[] {
    return [
      StepGenerateBasePatterns,
      StepGroupIdenticalCards,
      Step2OptPostProcess,
      StepOptimizeWaste,
      StepGroupIdenticalCards,
    ];
  }
}

/**
 * 2b. ForcedRemnantShapingStrategy (Доводка обрезок до делового на базе Минимума материала)
 * Repacks pooled pieces from cards with scrap > cutoffMm:
 * - Priority 1: Place all pieces (unplacedCount === 0)
 * - Priority 2: Minimum total stock length / bars consumed (totalStockLengthMm + totalBarsUsed)
 * - Priority 3: Minimize non-reusable scrap from cards exceeding cutoffMm, then searchWasteMm (remainder >= searchRemnantMin counts as 0)
 * - Priority 4: Minimize unique cards count
 */
export class ForcedRemnantShapingStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'forced_remnant_shaping';
  readonly name = 'Минимум материала (формирование деловых остатков)';
  readonly allowPatternSplitting = true;

  constructor(readonly cutoffMm: number) {}

  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number {
    const searchWasteMm = computeSearchWasteMm(cards, metrics, context);
    if (metrics.unplacedCount > 0) return unplacedPenaltyScore(metrics, searchWasteMm);

    const sMin = context.searchRemnantMin;
    let badScrapMm = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (c.count <= 0) continue;
      const isReusableInSearch = sMin > 0 && c.remainderMm >= sMin;
      if (!isReusableInSearch && c.remainderMm > this.cutoffMm) {
        badScrapMm += c.remainderMm * c.count;
      }
    }

    const badScrapPenalty =
      badScrapMm <= 1e5
        ? badScrapMm * 100
        : 1e7 + ((badScrapMm - 1e5) / (badScrapMm - 1e5 + 1e7)) * 1e7;
    const searchWastePenalty =
      searchWasteMm <= 5e5
        ? searchWasteMm * 10
        : 5e6 + ((searchWasteMm - 5e5) / (searchWasteMm - 5e5 + 1e7)) * 5e6;
    const cardsPenalty = Math.min(1e5, metrics.uniqueCardsCount);

    return (
      8.9e15 -
      (metrics.totalStockLengthMm + metrics.totalBarsUsed) * 4e7 -
      badScrapPenalty -
      searchWastePenalty -
      cardsPenalty
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    sumData: number,
    context: CutContext
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    const delOstScaled =
      context.searchRemnantMin > 0
        ? Math.ceil(context.searchRemnantMin / Math.max(1, context.nod))
        : 0;
    const canCapForRemnant = delOstScaled > 0 && sm > delOstScaled;

    // Odd passes explicitly target sm - delOstScaled to force >= delOst reusable remnant;
    // Even passes use MinimizeMaterialStrategy tight fill up to sm.
    if (canCapForRemnant && passVar % 2 === 1) {
      const remnantTargetCap = sm - delOstScaled;
      let dm = 0;
      if (passVar === 1) dm = 0;
      else if (passVar === 3) dm = Math.floor(delOstScaled / 2);
      else dm = Math.floor((remnantTargetCap * (passVar - 3)) / 180);
      return {
        useGreedy: false,
        targetCap: remnantTargetCap,
        tolerance: Math.max(0, Math.min(remnantTargetCap - 1, dm)),
      };
    }

    const evenFill = sumData > 0 ? sm - Math.floor(sumData / Math.ceil(sumData / sm)) : 0;
    let dm = 0;
    if (passVar === 2) dm = evenFill;
    else if (passVar === 4) dm = Math.floor(evenFill / 2);
    else dm = Math.floor((sm * Math.max(0, passVar - 4)) / 200);

    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(): number {
    return 1;
  }

  buildPipeline(): readonly PipelineStep[] {
    return [
      StepGenerateBasePatterns,
      StepGroupIdenticalCards,
      Step2OptPostProcess,
      StepOptimizeWaste,
      StepGroupIdenticalCards,
    ];
  }
}

/**
 * 2c. RemnantFillStrategy (Этап 1: первоочередной раскрой деловых остатков со склада)
 * Maximizes useful demand parts placed onto non-standard warehouse remnants
 * subject to the user's minimum remnant fill % threshold.
 */
export class RemnantFillStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'remnant_fill';
  readonly name = 'Приоритет остатков';
  readonly allowPatternSplitting = false;

  score(_cards: readonly CutCard[], metrics: CutMetrics, _context: CutContext): number {
    if (metrics.totalBarsUsed === 0 || metrics.totalPartsLengthMm <= 0) {
      return 0;
    }
    return (
      metrics.totalPartsLengthMm * 1e5 -
      metrics.totalWasteMm * 50 -
      metrics.uniqueCardsCount * 100 -
      metrics.totalBarsUsed * 10
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    sumData: number
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    const evenFill = sumData > 0 ? sm - Math.floor(sumData / Math.ceil(sumData / sm)) : 0;
    let dm = 0;
    if (passVar === 1) dm = evenFill;
    else if (passVar === 2) dm = Math.floor(evenFill / 2);
    else dm = Math.floor((sm * (passVar - 3)) / 200);

    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(): number {
    return 1;
  }

  buildPipeline(): readonly PipelineStep[] {
    return [StepGenerateBasePatterns, StepGroupIdenticalCards];
  }
}

/**
 * 3. MinimizeBalanceStrategy (Баланс: материал <-> наладки)
 * Minimizes unique cutting cards subject to totalStockLengthMm <= materialCapMm.
 */
export class MinimizeBalanceStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'balance';
  readonly name = 'Баланс';
  readonly allowPatternSplitting = false;

  constructor(readonly materialCapMm?: number) {}

  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number {
    const searchWasteMm = computeSearchWasteMm(cards, metrics, context);
    if (metrics.unplacedCount > 0) return unplacedPenaltyScore(metrics, searchWasteMm);
    const cap = context.materialCapMm ?? this.materialCapMm ?? Infinity;
    const over = Number.isFinite(cap) ? Math.max(0, metrics.totalStockLengthMm - cap) : 0;
    if (over > 0) {
      const overPenalty =
        over <= 1e7
          ? over * 3e4
          : 3e11 + ((over - 1e7) / (over - 1e7 + 1e8)) * 1.9e11;
      const tiePenalty = Math.min(
        1e9,
        metrics.uniqueCardsCount * 1e3 +
          metrics.totalStockLengthMm * 1e-3 +
          searchWasteMm * 1e-4
      );
      return 5e11 - overPenalty - tiePenalty;
    }
    const wastePenalty =
      searchWasteMm <= 5e3
        ? searchWasteMm * 0.1
        : 500 + ((searchWasteMm - 5e3) / (searchWasteMm - 5e3 + 5e6)) * 450;
    return (
      5e14 -
      metrics.uniqueCardsCount * 5e11 -
      metrics.totalStockLengthMm * 1e3 -
      wastePenalty
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    _sumData: number
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    let dm = 0;
    if (passVar === 1) dm = 0;
    else if (passVar === 2) dm = 1;
    else if (passVar === 3) dm = 2;
    else if (passVar === 4) dm = 4;
    else dm = Math.floor((sm * (passVar - 3)) / 120);

    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(
    rawBatchCount: number,
    _hasScrapWaste: boolean,
    barKIM: number,
    context: CutContext
  ): number {
    if (!context.dualProfileCut) return 1;
    if (context.fillControlEnabled && barKIM < context.fillControlThreshold) {
      return 1;
    }
    return Math.max(1, rawBatchCount);
  }

  buildPipeline(context: CutContext): readonly PipelineStep[] {
    const steps: PipelineStep[] = [
      StepGenerateBasePatterns,
      StepGroupIdenticalCards,
      StepConsolidateSetups,
      Step2OptPostProcess,
      StepConsolidateSetups,
    ];
    if (context.fillControlEnabled && context.dualProfileCut) {
      steps.push(StepOptimizeWaste);
    }
    steps.push(StepGroupIdenticalCards);
    return steps;
  }
}

/**
 * 4. CustomStrategy (Пользовательская)
 * Configurable pipeline respecting user's CustomStrategyConfig flags.
 */
export class CustomStrategy implements CuttingStrategy {
  readonly type: StrategyType = 'custom';
  readonly name = 'Пользовательская';
  readonly allowPatternSplitting: boolean;

  constructor(private readonly preferFewerCards = true) {
    this.allowPatternSplitting = !preferFewerCards;
  }

  score(cards: readonly CutCard[], metrics: CutMetrics, context: CutContext): number {
    const searchWasteMm = computeSearchWasteMm(cards, metrics, context);
    if (metrics.unplacedCount > 0) return unplacedPenaltyScore(metrics, searchWasteMm);
    const preferCards = context.customConfig?.preferFewerCards ?? this.preferFewerCards;
    if (preferCards) {
      const wastePenalty =
        searchWasteMm <= 1e6
          ? searchWasteMm * 0.1
          : 1e5 + ((searchWasteMm - 1e6) / (searchWasteMm - 1e6 + 1e7)) * 4.9e6;
      return (
        1e14 -
        metrics.uniqueCardsCount * 1e11 -
        metrics.totalBarsUsed * 1e7 -
        wastePenalty
      );
    }
    const wastePenalty =
      searchWasteMm <= 5e4
        ? searchWasteMm
        : 5e4 + ((searchWasteMm - 5e4) / (searchWasteMm - 5e4 + 5e6)) * 4.5e4;
    return (
      8.9e15 -
      (metrics.totalStockLengthMm + metrics.totalBarsUsed) * 4e7 -
      metrics.uniqueCardsCount * 1e5 -
      wastePenalty
    );
  }

  getSearchPackingConfig(
    passVar: number,
    sm: number,
    sumData: number
  ): SearchPackingConfig {
    if (passVar === 0) {
      return { useGreedy: true, targetCap: sm, tolerance: 0 };
    }
    const ceilDiv = Math.ceil(sumData / sm);
    const dm = ceilDiv > 0 ? Math.floor((sm - Math.floor(sumData / ceilDiv)) / 2) : 0;
    return { useGreedy: false, targetCap: sm, tolerance: Math.max(0, dm) };
  }

  getBatchCount(
    rawBatchCount: number,
    _hasScrapWaste: boolean,
    barKIM: number,
    context: CutContext
  ): number {
    if (!context.dualProfileCut) return 1;
    if (context.fillControlEnabled && barKIM < context.fillControlThreshold) {
      return 1;
    }
    return rawBatchCount;
  }

  buildPipeline(context: CutContext): readonly PipelineStep[] {
    const cfg = context.customConfig;
    const steps: PipelineStep[] = [
      StepGenerateBasePatterns,
      StepGroupIdenticalCards,
    ];
    if (cfg?.enableTailConsolidation !== false && cfg?.preferFewerCards) {
      steps.push(StepConsolidateSetups);
    }
    if (cfg?.enable2Opt !== false) {
      steps.push(Step2OptPostProcess);
    }
    if (cfg?.enableTailConsolidation !== false) {
      steps.push(StepConsolidateSetups);
    }
    if (context.fillControlEnabled && context.dualProfileCut) {
      steps.push(StepOptimizeWaste);
    }
    steps.push(StepGroupIdenticalCards);
    return steps;
  }
}

/**
 * Isolated Strategy Registry
 */
const strategyRegistry = new Map<StrategyType, CuttingStrategy>([
  ['min_setups', new MinimizeSetupsStrategy()],
  ['min_material', new MinimizeMaterialStrategy()],
  ['remnant_fill', new RemnantFillStrategy()],
  ['balance', new MinimizeBalanceStrategy()],
  ['custom', new CustomStrategy(true)],
]);

export const STRATEGY_REGISTRY: ReadonlyMap<StrategyType, CuttingStrategy> = strategyRegistry;

export function registerStrategy(strategy: CuttingStrategy): void {
  strategyRegistry.set(strategy.type, strategy);
}

/**
 * Maps UI AppSettings optimizationGoal + flags to canonical StrategyType.
 */
export function resolveStrategyType(
  goal: AppSettings['optimizationGoal'] | StrategyType,
  _settings?: AppSettings
): StrategyType {
  if (goal === 'balance') {
    return 'balance';
  }
  if (goal === 'variants' || goal === 'min_setups') {
    return 'min_setups';
  }
  if (goal === 'min_bars' || goal === 'min_material') {
    return 'min_material';
  }
  if (goal === 'remnant_fill') {
    return 'remnant_fill';
  }
  if (goal === 'custom') {
    return 'custom';
  }
  return 'min_material';
}

export function getStrategy(
  goalOrType: AppSettings['optimizationGoal'] | StrategyType,
  settings?: AppSettings
): CuttingStrategy {
  const resolved = resolveStrategyType(goalOrType, settings);
  if (resolved === 'custom') {
    return new CustomStrategy(settings?.customStrategyConfig?.preferFewerCards ?? true);
  }
  const found = strategyRegistry.get(resolved);
  if (!found) {
    throw new Error(`Strategy "${resolved}" is not registered in STRATEGY_REGISTRY.`);
  }
  return found;
}

export function runPostGenerationSteps(
  baseState: CutState,
  pipeline: readonly PipelineStep[],
  strategy: CuttingStrategy,
  silent: boolean
): CutState {
  let currentState = silent
    ? {
        ...baseState,
        context: {
          ...baseState.context,
          onProgress: undefined,
        },
      }
    : baseState;

  for (let i = 1; i < pipeline.length; i++) {
    const step = pipeline[i];
    const nextState = step(currentState, strategy);

    // Allow explicit user fill-control re-nesting even if score shifts;
    // otherwise strictly forbid any post-processing step from degrading score()
    const isFillControlStep =
      step === StepOptimizeWaste &&
      currentState.context.fillControlEnabled &&
      currentState.context.dualProfileCut;

    if (isFillControlStep || nextState.score >= currentState.score) {
      currentState = nextState;
    }
  }

  // Final normalization guarantee
  return StepGroupIdenticalCards(currentState, strategy);
}

/**
 * Refines an already-generated Stage-2 baseState (plus any attached prefix snapshots)
 * through Stage-3 post-processing while keeping Stage 1/2 telemetry counters intact.
 */
export function refineBaseStateWithPipeline(
  baseState: CutState,
  strategy: CuttingStrategy
): CutState {
  const ctx = baseState.context;
  const pipeline = strategy.buildPipeline(ctx);
  if (pipeline.length === 0) {
    return StepGroupIdenticalCards(baseState, strategy);
  }
  const stage3Start = performance.now();

  let bestFinalState = runPostGenerationSteps(baseState, pipeline, strategy, false);

  const prefixSnapshots = getTierPrefixStates(baseState);
  for (let s = 0; s < prefixSnapshots.length; s++) {
    if (ctx.shouldAbort?.()) break;
    const snapFinal = runPostGenerationSteps(prefixSnapshots[s], pipeline, strategy, true);
    if (snapFinal.score > bestFinalState.score) {
      bestFinalState = {
        ...snapFinal,
        context: ctx,
        telemetryCounters: {
          ...snapFinal.telemetryCounters,
          passesEvaluated: baseState.telemetryCounters.passesEvaluated,
          prunedPasses: baseState.telemetryCounters.prunedPasses ?? 0,
          totalCombinationsChecked: baseState.telemetryCounters.totalCombinationsChecked,
          stage1Ms: baseState.telemetryCounters.stage1Ms,
          stage2Ms: baseState.telemetryCounters.stage2Ms,
          threadsUsed: baseState.telemetryCounters.threadsUsed,
          chunksProcessed: baseState.telemetryCounters.chunksProcessed,
          totalPassesPlanned: baseState.telemetryCounters.totalPassesPlanned,
          abortedDuringSearch: baseState.telemetryCounters.abortedDuringSearch,
        },
      };
    }
  }

  const stage3End = performance.now();
  return {
    ...bestFinalState,
    telemetryCounters: {
      ...bestFinalState.telemetryCounters,
      stage3Ms: Math.max(0, Number((stage3End - stage3Start).toFixed(1))),
    },
  };
}

/**
 * Executes a strategy's pipeline sequentially with invariant guards:
 * - Post-generation steps cannot degrade strategy.score() (strict rollback)
 *   except explicit user-mandated fillControlEnabled re-nesting.
 * - Evaluates Stage-3 post-processing on lower-speed prefix winners as well so
 *   deep >= standard >= fast monotonicity holds strictly by strategy.score().
 * - Final state is guaranteed to pass through StepGroupIdenticalCards.
 */
export function runCuttingPipeline(
  initialState: CutState,
  strategy: CuttingStrategy
): CutState {
  const pipeline = strategy.buildPipeline(initialState.context);
  if (pipeline.length === 0) {
    return StepGroupIdenticalCards(initialState, strategy);
  }

  const baseState = pipeline[0](initialState, strategy);
  return refineBaseStateWithPipeline(baseState, strategy);
}

/**
 * Executes Stage-2 pattern generation ONCE across all balance caps, then refines
 * Stage-3 post-processing for each cap with strict baseline fallback guarantee.
 */
export function runMultiCapBalancePipelines(
  initialState: CutState,
  baselineFinalState: CutState,
  caps: readonly number[],
  onCapStart?: (capIdx: number, totalCaps: number) => void,
  onCapDone?: (capIdx: number, totalCaps: number, state: CutState, durationMs: number) => void
): CutState[] {
  if (caps.length === 0) return [];

  const strategies = caps.map((cap) => new MinimizeBalanceStrategy(cap));
  const baseStates = StepGenerateBasePatternsForStrategies(initialState, strategies);
  const results: CutState[] = new Array<CutState>(caps.length);

  for (let i = 0; i < caps.length; i++) {
    const capStart = performance.now();
    const strategy = strategies[i];
    const capCtx: CutContext = {
      ...initialState.context,
      materialCapMm: caps[i],
    };
    const pipeline = strategy.buildPipeline(capCtx);

    onCapStart?.(i, caps.length);

    const baseStateRaw = baseStates[i];
    const baseWithCap: CutState = {
      ...baseStateRaw,
      context: capCtx,
      score: strategy.score(baseStateRaw.cards, baseStateRaw.metrics, capCtx),
    };

    let bestFinal = runPostGenerationSteps(baseWithCap, pipeline, strategy, false);

    if (!initialState.context.shouldAbort?.()) {
      const prefixSnapshots = getTierPrefixStates(baseStateRaw);
      for (let s = 0; s < prefixSnapshots.length; s++) {
        if (initialState.context.shouldAbort?.()) break;
        const snapRaw = prefixSnapshots[s];
        const snapWithCap: CutState = {
          ...snapRaw,
          context: capCtx,
          score: strategy.score(snapRaw.cards, snapRaw.metrics, capCtx),
        };
        const snapFinal = runPostGenerationSteps(snapWithCap, pipeline, strategy, true);
        if (snapFinal.score > bestFinal.score) {
          bestFinal = {
            ...snapFinal,
            context: capCtx,
            telemetryCounters: {
              ...snapFinal.telemetryCounters,
              passesEvaluated: baseStateRaw.telemetryCounters.passesEvaluated,
              prunedPasses: baseStateRaw.telemetryCounters.prunedPasses ?? 0,
              totalCombinationsChecked: baseStateRaw.telemetryCounters.totalCombinationsChecked,
              stage1Ms: baseStateRaw.telemetryCounters.stage1Ms,
              stage2Ms: baseStateRaw.telemetryCounters.stage2Ms,
            },
          };
        }
      }
    }

    // Guarantee: if MinimizeBalanceStrategy result is worse than min_material baseline under cap,
    // use baseline solution (also run lightweight tail consolidation on baseline if not aborted).
    const baselineScoreUnderCap = strategy.score(
      baselineFinalState.cards,
      baselineFinalState.metrics,
      capCtx
    );
    if (baselineScoreUnderCap > bestFinal.score) {
      bestFinal = {
        ...baselineFinalState,
        context: capCtx,
        score: baselineScoreUnderCap,
      };
    }

    const capDurationMs = Math.max(0, Number((performance.now() - capStart).toFixed(1)));
    const finalWithStage3: CutState = {
      ...bestFinal,
      telemetryCounters: {
        ...bestFinal.telemetryCounters,
        stage3Ms: capDurationMs,
      },
    };
    results[i] = finalWithStage3;
    onCapDone?.(i, caps.length, finalWithStage3, capDurationMs);
  }

  return results;
}
