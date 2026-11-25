import {
  DpScratchBuffer,
  greedyAlgoIntoBuffer,
  longSumElIntoBuffer,
  sortLongArrayInPlace,
} from './helpers';
import {
  calculateMetrics,
  createCutCard,
  groupIdenticalCards,
} from './metrics';
import {
  CutCard,
  CutContext,
  CutState,
  CuttingStrategy,
  MergedPassResults,
  ParetoFrontPoint,
  PassProfileCandidate,
  PassRangeExecutionResult,
  PassSearchProfile,
  PipelineStep,
} from './types';

export const PASS_CHUNK_SIZE = 24;

function makeEmptyState(context: CutContext): CutState {
  const metrics = calculateMetrics([], context, context.scaledDemand);
  return {
    cards: [],
    metrics,
    unplacedScaled: context.scaledDemand.slice(),
    score: -Infinity,
    context,
    telemetryCounters: {
      passesEvaluated: 0,
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
}

/**
 * Pure Step: StepGroupIdenticalCards
 * Merges all CutCards sharing the same canonical signature (`barSize:sortedPieces`),
 * sums their counts, sorts deterministically, and recalculates metrics via calculateMetrics.
 */
export const StepGroupIdenticalCards: PipelineStep = (
  state: CutState,
  strategy: CuttingStrategy
): CutState => {
  const groupedCards = groupIdenticalCards(state.cards, state.context);
  const metrics = calculateMetrics(groupedCards, state.context, state.unplacedScaled);
  const score = strategy.score(groupedCards, metrics, state.context);

  return {
    ...state,
    cards: groupedCards,
    metrics,
    score,
  };
};

/**
 * Internal WeakMap storing best Stage-2 states at lower speed prefixes (fast, standard)
 * so runCuttingPipeline can guarantee strict monotonicity: deep >= standard >= fast.
 */
const tierPrefixStatesMap = new WeakMap<CutState, CutState[]>();

export function getTierPrefixStates(state: CutState): readonly CutState[] {
  return tierPrefixStatesMap.get(state) || [];
}

function isBetterPassCandidate(
  cand: PassProfileCandidate,
  current: PassProfileCandidate | null
): boolean {
  if (!current) return true;
  if (cand.score !== current.score) return cand.score > current.score;
  return cand.passIndex < current.passIndex;
}

function isBetterFrontTie(a: ParetoFrontPoint, b: ParetoFrontPoint): boolean {
  if (a.totalBarsUsed !== b.totalBarsUsed) return a.totalBarsUsed < b.totalBarsUsed;
  if (a.totalWasteMm !== b.totalWasteMm) return a.totalWasteMm < b.totalWasteMm;
  if (a.score !== b.score) return a.score > b.score;
  return a.passIndex < b.passIndex;
}

function insertIntoParetoFrontInPlace(
  front: ParetoFrontPoint[],
  cand: ParetoFrontPoint
): void {
  for (let i = 0; i < front.length; i++) {
    const q = front[i];
    if (
      q.totalStockLengthMm === cand.totalStockLengthMm &&
      q.uniqueCardsCount === cand.uniqueCardsCount
    ) {
      if (isBetterFrontTie(cand, q)) {
        front[i] = cand;
      }
      return;
    }
    if (
      q.totalStockLengthMm <= cand.totalStockLengthMm &&
      q.uniqueCardsCount <= cand.uniqueCardsCount
    ) {
      return;
    }
  }

  let writeIdx = 0;
  for (let i = 0; i < front.length; i++) {
    const q = front[i];
    const dominatedByCand =
      cand.totalStockLengthMm <= q.totalStockLengthMm &&
      cand.uniqueCardsCount <= q.uniqueCardsCount &&
      (cand.totalStockLengthMm < q.totalStockLengthMm ||
        cand.uniqueCardsCount < q.uniqueCardsCount);
    if (!dominatedByCand) {
      front[writeIdx++] = q;
    }
  }
  front.length = writeIdx;
  front.push(cand);
}

/**
 * Pure pass-range search over [fromPass, toPass) without DOM/Worker dependencies.
 * Executes identically in single-threaded sequential mode and inside Web Worker helpers.
 */
export function executePassRange(
  context: CutContext,
  strategy: CuttingStrategy,
  fromPass: number,
  toPass: number,
  profiles: readonly PassSearchProfile[]
): PassRangeExecutionResult {
  const ctx = context;
  const strideD = ctx.maxSort + 1;
  const strideV = ctx.maxVar + 1;
  const strideZ = strideD * strideV;
  const totalPasses = (ctx.maxSortZ + 1) * strideZ;
  const startPass = Math.max(0, Math.floor(fromPass));
  const endPass = Math.min(totalPasses, Math.floor(toPass));

  if (ctx.scaledDemand.length === 0 || ctx.scaledStockAll.length === 0 || startPass >= endPass) {
    return {
      fromPass: startPass,
      toPass: endPass,
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      earlyExitPassIndex: null,
      aborted: false,
      stage1Ms: 0,
      profiles: [],
      front: [],
    };
  }

  const startTime = ctx.startTime;
  const stage1EndTime = performance.now();
  const stage1Ms = Math.max(0, Number((stage1EndTime - startTime).toFixed(1)));

  const isShaping = strategy.type === 'forced_remnant_shaping';
  const isShapingPlanned =
    !isShaping && ctx.settings.shapeRemnantsInSearch === true && ctx.reusableRemnantMin > 0;
  const pctMin = isShaping ? 65 : 5;
  const pctMax = isShaping ? 90 : isShapingPlanned ? 65 : 90;

  if (startPass === 0) {
    if (isShaping) {
      ctx.onProgress?.({
        stage: 3,
        totalStages: 3,
        stageName: 'Формирование деловых остатков',
        stageStepName: `Подготовка подзаказа (${totalPasses} проходов)`,
        percent: 65,
        placedParts: 0,
        totalParts: ctx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: ctx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1EndTime - startTime),
        viewedPasses: 0,
        totalPasses,
        hasMeasurableProgress: true,
      });
    } else {
      ctx.onProgress?.({
        stage: 1,
        totalStages: 3,
        stageName: 'Анализ спецификации и подготовка заготовок',
        percent: 5,
        placedParts: 0,
        totalParts: ctx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: ctx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1EndTime - startTime),
        hasMeasurableProgress: false,
      });
      ctx.onProgress?.({
        stage: 2,
        totalStages: 3,
        stageName: `Многопроходный подбор схем реза (0/${totalPasses})`,
        stageStepName: `Запуск поиска (${totalPasses} проходов)`,
        percent: 5,
        placedParts: 0,
        totalParts: ctx.totalPartsCount,
        usedBars: 0,
        totalBarsEstimate: ctx.totalBarsEstimate,
        bestKIM: 0,
        uniqueCardsCount: 0,
        elapsedMs: Math.round(stage1EndTime - startTime),
        viewedPasses: 0,
        totalPasses,
        hasMeasurableProgress: true,
      });
    }
  }

  const trackBest = profiles.includes('best');
  const trackFastPrefix = profiles.includes('fastPrefix');
  const trackStdPrefix = profiles.includes('stdPrefix');
  const trackFront = profiles.includes('front');

  let passesEvaluated = 0;
  let prunedPasses = 0;
  let totalCombinationsChecked = 0;
  let earlyExitPassIndex: number | null = null;
  let aborted = false;
  let lastProgressReportTime = performance.now();

  interface DemandValueTracker {
    val: number;
    positions: number[];
    removed: number;
    firstPos: number;
  }
  const maxStockSm = ctx.scaledStockAll[0] || 6000;
  const dpScratch = new DpScratchBuffer(maxStockSm + 1);
  const valTrackersMap = new Map<number, DemandValueTracker>();
  const valTrackers: DemandValueTracker[] = [];
  const activeTrackers: DemandValueTracker[] = [];
  const trackerPool: DemandValueTracker[] = [];
  const patternCounts = new Map<number, number>();
  const candidateItems: number[] = [];
  const arrElBuf: number[] = [];
  const passCardsMap = new Map<
    string,
    { barSize: number; pieceLengths: number[]; count: number }
  >();
  const shuffleDpMemo = new Map<string, number[]>();

  const smArrScratch: number[] = new Array<number>(ctx.scaledStockAll.length);
  const rngScratch: number[] = new Array<number>(ctx.scaledDemand.length);

  let bestCandidate: PassProfileCandidate | null = null;
  let fastPrefixCandidate: PassProfileCandidate | null = null;
  let stdPrefixCandidate: PassProfileCandidate | null = null;
  const chunkFront: ParetoFrontPoint[] = [];

  const nod = ctx.nod;
  const dRez = ctx.bladeWidth;
  const krm = ctx.edgeTrim;
  const delOst = ctx.searchRemnantMin;
  const has6000Active = ctx.activeStandardLengths.includes(6000);
  const max6000Scaled = has6000Active ? Math.floor((6000 - krm) / nod) : 0;

  // Never prune by W_best when collecting a Pareto frontier ('front')
  const isMinMaterialLike =
    strategy.type === 'min_material' || strategy.type === 'forced_remnant_shaping';
  const canPruneByWaste = !trackFront && isMinMaterialLike;

  const canEarlyExitMinMaterial =
    isMinMaterialLike &&
    ctx.scaledStockRemnants.length === 0 &&
    ctx.activeStandardLengths.length <= 1 &&
    maxStockSm > 0;
  const volLowerBound = canEarlyExitMinMaterial
    ? Math.ceil(ctx.totalDemandLengthMm / (maxStockSm * nod))
    : 0;
  const minBarsLowerBound = canEarlyExitMinMaterial
    ? Math.max(volLowerBound, ctx.lpMinBarsLowerBound ?? 0)
    : 0;

  const packingIndependentOfSumData =
    ctx.totalPartsCount > 3000 &&
    !ctx.prioritizeRemnants &&
    (strategy.type === 'min_setups' || strategy.type === 'balance');

  let prevSortZ = -1;
  let prevSort = -1;
  let smArrLen = smArrScratch.length;
  let rngLen = rngScratch.length;
  let initialSumData = 0;

  for (let passIndex = startPass; passIndex < endPass; passIndex++) {
    if (ctx.shouldAbort?.()) {
      aborted = true;
      break;
    }
    passesEvaluated++;

    const sortZ = Math.floor(passIndex / strideZ);
    const rem = passIndex - sortZ * strideZ;
    const sort = Math.floor(rem / strideV);
    const v = rem - sort * strideV;

    if (sortZ !== prevSortZ) {
      prevSortZ = sortZ;
      prevSort = -1;
      if (ctx.prioritizeRemnants) {
        const remLen = ctx.scaledStockRemnants.length;
        const stdLen = ctx.scaledStockStandard.length;
        const remTemp = ctx.scaledStockRemnants.slice();
        sortLongArrayInPlace(remTemp, remLen, sortZ === 0 ? 1 : sortZ === 1 ? 2 : sortZ);
        const stdTemp = ctx.scaledStockStandard.slice();
        sortLongArrayInPlace(stdTemp, stdLen, 1);
        for (let i = 0; i < remLen; i++) smArrScratch[i] = remTemp[i];
        for (let i = 0; i < stdLen; i++) smArrScratch[remLen + i] = stdTemp[i];
      } else {
        for (let i = 0; i < ctx.scaledStockAll.length; i++) {
          smArrScratch[i] = ctx.scaledStockAll[i];
        }
        sortLongArrayInPlace(smArrScratch, smArrScratch.length, sortZ);
      }
      smArrLen = smArrScratch.length;
    }

    if (sort !== prevSort) {
      prevSort = sort;
      for (let i = 0; i < ctx.scaledDemand.length; i++) {
        rngScratch[i] = ctx.scaledDemand[i];
      }
      sortLongArrayInPlace(rngScratch, rngScratch.length, sort);

      valTrackersMap.clear();
      valTrackers.length = 0;
      rngLen = rngScratch.length;
      initialSumData = 0;
      let poolIdx = 0;
      for (let i = 0; i < rngLen; i++) {
        const val = rngScratch[i];
        initialSumData += val;
        let tracker = valTrackersMap.get(val);
        if (!tracker) {
          if (poolIdx < trackerPool.length) {
            tracker = trackerPool[poolIdx++];
            tracker.val = val;
            tracker.positions.length = 0;
            tracker.removed = 0;
            tracker.firstPos = i;
          } else {
            tracker = { val, positions: [], removed: 0, firstPos: i };
            trackerPool.push(tracker);
            poolIdx++;
          }
          valTrackersMap.set(val, tracker);
          valTrackers.push(tracker);
        }
        tracker.positions.push(i);
      }
    }

    for (let t = 0; t < valTrackers.length; t++) {
      const tr = valTrackers[t];
      tr.removed = 0;
      tr.firstPos = tr.positions[0];
    }
    let sumData = initialSumData;
    let remainingCount = rngLen;

    let iSm = 0;
    passCardsMap.clear();
    let passStockMm = 0;
    let passPlacedDemandMm = 0;
    let passPruned = false;
    const bestWasteMm =
      canPruneByWaste && bestCandidate && bestCandidate.metrics.unplacedCount === 0
        ? bestCandidate.metrics.totalStockLengthMm - ctx.totalDemandLengthMm
        : Infinity;
    const useExactShuffleMemo =
      packingIndependentOfSumData && sort >= 8 && valTrackers.length <= 4;
    if (useExactShuffleMemo) {
      shuffleDpMemo.clear();
    }

    while (iSm < smArrLen && remainingCount > 0) {
      totalCombinationsChecked++;
      const sm = smArrScratch[iSm];

      activeTrackers.length = 0;
      for (let t = 0; t < valTrackers.length; t++) {
        const tr = valTrackers[t];
        if (tr.removed < tr.positions.length && tr.val <= sm) {
          tr.firstPos = tr.positions[tr.removed];
          activeTrackers.push(tr);
        }
      }
      for (let i = 1; i < activeTrackers.length; i++) {
        const cur = activeTrackers[i];
        const curPos = cur.firstPos;
        let j = i - 1;
        while (j >= 0 && activeTrackers[j].firstPos > curPos) {
          activeTrackers[j + 1] = activeTrackers[j];
          j--;
        }
        activeTrackers[j + 1] = cur;
      }

      let arrElLen = 0;
      let shuffleMemoKey = '';
      let memoHit = false;
      if (useExactShuffleMemo) {
        shuffleMemoKey = `${sm}`;
        for (let t = 0; t < activeTrackers.length; t++) {
          const tr = activeTrackers[t];
          const count = tr.positions.length - tr.removed;
          const maxCanFit = Math.floor(sm / tr.val);
          const take = count < maxCanFit ? count : maxCanFit;
          shuffleMemoKey += `|${tr.val}:${take}`;
        }
        const cached = shuffleDpMemo.get(shuffleMemoKey);
        if (cached) {
          arrElLen = cached.length;
          for (let i = 0; i < arrElLen; i++) arrElBuf[i] = cached[i];
          memoHit = true;
        }
      }

      if (!memoHit) {
        candidateItems.length = 0;
        for (let t = 0; t < activeTrackers.length; t++) {
          const tr = activeTrackers[t];
          const count = tr.positions.length - tr.removed;
          const maxCanFit = Math.floor(sm / tr.val);
          const take = count < maxCanFit ? count : maxCanFit;
          for (let c = 0; c < take; c++) {
            candidateItems.push(tr.val);
          }
        }

        sortLongArrayInPlace(candidateItems, candidateItems.length, sort);

        const packingCfg = strategy.getSearchPackingConfig(v, sm, sumData, ctx);
        if (packingCfg.useGreedy) {
          arrElLen = greedyAlgoIntoBuffer(candidateItems, candidateItems.length, sm, arrElBuf);
        } else {
          arrElLen = longSumElIntoBuffer(
            candidateItems,
            candidateItems.length,
            packingCfg.targetCap,
            packingCfg.tolerance,
            dpScratch,
            arrElBuf
          );
        }
        if (useExactShuffleMemo) {
          shuffleDpMemo.set(shuffleMemoKey, arrElBuf.slice(0, arrElLen));
        }
      }

      if (arrElLen > 0) {
        let sTemp = 0;
        for (let i = 0; i < arrElLen; i++) sTemp += arrElBuf[i];

        const barSpentMm = sTemp * nod + krm;
        const barTotalMm = sm * nod + krm;
        const isRemnantBar = ctx.remnantBarSizes
          ? ctx.remnantBarSizes.includes(barTotalMm)
          : !ctx.activeStandardLengths.includes(barTotalMm) &&
            barTotalMm !== 6000 &&
            barTotalMm !== 12000 &&
            barTotalMm !== 11700;
        const barKIM = barTotalMm > 0 ? (barSpentMm / barTotalMm) * 100 : 0;
        const barPartsMm = sTemp * nod - arrElLen * dRez;
        const pureFillPct = barTotalMm > 0 ? (barPartsMm / barTotalMm) * 100 : 0;
        const minRemnantFillPct = ctx.remnantMinFillPct ?? ctx.targetRemnantKIM ?? 75;

        if (strategy.type === 'remnant_fill') {
          if (minRemnantFillPct > 0 && pureFillPct < minRemnantFillPct - 1e-6) {
            iSm++;
            continue;
          }
        } else if (
          ctx.prioritizeRemnants &&
          isRemnantBar &&
          minRemnantFillPct > 0 &&
          pureFillPct < minRemnantFillPct - 1e-6
        ) {
          iSm++;
          continue;
        }

        sortLongArrayInPlace(arrElBuf, arrElLen, 1);

        patternCounts.clear();
        const patternPieceLengths: number[] = new Array<number>(arrElLen);
        for (let i = 0; i < arrElLen; i++) {
          const el = arrElBuf[i];
          patternCounts.set(el, (patternCounts.get(el) || 0) + 1);
          patternPieceLengths[i] = el * nod - dRez;
        }

        let maxPatternRepeats = Infinity;
        for (const [el, neededPerBar] of patternCounts.entries()) {
          const tr = valTrackersMap.get(el);
          const available = tr ? tr.positions.length - tr.removed : 0;
          const repeats = Math.floor(available / neededPerBar);
          if (repeats < maxPatternRepeats) {
            maxPatternRepeats = repeats;
          }
        }

        let identicalBarsAvailable = 0;
        while (
          iSm + identicalBarsAvailable < smArrLen &&
          smArrScratch[iSm + identicalBarsAvailable] === sm
        ) {
          identicalBarsAvailable++;
        }

        const rawBatchCount = Math.max(
          1,
          Math.min(maxPatternRepeats, identicalBarsAvailable)
        );

        let effectiveSm = sm;
        if (barTotalMm >= 11000 && has6000Active && sTemp <= max6000Scaled) {
          effectiveSm = max6000Scaled;
        }
        const physicalBarSize = effectiveSm * nod + krm;

        const barWasteMm = (effectiveSm - sTemp) * nod;
        const hasScrapWaste = barWasteMm > 0 && (delOst <= 0 || barWasteMm < delOst);

        let effectiveBatchCount = strategy.getBatchCount(
          rawBatchCount,
          hasScrapWaste,
          barKIM,
          ctx
        );

        if (
          packingIndependentOfSumData &&
          !useExactShuffleMemo &&
          effectiveBatchCount === 1 &&
          rawBatchCount > 1
        ) {
          let safeRepeat = rawBatchCount;
          for (const [el, neededPerBar] of patternCounts.entries()) {
            const tr = valTrackersMap.get(el);
            const available = tr ? tr.positions.length - tr.removed : 0;
            const maxCanFit = Math.floor(sm / el);
            const maxFullPool =
              available >= maxCanFit
                ? 1 + Math.floor((available - maxCanFit) / neededPerBar)
                : 1;
            if (maxFullPool < safeRepeat) {
              safeRepeat = maxFullPool;
            }
          }
          if (safeRepeat > 1) {
            effectiveBatchCount = safeRepeat;
          }
        }

        const sig = `${physicalBarSize}:${patternPieceLengths.join(',')}`;
        const existingGroup = passCardsMap.get(sig);
        if (existingGroup) {
          existingGroup.count += effectiveBatchCount;
        } else {
          passCardsMap.set(sig, {
            barSize: physicalBarSize,
            pieceLengths: patternPieceLengths,
            count: effectiveBatchCount,
          });
        }

        iSm += effectiveBatchCount;

        for (const [el, neededPerBar] of patternCounts.entries()) {
          const dec = neededPerBar * effectiveBatchCount;
          const tr = valTrackersMap.get(el);
          if (tr) {
            tr.removed += dec;
          }
          remainingCount -= dec;
        }
        sumData -= sTemp * effectiveBatchCount;
        if (canPruneByWaste) {
          passStockMm += physicalBarSize * effectiveBatchCount;
          passPlacedDemandMm += sTemp * nod * effectiveBatchCount;
          if (
            bestWasteMm < Infinity &&
            passStockMm - passPlacedDemandMm > bestWasteMm
          ) {
            passPruned = true;
            break;
          }
        }
      } else {
        iSm++;
      }
    }

    const displayPass = passIndex + 1;

    if (passPruned) {
      prunedPasses++;
      if (ctx.onProgress && bestCandidate) {
        const now = performance.now();
        if (now - lastProgressReportTime > 50 || displayPass === totalPasses) {
          lastProgressReportTime = now;
          const elapsed = now - startTime;
          const pct = Math.min(
            pctMax,
            pctMin + Math.round((passesEvaluated / Math.max(1, totalPasses)) * (pctMax - pctMin))
          );
          const activeMetrics = bestCandidate.metrics;
          const placed = ctx.totalPartsCount - activeMetrics.unplacedCount;

          ctx.onProgress({
            stage: isShaping ? 3 : 2,
            totalStages: 3,
            stageName: isShaping
              ? 'Формирование деловых остатков'
              : `Многопроходный подбор схем реза (${passesEvaluated}/${totalPasses})`,
            stageStepName: isShaping
              ? `Проход ${passesEvaluated} из ${totalPasses} · карт ${activeMetrics.uniqueCardsCount} · КИМ ${activeMetrics.overallKIM}%`
              : `Поиск комбинаций: карт ${activeMetrics.uniqueCardsCount} · КИМ ${activeMetrics.overallKIM}%`,
            percent: pct,
            placedParts: Math.max(0, placed),
            totalParts: ctx.totalPartsCount,
            usedBars: activeMetrics.totalBarsUsed,
            totalBarsEstimate: ctx.totalBarsEstimate,
            bestKIM: activeMetrics.overallKIM,
            uniqueCardsCount: activeMetrics.uniqueCardsCount,
            elapsedMs: Math.round(elapsed),
            viewedPasses: passesEvaluated,
            totalPasses,
            hasMeasurableProgress: true,
          });
        }
      }
      continue;
    }

    const rawCards: CutCard[] = [];
    for (const entry of passCardsMap.values()) {
      rawCards.push(createCutCard(entry.barSize, entry.pieceLengths, entry.count, ctx));
    }
    const candCards = groupIdenticalCards(rawCards, ctx);
    const candUnplaced: number[] = [];
    if (remainingCount > 0) {
      for (let t = 0; t < valTrackers.length; t++) {
        const tr = valTrackers[t];
        const remVal = tr.positions.length - tr.removed;
        for (let c = 0; c < remVal; c++) candUnplaced.push(tr.val);
      }
    }
    const candMetrics = calculateMetrics(candCards, ctx, candUnplaced);
    const candScore = strategy.score(candCards, candMetrics, ctx);

    const isFastPrefixPass = sortZ <= 1 && sort <= 7 && v <= 5;
    const isStdPrefixPass = sortZ <= 3 && sort <= 14 && v <= 10;

    if (trackBest) {
      const candObj: PassProfileCandidate = {
        profile: 'best',
        passIndex,
        score: candScore,
        cards: candCards,
        unplacedScaled: candUnplaced,
        metrics: candMetrics,
      };
      if (isBetterPassCandidate(candObj, bestCandidate)) {
        bestCandidate = candObj;
      }
    }

    if (trackFastPrefix && isFastPrefixPass) {
      const candObj: PassProfileCandidate = {
        profile: 'fastPrefix',
        passIndex,
        score: candScore,
        cards: candCards,
        unplacedScaled: candUnplaced,
        metrics: candMetrics,
      };
      if (isBetterPassCandidate(candObj, fastPrefixCandidate)) {
        fastPrefixCandidate = candObj;
      }
    }

    if (trackStdPrefix && isStdPrefixPass) {
      const candObj: PassProfileCandidate = {
        profile: 'stdPrefix',
        passIndex,
        score: candScore,
        cards: candCards,
        unplacedScaled: candUnplaced,
        metrics: candMetrics,
      };
      if (isBetterPassCandidate(candObj, stdPrefixCandidate)) {
        stdPrefixCandidate = candObj;
      }
    }

    if (trackFront && candMetrics.unplacedCount === 0) {
      insertIntoParetoFrontInPlace(chunkFront, {
        passIndex,
        score: candScore,
        totalStockLengthMm: candMetrics.totalStockLengthMm,
        totalBarsUsed: candMetrics.totalBarsUsed,
        uniqueCardsCount: candMetrics.uniqueCardsCount,
        totalWasteMm: candMetrics.totalWasteMm,
        cards: candCards,
        unplacedScaled: candUnplaced,
        metrics: candMetrics,
      });
    }

    if (ctx.onProgress) {
      const now = performance.now();
      if (now - lastProgressReportTime > 50 || displayPass === totalPasses) {
        lastProgressReportTime = now;
        const elapsed = now - startTime;
        const pct = Math.min(
          pctMax,
          pctMin + Math.round((passesEvaluated / Math.max(1, totalPasses)) * (pctMax - pctMin))
        );
        const activeMetrics = bestCandidate ? bestCandidate.metrics : candMetrics;
        const placed = ctx.totalPartsCount - activeMetrics.unplacedCount;

        ctx.onProgress({
          stage: isShaping ? 3 : 2,
          totalStages: 3,
          stageName: isShaping
            ? 'Формирование деловых остатков'
            : `Многопроходный подбор схем реза (${passesEvaluated}/${totalPasses})`,
          stageStepName: isShaping
            ? `Проход ${passesEvaluated} из ${totalPasses} · карт ${activeMetrics.uniqueCardsCount} · КИМ ${activeMetrics.overallKIM}%`
            : `Поиск комбинаций: карт ${activeMetrics.uniqueCardsCount} · КИМ ${activeMetrics.overallKIM}%`,
          percent: pct,
          placedParts: Math.max(0, placed),
          totalParts: ctx.totalPartsCount,
          usedBars: activeMetrics.totalBarsUsed,
          totalBarsEstimate: ctx.totalBarsEstimate,
          bestKIM: activeMetrics.overallKIM,
          uniqueCardsCount: activeMetrics.uniqueCardsCount,
          elapsedMs: Math.round(elapsed),
          viewedPasses: passesEvaluated,
          totalPasses,
          hasMeasurableProgress: true,
        });
      }
    }

    if (
      canEarlyExitMinMaterial &&
      candMetrics.unplacedCount === 0 &&
      candMetrics.totalBarsUsed <= minBarsLowerBound &&
      candMetrics.uniqueCardsCount <= 1 &&
      !(ctx.searchRemnantMin > 0 && candMetrics.totalScrapMm > 0)
    ) {
      earlyExitPassIndex = passIndex;
      break;
    }
  }

  const outProfiles: PassProfileCandidate[] = [];
  if (bestCandidate) outProfiles.push(bestCandidate);
  if (fastPrefixCandidate) outProfiles.push(fastPrefixCandidate);
  if (stdPrefixCandidate) outProfiles.push(stdPrefixCandidate);

  return {
    fromPass: startPass,
    toPass: endPass,
    passesEvaluated,
    prunedPasses,
    totalCombinationsChecked,
    earlyExitPassIndex,
    aborted,
    stage1Ms,
    profiles: outProfiles,
    front: chunkFront,
  };
}

