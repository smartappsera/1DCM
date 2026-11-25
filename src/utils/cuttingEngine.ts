import {
  StockItem,
  DemandItem,
  FullOptimizationSolution,
  SolutionRow,
  SolutionPiece,
  SolutionBarLayoutItem,
  AppSettings,
  RemnantItem,
  UnplacedItem,
  BarCuttingPattern,
  CuttingOptimizationResult,
  PartDemand,
  StockBar,
  CuttingParams,
  CalculationProgressInfo,
  ComplexityEstimate,
  CalculationTelemetry,
  ReusableRemnantMode,
} from '../types/cutting';
import { getSearchSpeedLabel } from '../constants/cuttingHelp';
import {
  CutCard,
  CutContext,
  CutState,
  CuttingStrategy,
  ForcedRemnantShapingStrategy,
  MergedPassResults,
  MinimizeBalanceStrategy,
  MinimizeMaterialStrategy,
  MinimizeSetupsStrategy,
  PASS_CHUNK_SIZE,
  ParetoFrontPoint,
  PassRangeExecutionResult,
  PassSearchProfile,
  RemnantFillStrategy,
  StrategyType,
  buildBaseStateFromMergedPassResults,
  calculateMetrics,
  computeCuttingIndexFromSolution,
  computeLpCandidate,
  computeMaxReusableRemnantFromSolution,
  createCutCard,
  executePassRange,
  getColorForLength,
  getDefaultDemandColor,
  getBatchRowSplit,
  getMemoryUsageMb,
  getStrategy,
  groupIdenticalCards,
  loadHighsSolver,
  mergePassResults,
  myGcd,
  refineBaseStateWithPipeline,
  runCuttingPipeline,
  runMultiCapBalancePipelines,
  runPostGenerationSteps,
} from './cutting';
import type {
  PassWorkerInMessage,
  PassWorkerOutMessage,
  SerializableCutContext,
} from '../workers/passWorker';

// Re-export modular Pipeline + Strategy primitives for direct consumers & tests
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
  HighsSolveOptions,
  HighsSolverRowLike,
  HighsSolverColumnLike,
  HighsSolverSolutionLike,
  HighsSolverLike,
  ExactLpCandidateResult,
} from './cutting';

export {
  INDEX_FLOOR,
  SETUP_WEIGHT,
  PASS_CHUNK_SIZE,
  executePassRange,
  mergePassResults,
  buildBaseStateFromMergedPassResults,
  computeCuttingIndexScale,
  computeCuttingIndexFromTotals,
  computeCuttingIndexFromSolution,
  computeMaxReusableRemnantFromSolution,
  computeSearchWasteMm,
  buildCardSignature,
  createCutCard,
  sortCardsDeterministically,
  groupIdenticalCards,
  calculateMetrics,
  StepGroupIdenticalCards,
  StepGenerateBasePatterns,
  StepGenerateBasePatternsForStrategies,
  Step2OptPostProcess,
  StepOptimizeWaste,
  StepConsolidateSetups,
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
  RICH_DYNAMIC_COLORS,
  getDefaultDemandColor,
  getColorForLength,
  getMemoryUsageMb,
  myGcd,
  sortLongArray,
  longSumEl,
  greedyAlgo,
  computeLpCandidate,
  loadHighsSolver,
} from './cutting';

/**
 * Computes effective reusable remnant threshold (Порог делового остатка) in mm:
 * - 'manual': uses currentManualValue directly
 * - 'weighted': quantity-weighted median of active demand piece lengths rounded to nearest 100 mm
 * - 'min_part': (smallest active demand piece length + 1 mm) rounded UP to nearest 10 mm
 */
export function computeReusableRemnantMin(
  demandItems: readonly { length: number; quantity: number }[],
  mode: ReusableRemnantMode = 'manual',
  currentManualValue = 250
): number {
  if (mode === 'manual') {
    return Math.max(0, Math.round(currentManualValue || 0));
  }

  const active = demandItems
    .filter((d) => d.length > 0 && d.quantity > 0)
    .slice()
    .sort((a, b) => a.length - b.length);

  if (mode === 'min_part') {
    if (active.length === 0) {
      return Math.max(10, Math.round(currentManualValue || 250));
    }
    const minLen = active[0].length;
    return Math.ceil((minLen + 1) / 10) * 10;
  }

  // mode === 'weighted': quantity-weighted median rounded to nearest 100 mm
  if (active.length === 0) {
    return 1500;
  }
  let totalQty = 0;
  for (let i = 0; i < active.length; i++) {
    totalQty += active[i].quantity;
  }
  const half = Math.ceil(totalQty / 2);
  let acc = 0;
  let medianLen = active[0].length;
  for (let i = 0; i < active.length; i++) {
    acc += active[i].quantity;
    if (acc >= half) {
      medianLen = active[i].length;
      break;
    }
  }
  return Math.max(10, Math.round(medianLen / 100) * 100);
}

/**
 * Resolves remnant target length used by Cutting Index:
 * uses unified `reusableRemnantMin` (> 0) unless deprecated `targetRemnantMinLength` is explicitly set.
 */
export function resolveIndexTargetRemnantLength(
  settings: Pick<AppSettings, 'reusableRemnantMin' | 'targetRemnantMinLength'>
): number {
  if (settings.targetRemnantMinLength && settings.targetRemnantMinLength > 0) {
    return settings.targetRemnantMinLength;
  }
  return settings.reusableRemnantMin > 0 ? settings.reusableRemnantMin : 1500;
}

/**
 * Computes auto target remnant length as the quantity-weighted median of active demand piece lengths,
 * rounded to nearest 100 mm and clamped >= reusableRemnantMin (default fallback 1500 mm).
 */
export function computeAutoTargetRemnantLength(
  demandItems: readonly { length: number; quantity: number }[],
  reusableRemnantMin = 0
): number {
  const weighted = computeReusableRemnantMin(demandItems, 'weighted', 1500);
  const floorVal = Math.max(0, reusableRemnantMin || 0);
  return Math.max(floorVal, weighted);
}

/**
 * Resolves effective batch size N >= 2 when batch cutting (`dualProfileCut`) is enabled:
 * - Default/manual: max(2, floor(batchSizeN ?? 2))
 * - Legacy migration (`batchSizeMode === 'auto'`): smallest integer divisor > 1 of GCD(active demand quantities); 2 if GCD <= 1
 */
export function resolveBatchSize(
  demandInput: readonly { length: number; quantity: number }[],
  settings: Pick<AppSettings, 'batchSizeMode' | 'batchSizeN'>
): number {
  if (settings.batchSizeMode === 'auto') {
    let g = 0;
    for (let i = 0; i < demandInput.length; i++) {
      const d = demandInput[i];
      if (d.length > 0 && d.quantity > 0) {
        g = g === 0 ? Math.round(d.quantity) : myGcd(g, d.quantity);
      }
    }
    if (g <= 1) return 2;
    for (let div = 2; div * div <= g; div++) {
      if (g % div === 0) return div;
    }
    return g;
  }
  return Math.max(2, Math.floor(settings.batchSizeN ?? 2));
}

/**
 * Pre-flight estimation of cutting calculation complexity and expected duration
 */
export function estimateCalculationComplexity(
  _stockInput: StockItem[],
  demandInput: DemandItem[],
  _settings: AppSettings
): ComplexityEstimate {
  let totalDemandLength = 0;
  let totalParts = 0;
  const uniquePartsSet = new Set<number>();

  for (const d of demandInput) {
    if (d.length > 0 && d.quantity > 0) {
      totalDemandLength += d.length * d.quantity;
      totalParts += d.quantity;
      uniquePartsSet.add(d.length);
    }
  }

  const totalMeters = Number((totalDemandLength / 1000).toFixed(1));
  const uniqueParts = uniquePartsSet.size;
  const isHeavy = totalMeters > 1000 || totalParts > 800 || uniqueParts > 15;

  const estimatedSeconds = {
    fast: isHeavy ? (totalMeters > 10000 ? 15 : 10) : 1.5,
    standard: isHeavy ? (totalMeters > 10000 ? 120 : 60) : 15,
    deep: isHeavy ? (totalMeters > 10000 ? 180 : 120) : 45,
  };

  const recommendation = isHeavy
    ? `Большой объем спецификации (${totalMeters.toLocaleString('ru-RU')} м, ${totalParts.toLocaleString('ru-RU')} деталей, ${uniqueParts} типоразмеров). Глубина поиска: «${getSearchSpeedLabel('fast', true)}» (10–15 сек), «${getSearchSpeedLabel('standard', true)}» (1–2 мин) и «${getSearchSpeedLabel('deep', true)}» (от 2 мин) с комбинаторным перебором карт и 2-opt оптимизацией.`
    : 'Стандартная спецификация. Расчет выполняется быстро с высокой точностью раскроя.';

  return {
    totalMeters,
    totalParts,
    uniqueParts,
    isHeavy,
    estimatedSeconds,
    recommendation,
  };
}

export interface SolveLinearCuttingOptions {
  onProgress?: (progress: CalculationProgressInfo) => void;
  shouldAbort?: () => boolean;
}

export interface SuiteItem {
  goal: 'variants' | 'min_bars' | 'balance';
  title: string;
  badge: string;
  description: string;
  solution: FullOptimizationSolution;
}

export interface SuiteResult {
  suite: SuiteItem[];
  bestSolution: FullOptimizationSolution;
}

export interface BalanceRunTiming {
  label: string;
  capMm: number;
  durationMs: number;
  stockMm: number;
  bars: number;
  cards: number;
}

export interface BalanceResult extends SuiteResult {
  timings: BalanceRunTiming[];
  totalDurationMs: number;
}

function isRemnantStock(st: StockItem): boolean {
  if (st.isStandard || st.isStandardUnlimited) return false;
  if (st.length === 6000 || st.length === 12000 || st.length === 11700) {
    return false;
  }
  return true;
}

function buildCutContext(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  options?: SolveLinearCuttingOptions
): CutContext {
  const startTime = performance.now();
  const dRez = Math.max(0, settings.bladeWidth || 0);
  const krm = Math.max(0, settings.edgeTrim || 0);
  const delOst = Math.max(0, settings.reusableRemnantMin || 0);
  const targetRemnantMin = resolveIndexTargetRemnantLength(settings);
  const remnantMinFillPct = Math.min(
    100,
    Math.max(0, settings.remnantMinFillPct ?? settings.targetRemnantKIM ?? 75)
  );
  const isPrioritizeRemnants = settings.prioritizeRemnants === true;

  const rawRng: number[] = [];
  let totalDemandLengthMm = 0;
  for (const d of demandInput) {
    const s = d.length;
    if (s <= 0 || d.quantity <= 0) continue;
    for (let j = 0; j < d.quantity; j++) {
      rawRng.push(s + dRez);
      totalDemandLengthMm += s + dRez;
    }
  }

  const rawRemnantSmArr: number[] = [];
  const rawStandardSmArr: number[] = [];
  const activeStandardLengths: number[] = [];
  const remnantBarSizesSet = new Set<number>();

  for (const st of stockInput) {
    if (st.isActive === false) continue;
    if (
      st.isStandard ||
      st.isStandardUnlimited ||
      st.length === 6000 ||
      st.length === 12000 ||
      st.length === 11700
    ) {
      activeStandardLengths.push(st.length);
    }

    const s = st.length - krm;
    if (s <= 0) continue;

    const isStandardAuto =
      (st.length === 6000 ||
        st.length === 12000 ||
        st.length === 11700 ||
        st.isStandardUnlimited) &&
      (st.quantity <= 0 || !st.quantity);
    const neededEstimate = Math.ceil(totalDemandLengthMm / s) * 2 + 100;
    const qty = isStandardAuto ? Math.max(200, neededEstimate) : st.quantity;
    if (qty <= 0) continue;

    const isRem = isRemnantStock(st);
    if (isRem) {
      remnantBarSizesSet.add(st.length);
    }
    const targetArr = isRem ? rawRemnantSmArr : rawStandardSmArr;
    for (let j = 0; j < qty; j++) {
      targetArr.push(s);
    }
  }

  const rawSmArr = [...rawRemnantSmArr, ...rawStandardSmArr];
  rawSmArr.sort((a, b) => b - a);

  let nod = dRez || 1;
  for (let i = 0; i < rawRng.length; i++) nod = myGcd(nod, rawRng[i]);
  for (let i = 0; i < rawSmArr.length; i++) nod = myGcd(nod, rawSmArr[i]);

  const scaledDemand = rawRng.map((x) => Math.floor(x / nod));
  const scaledStockAll = rawSmArr.map((x) => Math.floor(x / nod));
  const scaledStockRemnants = rawRemnantSmArr.map((x) => Math.floor(x / nod));
  const scaledStockStandard = rawStandardSmArr.map((x) => Math.floor(x / nod));

  const speed = settings.searchSpeed;
  const isDeep = speed === 'deep';
  const isStandard = speed === 'standard' || speed === 'exact';

  // Перебор порядков склада имеет смысл только при РАЗНЫХ длинах хлыстов (а не числе строк склада)
  const distinctStockLengths = new Set(scaledStockAll).size;
  const baseSortZ = distinctStockLengths > 1 ? (isDeep ? 5 : isStandard ? 3 : 1) : 0;
  const baseSort = isDeep ? 28 : isStandard ? 14 : 7;
  const baseVar = isDeep ? 16 : isStandard ? 10 : 5;

  return {
    startTime,
    bladeWidth: dRez,
    edgeTrim: krm,
    reusableRemnantMin: delOst,
    searchRemnantMin: 0,
    targetRemnantMin,
    targetRemnantKIM: remnantMinFillPct,
    remnantMinFillPct,
    dualProfileCut: settings.dualProfileCut === true,
    fillControlEnabled: settings.fillControlEnabled === true,
    fillControlThreshold: settings.fillControlThreshold ?? 50,
    groupSolutions: settings.groupSolutions !== false,
    searchSpeed: speed,
    prioritizeRemnants: isPrioritizeRemnants && scaledStockRemnants.length > 0,
    nod,
    scaledDemand,
    scaledStockAll,
    scaledStockRemnants,
    scaledStockStandard,
    activeStandardLengths,
    remnantBarSizes: Array.from(remnantBarSizesSet),
    totalDemandLengthMm,
    totalPartsCount: rawRng.length,
    totalBarsEstimate: Math.ceil(totalDemandLengthMm / (rawSmArr[0] || 6000)),
    maxSortZ: baseSortZ,
    maxSort: baseSort,
    maxVar: baseVar,
    stockInput,
    settings,
    onProgress: options?.onProgress,
    shouldAbort: options?.shouldAbort,
  };
}

function buildRowsFromCards(
  cards: readonly CutCard[],
  context: CutContext,
  demandColorMap: ReadonlyMap<number, string>,
  demandMarkMap: ReadonlyMap<number, string>
): SolutionRow[] {
  const expandedCards: CutCard[] = [];
  if (context.groupSolutions) {
    expandedCards.push(...cards);
  } else {
    for (const card of cards) {
      for (let c = 0; c < card.count; c++) {
        expandedCards.push({ ...card, count: 1 });
      }
    }
  }

  const dRez = context.bladeWidth;
  const krm = context.edgeTrim;

  return expandedCards.map((card, idx) => {
    const pieceCountMap = new Map<number, number>();
    for (let i = 0; i < card.pieceLengths.length; i++) {
      const len = card.pieceLengths[i];
      pieceCountMap.set(len, (pieceCountMap.get(len) || 0) + 1);
    }

    const sortedUniquePieces = Array.from(pieceCountMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([length, count]) => ({ length, count }));

    const piecesStr = sortedUniquePieces.map((p) => `${p.length}х${p.count}`).join(' + ');
    const trimStr = krm > 0 ? `[${krm}]` : '[]';
    const trimCuts = krm > 0 ? 1 : 0;
    const totalPiecesCount = card.pieceLengths.length;
    const rawRemainderCheck = card.barSize - card.partsLengthMm - krm;
    const cutsCount =
      totalPiecesCount > 0
        ? trimCuts + Math.max(0, totalPiecesCount - 1) + (rawRemainderCheck > dRez ? 1 : 0)
        : trimCuts;

    const reusableStr = card.isReusable ? `!<${card.reusableRemnantMm}>` : '!<>';
    const wasteStr =
      card.scrapRemnantMm > 0
        ? `(${dRez}х${cutsCount}+${card.scrapRemnantMm})`
        : `(${dRez}х${cutsCount})`;
    const formulaStr = `${card.count}х{${trimStr} + <${piecesStr}> + ${reusableStr} + ${wasteStr}}=${card.barSize}`;

    let wasteLabel = 'О';
    if (card.isReusable) {
      wasteLabel = card.reusableRemnantMm >= 100 ? 'Остат' : 'Ос';
    }

    const pieces: SolutionPiece[] = sortedUniquePieces.map((p, sIdx) => ({
      id: `p_${idx}_${sIdx}`,
      length: p.length,
      count: p.count,
      color: demandColorMap.get(p.length) || getColorForLength(p.length),
      mark: demandMarkMap.get(p.length),
    }));

    const layoutItems: SolutionBarLayoutItem[] = [];
    if (krm > 0) {
      layoutItems.push({
        id: `trim_${idx}`,
        length: krm,
        color: '#000000',
        isTrim: true,
      });
    }

    sortedUniquePieces.forEach((p, sIdx) => {
      const color = demandColorMap.get(p.length) || getColorForLength(p.length);
      const mark = demandMarkMap.get(p.length) || `${p.length}`;
      for (let c = 0; c < p.count; c++) {
        layoutItems.push({
          id: `lay_${idx}_${sIdx}_${c}`,
          length: p.length,
          color,
          mark,
        });
      }
    });

    if (card.remainderMm > 0) {
      layoutItems.push({
        id: `waste_${idx}`,
        length: card.remainderMm,
        color: card.isReusable ? '#FCD34D' : '#E2E8F0',
        isWaste: true,
        wasteType: card.isReusable ? 'reusable' : 'scrap',
        mark: card.isReusable
          ? `${card.reusableRemnantMm} (Ост)`
          : `${card.scrapRemnantMm}`,
      });
    }

    const barWaste = card.trimLossMm + card.kerfLossMm + card.scrapRemnantMm;
    const efficiency =
      card.barSize > 0
        ? Number(
            (((card.partsLengthMm + card.reusableRemnantMm) / card.barSize) * 100).toFixed(2)
          )
        : 0;

    return {
      id: `row_${idx + 1}`,
      barIndex: idx + 1,
      barSize: card.barSize,
      spent: card.partsLengthMm,
      barsCount: card.count,
      formula: formulaStr,
      pieces,
      waste: barWaste,
      reusableRemnant: card.reusableRemnantMm,
      scrapRemnant: card.scrapRemnantMm,
      kerfLoss: card.kerfLossMm,
      trimLoss: card.trimLossMm,
      isReusable: card.isReusable,
      wasteLabel,
      efficiency,
      layoutItems,
      ...(card.isTailSingle ? { isTailSingle: true } : {}),
    };
  });
}

interface BatchAndTailSplit {
  batchSize: number;
  batchStock: StockItem[];
  batchDemand: DemandItem[];
  tailDemand: DemandItem[];
}

/**
 * Пакетный рез в N (N >= 2) профилей с отдельным раскроем остатка по 1 профилю:
 * детали с количеством q разбиваются на batch = floor(q / N) и tail = q % N.
 * Пакетный режим не отключается молча при некратных количествах.
 */
function splitBatchAndTailInputs(
  stock: StockItem[],
  demand: DemandItem[],
  batchSize: number
): BatchAndTailSplit {
  const batchDemand: DemandItem[] = [];
  const tailDemand: DemandItem[] = [];

  for (let i = 0; i < demand.length; i++) {
    const d = demand[i];
    if (d.length <= 0 || d.quantity <= 0) continue;
    const batchQty = Math.floor(d.quantity / batchSize);
    const tailQty = d.quantity % batchSize;
    if (batchQty > 0) {
      batchDemand.push({ ...d, quantity: batchQty });
    }
    if (tailQty > 0) {
      tailDemand.push({ ...d, quantity: tailQty });
    }
  }

  const batchStock = stock.map((st) =>
    st.isStandardUnlimited ||
    ((st.length === 6000 || st.length === 12000 || st.length === 11700) && st.quantity <= 0) ||
    st.quantity <= 0
      ? st
      : { ...st, quantity: Math.floor(st.quantity / batchSize) }
  );

  return { batchSize, batchStock, batchDemand, tailDemand };
}

