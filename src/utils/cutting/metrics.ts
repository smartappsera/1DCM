import { FullOptimizationSolution, StockItem } from '../../types/cutting';
import { CutCard, CutContext, CutMetrics } from './types';

export const INDEX_FLOOR = 0.9;
export const SETUP_WEIGHT = 1;

export function computeCuttingIndexScale(rawIndex: number): number {
  return Math.max(0, Math.min(100, Math.round(((rawIndex - INDEX_FLOOR) / (1 - INDEX_FLOOR)) * 100)));
}

export interface BatchRowSplit {
  batchCount: number;
  singleCount: number;
  packagesCount: number;
}

export function getBatchRowSplit(barsCount: number, batchSize?: number): BatchRowSplit {
  if (!batchSize || batchSize < 2) {
    return { batchCount: 0, singleCount: barsCount, packagesCount: 0 };
  }
  const packagesCount = Math.floor(barsCount / batchSize);
  const batchCount = batchSize * packagesCount;
  return {
    batchCount,
    singleCount: barsCount - batchCount,
    packagesCount,
  };
}

export interface CuttingIndexBreakdown {
  cuttingIndex: number;
  cuttingIndexMaterial: number;
  cuttingIndexSetup: number;
}

/**
 * Single Source of Truth for the Cutting Index:
 * weightedReusableMm = sum_cards (reusableRemnantMm * count * min(1, reusableRemnantMm / max(1, targetRemnantMinLength)))
 * E_mat = min(1, netRatio + weightedReusableMm / totalStockLengthMm)
 * C_eff = uniqueCardsCount + (D - 1), where D = max(1, distinctStandardBarLengthsUsed)
 * E_setup = max(0, 1 - SETUP_WEIGHT * (C_eff - 1) / totalBarsUsed)
 * Index = E_mat * E_setup
 */
export function computeCuttingIndexFromTotals(params: {
  totalStockLengthMm: number;
  totalPartsLengthMm: number;
  weightedReusableMm: number;
  totalBarsUsed: number;
  uniqueCardsCount: number;
  distinctStandardBarLengthsUsed: number;
}): CuttingIndexBreakdown {
  const {
    totalStockLengthMm,
    totalPartsLengthMm,
    weightedReusableMm,
    totalBarsUsed,
    uniqueCardsCount,
    distinctStandardBarLengthsUsed,
  } = params;

  if (totalStockLengthMm <= 0 || totalBarsUsed <= 0) {
    return {
      cuttingIndex: 0,
      cuttingIndexMaterial: 0,
      cuttingIndexSetup: 0,
    };
  }

  const netRatio = Math.min(1, Math.max(0, totalPartsLengthMm / totalStockLengthMm));
  const eMat = Math.min(1, netRatio + Math.max(0, weightedReusableMm) / totalStockLengthMm);

  const d = Math.max(1, distinctStandardBarLengthsUsed);
  const cEff = Math.max(1, uniqueCardsCount) + (d - 1);
  const eSetup = Math.max(0, 1 - (SETUP_WEIGHT * (cEff - 1)) / totalBarsUsed);
  const idx = eMat * eSetup;

  return {
    cuttingIndex: Number(idx.toFixed(6)),
    cuttingIndexMaterial: Number(eMat.toFixed(6)),
    cuttingIndexSetup: Number(eSetup.toFixed(6)),
  };
}

/**
 * Helper computing max single reusable remnant length (>= 0) from any FullOptimizationSolution.
 */
export function computeMaxReusableRemnantFromSolution(
  solution: Pick<FullOptimizationSolution, 'rows' | 'maxReusableRemnantLength'>
): number {
  if (typeof solution.maxReusableRemnantLength === 'number') {
    return solution.maxReusableRemnantLength;
  }
  let maxLen = 0;
  for (let i = 0; i < solution.rows.length; i++) {
    const r = solution.rows[i];
    if (r.isReusable && r.reusableRemnant > maxLen) {
      maxLen = r.reusableRemnant;
    }
  }
  return maxLen;
}

/**
 * Helper computing Cutting Index from any FullOptimizationSolution (SSOT fallback for baselines / UI).
 */