/**
 * Pure merge of pass-range execution results across chunks/helpers.
 * Deterministic tie-breaking by (score desc, passIndex asc), strict early-exit truncation,
 * and non-dominated Pareto front reduction on (totalStockLengthMm, uniqueCardsCount).
 */
export function mergePassResults(
  resultsPerProfile: readonly PassRangeExecutionResult[]
): MergedPassResults {
  if (resultsPerProfile.length === 0) {
    return {
      best: null,
      fastPrefix: null,
      stdPrefix: null,
      front: [],
      passesEvaluated: 0,
      prunedPasses: 0,
      totalCombinationsChecked: 0,
      earlyExitPassIndex: null,
      aborted: false,
      chunksCount: 0,
    };
  }

  let earliestEarlyExit: number | null = null;
  for (let i = 0; i < resultsPerProfile.length; i++) {
    const ee = resultsPerProfile[i].earlyExitPassIndex;
    if (ee !== null && (earliestEarlyExit === null || ee < earliestEarlyExit)) {
      earliestEarlyExit = ee;
    }
  }

  const keptChunks = resultsPerProfile
    .filter((r) => earliestEarlyExit === null || r.fromPass <= earliestEarlyExit)
    .slice()
    .sort((a, b) => a.fromPass - b.fromPass);

  let passesEvaluated = 0;
  let prunedPasses = 0;
  let totalCombinationsChecked = 0;
  let aborted = false;

  let best: PassProfileCandidate | null = null;
  let fastPrefix: PassProfileCandidate | null = null;
  let stdPrefix: PassProfileCandidate | null = null;
  const rawFront: ParetoFrontPoint[] = [];

  for (let i = 0; i < resultsPerProfile.length; i++) {
    if (resultsPerProfile[i].aborted) aborted = true;
  }

  for (let i = 0; i < keptChunks.length; i++) {
    const chunk = keptChunks[i];
    passesEvaluated += chunk.passesEvaluated;
    prunedPasses += chunk.prunedPasses;
    totalCombinationsChecked += chunk.totalCombinationsChecked;

    for (let p = 0; p < chunk.profiles.length; p++) {
      const cand = chunk.profiles[p];
      if (earliestEarlyExit !== null && cand.passIndex > earliestEarlyExit) continue;
      if (cand.profile === 'best') {
        if (isBetterPassCandidate(cand, best)) best = cand;
      } else if (cand.profile === 'fastPrefix') {
        if (isBetterPassCandidate(cand, fastPrefix)) fastPrefix = cand;
      } else if (cand.profile === 'stdPrefix') {
        if (isBetterPassCandidate(cand, stdPrefix)) stdPrefix = cand;
      }
    }

    for (let f = 0; f < chunk.front.length; f++) {
      const pt = chunk.front[f];
      if (earliestEarlyExit !== null && pt.passIndex > earliestEarlyExit) continue;
      rawFront.push(pt);
    }
  }

  rawFront.sort((a, b) => {
    if (a.totalStockLengthMm !== b.totalStockLengthMm) {
      return a.totalStockLengthMm - b.totalStockLengthMm;
    }
    if (a.uniqueCardsCount !== b.uniqueCardsCount) {
      return a.uniqueCardsCount - b.uniqueCardsCount;
    }
    if (a.totalBarsUsed !== b.totalBarsUsed) {
      return a.totalBarsUsed - b.totalBarsUsed;
    }
    if (a.totalWasteMm !== b.totalWasteMm) {
      return a.totalWasteMm - b.totalWasteMm;
    }
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.passIndex - b.passIndex;
  });

  const mergedFront: ParetoFrontPoint[] = [];
  for (let i = 0; i < rawFront.length; i++) {
    const pt = rawFront[i];
    if (mergedFront.length === 0) {
      mergedFront.push(pt);
      continue;
    }
    const prev = mergedFront[mergedFront.length - 1];
    if (pt.uniqueCardsCount < prev.uniqueCardsCount) {
      mergedFront.push(pt);
    }
  }

  return {
    best,
    fastPrefix,
    stdPrefix,
    front: mergedFront,
    passesEvaluated,
    prunedPasses,
    totalCombinationsChecked,
    earlyExitPassIndex: earliestEarlyExit,
    aborted,
    chunksCount: keptChunks.length,
  };
}

