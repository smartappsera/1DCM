import { StockItem } from '../../types/cutting';
import { createCutCard, groupIdenticalCards } from './metrics';
import { CutCard, CutContext } from './types';

export interface HighsSolveOptions {
  readonly output_flag?: boolean;
  readonly log_to_console?: boolean;
  readonly time_limit?: number;
  readonly mip_rel_gap?: number;
  readonly mip_abs_gap?: number;
}

export interface HighsSolverRowLike {
  readonly Dual?: number;
  readonly Primal?: number;
}

export interface HighsSolverColumnLike {
  readonly Primal?: number;
}

export interface HighsSolverSolutionLike {
  readonly Status: string;
  readonly ObjectiveValue?: number;
  readonly Columns: Readonly<Record<string, HighsSolverColumnLike>>;
  readonly Rows: readonly HighsSolverRowLike[];
}

export interface HighsSolverLike {
  solve(problem: string, options?: HighsSolveOptions): HighsSolverSolutionLike;
}

export interface ExactLpCandidateResult {
  readonly cards: CutCard[];
  readonly lpMinBarsLowerBound?: number;
}

interface DemandGroup {
  readonly sm: number;
  readonly pieceMm: number;
  readonly qty: number;
}

interface StockGroup {
  readonly barSize: number;
  readonly capSm: number;
  readonly available: number; // Infinity for unlimited stock
  readonly isStandardUnlimited: boolean;
  readonly cost: number;
}

interface GeneratedPattern {
  readonly name: string;
  readonly stockIdx: number;
  readonly counts: Int32Array;
}

interface ExtractedIlpSolution {
  readonly counts: Int32Array;
  readonly totalMaterial: number;
  readonly totalBars: number;
  readonly usedPatterns: number;
}

const EPS = 1e-6;
const RC_TOL = 1e-5;
const MAX_CG_ITERATIONS = 160;
const CG_TIME_LIMIT_MS = 2200;
const MAX_DP_CAP_SM = 35000;
const MAX_BITSET_BYTES = 8 * 1024 * 1024;
const STEP2_TIME_LIMIT_SEC = 5;

function isStandardUnlimitedItem(item: StockItem): boolean {
  if (item.isStandardUnlimited) return true;
  return item.isStandard === true && item.quantity <= 0;
}

function buildMasterProblemLp(
  demands: readonly DemandGroup[],
  stocks: readonly StockGroup[],
  constrainedStockMap: readonly number[], // stockIdx -> stockRowIdx (-1 if unlimited)
  patterns: readonly GeneratedPattern[],
  integerMode: boolean
): string {
  const lines: string[] = [];
  lines.push('Minimize');
  const objTerms: string[] = [];
  for (let p = 0; p < patterns.length; p++) {
    const pat = patterns[p];
    objTerms.push(`${stocks[pat.stockIdx].cost} ${pat.name}`);
  }
  lines.push(` obj: ${objTerms.join(' + ')}`);
  lines.push('Subject To');

  const numDemands = demands.length;
  for (let i = 0; i < numDemands; i++) {
    const terms: string[] = [];
    for (let p = 0; p < patterns.length; p++) {
      const cnt = patterns[p].counts[i];
      if (cnt > 0) {
        terms.push(cnt === 1 ? patterns[p].name : `${cnt} ${patterns[p].name}`);
      }
    }
    if (terms.length === 0) {
      // Should not happen with initial homogeneous columns, guard safely
      return '';
    }
    lines.push(` d${i}: ${terms.join(' + ')} >= ${demands[i].qty}`);
  }

  for (let k = 0; k < stocks.length; k++) {
    if (constrainedStockMap[k] < 0) continue;
    const terms: string[] = [];
    for (let p = 0; p < patterns.length; p++) {
      if (patterns[p].stockIdx === k) {
        terms.push(patterns[p].name);
      }
    }
    if (terms.length > 0) {
      lines.push(` s${k}: ${terms.join(' + ')} <= ${stocks[k].available}`);
    }
  }

  if (integerMode) {
    lines.push('General');
    const names: string[] = [];
    for (let p = 0; p < patterns.length; p++) {
      names.push(patterns[p].name);
    }
    lines.push(` ${names.join(' ')}`);
  }

  lines.push('End');
  return lines.join('\n');
}