export function computeCuttingIndexFromSolution(
  solution: Pick<
    FullOptimizationSolution,
    | 'rows'
    | 'totalStockLength'
    | 'totalSpentLength'
    | 'totalReusableLength'
    | 'totalBarsUsed'
    | 'cuttingIndex'
    | 'cuttingIndexMaterial'
    | 'cuttingIndexSetup'
  >,
  stockInput?: readonly StockItem[],
  targetRemnantMinLength?: number
): CuttingIndexBreakdown {
  if (
    targetRemnantMinLength === undefined &&
    typeof solution.cuttingIndex === 'number' &&
    typeof solution.cuttingIndexMaterial === 'number' &&
    typeof solution.cuttingIndexSetup === 'number'
  ) {
    return {
      cuttingIndex: solution.cuttingIndex,
      cuttingIndexMaterial: solution.cuttingIndexMaterial,
      cuttingIndexSetup: solution.cuttingIndexSetup,
    };
  }

  const activeStdSet = new Set<number>();
  if (stockInput) {
    for (let i = 0; i < stockInput.length; i++) {
      const s = stockInput[i];
      if (
        s.isActive !== false &&
        (s.isStandard || s.isStandardUnlimited || s.length === 6000 || s.length === 12000 || s.length === 11700)
      ) {
        activeStdSet.add(s.length);
      }
    }
  }

  const targetLen = Math.max(1, targetRemnantMinLength ?? 1500);
  let weightedReusableMm = 0;
  const usedStdSizes = new Set<number>();
  for (let i = 0; i < solution.rows.length; i++) {
    const r = solution.rows[i];
    if (r.barsCount <= 0) continue;
    if (r.isReusable && r.reusableRemnant > 0) {
      weightedReusableMm +=
        r.reusableRemnant * r.barsCount * Math.min(1, r.reusableRemnant / targetLen);
    }
    const isStandard =
      r.barSize === 6000 ||
      r.barSize === 12000 ||
      r.barSize === 11700 ||
      activeStdSet.has(r.barSize);
    if (isStandard) {
      usedStdSizes.add(r.barSize);
    }
  }

  return computeCuttingIndexFromTotals({
    totalStockLengthMm: solution.totalStockLength || 0,
    totalPartsLengthMm: solution.totalSpentLength || 0,
    weightedReusableMm,
    totalBarsUsed: solution.totalBarsUsed || 0,
    uniqueCardsCount: solution.rows.length,
    distinctStandardBarLengthsUsed: Math.max(1, usedStdSizes.size),
  });
}

/**
 * Canonical pattern signature uniquely identifying a cutting card.
 * Includes barSize and isTailSingle flag so batch vs single tail cards never collapse together.
 */
export function buildCardSignature(
  barSize: number,
  sortedPieceLengthsDesc: readonly number[],
  isTailSingle?: boolean,
  isLockedRemnant?: boolean
): string {
  return `${barSize}:${sortedPieceLengthsDesc.join(',')}${isTailSingle ? ':S' : ''}${isLockedRemnant ? ':R' : ''}`;
}

/**
 * Builds an immutable CutCard from barSize, pieceLengths, and count using exact mm balance.
 */