export function buildBaseStateFromMergedPassResults(
  ctx: CutContext,
  merged: MergedPassResults,
  stage1Ms: number,
  stage2Ms: number,
  totalPassesPlanned: number,
  threadsUsed = 1,
  chunksProcessed = 0
): CutState {
  if (!merged.best) {
    const empty = makeEmptyState(ctx);
    return {
      ...empty,
      telemetryCounters: {
        ...empty.telemetryCounters,
        passesEvaluated: merged.passesEvaluated,
        prunedPasses: merged.prunedPasses,
        totalCombinationsChecked: merged.totalCombinationsChecked,
        stage1Ms,
        stage2Ms,
        threadsUsed,
        chunksProcessed,
        totalPassesPlanned,
        abortedDuringSearch: merged.aborted,
      },
    };
  }

  const candidateToState = (cand: PassProfileCandidate): CutState => ({
    cards: cand.cards,
    metrics: cand.metrics,
    unplacedScaled: cand.unplacedScaled,
    score: cand.score,
    context: ctx,
    telemetryCounters: {
      passesEvaluated: merged.passesEvaluated,
      prunedPasses: merged.prunedPasses,
      totalCombinationsChecked: merged.totalCombinationsChecked,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: cand.metrics.uniqueCardsCount,
      stage1Ms,
      stage2Ms: 0,
      stage3Ms: 0,
      threadsUsed,
      chunksProcessed,
      totalPassesPlanned,
      abortedDuringSearch: merged.aborted,
    },
  });

  const finalBaseState: CutState = {
    ...candidateToState(merged.best),
    telemetryCounters: {
      passesEvaluated: merged.passesEvaluated,
      prunedPasses: merged.prunedPasses,
      totalCombinationsChecked: merged.totalCombinationsChecked,
      twoOptSwapIterations: 0,
      tailConsolidationCardsMerged: 0,
      initialCardsCount: merged.best.metrics.uniqueCardsCount,
      stage1Ms,
      stage2Ms,
      stage3Ms: 0,
      threadsUsed,
      chunksProcessed,
      totalPassesPlanned,
      abortedDuringSearch: merged.aborted,
    },
  };

  const prefixSnapshots: CutState[] = [];
  if (
    merged.fastPrefix &&
    merged.fastPrefix.passIndex !== merged.best.passIndex &&
    merged.fastPrefix.cards !== merged.best.cards
  ) {
    prefixSnapshots.push(candidateToState(merged.fastPrefix));
  }
  if (
    merged.stdPrefix &&
    merged.stdPrefix.passIndex !== merged.best.passIndex &&
    merged.stdPrefix.cards !== merged.best.cards &&
    (!merged.fastPrefix ||
      (merged.stdPrefix.passIndex !== merged.fastPrefix.passIndex &&
        merged.stdPrefix.cards !== merged.fastPrefix.cards))
  ) {
    prefixSnapshots.push(candidateToState(merged.stdPrefix));
  }
  if (prefixSnapshots.length > 0) {
    tierPrefixStatesMap.set(finalBaseState, prefixSnapshots);
  }

  return finalBaseState;
}