function buildMinCardsMasterProblemLp(
  demands: readonly DemandGroup[],
  stocks: readonly StockGroup[],
  constrainedStockMap: readonly number[],
  patterns: readonly GeneratedPattern[],
  totalMaterialZ: number,
  totalBarsStep1: number
): string {
  const lines: string[] = [];
  lines.push('Minimize');

  // Secondary weight on total bars so equal card counts prefer fewer bars,
  // while sum(weight * x_p) <= 0.1 < 1 never trades an extra card for fewer bars.
  const barTieWeight = Math.max(1e-7, Math.min(1e-3, 0.1 / Math.max(1, totalBarsStep1)));
  const barTieWeightStr = barTieWeight.toFixed(7);

  const objTerms: string[] = [];
  for (let p = 0; p < patterns.length; p++) {
    objTerms.push(`y${p}`);
  }
  for (let p = 0; p < patterns.length; p++) {
    objTerms.push(`${barTieWeightStr} ${patterns[p].name}`);
  }
  lines.push(` obj: ${objTerms.join(' + ')}`);
  lines.push('Subject To');

  const numDemands = demands.length;
  for (let i = 0; i < numDemands; i++) {
    const terms: string[] = [];
    for (let p = 0; p < patterns.length; p++) {
      const cnt = patterns[p].counts[i];
      if (cnt > 0) {
        terms.push(cnt === 1 ? patterns[p].name : `${cnt} ${patterns[p].name}`);
      }
    }
    if (terms.length === 0) return '';
    lines.push(` d${i}: ${terms.join(' + ')} >= ${demands[i].qty}`);
  }

  for (let k = 0; k < stocks.length; k++) {
    if (constrainedStockMap[k] < 0) continue;
    const terms: string[] = [];
    for (let p = 0; p < patterns.length; p++) {
      if (patterns[p].stockIdx === k) {
        terms.push(patterns[p].name);
      }
    }
    if (terms.length > 0) {
      lines.push(` s${k}: ${terms.join(' + ')} <= ${stocks[k].available}`);
    }
  }

  const matTerms: string[] = [];
  const barTerms: string[] = [];
  for (let p = 0; p < patterns.length; p++) {
    const pat = patterns[p];
    matTerms.push(`${stocks[pat.stockIdx].barSize} ${pat.name}`);
    barTerms.push(pat.name);
  }
  lines.push(` mat_cap: ${matTerms.join(' + ')} <= ${totalMaterialZ}`);
  lines.push(` bars_cap: ${barTerms.join(' + ')} <= ${totalBarsStep1}`);

  for (let p = 0; p < patterns.length; p++) {
    const pat = patterns[p];
    const stock = stocks[pat.stockIdx];
    let demandBound = 0;
    for (let i = 0; i < numDemands; i++) {
      const cnt = pat.counts[i];
      if (cnt > 0) {
        const need = Math.ceil(demands[i].qty / cnt);
        if (need > demandBound) demandBound = need;
      }
    }
    const stockBound = Number.isFinite(stock.available) ? stock.available : Infinity;
    const budgetBound = Math.min(totalBarsStep1, Math.floor(totalMaterialZ / stock.barSize));
    const mp = Math.min(demandBound, stockBound, budgetBound);
    if (mp <= 0) {
      lines.push(` link${p}: ${pat.name} <= 0`);
    } else {
      lines.push(` link${p}: ${pat.name} - ${mp} y${p} <= 0`);
    }
  }

  lines.push('General');
  const xNames: string[] = [];
  const yNames: string[] = [];
  for (let p = 0; p < patterns.length; p++) {
    xNames.push(patterns[p].name);
    yNames.push(`y${p}`);
  }
  lines.push(` ${xNames.join(' ')}`);
  lines.push('Binary');
  lines.push(` ${yNames.join(' ')}`);
  lines.push('End');
  return lines.join('\n');
}