function buildRemainingStockAfterCards(
  stockInput: StockItem[],
  consumedCards: readonly CutCard[]
): { remainingStock: StockItem[]; finiteSig: string } {
  const consumedByLen = new Map<number, number>();
  for (let i = 0; i < consumedCards.length; i++) {
    const c = consumedCards[i];
    consumedByLen.set(c.barSize, (consumedByLen.get(c.barSize) || 0) + c.count);
  }

  const remainingStock: StockItem[] = [];
  const sigParts: string[] = [];
  for (let i = 0; i < stockInput.length; i++) {
    const s = stockInput[i];
    if (s.isActive === false || s.length <= 0) continue;
    const isAuto =
      s.isStandardUnlimited ||
      ((s.length === 6000 || s.length === 12000 || s.length === 11700) && s.quantity <= 0);
    if (isAuto) {
      remainingStock.push({ ...s, quantity: 0, isStandardUnlimited: true });
      continue;
    }
    const used = consumedByLen.get(s.length) || 0;
    const take = Math.min(s.quantity, used);
    const rem = s.quantity - take;
    if (take > 0) consumedByLen.set(s.length, used - take);
    if (rem > 0) {
      remainingStock.push({ ...s, quantity: rem });
      sigParts.push(`${s.length}:${rem}`);
    }
  }
  return { remainingStock, finiteSig: sigParts.join(',') };
}
function buildSolutionFromFinalState(
  finalState: CutState,
  context: CutContext,
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  startMemoryMb: number | undefined,
  startedAt: number
): FullOptimizationSolution {
  if (finalState.cards.length === 0 || finalState.metrics.totalBarsUsed === 0) {
    if (context.totalPartsCount > 0) {
      try {
        return solveNaiveSequentialCutting(stockInput, demandInput, settings, 12000);
      } catch (err: unknown) {
        console.warn('Fallback solveNaiveSequentialCutting failed on early exit:', err);
      }
    }
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      maxReusableRemnantLength: 0,
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: Number((performance.now() - startedAt).toFixed(1)),
    };
  }

  // Build immutable color and mark lookup map from demand specification
  const demandColorMap = new Map<number, string>();
  const demandMarkMap = new Map<number, string>();
  demandInput.forEach((d, dIdx) => {
    if (!demandColorMap.has(d.length)) {
      demandColorMap.set(d.length, d.color || getDefaultDemandColor(dIdx, d.length));
    }
    if (d.mark && !demandMarkMap.has(d.length)) {
      demandMarkMap.set(d.length, d.mark);
    }
  });

  const rows = buildRowsFromCards(
    finalState.cards,
    context,
    demandColorMap,
    demandMarkMap
  );

  // Track warehouse remaining stock (Блок «Осталось»)
  const usedCountByStockLength = new Map<number, number>();
  for (const card of finalState.cards) {
    usedCountByStockLength.set(
      card.barSize,
      (usedCountByStockLength.get(card.barSize) || 0) + card.count
    );
  }

  const remainingWarehouseStock: RemnantItem[] = [];
  stockInput.forEach((s) => {
    if (s.isActive === false) return;
    const isAuto =
      s.isStandardUnlimited ||
      ((s.length === 6000 || s.length === 12000 || s.length === 11700) && s.quantity <= 0);
    if (isAuto) return;
    const used = usedCountByStockLength.get(s.length) || 0;
    const rem = Math.max(0, s.quantity - used);
    if (rem > 0) {
      remainingWarehouseStock.push({
        length: s.length,
        quantity: rem,
        mark: s.mark,
        notes: s.notes,
      });
    }
  });

  if (context.reusableRemnantMin > 0) {
    for (const r of rows) {
      if (
        r.isReusable &&
        r.reusableRemnant >= context.reusableRemnantMin &&
        r.reusableRemnant > 0
      ) {
        remainingWarehouseStock.push({
          length: r.reusableRemnant,
          quantity: r.barsCount,
          mark: 'Деловой остаток',
        });
      }
    }
  }

  // Unplaced demand (Блок «Не сделано»)
  const unplacedDemand: UnplacedItem[] = [];
  if (finalState.unplacedScaled.length > 0) {
    const unplacedCounts = new Map<number, number>();
    for (const scaled of finalState.unplacedScaled) {
      const len = scaled * context.nod - context.bladeWidth;
      unplacedCounts.set(len, (unplacedCounts.get(len) || 0) + 1);
    }
    unplacedCounts.forEach((qty, len) => {
      unplacedDemand.push({
        length: len,
        quantity: qty,
      });
    });
  }

  const endTime = performance.now();
  const totalDurationMs = Number((endTime - startedAt).toFixed(1));
  const endMemoryMb = getMemoryUsageMb();
  const memoryDeltaMb =
    startMemoryMb !== undefined && endMemoryMb !== undefined
      ? Number((endMemoryMb - startMemoryMb).toFixed(2))
      : undefined;

  const throughput =
    totalDurationMs > 0
      ? Number((context.totalPartsCount / (totalDurationMs / 1000)).toFixed(1))
      : 0;

  const telemetry: CalculationTelemetry = {
    calculationId: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    environment:
      typeof window === 'undefined' && typeof self !== 'undefined'
        ? 'client_worker'
        : 'client_main',
    totalDurationMs,
    stageTimingsMs: {
      stage1Init: finalState.telemetryCounters.stage1Ms,
      stage2Search: finalState.telemetryCounters.stage2Ms,
      stage3Refine: finalState.telemetryCounters.stage3Ms,
    },
    passesEvaluated: finalState.telemetryCounters.passesEvaluated,
    prunedPasses: finalState.telemetryCounters.prunedPasses ?? 0,
    totalCombinationsChecked: Math.max(
      finalState.telemetryCounters.passesEvaluated,
      finalState.telemetryCounters.totalCombinationsChecked
    ),
    twoOptSwapIterations: finalState.telemetryCounters.twoOptSwapIterations,
    tailConsolidationCardsMerged:
      finalState.telemetryCounters.tailConsolidationCardsMerged,
    throughputPartsPerSecond: throughput,
    memoryUsedMb: endMemoryMb,
    memoryDeltaMb,
    cpuLoadPercent: 100,
    workerThreadCount: finalState.telemetryCounters.threadsUsed ?? 1,
    chunksProcessed: finalState.telemetryCounters.chunksProcessed ?? 0,
  };

  const abortedInfo = finalState.telemetryCounters.abortedDuringSearch
    ? {
        viewedPasses:
          finalState.telemetryCounters.abortedStageViewedPasses ??
          finalState.telemetryCounters.passesEvaluated,
        totalPasses:
          finalState.telemetryCounters.abortedStageTotalPasses ??
          finalState.telemetryCounters.totalPassesPlanned ??
          finalState.telemetryCounters.passesEvaluated,
      }
    : undefined;

  let batchInfo: FullOptimizationSolution['batchInfo'] | undefined;
  if (settings.dualProfileCut === true) {
    const batchSize = resolveBatchSize(demandInput, settings);
    batchInfo = computeBatchInfoFromCards(finalState.cards, demandInput, batchSize);
  }

  return {
    totalStockLength: finalState.metrics.totalStockLengthMm,
    totalSpentLength: finalState.metrics.totalPartsLengthMm,
    totalBarsUsed: finalState.metrics.totalBarsUsed,
    totalWasteLength: finalState.metrics.totalWasteMm,
    totalReusableLength: finalState.metrics.totalReusableMm,
    maxReusableRemnantLength: finalState.metrics.maxReusableRemnantMm,
    cuttingIndex: finalState.metrics.cuttingIndex,
    cuttingIndexMaterial: finalState.metrics.cuttingIndexMaterial,
    cuttingIndexSetup: finalState.metrics.cuttingIndexSetup,
    overallKIM: finalState.metrics.overallKIM,
    netKIM: finalState.metrics.netKIM,
    rows,
    remainingWarehouseStock,
    unplacedDemand,
    calculationTimeMs: totalDurationMs,
    telemetry,
    ...(abortedInfo ? { abortedInfo } : {}),
    ...(batchInfo ? { batchInfo } : {}),
  };
}

function computeBatchInfoFromCards(
  items: readonly { count: number; pieceLengths: readonly number[] }[],
  demandInput: readonly DemandItem[],
  batchSize: number
): NonNullable<FullOptimizationSolution['batchInfo']> {
  let batchBarsUsed = 0;
  let tailBarsUsed = 0;
  const singlePlacedByLen = new Map<number, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { batchCount, singleCount } = getBatchRowSplit(item.count, batchSize);
    batchBarsUsed += batchCount;
    tailBarsUsed += singleCount;
    if (singleCount > 0) {
      for (let p = 0; p < item.pieceLengths.length; p++) {
        const len = item.pieceLengths[p];
        singlePlacedByLen.set(len, (singlePlacedByLen.get(len) || 0) + singleCount);
      }
    }
  }

  const demandQtyByLen = new Map<number, number>();
  for (let i = 0; i < demandInput.length; i++) {
    const d = demandInput[i];
    if (d.length > 0 && d.quantity > 0) {
      demandQtyByLen.set(d.length, (demandQtyByLen.get(d.length) || 0) + d.quantity);
    }
  }

  const nonMultipleDetails: { length: number; quantity: number; tailQuantity: number }[] = [];
  for (const [length, quantity] of demandQtyByLen.entries()) {
    const rem = quantity % batchSize;
    const singlePlaced = singlePlacedByLen.get(length) || 0;
    if (rem !== 0 && singlePlaced > 0) {
      nonMultipleDetails.push({
        length,
        quantity,
        tailQuantity: Math.min(rem, singlePlaced),
      });
    }
  }

  return {
    batchSize,
    batchBarsUsed,
    tailBarsUsed,
    nonMultipleDetails,
  };
}

function solveTailSingleCards(
  stockInput: StockItem[],
  consumedBatchCards: readonly CutCard[],
  tailDemand: DemandItem[],
  settings: AppSettings,
  strategy: CuttingStrategy,
  fullCtx: CutContext,
  shouldAbort?: () => boolean
): {
  cards: CutCard[];
  unplacedScaledFull: number[];
  passesEvaluated: number;
  prunedPasses: number;
  totalCombinationsChecked: number;
} {
  if (tailDemand.length === 0) {
    return {
      cards: [],
      unplacedScaledFull: [],
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
    };
  }
  const { remainingStock } = buildRemainingStockAfterCards(stockInput, consumedBatchCards);
  const tailSettings: AppSettings = {
    ...settings,
    dualProfileCut: false,
    fillControlEnabled: false,
  };
  const tailCtx = buildCutContext(remainingStock, tailDemand, tailSettings, { shouldAbort });
  if (tailCtx.scaledDemand.length === 0 || tailCtx.scaledStockAll.length === 0) {
    const fallbackUnplaced: number[] = [];
    for (const d of tailDemand) {
      if (d.length > 0 && d.quantity > 0) {
        const sc = Math.floor((d.length + fullCtx.bladeWidth) / fullCtx.nod);
        for (let k = 0; k < d.quantity; k++) fallbackUnplaced.push(sc);
      }
    }
    return {
      cards: [],
      unplacedScaledFull: fallbackUnplaced,
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
    };
  }

  const tailInitial: CutState = {
    cards: [],
    metrics: calculateMetrics([], tailCtx, tailCtx.scaledDemand),
    unplacedScaled: tailCtx.scaledDemand,
    score: -Infinity,
    context: tailCtx,
    telemetryCounters: {
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: 0,
      stage1Ms: 0,
      stage2Ms: 0,
      stage3Ms: 0,
    },
  };

  const tailSolved = runCuttingPipeline(tailInitial, strategy);
  const tailCards = tailSolved.cards.map((c) =>
    createCardWithTailFlag(c, fullCtx, true)
  );
  const unplacedScaledFull = tailSolved.unplacedScaled.map((u) => {
    const pieceMm = u * tailCtx.nod - tailCtx.bladeWidth;
    return Math.floor((pieceMm + fullCtx.bladeWidth) / fullCtx.nod);
  });

  return {
    cards: tailCards,
    unplacedScaledFull,
    passesEvaluated: tailSolved.telemetryCounters.passesEvaluated,
    prunedPasses: tailSolved.telemetryCounters.prunedPasses ?? 0,
    totalCombinationsChecked: tailSolved.telemetryCounters.totalCombinationsChecked,
  };
}

function createCardWithTailFlag(
  card: CutCard,
  context: CutContext,
  isTailSingle: boolean
): CutCard {
  const signature = `${card.barSize}:${card.pieceLengths.join(',')}${isTailSingle ? ':S' : ''}${card.isLockedRemnant ? ':R' : ''}`;
  const effectiveSm = Math.max(0, Math.floor((card.barSize - context.edgeTrim) / (context.nod || 1)));
  let spentSm = 0;
  for (let i = 0; i < card.pieceLengths.length; i++) {
    spentSm += Math.floor((card.pieceLengths[i] + context.bladeWidth) / (context.nod || 1));
  }
  return {
    ...card,
    signature,
    effectiveSm,
    spentSm,
    ...(isTailSingle ? { isTailSingle: true } : {}),
    ...(card.isLockedRemnant ? { isLockedRemnant: true } : {}),
  };
}

function combineBatchAndTailState(
  batchState: CutState,
  batchSize: number,
  batchCtx: CutContext,
  fullCtx: CutContext,
  stockInput: StockItem[],
  tailDemand: DemandItem[],
  settings: AppSettings,
  tailStrategy: CuttingStrategy,
  tailCache?: Map<
    string,
    {
      cards: CutCard[];
      unplacedScaledFull: number[];
      passesEvaluated: number;
      prunedPasses: number;
      totalCombinationsChecked: number;
    }
  >
): CutState {
  const batchCards: CutCard[] = [];
  for (let i = 0; i < batchState.cards.length; i++) {
    const c = batchState.cards[i];
    batchCards.push(
      createCardWithTailFlag({ ...c, count: c.count * batchSize }, fullCtx, false)
    );
  }

  const batchUnplacedFull: number[] = [];
  for (let i = 0; i < batchState.unplacedScaled.length; i++) {
    const pieceMm = batchState.unplacedScaled[i] * batchCtx.nod - batchCtx.bladeWidth;
    const fullSc = Math.floor((pieceMm + fullCtx.bladeWidth) / fullCtx.nod);
    for (let k = 0; k < batchSize; k++) batchUnplacedFull.push(fullSc);
  }

  let tailRes: {
    cards: CutCard[];
    unplacedScaledFull: number[];
    passesEvaluated: number;
    prunedPasses: number;
    totalCombinationsChecked: number;
  };
  if (tailDemand.length === 0) {
    tailRes = {
      cards: [],
      unplacedScaledFull: [],
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
    };
  } else if (tailCache) {
    const { finiteSig } = buildRemainingStockAfterCards(stockInput, batchCards);
    const cached = tailCache.get(finiteSig);
    if (cached) {
      tailRes = cached;
    } else {
      tailRes = solveTailSingleCards(
        stockInput,
        batchCards,
        tailDemand,
        settings,
        tailStrategy,
        fullCtx,
        fullCtx.shouldAbort
      );
      tailCache.set(finiteSig, tailRes);
    }
  } else {
    tailRes = solveTailSingleCards(
      stockInput,
      batchCards,
      tailDemand,
      settings,
      tailStrategy,
      fullCtx,
      fullCtx.shouldAbort
    );
  }

  const mergedCards = groupIdenticalCards([...batchCards, ...tailRes.cards], fullCtx);
  const mergedUnplaced = [...batchUnplacedFull, ...tailRes.unplacedScaledFull];
  const metrics = calculateMetrics(mergedCards, fullCtx, mergedUnplaced);

  return {
    ...batchState,
    cards: mergedCards,
    unplacedScaled: mergedUnplaced,
    metrics,
    score: tailStrategy.score(mergedCards, metrics, fullCtx),
    context: fullCtx,
    telemetryCounters: {
      ...batchState.telemetryCounters,
      passesEvaluated: batchState.telemetryCounters.passesEvaluated + tailRes.passesEvaluated,
      prunedPasses:
        (batchState.telemetryCounters.prunedPasses ?? 0) + (tailRes.prunedPasses ?? 0),
      totalCombinationsChecked:
        batchState.telemetryCounters.totalCombinationsChecked + tailRes.totalCombinationsChecked,
    },
  };
}

interface BatchFillControlOutcome {
  state: CutState;
  untouchedBatchCards: CutCard[];
  hasSinglePoolWork: boolean;
}

/**
 * Applies fillControl on batch cards after batch-mode optimization:
 * inspects non-tail batch cards (`!c.isTailSingle`) with purePartsKIM < fillControlThreshold,
 * repacks all pieces from underfilled batch cards on remaining stock in single-profile mode
 * using the active strategy, and accepts ONLY if unplaced did not increase,
 * totalBarsUsed did not increase, and strategy.score() did not worsen.
 */
function applyBatchFillControl(
  combinedState: CutState,
  stockInput: StockItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  strategy: CuttingStrategy
): BatchFillControlOutcome {
  if (combinedState.cards.length === 0) {
    return { state: combinedState, untouchedBatchCards: [], hasSinglePoolWork: false };
  }

  const threshold = settings.fillControlThreshold ?? 50;
  const underfilledPieces: number[] = [];
  const underfilledCards: CutCard[] = [];
  const preservedBatchCards: CutCard[] = [];
  const preservedTailCards: CutCard[] = [];

  for (let i = 0; i < combinedState.cards.length; i++) {
    const c = combinedState.cards[i];
    const purePartsKIM = c.barSize > 0 ? (c.partsLengthMm / c.barSize) * 100 : 0;
    if (!c.isTailSingle && c.pieceLengths.length > 0 && purePartsKIM < threshold) {
      underfilledCards.push(c);
      for (let cnt = 0; cnt < c.count; cnt++) {
        for (let p = 0; p < c.pieceLengths.length; p++) {
          underfilledPieces.push(c.pieceLengths[p]);
        }
      }
    } else if (c.isTailSingle) {
      preservedTailCards.push(c);
    } else {
      preservedBatchCards.push(c);
    }
  }

  if (underfilledPieces.length === 0) {
    return {
      state: combinedState,
      untouchedBatchCards: preservedBatchCards,
      hasSinglePoolWork: false,
    };
  }

  const preservedCards: CutCard[] = [...preservedBatchCards, ...preservedTailCards];
  const { remainingStock: remainingStockInput } = buildRemainingStockAfterCards(
    stockInput,
    preservedCards
  );

  const pieceQtyByLen = new Map<number, number>();
  for (let i = 0; i < underfilledPieces.length; i++) {
    const len = underfilledPieces[i];
    pieceQtyByLen.set(len, (pieceQtyByLen.get(len) || 0) + 1);
  }

  const underfilledDemand: DemandItem[] = [];
  let dIdx = 1;
  for (const [len, qty] of pieceQtyByLen.entries()) {
    underfilledDemand.push({
      id: `fc_d_${len}_${dIdx}`,
      orderIndex: dIdx++,
      length: len,
      quantity: qty,
    });
  }

  const nonPairSettings: AppSettings = {
    ...settings,
    dualProfileCut: false,
    fillControlEnabled: false,
  };

  const repackCtx = buildCutContext(remainingStockInput, underfilledDemand, nonPairSettings, {
    shouldAbort: fullCtx.shouldAbort,
  });

  if (repackCtx.scaledDemand.length === 0 || repackCtx.scaledStockAll.length === 0) {
    return {
      state: combinedState,
      untouchedBatchCards: [...preservedBatchCards, ...underfilledCards],
      hasSinglePoolWork: false,
    };
  }

  const repackInitial: CutState = {
    cards: [],
    metrics: calculateMetrics([], repackCtx, repackCtx.scaledDemand),
    unplacedScaled: repackCtx.scaledDemand,
    score: -Infinity,
    context: repackCtx,
    telemetryCounters: combinedState.telemetryCounters,
  };

  const repackedState = runCuttingPipeline(repackInitial, strategy);
  if (repackedState.cards.length === 0 || repackedState.metrics.unplacedCount > 0) {
    return {
      state: combinedState,
      untouchedBatchCards: [...preservedBatchCards, ...underfilledCards],
      hasSinglePoolWork: false,
    };
  }

  // Note: unplacedScaled in combinedState is already in fullCtx.nod units!
  const origGroupedCards = groupIdenticalCards(combinedState.cards, fullCtx);
  const origMetrics = calculateMetrics(origGroupedCards, fullCtx, combinedState.unplacedScaled);
  const origScore = strategy.score(origGroupedCards, origMetrics, fullCtx);

  const mergedCards = groupIdenticalCards([...preservedCards, ...repackedState.cards], fullCtx);
  const candMetrics = calculateMetrics(mergedCards, fullCtx, combinedState.unplacedScaled);
  const candScore = strategy.score(mergedCards, candMetrics, fullCtx);

  if (
    candMetrics.unplacedCount <= origMetrics.unplacedCount &&
    candMetrics.totalBarsUsed <= origMetrics.totalBarsUsed &&
    candScore >= origScore
  ) {
    let cardsChanged = mergedCards.length !== origGroupedCards.length;
    if (!cardsChanged) {
      for (let i = 0; i < mergedCards.length; i++) {
        if (
          mergedCards[i].signature !== origGroupedCards[i].signature ||
          mergedCards[i].count !== origGroupedCards[i].count
        ) {
          cardsChanged = true;
          break;
        }
      }
    }
    if (!cardsChanged) {
      return {
        state: combinedState,
        untouchedBatchCards: [...preservedBatchCards, ...underfilledCards],
        hasSinglePoolWork: false,
      };
    }
    return {
      state: {
        ...combinedState,
        cards: mergedCards,
        metrics: candMetrics,
        score: candScore,
        telemetryCounters: {
          ...combinedState.telemetryCounters,
          passesEvaluated:
            combinedState.telemetryCounters.passesEvaluated +
            repackedState.telemetryCounters.passesEvaluated,
          prunedPasses:
            (combinedState.telemetryCounters.prunedPasses ?? 0) +
            (repackedState.telemetryCounters.prunedPasses ?? 0),
          totalCombinationsChecked:
            combinedState.telemetryCounters.totalCombinationsChecked +
            repackedState.telemetryCounters.totalCombinationsChecked,
        },
      },
      untouchedBatchCards: preservedBatchCards,
      hasSinglePoolWork: true,
    };
  }

  return {
    state: combinedState,
    untouchedBatchCards: [...preservedBatchCards, ...underfilledCards],
    hasSinglePoolWork: false,
  };
}

/**
 * Post-step after batch cutting + tail + fillControl:
 * collects pieces from ALL single-bar allocations (isTailSingle cards, fill-control repacked
 * non-batch cards, and single bars inside mixed batch+single cards) into a single pool,
 * repacks them once in ordinary non-batch mode with the same strategy and searchSpeed,
 * and accepts ONLY if unplacedCount and totalBarsUsed do not increase and strategy.score() does not worsen.
 * Untouched batch cards remain strictly untouched.
 */