/**
 * Pure Step: StepGenerateBasePatterns
 * Multi-pass DP/Greedy pattern generator parameterized by the active CuttingStrategy.
 * Delegates directly to executePassRange(ctx, strategy, 0, totalPasses, profiles) + mergePassResults.
 */
export const StepGenerateBasePatterns: PipelineStep = (
  initialState: CutState,
  strategy: CuttingStrategy
): CutState => {
  const ctx = initialState.context;
  if (ctx.scaledDemand.length === 0 || ctx.scaledStockAll.length === 0) {
    return makeEmptyState(ctx);
  }
  const totalPasses = (ctx.maxSortZ + 1) * (ctx.maxSort + 1) * (ctx.maxVar + 1);
  const profiles: PassSearchProfile[] = ['best'];
  if (
    ctx.searchSpeed === 'standard' ||
    ctx.searchSpeed === 'exact' ||
    ctx.searchSpeed === 'deep'
  ) {
    profiles.push('fastPrefix');
  }
  if (ctx.searchSpeed === 'deep') {
    profiles.push('stdPrefix');
  }

  const stage2Start = performance.now();
  const res = executePassRange(ctx, strategy, 0, totalPasses, profiles);
  const stage2Ms = Math.max(0, Number((performance.now() - stage2Start).toFixed(1)));
  const merged = mergePassResults([res]);

  return buildBaseStateFromMergedPassResults(
    ctx,
    merged,
    res.stage1Ms,
    stage2Ms,
    totalPasses,
    1,
    0
  );
};

/**
 * Generates Stage-2 base pattern states for multiple cap-parameterized strategies
 * (e.g. MinimizeBalanceStrategy across tolerances) in a single Stage-2 pass.
 */
export function StepGenerateBasePatternsForStrategies(
  initialState: CutState,
  strategies: readonly CuttingStrategy[]
): CutState[] {
  if (strategies.length === 0) return [];
  return executeMultiStrategyBasePasses(initialState, strategies);
}