function extractValidIlpSolution(
  sol: HighsSolverSolutionLike,
  demands: readonly DemandGroup[],
  stocks: readonly StockGroup[],
  patterns: readonly GeneratedPattern[]
): ExtractedIlpSolution | null {
  if (
    sol.Status !== 'Optimal' &&
    sol.Status !== 'Time limit reached' &&
    sol.Status !== 'Target for objective reached'
  ) {
    return null;
  }

  const numDemands = demands.length;
  const counts = new Int32Array(patterns.length);
  const producedCounts = new Int32Array(numDemands);
  const stockUsedCounts = new Int32Array(stocks.length);
  let totalMaterial = 0;
  let totalBars = 0;
  let usedPatterns = 0;

  for (let p = 0; p < patterns.length; p++) {
    const pat = patterns[p];
    const primal = sol.Columns[pat.name]?.Primal;
    if (typeof primal !== 'number' || !Number.isFinite(primal)) continue;
    const count = Math.round(primal);
    if (Math.abs(primal - count) > 1e-3 || count < 0) return null;
    if (count === 0) continue;

    counts[p] = count;
    usedPatterns++;
    totalBars += count;
    totalMaterial += count * stocks[pat.stockIdx].barSize;
    stockUsedCounts[pat.stockIdx] += count;
    if (
      Number.isFinite(stocks[pat.stockIdx].available) &&
      stockUsedCounts[pat.stockIdx] > stocks[pat.stockIdx].available
    ) {
      return null;
    }

    for (let i = 0; i < numDemands; i++) {
      const c = pat.counts[i];
      if (c > 0) {
        producedCounts[i] += c * count;
      }
    }
  }

  for (let i = 0; i < numDemands; i++) {
    if (producedCounts[i] < demands[i].qty) {
      return null;
    }
  }

  return {
    counts,
    totalMaterial,
    totalBars,
    usedPatterns,
  };
}

function makePatternKey(stockIdx: number, counts: Int32Array): string {
  let key = `${stockIdx}:`;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      key += `${i}=${counts[i]},`;
    }
  }
  return key;
}

/**
 * Pure Column Generation + HiGHS ILP solver for 1D Cutting Stock.
 * Designed for MinimizeMaterialStrategy & Balance baseline (never setups / dualProfileCut).
 */