function consolidateUnifiedSinglePool(
  currentState: CutState,
  batchSize: number,
  untouchedBatchCardsHint: readonly CutCard[] | null,
  hasFillControlWork: boolean,
  stockInput: StockItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  strategy: CuttingStrategy
): CutState {
  if (currentState.cards.length === 0) return currentState;

  let hasNonBatchMod = false;
  for (let i = 0; i < currentState.cards.length; i++) {
    const c = currentState.cards[i];
    if (!c.isTailSingle && c.count % batchSize !== 0) {
      hasNonBatchMod = true;
      break;
    }
  }
  if (!hasFillControlWork && !hasNonBatchMod) {
    return currentState;
  }

  const untouchedCountBySig = new Map<string, number>();
  if (untouchedBatchCardsHint) {
    for (let i = 0; i < untouchedBatchCardsHint.length; i++) {
      const c = untouchedBatchCardsHint[i];
      if (!c.isTailSingle && c.count > 0) {
        untouchedCountBySig.set(c.signature, (untouchedCountBySig.get(c.signature) || 0) + c.count);
      }
    }
  }

  const untouchedBatchCards: CutCard[] = [];
  const singlePoolPieces: number[] = [];

  for (let i = 0; i < currentState.cards.length; i++) {
    const c = currentState.cards[i];
    if (c.count <= 0) continue;

    if (c.isTailSingle) {
      for (let cnt = 0; cnt < c.count; cnt++) {
        for (let p = 0; p < c.pieceLengths.length; p++) {
          singlePoolPieces.push(c.pieceLengths[p]);
        }
      }
      continue;
    }

    if (untouchedBatchCardsHint) {
      const keepBatch = Math.min(c.count, untouchedCountBySig.get(c.signature) || 0);
      if (keepBatch > 0) {
        untouchedCountBySig.set(
          c.signature,
          (untouchedCountBySig.get(c.signature) || 0) - keepBatch
        );
        untouchedBatchCards.push(
          keepBatch === c.count
            ? c
            : createCardWithTailFlag({ ...c, count: keepBatch }, fullCtx, false)
        );
      }
      const singleBars = c.count - keepBatch;
      for (let cnt = 0; cnt < singleBars; cnt++) {
        for (let p = 0; p < c.pieceLengths.length; p++) {
          singlePoolPieces.push(c.pieceLengths[p]);
        }
      }
    } else {
      const batchBars = Math.floor(c.count / batchSize) * batchSize;
      const singleBars = c.count - batchBars;
      if (batchBars > 0) {
        untouchedBatchCards.push(
          batchBars === c.count
            ? c
            : createCardWithTailFlag({ ...c, count: batchBars }, fullCtx, false)
        );
      }
      for (let cnt = 0; cnt < singleBars; cnt++) {
        for (let p = 0; p < c.pieceLengths.length; p++) {
          singlePoolPieces.push(c.pieceLengths[p]);
        }
      }
    }
  }

  if (singlePoolPieces.length === 0) return currentState;

  const { remainingStock } = buildRemainingStockAfterCards(stockInput, untouchedBatchCards);
  const qtyByLen = new Map<number, number>();
  for (let i = 0; i < singlePoolPieces.length; i++) {
    const len = singlePoolPieces[i];
    qtyByLen.set(len, (qtyByLen.get(len) || 0) + 1);
  }

  const poolDemand: DemandItem[] = [];
  let dIdx = 1;
  for (const [len, qty] of qtyByLen.entries()) {
    poolDemand.push({
      id: `sp_d_${len}_${dIdx}`,
      orderIndex: dIdx++,
      length: len,
      quantity: qty,
    });
  }

  const nonPairSettings: AppSettings = {
    ...settings,
    dualProfileCut: false,
    fillControlEnabled: false,
  };

  const poolCtx = buildCutContext(remainingStock, poolDemand, nonPairSettings, {
    shouldAbort: fullCtx.shouldAbort,
  });

  if (poolCtx.scaledDemand.length === 0 || poolCtx.scaledStockAll.length === 0) {
    return currentState;
  }

  const poolInitial: CutState = {
    cards: [],
    metrics: calculateMetrics([], poolCtx, poolCtx.scaledDemand),
    unplacedScaled: poolCtx.scaledDemand,
    score: -Infinity,
    context: poolCtx,
    telemetryCounters: currentState.telemetryCounters,
  };

  const poolSolved = runCuttingPipeline(poolInitial, strategy);
  if (poolSolved.cards.length === 0 || poolSolved.metrics.unplacedCount > 0) {
    return currentState;
  }

  const origGroupedCards = groupIdenticalCards(currentState.cards, fullCtx);
  const origMetrics = calculateMetrics(origGroupedCards, fullCtx, currentState.unplacedScaled);
  const origScore = strategy.score(origGroupedCards, origMetrics, fullCtx);

  const poolCards = poolSolved.cards.map((c) => createCardWithTailFlag(c, fullCtx, true));
  const mergedCards = groupIdenticalCards([...untouchedBatchCards, ...poolCards], fullCtx);
  const candMetrics = calculateMetrics(mergedCards, fullCtx, currentState.unplacedScaled);
  const candScore = strategy.score(mergedCards, candMetrics, fullCtx);

  if (
    candMetrics.unplacedCount <= origMetrics.unplacedCount &&
    candMetrics.totalBarsUsed <= origMetrics.totalBarsUsed &&
    candScore >= origScore
  ) {
    return {
      ...currentState,
      cards: mergedCards,
      metrics: candMetrics,
      score: candScore,
      telemetryCounters: {
        ...currentState.telemetryCounters,
        passesEvaluated:
          currentState.telemetryCounters.passesEvaluated +
          poolSolved.telemetryCounters.passesEvaluated,
        prunedPasses:
          (currentState.telemetryCounters.prunedPasses ?? 0) +
          (poolSolved.telemetryCounters.prunedPasses ?? 0),
        totalCombinationsChecked:
          currentState.telemetryCounters.totalCombinationsChecked +
          poolSolved.telemetryCounters.totalCombinationsChecked,
      },
    };
  }

  return currentState;
}

interface ForcedRemnantShapingPrepared {
  cutoffMm: number;
  preservedCards: CutCard[];
  remainingStock: StockItem[];
  poolDemand: DemandItem[];
  poolCtx: CutContext;
  poolInitial: CutState;
  shapingStrategy: ForcedRemnantShapingStrategy;
  shapingProfiles: PassSearchProfile[];
  shapingTotalPasses: number;
}

function resolveStandardPassProfiles(
  searchSpeed: AppSettings['searchSpeed']
): PassSearchProfile[] {
  const profiles: PassSearchProfile[] = ['best'];
  if (searchSpeed === 'standard' || searchSpeed === 'exact' || searchSpeed === 'deep') {
    profiles.push('fastPrefix');
  }
  if (searchSpeed === 'deep') {
    profiles.push('stdPrefix');
  }
  return profiles;
}

function prepareForcedRemnantShaping(
  currentState: CutState,
  stockInput: StockItem[],
  settings: AppSettings,
  fullCtx: CutContext
): ForcedRemnantShapingPrepared | null {
  if (
    settings.shapeRemnantsInSearch !== true ||
    fullCtx.reusableRemnantMin <= 0 ||
    currentState.cards.length === 0 ||
    fullCtx.shouldAbort?.() ||
    currentState.telemetryCounters.abortedDuringSearch
  ) {
    return null;
  }

  const delOst = fullCtx.reusableRemnantMin;
  const pct = Math.min(100, Math.max(0, settings.shapeRemnantsThresholdPct ?? 50));
  const cutoffMm = Math.floor((delOst * pct) / 100);

  const preservedCards: CutCard[] = [];
  const poolPieces: number[] = [];

  for (let i = 0; i < currentState.cards.length; i++) {
    const c = currentState.cards[i];
    if (c.count <= 0 || c.pieceLengths.length === 0) continue;
    if (!c.isLockedRemnant && !c.isReusable && c.scrapRemnantMm > cutoffMm) {
      for (let k = 0; k < c.count; k++) {
        for (let p = 0; p < c.pieceLengths.length; p++) {
          poolPieces.push(c.pieceLengths[p]);
        }
      }
    } else {
      preservedCards.push(c);
    }
  }

  if (poolPieces.length === 0) {
    return null;
  }

  const { remainingStock } = buildRemainingStockAfterCards(stockInput, preservedCards);
  const qtyByLen = new Map<number, number>();
  for (let i = 0; i < poolPieces.length; i++) {
    const len = poolPieces[i];
    qtyByLen.set(len, (qtyByLen.get(len) || 0) + 1);
  }

  const poolDemand: DemandItem[] = [];
  let dIdx = 1;
  for (const [len, qty] of qtyByLen.entries()) {
    poolDemand.push({
      id: `rs_d_${len}_${dIdx}`,
      orderIndex: dIdx++,
      length: len,
      quantity: qty,
    });
  }

  const poolSettings: AppSettings = {
    ...settings,
    dualProfileCut: false,
    fillControlEnabled: false,
    shapeRemnantsInSearch: false,
  };

  const poolCtxRaw = buildCutContext(remainingStock, poolDemand, poolSettings, {
    shouldAbort: fullCtx.shouldAbort,
    onProgress: fullCtx.onProgress,
  });

  if (poolCtxRaw.scaledDemand.length === 0 || poolCtxRaw.scaledStockAll.length === 0) {
    return null;
  }

  const poolCtx: CutContext = {
    ...poolCtxRaw,
    searchRemnantMin: delOst,
  };

  const poolInitial: CutState = {
    cards: [],
    metrics: calculateMetrics([], poolCtx, poolCtx.scaledDemand),
    unplacedScaled: poolCtx.scaledDemand,
    score: -Infinity,
    context: poolCtx,
    telemetryCounters: {
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: 0,
      stage1Ms: 0,
      stage2Ms: 0,
      stage3Ms: 0,
      threadsUsed: 1,
      chunksProcessed: 0,
    },
  };

  const shapingTotalPasses =
    (poolCtx.maxSortZ + 1) * (poolCtx.maxSort + 1) * (poolCtx.maxVar + 1);

  return {
    cutoffMm,
    preservedCards,
    remainingStock,
    poolDemand,
    poolCtx,
    poolInitial,
    shapingStrategy: new ForcedRemnantShapingStrategy(cutoffMm),
    shapingProfiles: resolveStandardPassProfiles(poolSettings.searchSpeed),
    shapingTotalPasses,
  };
}

function finalizeForcedRemnantShaping(
  currentState: CutState,
  poolSolved: CutState,
  prep: ForcedRemnantShapingPrepared,
  demandInput: DemandItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  origStrategy: CuttingStrategy
): CutState {
  const { cutoffMm, preservedCards, shapingTotalPasses } = prep;
  const shapingAborted = Boolean(
    poolSolved.telemetryCounters.abortedDuringSearch || fullCtx.shouldAbort?.()
  );

  const mergedTelemetry = {
    ...currentState.telemetryCounters,
    passesEvaluated:
      currentState.telemetryCounters.passesEvaluated +
      poolSolved.telemetryCounters.passesEvaluated,
    prunedPasses:
      (currentState.telemetryCounters.prunedPasses ?? 0) +
      (poolSolved.telemetryCounters.prunedPasses ?? 0),
    totalCombinationsChecked:
      currentState.telemetryCounters.totalCombinationsChecked +
      poolSolved.telemetryCounters.totalCombinationsChecked,
    threadsUsed: Math.max(
      currentState.telemetryCounters.threadsUsed ?? 1,
      poolSolved.telemetryCounters.threadsUsed ?? 1
    ),
    chunksProcessed:
      (currentState.telemetryCounters.chunksProcessed ?? 0) +
      (poolSolved.telemetryCounters.chunksProcessed ?? 0),
    ...(shapingAborted
      ? {
          abortedDuringSearch: true,
          abortedStageViewedPasses: poolSolved.telemetryCounters.passesEvaluated,
          abortedStageTotalPasses:
            poolSolved.telemetryCounters.totalPassesPlanned ?? shapingTotalPasses,
        }
      : {}),
  };

  if (poolSolved.cards.length === 0 || poolSolved.metrics.unplacedCount > 0) {
    return shapingAborted
      ? { ...currentState, telemetryCounters: mergedTelemetry }
      : currentState;
  }

  const isBatchMode = settings.dualProfileCut === true;
  const batchSize = isBatchMode ? resolveBatchSize(demandInput, settings) : 1;
  const convertedPoolCards: CutCard[] = [];

  for (let i = 0; i < poolSolved.cards.length; i++) {
    const c = poolSolved.cards[i];
    if (c.count <= 0) continue;
    if (isBatchMode && batchSize >= 2) {
      const { batchCount, singleCount } = getBatchRowSplit(c.count, batchSize);
      if (batchCount > 0) {
        convertedPoolCards.push(
          createCardWithTailFlag({ ...c, count: batchCount }, fullCtx, false)
        );
      }
      if (singleCount > 0) {
        convertedPoolCards.push(
          createCardWithTailFlag({ ...c, count: singleCount }, fullCtx, true)
        );
      }
    } else {
      convertedPoolCards.push(createCardWithTailFlag(c, fullCtx, false));
    }
  }

  const origGroupedCards = groupIdenticalCards(currentState.cards, fullCtx);
  const origMetrics = calculateMetrics(origGroupedCards, fullCtx, currentState.unplacedScaled);
  const mergedCards = groupIdenticalCards(
    [...preservedCards, ...convertedPoolCards],
    fullCtx
  );
  const candMetrics = calculateMetrics(mergedCards, fullCtx, currentState.unplacedScaled);

  const countBadScrap = (cards: readonly CutCard[]): number => {
    let sum = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c.isReusable && c.scrapRemnantMm > cutoffMm) {
        sum += c.scrapRemnantMm * c.count;
      }
    }
    return sum;
  };

  const origBadScrapMm = countBadScrap(origGroupedCards);
  const candBadScrapMm = countBadScrap(mergedCards);

  const improved =
    candMetrics.unplacedCount <= origMetrics.unplacedCount &&
    candMetrics.totalStockLengthMm <= origMetrics.totalStockLengthMm &&
    (candMetrics.totalStockLengthMm < origMetrics.totalStockLengthMm ||
      candBadScrapMm < origBadScrapMm ||
      candMetrics.totalReusableMm > origMetrics.totalReusableMm ||
      candMetrics.totalScrapMm < origMetrics.totalScrapMm);

  if (!improved) {
    return shapingAborted
      ? { ...currentState, telemetryCounters: mergedTelemetry }
      : currentState;
  }

  return {
    ...currentState,
    cards: mergedCards,
    metrics: candMetrics,
    score: origStrategy.score(mergedCards, candMetrics, fullCtx),
    telemetryCounters: mergedTelemetry,
  };
}

/**
 * Final post-processing stage when `shapeRemnantsInSearch` is enabled:
 * Finds all cards with non-reusable scrap exceeding `shapeRemnantsThresholdPct`% of `reusableRemnantMin`,
 * breaks all their pieces into a unified demand pool on remaining stock, and repacks them using
 * ForcedRemnantShapingStrategy (based on MinimizeMaterialStrategy) to elevate scrap into reusable remnants.
 */
function applyForcedRemnantShaping(
  currentState: CutState,
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  origStrategy: CuttingStrategy
): CutState {
  const prep = prepareForcedRemnantShaping(currentState, stockInput, settings, fullCtx);
  if (!prep) return currentState;

  const poolSolved = runCuttingPipeline(prep.poolInitial, prep.shapingStrategy);
  return finalizeForcedRemnantShaping(
    currentState,
    poolSolved,
    prep,
    demandInput,
    settings,
    fullCtx,
    origStrategy
  );
}

async function applyForcedRemnantShapingAsync(
  currentState: CutState,
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  origStrategy: CuttingStrategy,
  parallelExecutor?: ParallelPassExecutor
): Promise<CutState> {
  const prep = prepareForcedRemnantShaping(currentState, stockInput, settings, fullCtx);
  if (!prep) return currentState;

  const { finalState: poolSolved } = await runStage2AndRefineMaybeParallel(
    prep.poolInitial,
    prep.shapingStrategy,
    prep.remainingStock,
    prep.poolDemand,
    prep.shapingProfiles,
    parallelExecutor
  );

  return finalizeForcedRemnantShaping(
    currentState,
    poolSolved,
    prep,
    demandInput,
    settings,
    fullCtx,
    origStrategy
  );
}

function isExactSolverActive(settings: AppSettings): boolean {
  return settings.exactSolverEnabled === true || settings.searchSpeed === 'exact';
}

interface RemnantStageAResult {
  lockedCards: CutCard[];
  lockedRemnantMm: number;
  remainingDemand: DemandItem[];
  standardStock: StockItem[];
  stageBSettings: AppSettings;
  passesEvaluated: number;
  prunedPasses: number;
  totalCombinationsChecked: number;
  stage1Ms: number;
  stage2Ms: number;
}

function runPrioritizeRemnantsStageA(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  fullCtx: CutContext,
  options?: SolveLinearCuttingOptions
): RemnantStageAResult | null {
  if (settings.prioritizeRemnants !== true) return null;

  const remnantStock: StockItem[] = [];
  const standardStock: StockItem[] = [];
  for (let i = 0; i < stockInput.length; i++) {
    const st = stockInput[i];
    if (st.isActive === false) continue;
    if (isRemnantStock(st) && st.length > 0 && st.quantity > 0) {
      remnantStock.push(st);
    } else if (!isRemnantStock(st)) {
      standardStock.push(st);
    }
  }

  if (remnantStock.length === 0) return null;

  const stageBSettings: AppSettings = {
    ...settings,
    prioritizeRemnants: false,
  };

  const activeDemand = demandInput.filter((d) => d.length > 0 && d.quantity > 0);
  if (activeDemand.length === 0) {
    return {
      lockedCards: [],
      lockedRemnantMm: 0,
      remainingDemand: [],
      standardStock,
      stageBSettings,
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      stage1Ms: 0,
      stage2Ms: 0,
    };
  }

  const stageASettings: AppSettings = {
    ...settings,
    optimizationGoal: 'min_bars',
    dualProfileCut: false,
    fillControlEnabled: false,
    shapeRemnantsInSearch: false,
    exactSolverEnabled: false,
    searchSpeed: settings.searchSpeed === 'exact' ? 'standard' : settings.searchSpeed,
    prioritizeRemnants: true,
  };

  const stageACtx = buildCutContext(remnantStock, activeDemand, stageASettings, {
    shouldAbort: options?.shouldAbort,
    onProgress: (p) => {
      options?.onProgress?.({
        ...p,
        stage: 1,
        totalStages: 3,
        stageName: 'Этап 1: раскрой деловых остатков со склада',
        percent: Math.min(20, Math.max(2, Math.round(p.percent * 0.2))),
      });
    },
  });

  if (stageACtx.scaledDemand.length === 0 || stageACtx.scaledStockAll.length === 0) {
    return {
      lockedCards: [],
      lockedRemnantMm: 0,
      remainingDemand: activeDemand,
      standardStock,
      stageBSettings,
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      stage1Ms: 0,
      stage2Ms: 0,
    };
  }

  const remnantStrategy = new RemnantFillStrategy();
  const stageAInit: CutState = {
    cards: [],
    metrics: calculateMetrics([], stageACtx, stageACtx.scaledDemand),
    unplacedScaled: stageACtx.scaledDemand,
    score: -Infinity,
    context: stageACtx,
    telemetryCounters: {
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: 0,
      stage1Ms: 0,
      stage2Ms: 0,
      stage3Ms: 0,
    },
  };

  const stageASolved = runCuttingPipeline(stageAInit, remnantStrategy);
  const minFillPct = Math.min(
    100,
    Math.max(0, settings.remnantMinFillPct ?? settings.targetRemnantKIM ?? 75)
  );

  const rawLockedCards: CutCard[] = [];
  for (let i = 0; i < stageASolved.cards.length; i++) {
    const c = stageASolved.cards[i];
    if (c.count <= 0 || c.barSize <= 0 || c.pieceLengths.length === 0) continue;
    const pureFillPct = (c.partsLengthMm / c.barSize) * 100;
    if (minFillPct > 0 && pureFillPct < minFillPct - 1e-6) continue;
    rawLockedCards.push(
      createCutCard(c.barSize, c.pieceLengths, c.count, fullCtx, false, true)
    );
  }
  const lockedCards = groupIdenticalCards(rawLockedCards, fullCtx);

  let lockedRemnantMm = 0;
  const placedByLen = new Map<number, number>();
  for (let i = 0; i < lockedCards.length; i++) {
    const card = lockedCards[i];
    lockedRemnantMm += card.barSize * card.count;
    for (let p = 0; p < card.pieceLengths.length; p++) {
      const len = card.pieceLengths[p];
      placedByLen.set(len, (placedByLen.get(len) || 0) + card.count);
    }
  }

  const remainingDemand: DemandItem[] = [];
  for (let i = 0; i < activeDemand.length; i++) {
    const d = activeDemand[i];
    const availPlaced = placedByLen.get(d.length) || 0;
    const take = Math.min(d.quantity, availPlaced);
    if (take > 0) placedByLen.set(d.length, availPlaced - take);
    const remQty = d.quantity - take;
    if (remQty > 0) {
      remainingDemand.push({ ...d, quantity: remQty });
    }
  }

  return {
    lockedCards,
    lockedRemnantMm,
    remainingDemand,
    standardStock,
    stageBSettings,
    passesEvaluated: stageASolved.telemetryCounters.passesEvaluated,
    prunedPasses: stageASolved.telemetryCounters.prunedPasses ?? 0,
    totalCombinationsChecked: stageASolved.telemetryCounters.totalCombinationsChecked,
    stage1Ms: stageASolved.telemetryCounters.stage1Ms,
    stage2Ms: stageASolved.telemetryCounters.stage2Ms,
  };
}

function mergeLockedRemnantsWithStageB(
  stageA: RemnantStageAResult,
  stageBState: CutState,
  stageBCtx: CutContext,
  fullCtx: CutContext,
  strategy: CuttingStrategy
): CutState {
  const convertedStageBCards = stageBState.cards.map((c) =>
    createCardWithTailFlag(c, fullCtx, Boolean(c.isTailSingle))
  );
  const mergedCards = groupIdenticalCards(
    [...stageA.lockedCards, ...convertedStageBCards],
    fullCtx
  );
  const unplacedFull = stageBState.unplacedScaled.map((u) => {
    const pieceMm = u * stageBCtx.nod - stageBCtx.bladeWidth;
    return Math.floor((pieceMm + fullCtx.bladeWidth) / fullCtx.nod);
  });
  const metrics = calculateMetrics(mergedCards, fullCtx, unplacedFull);
  return {
    ...stageBState,
    cards: mergedCards,
    unplacedScaled: unplacedFull,
    metrics,
    score: strategy.score(mergedCards, metrics, fullCtx),
    context: fullCtx,
    telemetryCounters: {
      ...stageBState.telemetryCounters,
      passesEvaluated: stageA.passesEvaluated + stageBState.telemetryCounters.passesEvaluated,
      prunedPasses: stageA.prunedPasses + (stageBState.telemetryCounters.prunedPasses ?? 0),
      totalCombinationsChecked:
        stageA.totalCombinationsChecked + stageBState.telemetryCounters.totalCombinationsChecked,
      stage1Ms: stageA.stage1Ms + stageBState.telemetryCounters.stage1Ms,
      stage2Ms: stageA.stage2Ms + stageBState.telemetryCounters.stage2Ms,
    },
  };
}

function resolvePrimaryStandardBarLength(
  baseSol: FullOptimizationSolution,
  context: CutContext,
  stockInput: StockItem[]
): number {
  const stdSet = new Set(context.activeStandardLengths);
  const stdUsage = new Map<number, number>();
  for (const r of baseSol.rows) {
    if (stdSet.has(r.barSize) || r.barSize === 6000 || r.barSize === 12000 || r.barSize === 11700) {
      stdUsage.set(r.barSize, (stdUsage.get(r.barSize) || 0) + r.barsCount);
    }
  }
  if (stdUsage.size > 0) {
    let bestLen = 0;
    let bestCount = -1;
    for (const [len, cnt] of stdUsage.entries()) {
      if (cnt > bestCount || (cnt === bestCount && len > bestLen)) {
        bestCount = cnt;
        bestLen = len;
      }
    }
    if (bestLen > 0) return bestLen;
  }
  if (context.activeStandardLengths.length > 0) {
    return Math.max(...context.activeStandardLengths);
  }
  let maxActive = 0;
  for (const s of stockInput) {
    if (s.isActive !== false && s.length > maxActive) {
      maxActive = s.length;
    }
  }
  return maxActive > 0 ? maxActive : 6000;
}

function formatTolerancePct(pct: number): string {
  const rounded = Number(pct.toFixed(2));
  return rounded.toString().replace('.', ',');
}