function executeMultiStrategyBasePasses(
  initialState: CutState,
  multiStrategies: readonly CuttingStrategy[]
): CutState[] {
  const strategy = multiStrategies[0];
  const ctx = initialState.context;
  const targetCount = multiStrategies.length;
  if (ctx.scaledDemand.length === 0 || ctx.scaledStockAll.length === 0) {
    const empty = makeEmptyState(ctx);
    return multiStrategies.map(() => empty);
  }

  const startTime = ctx.startTime;
  const stage1EndTime = performance.now();

  const isShapingPlanned =
    ctx.settings.shapeRemnantsInSearch === true && ctx.reusableRemnantMin > 0;
  const multiStage2EndPct = isShapingPlanned ? 65 : 90;

  ctx.onProgress?.({
    stage: 1,
    totalStages: 3,
    stageName: 'Анализ спецификации и подготовка заготовок',
    percent: 5,
    placedParts: 0,
    totalParts: ctx.totalPartsCount,
    usedBars: 0,
    totalBarsEstimate: ctx.totalBarsEstimate,
    bestKIM: 0,
    uniqueCardsCount: 0,
    elapsedMs: Math.round(stage1EndTime - startTime),
    hasMeasurableProgress: false,
  });

  const totalPasses = (ctx.maxSortZ + 1) * (ctx.maxSort + 1) * (ctx.maxVar + 1);
  let currentPass = 0;
  let totalCombinationsChecked = 0;
  let lastProgressReportTime = performance.now();

  interface DemandValueTracker {
    val: number;
    positions: number[];
    removed: number;
    firstPos: number;
  }
  const maxStockSm = ctx.scaledStockAll[0] || 6000;
  const dpScratch = new DpScratchBuffer(maxStockSm + 1);
  const valTrackersMap = new Map<number, DemandValueTracker>();
  const valTrackers: DemandValueTracker[] = [];
  const activeTrackers: DemandValueTracker[] = [];
  const trackerPool: DemandValueTracker[] = [];
  const patternCounts = new Map<number, number>();
  const candidateItems: number[] = [];
  const arrElBuf: number[] = [];
  const passCardsMap = new Map<
    string,
    { barSize: number; pieceLengths: number[]; count: number }
  >();
  const shuffleDpMemo = new Map<string, number[]>();

  const smArrScratch: number[] = new Array<number>(ctx.scaledStockAll.length);
  const rngScratch: number[] = new Array<number>(ctx.scaledDemand.length);

  let bestState: CutState | null = null;
  const multiBestStates: (CutState | null)[] = new Array<CutState | null>(targetCount).fill(null);
  const multiFastPrefixes: (CutState | null)[] = new Array<CutState | null>(targetCount).fill(null);
  const multiStdPrefixes: (CutState | null)[] = new Array<CutState | null>(targetCount).fill(null);

  const trackFastPrefix =
    ctx.searchSpeed === 'standard' ||
    ctx.searchSpeed === 'exact' ||
    ctx.searchSpeed === 'deep';
  const trackStdPrefix = ctx.searchSpeed === 'deep';

  const nod = ctx.nod;
  const dRez = ctx.bladeWidth;
  const krm = ctx.edgeTrim;
  const delOst = ctx.searchRemnantMin;
  const has6000Active = ctx.activeStandardLengths.includes(6000);
  const max6000Scaled = has6000Active ? Math.floor((6000 - krm) / nod) : 0;

  const packingIndependentOfSumData =
    ctx.totalPartsCount > 3000 &&
    !ctx.prioritizeRemnants &&
    (strategy.type === 'min_setups' || strategy.type === 'balance');

  let aborted = false;

  outerLoopSearch: for (let sortZ = 0; sortZ <= ctx.maxSortZ; sortZ++) {
    if (ctx.prioritizeRemnants) {
      const remLen = ctx.scaledStockRemnants.length;
      const stdLen = ctx.scaledStockStandard.length;
      const remTemp = ctx.scaledStockRemnants.slice();
      sortLongArrayInPlace(remTemp, remLen, sortZ === 0 ? 1 : sortZ === 1 ? 2 : sortZ);
      const stdTemp = ctx.scaledStockStandard.slice();
      sortLongArrayInPlace(stdTemp, stdLen, 1);
      for (let i = 0; i < remLen; i++) smArrScratch[i] = remTemp[i];
      for (let i = 0; i < stdLen; i++) smArrScratch[remLen + i] = stdTemp[i];
    } else {
      for (let i = 0; i < ctx.scaledStockAll.length; i++) {
        smArrScratch[i] = ctx.scaledStockAll[i];
      }
      sortLongArrayInPlace(smArrScratch, smArrScratch.length, sortZ);
    }

    const smArrLen = smArrScratch.length;

    for (let sort = 0; sort <= ctx.maxSort; sort++) {
      for (let i = 0; i < ctx.scaledDemand.length; i++) {
        rngScratch[i] = ctx.scaledDemand[i];
      }
      sortLongArrayInPlace(rngScratch, rngScratch.length, sort);

      valTrackersMap.clear();
      valTrackers.length = 0;
      const rngLen = rngScratch.length;
      let initialSumData = 0;
      let poolIdx = 0;
      for (let i = 0; i < rngLen; i++) {
        const val = rngScratch[i];
        initialSumData += val;
        let tracker = valTrackersMap.get(val);
        if (!tracker) {
          if (poolIdx < trackerPool.length) {
            tracker = trackerPool[poolIdx++];
            tracker.val = val;
            tracker.positions.length = 0;
            tracker.removed = 0;
            tracker.firstPos = i;
          } else {
            tracker = { val, positions: [], removed: 0, firstPos: i };
            trackerPool.push(tracker);
            poolIdx++;
          }
          valTrackersMap.set(val, tracker);
          valTrackers.push(tracker);
        }
        tracker.positions.push(i);
      }

      for (let v = 0; v <= ctx.maxVar; v++) {
        if (ctx.shouldAbort?.()) {
          aborted = true;
          break outerLoopSearch;
        }
        currentPass++;

        for (let t = 0; t < valTrackers.length; t++) {
          const tr = valTrackers[t];
          tr.removed = 0;
          tr.firstPos = tr.positions[0];
        }
        let sumData = initialSumData;
        let remainingCount = rngLen;

        let iSm = 0;
        passCardsMap.clear();
        const useExactShuffleMemo =
          packingIndependentOfSumData && sort >= 8 && valTrackers.length <= 4;
        if (useExactShuffleMemo) {
          shuffleDpMemo.clear();
        }

        while (iSm < smArrLen && remainingCount > 0) {
          totalCombinationsChecked++;
          const sm = smArrScratch[iSm];

          activeTrackers.length = 0;
          for (let t = 0; t < valTrackers.length; t++) {
            const tr = valTrackers[t];
            if (tr.removed < tr.positions.length && tr.val <= sm) {
              tr.firstPos = tr.positions[tr.removed];
              activeTrackers.push(tr);
            }
          }
          for (let i = 1; i < activeTrackers.length; i++) {
            const cur = activeTrackers[i];
            const curPos = cur.firstPos;
            let j = i - 1;
            while (j >= 0 && activeTrackers[j].firstPos > curPos) {
              activeTrackers[j + 1] = activeTrackers[j];
              j--;
            }
            activeTrackers[j + 1] = cur;
          }

          let arrElLen = 0;
          let shuffleMemoKey = '';
          let memoHit = false;
          if (useExactShuffleMemo) {
            shuffleMemoKey = `${sm}`;
            for (let t = 0; t < activeTrackers.length; t++) {
              const tr = activeTrackers[t];
              const count = tr.positions.length - tr.removed;
              const maxCanFit = Math.floor(sm / tr.val);
              const take = count < maxCanFit ? count : maxCanFit;
              shuffleMemoKey += `|${tr.val}:${take}`;
            }
            const cached = shuffleDpMemo.get(shuffleMemoKey);
            if (cached) {
              arrElLen = cached.length;
              for (let i = 0; i < arrElLen; i++) arrElBuf[i] = cached[i];
              memoHit = true;
            }
          }

          if (!memoHit) {
            candidateItems.length = 0;
            for (let t = 0; t < activeTrackers.length; t++) {
              const tr = activeTrackers[t];
              const count = tr.positions.length - tr.removed;
              const maxCanFit = Math.floor(sm / tr.val);
              const take = count < maxCanFit ? count : maxCanFit;
              for (let c = 0; c < take; c++) {
                candidateItems.push(tr.val);
              }
            }

            sortLongArrayInPlace(candidateItems, candidateItems.length, sort);

            const packingCfg = strategy.getSearchPackingConfig(v, sm, sumData, ctx);
            if (packingCfg.useGreedy) {
              arrElLen = greedyAlgoIntoBuffer(candidateItems, candidateItems.length, sm, arrElBuf);
            } else {
              arrElLen = longSumElIntoBuffer(
                candidateItems,
                candidateItems.length,
                packingCfg.targetCap,
                packingCfg.tolerance,
                dpScratch,
                arrElBuf
              );
            }
            if (useExactShuffleMemo) {
              shuffleDpMemo.set(shuffleMemoKey, arrElBuf.slice(0, arrElLen));
            }
          }

          if (arrElLen > 0) {
            let sTemp = 0;
            for (let i = 0; i < arrElLen; i++) sTemp += arrElBuf[i];

            const barSpentMm = sTemp * nod + krm;
            const barTotalMm = sm * nod + krm;
            const isRemnantBar = ctx.remnantBarSizes
              ? ctx.remnantBarSizes.includes(barTotalMm)
              : !ctx.activeStandardLengths.includes(barTotalMm) &&
                barTotalMm !== 6000 &&
                barTotalMm !== 12000 &&
                barTotalMm !== 11700;
            const barKIM = barTotalMm > 0 ? (barSpentMm / barTotalMm) * 100 : 0;
            const barPartsMm = sTemp * nod - arrElLen * dRez;
            const pureFillPct = barTotalMm > 0 ? (barPartsMm / barTotalMm) * 100 : 0;
            const minRemnantFillPct = ctx.remnantMinFillPct ?? ctx.targetRemnantKIM ?? 75;

            if (
              ctx.prioritizeRemnants &&
              isRemnantBar &&
              minRemnantFillPct > 0 &&
              pureFillPct < minRemnantFillPct - 1e-6
            ) {
              iSm++;
              continue;
            }

            sortLongArrayInPlace(arrElBuf, arrElLen, 1);

            patternCounts.clear();
            const patternPieceLengths: number[] = new Array<number>(arrElLen);
            for (let i = 0; i < arrElLen; i++) {
              const el = arrElBuf[i];
              patternCounts.set(el, (patternCounts.get(el) || 0) + 1);
              patternPieceLengths[i] = el * nod - dRez;
            }

            let maxPatternRepeats = Infinity;
            for (const [el, neededPerBar] of patternCounts.entries()) {
              const tr = valTrackersMap.get(el);
              const available = tr ? tr.positions.length - tr.removed : 0;
              const repeats = Math.floor(available / neededPerBar);
              if (repeats < maxPatternRepeats) {
                maxPatternRepeats = repeats;
              }
            }

            let identicalBarsAvailable = 0;
            while (
              iSm + identicalBarsAvailable < smArrLen &&
              smArrScratch[iSm + identicalBarsAvailable] === sm
            ) {
              identicalBarsAvailable++;
            }

            const rawBatchCount = Math.max(
              1,
              Math.min(maxPatternRepeats, identicalBarsAvailable)
            );

            let effectiveSm = sm;
            if (barTotalMm >= 11000 && has6000Active && sTemp <= max6000Scaled) {
              effectiveSm = max6000Scaled;
            }
            const physicalBarSize = effectiveSm * nod + krm;

            const barWasteMm = (effectiveSm - sTemp) * nod;
            const hasScrapWaste = barWasteMm > 0 && (delOst <= 0 || barWasteMm < delOst);

            let effectiveBatchCount = strategy.getBatchCount(
              rawBatchCount,
              hasScrapWaste,
              barKIM,
              ctx
            );

            if (
              packingIndependentOfSumData &&
              !useExactShuffleMemo &&
              effectiveBatchCount === 1 &&
              rawBatchCount > 1
            ) {
              let safeRepeat = rawBatchCount;
              for (const [el, neededPerBar] of patternCounts.entries()) {
                const tr = valTrackersMap.get(el);
                const available = tr ? tr.positions.length - tr.removed : 0;
                const maxCanFit = Math.floor(sm / el);
                const maxFullPool =
                  available >= maxCanFit
                    ? 1 + Math.floor((available - maxCanFit) / neededPerBar)
                    : 1;
                if (maxFullPool < safeRepeat) {
                  safeRepeat = maxFullPool;
                }
              }
              if (safeRepeat > 1) {
                effectiveBatchCount = safeRepeat;
              }
            }

            const sig = `${physicalBarSize}:${patternPieceLengths.join(',')}`;
            const existingGroup = passCardsMap.get(sig);
            if (existingGroup) {
              existingGroup.count += effectiveBatchCount;
            } else {
              passCardsMap.set(sig, {
                barSize: physicalBarSize,
                pieceLengths: patternPieceLengths,
                count: effectiveBatchCount,
              });
            }

            iSm += effectiveBatchCount;

            for (const [el, neededPerBar] of patternCounts.entries()) {
              const dec = neededPerBar * effectiveBatchCount;
              const tr = valTrackersMap.get(el);
              if (tr) {
                tr.removed += dec;
              }
              remainingCount -= dec;
            }
            sumData -= sTemp * effectiveBatchCount;
          } else {
            iSm++;
          }
        }

        const rawCards: CutCard[] = [];
        for (const entry of passCardsMap.values()) {
          rawCards.push(createCutCard(entry.barSize, entry.pieceLengths, entry.count, ctx));
        }
        const candCards = groupIdenticalCards(rawCards, ctx);
        const candUnplaced: number[] = [];
        if (remainingCount > 0) {
          for (let t = 0; t < valTrackers.length; t++) {
            const tr = valTrackers[t];
            const rem = tr.positions.length - tr.removed;
            for (let c = 0; c < rem; c++) candUnplaced.push(tr.val);
          }
        }
        const candMetrics = calculateMetrics(candCards, ctx, candUnplaced);
        const isFastPrefixPass = sortZ <= 1 && sort <= 7 && v <= 5;
        const isStdPrefixPass = sortZ <= 3 && sort <= 14 && v <= 10;

        for (let sIdx = 0; sIdx < multiStrategies.length; sIdx++) {
          const mScore = multiStrategies[sIdx].score(candCards, candMetrics, ctx);
          const curBest = multiBestStates[sIdx];
          if (!curBest || mScore > curBest.score) {
            const newState: CutState = {
              cards: candCards,
              metrics: candMetrics,
              unplacedScaled: candUnplaced,
              score: mScore,
              context: ctx,
              telemetryCounters: {
                passesEvaluated: currentPass,
                totalCombinationsChecked,
                twoOptSwapIterations: 0,
                tailConsolidationCardsMerged: 0,
                initialCardsCount: candMetrics.uniqueCardsCount,
                stage1Ms: Math.max(0, Number((stage1EndTime - startTime).toFixed(1))),
                stage2Ms: 0,
                stage3Ms: 0,
                threadsUsed: 1,
                chunksProcessed: 0,
                totalPassesPlanned: totalPasses,
                abortedDuringSearch: aborted,
              },
            };
            multiBestStates[sIdx] = newState;
            if (sIdx === 0) bestState = newState;
          }
          if (trackFastPrefix && isFastPrefixPass) {
            const curFast = multiFastPrefixes[sIdx];
            if (!curFast || mScore > curFast.score) {
              multiFastPrefixes[sIdx] = {
                cards: candCards,
                metrics: candMetrics,
                unplacedScaled: candUnplaced,
                score: mScore,
                context: ctx,
                telemetryCounters: {
                  passesEvaluated: currentPass,
                  totalCombinationsChecked,
                  twoOptSwapIterations: 0,
                  tailConsolidationCardsMerged: 0,
                  initialCardsCount: candMetrics.uniqueCardsCount,
                  stage1Ms: Math.max(0, Number((stage1EndTime - startTime).toFixed(1))),
                  stage2Ms: 0,
                  stage3Ms: 0,
                },
              };
            }
          }
          if (trackStdPrefix && isStdPrefixPass) {
            const curStd = multiStdPrefixes[sIdx];
            if (!curStd || mScore > curStd.score) {
              multiStdPrefixes[sIdx] = {
                cards: candCards,
                metrics: candMetrics,
                unplacedScaled: candUnplaced,
                score: mScore,
                context: ctx,
                telemetryCounters: {
                  passesEvaluated: currentPass,
                  totalCombinationsChecked,
                  twoOptSwapIterations: 0,
                  tailConsolidationCardsMerged: 0,
                  initialCardsCount: candMetrics.uniqueCardsCount,
                  stage1Ms: Math.max(0, Number((stage1EndTime - startTime).toFixed(1))),
                  stage2Ms: 0,
                  stage3Ms: 0,
                },
              };
            }
          }
        }

        const now = performance.now();
        if (now - lastProgressReportTime > 50 || currentPass === totalPasses) {
          lastProgressReportTime = now;
          const elapsed = now - startTime;
          const pct = Math.min(
            multiStage2EndPct,
            5 + Math.round((currentPass / Math.max(1, totalPasses)) * (multiStage2EndPct - 5))
          );
          const activeMetrics = bestState ? bestState.metrics : candMetrics;
          const placed = ctx.totalPartsCount - activeMetrics.unplacedCount;

          ctx.onProgress?.({
            stage: 2,
            totalStages: 3,
            stageName: `Многопроходный подбор схем реза (${currentPass}/${totalPasses})`,
            stageStepName: `Поиск комбинаций: карт ${activeMetrics.uniqueCardsCount} · КИМ ${activeMetrics.overallKIM}%`,
            percent: pct,
            placedParts: Math.max(0, placed),
            totalParts: ctx.totalPartsCount,
            usedBars: activeMetrics.totalBarsUsed,
            totalBarsEstimate: ctx.totalBarsEstimate,
            bestKIM: activeMetrics.overallKIM,
            uniqueCardsCount: activeMetrics.uniqueCardsCount,
            elapsedMs: Math.round(elapsed),
            viewedPasses: currentPass,
            totalPasses,
            hasMeasurableProgress: true,
          });
        }
      }
    }
  }

  const stage2EndTime = performance.now();
  const stage2Ms = Math.max(0, Number((stage2EndTime - stage1EndTime).toFixed(1)));

  const results: CutState[] = new Array<CutState>(multiStrategies.length);
  for (let sIdx = 0; sIdx < multiStrategies.length; sIdx++) {
    const sBest = multiBestStates[sIdx];
    if (!sBest) {
      results[sIdx] = makeEmptyState(ctx);
      continue;
    }
    const finalBaseState: CutState = {
      ...sBest,
      telemetryCounters: {
        ...sBest.telemetryCounters,
        passesEvaluated: currentPass,
        prunedPasses: 0,
        totalCombinationsChecked,
        initialCardsCount: sBest.metrics.uniqueCardsCount,
        stage2Ms,
        threadsUsed: 1,
        chunksProcessed: 0,
        totalPassesPlanned: totalPasses,
        abortedDuringSearch: aborted,
      },
    };
    const prefixSnapshots: CutState[] = [];
    const fBest = multiFastPrefixes[sIdx];
    const stBest = multiStdPrefixes[sIdx];
    if (fBest && fBest.cards !== sBest.cards) {
      prefixSnapshots.push(fBest);
    }
    if (stBest && stBest.cards !== sBest.cards && (!fBest || stBest.cards !== fBest.cards)) {
      prefixSnapshots.push(stBest);
    }
    if (prefixSnapshots.length > 0) {
      tierPrefixStatesMap.set(finalBaseState, prefixSnapshots);
    }
    results[sIdx] = finalBaseState;
  }
  return results;
}