export function createCutCard(
  barSize: number,
  pieceLengths: readonly number[],
  count: number,
  context: CutContext,
  isTailSingle?: boolean,
  isLockedRemnant?: boolean
): CutCard {
  const sortedPieces = pieceLengths.slice().sort((a, b) => b - a);
  const dRez = context.bladeWidth;
  const krm = context.edgeTrim;
  const delOst = context.reusableRemnantMin;
  const nod = context.nod || 1;

  let partsLengthMm = 0;
  let spentSm = 0;
  for (let i = 0; i < sortedPieces.length; i++) {
    const pLen = sortedPieces[i];
    partsLengthMm += pLen;
    spentSm += Math.floor((pLen + dRez) / nod);
  }

  const effectiveSm = Math.max(0, Math.floor((barSize - krm) / nod));
  const trimCuts = krm > 0 ? 1 : 0;
  const totalPiecesCount = sortedPieces.length;
  const rawRemainderCheck = barSize - partsLengthMm - krm;
  const cutsCount =
    totalPiecesCount > 0
      ? trimCuts + Math.max(0, totalPiecesCount - 1) + (rawRemainderCheck > dRez ? 1 : 0)
      : trimCuts;
  const kerfLossMm = dRez * cutsCount;
  const remainderMm = Math.max(0, barSize - (partsLengthMm + krm + kerfLossMm));

  const isReusable = delOst > 0 && remainderMm >= delOst;
  const reusableRemnantMm = isReusable ? remainderMm : 0;
  const scrapRemnantMm = isReusable ? 0 : remainderMm;
  const isRemnantBar =
    Boolean(isLockedRemnant) ||
    (context.remnantBarSizes
      ? context.remnantBarSizes.includes(barSize)
      : !context.activeStandardLengths.includes(barSize) &&
        barSize !== 6000 &&
        barSize !== 12000 &&
        barSize !== 11700);

  return {
    signature: buildCardSignature(barSize, sortedPieces, isTailSingle, isLockedRemnant),
    barSize,
    effectiveSm,
    spentSm,
    partsLengthMm,
    kerfLossMm,
    trimLossMm: krm,
    remainderMm,
    reusableRemnantMm,
    scrapRemnantMm,
    isReusable,
    isRemnantBar,
    ...(isTailSingle ? { isTailSingle: true } : {}),
    ...(isLockedRemnant ? { isLockedRemnant: true } : {}),
    count: Math.max(1, count),
    pieceLengths: sortedPieces,
  };
}

/**
 * Deterministic ordering of grouped CutCards:
 * 1) Batch cards before single-tail remainder cards
 * 2) barSize descending
 * 3) count descending (largest batches first)
 * 4) signature ascending (deterministic tie-break)
 * 5) partsLengthMm descending
 */
export function sortCardsDeterministically(cards: readonly CutCard[]): CutCard[] {
  return cards.slice().sort((a, b) => {
    const aTail = a.isTailSingle ? 1 : 0;
    const bTail = b.isTailSingle ? 1 : 0;
    if (aTail !== bTail) return aTail - bTail;
    if (b.barSize !== a.barSize) return b.barSize - a.barSize;
    if (b.count !== a.count) return b.count - a.count;
    if (a.signature !== b.signature) return a.signature.localeCompare(b.signature);
    return b.partsLengthMm - a.partsLengthMm;
  });
}

/**
 * Groups identical CutCards by canonical signature and returns sorted cards.
 * Pure function with O(N log N) complexity.
 */
export function groupIdenticalCards(
  cards: readonly CutCard[],
  context: CutContext
): CutCard[] {
  if (cards.length === 0) return [];

  const map = new Map<string, CutCard>();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.count <= 0 || c.pieceLengths.length === 0) continue;
    const expectedSig = buildCardSignature(
      c.barSize,
      c.pieceLengths,
      c.isTailSingle,
      c.isLockedRemnant
    );
    const normalized =
      c.signature === expectedSig
        ? c
        : createCutCard(
            c.barSize,
            c.pieceLengths,
            c.count,
            context,
            c.isTailSingle,
            c.isLockedRemnant
          );
    const prevNorm = map.get(normalized.signature);
    if (prevNorm) {
      map.set(normalized.signature, {
        ...prevNorm,
        count: prevNorm.count + normalized.count,
      });
    } else {
      map.set(normalized.signature, normalized);
    }
  }

  return sortCardsDeterministically(Array.from(map.values()));
}

/**
 * Single Source of Truth for cutting solution metrics.
 * MUST be used for BOTH intermediate Web Worker progress reports AND final solution output.
 */