function buildParetoFrontier(
  candidates: readonly { solution: FullOptimizationSolution; isBaseline: boolean }[]
): Array<{ solution: FullOptimizationSolution; isBaseline: boolean }> {
  const sorted = candidates.slice().sort((a, b) => {
    if (a.solution.totalStockLength !== b.solution.totalStockLength) {
      return a.solution.totalStockLength - b.solution.totalStockLength;
    }
    if (a.solution.rows.length !== b.solution.rows.length) {
      return a.solution.rows.length - b.solution.rows.length;
    }
    return a.solution.totalWasteLength - b.solution.totalWasteLength;
  });

  const nonDominated: Array<{ solution: FullOptimizationSolution; isBaseline: boolean }> = [];
  for (const cand of sorted) {
    if (nonDominated.length === 0) {
      nonDominated.push(cand);
      continue;
    }
    const prev = nonDominated[nonDominated.length - 1];
    if (cand.solution.rows.length < prev.solution.rows.length) {
      if (cand.solution.totalStockLength === prev.solution.totalStockLength) {
        nonDominated[nonDominated.length - 1] = cand;
      } else {
        nonDominated.push(cand);
      }
    }
  }
  return nonDominated;
}

/**
 * Runs «Баланс: материал <-> наладки» strategy suite:
 * 1) Single baseline run with MinimizeMaterialStrategy (min_material) -> (M*, C0)
 * 2) Single extreme setups run with MinimizeSetupsStrategy -> (M_s, C_s)
 * 3) If C_s < C0: fixed tolerances p in {0.1%, 0.5%, 1%, 2%} strictly < M_s,
 *    followed by up to 4 adaptive bisection midpoints on largest card-drop intervals (>= 2 cards),
 *    capped at <= 9 total runs.
 * 4) Strict non-dominated Pareto filtering along (totalStockLength, uniqueCardsCount).
 */