/**
 * Helper: expands grouped CutCard[] into flat bar arrays for local search mutation.
 */
function expandCardsToFlatBars(
  cards: readonly CutCard[],
  allowSplitting: boolean
): {
  barSizes: number[];
  barCaps: number[];
  barSpent: number[];
  barPieces: number[][];
  barProtected: boolean[];
  barLocked: boolean[];
  barTailSingles: boolean[];
  cardStarts: number[];
  cardEnds: number[];
  cardCounts: number[];
} {
  const barSizes: number[] = [];
  const barCaps: number[] = [];
  const barSpent: number[] = [];
  const barPieces: number[][] = [];
  const barProtected: boolean[] = [];
  const barLocked: boolean[] = [];
  const barTailSingles: boolean[] = [];
  const cardStarts: number[] = new Array<number>(cards.length);
  const cardEnds: number[] = new Array<number>(cards.length);
  const cardCounts: number[] = new Array<number>(cards.length);

  for (let cIdx = 0; cIdx < cards.length; cIdx++) {
    const card = cards[cIdx];
    const isLocked = card.isLockedRemnant === true;
    const isProtected = isLocked || (!allowSplitting && card.count >= 2);
    const start = barSizes.length;
    cardStarts[cIdx] = start;
    cardCounts[cIdx] = card.count;
    for (let k = 0; k < card.count; k++) {
      barSizes.push(card.barSize);
      barCaps.push(card.effectiveSm);
      barSpent.push(card.spentSm);
      barPieces.push(card.pieceLengths.slice());
      barProtected.push(isProtected);
      barLocked.push(isLocked);
      barTailSingles.push(card.isTailSingle === true);
    }
    cardEnds[cIdx] = barSizes.length - 1;
  }

  return {
    barSizes,
    barCaps,
    barSpent,
    barPieces,
    barProtected,
    barLocked,
    barTailSingles,
    cardStarts,
    cardEnds,
    cardCounts,
  };
}

function collapseFlatBarsToState(
  barSizes: readonly number[],
  barPieces: readonly (readonly number[])[],
  barTailSingles: readonly boolean[],
  barLocked: readonly boolean[],
  baseState: CutState,
  strategy: CuttingStrategy,
  extraTwoOptIterations = 0,
  extraCardsMerged = 0
): CutState {
  const rawCards: CutCard[] = [];
  for (let i = 0; i < barSizes.length; i++) {
    if (barPieces[i].length > 0) {
      rawCards.push(
        createCutCard(
          barSizes[i],
          barPieces[i],
          1,
          baseState.context,
          barTailSingles[i],
          barLocked[i]
        )
      );
    }
  }
  const groupedCards = groupIdenticalCards(rawCards, baseState.context);
  const metrics = calculateMetrics(groupedCards, baseState.context, baseState.unplacedScaled);
  const score = strategy.score(groupedCards, metrics, baseState.context);

  return {
    ...baseState,
    cards: groupedCards,
    metrics,
    score,
    telemetryCounters: {
      ...baseState.telemetryCounters,
      twoOptSwapIterations:
        baseState.telemetryCounters.twoOptSwapIterations + extraTwoOptIterations,
      tailConsolidationCardsMerged:
        baseState.telemetryCounters.tailConsolidationCardsMerged + extraCardsMerged,
    },
  };
}

/**
 * Pure Step: Step2OptPostProcess
 * Performs 1-0 bar elimination/compaction, 1-1 swap, and 2-1 cluster swap.
 * Enforces StepGroupIdenticalCards and strict rollback if score decreases.
 */
export const Step2OptPostProcess: PipelineStep = (
  state: CutState,
  strategy: CuttingStrategy
): CutState => {
  const ctx = state.context;
  if (state.metrics.totalBarsUsed <= 1) return state;

  const maxRounds =
    ctx.searchSpeed === 'deep'
      ? 30
      : ctx.searchSpeed === 'standard' || ctx.searchSpeed === 'exact'
        ? 15
        : 6;

  let currentState = state;
  const nod = ctx.nod;
  const dRez = ctx.bladeWidth;
  const delOst = ctx.searchRemnantMin;

  let roundsExecuted = 0;

  const isPreShapingStage3 =
    ctx.settings.shapeRemnantsInSearch === true &&
    ctx.reusableRemnantMin > 0 &&
    strategy.type !== 'forced_remnant_shaping';

  for (let round = 0; round < maxRounds; round++) {
    if (ctx.shouldAbort?.()) break;
    roundsExecuted++;

    ctx.onProgress?.({
      stage: 3,
      totalStages: 3,
      stageName: 'Локальная переупаковка 2-Opt',
      stageStepName: `Локальная переупаковка 2-Opt (раунд ${round + 1}/${maxRounds}) · Карт: ${currentState.metrics.uniqueCardsCount}`,
      percent: isPreShapingStage3
        ? 65
        : Math.min(94, 90 + Math.round(((round + 1) / maxRounds) * 4)),
      placedParts: ctx.totalPartsCount - currentState.metrics.unplacedCount,
      totalParts: ctx.totalPartsCount,
      usedBars: currentState.metrics.totalBarsUsed,
      totalBarsEstimate: ctx.totalBarsEstimate,
      bestKIM: currentState.metrics.overallKIM,
      uniqueCardsCount: currentState.metrics.uniqueCardsCount,
      elapsedMs: Math.round(performance.now() - ctx.startTime),
      hasMeasurableProgress: false,
    });

    const {
      barSizes,
      barCaps,
      barSpent,
      barPieces,
      barProtected,
      barLocked,
      barTailSingles,
      cardStarts,
      cardEnds,
      cardCounts,
    } = expandCardsToFlatBars(currentState.cards, strategy.allowPatternSplitting);
    const kout = barSizes.length;
    const numCards = cardCounts.length;
    if (kout <= 1) break;

    let roundModified = false;

    // 1. 1-0 Bar Elimination / Compaction (test last bar per unique card)
    const tempCapacities = new Array<number>(kout);
    for (let cIdx = numCards - 1; cIdx >= 0; cIdx--) {
      if (cardCounts[cIdx] <= 0) continue;
      const i = cardEnds[cIdx];
      if (barPieces[i].length === 0) continue;
      if (barLocked[i] || (barProtected[i] && !strategy.allowPatternSplitting)) continue;

      for (let c = 0; c < kout; c++) {
        tempCapacities[c] = barCaps[c] - barSpent[c];
      }

      const sortedPiecesI = barPieces[i].slice().sort((a, b) => b - a);
      const moves: { targetBar: number; pieceMm: number; pieceScaled: number }[] = [];
      let canEliminate = true;

      for (let p = 0; p < sortedPiecesI.length; p++) {
        const pieceMm = sortedPiecesI[p];
        const pieceScaled = Math.floor((pieceMm + dRez) / nod);
        let placed = false;
        for (let j = 0; j < kout; j++) {
          if (i === j || barPieces[j].length === 0) continue;
          if (barLocked[j] || (!strategy.allowPatternSplitting && barProtected[j])) continue;
          if (tempCapacities[j] >= pieceScaled) {
            tempCapacities[j] -= pieceScaled;
            moves.push({ targetBar: j, pieceMm, pieceScaled });
            placed = true;
            break;
          }
        }
        if (!placed) {
          canEliminate = false;
          break;
        }
      }

      if (canEliminate && moves.length === barPieces[i].length) {
        for (let m = 0; m < moves.length; m++) {
          const mv = moves[m];
          barPieces[mv.targetBar].push(mv.pieceMm);
          barSpent[mv.targetBar] += mv.pieceScaled;
        }
        barPieces[i].length = 0;
        barSpent[i] = 0;
        roundModified = true;
        break;
      }
    }

    // 2. 1-1 Piece Swap (test one representative per unique card pair)
    if (!roundModified) {
      outer11: for (let cI = 0; cI < numCards; cI++) {
        if (cardCounts[cI] <= 0) continue;
        const i = cardStarts[cI];
        if (barProtected[i] || barPieces[i].length === 0) continue;
        const capI = barCaps[i];

        for (let cJ = cI; cJ < numCards; cJ++) {
          if (cJ === cI && cardCounts[cI] < 2) continue;
          if (cardCounts[cJ] <= 0) continue;
          const j = cJ === cI ? i + 1 : cardStarts[cJ];
          if (barProtected[j] || barPieces[j].length === 0) continue;
          const capJ = barCaps[j];

          for (let pI = 0; pI < barPieces[i].length; pI++) {
            const pieceI = barPieces[i][pI];
            const scI = Math.floor((pieceI + dRez) / nod);

            for (let pJ = 0; pJ < barPieces[j].length; pJ++) {
              const pieceJ = barPieces[j][pJ];
              const scJ = Math.floor((pieceJ + dRez) / nod);
              if (scI === scJ) continue;

              const newSmI = barSpent[i] - scI + scJ;
              const newSmJ = barSpent[j] - scJ + scI;
              if (newSmI > capI || newSmJ > capJ) continue;

              const oldScrapI = (capI - barSpent[i]) * nod;
              const oldScrapJ = (capJ - barSpent[j]) * nod;
              const newScrapI = (capI - newSmI) * nod;
              const newScrapJ = (capJ - newSmJ) * nod;

              const oldUnusable =
                (delOst > 0 && oldScrapI >= delOst ? 0 : oldScrapI) +
                (delOst > 0 && oldScrapJ >= delOst ? 0 : oldScrapJ);
              const newUnusable =
                (delOst > 0 && newScrapI >= delOst ? 0 : newScrapI) +
                (delOst > 0 && newScrapJ >= delOst ? 0 : newScrapJ);

              const promising = newUnusable < oldUnusable;

              if (promising) {
                barPieces[i][pI] = pieceJ;
                barPieces[j][pJ] = pieceI;
                barSpent[i] = newSmI;
                barSpent[j] = newSmJ;
                roundModified = true;
                break outer11;
              }
            }
          }
        }
      }
    }

    // 3. 2-1 Cluster Swap (test one representative per unique card pair)
    if (!roundModified) {
      outer21: for (let cI = 0; cI < numCards; cI++) {
        if (cardCounts[cI] <= 0) continue;
        const i = cardStarts[cI];
        if (barProtected[i] || barPieces[i].length < 2) continue;
        const capI = barCaps[i];

        for (let cJ = 0; cJ < numCards; cJ++) {
          if (cJ === cI && cardCounts[cI] < 2) continue;
          if (cardCounts[cJ] <= 0) continue;
          const j = cJ === cI ? i + 1 : cardStarts[cJ];
          if (barProtected[j] || barPieces[j].length === 0) continue;
          const capJ = barCaps[j];

          for (let pI1 = 0; pI1 < barPieces[i].length; pI1++) {
            for (let pI2 = pI1 + 1; pI2 < barPieces[i].length; pI2++) {
              const pieceI1 = barPieces[i][pI1];
              const pieceI2 = barPieces[i][pI2];
              const scI =
                Math.floor((pieceI1 + dRez) / nod) + Math.floor((pieceI2 + dRez) / nod);

              for (let pJ = 0; pJ < barPieces[j].length; pJ++) {
                const pieceJ = barPieces[j][pJ];
                const scJ = Math.floor((pieceJ + dRez) / nod);
                if (scI === scJ) continue;

                const newSmI = barSpent[i] - scI + scJ;
                const newSmJ = barSpent[j] - scJ + scI;
                if (newSmI > capI || newSmJ > capJ) continue;

                const oldScrapI = (capI - barSpent[i]) * nod;
                const oldScrapJ = (capJ - barSpent[j]) * nod;
                const newScrapI = (capI - newSmI) * nod;
                const newScrapJ = (capJ - newSmJ) * nod;

                const oldUnusable =
                  (delOst > 0 && oldScrapI >= delOst ? 0 : oldScrapI) +
                  (delOst > 0 && oldScrapJ >= delOst ? 0 : oldScrapJ);
                const newUnusable =
                  (delOst > 0 && newScrapI >= delOst ? 0 : newScrapI) +
                  (delOst > 0 && newScrapJ >= delOst ? 0 : newScrapJ);

                const promising =
                  newUnusable < oldUnusable ||
                  (newUnusable === oldUnusable &&
                    newUnusable === 0 &&
                    Math.max(newScrapI, newScrapJ) > Math.max(oldScrapI, oldScrapJ));

                if (promising) {
                  barPieces[j].splice(pJ, 1, pieceI1, pieceI2);
                  barPieces[i].splice(pI2, 1);
                  barPieces[i].splice(pI1, 1, pieceJ);
                  barSpent[i] = newSmI;
                  barSpent[j] = newSmJ;
                  roundModified = true;
                  break outer21;
                }
              }
            }
          }
        }
      }
    }

    if (!roundModified) break;

    // Normalize through StepGroupIdenticalCards and verify strategy.score()
    const candidateState = collapseFlatBarsToState(
      barSizes,
      barPieces,
      barTailSingles,
      barLocked,
      currentState,
      strategy,
      1,
      0
    );

    if (candidateState.score > currentState.score) {
      currentState = candidateState;
    } else {
      // Strict rollback: candidate did not improve strategy score
      break;
    }
  }

  return {
    ...currentState,
    telemetryCounters: {
      ...currentState.telemetryCounters,
      twoOptSwapIterations: Math.max(
        currentState.telemetryCounters.twoOptSwapIterations,
        roundsExecuted
      ),
    },
  };
};