export function calculateMetrics(
  cards: readonly CutCard[],
  context: CutContext,
  unplacedScaled: readonly number[] = []
): CutMetrics {
  let totalBarsUsed = 0;
  let totalStockLengthMm = 0;
  let totalPartsLengthMm = 0;
  let totalWasteMm = 0;
  let totalScrapMm = 0;
  let totalReusableMm = 0;
  let weightedReusableMm = 0;
  let maxReusableRemnantMm = 0;
  let targetReusableMm = 0;
  let remnantsUsedCount = 0;
  let remnantsUsedMm = 0;
  const targetLen = Math.max(1, context.targetRemnantMin || 1500);

  // Zero-allocation distinct standard bar length tracking (handles up to 4 inline)
  let stdLen1 = 0;
  let stdLen2 = 0;
  let stdLen3 = 0;
  let stdLen4 = 0;
  let distinctStdCount = 0;
  let extraStdLens: number[] | null = null;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cnt = card.count;
    if (cnt <= 0) continue;

    const barWaste = card.trimLossMm + card.kerfLossMm + card.scrapRemnantMm;
    totalBarsUsed += cnt;
    totalStockLengthMm += card.barSize * cnt;
    totalPartsLengthMm += card.partsLengthMm * cnt;
    totalWasteMm += barWaste * cnt;
    totalScrapMm += card.scrapRemnantMm * cnt;
    totalReusableMm += card.reusableRemnantMm * cnt;

    if (card.reusableRemnantMm > 0) {
      weightedReusableMm +=
        card.reusableRemnantMm * cnt * Math.min(1, card.reusableRemnantMm / targetLen);
    }

    if (card.reusableRemnantMm > maxReusableRemnantMm) {
      maxReusableRemnantMm = card.reusableRemnantMm;
    }

    if (card.remainderMm >= context.targetRemnantMin) {
      targetReusableMm += card.remainderMm * cnt;
    }

    if (card.isRemnantBar) {
      remnantsUsedCount += cnt;
      remnantsUsedMm += card.barSize * cnt;
    } else {
      const sz = card.barSize;
      if (sz !== stdLen1 && sz !== stdLen2 && sz !== stdLen3 && sz !== stdLen4) {
        if (stdLen1 === 0) {
          stdLen1 = sz;
          distinctStdCount++;
        } else if (stdLen2 === 0) {
          stdLen2 = sz;
          distinctStdCount++;
        } else if (stdLen3 === 0) {
          stdLen3 = sz;
          distinctStdCount++;
        } else if (stdLen4 === 0) {
          stdLen4 = sz;
          distinctStdCount++;
        } else {
          if (!extraStdLens) extraStdLens = [];
          if (!extraStdLens.includes(sz)) {
            extraStdLens.push(sz);
            distinctStdCount++;
          }
        }
      }
    }
  }

  let unplacedLengthMm = 0;
  for (let i = 0; i < unplacedScaled.length; i++) {
    unplacedLengthMm += Math.max(0, unplacedScaled[i] * context.nod - context.bladeWidth);
  }

  const overallKIM =
    totalStockLengthMm > 0
      ? Number((((totalStockLengthMm - totalWasteMm) / totalStockLengthMm) * 100).toFixed(2))
      : 0;

  const netKIM =
    totalStockLengthMm > 0
      ? Number(((totalPartsLengthMm / totalStockLengthMm) * 100).toFixed(2))
      : 0;

  const indexBreakdown = computeCuttingIndexFromTotals({
    totalStockLengthMm,
    totalPartsLengthMm,
    weightedReusableMm,
    totalBarsUsed,
    uniqueCardsCount: cards.length,
    distinctStandardBarLengthsUsed: Math.max(1, distinctStdCount),
  });

  return {
    uniqueCardsCount: cards.length,
    totalBarsUsed,
    totalStockLengthMm,
    totalPartsLengthMm,
    totalWasteMm,
    totalScrapMm,
    totalReusableMm,
    maxReusableRemnantMm,
    targetReusableMm,
    remnantsUsedCount,
    remnantsUsedMm,
    overallKIM,
    netKIM,
    cuttingIndex: indexBreakdown.cuttingIndex,
    cuttingIndexMaterial: indexBreakdown.cuttingIndexMaterial,
    cuttingIndexSetup: indexBreakdown.cuttingIndexSetup,
    unplacedCount: unplacedScaled.length,
    unplacedLengthMm,
  };
}