export function computeLpCandidate(
  context: CutContext,
  solver: HighsSolverLike
): ExactLpCandidateResult | null {
  if (context.scaledDemand.length === 0 || context.scaledStockAll.length === 0) {
    return null;
  }
  if (context.shouldAbort?.()) return null;

  const nod = Math.max(1, context.nod);
  const dRez = context.bladeWidth;
  const krm = context.edgeTrim;

  // 1. Aggregate demand into unique item types (sorted descending by sm)
  const demandFreq = new Map<number, number>();
  for (let i = 0; i < context.scaledDemand.length; i++) {
    const sm = context.scaledDemand[i];
    if (sm > 0) {
      demandFreq.set(sm, (demandFreq.get(sm) || 0) + 1);
    }
  }
  if (demandFreq.size === 0) return null;

  const demands: DemandGroup[] = [];
  for (const [sm, qty] of demandFreq.entries()) {
    demands.push({
      sm,
      pieceMm: sm * nod - dRez,
      qty,
    });
  }
  demands.sort((a, b) => b.sm - a.sm);
  const numDemands = demands.length;

  // 2. Aggregate active stock into distinct barSizes
  const stockMap = new Map<
    number,
    { capSm: number; available: number; isStandardUnlimited: boolean }
  >();
  for (let i = 0; i < context.stockInput.length; i++) {
    const st = context.stockInput[i];
    if (st.isActive === false) continue;
    const capSm = Math.floor((st.length - krm) / nod);
    if (capSm <= 0) continue;
    const isUnlimited = isStandardUnlimitedItem(st);
    const prev = stockMap.get(st.length);
    if (prev) {
      prev.isStandardUnlimited = prev.isStandardUnlimited || isUnlimited;
      prev.available =
        isUnlimited || !Number.isFinite(prev.available)
          ? Infinity
          : prev.available + Math.max(0, st.quantity);
    } else {
      stockMap.set(st.length, {
        capSm,
        available: isUnlimited ? Infinity : Math.max(0, st.quantity),
        isStandardUnlimited: isUnlimited,
      });
    }
  }

  // Fallback to scaledStockAll if stockInput had nothing usable
  if (stockMap.size === 0) {
    for (let i = 0; i < context.scaledStockAll.length; i++) {
      const capSm = context.scaledStockAll[i];
      if (capSm <= 0) continue;
      const barSize = capSm * nod + krm;
      const prev = stockMap.get(barSize);
      if (prev) {
        if (Number.isFinite(prev.available)) prev.available += 1;
      } else {
        stockMap.set(barSize, { capSm, available: 1, isStandardUnlimited: false });
      }
    }
  }

  const stocks: StockGroup[] = [];
  for (const [barSize, info] of stockMap.entries()) {
    if (info.available <= 0) continue;
    stocks.push({
      barSize,
      capSm: info.capSm,
      available: info.available,
      isStandardUnlimited: info.isStandardUnlimited,
      cost: barSize,
    });
  }
  if (stocks.length === 0) return null;
  stocks.sort((a, b) => b.barSize - a.barSize);

  const maxCapSm = stocks[0].capSm;
  if (maxCapSm <= 0 || maxCapSm > MAX_DP_CAP_SM) return null;

  // Check every demand item can fit on at least one stock bar
  for (let i = 0; i < numDemands; i++) {
    if (demands[i].sm > maxCapSm) return null;
  }

  const constrainedStockMap: number[] = new Array<number>(stocks.length).fill(-1);
  let constrainedRowCursor = numDemands;
  for (let k = 0; k < stocks.length; k++) {
    if (Number.isFinite(stocks[k].available)) {
      constrainedStockMap[k] = constrainedRowCursor++;
    }
  }

  // 3. Initial feasible columns: homogeneous max-repeat patterns per (stock, demand)
  const patterns: GeneratedPattern[] = [];
  const seenKeys = new Set<string>();

  for (let k = 0; k < stocks.length; k++) {
    const capSm = stocks[k].capSm;
    for (let i = 0; i < numDemands; i++) {
      const itemSm = demands[i].sm;
      if (itemSm > capSm) continue;
      const maxFit = Math.min(demands[i].qty, Math.floor(capSm / itemSm));
      if (maxFit <= 0) continue;

      const counts = new Int32Array(numDemands);
      counts[i] = maxFit;
      const key = makePatternKey(k, counts);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        patterns.push({
          name: `p${patterns.length}`,
          stockIdx: k,
          counts,
        });
      }
    }
  }

  // Also add one greedy FFD column per stock type to warm-start CG
  for (let k = 0; k < stocks.length; k++) {
    let rem = stocks[k].capSm;
    const counts = new Int32Array(numDemands);
    let totalPieces = 0;
    for (let i = 0; i < numDemands; i++) {
      const itemSm = demands[i].sm;
      if (itemSm <= rem) {
        const take = Math.min(demands[i].qty, Math.floor(rem / itemSm));
        if (take > 0) {
          counts[i] = take;
          rem -= take * itemSm;
          totalPieces += take;
        }
      }
    }
    if (totalPieces > 0) {
      const key = makePatternKey(k, counts);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        patterns.push({
          name: `p${patterns.length}`,
          stockIdx: k,
          counts,
        });
      }
    }
  }

  if (patterns.length === 0) return null;

  // 4. Preallocate bounded knapsack buffers ONCE outside the CG loop (zero hot allocations)
  let maxBinaryChunks = 0;
  for (let i = 0; i < numDemands; i++) {
    const maxFit = Math.min(demands[i].qty, Math.floor(maxCapSm / demands[i].sm));
    if (maxFit > 0) {
      maxBinaryChunks += Math.floor(Math.log2(maxFit)) + 1;
    }
  }
  const strideBytes = (maxCapSm + 8) >> 3;
  if (maxBinaryChunks * strideBytes > MAX_BITSET_BYTES) {
    return null;
  }

  const dpVal = new Float64Array(maxCapSm + 1);
  const choiceBits = new Uint8Array(Math.max(1, maxBinaryChunks * strideBytes));
  const chunkW = new Int32Array(Math.max(1, maxBinaryChunks));
  const chunkV = new Float64Array(Math.max(1, maxBinaryChunks));
  const chunkItem = new Int32Array(Math.max(1, maxBinaryChunks));
  const chunkMult = new Int32Array(Math.max(1, maxBinaryChunks));
  const dualPi = new Float64Array(numDemands);
  const stockDual = new Float64Array(stocks.length);
  const candidateCounts = new Int32Array(numDemands);

  const cgStart = performance.now();
  let lastLpSol: HighsSolverSolutionLike | null = null;
  let cgConvergedOptimal = false;

  const lpOptions: HighsSolveOptions = {
    output_flag: false,
    log_to_console: false,
    time_limit: 1.5,
  };

  for (let iter = 0; iter < MAX_CG_ITERATIONS; iter++) {
    if (context.shouldAbort?.()) return null;
    if (performance.now() - cgStart > CG_TIME_LIMIT_MS) break;

    const lpModel = buildMasterProblemLp(demands, stocks, constrainedStockMap, patterns, false);
    if (!lpModel) return null;

    let lpSol: HighsSolverSolutionLike;
    try {
      lpSol = solver.solve(lpModel, lpOptions);
    } catch {
      return null;
    }

    if (lpSol.Status !== 'Optimal' || !lpSol.Rows || lpSol.Rows.length < numDemands) {
      break;
    }
    lastLpSol = lpSol;

    for (let i = 0; i < numDemands; i++) {
      const rawDual = lpSol.Rows[i]?.Dual;
      dualPi[i] = typeof rawDual === 'number' && Number.isFinite(rawDual) ? Math.max(0, rawDual) : 0;
    }
    for (let k = 0; k < stocks.length; k++) {
      const rIdx = constrainedStockMap[k];
      if (rIdx >= 0 && rIdx < lpSol.Rows.length) {
        const rawDual = lpSol.Rows[rIdx]?.Dual;
        stockDual[k] =
          typeof rawDual === 'number' && Number.isFinite(rawDual) ? Math.min(0, rawDual) : 0;
      } else {
        stockDual[k] = 0;
      }
    }

    let addedAnyColumn = false;

    for (let k = 0; k < stocks.length; k++) {
      const capSm = stocks[k].capSm;
      let numChunks = 0;

      for (let i = 0; i < numDemands; i++) {
        const w0 = demands[i].sm;
        const v0 = dualPi[i];
        if (w0 > capSm || v0 <= EPS) continue;
        let remQty = Math.min(demands[i].qty, Math.floor(capSm / w0));
        let mult = 1;
        while (remQty > 0) {
          const take = remQty >= mult ? mult : remQty;
          chunkW[numChunks] = w0 * take;
          chunkV[numChunks] = v0 * take;
          chunkItem[numChunks] = i;
          chunkMult[numChunks] = take;
          numChunks++;
          remQty -= take;
          mult <<= 1;
        }
      }

      if (numChunks === 0) continue;

      dpVal.fill(0, 0, capSm + 1);
      const rowBytes = (capSm + 8) >> 3;
      choiceBits.fill(0, 0, numChunks * rowBytes);

      for (let t = 0; t < numChunks; t++) {
        const w = chunkW[t];
        const v = chunkV[t];
        const rowOffset = t * rowBytes;
        for (let c = capSm; c >= w; c--) {
          const candVal = dpVal[c - w] + v;
          if (candVal > dpVal[c] + 1e-11) {
            dpVal[c] = candVal;
            choiceBits[rowOffset + (c >> 3)] |= 1 << (c & 7);
          }
        }
      }

      let bestC = 0;
      let bestVal = 0;
      for (let c = 1; c <= capSm; c++) {
        if (dpVal[c] > bestVal) {
          bestVal = dpVal[c];
          bestC = c;
        }
      }

      const threshold = stocks[k].cost - stockDual[k];
      if (bestVal > threshold + RC_TOL) {
        candidateCounts.fill(0);
        let curC = bestC;
        let pieceSum = 0;
        for (let t = numChunks - 1; t >= 0 && curC > 0; t--) {
          const rowOffset = t * rowBytes;
          if ((choiceBits[rowOffset + (curC >> 3)] & (1 << (curC & 7))) !== 0) {
            const i = chunkItem[t];
            candidateCounts[i] += chunkMult[t];
            pieceSum += chunkMult[t];
            curC -= chunkW[t];
          }
        }

        if (pieceSum > 0) {
          const key = makePatternKey(k, candidateCounts);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            patterns.push({
              name: `p${patterns.length}`,
              stockIdx: k,
              counts: candidateCounts.slice(),
            });
            addedAnyColumn = true;
          }
        }
      }
    }

    if (!addedAnyColumn) {
      cgConvergedOptimal = true;
      break;
    }
  }

  // Compute exact LP continuous bar lower bound when single uniform stock length applies
  let lpMinBarsLowerBound: number | undefined;
  if (
    cgConvergedOptimal &&
    lastLpSol &&
    lastLpSol.Status === 'Optimal' &&
    context.scaledStockRemnants.length === 0 &&
    context.activeStandardLengths.length <= 1
  ) {
    let fracBars = 0;
    const cols = lastLpSol.Columns;
    for (const colName in cols) {
      if (Object.prototype.hasOwnProperty.call(cols, colName)) {
        const val = cols[colName]?.Primal ?? 0;
        if (val > EPS) fracBars += val;
      }
    }
    if (fracBars > 0) {
      lpMinBarsLowerBound = Math.ceil(fracBars - EPS);
    }
  }

  if (context.shouldAbort?.()) {
    return lpMinBarsLowerBound !== undefined
      ? { cards: [], lpMinBarsLowerBound }
      : null;
  }

  // 5. Solve Step 1 Master Integer Linear Program (minimize total material length)
  const ilpModel = buildMasterProblemLp(demands, stocks, constrainedStockMap, patterns, true);
  if (!ilpModel) return null;

  let ilpSol: HighsSolverSolutionLike;
  try {
    ilpSol = solver.solve(ilpModel, {
      output_flag: false,
      log_to_console: false,
      time_limit: 8,
      mip_rel_gap: 0,
      mip_abs_gap: 0,
    });
  } catch {
    return lpMinBarsLowerBound !== undefined
      ? { cards: [], lpMinBarsLowerBound }
      : null;
  }

  const step1SolData = extractValidIlpSolution(ilpSol, demands, stocks, patterns);
  if (!step1SolData) {
    return lpMinBarsLowerBound !== undefined
      ? { cards: [], lpMinBarsLowerBound }
      : null;
  }

  // 5b. Step 2: minimize number of unique patterns subject to total material <= Z and bars <= step1Bars
  let chosenSolData: ExtractedIlpSolution = step1SolData;
  if ((step1SolData.usedPatterns > 1 || stocks.length > 1) && !context.shouldAbort?.()) {
    const minCardsModel = buildMinCardsMasterProblemLp(
      demands,
      stocks,
      constrainedStockMap,
      patterns,
      step1SolData.totalMaterial,
      step1SolData.totalBars
    );
    if (minCardsModel) {
      try {
        const step2Sol = solver.solve(minCardsModel, {
          output_flag: false,
          log_to_console: false,
          time_limit: STEP2_TIME_LIMIT_SEC,
          mip_rel_gap: 0,
          mip_abs_gap: 0,
        });
        const step2SolData = extractValidIlpSolution(step2Sol, demands, stocks, patterns);
        if (
          step2SolData &&
          step2SolData.totalMaterial <= step1SolData.totalMaterial &&
          step2SolData.totalBars <= step1SolData.totalBars &&
          (step2SolData.usedPatterns < step1SolData.usedPatterns ||
            (step2SolData.usedPatterns === step1SolData.usedPatterns &&
              (step2SolData.totalMaterial < step1SolData.totalMaterial ||
                step2SolData.totalBars < step1SolData.totalBars)))
        ) {
          chosenSolData = step2SolData;
        }
      } catch {
        // Fallback silently to Step 1 result
      }
    }
  }

  // 6. Expand chosen ILP column counts into concrete bars
  interface RawBarEntry {
    barSize: number;
    pieces: number[];
  }
  const bars: RawBarEntry[] = [];
  const producedCounts = new Int32Array(numDemands);

  for (let p = 0; p < patterns.length; p++) {
    const count = chosenSolData.counts[p];
    if (count <= 0) continue;
    const pat = patterns[p];

    const basePieces: number[] = [];
    for (let i = 0; i < numDemands; i++) {
      const c = pat.counts[i];
      if (c > 0) {
        producedCounts[i] += c * count;
        const lenMm = demands[i].pieceMm;
        for (let r = 0; r < c; r++) {
          basePieces.push(lenMm);
        }
      }
    }

    const barSize = stocks[pat.stockIdx].barSize;
    for (let r = 0; r < count; r++) {
      bars.push({
        barSize,
        pieces: basePieces.slice(),
      });
    }
  }

  // 7. Deterministic trim of any overproduced (>=) demand pieces on minimum number of bars:
  // prefer bars with more removable target pieces, then higher waste, then consecutive bar index.
  interface SurplusBarCandidate {
    readonly idx: number;
    readonly targetCount: number;
    readonly waste: number;
  }

  for (let i = 0; i < numDemands; i++) {
    let surplus = producedCounts[i] - demands[i].qty;
    if (surplus <= 0) continue;
    const targetLenMm = demands[i].pieceMm;

    const candidates: SurplusBarCandidate[] = [];
    for (let b = 0; b < bars.length; b++) {
      const pieces = bars[b].pieces;
      let targetCount = 0;
      let sumPieces = 0;
      for (let k = 0; k < pieces.length; k++) {
        const len = pieces[k];
        sumPieces += len;
        if (len === targetLenMm) targetCount++;
      }
      if (targetCount > 0) {
        candidates.push({
          idx: b,
          targetCount,
          waste: bars[b].barSize - sumPieces,
        });
      }
    }

    candidates.sort((a, b) => {
      if (b.targetCount !== a.targetCount) return b.targetCount - a.targetCount;
      if (b.waste !== a.waste) return b.waste - a.waste;
      return a.idx - b.idx;
    });

    for (let ci = 0; ci < candidates.length && surplus > 0; ci++) {
      const pieces = bars[candidates[ci].idx].pieces;
      while (surplus > 0) {
        const idx = pieces.indexOf(targetLenMm);
        if (idx < 0) break;
        pieces.splice(idx, 1);
        surplus--;
      }
    }
  }

  // 8. Build CutCards (downsize post-trimmed bars to a smaller active unlimited standard bar if pieces fit)
  const unlimitedStocksAsc = stocks
    .filter((s) => s.isStandardUnlimited)
    .sort((a, b) => a.barSize - b.barSize);
  const rawCards: CutCard[] = [];

  for (let b = 0; b < bars.length; b++) {
    const entry = bars[b];
    if (entry.pieces.length === 0) continue;
    let finalBarSize = entry.barSize;
    if (unlimitedStocksAsc.length > 0) {
      let partsSum = 0;
      for (let p = 0; p < entry.pieces.length; p++) partsSum += entry.pieces[p];
      const trimCuts = krm > 0 ? 1 : 0;
      const cutsMin = trimCuts + Math.max(0, entry.pieces.length - 1);
      const neededTrailing = partsSum + krm + (cutsMin + 1) * dRez;
      const neededExact = partsSum + krm + cutsMin * dRez;
      for (let u = 0; u < unlimitedStocksAsc.length; u++) {
        const candidateSize = unlimitedStocksAsc[u].barSize;
        if (candidateSize >= finalBarSize) break;
        if (
          neededExact <= candidateSize &&
          (neededTrailing <= candidateSize || candidateSize - neededExact <= dRez)
        ) {
          finalBarSize = candidateSize;
          break;
        }
      }
    }
    rawCards.push(createCutCard(finalBarSize, entry.pieces, 1, context));
  }

  const cards = groupIdenticalCards(rawCards, context);
  return {
    cards,
    ...(lpMinBarsLowerBound !== undefined ? { lpMinBarsLowerBound } : {}),
  };
}