export function runBalanceSuite(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  baseSettings: AppSettings,
  options?: SolveLinearCuttingOptions
): BalanceResult {
  const suiteStart = performance.now();
  const startMemoryMb = getMemoryUsageMb();
  const effSettings: AppSettings = {
    ...baseSettings,
    optimizationGoal: 'min_bars',
    dualProfileCut: false,
  };

  const fullCtx = buildCutContext(stockInput, demandInput, effSettings, {
    shouldAbort: options?.shouldAbort,
  });

  if (fullCtx.scaledDemand.length === 0 || fullCtx.scaledStockAll.length === 0) {
    const emptySol: FullOptimizationSolution = {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      maxReusableRemnantLength: 0,
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
    return { suite: [], bestSolution: emptySol, timings: [], totalDurationMs: 0 };
  }

  const stageA = runPrioritizeRemnantsStageA(
    stockInput,
    demandInput,
    effSettings,
    fullCtx,
    options
  );
  const stageBStock = stageA ? stageA.standardStock : stockInput;
  const stageBDemand = stageA ? stageA.remainingDemand : demandInput;
  const stageBSettings = stageA ? stageA.stageBSettings : effSettings;
  const stageBUserSettings = stageA ? { ...baseSettings, prioritizeRemnants: false } : baseSettings;
  const matStrategy = new MinimizeMaterialStrategy();
  const setupsStrategy = new MinimizeSetupsStrategy();

  if (stageA && stageBDemand.length === 0) {
    const lockedMetrics = calculateMetrics(stageA.lockedCards, fullCtx, []);
    const lockedState: CutState = {
      cards: stageA.lockedCards,
      metrics: lockedMetrics,
      unplacedScaled: [],
      score: matStrategy.score(stageA.lockedCards, lockedMetrics, fullCtx),
      context: fullCtx,
      telemetryCounters: {
        passesEvaluated: stageA.passesEvaluated,
        prunedPasses: stageA.prunedPasses,
        totalCombinationsChecked: stageA.totalCombinationsChecked,
        twoOptSwapIterations: 0,
        tailConsolidationCardsMerged: 0,
        initialCardsCount: lockedMetrics.uniqueCardsCount,
        stage1Ms: stageA.stage1Ms,
        stage2Ms: stageA.stage2Ms,
        stage3Ms: 0,
      },
    };
    const lockedSol = buildSolutionFromFinalState(
      lockedState,
      fullCtx,
      stockInput,
      demandInput,
      baseSettings,
      startMemoryMb,
      suiteStart
    );
    const totalDurationMs = Number((performance.now() - suiteStart).toFixed(1));
    return {
      suite: [
        {
          goal: 'balance',
          title: 'Баланс',
          badge: '⚖️ Баланс',
          description: 'Оптимальный вариант по расходу материала и числу карт раскроя',
          solution: lockedSol,
        },
      ],
      bestSolution: lockedSol,
      timings: [
        {
          label: 'Минимум материала',
          capMm: lockedSol.totalStockLength,
          durationMs: totalDurationMs,
          stockMm: lockedSol.totalStockLength,
          bars: lockedSol.totalBarsUsed,
          cards: lockedSol.rows.length,
        },
      ],
      totalDurationMs,
    };
  }

  const stageBFullCtx = stageA
    ? buildCutContext(stageBStock, stageBDemand, stageBSettings, {
        shouldAbort: options?.shouldAbort,
      })
    : fullCtx;

  const isBatchMode = baseSettings.dualProfileCut === true;
  const batchSplit = isBatchMode
    ? splitBatchAndTailInputs(
        stageBStock,
        stageBDemand,
        resolveBatchSize(stageBDemand, stageBUserSettings)
      )
    : null;

  // Edge case: batch mode enabled, but every demand quantity < batchSize -> everything goes to single tail
  if (batchSplit && batchSplit.batchDemand.length === 0) {
    const tailRes = solveTailSingleCards(
      stageBStock,
      [],
      batchSplit.tailDemand,
      stageBUserSettings,
      matStrategy,
      stageBFullCtx,
      options?.shouldAbort
    );
    const tailCards = groupIdenticalCards(tailRes.cards, stageBFullCtx);
    const tailMetrics = calculateMetrics(tailCards, stageBFullCtx, tailRes.unplacedScaledFull);
    const tailStateRaw: CutState = {
      cards: tailCards,
      unplacedScaled: tailRes.unplacedScaledFull,
      metrics: tailMetrics,
      score: matStrategy.score(tailCards, tailMetrics, stageBFullCtx),
      context: stageBFullCtx,
      telemetryCounters: {
        passesEvaluated: tailRes.passesEvaluated,
        prunedPasses: tailRes.prunedPasses,
        totalCombinationsChecked: tailRes.totalCombinationsChecked,
        twoOptSwapIterations: 0,
        tailConsolidationCardsMerged: 0,
        initialCardsCount: tailMetrics.uniqueCardsCount,
        stage1Ms: 0,
        stage2Ms: 0,
        stage3Ms: 0,
      },
    };
    const shapedTail = applyForcedRemnantShaping(
      tailStateRaw,
      stageBStock,
      stageBDemand,
      stageBUserSettings,
      stageBFullCtx,
      matStrategy
    );
    const tailState = stageA
      ? mergeLockedRemnantsWithStageB(stageA, shapedTail, stageBFullCtx, fullCtx, matStrategy)
      : shapedTail;
    const tailSol = buildSolutionFromFinalState(
      tailState,
      fullCtx,
      stockInput,
      demandInput,
      baseSettings,
      startMemoryMb,
      suiteStart
    );
    const totalDurationMs = Number((performance.now() - suiteStart).toFixed(1));
    return {
      suite: [
        {
          goal: 'balance',
          title: 'Баланс',
          badge: '⚖️ Баланс',
          description: 'Оптимальный вариант по расходу материала и числу карт раскроя',
          solution: tailSol,
        },
      ],
      bestSolution: tailSol,
      timings: [
        {
          label: 'Минимум материала',
          capMm: tailSol.totalStockLength,
          durationMs: totalDurationMs,
          stockMm: tailSol.totalStockLength,
          bars: tailSol.totalBarsUsed,
          cards: tailSol.rows.length,
        },
      ],
      totalDurationMs,
    };
  }

  const baseCtx = buildCutContext(
    batchSplit ? batchSplit.batchStock : stageBStock,
    batchSplit ? batchSplit.batchDemand : stageBDemand,
    stageBSettings,
    {
      shouldAbort: options?.shouldAbort,
      onProgress: (p) => {
        options?.onProgress?.({
          ...p,
          stage: 1,
          totalStages: 6,
          stageName: 'Баланс: минимум материала',
          percent: Math.min(25, Math.max(2, Math.round(p.percent * 0.25))),
        });
      },
    }
  );

  const emptyMetrics = calculateMetrics([], baseCtx, baseCtx.scaledDemand);
  const initialState: CutState = {
    cards: [],
    metrics: emptyMetrics,
    unplacedScaled: baseCtx.scaledDemand,
    score: -Infinity,
    context: baseCtx,
    telemetryCounters: {
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: 0,
      stage1Ms: 0,
      stage2Ms: 0,
      stage3Ms: 0,
    },
  };

  const tailCache = new Map<
    string,
    {
      cards: CutCard[];
      unplacedScaledFull: number[];
      passesEvaluated: number;
      prunedPasses: number;
      totalCombinationsChecked: number;
    }
  >();

  const finalizeVariantState = (
    rawBatchState: CutState,
    variantCtx: CutContext,
    strategy: CuttingStrategy
  ): { state: CutState; evalCtx: CutContext } => {
    let stageBFinal: CutState;
    let stageBEvalCtx: CutContext;
    if (!batchSplit) {
      stageBFinal = applyForcedRemnantShaping(
        rawBatchState,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        variantCtx,
        strategy
      );
      stageBEvalCtx = variantCtx;
    } else {
      let combined = combineBatchAndTailState(
        rawBatchState,
        batchSplit.batchSize,
        variantCtx,
        stageBFullCtx,
        stageBStock,
        batchSplit.tailDemand,
        stageBUserSettings,
        strategy,
        tailCache
      );
      let untouchedBatchHint: readonly CutCard[] | null = null;
      let hasFillControlWork = false;
      if (stageBUserSettings.fillControlEnabled) {
        const fcOutcome = applyBatchFillControl(
          combined,
          stageBStock,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
        combined = fcOutcome.state;
        untouchedBatchHint = fcOutcome.untouchedBatchCards;
        hasFillControlWork = fcOutcome.hasSinglePoolWork;
      }
      combined = consolidateUnifiedSinglePool(
        combined,
        batchSplit.batchSize,
        untouchedBatchHint,
        hasFillControlWork,
        stageBStock,
        stageBUserSettings,
        stageBFullCtx,
        strategy
      );
      combined = applyForcedRemnantShaping(
        combined,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        stageBFullCtx,
        strategy
      );
      stageBFinal = combined;
      stageBEvalCtx = stageBFullCtx;
    }
    if (stageA) {
      return {
        state: mergeLockedRemnantsWithStageB(stageA, stageBFinal, stageBEvalCtx, fullCtx, strategy),
        evalCtx: fullCtx,
      };
    }
    return { state: stageBFinal, evalCtx: stageBEvalCtx };
  };

  // 1. Baseline run: MinimizeMaterialStrategy (runs ONCE)
  const baseRunStart = performance.now();
  const baseFinalBatch = runCuttingPipeline(initialState, matStrategy);
  const baseRunDurationMs = Number((performance.now() - baseRunStart).toFixed(1));
  const { state: baseFinalFull, evalCtx: baseEvalCtx } = finalizeVariantState(
    baseFinalBatch,
    baseCtx,
    matStrategy
  );
  const baseSol = buildSolutionFromFinalState(
    baseFinalFull,
    baseEvalCtx,
    stockInput,
    demandInput,
    baseSettings,
    startMemoryMb,
    baseRunStart
  );

  const mStar = baseSol.totalStockLength;
  const c0 = baseSol.rows.length;
  const primaryStdLen = resolvePrimaryStandardBarLength(baseSol, fullCtx, stockInput);
  const lockedRemnantMmBaseline = stageA ? stageA.lockedRemnantMm : 0;
  const tailStockMmBaseline = batchSplit
    ? baseFinalFull.cards.reduce((s, c) => (c.isTailSingle ? s + c.barSize * c.count : s), 0)
    : 0;
  const toBatchCapMm = (totalCapMm: number): number => {
    const remCap = Math.max(0, totalCapMm - lockedRemnantMmBaseline - tailStockMmBaseline);
    return batchSplit ? Math.floor(remCap / batchSplit.batchSize) : remCap;
  };

  const timings: BalanceRunTiming[] = [
    {
      label: 'Минимум материала',
      capMm: mStar,
      durationMs: baseRunDurationMs,
      stockMm: baseSol.totalStockLength,
      bars: baseSol.totalBarsUsed,
      cards: c0,
    },
  ];

  const candidates: Array<{ solution: FullOptimizationSolution; isBaseline: boolean }> = [
    { solution: baseSol, isBaseline: true },
  ];
  const probedCaps = new Set<number>([mStar]);
  const probeHistory: Array<{ capMm: number; cards: number }> = [{ capMm: mStar, cards: c0 }];
  let totalRunsExecuted = 1;

  // 2. Extreme setups run: MinimizeSetupsStrategy (runs ONCE)
  let mSetups = mStar;
  let cSetups = c0;
  if (!options?.shouldAbort?.()) {
    const setupsStart = performance.now();
    const setupsCtx: CutContext = {
      ...baseCtx,
      startTime: setupsStart,
      onProgress: (p) => {
        options?.onProgress?.({
          ...p,
          stage: 2,
          totalStages: 6,
          stageName: 'Баланс: минимум наладок',
          percent: Math.min(45, 25 + Math.round(p.percent * 0.2)),
        });
      },
    };
    const setupsBatch = runCuttingPipeline(
      { ...initialState, context: setupsCtx },
      setupsStrategy
    );
    const setupsDurationMs = Number((performance.now() - setupsStart).toFixed(1));
    const { state: setupsFull, evalCtx: setupsEvalCtx } = finalizeVariantState(
      setupsBatch,
      setupsCtx,
      setupsStrategy
    );
    const setupsSol = buildSolutionFromFinalState(
      setupsFull,
      setupsEvalCtx,
      stockInput,
      demandInput,
      baseSettings,
      startMemoryMb,
      setupsStart
    );
    totalRunsExecuted++;
    mSetups = setupsSol.totalStockLength;
    cSetups = setupsSol.rows.length;
    probedCaps.add(mSetups);
    probeHistory.push({ capMm: mSetups, cards: cSetups });
    candidates.push({ solution: setupsSol, isBaseline: false });
    timings.push({
      label: 'Минимум наладок',
      capMm: mSetups,
      durationMs: setupsDurationMs,
      stockMm: mSetups,
      bars: setupsSol.totalBarsUsed,
      cards: cSetups,
    });
  }

  // 3. If C_s < C0, run fixed tolerances < M_s, then adaptive bisection midpoints (<= 9 runs total)
  const balanceCtx: CutContext = {
    ...baseCtx,
    startTime: performance.now(),
    onProgress: (p) => {
      options?.onProgress?.({
        ...p,
        stage: 3,
        totalStages: 6,
        stageName: 'Баланс: подбор промежуточных точек',
        percent: Math.min(72, 45 + Math.round(p.percent * 0.27)),
      });
    },
  };
  const balanceInitial: CutState = {
    ...initialState,
    context: balanceCtx,
  };

  if (cSetups < c0 && !options?.shouldAbort?.()) {
    const fixedTolerances: Array<{ p: number; label: string }> = [
      { p: 0.001, label: '+0,1%' },
      { p: 0.005, label: '+0,5%' },
      { p: 0.01, label: '+1%' },
      { p: 0.02, label: '+2%' },
    ];

    const capMap = new Map<number, { capMm: number; label: string }>();
    for (const def of fixedTolerances) {
      const delta = Math.max(Math.round(mStar * def.p), primaryStdLen);
      const capMm = mStar + delta;
      if (capMm < mSetups && !probedCaps.has(capMm) && !capMap.has(capMm)) {
        capMap.set(capMm, { capMm, label: def.label });
      }
    }

    const maxFixedAllowed = Math.max(0, 9 - totalRunsExecuted);
    const fixedEntries = Array.from(capMap.values())
      .sort((a, b) => a.capMm - b.capMm)
      .slice(0, maxFixedAllowed);

    if (fixedEntries.length > 0 && !options?.shouldAbort?.()) {
      for (const e of fixedEntries) probedCaps.add(e.capMm);
      const capsForPipeline = fixedEntries.map((e) => toBatchCapMm(e.capMm));

      let capStageStart = performance.now();
      runMultiCapBalancePipelines(
        balanceInitial,
        baseFinalBatch,
        capsForPipeline,
        (idx) => {
          capStageStart = performance.now();
          const pct = Math.min(82, 72 + Math.round(((idx + 0.5) / fixedEntries.length) * 10));
          options?.onProgress?.({
            stage: 4,
            totalStages: 6,
            stageName: `Баланс: допуск ${fixedEntries[idx].label}`,
            stageStepName: `Оптимизация карт при допуске ${fixedEntries[idx].label}`,
            percent: pct,
            placedParts: fullCtx.totalPartsCount,
            totalParts: fullCtx.totalPartsCount,
            usedBars: baseSol.totalBarsUsed,
            totalBarsEstimate: fullCtx.totalBarsEstimate,
            bestKIM: baseSol.overallKIM,
            uniqueCardsCount: c0,
            elapsedMs: Math.round(performance.now() - suiteStart),
          });
        },
        (idx, _total, resState, stage3DurationMs) => {
          const { state: resFull, evalCtx: resEvalCtx } = finalizeVariantState(
            resState,
            balanceCtx,
            setupsStrategy
          );
          const sol = buildSolutionFromFinalState(
            resFull,
            resEvalCtx,
            stockInput,
            demandInput,
            baseSettings,
            startMemoryMb,
            capStageStart
          );
          const reportedDurationMs =
            idx === 0
              ? Number((resState.telemetryCounters.stage2Ms + stage3DurationMs).toFixed(1))
              : stage3DurationMs;
          const capMm = fixedEntries[idx].capMm;
          probeHistory.push({ capMm, cards: sol.rows.length });
          timings.push({
            label: fixedEntries[idx].label,
            capMm,
            durationMs: reportedDurationMs,
            stockMm: sol.totalStockLength,
            bars: sol.totalBarsUsed,
            cards: sol.rows.length,
          });
          candidates.push({ solution: sol, isBaseline: false });
        }
      );
      totalRunsExecuted += fixedEntries.length;
    }

    // 4. Adaptive interval splitting (up to 4 additional midpoint points, total <= 9 runs)
    let adaptiveDone = 0;
    while (adaptiveDone < 4 && totalRunsExecuted < 9 && !options?.shouldAbort?.()) {
      const frontier = buildParetoFrontier(candidates);
      let bestCapMid: number | null = null;
      let bestCardDrop = 1;
      let bestSpan = 0;

      for (let i = 0; i < frontier.length - 1; i++) {
        const leftSol = frontier[i].solution;
        const rightSol = frontier[i + 1].solution;
        const cardDrop = leftSol.rows.length - rightSol.rows.length;
        if (cardDrop < 2) continue;

        let effectiveLeft = leftSol.totalStockLength;
        for (const pr of probeHistory) {
          if (
            pr.capMm > effectiveLeft &&
            pr.capMm < rightSol.totalStockLength &&
            pr.cards >= leftSol.rows.length
          ) {
            effectiveLeft = pr.capMm;
          }
        }

        const span = rightSol.totalStockLength - effectiveLeft;
        if (span < primaryStdLen) continue;

        let capMid =
          Math.round((effectiveLeft + rightSol.totalStockLength) / 2 / primaryStdLen) *
          primaryStdLen;
        if (capMid <= effectiveLeft) capMid = effectiveLeft + primaryStdLen;
        if (capMid >= rightSol.totalStockLength) capMid = rightSol.totalStockLength - primaryStdLen;
        if (capMid <= effectiveLeft || capMid >= rightSol.totalStockLength) continue;
        if (probedCaps.has(capMid)) continue;

        if (cardDrop > bestCardDrop || (cardDrop === bestCardDrop && span > bestSpan)) {
          bestCardDrop = cardDrop;
          bestSpan = span;
          bestCapMid = capMid;
        }
      }

      if (bestCapMid === null) break;
      probedCaps.add(bestCapMid);

      const midCap = bestCapMid;
      const midLabel = `Бисекция #${adaptiveDone + 1}`;
      const capForPipe = toBatchCapMm(midCap);
      let midStageStart = performance.now();
      const midCtx: CutContext = {
        ...balanceCtx,
        startTime: midStageStart,
        onProgress: undefined,
      };

      runMultiCapBalancePipelines(
        { ...balanceInitial, context: midCtx },
        baseFinalBatch,
        [capForPipe],
        () => {
          midStageStart = performance.now();
          const pct = Math.min(97, 83 + adaptiveDone * 3);
          options?.onProgress?.({
            stage: 5,
            totalStages: 6,
            stageName: `Баланс: адаптивный поиск (${adaptiveDone + 1}/4)`,
            stageStepName: `Уточнение границы расхода (${Math.round(midCap / 1000)} м)`,
            percent: pct,
            placedParts: fullCtx.totalPartsCount,
            totalParts: fullCtx.totalPartsCount,
            usedBars: baseSol.totalBarsUsed,
            totalBarsEstimate: fullCtx.totalBarsEstimate,
            bestKIM: baseSol.overallKIM,
            uniqueCardsCount: c0,
            elapsedMs: Math.round(performance.now() - suiteStart),
          });
        },
        (_idx, _total, resState, stage3DurationMs) => {
          const { state: resFull, evalCtx: resEvalCtx } = finalizeVariantState(
            resState,
            midCtx,
            setupsStrategy
          );
          const sol = buildSolutionFromFinalState(
            resFull,
            resEvalCtx,
            stockInput,
            demandInput,
            baseSettings,
            startMemoryMb,
            midStageStart
          );
          const reportedDurationMs = Number(
            (resState.telemetryCounters.stage2Ms + stage3DurationMs).toFixed(1)
          );
          probeHistory.push({ capMm: midCap, cards: sol.rows.length });
          timings.push({
            label: midLabel,
            capMm: midCap,
            durationMs: reportedDurationMs,
            stockMm: sol.totalStockLength,
            bars: sol.totalBarsUsed,
            cards: sol.rows.length,
          });
          candidates.push({ solution: sol, isBaseline: false });
        }
      );

      adaptiveDone++;
      totalRunsExecuted++;
    }
  }

  // 5. Final strict non-dominated Pareto filtering
  const nonDominated = buildParetoFrontier(candidates);

  // 6. Label variants cleanly
  const suite: SuiteItem[] = nonDominated.map((item, idx) => {
    const cardsCount = item.solution.rows.length;
    if (nonDominated.length === 1) {
      return {
        goal: 'balance',
        title: 'Баланс',
        badge: '⚖️ Баланс',
        description: 'Оптимальный вариант по расходу материала и числу карт раскроя',
        solution: item.solution,
      };
    }

    if (idx === 0) {
      return {
        goal: 'balance',
        title: 'Минимум материала',
        badge: 'Мин. материал',
        description: 'Базовый вариант с минимальным расходом материала',
        solution: item.solution,
      };
    }

    const baseVariant = nonDominated[0].solution;
    const deltaStockMm = item.solution.totalStockLength - baseVariant.totalStockLength;
    const rawDeltaBars = item.solution.totalBarsUsed - baseVariant.totalBarsUsed;
    const deltaBars =
      rawDeltaBars > 0
        ? rawDeltaBars
        : Math.max(1, Math.round(deltaStockMm / primaryStdLen));
    const pct =
      baseVariant.totalStockLength > 0
        ? (deltaStockMm / baseVariant.totalStockLength) * 100
        : 0;
    const pctStr = formatTolerancePct(pct);

    return {
      goal: 'balance',
      title: `+${deltaBars} заготовок (+${pctStr}%), ${cardsCount} карт`,
      badge: `⚖️ +${deltaBars} загот. (+${pctStr}%)`,
      description: `Допуск по материалу +${pctStr}% (+${(deltaStockMm / 1000).toFixed(2)} м): сокращение до ${cardsCount} карт раскроя`,
      solution: item.solution,
    };
  });

  const totalDurationMs = Number((performance.now() - suiteStart).toFixed(1));
  const bestSolution = suite[0]?.solution || baseSol;
  return { suite, bestSolution, timings, totalDurationMs };
}

export function solveLinearCutting(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  options?: SolveLinearCuttingOptions
): FullOptimizationSolution {
  if (settings.optimizationGoal === 'balance') {
    const res = runBalanceSuite(stockInput, demandInput, settings, options);
    return res.bestSolution;
  }

  const startMemoryMb = getMemoryUsageMb();
  const isBatchMode = settings.dualProfileCut === true;
  // Пакетный режим моделируется делённой спецификацией, поэтому в расчёте контекст идёт без dualProfileCut
  const effSettings: AppSettings = isBatchMode ? { ...settings, dualProfileCut: false } : settings;
  const fullCtx = buildCutContext(stockInput, demandInput, effSettings, options);

  if (fullCtx.scaledDemand.length === 0 || fullCtx.scaledStockAll.length === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      maxReusableRemnantLength: 0,
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
  }

  const strategy = getStrategy(settings.optimizationGoal, settings);
  const stageA = runPrioritizeRemnantsStageA(
    stockInput,
    demandInput,
    effSettings,
    fullCtx,
    options
  );
  const stageBStock = stageA ? stageA.standardStock : stockInput;
  const stageBDemand = stageA ? stageA.remainingDemand : demandInput;
  const stageBSettings = stageA ? stageA.stageBSettings : effSettings;
  const stageBUserSettings = stageA ? { ...settings, prioritizeRemnants: false } : settings;

  let finalState: CutState;
  const buildCtx: CutContext = fullCtx;

  if (stageA && stageBDemand.length === 0) {
    const lockedMetrics = calculateMetrics(stageA.lockedCards, fullCtx, []);
    finalState = {
      cards: stageA.lockedCards,
      metrics: lockedMetrics,
      unplacedScaled: [],
      score: strategy.score(stageA.lockedCards, lockedMetrics, fullCtx),
      context: fullCtx,
      telemetryCounters: {
        passesEvaluated: stageA.passesEvaluated,
        prunedPasses: stageA.prunedPasses,
        totalCombinationsChecked: stageA.totalCombinationsChecked,
        twoOptSwapIterations: 0,
        tailConsolidationCardsMerged: 0,
        initialCardsCount: lockedMetrics.uniqueCardsCount,
        stage1Ms: stageA.stage1Ms,
        stage2Ms: stageA.stage2Ms,
        stage3Ms: 0,
      },
    };
  } else {
    const stageBFullCtx = stageA
      ? buildCutContext(stageBStock, stageBDemand, stageBSettings, options)
      : fullCtx;
    const batchSplit = isBatchMode
      ? splitBatchAndTailInputs(
          stageBStock,
          stageBDemand,
          resolveBatchSize(stageBDemand, stageBUserSettings)
        )
      : null;

    let stageBState: CutState;

    if (batchSplit) {
      if (batchSplit.batchDemand.length === 0) {
        const tailRes = solveTailSingleCards(
          stageBStock,
          [],
          batchSplit.tailDemand,
          stageBUserSettings,
          strategy,
          stageBFullCtx,
          options?.shouldAbort
        );
        const tailCards = groupIdenticalCards(tailRes.cards, stageBFullCtx);
        const tailMetrics = calculateMetrics(
          tailCards,
          stageBFullCtx,
          tailRes.unplacedScaledFull
        );
        stageBState = applyForcedRemnantShaping(
          {
            cards: tailCards,
            metrics: tailMetrics,
            unplacedScaled: tailRes.unplacedScaledFull,
            score: strategy.score(tailCards, tailMetrics, stageBFullCtx),
            context: stageBFullCtx,
            telemetryCounters: {
              passesEvaluated: tailRes.passesEvaluated,
              prunedPasses: tailRes.prunedPasses,
              totalCombinationsChecked: tailRes.totalCombinationsChecked,
              twoOptSwapIterations: 0,
              tailConsolidationCardsMerged: 0,
              initialCardsCount: tailMetrics.uniqueCardsCount,
              stage1Ms: 0,
              stage2Ms: 0,
              stage3Ms: 0,
            },
          },
          stageBStock,
          stageBDemand,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
      } else {
        const batchCtx = buildCutContext(
          batchSplit.batchStock,
          batchSplit.batchDemand,
          stageBSettings,
          options
        );
        const emptyMetrics = calculateMetrics([], batchCtx, batchCtx.scaledDemand);
        const batchInitial: CutState = {
          cards: [],
          metrics: emptyMetrics,
          unplacedScaled: batchCtx.scaledDemand,
          score: -Infinity,
          context: batchCtx,
          telemetryCounters: {
            passesEvaluated: 0,
            prunedPasses: 0,
            totalCombinationsChecked: 0,
            twoOptSwapIterations: 0,
            tailConsolidationCardsMerged: 0,
            initialCardsCount: 0,
            stage1Ms: 0,
            stage2Ms: 0,
            stage3Ms: 0,
          },
        };
        const batchSolved = runCuttingPipeline(batchInitial, strategy);
        stageBState = combineBatchAndTailState(
          batchSolved,
          batchSplit.batchSize,
          batchCtx,
          stageBFullCtx,
          stageBStock,
          batchSplit.tailDemand,
          stageBUserSettings,
          strategy
        );
        let untouchedBatchHint: readonly CutCard[] | null = null;
        let hasFillControlWork = false;
        if (stageBUserSettings.fillControlEnabled) {
          const fcOutcome = applyBatchFillControl(
            stageBState,
            stageBStock,
            stageBUserSettings,
            stageBFullCtx,
            strategy
          );
          stageBState = fcOutcome.state;
          untouchedBatchHint = fcOutcome.untouchedBatchCards;
          hasFillControlWork = fcOutcome.hasSinglePoolWork;
        }
        stageBState = consolidateUnifiedSinglePool(
          stageBState,
          batchSplit.batchSize,
          untouchedBatchHint,
          hasFillControlWork,
          stageBStock,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
        stageBState = applyForcedRemnantShaping(
          stageBState,
          stageBStock,
          stageBDemand,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
      }
    } else {
      const emptyMetrics = calculateMetrics([], stageBFullCtx, stageBFullCtx.scaledDemand);
      const initialState: CutState = {
        cards: [],
        metrics: emptyMetrics,
        unplacedScaled: stageBFullCtx.scaledDemand,
        score: -Infinity,
        context: stageBFullCtx,
        telemetryCounters: {
          passesEvaluated: 0,
          prunedPasses: 0,
          totalCombinationsChecked: 0,
          twoOptSwapIterations: 0,
          tailConsolidationCardsMerged: 0,
          initialCardsCount: 0,
          stage1Ms: 0,
          stage2Ms: 0,
          stage3Ms: 0,
        },
      };
      stageBState = runCuttingPipeline(initialState, strategy);
      stageBState = applyForcedRemnantShaping(
        stageBState,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        stageBFullCtx,
        strategy
      );
    }

    finalState = stageA
      ? mergeLockedRemnantsWithStageB(stageA, stageBState, stageBFullCtx, fullCtx, strategy)
      : stageBState;
  }

  // Final Stage 3 completion progress report using the exact Single Source of Truth metrics
  buildCtx.onProgress?.({
    stage: 3,
    totalStages: 3,
    stageName: 'Формирование финальной раскладки',
    stageStepName: 'Группировка карт и расчет итогового баланса',
    percent: 99,
    placedParts: buildCtx.totalPartsCount - finalState.metrics.unplacedCount,
    totalParts: buildCtx.totalPartsCount,
    usedBars: finalState.metrics.totalBarsUsed,
    totalBarsEstimate: buildCtx.totalBarsEstimate,
    bestKIM: finalState.metrics.overallKIM,
    uniqueCardsCount: finalState.metrics.uniqueCardsCount,
    elapsedMs: Math.round(performance.now() - buildCtx.startTime),
    hasMeasurableProgress: false,
  });

  return buildSolutionFromFinalState(
    finalState,
    buildCtx,
    stockInput,
    demandInput,
    settings,
    startMemoryMb,
    buildCtx.startTime
  );
}

export const PARALLEL_MIN_PASSES_THRESHOLD = PASS_CHUNK_SIZE * 2;
export const PARALLEL_MIN_ESTIMATED_SECONDS = 3;

/**
 * Computes auto helper worker count N = min(navigator.hardwareConcurrency - 1, 6).
 */
export function getAvailableHelperThreadLimit(): number {
  if (typeof navigator === 'undefined') return 0;
  const cores =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 1;
  return Math.max(0, Math.min(cores - 1, 6));
}

export function getMaxHelperThreads(): number {
  if (typeof Worker === 'undefined') return 0;
  return getAvailableHelperThreadLimit();
}

/**
 * Determines whether Stage-2 pass search should run via worker pool:
 * - Only when settings.multiThreadEnabled === true and searchSpeed === 'deep'
 * - Only for MinimizeMaterialStrategy (or Balance baseline front)
 * - Requires N >= 2 hardware threads and workload above ~3s small-order threshold
 */
export function shouldUseParallelPassSearch(
  ctx: CutContext,
  strategy: CuttingStrategy,
  stockInput: StockItem[],
  demandInput: DemandItem[]
): boolean {
  if (ctx.settings.multiThreadEnabled !== true) return false;
  if (ctx.settings.searchSpeed !== 'deep') return false;
  if (strategy.type !== 'min_material' && strategy.type !== 'forced_remnant_shaping') {
    return false;
  }
  if (getAvailableHelperThreadLimit() < 2) return false;

  const totalPasses = (ctx.maxSortZ + 1) * (ctx.maxSort + 1) * (ctx.maxVar + 1);
  if (totalPasses < PARALLEL_MIN_PASSES_THRESHOLD) return false;

  const complexity = estimateCalculationComplexity(stockInput, demandInput, ctx.settings);
  const estSeconds =
    complexity.isHeavy && ctx.totalPartsCount >= 100
      ? complexity.estimatedSeconds.deep
      : totalPasses * ctx.totalPartsCount * (1 + complexity.uniqueParts * 0.03) * 0.00002;

  return estSeconds >= PARALLEL_MIN_ESTIMATED_SECONDS;
}

export function toSerializableCutContext(ctx: CutContext): SerializableCutContext {
  const copy: CutContext = { ...ctx };
  delete (copy as { onProgress?: unknown }).onProgress;
  delete (copy as { shouldAbort?: unknown }).shouldAbort;
  return copy;
}

export interface ParallelPassSearchRequest {
  context: SerializableCutContext;
  strategyType: StrategyType;
  materialCapMm?: number;
  cutoffMm?: number;
  totalPasses: number;
  profiles: readonly PassSearchProfile[];
}

export interface WorkerPoolProgressInfo {
  completedPasses: number;
  totalPasses: number;
  chunksCompleted: number;
  totalChunks: number;
  threadsUsed: number;
}

export interface ParallelPassSearchResult {
  merged: MergedPassResults;
  threadsUsed: number;
  chunksProcessed: number;
  nestedUnsupported?: boolean;
}

export type ParallelPassExecutor = (
  request: ParallelPassSearchRequest,
  onProgress?: (progress: WorkerPoolProgressInfo) => void
) => Promise<ParallelPassSearchResult | null>;

let globalParallelJobSeq = 0;

interface WorkerChunkTask {
  chunkId: number;
  fromPass: number;
  toPass: number;
}

/**
 * Executes Stage-2 pass chunks across a pool of reusable helper Web Workers.
 * - Spawns helpers sequentially up to maxHelpers while immediately dispatching chunks to ready helpers.
 * - Soft-stops cleanly on shouldAbort (waits for in-flight chunks, merges finished results).
 * - Recovers from helper crashes by re-queuing chunks and falling back to sequential if 0 helpers survive.
 * - Never terminates living helpers mid-run (helpers remain reusable in poolCache until page unload).
 */
export async function executeWorkerPool(options: {
  poolCache: Worker[];
  createWorker: () => Worker;
  request: ParallelPassSearchRequest;
  maxHelpers: number;
  shouldAbort?: () => boolean;
  onProgress?: (progress: WorkerPoolProgressInfo) => void;
}): Promise<ParallelPassSearchResult> {
  const { poolCache, createWorker, request, maxHelpers, shouldAbort, onProgress } = options;
  const { totalPasses, profiles, context, strategyType, materialCapMm, cutoffMm } = request;

  const chunks: WorkerChunkTask[] = [];
  for (let f = 0, id = 0; f < totalPasses; f += PASS_CHUNK_SIZE, id++) {
    chunks.push({
      chunkId: id,
      fromPass: f,
      toPass: Math.min(totalPasses, f + PASS_CHUNK_SIZE),
    });
  }

  if (chunks.length === 0) {
    return {
      merged: mergePassResults([]),
      threadsUsed: 1,
      chunksProcessed: 0,
      nestedUnsupported: false,
    };
  }

  const targetHelpers = Math.min(Math.max(1, maxHelpers), chunks.length);
  const jobId = ++globalParallelJobSeq;

  let nextChunkIdx = 0;
  const retryQueue: WorkerChunkTask[] = [];
  const results: PassRangeExecutionResult[] = [];
  let completedPasses = 0;
  let inFlightCount = 0;
  let earliestEarlyExit: number | null = null;
  let maxThreadsUsed = 0;
  let anyChunkCompleted = false;
  let spawningActive = true;
  let resolved = false;

  const aliveWorkers = new Set<Worker>();
  const workerInFlight = new Map<Worker, WorkerChunkTask | null>();

  const takeNextChunk = (): WorkerChunkTask | null => {
    if (shouldAbort?.()) return null;
    while (retryQueue.length > 0) {
      const c = retryQueue.shift();
      if (c && (earliestEarlyExit === null || c.fromPass <= earliestEarlyExit)) {
        return c;
      }
    }
    while (nextChunkIdx < chunks.length) {
      const c = chunks[nextChunkIdx++];
      if (earliestEarlyExit !== null && c.fromPass > earliestEarlyExit) {
        nextChunkIdx = chunks.length;
        return null;
      }
      return c;
    }
    return null;
  };

  const hasPendingWork = (): boolean => {
    if (shouldAbort?.()) return false;
    for (let i = 0; i < retryQueue.length; i++) {
      if (earliestEarlyExit === null || retryQueue[i].fromPass <= earliestEarlyExit) {
        return true;
      }
    }
    if (nextChunkIdx < chunks.length) {
      const c = chunks[nextChunkIdx];
      if (earliestEarlyExit === null || c.fromPass <= earliestEarlyExit) {
        return true;
      }
    }
    return false;
  };

  const runRemainingSequentially = () => {
    const localCtx: CutContext = {
      ...context,
      shouldAbort,
    };
    const localStrategy: CuttingStrategy =
      strategyType === 'balance' && materialCapMm !== undefined
        ? new MinimizeBalanceStrategy(materialCapMm)
        : strategyType === 'forced_remnant_shaping'
          ? new ForcedRemnantShapingStrategy(cutoffMm ?? 0)
          : getStrategy(strategyType, context.settings);

    while (true) {
      const c = takeNextChunk();
      if (!c) break;
      const res = executePassRange(localCtx, localStrategy, c.fromPass, c.toPass, profiles);
      results.push(res);
      completedPasses += res.passesEvaluated;
      if (
        res.earlyExitPassIndex !== null &&
        (earliestEarlyExit === null || res.earlyExitPassIndex < earliestEarlyExit)
      ) {
        earliestEarlyExit = res.earlyExitPassIndex;
      }
      onProgress?.({
        completedPasses,
        totalPasses,
        chunksCompleted: results.length,
        totalChunks: chunks.length,
        threadsUsed: Math.max(1, maxThreadsUsed),
      });
    }
  };

  return new Promise<ParallelPassSearchResult>((resolve) => {
    const finalize = (nestedUnsupported: boolean) => {
      if (resolved) return;
      resolved = true;
      for (const w of aliveWorkers) {
        w.onmessage = null;
        w.onerror = null;
      }
      const merged = mergePassResults(results);
      resolve({
        merged,
        threadsUsed: nestedUnsupported ? 1 : Math.max(1, maxThreadsUsed),
        chunksProcessed: results.length,
        nestedUnsupported,
      });
    };

    const checkDone = () => {
      if (resolved) return;
      if (inFlightCount > 0) return;

      if (hasPendingWork()) {
        if (!spawningActive && aliveWorkers.size === 0) {
          runRemainingSequentially();
          finalize(false);
        }
        return;
      }

      if (!spawningActive || shouldAbort?.() || earliestEarlyExit !== null || !hasPendingWork()) {
        finalize(false);
      }
    };

    const dispatchToWorker = (w: Worker) => {
      if (resolved || !aliveWorkers.has(w)) return;
      if (workerInFlight.get(w)) return;
      const chunk = takeNextChunk();
      if (!chunk) {
        checkDone();
        return;
      }
      workerInFlight.set(w, chunk);
      inFlightCount++;
      const msg: PassWorkerInMessage = {
        type: 'RUN_CHUNK',
        payload: {
          jobId,
          chunkId: chunk.chunkId,
          fromPass: chunk.fromPass,
          toPass: chunk.toPass,
          profiles,
        },
      };
      w.postMessage(msg);
    };

    const dispatchToIdleWorkers = () => {
      for (const w of aliveWorkers) {
        if (!workerInFlight.get(w)) {
          dispatchToWorker(w);
        }
      }
    };

    const handleWorkerFailure = (w: Worker, isStartupZero: boolean) => {
      aliveWorkers.delete(w);
      const poolIdx = poolCache.indexOf(w);
      if (poolIdx !== -1) {
        poolCache.splice(poolIdx, 1);
      }
      w.onmessage = null;
      w.onerror = null;

      const assigned = workerInFlight.get(w);
      workerInFlight.set(w, null);
      if (assigned) {
        inFlightCount = Math.max(0, inFlightCount - 1);
        retryQueue.push(assigned);
      }

      if (isStartupZero && !anyChunkCompleted && aliveWorkers.size === 0) {
        spawningActive = false;
        finalize(true);
        return;
      }

      if (aliveWorkers.size > 0) {
        dispatchToIdleWorkers();
      } else if (!spawningActive && inFlightCount === 0) {
        runRemainingSequentially();
        finalize(false);
      }
    };

    const initHelperSequentially = (index: number): Promise<boolean> => {
      return new Promise<boolean>((resolveInit) => {
        if (resolved || shouldAbort?.() || !hasPendingWork()) {
          resolveInit(false);
          return;
        }

        let w: Worker;
        let createdNew = false;
        if (index < poolCache.length) {
          w = poolCache[index];
        } else {
          try {
            w = createWorker();
            createdNew = true;
          } catch {
            if (index === 0 && !anyChunkCompleted && poolCache.length === 0) {
              finalize(true);
            }
            resolveInit(false);
            return;
          }
        }

        let initSettled = false;

        w.onerror = () => {
          if (!initSettled) {
            initSettled = true;
            handleWorkerFailure(w, index === 0);
            resolveInit(false);
            return;
          }
          handleWorkerFailure(w, false);
        };

        w.onmessage = (ev: MessageEvent<PassWorkerOutMessage>) => {
          const msg = ev.data;
          if (!msg) return;

          if (msg.type === 'INIT_OK') {
            if (msg.payload.jobId !== jobId) return;
            if (!initSettled) {
              initSettled = true;
              if (createdNew) {
                poolCache.push(w);
              }
              aliveWorkers.add(w);
              maxThreadsUsed = Math.max(maxThreadsUsed, aliveWorkers.size);
              workerInFlight.set(w, null);
              dispatchToWorker(w);
              resolveInit(true);
            }
            return;
          }

          if (msg.type === 'CHUNK_DONE') {
            if (msg.payload.jobId !== jobId) return;
            anyChunkCompleted = true;
            const assigned = workerInFlight.get(w);
            workerInFlight.set(w, null);
            if (assigned) {
              inFlightCount = Math.max(0, inFlightCount - 1);
            }

            const chunkRes = msg.payload.result;
            results.push(chunkRes);
            completedPasses += chunkRes.passesEvaluated;
            if (
              chunkRes.earlyExitPassIndex !== null &&
              (earliestEarlyExit === null || chunkRes.earlyExitPassIndex < earliestEarlyExit)
            ) {
              earliestEarlyExit = chunkRes.earlyExitPassIndex;
            }
            onProgress?.({
              completedPasses,
              totalPasses,
              chunksCompleted: results.length,
              totalChunks: chunks.length,
              threadsUsed: Math.max(1, maxThreadsUsed, aliveWorkers.size),
            });
            dispatchToWorker(w);
            return;
          }

          if (msg.type === 'ERROR') {
            if (msg.payload.jobId !== jobId) return;
            if (!initSettled) {
              initSettled = true;
              handleWorkerFailure(w, index === 0);
              resolveInit(false);
              return;
            }
            handleWorkerFailure(w, false);
          }
        };

        const initMsg: PassWorkerInMessage = {
          type: 'INIT',
          payload: {
            jobId,
            context,
            strategyType,
            materialCapMm,
            cutoffMm,
          },
        };
        w.postMessage(initMsg);
      });
    };

    void (async () => {
      for (let i = 0; i < targetHelpers; i++) {
        if (resolved || shouldAbort?.() || !hasPendingWork()) break;
        const ok = await initHelperSequentially(i);
        if (!ok && i === 0 && resolved) return;
        if (!ok && aliveWorkers.size === 0) break;
      }
      spawningActive = false;
      if (!resolved) {
        dispatchToIdleWorkers();
        checkDone();
      }
    })();
  });
}

async function runStage2AndRefineMaybeParallel(
  initialState: CutState,
  strategy: CuttingStrategy,
  stockInput: StockItem[],
  demandInput: DemandItem[],
  profiles: readonly PassSearchProfile[],
  parallelExecutor?: ParallelPassExecutor,
  allowExactSolver = false
): Promise<{ finalState: CutState; merged: MergedPassResults | null }> {
  const ctx = initialState.context;
  const totalPasses = (ctx.maxSortZ + 1) * (ctx.maxSort + 1) * (ctx.maxVar + 1);
  const isShaping = strategy instanceof ForcedRemnantShapingStrategy;
  const isShapingPlanned =
    !isShaping && ctx.settings.shapeRemnantsInSearch === true && ctx.reusableRemnantMin > 0;
  const pctMin = isShaping ? 65 : 5;
  const pctMax = isShaping ? 90 : isShapingPlanned ? 65 : 90;

  const useExactLp =
    allowExactSolver &&
    !isShaping &&
    strategy.type === 'min_material' &&
    !ctx.settings.dualProfileCut &&
    isExactSolverActive(ctx.settings);

  let workCtx: CutContext = ctx;
  let workInitialState: CutState = initialState;
  let lpResult: ReturnType<typeof computeLpCandidate> = null;

  if (useExactLp && !ctx.shouldAbort?.()) {
    const solver = await loadHighsSolver();
    if (solver && !ctx.shouldAbort?.()) {
      lpResult = computeLpCandidate(ctx, solver);
      if (lpResult?.lpMinBarsLowerBound !== undefined && lpResult.lpMinBarsLowerBound > 0) {
        workCtx = {
          ...ctx,
          lpMinBarsLowerBound: lpResult.lpMinBarsLowerBound,
        };
        workInitialState = {
          ...initialState,
          context: workCtx,
        };
      }
    }
  }

  let passFinalState: CutState;
  let merged: MergedPassResults | null = null;

  if (parallelExecutor && shouldUseParallelPassSearch(workCtx, strategy, stockInput, demandInput)) {
    const stage1End = performance.now();
    const stage1Ms = Math.max(0, Number((stage1End - workCtx.startTime).toFixed(1)));
    const totalChunks = Math.ceil(totalPasses / PASS_CHUNK_SIZE);
    const plannedThreads = Math.min(Math.max(1, getAvailableHelperThreadLimit()), Math.max(1, totalChunks));

    if (isShaping) {
      workCtx.onProgress?.({
        stage: 3,
        totalStages: 3,
        stageName: 'Формирование деловых остатков',
        stageStepName: `Запуск многопоточного перебора (${totalPasses} проходов)`,
        percent: 65,
        placedParts: 0,
        totalParts: workCtx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: workCtx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1End - workCtx.startTime),
        viewedPasses: 0,
        totalPasses,
        workerThreadCount: plannedThreads,
        chunksCompleted: 0,
        totalChunks,
        hasMeasurableProgress: true,
      });
    } else {
      workCtx.onProgress?.({
        stage: 1,
        totalStages: 3,
        stageName: 'Анализ спецификации и подготовка заготовок',
        percent: 5,
        placedParts: 0,
        totalParts: workCtx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: workCtx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1End - workCtx.startTime),
        hasMeasurableProgress: false,
      });
      workCtx.onProgress?.({
        stage: 2,
        totalStages: 3,
        stageName: `Многопоточный перебор схем реза (0/${totalPasses})`,
        stageStepName: `Запуск потоков (${totalPasses} проходов)`,
        percent: 5,
        placedParts: 0,
        totalParts: workCtx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: workCtx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1End - workCtx.startTime),
        viewedPasses: 0,
        totalPasses,
        workerThreadCount: plannedThreads,
        chunksCompleted: 0,
        totalChunks,
        hasMeasurableProgress: true,
      });
    }

    const stage2Start = performance.now();
    const poolResult = await parallelExecutor(
      {
        context: toSerializableCutContext(workCtx),
        strategyType: strategy.type,
        materialCapMm: workCtx.materialCapMm,
        cutoffMm: isShaping ? strategy.cutoffMm : undefined,
        totalPasses,
        profiles,
      },
      ({ completedPasses, totalPasses: total, chunksCompleted, totalChunks: chunksTotal, threadsUsed }) => {
        const elapsed = performance.now() - workCtx.startTime;
        const pct = Math.min(
          pctMax,
          pctMin + Math.round((completedPasses / Math.max(1, total)) * (pctMax - pctMin))
        );
        workCtx.onProgress?.({
          stage: isShaping ? 3 : 2,
          totalStages: 3,
          stageName: isShaping
            ? 'Формирование деловых остатков'
            : `Многопоточный перебор схем реза (${completedPasses}/${total})`,
          stageStepName: `Обработано ${completedPasses} из ${total} проходов`,
          percent: pct,
          placedParts: workCtx.totalPartsCount,
          totalParts: workCtx.totalPartsCount,
          usedBars: 0,
          totalBarsEstimate: workCtx.totalBarsEstimate,
          bestKIM: 0,
          elapsedMs: Math.round(elapsed),
          viewedPasses: completedPasses,
          totalPasses: total,
          workerThreadCount: threadsUsed,
          chunksCompleted,
          totalChunks: chunksTotal,
          hasMeasurableProgress: true,
        });
      }
    );

    if (poolResult) {
      const stage2Ms = Math.max(0, Number((performance.now() - stage2Start).toFixed(1)));
      const baseState = buildBaseStateFromMergedPassResults(
        workCtx,
        poolResult.merged,
        stage1Ms,
        stage2Ms,
        totalPasses,
        poolResult.threadsUsed,
        poolResult.chunksProcessed
      );
      const abortedState: CutState =
        workCtx.shouldAbort?.() && !baseState.telemetryCounters.abortedDuringSearch
          ? {
              ...baseState,
              telemetryCounters: {
                ...baseState.telemetryCounters,
                abortedDuringSearch: true,
              },
            }
          : baseState;
      passFinalState = refineBaseStateWithPipeline(abortedState, strategy);
      merged = poolResult.merged;
    } else {
      passFinalState = runCuttingPipeline(workInitialState, strategy);
    }
  } else {
    passFinalState = runCuttingPipeline(workInitialState, strategy);
  }

  let finalState = passFinalState;
  if (
    useExactLp &&
    lpResult &&
    lpResult.cards.length > 0 &&
    !workCtx.shouldAbort?.() &&
    !passFinalState.telemetryCounters.abortedDuringSearch
  ) {
    const lpCards = groupIdenticalCards(lpResult.cards, workCtx);
    const lpMetrics = calculateMetrics(lpCards, workCtx, []);
    const lpBaseState: CutState = {
      cards: lpCards,
      metrics: lpMetrics,
      unplacedScaled: [],
      score: strategy.score(lpCards, lpMetrics, workCtx),
      context: workCtx,
      telemetryCounters: {
        ...passFinalState.telemetryCounters,
        twoOptSwapIterations: 0,
        tailConsolidationCardsMerged: 0,
        initialCardsCount: lpMetrics.uniqueCardsCount,
        stage3Ms: 0,
      },
    };
    const lpRefined = refineBaseStateWithPipeline(lpBaseState, strategy);
    if (lpRefined.score > passFinalState.score) {
      finalState = {
        ...lpRefined,
        telemetryCounters: {
          ...lpRefined.telemetryCounters,
          passesEvaluated: passFinalState.telemetryCounters.passesEvaluated,
          prunedPasses: passFinalState.telemetryCounters.prunedPasses,
          totalCombinationsChecked: passFinalState.telemetryCounters.totalCombinationsChecked,
          stage1Ms: passFinalState.telemetryCounters.stage1Ms,
          stage2Ms: passFinalState.telemetryCounters.stage2Ms,
          stage3Ms:
            passFinalState.telemetryCounters.stage3Ms +
            lpRefined.telemetryCounters.stage3Ms,
          threadsUsed: passFinalState.telemetryCounters.threadsUsed,
          chunksProcessed: passFinalState.telemetryCounters.chunksProcessed,
          totalPassesPlanned: passFinalState.telemetryCounters.totalPassesPlanned,
        },
      };
    }
  }

  return { finalState, merged };
}

function selectFrontPointForCap(
  front: readonly ParetoFrontPoint[],
  capMm: number
): ParetoFrontPoint | null {
  let chosen: ParetoFrontPoint | null = null;
  for (let i = 0; i < front.length; i++) {
    const pt = front[i];
    if (pt.totalStockLengthMm > capMm) break;
    if (
      !chosen ||
      pt.uniqueCardsCount < chosen.uniqueCardsCount ||
      (pt.uniqueCardsCount === chosen.uniqueCardsCount &&
        (pt.totalStockLengthMm < chosen.totalStockLengthMm ||
          (pt.totalStockLengthMm === chosen.totalStockLengthMm &&
            (pt.totalBarsUsed < chosen.totalBarsUsed ||
              (pt.totalBarsUsed === chosen.totalBarsUsed &&
                pt.totalWasteMm < chosen.totalWasteMm)))))
    ) {
      chosen = pt;
    }
  }
  return chosen;
}

export async function runBalanceSuiteAsync(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  baseSettings: AppSettings,
  options?: SolveLinearCuttingOptions,
  parallelExecutor?: ParallelPassExecutor
): Promise<BalanceResult> {
  const effSettings: AppSettings = {
    ...baseSettings,
    optimizationGoal: 'min_bars',
    dualProfileCut: false,
  };
  const suiteStart = performance.now();
  const startMemoryMb = getMemoryUsageMb();
  const fullCtx = buildCutContext(stockInput, demandInput, effSettings, {
    shouldAbort: options?.shouldAbort,
  });

  if (fullCtx.scaledDemand.length === 0 || fullCtx.scaledStockAll.length === 0) {
    return runBalanceSuite(stockInput, demandInput, baseSettings, options);
  }

  const stageA = runPrioritizeRemnantsStageA(
    stockInput,
    demandInput,
    effSettings,
    fullCtx,
    options
  );
  const stageBStock = stageA ? stageA.standardStock : stockInput;
  const stageBDemand = stageA ? stageA.remainingDemand : demandInput;
  const stageBSettings = stageA ? stageA.stageBSettings : effSettings;
  const stageBUserSettings = stageA ? { ...baseSettings, prioritizeRemnants: false } : baseSettings;
  const matStrategy = new MinimizeMaterialStrategy();
  const setupsStrategy = new MinimizeSetupsStrategy();

  if (stageA && stageBDemand.length === 0) {
    return runBalanceSuite(stockInput, demandInput, baseSettings, options);
  }

  const stageBFullCtx = stageA
    ? buildCutContext(stageBStock, stageBDemand, stageBSettings, {
        shouldAbort: options?.shouldAbort,
      })
    : fullCtx;

  const isBatchMode = baseSettings.dualProfileCut === true;
  const batchSplit = isBatchMode
    ? splitBatchAndTailInputs(
        stageBStock,
        stageBDemand,
        resolveBatchSize(stageBDemand, stageBUserSettings)
      )
    : null;

  if (batchSplit && batchSplit.batchDemand.length === 0) {
    return runBalanceSuite(stockInput, demandInput, baseSettings, options);
  }

  const checkCtx = batchSplit
    ? buildCutContext(batchSplit.batchStock, batchSplit.batchDemand, stageBSettings)
    : stageBFullCtx;
  const canParallel =
    !!parallelExecutor &&
    shouldUseParallelPassSearch(
      checkCtx,
      matStrategy,
      batchSplit ? batchSplit.batchStock : stageBStock,
      batchSplit ? batchSplit.batchDemand : stageBDemand
    );

  // Sync fast path when neither worker pool nor async HiGHS LP is needed
  if (!canParallel && (!isExactSolverActive(baseSettings) || isBatchMode)) {
    return runBalanceSuite(stockInput, demandInput, baseSettings, options);
  }

  const baseCtx = buildCutContext(
    batchSplit ? batchSplit.batchStock : stageBStock,
    batchSplit ? batchSplit.batchDemand : stageBDemand,
    stageBSettings,
    {
      shouldAbort: options?.shouldAbort,
      onProgress: (p) => {
        const isShapingSub =
          p.stage === 3 && p.stageName === 'Формирование деловых остатков';
        options?.onProgress?.({
          ...p,
          stage: 1,
          totalStages: 6,
          stageName: isShapingSub
            ? 'Баланс: формирование деловых остатков'
            : canParallel
              ? 'Баланс: многопоточный расчёт фронта'
              : 'Баланс: минимум материала',
          percent: Math.min(35, Math.max(2, Math.round(p.percent * 0.35))),
        });
      },
    }
  );

  const emptyMetrics = calculateMetrics([], baseCtx, baseCtx.scaledDemand);
  const initialState: CutState = {
    cards: [],
    metrics: emptyMetrics,
    unplacedScaled: baseCtx.scaledDemand,
    score: -Infinity,
    context: baseCtx,
    telemetryCounters: {
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: 0,
      stage1Ms: 0,
      stage2Ms: 0,
      stage3Ms: 0,
    },
  };

  const tailCache = new Map<
    string,
    {
      cards: CutCard[];
      unplacedScaledFull: number[];
      passesEvaluated: number;
      prunedPasses: number;
      totalCombinationsChecked: number;
    }
  >();

  const finalizeVariantStateAsync = async (
    rawBatchState: CutState,
    variantCtx: CutContext,
    strategy: CuttingStrategy
  ): Promise<{ state: CutState; evalCtx: CutContext }> => {
    let stageBFinal: CutState;
    let stageBEvalCtx: CutContext;
    if (!batchSplit) {
      stageBFinal = await applyForcedRemnantShapingAsync(
        rawBatchState,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        variantCtx,
        strategy,
        parallelExecutor
      );
      stageBEvalCtx = variantCtx;
    } else {
      let combined = combineBatchAndTailState(
        rawBatchState,
        batchSplit.batchSize,
        variantCtx,
        stageBFullCtx,
        stageBStock,
        batchSplit.tailDemand,
        stageBUserSettings,
        strategy,
        tailCache
      );
      let untouchedBatchHint: readonly CutCard[] | null = null;
      let hasFillControlWork = false;
      if (stageBUserSettings.fillControlEnabled) {
        const fcOutcome = applyBatchFillControl(
          combined,
          stageBStock,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
        combined = fcOutcome.state;
        untouchedBatchHint = fcOutcome.untouchedBatchCards;
        hasFillControlWork = fcOutcome.hasSinglePoolWork;
      }
      combined = consolidateUnifiedSinglePool(
        combined,
        batchSplit.batchSize,
        untouchedBatchHint,
        hasFillControlWork,
        stageBStock,
        stageBUserSettings,
        stageBFullCtx,
        strategy
      );
      combined = await applyForcedRemnantShapingAsync(
        combined,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        stageBFullCtx,
        strategy,
        parallelExecutor
      );
      stageBFinal = combined;
      stageBEvalCtx = stageBFullCtx;
    }

    if (stageA) {
      return {
        state: mergeLockedRemnantsWithStageB(stageA, stageBFinal, stageBEvalCtx, fullCtx, strategy),
        evalCtx: fullCtx,
      };
    }
    return { state: stageBFinal, evalCtx: stageBEvalCtx };
  };

  // 1. Baseline run (parallel Pareto-front or sequential + optional HiGHS LP) with MinimizeMaterialStrategy
  const baseRunStart = performance.now();
  const baseProfiles: PassSearchProfile[] = canParallel
    ? ['best', 'fastPrefix', 'stdPrefix', 'front']
    : resolveStandardPassProfiles(stageBSettings.searchSpeed);
  const { finalState: baseFinalBatch, merged: baseMerged } = await runStage2AndRefineMaybeParallel(
    initialState,
    matStrategy,
    batchSplit ? batchSplit.batchStock : stageBStock,
    batchSplit ? batchSplit.batchDemand : stageBDemand,
    baseProfiles,
    parallelExecutor,
    !isBatchMode
  );

  const baseRunDurationMs = Number((performance.now() - baseRunStart).toFixed(1));
  const { state: baseFinalFull, evalCtx: baseEvalCtx } = await finalizeVariantStateAsync(
    baseFinalBatch,
    baseCtx,
    matStrategy
  );
  const baseSol = buildSolutionFromFinalState(
    baseFinalFull,
    baseEvalCtx,
    stockInput,
    demandInput,
    baseSettings,
    startMemoryMb,
    baseRunStart
  );

  const mStar = baseSol.totalStockLength;
  const c0 = baseSol.rows.length;
  const primaryStdLen = resolvePrimaryStandardBarLength(baseSol, fullCtx, stockInput);
  const lockedRemnantMmBaseline = stageA ? stageA.lockedRemnantMm : 0;
  const tailStockMmBaseline = batchSplit
    ? baseFinalFull.cards.reduce((s, c) => (c.isTailSingle ? s + c.barSize * c.count : s), 0)
    : 0;
  const toBatchCapMm = (totalCapMm: number): number => {
    const remCap = Math.max(0, totalCapMm - lockedRemnantMmBaseline - tailStockMmBaseline);
    return batchSplit ? Math.floor(remCap / batchSplit.batchSize) : remCap;
  };

  const timings: BalanceRunTiming[] = [
    {
      label: 'Минимум материала',
      capMm: mStar,
      durationMs: baseRunDurationMs,
      stockMm: baseSol.totalStockLength,
      bars: baseSol.totalBarsUsed,
      cards: c0,
    },
  ];

  const candidates: Array<{ solution: FullOptimizationSolution; isBaseline: boolean }> = [
    { solution: baseSol, isBaseline: true },
  ];
  const probedCaps = new Set<number>([mStar]);
  const probeHistory: Array<{ capMm: number; cards: number }> = [{ capMm: mStar, cards: c0 }];
  let totalRunsExecuted = 1;

  // 2. Extreme setups run sequentially (MinimizeSetupsStrategy)
  let mSetups = mStar;
  let cSetups = c0;
  if (!options?.shouldAbort?.()) {
    const setupsStart = performance.now();
    const setupsCtx: CutContext = {
      ...baseCtx,
      startTime: setupsStart,
      onProgress: (p) => {
        options?.onProgress?.({
          ...p,
          stage: 2,
          totalStages: 6,
          stageName: 'Баланс: минимум наладок',
          percent: Math.min(55, 35 + Math.round(p.percent * 0.2)),
        });
      },
    };
    const setupsBatch = runCuttingPipeline(
      { ...initialState, context: setupsCtx },
      setupsStrategy
    );
    const setupsDurationMs = Number((performance.now() - setupsStart).toFixed(1));
    const { state: setupsFull, evalCtx: setupsEvalCtx } = await finalizeVariantStateAsync(
      setupsBatch,
      setupsCtx,
      setupsStrategy
    );
    const setupsSol = buildSolutionFromFinalState(
      setupsFull,
      setupsEvalCtx,
      stockInput,
      demandInput,
      baseSettings,
      startMemoryMb,
      setupsStart
    );
    totalRunsExecuted++;
    mSetups = setupsSol.totalStockLength;
    cSetups = setupsSol.rows.length;
    probedCaps.add(mSetups);
    probeHistory.push({ capMm: mSetups, cards: cSetups });
    candidates.push({ solution: setupsSol, isBaseline: false });
    timings.push({
      label: 'Минимум наладок',
      capMm: mSetups,
      durationMs: setupsDurationMs,
      stockMm: mSetups,
      bars: setupsSol.totalBarsUsed,
      cards: cSetups,
    });
  }

  const totalPassesPlanned =
    (baseCtx.maxSortZ + 1) * (baseCtx.maxSort + 1) * (baseCtx.maxVar + 1);

  const refineFrontForCap = async (
    capMm: number,
    label: string,
    stageNum: number,
    pct: number
  ): Promise<void> => {
    if (!baseMerged) return;
    const batchCapMm = toBatchCapMm(capMm);
    const capStageStart = performance.now();
    const capCtx: CutContext = {
      ...baseCtx,
      materialCapMm: batchCapMm,
      startTime: capStageStart,
      onProgress: undefined,
    };
    const balStrategy = new MinimizeBalanceStrategy(batchCapMm);
    const chosenPt = selectFrontPointForCap(baseMerged.front, batchCapMm);

    let refined: CutState;
    if (chosenPt) {
      const ptState: CutState = {
        cards: chosenPt.cards,
        metrics: chosenPt.metrics,
        unplacedScaled: chosenPt.unplacedScaled,
        score: balStrategy.score(chosenPt.cards, chosenPt.metrics, capCtx),
        context: capCtx,
        telemetryCounters: {
          passesEvaluated: baseFinalBatch.telemetryCounters.passesEvaluated,
          prunedPasses: baseFinalBatch.telemetryCounters.prunedPasses,
          totalCombinationsChecked: baseFinalBatch.telemetryCounters.totalCombinationsChecked,
          twoOptSwapIterations: 0,
          tailConsolidationCardsMerged: 0,
          initialCardsCount: chosenPt.metrics.uniqueCardsCount,
          stage1Ms: baseFinalBatch.telemetryCounters.stage1Ms,
          stage2Ms: baseFinalBatch.telemetryCounters.stage2Ms,
          stage3Ms: 0,
          threadsUsed: baseFinalBatch.telemetryCounters.threadsUsed,
          chunksProcessed: baseFinalBatch.telemetryCounters.chunksProcessed,
          totalPassesPlanned,
          abortedDuringSearch: baseFinalBatch.telemetryCounters.abortedDuringSearch,
        },
      };
      refined = runPostGenerationSteps(
        ptState,
        balStrategy.buildPipeline(capCtx),
        balStrategy,
        true
      );
      const baselineScoreUnderCap = balStrategy.score(
        baseFinalBatch.cards,
        baseFinalBatch.metrics,
        capCtx
      );
      if (baselineScoreUnderCap > refined.score) {
        refined = {
          ...baseFinalBatch,
          context: capCtx,
          score: baselineScoreUnderCap,
        };
      }
    } else {
      refined = {
        ...baseFinalBatch,
        context: capCtx,
        score: balStrategy.score(baseFinalBatch.cards, baseFinalBatch.metrics, capCtx),
      };
    }

    const stage3Ms = Math.max(0, Number((performance.now() - capStageStart).toFixed(1)));
    const withStage3: CutState = {
      ...refined,
      telemetryCounters: {
        ...refined.telemetryCounters,
        stage3Ms,
      },
    };

    const { state: resFull, evalCtx: resEvalCtx } = await finalizeVariantStateAsync(
      withStage3,
      capCtx,
      setupsStrategy
    );
    const sol = buildSolutionFromFinalState(
      resFull,
      resEvalCtx,
      stockInput,
      demandInput,
      baseSettings,
      startMemoryMb,
      capStageStart
    );

    options?.onProgress?.({
      stage: stageNum,
      totalStages: 6,
      stageName: `Баланс: допуск ${label}`,
      stageStepName: `Оптимизация карт при допуске ${label}`,
      percent: pct,
      placedParts: fullCtx.totalPartsCount,
      totalParts: fullCtx.totalPartsCount,
      usedBars: sol.totalBarsUsed,
      totalBarsEstimate: fullCtx.totalBarsEstimate,
      bestKIM: sol.overallKIM,
      uniqueCardsCount: sol.rows.length,
      elapsedMs: Math.round(performance.now() - suiteStart),
    });

    probeHistory.push({ capMm, cards: sol.rows.length });
    timings.push({
      label,
      capMm,
      durationMs: stage3Ms,
      stockMm: sol.totalStockLength,
      bars: sol.totalBarsUsed,
      cards: sol.rows.length,
    });
    candidates.push({ solution: sol, isBaseline: false });
  };

  // 3. Fixed tolerances + adaptive bisection midpoints over merged front OR sequential multi-cap pipeline
  if (cSetups < c0 && !options?.shouldAbort?.()) {
    const fixedTolerances: Array<{ p: number; label: string }> = [
      { p: 0.001, label: '+0,1%' },
      { p: 0.005, label: '+0,5%' },
      { p: 0.01, label: '+1%' },
      { p: 0.02, label: '+2%' },
    ];
    const capMap = new Map<number, { capMm: number; label: string }>();
    for (const def of fixedTolerances) {
      const delta = Math.max(Math.round(mStar * def.p), primaryStdLen);
      const capMm = mStar + delta;
      if (capMm < mSetups && !probedCaps.has(capMm) && !capMap.has(capMm)) {
        capMap.set(capMm, { capMm, label: def.label });
      }
    }
    const maxFixedAllowed = Math.max(0, 9 - totalRunsExecuted);
    const fixedEntries = Array.from(capMap.values())
      .sort((a, b) => a.capMm - b.capMm)
      .slice(0, maxFixedAllowed);

    if (baseMerged) {
      for (let idx = 0; idx < fixedEntries.length && !options?.shouldAbort?.(); idx++) {
        const entry = fixedEntries[idx];
        probedCaps.add(entry.capMm);
        const pct = Math.min(82, 56 + Math.round(((idx + 1) / Math.max(1, fixedEntries.length)) * 24));
        await refineFrontForCap(entry.capMm, entry.label, 4, pct);
        totalRunsExecuted++;
      }

      let adaptiveDone = 0;
      while (adaptiveDone < 4 && totalRunsExecuted < 9 && !options?.shouldAbort?.()) {
        const frontier = buildParetoFrontier(candidates);
        let bestCapMid: number | null = null;
        let bestCardDrop = 1;
        let bestSpan = 0;

        for (let i = 0; i < frontier.length - 1; i++) {
          const leftSol = frontier[i].solution;
          const rightSol = frontier[i + 1].solution;
          const cardDrop = leftSol.rows.length - rightSol.rows.length;
          if (cardDrop < 2) continue;

          let effectiveLeft = leftSol.totalStockLength;
          for (const pr of probeHistory) {
            if (
              pr.capMm > effectiveLeft &&
              pr.capMm < rightSol.totalStockLength &&
              pr.cards >= leftSol.rows.length
            ) {
              effectiveLeft = pr.capMm;
            }
          }

          const span = rightSol.totalStockLength - effectiveLeft;
          if (span < primaryStdLen) continue;

          let capMid =
            Math.round((effectiveLeft + rightSol.totalStockLength) / 2 / primaryStdLen) *
            primaryStdLen;
          if (capMid <= effectiveLeft) capMid = effectiveLeft + primaryStdLen;
          if (capMid >= rightSol.totalStockLength) capMid = rightSol.totalStockLength - primaryStdLen;
          if (capMid <= effectiveLeft || capMid >= rightSol.totalStockLength) continue;
          if (probedCaps.has(capMid)) continue;

          if (cardDrop > bestCardDrop || (cardDrop === bestCardDrop && span > bestSpan)) {
            bestCardDrop = cardDrop;
            bestSpan = span;
            bestCapMid = capMid;
          }
        }

        if (bestCapMid === null) break;
        probedCaps.add(bestCapMid);
        await refineFrontForCap(
          bestCapMid,
          `Бисекция #${adaptiveDone + 1}`,
          5,
          Math.min(97, 83 + adaptiveDone * 3)
        );
        adaptiveDone++;
        totalRunsExecuted++;
      }
    } else {
      const balanceCtx: CutContext = {
        ...baseCtx,
        startTime: performance.now(),
        onProgress: (p) => {
          options?.onProgress?.({
            ...p,
            stage: 3,
            totalStages: 6,
            stageName: 'Баланс: подбор промежуточных точек',
            percent: Math.min(72, 55 + Math.round(p.percent * 0.17)),
          });
        },
      };
      const balanceInitial: CutState = {
        ...initialState,
        context: balanceCtx,
      };

      if (fixedEntries.length > 0 && !options?.shouldAbort?.()) {
        for (const e of fixedEntries) probedCaps.add(e.capMm);
        const capsForPipeline = fixedEntries.map((e) => toBatchCapMm(e.capMm));
        const fixedResults: Array<{ idx: number; resState: CutState; stage3DurationMs: number; capStart: number }> = [];
        let capStageStart = performance.now();
        runMultiCapBalancePipelines(
          balanceInitial,
          baseFinalBatch,
          capsForPipeline,
          (idx) => {
            capStageStart = performance.now();
            const pct = Math.min(82, 72 + Math.round(((idx + 0.5) / fixedEntries.length) * 10));
            options?.onProgress?.({
              stage: 4,
              totalStages: 6,
              stageName: `Баланс: допуск ${fixedEntries[idx].label}`,
              stageStepName: `Оптимизация карт при допуске ${fixedEntries[idx].label}`,
              percent: pct,
              placedParts: fullCtx.totalPartsCount,
              totalParts: fullCtx.totalPartsCount,
              usedBars: baseSol.totalBarsUsed,
              totalBarsEstimate: fullCtx.totalBarsEstimate,
              bestKIM: baseSol.overallKIM,
              uniqueCardsCount: c0,
              elapsedMs: Math.round(performance.now() - suiteStart),
            });
          },
          (idx, _total, resState, stage3DurationMs) => {
            fixedResults.push({ idx, resState, stage3DurationMs, capStart: capStageStart });
          }
        );

        for (const item of fixedResults) {
          const { state: resFull, evalCtx: resEvalCtx } = await finalizeVariantStateAsync(
            item.resState,
            balanceCtx,
            setupsStrategy
          );
          const sol = buildSolutionFromFinalState(
            resFull,
            resEvalCtx,
            stockInput,
            demandInput,
            baseSettings,
            startMemoryMb,
            item.capStart
          );
          const reportedDurationMs =
            item.idx === 0
              ? Number((item.resState.telemetryCounters.stage2Ms + item.stage3DurationMs).toFixed(1))
              : item.stage3DurationMs;
          const capMm = fixedEntries[item.idx].capMm;
          probeHistory.push({ capMm, cards: sol.rows.length });
          timings.push({
            label: fixedEntries[item.idx].label,
            capMm,
            durationMs: reportedDurationMs,
            stockMm: sol.totalStockLength,
            bars: sol.totalBarsUsed,
            cards: sol.rows.length,
          });
          candidates.push({ solution: sol, isBaseline: false });
        }
        totalRunsExecuted += fixedEntries.length;
      }

      let adaptiveDone = 0;
      while (adaptiveDone < 4 && totalRunsExecuted < 9 && !options?.shouldAbort?.()) {
        const frontier = buildParetoFrontier(candidates);
        let bestCapMid: number | null = null;
        let bestCardDrop = 1;
        let bestSpan = 0;

        for (let i = 0; i < frontier.length - 1; i++) {
          const leftSol = frontier[i].solution;
          const rightSol = frontier[i + 1].solution;
          const cardDrop = leftSol.rows.length - rightSol.rows.length;
          if (cardDrop < 2) continue;

          let effectiveLeft = leftSol.totalStockLength;
          for (const pr of probeHistory) {
            if (
              pr.capMm > effectiveLeft &&
              pr.capMm < rightSol.totalStockLength &&
              pr.cards >= leftSol.rows.length
            ) {
              effectiveLeft = pr.capMm;
            }
          }

          const span = rightSol.totalStockLength - effectiveLeft;
          if (span < primaryStdLen) continue;

          let capMid =
            Math.round((effectiveLeft + rightSol.totalStockLength) / 2 / primaryStdLen) *
            primaryStdLen;
          if (capMid <= effectiveLeft) capMid = effectiveLeft + primaryStdLen;
          if (capMid >= rightSol.totalStockLength) capMid = rightSol.totalStockLength - primaryStdLen;
          if (capMid <= effectiveLeft || capMid >= rightSol.totalStockLength) continue;
          if (probedCaps.has(capMid)) continue;

          if (cardDrop > bestCardDrop || (cardDrop === bestCardDrop && span > bestSpan)) {
            bestCardDrop = cardDrop;
            bestSpan = span;
            bestCapMid = capMid;
          }
        }

        if (bestCapMid === null) break;
        probedCaps.add(bestCapMid);

        const midCap = bestCapMid;
        const midLabel = `Бисекция #${adaptiveDone + 1}`;
        const capForPipe = toBatchCapMm(midCap);
        let midStageStart = performance.now();
        const midCtx: CutContext = {
          ...balanceCtx,
          startTime: midStageStart,
          onProgress: undefined,
        };
        let capturedMid: { resState: CutState; stage3DurationMs: number } | null = null;

        runMultiCapBalancePipelines(
          { ...balanceInitial, context: midCtx },
          baseFinalBatch,
          [capForPipe],
          () => {
            midStageStart = performance.now();
            const pct = Math.min(97, 83 + adaptiveDone * 3);
            options?.onProgress?.({
              stage: 5,
              totalStages: 6,
              stageName: `Баланс: адаптивный поиск (${adaptiveDone + 1}/4)`,
              stageStepName: `Уточнение границы расхода (${Math.round(midCap / 1000)} м)`,
              percent: pct,
              placedParts: fullCtx.totalPartsCount,
              totalParts: fullCtx.totalPartsCount,
              usedBars: baseSol.totalBarsUsed,
              totalBarsEstimate: fullCtx.totalBarsEstimate,
              bestKIM: baseSol.overallKIM,
              uniqueCardsCount: c0,
              elapsedMs: Math.round(performance.now() - suiteStart),
            });
          },
          (_idx, _total, resState, stage3DurationMs) => {
            capturedMid = { resState, stage3DurationMs };
          }
        );

        if (capturedMid) {
          const midCapture: { resState: CutState; stage3DurationMs: number } = capturedMid;
          const { state: resFull, evalCtx: resEvalCtx } = await finalizeVariantStateAsync(
            midCapture.resState,
            midCtx,
            setupsStrategy
          );
          const sol = buildSolutionFromFinalState(
            resFull,
            resEvalCtx,
            stockInput,
            demandInput,
            baseSettings,
            startMemoryMb,
            midStageStart
          );
          const reportedDurationMs = Number(
            (midCapture.resState.telemetryCounters.stage2Ms + midCapture.stage3DurationMs).toFixed(1)
          );
          probeHistory.push({ capMm: midCap, cards: sol.rows.length });
          timings.push({
            label: midLabel,
            capMm: midCap,
            durationMs: reportedDurationMs,
            stockMm: sol.totalStockLength,
            bars: sol.totalBarsUsed,
            cards: sol.rows.length,
          });
          candidates.push({ solution: sol, isBaseline: false });
        }

        adaptiveDone++;
        totalRunsExecuted++;
      }
    }
  }

  const nonDominated = buildParetoFrontier(candidates);
  const suite: SuiteItem[] = nonDominated.map((item, idx) => {
    const cardsCount = item.solution.rows.length;
    if (nonDominated.length === 1) {
      return {
        goal: 'balance',
        title: 'Баланс',
        badge: '⚖️ Баланс',
        description: 'Оптимальный вариант по расходу материала и числу карт раскроя',
        solution: item.solution,
      };
    }

    if (idx === 0) {
      return {
        goal: 'balance',
        title: 'Минимум материала',
        badge: 'Мин. материал',
        description: 'Базовый вариант с минимальным расходом материала',
        solution: item.solution,
      };
    }

    const baseVariant = nonDominated[0].solution;
    const deltaStockMm = item.solution.totalStockLength - baseVariant.totalStockLength;
    const rawDeltaBars = item.solution.totalBarsUsed - baseVariant.totalBarsUsed;
    const deltaBars =
      rawDeltaBars > 0
        ? rawDeltaBars
        : Math.max(1, Math.round(deltaStockMm / primaryStdLen));
    const pct =
      baseVariant.totalStockLength > 0
        ? (deltaStockMm / baseVariant.totalStockLength) * 100
        : 0;
    const pctStr = formatTolerancePct(pct);

    return {
      goal: 'balance',
      title: `+${deltaBars} заготовок (+${pctStr}%), ${cardsCount} карт`,
      badge: `⚖️ +${deltaBars} загот. (+${pctStr}%)`,
      description: `Допуск по материалу +${pctStr}% (+${(deltaStockMm / 1000).toFixed(2)} м): сокращение до ${cardsCount} карт раскроя`,
      solution: item.solution,
    };
  });

  const totalDurationMs = Number((performance.now() - suiteStart).toFixed(1));
  const bestSolution = suite[0]?.solution || baseSol;
  return { suite, bestSolution, timings, totalDurationMs };
}

export async function solveLinearCuttingAsync(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  options?: SolveLinearCuttingOptions,
  parallelExecutor?: ParallelPassExecutor
): Promise<FullOptimizationSolution> {
  if (settings.optimizationGoal === 'balance') {
    const res = await runBalanceSuiteAsync(
      stockInput,
      demandInput,
      settings,
      options,
      parallelExecutor
    );
    return res.bestSolution;
  }

  const startMemoryMb = getMemoryUsageMb();
  const isBatchMode = settings.dualProfileCut === true;
  const effSettings: AppSettings = isBatchMode ? { ...settings, dualProfileCut: false } : settings;
  const fullCtx = buildCutContext(stockInput, demandInput, effSettings, options);

  if (fullCtx.scaledDemand.length === 0 || fullCtx.scaledStockAll.length === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      maxReusableRemnantLength: 0,
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
  }

  const strategy = getStrategy(settings.optimizationGoal, settings);
  const stageA = runPrioritizeRemnantsStageA(
    stockInput,
    demandInput,
    effSettings,
    fullCtx,
    options
  );
  const stageBStock = stageA ? stageA.standardStock : stockInput;
  const stageBDemand = stageA ? stageA.remainingDemand : demandInput;
  const stageBSettings = stageA ? stageA.stageBSettings : effSettings;
  const stageBUserSettings = stageA ? { ...settings, prioritizeRemnants: false } : settings;
  const baseProfiles = resolveStandardPassProfiles(stageBSettings.searchSpeed);

  let finalState: CutState;
  const buildCtx: CutContext = fullCtx;

  if (stageA && stageBDemand.length === 0) {
    const lockedMetrics = calculateMetrics(stageA.lockedCards, fullCtx, []);
    finalState = {
      cards: stageA.lockedCards,
      metrics: lockedMetrics,
      unplacedScaled: [],
      score: strategy.score(stageA.lockedCards, lockedMetrics, fullCtx),
      context: fullCtx,
      telemetryCounters: {
        passesEvaluated: stageA.passesEvaluated,
        prunedPasses: stageA.prunedPasses,
        totalCombinationsChecked: stageA.totalCombinationsChecked,
        twoOptSwapIterations: 0,
        tailConsolidationCardsMerged: 0,
        initialCardsCount: lockedMetrics.uniqueCardsCount,
        stage1Ms: stageA.stage1Ms,
        stage2Ms: stageA.stage2Ms,
        stage3Ms: 0,
      },
    };
  } else {
    const stageBFullCtx = stageA
      ? buildCutContext(stageBStock, stageBDemand, stageBSettings, options)
      : fullCtx;
    const batchSplit = isBatchMode
      ? splitBatchAndTailInputs(
          stageBStock,
          stageBDemand,
          resolveBatchSize(stageBDemand, stageBUserSettings)
        )
      : null;

    let stageBState: CutState;

    if (batchSplit) {
      if (batchSplit.batchDemand.length === 0) {
        const tailRes = solveTailSingleCards(
          stageBStock,
          [],
          batchSplit.tailDemand,
          stageBUserSettings,
          strategy,
          stageBFullCtx,
          options?.shouldAbort
        );
        const tailCards = groupIdenticalCards(tailRes.cards, stageBFullCtx);
        const tailMetrics = calculateMetrics(tailCards, stageBFullCtx, tailRes.unplacedScaledFull);
        stageBState = await applyForcedRemnantShapingAsync(
          {
            cards: tailCards,
            metrics: tailMetrics,
            unplacedScaled: tailRes.unplacedScaledFull,
            score: strategy.score(tailCards, tailMetrics, stageBFullCtx),
            context: stageBFullCtx,
            telemetryCounters: {
              passesEvaluated: tailRes.passesEvaluated,
              prunedPasses: tailRes.prunedPasses,
              totalCombinationsChecked: tailRes.totalCombinationsChecked,
              twoOptSwapIterations: 0,
              tailConsolidationCardsMerged: 0,
              initialCardsCount: tailMetrics.uniqueCardsCount,
              stage1Ms: 0,
              stage2Ms: 0,
              stage3Ms: 0,
            },
          },
          stageBStock,
          stageBDemand,
          stageBUserSettings,
          stageBFullCtx,
          strategy,
          parallelExecutor
        );
      } else {
        const batchCtx = buildCutContext(
          batchSplit.batchStock,
          batchSplit.batchDemand,
          stageBSettings,
          options
        );
        const emptyMetrics = calculateMetrics([], batchCtx, batchCtx.scaledDemand);
        const batchInitial: CutState = {
          cards: [],
          metrics: emptyMetrics,
          unplacedScaled: batchCtx.scaledDemand,
          score: -Infinity,
          context: batchCtx,
          telemetryCounters: {
            passesEvaluated: 0,
            prunedPasses: 0,
            totalCombinationsChecked: 0,
            twoOptSwapIterations: 0,
            tailConsolidationCardsMerged: 0,
            initialCardsCount: 0,
            stage1Ms: 0,
            stage2Ms: 0,
            stage3Ms: 0,
          },
        };
        const { finalState: batchSolved } = await runStage2AndRefineMaybeParallel(
          batchInitial,
          strategy,
          batchSplit.batchStock,
          batchSplit.batchDemand,
          baseProfiles,
          parallelExecutor,
          false
        );
        stageBState = combineBatchAndTailState(
          batchSolved,
          batchSplit.batchSize,
          batchCtx,
          stageBFullCtx,
          stageBStock,
          batchSplit.tailDemand,
          stageBUserSettings,
          strategy
        );
        let untouchedBatchHint: readonly CutCard[] | null = null;
        let hasFillControlWork = false;
        if (stageBUserSettings.fillControlEnabled) {
          const fcOutcome = applyBatchFillControl(
            stageBState,
            stageBStock,
            stageBUserSettings,
            stageBFullCtx,
            strategy
          );
          stageBState = fcOutcome.state;
          untouchedBatchHint = fcOutcome.untouchedBatchCards;
          hasFillControlWork = fcOutcome.hasSinglePoolWork;
        }
        stageBState = consolidateUnifiedSinglePool(
          stageBState,
          batchSplit.batchSize,
          untouchedBatchHint,
          hasFillControlWork,
          stageBStock,
          stageBUserSettings,
          stageBFullCtx,
          strategy
        );
        stageBState = await applyForcedRemnantShapingAsync(
          stageBState,
          stageBStock,
          stageBDemand,
          stageBUserSettings,
          stageBFullCtx,
          strategy,
          parallelExecutor
        );
      }
    } else {
      const emptyMetrics = calculateMetrics([], stageBFullCtx, stageBFullCtx.scaledDemand);
      const initialState: CutState = {
        cards: [],
        metrics: emptyMetrics,
        unplacedScaled: stageBFullCtx.scaledDemand,
        score: -Infinity,
        context: stageBFullCtx,
        telemetryCounters: {
          passesEvaluated: 0,
          prunedPasses: 0,
          totalCombinationsChecked: 0,
          twoOptSwapIterations: 0,
          tailConsolidationCardsMerged: 0,
          initialCardsCount: 0,
          stage1Ms: 0,
          stage2Ms: 0,
          stage3Ms: 0,
        },
      };
      const { finalState: solved } = await runStage2AndRefineMaybeParallel(
        initialState,
        strategy,
        stageBStock,
        stageBDemand,
        baseProfiles,
        parallelExecutor,
        true
      );
      stageBState = await applyForcedRemnantShapingAsync(
        solved,
        stageBStock,
        stageBDemand,
        stageBUserSettings,
        stageBFullCtx,
        strategy,
        parallelExecutor
      );
    }

    finalState = stageA
      ? mergeLockedRemnantsWithStageB(stageA, stageBState, stageBFullCtx, fullCtx, strategy)
      : stageBState;
  }

  buildCtx.onProgress?.({
    stage: 3,
    totalStages: 3,
    stageName: 'Формирование финальной раскладки',
    stageStepName: 'Группировка карт и расчет итогового баланса',
    percent: 99,
    placedParts: buildCtx.totalPartsCount - finalState.metrics.unplacedCount,
    totalParts: buildCtx.totalPartsCount,
    usedBars: finalState.metrics.totalBarsUsed,
    totalBarsEstimate: buildCtx.totalBarsEstimate,
    bestKIM: finalState.metrics.overallKIM,
    uniqueCardsCount: finalState.metrics.uniqueCardsCount,
    elapsedMs: Math.round(performance.now() - buildCtx.startTime),
    hasMeasurableProgress: false,
  });

  return buildSolutionFromFinalState(
    finalState,
    buildCtx,
    stockInput,
    demandInput,
    settings,
    startMemoryMb,
    buildCtx.startTime
  );
}

/**
 * Fast recalculation when display/remnant thresholds change without needing full re-solve.
 */
export function recalculateSolutionWithSettings(
  existingSolution: FullOptimizationSolution,
  settings: AppSettings,
  stockInput: StockItem[]
): FullOptimizationSolution {
  const delOst = Math.max(0, settings.reusableRemnantMin || 0);

  let totalReusableLength = 0;
  let totalWasteLength = 0;

  const updatedRows = existingSolution.rows.map((row) => {
    const totalRemainder = (row.reusableRemnant || 0) + (row.scrapRemnant || 0);
    const isReusable = delOst > 0 && totalRemainder >= delOst;
    const reusableRemnant = isReusable ? totalRemainder : 0;
    const scrapRemnant = isReusable ? 0 : totalRemainder;
    const barWaste = (row.trimLoss || 0) + (row.kerfLoss || 0) + scrapRemnant;

    totalReusableLength += reusableRemnant * row.barsCount;
    totalWasteLength += barWaste * row.barsCount;

    const efficiency = Number(
      (((row.spent + reusableRemnant) / row.barSize) * 100).toFixed(2)
    );

    const updatedLayout = row.layoutItems.map((item) => {
      if (item.isWaste) {
        return {
          ...item,
          wasteType: (isReusable ? 'reusable' : 'scrap') as 'reusable' | 'scrap',
          color: isReusable ? '#FCD34D' : '#E2E8F0',
          mark: isReusable ? `${reusableRemnant} (Ост)` : `${scrapRemnant}`,
        };
      }
      return item;
    });

    return {
      ...row,
      isReusable,
      reusableRemnant,
      scrapRemnant,
      waste: barWaste,
      efficiency,
      wasteLabel: isReusable ? (reusableRemnant >= 100 ? 'Остат' : 'Ос') : 'О',
      layoutItems: updatedLayout,
    };
  });

  const overallKIM =
    existingSolution.totalStockLength > 0
      ? Number(
          (
            ((existingSolution.totalStockLength - totalWasteLength) /
              existingSolution.totalStockLength) *
            100
          ).toFixed(2)
        )
      : 0;

  const usedCountByStockLength = new Map<number, number>();
  updatedRows.forEach((r) => {
    usedCountByStockLength.set(
      r.barSize,
      (usedCountByStockLength.get(r.barSize) || 0) + r.barsCount
    );
  });

  const remainingWarehouseStock: RemnantItem[] = [];
  stockInput.forEach((s) => {
    if (s.isActive === false) return;
    const isAuto =
      s.isStandardUnlimited ||
      ((s.length === 6000 || s.length === 12000 || s.length === 11700) && s.quantity <= 0);
    if (isAuto) return;
    const used = usedCountByStockLength.get(s.length) || 0;
    const rem = Math.max(0, s.quantity - used);
    if (rem > 0) {
      remainingWarehouseStock.push({
        length: s.length,
        quantity: rem,
        mark: s.mark,
        notes: s.notes,
      });
    }
  });

  if (delOst > 0) {
    updatedRows.forEach((r) => {
      if (r.isReusable && r.reusableRemnant >= delOst && r.reusableRemnant > 0) {
        remainingWarehouseStock.push({
          length: r.reusableRemnant,
          quantity: r.barsCount,
          mark: 'Деловой остаток',
        });
      }
    });
  }

  const netKIM =
    existingSolution.totalStockLength > 0
      ? Number(
          (
            (existingSolution.totalSpentLength / existingSolution.totalStockLength) *
            100
          ).toFixed(2)
        )
      : 0;

  const updatedPartial = {
    ...existingSolution,
    rows: updatedRows,
    totalReusableLength,
    totalWasteLength,
    overallKIM,
    netKIM,
    remainingWarehouseStock,
  };
  const maxReusableRemnantLength = computeMaxReusableRemnantFromSolution({
    rows: updatedRows,
  });
  const indexBreakdown = computeCuttingIndexFromSolution(
    {
      ...updatedPartial,
      cuttingIndex: undefined,
      cuttingIndexMaterial: undefined,
      cuttingIndexSetup: undefined,
    },
    stockInput,
    resolveIndexTargetRemnantLength(settings)
  );

  return {
    ...updatedPartial,
    maxReusableRemnantLength,
    cuttingIndex: indexBreakdown.cuttingIndex,
    cuttingIndexMaterial: indexBreakdown.cuttingIndexMaterial,
    cuttingIndexSetup: indexBreakdown.cuttingIndexSetup,
  };
}

/**
 * Backward-compatibility wrapper for legacy reports
 */
export function optimizeLinearCutting(
  demands: PartDemand[],
  stocks: StockBar[],
  params: CuttingParams
): CuttingOptimizationResult {
  const stockItems: StockItem[] = stocks.map((s, idx) => ({
    id: s.id,
    orderIndex: idx + 1,
    length: s.length,
    quantity: s.availableQuantity,
  }));

  const demandItems: DemandItem[] = demands.map((d, idx) => ({
    id: d.id,
    orderIndex: idx + 1,
    length: d.length,
    quantity: d.quantity,
  }));

  const settings: AppSettings = {
    material: params.materialName || 'Профиль',
    orderNumber: params.orderNumber || '1',
    bladeWidth: params.bladeWidth || 3,
    edgeTrim: params.trimStart || 0,
    reusableRemnantMin: params.minReusableLength || 0,
    cutAngle45: false,
    dualProfileCut: false,
    groupSolutions: true,
    showGraphics: true,
    searchSpeed: 'fast',
    optimizationGoal: 'variants',
  };

  const sol = solveLinearCutting(stockItems, demandItems, settings);

  const patterns: BarCuttingPattern[] = sol.rows.map((r) => ({
    id: r.id,
    patternIndex: r.barIndex,
    stockBarId: 'stock_1',
    stockName: `Профиль ${r.barSize} мм`,
    stockLength: r.barSize,
    trimStart: settings.edgeTrim,
    trimEnd: 0,
    bladeWidth: settings.bladeWidth,
    cuts: r.pieces.flatMap((p) =>
      Array.from({ length: p.count }).map((_, cIdx) => ({
        id: `${r.id}_${p.length}_${cIdx}`,
        partId: `part_${p.length}`,
        mark: `Д-${p.length}`,
        length: p.length,
        startOffset: 0,
        endOffset: 0,
        color: p.color,
      }))
    ),
    totalPartsLength: r.spent,
    totalKerfLength: r.pieces.reduce((sum, p) => sum + p.count * settings.bladeWidth, 0),
    wasteLength: r.isReusable ? r.reusableRemnant || 0 : r.scrapRemnant || r.waste,
    isReusableWaste: r.isReusable,
    reusableLength: r.isReusable ? r.reusableRemnant || 0 : 0,
    scrapLength: r.isReusable ? r.waste : r.scrapRemnant || r.waste,
    efficiencyPercent: r.efficiency,
    count: r.barsCount,
  }));

  return {
    patterns,
    totalStockBarsUsed: sol.totalBarsUsed,
    totalStockLengthUsed: sol.totalStockLength,
    totalPartsLength: sol.totalSpentLength,
    totalWasteLength: sol.totalWasteLength,
    totalReusableLength: sol.totalReusableLength,
    maxReusableRemnantLength: sol.maxReusableRemnantLength,
    cuttingIndex: sol.cuttingIndex,
    cuttingIndexMaterial: sol.cuttingIndexMaterial,
    cuttingIndexSetup: sol.cuttingIndexSetup,
    totalScrapLength: sol.totalWasteLength,
    totalKerfLoss: sol.totalStockLength - sol.totalSpentLength - sol.totalWasteLength,
    overallEfficiencyPercent: sol.overallKIM,
    unfulfilledDemand: sol.unplacedDemand.map((u) => ({
      partId: `u_${u.length}`,
      mark: `Д-${u.length}`,
      length: u.length,
      requested: u.quantity,
      fulfilled: 0,
      missing: u.quantity,
    })),
    calculationTimeMs: sol.calculationTimeMs,
    telemetry: sol.telemetry,
    algorithmName: 'CutMaster 1D Pipeline + Strategy Engine',
  };
}

/**
 * Naive Sequential Cutting (Порезка подряд от самых крупных к мелким без оптимизации)
 */
export function solveNaiveSequentialCutting(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  forcedStandardSize?: number
): FullOptimizationSolution {
  const startTime = performance.now();
  const dRez = Math.max(0, settings.bladeWidth || 0);
  const krm = Math.max(0, settings.edgeTrim || 0);
  const delOst = Math.max(0, settings.reusableRemnantMin || 0);
  const batchSize = settings.dualProfileCut === true ? resolveBatchSize(demandInput, settings) : 1;
  const b2prof = settings.dualProfileCut === true;
  const bGroupe = settings.groupSolutions !== false;

  const pairQueue: number[] = [];
  const singleQueue: number[] = [];

  for (const d of demandInput) {
    if (d.length <= 0 || d.quantity <= 0) continue;
    const pairs = b2prof ? Math.floor(d.quantity / batchSize) : d.quantity;
    const odd = b2prof ? d.quantity % batchSize : 0;
    for (let j = 0; j < pairs; j++) {
      pairQueue.push(d.length);
    }
    if (odd > 0) {
      for (let k = 0; k < odd; k++) {
        singleQueue.push(d.length);
      }
    }
  }

  if (pairQueue.length === 0 && singleQueue.length === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      maxReusableRemnantLength: 0,
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
  }

  pairQueue.sort((a, b) => b - a);
  singleQueue.sort((a, b) => b - a);

  const availableStandardSizes = stockInput
    .filter(
      (st) =>
        st.isActive !== false &&
        (st.isStandard ||
          st.isStandardUnlimited ||
          st.length === 6000 ||
          st.length === 12000 ||
          st.length === 11700)
    )
    .map((st) => st.length)
    .sort((a, b) => b - a);

  let defaultStandardSize = forcedStandardSize || availableStandardSizes[0] || 12000;
  if (forcedStandardSize === 6000) {
    defaultStandardSize = 6000;
  } else if (forcedStandardSize === 12000) {
    defaultStandardSize = 12000;
  }

  interface RemnantPoolItem {
    id: string;
    length: number;
    remaining: number;
  }
  const remnantPool: RemnantPoolItem[] = stockInput
    .filter(
      (st) =>
        st.isActive !== false &&
        !st.isStandard &&
        !st.isStandardUnlimited &&
        st.length > 0 &&
        st.quantity > 0
    )
    .map((st) => ({
      id: st.id,
      length: st.length,
      remaining: b2prof ? Math.floor(st.quantity / batchSize) * batchSize : st.quantity,
    }))
    .sort((a, b) => b.length - a.length);

  interface RawBarCut {
    barSize: number;
    barCount: number;
    spent: number;
    pieceLengths: number[];
    spaceLeft: number;
    isTailSingle: boolean;
  }

  const rawBarCuts: RawBarCut[] = [];

  const packQueue = (queue: number[], barCount: number, isTailSingle: boolean) => {
    for (let q = 0; q < queue.length; q++) {
      const pLen = queue[q];
      let bestIdx = -1;
      let minSlack = Infinity;

      for (let b = 0; b < rawBarCuts.length; b++) {
        if (rawBarCuts[b].barCount !== barCount || rawBarCuts[b].isTailSingle !== isTailSingle) continue;
        const needed = rawBarCuts[b].pieceLengths.length === 0 ? pLen : pLen + dRez;
        if (rawBarCuts[b].spaceLeft >= needed) {
          const slack = rawBarCuts[b].spaceLeft - needed;
          if (slack < minSlack) {
            minSlack = slack;
            bestIdx = b;
          }
        }
      }

      if (bestIdx !== -1) {
        const b = rawBarCuts[bestIdx];
        const needed = b.pieceLengths.length === 0 ? pLen : pLen + dRez;
        b.pieceLengths.push(pLen);
        b.spaceLeft -= needed;
        continue;
      }

      let chosenRemnant: RemnantPoolItem | null = null;
      for (const rem of remnantPool) {
        if (rem.remaining >= barCount && rem.length - krm >= pLen) {
          chosenRemnant = rem;
          break;
        }
      }

      if (chosenRemnant) {
        chosenRemnant.remaining -= barCount;
        const usableLength = chosenRemnant.length - krm;
        rawBarCuts.push({
          barSize: chosenRemnant.length,
          barCount,
          spent: pLen,
          pieceLengths: [pLen],
          spaceLeft: usableLength - pLen,
          isTailSingle,
        });
        continue;
      }

      const barSizeToOpen = defaultStandardSize;
      const usableLength = barSizeToOpen - krm;
      rawBarCuts.push({
        barSize: barSizeToOpen,
        barCount,
        spent: pLen,
        pieceLengths: [pLen],
        spaceLeft: usableLength - pLen,
        isTailSingle,
      });
    }
  };

  packQueue(pairQueue, b2prof ? batchSize : 1, false);
  if (singleQueue.length > 0) {
    packQueue(singleQueue, 1, true);
  }

  if (!forcedStandardSize) {
    rawBarCuts.forEach((cut) => {
      cut.spent = cut.pieceLengths.reduce((a, b) => a + b, 0);
      if (cut.barSize >= 11000 && availableStandardSizes.includes(6000)) {
        const cutsCount =
          cut.pieceLengths.length > 0
            ? (krm > 0 ? 1 : 0) + cut.pieceLengths.length - 1
            : 0;
        const requiredMm = cut.spent + krm + cutsCount * dRez;
        if (requiredMm <= 6000) {
          cut.barSize = 6000;
          cut.spaceLeft = 6000 - requiredMm;
        }
      }
    });
  }

  interface GroupedRow {
    barSize: number;
    spent: number;
    count: number;
    pieceLengths: number[];
    isTailSingle: boolean;
  }

  const groupedRows: GroupedRow[] = [];
  rawBarCuts.forEach((cut) => {
    cut.pieceLengths.sort((a, b) => b - a);
    const signature = `${cut.barSize}_${cut.pieceLengths.join(',')}_${cut.isTailSingle ? 'S' : 'B'}`;

    const existing = bGroupe
      ? groupedRows.find(
          (r) => `${r.barSize}_${r.pieceLengths.join(',')}_${r.isTailSingle ? 'S' : 'B'}` === signature
        )
      : null;

    if (existing) {
      existing.count += cut.barCount;
    } else {
      groupedRows.push({
        barSize: cut.barSize,
        spent: cut.spent,
        count: cut.barCount,
        pieceLengths: [...cut.pieceLengths],
        isTailSingle: cut.isTailSingle,
      });
    }
  });

  groupedRows.sort((a, b) => {
    if (a.isTailSingle !== b.isTailSingle) return a.isTailSingle ? 1 : -1;
    if (b.barSize !== a.barSize) return b.barSize - a.barSize;
    return b.count - a.count;
  });

  const demandColorMap = new Map<number, string>();
  const demandMarkMap = new Map<number, string>();
  demandInput.forEach((d, dIdx) => {
    if (!demandColorMap.has(d.length)) {
      demandColorMap.set(d.length, d.color || getDefaultDemandColor(dIdx, d.length));
    }
    if (d.mark && !demandMarkMap.has(d.length)) {
      demandMarkMap.set(d.length, d.mark);
    }
  });

  let totalStockLength = 0;
  let totalSpentLength = 0;
  let totalBarsUsed = 0;
  let totalWasteLength = 0;
  let totalReusableLength = 0;

  const rows: SolutionRow[] = groupedRows.map((gr, idx) => {
    const pieceCountMap = new Map<number, number>();
    gr.pieceLengths.forEach((len) => {
      pieceCountMap.set(len, (pieceCountMap.get(len) || 0) + 1);
    });
    const sortedUniquePieces = Array.from(pieceCountMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([length, count]) => ({ length, count }));

    const piecesStr = sortedUniquePieces.map((p) => `${p.length}х${p.count}`).join(' + ');
    const trimStr = krm > 0 ? `[${krm}]` : '[]';
    const trimCuts = krm > 0 ? 1 : 0;
    const totalPiecesCount = gr.pieceLengths.length;
    const totalPartsLength = gr.pieceLengths.reduce((a, b) => a + b, 0);

    const rawRemainderCheck = gr.barSize - totalPartsLength - krm;
    const cutsCount =
      totalPiecesCount > 0
        ? trimCuts + Math.max(0, totalPiecesCount - 1) + (rawRemainderCheck > dRez ? 1 : 0)
        : trimCuts;
    const kerfLoss = dRez * cutsCount;
    const totalKerfAndParts = totalPartsLength + krm + kerfLoss;
    const remainder = Math.max(0, gr.barSize - totalKerfAndParts);

    const isReusable = delOst > 0 && remainder >= delOst;
    const reusableRemnant = isReusable ? remainder : 0;
    const scrapRemnant = isReusable ? 0 : remainder;
    const barWaste = krm + kerfLoss + scrapRemnant;

    const reusableStr = isReusable ? `!<${reusableRemnant}>` : '!<>';
    const wasteStr =
      scrapRemnant > 0 ? `(${dRez}х${cutsCount}+${scrapRemnant})` : `(${dRez}х${cutsCount})`;
    const formulaStr = `${gr.count}х{${trimStr} + <${piecesStr}> + ${reusableStr} + ${wasteStr}}=${gr.barSize}`;

    totalStockLength += gr.barSize * gr.count;
    totalSpentLength += totalPartsLength * gr.count;
    totalBarsUsed += gr.count;
    totalReusableLength += reusableRemnant * gr.count;
    totalWasteLength += barWaste * gr.count;

    const efficiency = Number(
      (((totalPartsLength + reusableRemnant) / gr.barSize) * 100).toFixed(2)
    );

    const pieces: SolutionPiece[] = sortedUniquePieces.map((p, sIdx) => ({
      id: `p_naive_${idx}_${sIdx}`,
      length: p.length,
      count: p.count,
      color: demandColorMap.get(p.length) || getColorForLength(p.length),
      mark: demandMarkMap.get(p.length),
    }));

    const layoutItems: SolutionBarLayoutItem[] = [];
    if (krm > 0) {
      layoutItems.push({
        id: `trim_naive_${idx}`,
        length: krm,
        color: '#000000',
        isTrim: true,
      });
    }

    sortedUniquePieces.forEach((p, sIdx) => {
      const color = demandColorMap.get(p.length) || getColorForLength(p.length);
      const mark = demandMarkMap.get(p.length) || `${p.length}`;
      for (let c = 0; c < p.count; c++) {
        layoutItems.push({
          id: `lay_naive_${idx}_${sIdx}_${c}`,
          length: p.length,
          color,
          mark,
        });
      }
    });

    if (remainder > 0) {
      layoutItems.push({
        id: `waste_naive_${idx}`,
        length: remainder,
        color: isReusable ? '#FCD34D' : '#E2E8F0',
        isWaste: true,
        wasteType: isReusable ? 'reusable' : 'scrap',
        mark: isReusable ? `${reusableRemnant} (Ост)` : `${scrapRemnant}`,
      });
    }

    return {
      id: `row_naive_${idx + 1}`,
      barIndex: idx + 1,
      barSize: gr.barSize,
      spent: totalPartsLength,
      barsCount: gr.count,
      formula: formulaStr,
      pieces,
      waste: barWaste,
      reusableRemnant,
      scrapRemnant,
      kerfLoss,
      trimLoss: krm,
      isReusable,
      wasteLabel: isReusable ? 'Ост' : 'О',
      efficiency,
      layoutItems,
      ...(gr.isTailSingle ? { isTailSingle: true } : {}),
    };
  });

  const overallKIM =
    totalStockLength > 0
      ? Number((((totalStockLength - totalWasteLength) / totalStockLength) * 100).toFixed(2))
      : 0;

  const netKIM =
    totalStockLength > 0
      ? Number(((totalSpentLength / totalStockLength) * 100).toFixed(2))
      : 0;

  const naiveDurationMs = Number((performance.now() - startTime).toFixed(1));
  const naivePartsCount = pairQueue.length * batchSize + singleQueue.length;
  const naiveTelemetry: CalculationTelemetry = {
    calculationId: `naive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    environment:
      typeof window === 'undefined' && typeof self !== 'undefined'
        ? 'client_worker'
        : 'client_main',
    totalDurationMs: naiveDurationMs,
    stageTimingsMs: {
      stage1Init: 0,
      stage2Search: naiveDurationMs,
      stage3Refine: 0,
    },
    passesEvaluated: 1,
    prunedPasses: 0,
    totalCombinationsChecked: naivePartsCount,
    twoOptSwapIterations: 0,
    tailConsolidationCardsMerged: 0,
    throughputPartsPerSecond:
      naiveDurationMs > 0
        ? Number((naivePartsCount / (naiveDurationMs / 1000)).toFixed(1))
        : 0,
    memoryUsedMb: getMemoryUsageMb(),
    cpuLoadPercent: 100,
    workerThreadCount: 1,
  };

  const maxReusableRemnantLength = computeMaxReusableRemnantFromSolution({ rows });
  const naiveIndexBreakdown = computeCuttingIndexFromSolution(
    {
      rows,
      totalStockLength,
      totalSpentLength,
      totalReusableLength,
      totalBarsUsed,
    },
    stockInput,
    resolveIndexTargetRemnantLength(settings)
  );

  const batchInfo = b2prof
    ? computeBatchInfoFromCards(groupedRows, demandInput, batchSize)
    : undefined;

  return {
    totalStockLength,
    totalSpentLength,
    totalBarsUsed,
    totalWasteLength,
    totalReusableLength,
    maxReusableRemnantLength,
    cuttingIndex: naiveIndexBreakdown.cuttingIndex,
    cuttingIndexMaterial: naiveIndexBreakdown.cuttingIndexMaterial,
    cuttingIndexSetup: naiveIndexBreakdown.cuttingIndexSetup,
    overallKIM,
    netKIM,
    rows,
    remainingWarehouseStock: [],
    unplacedDemand: [],
    calculationTimeMs: naiveDurationMs,
    telemetry: naiveTelemetry,
    ...(batchInfo ? { batchInfo } : {}),
  };
}

export interface PrimaryStandardSizeInfo {
  primarySize: number;
  label: string;
  counts12: number;
  counts6: number;
  totalBars: number;
}

export function getPrimaryStandardSize(
  solution: FullOptimizationSolution
): PrimaryStandardSizeInfo {
  let counts12 = 0;
  let counts6 = 0;
  let totalBars = 0;

  (solution.rows || []).forEach((r) => {
    totalBars += r.barsCount;
    if (r.barSize >= 10000) {
      counts12 += r.barsCount;
    } else if (r.barSize >= 5000 && r.barSize <= 7000) {
      counts6 += r.barsCount;
    }
  });

  if (counts12 > 0 && counts6 === 0) {
    return { primarySize: 12000, label: '12 м', counts12, counts6, totalBars };
  }
  if (counts6 > 0 && counts12 === 0) {
    return { primarySize: 6000, label: '6 м', counts12, counts6, totalBars };
  }
  if (counts12 >= counts6 && counts12 > 0) {
    return {
      primarySize: 12000,
      label: counts6 > 0 ? '12 / 6 м' : '12 м',
      counts12,
      counts6,
      totalBars,
    };
  }
  if (counts6 > 0) {
    return {
      primarySize: 6000,
      label: counts12 > 0 ? '6 / 12 м' : '6 м',
      counts12,
      counts6,
      totalBars,
    };
  }
  return { primarySize: 12000, label: '12 м', counts12, counts6, totalBars };
}