/**
 * Pure Step: StepOptimizeWaste
 * Handles:
 * 1) Fill-Control re-nesting of underfilled dual-profile cards (when fillControlEnabled is active).
 * 2) Tail-waste polishing & standard-bar downsizing (12000 -> 6000 when active) to boost KIM.
 * Always normalizes with StepGroupIdenticalCards and strictly rolls back any non-beneficial repack.
 */
export const StepOptimizeWaste: PipelineStep = (
  state: CutState,
  strategy: CuttingStrategy
): CutState => {
  const ctx = state.context;
  let currentState = state;

  // 1. Optional user-enabled Fill Control (Контроль заполнения крайней пары)
  if (ctx.fillControlEnabled && ctx.dualProfileCut && currentState.cards.length > 0) {
    const threshold = ctx.fillControlThreshold;
    const piecesToReNest: number[] = [];
    const preservedCards: CutCard[] = [];

    for (let i = 0; i < currentState.cards.length; i++) {
      const card = currentState.cards[i];
      const purePartsKIM = card.barSize > 0 ? (card.partsLengthMm / card.barSize) * 100 : 0;
      const isUnderfilled =
        !card.isLockedRemnant &&
        card.pieceLengths.length > 0 &&
        (purePartsKIM < threshold || (card.barSize >= 5000 && purePartsKIM < 70));

      if (isUnderfilled) {
        for (let c = 0; c < card.count; c++) {
          for (let p = 0; p < card.pieceLengths.length; p++) {
            piecesToReNest.push(card.pieceLengths[p]);
          }
        }
      } else {
        preservedCards.push(card);
      }
    }

    if (piecesToReNest.length > 0) {
      const consumedCountByLen = new Map<number, number>();
      for (const c of preservedCards) {
        consumedCountByLen.set(c.barSize, (consumedCountByLen.get(c.barSize) || 0) + c.count);
      }

      // Recompute available scaled stock after preservedCards
      const remStockAll: number[] = [];
      for (const s of ctx.stockInput) {
        if (s.isActive === false) continue;
        const sm = Math.floor((s.length - ctx.edgeTrim) / ctx.nod);
        if (sm <= 0) continue;
        const isAuto =
          s.isStandardUnlimited ||
          ((s.length === 6000 || s.length === 12000) && s.quantity <= 0);
        const used = consumedCountByLen.get(s.length) || 0;
        const qty = isAuto ? Math.max(50, piecesToReNest.length) : Math.max(0, s.quantity - used);
        if (!isAuto && used > 0) {
          consumedCountByLen.set(s.length, Math.max(0, used - s.quantity));
        }
        for (let q = 0; q < qty; q++) remStockAll.push(sm);
      }
      remStockAll.sort((a, b) => b - a);

      const reNestScaledDemand = piecesToReNest.map((len) =>
        Math.floor((len + ctx.bladeWidth) / ctx.nod)
      );

      if (remStockAll.length > 0 && reNestScaledDemand.length > 0) {
        const subCtx: CutContext = {
          ...ctx,
          dualProfileCut: false,
          fillControlEnabled: false,
          scaledDemand: reNestScaledDemand,
          scaledStockAll: remStockAll,
          totalPartsCount: reNestScaledDemand.length,
          maxSortZ: Math.min(1, ctx.maxSortZ),
          maxSort: Math.min(5, ctx.maxSort),
          maxVar: Math.min(4, ctx.maxVar),
          onProgress: undefined,
        };

        const subInitial: CutState = {
          cards: [],
          metrics: calculateMetrics([], subCtx, reNestScaledDemand),
          unplacedScaled: reNestScaledDemand,
          score: -Infinity,
          context: subCtx,
          telemetryCounters: currentState.telemetryCounters,
        };

        // Re-nest using single-profile material-minimizing packing
        const reNestStrategy: CuttingStrategy = {
          type: 'min_material',
          name: 'Минимум материала (контроль заполнения)',
          allowPatternSplitting: true,
          score: (cards, metrics, sCtx) => {
            if (metrics.unplacedCount > 0) {
              return -1e12 - metrics.unplacedLengthMm * 1e3;
            }
            const sMin = sCtx.searchRemnantMin;
            let searchWasteMm = metrics.totalWasteMm;
            if (sMin !== sCtx.reusableRemnantMin) {
              searchWasteMm = 0;
              for (let i = 0; i < cards.length; i++) {
                const c = cards[i];
                if (c.count <= 0) continue;
                const scrap = sMin > 0 && c.remainderMm >= sMin ? 0 : c.remainderMm;
                searchWasteMm += (c.trimLossMm + c.kerfLossMm + scrap) * c.count;
              }
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
          },
          getSearchPackingConfig: (passVar, sm) =>
            passVar === 0
              ? { useGreedy: true, targetCap: sm, tolerance: 0 }
              : {
                  useGreedy: false,
                  targetCap: sm,
                  tolerance: passVar <= 4 ? passVar - 1 : Math.floor((sm * (passVar - 3)) / 150),
                },
          getBatchCount: () => 1,
          buildPipeline: () => [],
        };
        const reNested = StepGenerateBasePatterns(subInitial, reNestStrategy);

        if (reNested.cards.length > 0 && reNested.metrics.unplacedCount === 0) {
          const combined = groupIdenticalCards([...preservedCards, ...reNested.cards], ctx);
          const metrics = calculateMetrics(combined, ctx, currentState.unplacedScaled);
          const score = strategy.score(combined, metrics, ctx);
          currentState = {
            ...currentState,
            cards: combined,
            metrics,
            score,
          };
        }
      }
    }
  }

  // 2. Adaptive bar downsizing (12m -> 6m) and tail-waste repacking for waste-sensitive strategies
  if (!strategy.allowPatternSplitting) {
    return currentState;
  }

  const has6000Active = ctx.activeStandardLengths.includes(6000);
  if (has6000Active) {
    let downsizedAny = false;
    const adjustedCards = currentState.cards.map((card) => {
      if (!card.isLockedRemnant && card.barSize >= 11000 && card.partsLengthMm > 0) {
        const trimCuts = ctx.edgeTrim > 0 ? 1 : 0;
        const n = card.pieceLengths.length;
        const cutsMin = trimCuts + Math.max(0, n - 1);
        const neededWithTrailingCut = card.partsLengthMm + ctx.edgeTrim + (cutsMin + 1) * ctx.bladeWidth;
        const neededExact = card.partsLengthMm + ctx.edgeTrim + cutsMin * ctx.bladeWidth;
        if (neededExact <= 6000 && (neededWithTrailingCut <= 6000 || 6000 - neededExact <= ctx.bladeWidth)) {
          downsizedAny = true;
          return createCutCard(6000, card.pieceLengths, card.count, ctx);
        }
      }
      return card;
    });

    if (downsizedAny) {
      const grouped = groupIdenticalCards(adjustedCards, ctx);
      const metrics = calculateMetrics(grouped, ctx, currentState.unplacedScaled);
      const newScore = strategy.score(grouped, metrics, ctx);
      if (newScore > currentState.score) {
        currentState = {
          ...currentState,
          cards: grouped,
          metrics,
          score: newScore,
        };
      }
    }
  }

  // 3. Tail scrap repacking on lowest-efficiency cards (up to 6 bars with search scrap > 0)
  const searchDelOst = ctx.searchRemnantMin;
  const getSearchScrapMm = (c: CutCard): number =>
    searchDelOst > 0 && c.remainderMm >= searchDelOst ? 0 : c.remainderMm;

  const scrapBarsIndices: number[] = [];
  for (let i = 0; i < currentState.cards.length; i++) {
    const c = currentState.cards[i];
    if (!c.isLockedRemnant && getSearchScrapMm(c) > 0 && c.count <= 2) {
      scrapBarsIndices.push(i);
    }
  }

  if (scrapBarsIndices.length >= 2) {
    // Pool pieces from up to 6 tail cards with highest search scrap waste
    scrapBarsIndices.sort(
      (a, b) =>
        getSearchScrapMm(currentState.cards[b]) - getSearchScrapMm(currentState.cards[a])
    );
    const chosenIndices = new Set(scrapBarsIndices.slice(0, 6));
    const pooledPieces: number[] = [];
    const pooledCaps: number[] = [];
    const preserved: CutCard[] = [];

    for (let i = 0; i < currentState.cards.length; i++) {
      const card = currentState.cards[i];
      if (chosenIndices.has(i)) {
        for (let k = 0; k < card.count; k++) {
          pooledCaps.push(card.barSize);
          for (let p = 0; p < card.pieceLengths.length; p++) {
            pooledPieces.push(card.pieceLengths[p]);
          }
        }
      } else {
        preserved.push(card);
      }
    }

    if (pooledPieces.length > 0 && pooledCaps.length >= 2) {
      pooledCaps.sort((a, b) => b - a);
      const nod = ctx.nod;
      const dRez = ctx.bladeWidth;
      const krm = ctx.edgeTrim;
      const dpScratch = new DpScratchBuffer(
        Math.floor((pooledCaps[0] - krm) / nod) + 2
      );
      const dpOut: number[] = [];
      const unassigned = pooledPieces.slice().sort((a, b) => b - a);
      const repacked: CutCard[] = [];
      let capIdx = 0;

      while (unassigned.length > 0 && capIdx < pooledCaps.length) {
        const barSize = pooledCaps[capIdx];
        const sm = Math.floor((barSize - krm) / nod);
        const scaled = unassigned.map((p) => Math.floor((p + dRez) / nod));
        const packedLen = longSumElIntoBuffer(
          scaled,
          scaled.length,
          sm,
          0,
          dpScratch,
          dpOut
        );

        if (packedLen === 0) break;

        const chosenPieces: number[] = [];
        const usedIdx = new Set<number>();
        for (let o = 0; o < packedLen; o++) {
          const scVal = dpOut[o];
          const foundIdx = unassigned.findIndex(
            (p, idx) => !usedIdx.has(idx) && Math.floor((p + dRez) / nod) === scVal
          );
          if (foundIdx >= 0) {
            usedIdx.add(foundIdx);
            chosenPieces.push(unassigned[foundIdx]);
          }
        }

        if (chosenPieces.length === 0) break;

        let writeIdx = 0;
        for (let i = 0; i < unassigned.length; i++) {
          if (!usedIdx.has(i)) {
            unassigned[writeIdx++] = unassigned[i];
          }
        }
        unassigned.length = writeIdx;

        // Downsize to 6000 if active and fits
        let finalBarSize = barSize;
        if (has6000Active && barSize >= 11000) {
          const partsSum = chosenPieces.reduce((a, b) => a + b, 0);
          const cutsMin = (krm > 0 ? 1 : 0) + Math.max(0, chosenPieces.length - 1);
          if (partsSum + krm + cutsMin * dRez <= 6000) {
            finalBarSize = 6000;
          }
        }

        repacked.push(createCutCard(finalBarSize, chosenPieces, 1, ctx));
        capIdx++;
      }

      if (unassigned.length === 0) {
        const candidateCards = groupIdenticalCards([...preserved, ...repacked], ctx);
        const candidateMetrics = calculateMetrics(
          candidateCards,
          ctx,
          currentState.unplacedScaled
        );
        const candidateScore = strategy.score(candidateCards, candidateMetrics, ctx);

        if (candidateScore > currentState.score) {
          currentState = {
            ...currentState,
            cards: candidateCards,
            metrics: candidateMetrics,
            score: candidateScore,
          };
        }
      }
    }
  }

  return currentState;
};

/**
 * Pure Step: StepConsolidateSetups
 * Merges fragmented minor/tail cards into dominant major cutting cards to minimize saw setups.
 * Always normalizes with StepGroupIdenticalCards and strictly rolls back if score decreases.
 */
export const StepConsolidateSetups: PipelineStep = (
  state: CutState,
  strategy: CuttingStrategy
): CutState => {
  const ctx = state.context;
  if (state.metrics.totalBarsUsed <= 2 || state.cards.length <= 1) return state;

  let currentState = state;
  const candidateThresholds = [1, 2, 3, 4, 5, 6, 8, 10, 15];

  const nod = ctx.nod;
  const dRez = ctx.bladeWidth;
  const maxBarSm = ctx.scaledStockAll[0] || 6000;
  const dpScratch = new DpScratchBuffer(maxBarSm + 2);
  const dpOutBuf: number[] = [];

  const isPreShapingStage3 =
    ctx.settings.shapeRemnantsInSearch === true &&
    ctx.reusableRemnantMin > 0 &&
    strategy.type !== 'forced_remnant_shaping';

  for (let iter = 0; iter < 6; iter++) {
    if (ctx.shouldAbort?.()) break;

    ctx.onProgress?.({
      stage: 3,
      totalStages: 3,
      stageName: 'Консолидация хвостов и схлопывание карт',
      stageStepName: `Схлопывание карт хвостов (итерация ${iter + 1}/6 · карт: ${currentState.metrics.uniqueCardsCount})`,
      percent: isPreShapingStage3 ? 65 : Math.min(98, 94 + Math.round(((iter + 1) / 6) * 4)),
      placedParts: ctx.totalPartsCount - currentState.metrics.unplacedCount,
      totalParts: ctx.totalPartsCount,
      usedBars: currentState.metrics.totalBarsUsed,
      totalBarsEstimate: ctx.totalBarsEstimate,
      bestKIM: currentState.metrics.overallKIM,
      uniqueCardsCount: currentState.metrics.uniqueCardsCount,
      elapsedMs: Math.round(performance.now() - ctx.startTime),
      hasMeasurableProgress: false,
    });

    const lockedGroups = currentState.cards.filter((g) => g.isLockedRemnant === true);
    const groups = currentState.cards
      .filter((g) => g.isLockedRemnant !== true)
      .sort((a, b) => b.count - a.count);
    if (groups.length <= 1) break;

    const majorGroups = groups.filter((g) => g.count >= 2);
    if (majorGroups.length === 0) {
      majorGroups.push(groups[0]);
    }

    let improvedInIter = false;

    for (let tIdx = 0; tIdx < candidateThresholds.length; tIdx++) {
      const maxTailCount = candidateThresholds[tIdx];
      const tailGroups = groups.filter((g) => g.count <= maxTailCount);
      if (tailGroups.length === 0) continue;

      const tailPieces: number[] = [];
      const tailBarSizes: number[] = [];
      for (const tg of tailGroups) {
        for (let c = 0; c < tg.count; c++) {
          tailBarSizes.push(tg.barSize);
          for (let p = 0; p < tg.pieceLengths.length; p++) {
            tailPieces.push(tg.pieceLengths[p]);
          }
        }
      }
      if (tailPieces.length === 0) continue;

      const tailFreq = new Map<number, number>();
      for (const p of tailPieces) {
        tailFreq.set(p, (tailFreq.get(p) || 0) + 1);
      }

      for (const major of majorGroups) {
        if (tailGroups.includes(major)) continue;

        const requiredPerBar = new Map<number, number>();
        for (const p of major.pieceLengths) {
          requiredPerBar.set(p, (requiredPerBar.get(p) || 0) + 1);
        }

        let maxAdditional = Infinity;
        for (const [p, req] of requiredPerBar.entries()) {
          const avail = tailFreq.get(p) || 0;
          const possible = Math.floor(avail / req);
          if (possible < maxAdditional) {
            maxAdditional = possible;
          }
        }

        if (maxAdditional <= 0 || maxAdditional === Infinity) continue;

        for (let kAdd = maxAdditional; kAdd >= 1; kAdd--) {
          const usableTailBars = tailBarSizes.slice().sort((a, b) => b - a);
          let assignedCount = 0;
          for (let k = 0; k < kAdd; k++) {
            const bIdx = usableTailBars.findIndex((sz) => sz >= major.barSize);
            if (bIdx >= 0) {
              assignedCount++;
              usableTailBars.splice(bIdx, 1);
            }
          }
          if (assignedCount < kAdd) continue;

          const remainingTailFreq = new Map(tailFreq);
          for (const [p, req] of requiredPerBar.entries()) {
            remainingTailFreq.set(p, (remainingTailFreq.get(p) || 0) - req * kAdd);
          }

          const unassignedPieces: number[] = [];
          for (const [p, cnt] of remainingTailFreq.entries()) {
            for (let c = 0; c < cnt; c++) unassignedPieces.push(p);
          }
          unassignedPieces.sort((a, b) => b - a);

          const repackedCards: CutCard[] = [];
          let barSlotIdx = 0;
          let allRemainingPacked = true;

          while (unassignedPieces.length > 0) {
            if (barSlotIdx >= usableTailBars.length) {
              allRemainingPacked = false;
              break;
            }
            const barSize = usableTailBars[barSlotIdx];
            const barCapSm = Math.floor((barSize - ctx.edgeTrim) / nod);
            let totalRemainingScaled = 0;
            for (let u = 0; u < unassignedPieces.length; u++) {
              totalRemainingScaled += Math.floor((unassignedPieces[u] + dRez) / nod);
            }

            const packedOnBar: number[] = [];
            if (totalRemainingScaled <= barCapSm) {
              packedOnBar.push(...unassignedPieces);
              unassignedPieces.length = 0;
            } else {
              const scaledPieces = unassignedPieces.map((p) => Math.floor((p + dRez) / nod));
              const dpCount = longSumElIntoBuffer(
                scaledPieces,
                scaledPieces.length,
                barCapSm,
                Math.floor(barCapSm * 0.15),
                dpScratch,
                dpOutBuf
              );

              if (dpCount > 0) {
                const toRemoveIdx = new Set<number>();
                for (let d = 0; d < dpCount; d++) {
                  const scVal = dpOutBuf[d];
                  const foundIdx = unassignedPieces.findIndex(
                    (p, pI) => !toRemoveIdx.has(pI) && Math.floor((p + dRez) / nod) === scVal
                  );
                  if (foundIdx >= 0) {
                    toRemoveIdx.add(foundIdx);
                    packedOnBar.push(unassignedPieces[foundIdx]);
                  }
                }
                let writeIdx = 0;
                for (let pI = 0; pI < unassignedPieces.length; pI++) {
                  if (!toRemoveIdx.has(pI)) {
                    unassignedPieces[writeIdx++] = unassignedPieces[pI];
                  }
                }
                unassignedPieces.length = writeIdx;
              } else {
                let space = barCapSm;
                let writeIdx = 0;
                for (let pI = 0; pI < unassignedPieces.length; pI++) {
                  const p = unassignedPieces[pI];
                  const sc = Math.floor((p + dRez) / nod);
                  if (sc <= space) {
                    packedOnBar.push(p);
                    space -= sc;
                  } else {
                    unassignedPieces[writeIdx++] = p;
                  }
                }
                unassignedPieces.length = writeIdx;
              }
            }

            if (packedOnBar.length === 0) {
              allRemainingPacked = false;
              break;
            }

            repackedCards.push(createCutCard(barSize, packedOnBar, 1, ctx));
            barSlotIdx++;
          }

          if (!allRemainingPacked) continue;
          if (kAdd + repackedCards.length > tailBarSizes.length) continue;

          const preservedCards = [
            ...lockedGroups,
            ...groups.filter((g) => !tailGroups.includes(g) && g !== major),
          ];
          const expandedMajor: CutCard = {
            ...major,
            count: major.count + kAdd,
          };

          const candidateCards = groupIdenticalCards(
            [...preservedCards, expandedMajor, ...repackedCards],
            ctx
          );
          const candidateMetrics = calculateMetrics(
            candidateCards,
            ctx,
            currentState.unplacedScaled
          );
          const candidateScore = strategy.score(candidateCards, candidateMetrics, ctx);

          // Strict rollback check: only accept if strategy score strictly improves
          if (candidateScore > currentState.score) {
            const mergedDiff = Math.max(
              0,
              currentState.metrics.uniqueCardsCount - candidateMetrics.uniqueCardsCount
            );
            currentState = {
              ...currentState,
              cards: candidateCards,
              metrics: candidateMetrics,
              score: candidateScore,
              telemetryCounters: {
                ...currentState.telemetryCounters,
                tailConsolidationCardsMerged:
                  currentState.telemetryCounters.tailConsolidationCardsMerged + mergedDiff,
              },
            };
            improvedInIter = true;
            break;
          }
        }
        if (improvedInIter) break;
      }
      if (improvedInIter) break;
    }

    if (!improvedInIter) break;
  }

  return currentState;
};
