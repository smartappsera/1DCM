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
  CutPiece,
  CuttingOptimizationResult,
  PartDemand,
  StockBar,
  CuttingParams,
  CalculationProgressInfo,
  ComplexityEstimate,
  CustomStrategyConfig,
} from '../types/cutting';

/**
 * Returns default configuration for Custom Strategy
 */
export function getDefaultCustomConfig(): CustomStrategyConfig {
  return {
    maxPassesMultiplier: 1.0,
    enable2Opt: true,
    twoOptRounds: 15,
    enableTailConsolidation: true,
    tailConsolidationMaxBars: 10,
    cardMergeScrapToleranceMm: 120,
    preferFewerCards: true,
    remnantTargetMinLength: 1500,
  };
}

/**
 * Palette matching the user's Excel VBA screenshot colors
 */
const PALETTE: Record<number, string> = {
  5230: '#F87171', // Coral Red
  810: '#38BDF8',  // Light Blue / Cyan
  800: '#E879F9',  // Purple / Pink
  320: '#6366F1',  // Indigo
  280: '#FACC15',  // Yellow
  150: '#4ADE80',  // Light Green
};

export const RICH_DYNAMIC_COLORS = [
  '#38BDF8', // Light Blue / Sky
  '#E879F9', // Purple Pink
  '#FACC15', // Sunflower Yellow
  '#4ADE80', // Mint Green
  '#F87171', // Coral Red
  '#6366F1', // Indigo
  '#FB923C', // Orange
  '#2DD4BF', // Teal
  '#A78BFA', // Violet
  '#F472B6', // Rose Pink
  '#34D399', // Emerald
  '#60A5FA', // Azure Blue
  '#FBBF24', // Amber
  '#C084FC', // Light Purple
  '#F43F5E', // Deep Rose
  '#14B8A6', // Dark Teal
  '#818CF8', // Soft Indigo
  '#FB7185', // Strawberry
  '#A3E635', // Lime
  '#06B6D4', // Deep Cyan
  '#E11D48', // Crimson
  '#0EA5E9', // Ocean Blue
  '#D946EF', // Fuchsia
  '#84CC16', // Bright Lime
  '#F97316', // Vivid Orange
  '#8B5CF6', // Purple
  '#10B981', // True Emerald
  '#D97706', // Ochre Amber
  '#64748B', // Steel Slate
  '#EC4899', // Bright Pink
  '#059669', // Forest Green
  '#7C3AED', // Deep Violet
  '#B45309', // Rust Orange
  '#2563EB', // Royal Blue
  '#0284C7', // Cerulean
  '#475569', // Graphite
];

export function getDefaultDemandColor(index: number, len?: number): string {
  if (len && PALETTE[len]) return PALETTE[len];
  return RICH_DYNAMIC_COLORS[index % RICH_DYNAMIC_COLORS.length];
}

export function getColorForLength(len: number, index = 0): string {
  if (PALETTE[len]) return PALETTE[len];
  // Deterministic hash solely by length so a piece of given length has one fixed color everywhere
  const hash = Math.abs(Math.round(len * 9973));
  return RICH_DYNAMIC_COLORS[hash % RICH_DYNAMIC_COLORS.length];
}

/**
 * Greatest Common Divisor (myGcd from MyRaskroy.bas)
 */
export function myGcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  if (a < b) {
    const t = a;
    a = b;
    b = t;
  }
  while (b > 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/**
 * Array Sorting Heuristics matching SortLongArray from MyRaskroy.bas
 */
export function sortLongArray(arr: number[], sortMode = 1): number[] {
  const result = [...arr];
  const k = result.length;
  if (k <= 1) return result;

  if (sortMode === 1) {
    // Descending (First-Fit Decreasing)
    result.sort((a, b) => b - a);
  } else if (sortMode === 2) {
    // Ascending (First-Fit Increasing)
    result.sort((a, b) => a - b);
  } else if (sortMode === 3) {
    // Alternating
    result.sort((a, b) => b - a);
    for (let i = 1; i < Math.floor(k / 2); i += 2) {
      const j = k - 1 - i;
      const t = result[i];
      result[i] = result[j];
      result[j] = t;
    }
  } else if (sortMode === 4) {
    // Fold from extremes to center
    result.sort((a, b) => b - a);
    const bArr = [...result];
    for (let i = 0; i < k; i++) {
      if (i % 2 === 0) {
        result[i] = bArr[Math.floor(i / 2)];
      } else {
        result[i] = bArr[k - 1 - Math.floor(i / 2)];
      }
    }
  } else if (sortMode === 5) {
    // Modular remainder sort: elements that leave smaller remainder when dividing standard 6000
    result.sort((a, b) => (6000 % a) - (6000 % b) || b - a);
  } else if (sortMode === 6) {
    // Alternating 2 large, 1 small
    result.sort((a, b) => b - a);
    const temp = [...result];
    let left = 0;
    let right = k - 1;
    let idx = 0;
    while (left <= right) {
      if (left <= right) result[idx++] = temp[left++];
      if (left <= right) result[idx++] = temp[left++];
      if (left <= right) result[idx++] = temp[right--];
    }
  } else if (sortMode === 7) {
    // Center to extremes
    result.sort((a, b) => b - a);
    const temp = [...result];
    const mid = Math.floor(k / 2);
    let l = mid;
    let r = mid + 1;
    let idx = 0;
    while (l >= 0 || r < k) {
      if (l >= 0) result[idx++] = temp[l--];
      if (r < k) result[idx++] = temp[r++];
    }
  } else if (sortMode >= 8) {
    // Deterministic pseudo-random shuffle for deep exploration
    let seed = sortMode * 16807;
    for (let i = k - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = Math.floor((seed / 2147483647) * (i + 1));
      const t = result[i];
      result[i] = result[j];
      result[j] = t;
    }
  } else {
    result.sort((a, b) => b - a);
  }

  return result;
}

/**
 * LongSumEl from MyRaskroy.bas:
 * Dynamic Programming Subset-Sum / Knapsack Solver with early termination
 * Given candidate items arr and target sum sm, finds subset that sums up to sm (or within ds tolerance)
 */
export function longSumEl(arr: number[], sm: number, ds = 0): number[] | null {
  const n = sm;
  const sm1 = sm - ds;
  if (n <= 0 || n > 80000000) return null;

  const a = new Int32Array(n + 1);
  a.fill(-1);
  a[0] = 0;

  outerLoop: for (let i = 0; i < arr.length; i++) {
    const itemVal = arr[i];
    if (itemVal <= 0 || itemVal > n) continue;

    for (let j = n - itemVal; j >= 0; j--) {
      if (a[j] >= 0) {
        const k = j + itemVal;
        if (a[k] === -1) {
          a[k] = j;
          if (k >= sm1) {
            break outerLoop;
          }
        }
      }
    }
  }

  // Backtrack from largest achieved sum <= sm
  for (let i = sm; i >= 1; i--) {
    if (a[i] >= 0) {
      const out: number[] = [];
      let k = i;
      while (k > 0) {
        const prev = a[k];
        out.push(k - prev);
        k = prev;
      }
      return out;
    }
  }

  return null;
}

/**
 * GreedyAlgo from MyRaskroy.bas:
 * Greedy first-fit packing
 */
export function greedyAlgo(arr: number[], sm: number): number[] | null {
  let s = sm;
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] <= s) {
      out.push(arr[i]);
      s -= arr[i];
    }
  }
  return s < sm ? out : null;
}

/**
 * Pre-flight estimation of cutting calculation complexity and expected duration
 */
export function estimateCalculationComplexity(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings
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

  // Heavy task criteria: > 1,000 meters or > 800 parts or > 15 unique lengths
  const isHeavy = totalMeters > 1000 || totalParts > 800 || uniqueParts > 15;

  // Estimated execution durations in seconds matching user criteria:
  // Fast: ~10-15s, Standard: ~1-2m, Deep: 2+m
  const estimatedSeconds = {
    fast: isHeavy ? (totalMeters > 10000 ? 15 : 10) : 1.5,
    standard: isHeavy ? (totalMeters > 10000 ? 120 : 60) : 15,
    deep: isHeavy ? (totalMeters > 10000 ? 180 : 120) : 45,
  };

  let recommendation = 'Стандартная спецификация. Расчет выполняется быстро с высокой точностью раскроя.';
  if (isHeavy) {
    recommendation = `Большой объем спецификации (${totalMeters.toLocaleString('ru-RU')} м, ${totalParts.toLocaleString('ru-RU')} деталей, ${uniqueParts} типоразмеров). Скоростные режимы: «Быстро» (10–15 сек), «Стандарт» (1–2 мин) и «Глубокий» (от 2 мин) с комбинаторным перебором карт и 2-opt оптимизацией.`;
  }

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

/**
 * Full Port of Sub Raskroy() from MyRaskroy.bas with Batch Multiplicity Engine
 */
export interface ComprehensiveSuiteItem {
  goal: 'min_waste' | 'variants' | 'min_bars' | 'max_reusable';
  title: string;
  badge: string;
  description: string;
  solution: FullOptimizationSolution;
}

export interface ComprehensiveResult {
  suite: ComprehensiveSuiteItem[];
  bestSolution: FullOptimizationSolution;
}

/**
 * Runs all 4 core optimization strategies in a single benchmark suite
 * If both 12m and 6m standard bars are active, runs a targeted comparative benchmark:
 * 1) 12m + 6m Combined (Optimal)
 * 2) Pure 12m bars
 * 3) Pure 6m bars
 * 4) Batch variants (minimum setup cards)
 */
export function runComprehensiveSuite(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  baseSettings: AppSettings,
  options?: SolveLinearCuttingOptions
): ComprehensiveResult {
  const hasActive12m = stockInput.some(
    (s) => s.isActive !== false && (s.length === 12000 || s.length === 11700)
  );
  const hasActive6m = stockInput.some(
    (s) => s.isActive !== false && s.length === 6000
  );
  const isMultiStandard = hasActive12m && hasActive6m;

  const configs: Array<{
    goal: 'min_waste' | 'variants' | 'min_bars' | 'max_reusable';
    title: string;
    badge: string;
    description: string;
    stockModifier?: (stocks: StockItem[]) => StockItem[];
  }> = isMultiStandard
    ? [
        {
          goal: 'min_waste',
          title: '12м + 6м Оптимальный',
          badge: '🏆 Лучший КИМ',
          description: 'Умный подбор между 12м и 6м для максимального КИМ и мин. расхода',
        },
        {
          goal: 'min_waste',
          title: 'Только 12м хлысты',
          badge: '📏 Стандарт 12м',
          description: 'Раскрой исключительно из 12-метрового проката',
          stockModifier: (stocks) =>
            stocks.map((s) => (s.length === 6000 ? { ...s, isActive: false } : s)),
        },
        {
          goal: 'min_waste',
          title: 'Только 6м хлысты',
          badge: '📐 Стандарт 6м',
          description: 'Раскрой исключительно из 6-метрового проката',
          stockModifier: (stocks) =>
            stocks.map((s) => (s.length === 12000 || s.length === 11700 ? { ...s, isActive: false } : s)),
        },
        {
          goal: 'variants',
          title: 'По вариантам (Серийный)',
          badge: '⚡ Меньше наладок',
          description: 'Минимум уникальных карт для максимальной повторяемости',
        },
      ]
    : [
        {
          goal: 'min_waste',
          title: 'Минимум отходов',
          badge: '🏆 Лучший КИМ',
          description: 'Максимальный КИМ и наименьшие потери металла в отход',
        },
        {
          goal: 'variants',
          title: 'По вариантам',
          badge: '⚡ Меньше наладок',
          description: 'Минимум уникальных карт для быстрой резки на станке',
        },
        {
          goal: 'min_bars',
          title: 'Минимум хлыстов',
          badge: '📦 Меньше заготовок',
          description: 'Минимальное количество целых хлыстов со склада/закупки',
        },
        {
          goal: 'max_reusable',
          title: 'Максимум делового',
          badge: '♻️ Возврат на склад',
          description: 'Максимальный возврат длинномерных деловых остатков',
        },
      ];

  const suite: ComprehensiveSuiteItem[] = [];

  for (let idx = 0; idx < configs.length; idx++) {
    if (options?.shouldAbort?.()) break;
    const cfg = configs[idx];
    const goalSettings: AppSettings = {
      ...baseSettings,
      optimizationGoal: cfg.goal,
    };

    const currentStock = cfg.stockModifier ? cfg.stockModifier(stockInput) : stockInput;

    const sol = solveLinearCutting(currentStock, demandInput, goalSettings, {
      onProgress: (p) => {
        options?.onProgress?.({
          ...p,
          stage: idx + 1,
          totalStages: configs.length,
          stageName: `Комплексный расчет (${idx + 1}/${configs.length}): ${cfg.title}`,
          percent: Math.min(99, Math.round(((idx + p.percent / 100) / configs.length) * 100)),
        });
      },
      shouldAbort: options?.shouldAbort,
    });

    suite.push({
      goal: cfg.goal,
      title: cfg.title,
      badge: cfg.badge,
      description: cfg.description,
      solution: sol,
    });
  }

  // Best solution is highest KIM or min_waste
  let best = suite[0]?.solution;
  for (const item of suite) {
    if (!best || item.solution.overallKIM > best.overallKIM) {
      best = item.solution;
    }
  }

  return { suite, bestSolution: best };
}

export interface BestSolutionState {
  kout: number;
  maxOst: number;
  ostSm: number;
  othSm: number;
  kolVarBest: number;
  remnantsUsed: number;
  remnantLengthUsed: number;
  reusableLen: number;
  targetRemnantsLen: number;
  outSmIsh: number[];
  outSm: number[];
  outTxt: string[];
  outPieces: number[][];
  remainingData: number[];
}

/**
 * 2-Opt Local Search Piece Exchange Optimizer
 * Compaction (1-0 shift) and Inter-pattern piece exchange (1-1 swap)
 * Repairs greedy knapsack tail artifacts and eliminates unusable scrap
 */
function run2OptLocalSearch(
  best: BestSolutionState,
  nod: number,
  dRez: number,
  krm: number,
  delOst: number,
  targetRemnantMin: number,
  goal: AppSettings['optimizationGoal'],
  speed: AppSettings['searchSpeed'],
  customConfig?: CustomStrategyConfig,
  onProgressStep?: (
    stepName: string,
    round: number,
    maxRounds: number,
    cardsCount: number,
    curKim: number
  ) => void
): BestSolutionState {
  if (best.kout <= 1) return best;
  if (customConfig && customConfig.enable2Opt === false) return best;

  const maxRounds =
    customConfig?.twoOptRounds ??
    (speed === 'deep' ? 30 : speed === 'standard' ? 15 : 6);
  const pieces = best.outPieces.map((p) => [...p]);
  const smIsh = [...best.outSmIsh];
  const sm = [...best.outSm];
  let kout = best.kout;

  let improved = false;

  for (let round = 0; round < maxRounds; round++) {
    let roundImproved = false;

    // Report intermediate 2-Opt progress with live card count and KIM
    if (onProgressStep) {
      const curCards = new Set(pieces.map((p) => buildPatternText(p, dRez))).size;
      const totalSm = sm.reduce((a, b) => a + b, 0);
      const totalCap = smIsh.reduce((a, b) => a + b, 0);
      const curKim = totalCap > 0 ? Number(((totalSm / totalCap) * 100).toFixed(1)) : 0;
      onProgressStep(
        `Локальная переупаковка 2-Opt (раунд ${round + 1}/${maxRounds}) · Карт: ${curCards}`,
        round + 1,
        maxRounds,
        curCards,
        curKim
      );
    }

    // 1. Bar Elimination / Compaction (Bin Compaction)
    // Try to completely eliminate a low-fill bar by placing ALL its pieces into available capacities of other bars
    for (let i = kout - 1; i >= 0; i--) {
      if (pieces[i].length === 0) continue;
      const sortedPiecesI = [...pieces[i]].sort((a, b) => b - a);
      const tempCapacities = smIsh.map((cap, idx) => cap - sm[idx]);
      const moves: { targetBar: number; pieceMm: number; pieceScaled: number }[] = [];
      let canEliminate = true;

      for (const pieceMm of sortedPiecesI) {
        const pieceScaled = Math.floor((pieceMm + dRez) / nod);
        let placed = false;
        for (let j = 0; j < kout; j++) {
          if (i === j) continue;
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

      if (canEliminate && moves.length === pieces[i].length) {
        for (const m of moves) {
          pieces[m.targetBar].push(m.pieceMm);
          sm[m.targetBar] += m.pieceScaled;
        }
        pieces[i].length = 0;
        sm[i] = 0;
        roundImproved = true;
        improved = true;
        break;
      }
    }

    // Purge completely emptied bars
    const activeIndices: number[] = [];
    for (let i = 0; i < kout; i++) {
      if (pieces[i].length > 0) {
        activeIndices.push(i);
      }
    }

    if (activeIndices.length < kout) {
      const newPieces: number[][] = [];
      const newSmIsh: number[] = [];
      const newSm: number[] = [];
      for (const idx of activeIndices) {
        newPieces.push(pieces[idx]);
        newSmIsh.push(smIsh[idx]);
        newSm.push(sm[idx]);
      }
      pieces.length = 0;
      pieces.push(...newPieces);
      smIsh.length = 0;
      smIsh.push(...newSmIsh);
      sm.length = 0;
      sm.push(...newSm);
      kout = pieces.length;
    }

    // Precompute pattern counts to protect homogeneous batches from fragmentation
    const sigCounts = new Map<string, number>();
    const barSigs = new Array<string>(kout);
    for (let idx = 0; idx < kout; idx++) {
      const s = `${smIsh[idx]}:${[...pieces[idx]].sort((a, b) => b - a).join(',')}`;
      barSigs[idx] = s;
      sigCounts.set(s, (sigCounts.get(s) || 0) + 1);
    }

    // 2. Piece Swap (1-1 swap between tail bar i and tail bar j)
    for (let i = 0; i < kout; i++) {
      if ((sigCounts.get(barSigs[i]) || 0) >= 4) continue;
      for (let j = i + 1; j < kout; j++) {
        if ((sigCounts.get(barSigs[j]) || 0) >= 4) continue;
        const capI = smIsh[i];
        const capJ = smIsh[j];

        for (let pI = 0; pI < pieces[i].length; pI++) {
          const pieceI = pieces[i][pI];
          const scI = Math.floor((pieceI + dRez) / nod);

          for (let pJ = 0; pJ < pieces[j].length; pJ++) {
            const pieceJ = pieces[j][pJ];
            const scJ = Math.floor((pieceJ + dRez) / nod);

            if (scI === scJ) continue;

            const newSmI = sm[i] - scI + scJ;
            const newSmJ = sm[j] - scJ + scI;

            if (newSmI <= capI && newSmJ <= capJ) {
              const oldScrapI = (capI - sm[i]) * nod;
              const oldScrapJ = (capJ - sm[j]) * nod;
              const newScrapI = (capI - newSmI) * nod;
              const newScrapJ = (capJ - newSmJ) * nod;

              const oldUnusableScrap =
                (delOst > 0 && oldScrapI >= delOst ? 0 : oldScrapI) +
                (delOst > 0 && oldScrapJ >= delOst ? 0 : oldScrapJ);
              const newUnusableScrap =
                (delOst > 0 && newScrapI >= delOst ? 0 : newScrapI) +
                (delOst > 0 && newScrapJ >= delOst ? 0 : newScrapJ);

              let shouldSwap = false;
              if (goal === 'min_waste') {
                shouldSwap = newUnusableScrap < oldUnusableScrap;
              } else if (goal === 'max_reusable') {
                const oldMaxRem = Math.max(oldScrapI, oldScrapJ);
                const newMaxRem = Math.max(newScrapI, newScrapJ);
                shouldSwap =
                  newMaxRem > oldMaxRem &&
                  (newMaxRem >= targetRemnantMin || newUnusableScrap <= oldUnusableScrap);
              }

              if (shouldSwap) {
                pieces[i][pI] = pieceJ;
                pieces[j][pJ] = pieceI;
                sm[i] = newSmI;
                sm[j] = newSmJ;
                roundImproved = true;
                improved = true;
                break;
              }
            }
          }
          if (roundImproved) break;
        }
        if (roundImproved) break;
      }
      if (roundImproved) break;
    }

    // 3. Cluster Swap (2 pieces from tail bar i for 1 piece from tail bar j)
    if (!roundImproved) {
      for (let i = 0; i < kout; i++) {
        if ((sigCounts.get(barSigs[i]) || 0) >= 4) continue;
        if (pieces[i].length < 2) continue;
        for (let j = 0; j < kout; j++) {
          if (i === j) continue;
          if ((sigCounts.get(barSigs[j]) || 0) >= 4) continue;
          const capI = smIsh[i];
          const capJ = smIsh[j];

          for (let pI1 = 0; pI1 < pieces[i].length; pI1++) {
            for (let pI2 = pI1 + 1; pI2 < pieces[i].length; pI2++) {
              const pieceI1 = pieces[i][pI1];
              const pieceI2 = pieces[i][pI2];
              const scI = Math.floor((pieceI1 + dRez) / nod) + Math.floor((pieceI2 + dRez) / nod);

              for (let pJ = 0; pJ < pieces[j].length; pJ++) {
                const pieceJ = pieces[j][pJ];
                const scJ = Math.floor((pieceJ + dRez) / nod);

                if (scI === scJ) continue;

                const newSmI = sm[i] - scI + scJ;
                const newSmJ = sm[j] - scJ + scI;

                if (newSmI <= capI && newSmJ <= capJ) {
                  const oldScrapI = (capI - sm[i]) * nod;
                  const oldScrapJ = (capJ - sm[j]) * nod;
                  const newScrapI = (capI - newSmI) * nod;
                  const newScrapJ = (capJ - newSmJ) * nod;

                  const oldUnusableScrap =
                    (delOst > 0 && oldScrapI >= delOst ? 0 : oldScrapI) +
                    (delOst > 0 && oldScrapJ >= delOst ? 0 : oldScrapJ);
                  const newUnusableScrap =
                    (delOst > 0 && newScrapI >= delOst ? 0 : newScrapI) +
                    (delOst > 0 && newScrapJ >= delOst ? 0 : newScrapJ);

                  let shouldSwap = false;
                  if (goal === 'min_waste') {
                    if (newUnusableScrap < oldUnusableScrap) {
                      shouldSwap = true;
                    } else if (newUnusableScrap === oldUnusableScrap && newUnusableScrap === 0) {
                      const oldMaxRem = Math.max(oldScrapI, oldScrapJ);
                      const newMaxRem = Math.max(newScrapI, newScrapJ);
                      shouldSwap = newMaxRem > oldMaxRem;
                    }
                  } else if (goal === 'max_reusable') {
                    const oldMaxRem = Math.max(oldScrapI, oldScrapJ);
                    const newMaxRem = Math.max(newScrapI, newScrapJ);
                    shouldSwap =
                      newMaxRem > oldMaxRem &&
                      (newMaxRem >= targetRemnantMin || newUnusableScrap <= oldUnusableScrap);
                  }

                  if (shouldSwap) {
                    pieces[j].splice(pJ, 1, pieceI1, pieceI2);
                    pieces[i].splice(pI2, 1);
                    pieces[i].splice(pI1, 1, pieceJ);
                    sm[i] = newSmI;
                    sm[j] = newSmJ;
                    roundImproved = true;
                    improved = true;
                    break;
                  }
                }
              }
              if (roundImproved) break;
            }
            if (roundImproved) break;
          }
          if (roundImproved) break;
        }
        if (roundImproved) break;
      }
    }

    if (!roundImproved) break;
  }

  if (!improved) return best;

  // Rebuild outTxt and update metrics
  const outTxt: string[] = [];
  let othSm = 0;
  let reusableLen = 0;
  let targetRemnantsLen = 0;

  for (let i = 0; i < kout; i++) {
    pieces[i].sort((a, b) => b - a);
    let txt = '';
    let k = 1;
    let t = -1;
    for (let p = 0; p < pieces[i].length; p++) {
      const len = pieces[i][p];
      if (len === t) {
        k++;
      } else {
        txt =
          txt +
          (k === 1 ? (txt === '' ? '' : ')') : ` - ${k} шт.)`) +
          (txt === '' ? '' : ' + ') +
          `(${len}${dRez > 0 ? '+' + dRez : ''}`;
        k = 1;
      }
      if (p === pieces[i].length - 1) {
        txt = txt + (k === 1 ? ')' : ` - ${k} шт.)`);
      }
      t = len;
    }
    outTxt.push(txt);

    const remMm = (smIsh[i] - sm[i]) * nod;
    othSm += smIsh[i] - sm[i];
    if (delOst > 0 && remMm >= delOst) {
      reusableLen += remMm;
    }
    if (remMm >= targetRemnantMin) {
      targetRemnantsLen += remMm;
    }
  }

  const kolVarBest = new Set(outTxt).size;

  return {
    ...best,
    kout,
    othSm,
    kolVarBest,
    reusableLen,
    targetRemnantsLen,
    outSmIsh: smIsh,
    outSm: sm,
    outTxt,
    outPieces: pieces,
  };
}

/**
 * Helper to build standard pattern description text
 */
function buildPatternText(pieces: number[], dRez: number): string {
  const sorted = [...pieces].sort((a, b) => b - a);
  let txt = '';
  let k = 1;
  let t = -1;
  for (let p = 0; p < sorted.length; p++) {
    const len = sorted[p];
    if (len === t) {
      k++;
    } else {
      txt =
        txt +
        (k === 1 ? (txt === '' ? '' : ')') : ` - ${k} шт.)`) +
        (txt === '' ? '' : ' + ') +
        `(${len}${dRez > 0 ? '+' + dRez : ''}`;
      k = 1;
    }
    if (p === sorted.length - 1) {
      txt = txt + (k === 1 ? ')' : ` - ${k} шт.)`);
    }
    t = len;
  }
  return txt;
}

/**
 * Pattern Tail Consolidation & Recombination Optimizer (The Tail Squeezer)
 * Analyzes solution patterns, extracts pieces from fragmented tail/minor patterns,
 * synthesizes additional copies of dominant/major patterns, and repacks remnants.
 * Directly eliminates tail fragmentation and collapses card count to the theoretical minimum.
 */
function consolidateTailPatterns(
  best: BestSolutionState,
  nod: number,
  dRez: number,
  krm: number,
  delOst: number,
  targetRemnantMin: number,
  goal: AppSettings['optimizationGoal'],
  customConfig?: CustomStrategyConfig,
  onProgressStep?: (stepName: string, cardsCount: number, curKim: number) => void
): BestSolutionState {
  if (best.kout <= 2) return best;
  if (customConfig && customConfig.enableTailConsolidation === false) return best;

  let currentBest = best;
  const maxPoolBars = customConfig?.tailConsolidationMaxBars ?? 15;
  const scrapTolerance =
    customConfig?.cardMergeScrapToleranceMm ??
    (goal === 'variants' ? 800 : 500);

  const candidateThresholds = [1, 2, 3, 4, 5, 6, 8, 10, 15].filter((t) => t <= maxPoolBars);
  if (candidateThresholds.length === 0) candidateThresholds.push(Math.min(maxPoolBars, 2));

  // Multi-pass consolidation loop: repeat as long as improvements are found
  for (let iter = 0; iter < 6; iter++) {
    if (onProgressStep) {
      const totalSm = currentBest.outSm.reduce((a, b) => a + b, 0);
      const totalCap = currentBest.outSmIsh.reduce((a, b) => a + b, 0);
      const curKim = totalCap > 0 ? Number(((totalSm / totalCap) * 100).toFixed(1)) : 0;
      onProgressStep(
        `Схлопывание карт хвостов (итерация ${iter + 1}/6 · карт: ${currentBest.kolVarBest})`,
        currentBest.kolVarBest,
        curKim
      );
    }
    // 1. Group bars by pattern signature
    interface PatternGroup {
      sig: string;
      smIsh: number;
      pieces: number[];
      barIndices: number[];
      count: number;
    }

    const groupsMap = new Map<string, PatternGroup>();
    for (let i = 0; i < currentBest.kout; i++) {
      const barPieces = [...currentBest.outPieces[i]].sort((a, b) => b - a);
      const sig = `${currentBest.outSmIsh[i]}:${barPieces.join(',')}`;
      const existing = groupsMap.get(sig);
      if (existing) {
        existing.count++;
        existing.barIndices.push(i);
      } else {
        groupsMap.set(sig, {
          sig,
          smIsh: currentBest.outSmIsh[i],
          pieces: barPieces,
          barIndices: [i],
          count: 1,
        });
      }
    }

    const groups = Array.from(groupsMap.values());
    if (groups.length <= 1) break;

    // Sort groups descending by count
    groups.sort((a, b) => b.count - a.count);

    // Major patterns: patterns with multiple bars (or highest count)
    const majorGroups = groups.filter((g) => g.count >= 2);
    if (majorGroups.length === 0 && groups.length > 0) {
      majorGroups.push(groups[0]);
    }

    let improvedInIter = false;

    // We try tail candidate thresholds bounded by customConfig.tailConsolidationMaxBars
    for (const maxTailCount of candidateThresholds) {
      const tailGroups = groups.filter((g) => g.count <= maxTailCount);
      if (tailGroups.length === 0) continue;

      // Pool all pieces and bar capacities from tail groups
      const tailPieces: number[] = [];
      const tailSmIshList: number[] = [];
      for (const tg of tailGroups) {
        for (let c = 0; c < tg.count; c++) {
          tailPieces.push(...tg.pieces);
          tailSmIshList.push(tg.smIsh);
        }
      }

      if (tailPieces.length === 0) continue;

      // Frequency map of available tail pieces
      const tailFreq = new Map<number, number>();
      for (const p of tailPieces) {
        tailFreq.set(p, (tailFreq.get(p) || 0) + 1);
      }

      // Try synthesizing additional copies of any major pattern
      for (const major of majorGroups) {
        if (tailGroups.includes(major)) continue;
        // Count pieces required per major bar
        const requiredPerBar = new Map<number, number>();
        for (const p of major.pieces) {
          requiredPerBar.set(p, (requiredPerBar.get(p) || 0) + 1);
        }

        // How many additional major bars can we synthesize?
        let maxAdditional = Infinity;
        for (const [p, req] of requiredPerBar.entries()) {
          const avail = tailFreq.get(p) || 0;
          const possible = Math.floor(avail / req);
          if (possible < maxAdditional) {
            maxAdditional = possible;
          }
        }

        if (maxAdditional <= 0 || maxAdditional === Infinity) continue;

        // Test each possible number of additional bars: kAdd = maxAdditional down to 1
        for (let kAdd = maxAdditional; kAdd >= 1; kAdd--) {
          const usableTailBars = [...tailSmIshList].sort((a, b) => b - a);
          const assignedBarsForMajor: number[] = [];
          for (let k = 0; k < kAdd; k++) {
            const bIdx = usableTailBars.findIndex((cap) => cap >= major.smIsh);
            if (bIdx >= 0) {
              assignedBarsForMajor.push(major.smIsh);
              usableTailBars.splice(bIdx, 1);
            }
          }

          if (assignedBarsForMajor.length < kAdd) continue;

          // Deduct kAdd * major pieces from tail
          const remainingTailFreq = new Map(tailFreq);
          for (const [p, req] of requiredPerBar.entries()) {
            remainingTailFreq.set(p, (remainingTailFreq.get(p) || 0) - req * kAdd);
          }

          const remainingPieces: number[] = [];
          for (const [p, cnt] of remainingTailFreq.entries()) {
            for (let c = 0; c < cnt; c++) remainingPieces.push(p);
          }
          remainingPieces.sort((a, b) => b - a);

          // Now repack remainingPieces into usableTailBars using longSumEl or greedy
          const repackedBars: { smIsh: number; sm: number; pieces: number[] }[] = [];
          let barSlotIdx = 0;
          let allRemainingPacked = true;
          const unassignedPieces = [...remainingPieces];

          while (unassignedPieces.length > 0) {
            if (barSlotIdx >= usableTailBars.length) {
              allRemainingPacked = false;
              break;
            }
            const barCap = usableTailBars[barSlotIdx];
            const totalRemainingScaled = unassignedPieces.reduce(
              (sum, p) => sum + Math.floor((p + dRez) / nod),
              0
            );

            let packedOnBar: number[] = [];
            if (totalRemainingScaled <= barCap) {
              packedOnBar.push(...unassignedPieces);
              unassignedPieces.length = 0;
            } else {
              const scaledPieces = unassignedPieces.map((p) => Math.floor((p + dRez) / nod));
              const scaledSumResult = longSumEl(scaledPieces, barCap, Math.floor(barCap * 0.15));

              if (scaledSumResult && scaledSumResult.length > 0) {
                const toRemoveIdx = new Set<number>();
                for (const scVal of scaledSumResult) {
                  const foundIdx = unassignedPieces.findIndex(
                    (p, pI) => !toRemoveIdx.has(pI) && Math.floor((p + dRez) / nod) === scVal
                  );
                  if (foundIdx >= 0) {
                    toRemoveIdx.add(foundIdx);
                    packedOnBar.push(unassignedPieces[foundIdx]);
                  }
                }
                const nextUnassigned: number[] = [];
                for (let pI = 0; pI < unassignedPieces.length; pI++) {
                  if (!toRemoveIdx.has(pI)) nextUnassigned.push(unassignedPieces[pI]);
                }
                unassignedPieces.length = 0;
                unassignedPieces.push(...nextUnassigned);
              } else {
                let space = barCap;
                const nextUnassigned: number[] = [];
                for (const p of unassignedPieces) {
                  const sc = Math.floor((p + dRez) / nod);
                  if (sc <= space) {
                    packedOnBar.push(p);
                    space -= sc;
                  } else {
                    nextUnassigned.push(p);
                  }
                }
                unassignedPieces.length = 0;
                unassignedPieces.push(...nextUnassigned);
              }
            }

            if (packedOnBar.length === 0) {
              allRemainingPacked = false;
              break;
            }

            const barSum = packedOnBar.reduce((sum, p) => sum + Math.floor((p + dRez) / nod), 0);
            repackedBars.push({
              smIsh: barCap,
              sm: barSum,
              pieces: packedOnBar,
            });
            barSlotIdx++;
          }

          if (!allRemainingPacked) continue;

          // Check if total bars used by tail pieces is <= original tail bars count
          const originalTailBarsCount = tailSmIshList.length;
          const newTailBarsCount = kAdd + repackedBars.length;
          if (newTailBarsCount > originalTailBarsCount) continue;

          // Construct candidate solution
          const preservedGroups = groups.filter((g) => !tailGroups.includes(g) && g !== major);
          const candidatePieces: number[][] = [];
          const candidateSmIsh: number[] = [];
          const candidateSm: number[] = [];

          // 1. Preserved groups
          for (const pg of preservedGroups) {
            for (let c = 0; c < pg.count; c++) {
              candidatePieces.push([...pg.pieces]);
              candidateSmIsh.push(pg.smIsh);
              candidateSm.push(pg.pieces.reduce((s, p) => s + Math.floor((p + dRez) / nod), 0));
            }
          }

          // 2. Major group + kAdd bars
          const newMajorCount = major.count + kAdd;
          const majorBarSum = major.pieces.reduce((s, p) => s + Math.floor((p + dRez) / nod), 0);
          for (let c = 0; c < newMajorCount; c++) {
            candidatePieces.push([...major.pieces]);
            candidateSmIsh.push(major.smIsh);
            candidateSm.push(majorBarSum);
          }

          // 3. Repacked tail bars
          for (const rb of repackedBars) {
            candidatePieces.push([...rb.pieces]);
            candidateSmIsh.push(rb.smIsh);
            candidateSm.push(rb.sm);
          }

          // Build txt and metrics
          const candidateTxt: string[] = [];
          let candidateOthSm = 0;
          let candidateReusable = 0;
          let candidateTargetRem = 0;

          for (let i = 0; i < candidatePieces.length; i++) {
            candidatePieces[i].sort((a, b) => b - a);
            const txt = buildPatternText(candidatePieces[i], dRez);
            candidateTxt.push(txt);

            const remMm = (candidateSmIsh[i] - candidateSm[i]) * nod;
            candidateOthSm += candidateSmIsh[i] - candidateSm[i];
            if (delOst > 0 && remMm >= delOst) candidateReusable += remMm;
            if (remMm >= targetRemnantMin) candidateTargetRem += remMm;
          }

          const candidateKolVar = new Set(candidateTxt).size;
          const candidateKout = candidatePieces.length;

          // Calculate current non-reusable unusable scrap
          let curUnusableScrap = 0;
          for (let i = 0; i < currentBest.kout; i++) {
            const remMm = (currentBest.outSmIsh[i] - currentBest.outSm[i]) * nod;
            if (delOst <= 0 || remMm < delOst) {
              curUnusableScrap += remMm;
            }
          }
          let candUnusableScrap = 0;
          for (let i = 0; i < candidatePieces.length; i++) {
            const remMm = (candidateSmIsh[i] - candidateSm[i]) * nod;
            if (delOst <= 0 || remMm < delOst) {
              candUnusableScrap += remMm;
            }
          }

          // Evaluation: is candidate better?
          let isBetter = false;
          if (candidateKout < currentBest.kout) {
            isBetter = true;
          } else if (candidateKout === currentBest.kout) {
            if (candidateKolVar < currentBest.kolVarBest) {
              // Fewer cards/setups is strictly better unless it creates significantly more unusable scrap
              isBetter = candUnusableScrap <= curUnusableScrap + scrapTolerance;
            } else if (candidateKolVar === currentBest.kolVarBest) {
              if (goal === 'min_waste') {
                isBetter = candUnusableScrap <= curUnusableScrap;
              } else if (goal === 'max_reusable') {
                isBetter = candidateTargetRem >= currentBest.targetRemnantsLen;
              } else {
                isBetter = candUnusableScrap <= curUnusableScrap;
              }
            }
          }

          if (isBetter) {
            if (onProgressStep && candidateKolVar < currentBest.kolVarBest) {
              const totalSm = candidateSm.reduce((a, b) => a + b, 0);
              const totalCap = candidateSmIsh.reduce((a, b) => a + b, 0);
              const curKim = totalCap > 0 ? Number(((totalSm / totalCap) * 100).toFixed(1)) : 0;
              onProgressStep(
                `Успешное сжатие: карт сокращено с ${currentBest.kolVarBest} до ${candidateKolVar}!`,
                candidateKolVar,
                curKim
              );
            }
            currentBest = {
              ...currentBest,
              kout: candidateKout,
              othSm: candidateOthSm,
              kolVarBest: candidateKolVar,
              reusableLen: candidateReusable,
              targetRemnantsLen: candidateTargetRem,
              outSmIsh: candidateSmIsh,
              outSm: candidateSm,
              outTxt: candidateTxt,
              outPieces: candidatePieces,
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

  return currentBest;
}

/**
 * Full Port of Sub Raskroy() from MyRaskroy.bas with Batch Multiplicity Engine
 * Deeply differentiated by Optimization Goal and Search Speed
 */
export function solveLinearCutting(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings,
  options?: SolveLinearCuttingOptions
): FullOptimizationSolution {
  // If comprehensive mode requested, run suite and return the premier solution
  if (settings.optimizationGoal === 'comprehensive') {
    const res = runComprehensiveSuite(stockInput, demandInput, settings, options);
    return res.bestSolution;
  }

  const startTime = performance.now();

  let dRez = Math.max(0, settings.bladeWidth || 0);
  const krm = Math.max(0, settings.edgeTrim || 0);
  const delOst = Math.max(0, settings.reusableRemnantMin || 0);
  const targetRemnantMin =
    settings.targetRemnantMinLength && settings.targetRemnantMinLength > 0
      ? Math.max(delOst, settings.targetRemnantMinLength)
      : Math.max(delOst, 1500);
  const b2prof = settings.dualProfileCut === true;
  const bGroupe = settings.groupSolutions !== false;

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

  // Dual profile expansion:
  // Demand expansion: Each piece is recorded with cutting loss dRez.
  // With dynamic bundle cutting (b2prof), bundle sizes (2+ bars) are selected algorithmically per pattern.
  const rawRng: number[] = [];
  let ostSmTotal = 0;

  for (const d of demandInput) {
    const s = d.length;
    if (s <= 0 || d.quantity <= 0) continue;
    for (let j = 0; j < d.quantity; j++) {
      rawRng.push(s + dRez);
      ostSmTotal += s;
    }
  }

  // Expand stock bars: smArr array in VBA
  const isPrioritizeRemnants = settings.optimizationGoal === 'prioritize_remnants';
  const targetRemnantKIM = Math.min(99, Math.max(1, settings.targetRemnantKIM ?? 75));

  const totalDemandLength = rawRng.reduce((a, b) => a + b, 0);

  const isRemnantStock = (st: StockItem): boolean => {
    if (st.isStandardUnlimited) return false;
    if (st.length === 6000 || st.length === 12000 || st.length === 11700) {
      return false;
    }
    return st.length < 6000;
  };

  const rawRemnantSmArr: number[] = [];
  const rawStandardSmArr: number[] = [];

  const activeStandardLengths = stockInput
    .filter((st) => st.isActive !== false && (st.isStandard || st.isStandardUnlimited || st.length === 6000 || st.length === 12000))
    .map((st) => st.length);

  for (const st of stockInput) {
    if (st.isActive === false) continue;
    const s = st.length - krm;
    if (s <= 0) continue;

    const isStandardAuto =
      (st.length === 6000 || st.length === 12000 || st.isStandardUnlimited) &&
      (st.quantity <= 0 || !st.quantity);
    // Generous estimate so standard stock never runs out prematurely:
    const neededEstimate = Math.ceil(totalDemandLength / s) * 2 + 100;
    const qty = isStandardAuto ? Math.max(200, neededEstimate) : st.quantity;
    if (qty <= 0) continue;

    const targetArr = isRemnantStock(st) ? rawRemnantSmArr : rawStandardSmArr;
    for (let j = 0; j < qty; j++) {
      targetArr.push(s);
    }
  }

  // Combined for non-remnant strategies (sorted descending by length)
  const rawSmArr = [...rawRemnantSmArr, ...rawStandardSmArr];
  rawSmArr.sort((a, b) => b - a);

  if (rawRng.length === 0 || rawSmArr.length === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      overallKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
  }

  // Calculate GCD (myGcd) for scaling reduction
  let nod = dRez || 1;
  for (const r of rawRng) nod = myGcd(nod, r);
  for (const sm of rawSmArr) nod = myGcd(nod, sm);

  // Divide by nod
  const scaledRng = rawRng.map((x) => Math.floor(x / nod));
  const scaledSmArr = rawSmArr.map((x) => Math.floor(x / nod));
  const scaledRemnants = rawRemnantSmArr.map((x) => Math.floor(x / nod));
  const scaledStandard = rawStandardSmArr.map((x) => Math.floor(x / nod));

  // Determine search iterations based on speed setting and custom config
  const speed = settings.searchSpeed;
  const isDeep = speed === 'deep';
  const isStandard = speed === 'standard';
  const isCustom = settings.optimizationGoal === 'custom';
  const customCfg = isCustom
    ? settings.customStrategyConfig || getDefaultCustomConfig()
    : undefined;

  // Base search exploration depth
  const baseSortZ = stockInput.length > 1 ? (isDeep ? 5 : isStandard ? 3 : 1) : 0;
  const baseSort = isDeep ? 28 : isStandard ? 14 : 7;
  const baseVar = isDeep ? 16 : isStandard ? 10 : 5;

  const multiplier = isCustom ? Math.max(0.1, customCfg?.maxPassesMultiplier ?? 1.0) : 1.0;
  const maxSortZ = Math.max(0, Math.round(baseSortZ * multiplier));
  const maxSort = Math.max(1, Math.round(baseSort * multiplier));
  const maxVar = Math.max(1, Math.round(baseVar * multiplier));

  let best: BestSolutionState | null = null;

  // Initial stage 1 progress
  options?.onProgress?.({
    stage: 1,
    totalStages: 3,
    stageName: 'Анализ спецификации и подготовка заготовок',
    percent: 10,
    placedParts: 0,
    totalParts: rawRng.length,
    usedBars: 0,
    totalBarsEstimate: Math.ceil(totalDemandLength / (rawSmArr[0] || 6000)),
    bestKIM: 0,
    elapsedMs: Math.round(performance.now() - startTime),
  });

  const totalPasses = (maxSortZ + 1) * (maxSort + 1) * (maxVar + 1);
  let currentPass = 0;
  let lastProgressReportTime = performance.now();

  // Search loops matching VBA heuristics with high-performance batch multiplicity
  outerLoopSearch: for (let sortZ = 0; sortZ <= maxSortZ; sortZ++) {
    let smArr: number[];
    if (isPrioritizeRemnants) {
      const sortedRemnants = sortLongArray(
        scaledRemnants,
        sortZ === 0 ? 1 : sortZ === 1 ? 2 : sortZ
      );
      const sortedStandard = sortLongArray(scaledStandard, 1);
      smArr = [...sortedRemnants, ...sortedStandard];
    } else {
      smArr = sortLongArray(scaledSmArr, sortZ);
    }

    for (let sort = 0; sort <= maxSort; sort++) {
      const rng = sortLongArray(scaledRng, sort);

      for (let v = 0; v <= maxVar; v++) {
        currentPass++;

        // Check cancellation / early abort
        if (options?.shouldAbort?.()) {
          break outerLoopSearch;
        }

        let maxOst = 0;
        let kout = 0;
        let data = [...rng];
        let sumData = data.reduce((a, b) => a + b, 0);
        let iSm = 0;
        let othSm = 0;
        let ostSm = sumData;
        let curRemnantsUsed = 0;
        let curRemnantLengthUsed = 0;

        const curOutSmIsh: number[] = [];
        const curOutSm: number[] = [];
        const curOutTxt: string[] = [];
        const curOutPieces: number[][] = [];

        while (iSm < smArr.length && data.length > 0) {
          const sm = smArr[iSm];

          // 1. Candidate Pool Truncation & Frequency Mapping
          const freqMap = new Map<number, number>();
          for (let dIdx = 0; dIdx < data.length; dIdx++) {
            const val = data[dIdx];
            freqMap.set(val, (freqMap.get(val) || 0) + 1);
          }

          let candidateItems: number[] = [];
          for (const [val, count] of freqMap.entries()) {
            if (val <= sm) {
              const maxCanFit = Math.floor(sm / val);
              const take = Math.min(count, maxCanFit);
              for (let c = 0; c < take; c++) {
                candidateItems.push(val);
              }
            }
          }

          // Candidate ordering: sortLongArray applies Excel VBA sorting heuristics (sort = 0..maxSort)
          candidateItems = sortLongArray(candidateItems, sort);

          let arrEl: number[] | null = null;
          if (v === 0) {
            arrEl = greedyAlgo(candidateItems, sm);
          } else {
            let dm = 0;
            if (settings.optimizationGoal === 'min_waste' || settings.optimizationGoal === 'variants') {
              // Ищем нулевой или сверхмалый отход (dm = 0, 1, 2, 4, 8, 12, 16...)
              if (v === 1) dm = 0;
              else if (v === 2) dm = 1;
              else if (v === 3) dm = 2;
              else if (v === 4) dm = 4;
              else dm = Math.floor((sm * (v - 3)) / 150);
              arrEl = longSumEl(candidateItems, sm, dm);
            } else if (settings.optimizationGoal === 'min_bars') {
              // «Минимум хлыстов»: максимальное заполнение до предела хлыста
              if (v === 1) dm = 0;
              else if (v === 2) dm = 1;
              else dm = Math.floor((sm * v) / 100);
              arrEl = longSumEl(candidateItems, sm, dm);
            } else if (settings.optimizationGoal === 'max_reusable') {
              // «Максимум делового»: ищем либо 0 отход, либо прицельный деловой остаток >= targetRemnantMin
              const scaledTarget = Math.floor(targetRemnantMin / nod);
              if (v === 1) {
                arrEl = longSumEl(candidateItems, sm, 0);
              } else if (v === 2 && scaledTarget > 0 && sm > scaledTarget + 10) {
                arrEl = longSumEl(candidateItems, sm - scaledTarget, 2);
              } else if (v === 3 && scaledTarget > 0 && sm > Math.floor(scaledTarget * 1.3)) {
                arrEl = longSumEl(candidateItems, sm - Math.floor(scaledTarget * 1.25), 2);
              } else if (v === 4 && scaledTarget > 0 && sm > Math.floor(scaledTarget * 1.6)) {
                arrEl = longSumEl(candidateItems, sm - Math.floor(scaledTarget * 1.5), 2);
              } else if (v === 5 && scaledTarget > 0 && sm > Math.floor(scaledTarget * 2.1)) {
                arrEl = longSumEl(candidateItems, sm - Math.floor(scaledTarget * 2.0), 2);
              } else {
                dm = Math.floor((sm * (v - 2)) / 90);
                arrEl = longSumEl(candidateItems, sm, dm);
              }
            } else {
              // Базовый:
              const ceilDiv = Math.ceil(sumData / sm);
              dm = ceilDiv > 0 ? Math.floor((sm - Math.floor(sumData / ceilDiv)) / 2) : 0;
              arrEl = longSumEl(candidateItems, sm, dm);
            }
          }

          if (arrEl && arrEl.length > 0) {
            const sTemp = arrEl.reduce((a, b) => a + b, 0);
            const barSpentMm = sTemp * nod + krm;
            const barTotalMm = sm * nod + krm;
            const isRemnantBar = barTotalMm < 6000;
            const barKIM = (barSpentMm / barTotalMm) * 100;

            // Remnant preservation check
            if (isPrioritizeRemnants && isRemnantBar && barKIM < targetRemnantKIM) {
              iSm++;
              continue;
            }

            arrEl = sortLongArray(arrEl, 1);
            const kEl = arrEl.length;

            const patternCounts = new Map<number, number>();
            for (let i = 0; i < kEl; i++) {
              const el = arrEl[i];
              patternCounts.set(el, (patternCounts.get(el) || 0) + 1);
            }

            // Multiplicity Batching
            let maxPatternRepeats = Infinity;
            for (const [el, neededPerBar] of patternCounts.entries()) {
              const available = freqMap.get(el) || 0;
              const repeats = Math.floor(available / neededPerBar);
              if (repeats < maxPatternRepeats) {
                maxPatternRepeats = repeats;
              }
            }

            let identicalBarsAvailable = 0;
            while (iSm + identicalBarsAvailable < smArr.length && smArr[iSm + identicalBarsAvailable] === sm) {
              identicalBarsAvailable++;
            }

            const batchCount = Math.max(1, Math.min(maxPatternRepeats, identicalBarsAvailable));

            let t = 0;
            let k = 1;
            let s = 0;
            let txt = '';
            const patternPieceLengths: number[] = [];

            for (let i = 0; i < kEl; i++) {
              const el = arrEl[i];
              const pieceLen = el * nod - dRez;
              patternPieceLengths.push(pieceLen);

              if (el === t) {
                k++;
              } else {
                txt =
                  txt +
                  (k === 1 ? (txt === '' ? '' : ')') : ` - ${k} шт.)`) +
                  (txt === '' ? '' : ' + ') +
                  `(${pieceLen}${dRez > 0 ? '+' + dRez : ''}`;
                k = 1;
              }

              if (i === kEl - 1) {
                txt = txt + (k === 1 ? ')' : ` - ${k} шт.)`);
              }
              t = el;
              s += el;
            }

            // Adaptive bar length selection:
            // If the pattern pieces sum fits into a shorter active standard bar (e.g. 6000 mm instead of 12000 mm),
            // downsize sm to the shorter bar to save meters and eliminate unnecessary remnant/waste.
            let effectiveSm = sm;
            const barPhysicalMm = sm * nod + krm;
            if (barPhysicalMm >= 11000 && activeStandardLengths.includes(6000)) {
              const max6000Scaled = Math.floor((6000 - krm) / nod);
              if (s <= max6000Scaled) {
                effectiveSm = max6000Scaled;
              }
            }

            const barWaste = effectiveSm - s;
            const barWasteMm = barWaste * nod;
            const hasScrapWaste = barWasteMm > 0 && (delOst <= 0 || barWasteMm < delOst);

            // Strategy-Aware Dynamic Bundle Sizing (Пакетный рез):
            let effectiveBatchCount = batchCount;
            if (b2prof) {
              if (settings.optimizationGoal === 'min_waste') {
                // Стратегия «Минимум отходов» менее склонна к пакетированию при наличии отхода:
                // если с палки образуется негодный обрезок/лом, пакетирование умножает этот лом!
                // Поэтому при наличии лома режем по 1 хлысту (effectiveBatchCount = 1),
                // позволяя следующим палкам найти идеальные комбинации с нулевым ломом.
                // Пакетируем только при нулевом ломе или полноценном деловом остатке.
                if (hasScrapWaste) {
                  effectiveBatchCount = 1;
                }
              } else if (settings.optimizationGoal === 'variants') {
                // Стратегия «По вариантам»: максимизирует пакетный рез (от 2х шт.)
                // чтобы свести количество уникальных карт к минимуму
                effectiveBatchCount = Math.max(1, effectiveBatchCount);
              } else if (settings.fillControlEnabled && barKIM < (settings.fillControlThreshold ?? 50)) {
                // Если КИМ ниже порога контроля заполнения, не пакетируем недозаполненную карту
                effectiveBatchCount = 1;
              }
            } else {
              // Если пакетный рез выключен, рассчитываем по 1 хлысту на этапе подбора
              // (все одинаковые карты в финале гарантированно группируются в партии через canonicalKey)
              effectiveBatchCount = 1;
            }

            for (let b = 0; b < effectiveBatchCount; b++) {
              kout++;
              curOutSmIsh.push(effectiveSm);
              curOutSm.push(s);
              curOutTxt.push(txt);
              curOutPieces.push(patternPieceLengths);

              if (isRemnantBar) {
                curRemnantsUsed++;
                curRemnantLengthUsed += barTotalMm;
              }
            }

            othSm += barWaste * effectiveBatchCount;
            if (maxOst < barWaste) maxOst = barWaste;

            iSm += effectiveBatchCount;

            const toRemove = new Map<number, number>();
            for (const [el, neededPerBar] of patternCounts.entries()) {
              toRemove.set(el, neededPerBar * effectiveBatchCount);
            }

            const nextData: number[] = [];
            for (let i = 0; i < data.length; i++) {
              const val = data[i];
              const rem = toRemove.get(val);
              if (rem && rem > 0) {
                toRemove.set(val, rem - 1);
              } else {
                nextData.push(val);
              }
            }
            data = nextData;
            sumData -= s * effectiveBatchCount;
            ostSm = Math.max(0, sumData);
          } else {
            iSm++;
          }
        }

        // Count unique variants via Set
        const kolVar = new Set(curOutTxt).size;

        // Calculate reusable remnant length and targeted-size remnant length for this candidate solution
        let curReusableLen = 0;
        let curTargetRemnantsLen = 0;
        for (let i = 0; i < curOutSmIsh.length; i++) {
          const remMm = (curOutSmIsh[i] - curOutSm[i]) * nod;
          if (delOst > 0 && remMm >= delOst) {
            curReusableLen += remMm;
          }
          if (remMm >= targetRemnantMin) {
            curTargetRemnantsLen += remMm;
          }
        }

        // Differentiated Strategy Scoring & Fitness Function:
        let bIsVarBest = false;
        if (!best) {
          bIsVarBest = true;
        } else if (isPrioritizeRemnants) {
          if (ostSm !== best.ostSm) {
            bIsVarBest = ostSm < best.ostSm;
          } else if (curRemnantsUsed !== best.remnantsUsed) {
            bIsVarBest = curRemnantsUsed > best.remnantsUsed;
          } else if (curRemnantLengthUsed !== best.remnantLengthUsed) {
            bIsVarBest = curRemnantLengthUsed > best.remnantLengthUsed;
          } else if (othSm !== best.othSm) {
            bIsVarBest = othSm < best.othSm;
          } else {
            bIsVarBest = kolVar < best.kolVarBest;
          }
        } else if (
          settings.optimizationGoal === 'variants' ||
          (isCustom && customCfg?.preferFewerCards)
        ) {
          // 1. ПО ВАРИАНТАМ / ПОЛЬЗОВАТЕЛЬСКАЯ (ПРИОРИТЕТ КАРТ):
          // Главный критерий экономии: минимум расхода хлыстов (не перерасходовать металл).
          // При одинаковом расходе хлыстов строго побеждает решение с МЕНЬШИМ ЧИСЛОМ КАРТ/НАЛАДОК (kolVar)!
          if (ostSm !== best.ostSm) {
            bIsVarBest = ostSm < best.ostSm;
          } else if (kout !== best.kout) {
            bIsVarBest = kout < best.kout; // Меньше хлыстов побеждает!
          } else if (kolVar !== best.kolVarBest) {
            bIsVarBest = kolVar < best.kolVarBest; // При равных хлыстах меньше карт побеждает!
          } else {
            bIsVarBest = othSm < best.othSm;
          }
        } else if (settings.optimizationGoal === 'min_bars') {
          // 2. МИНИМУМ ХЛЫСТОВ: строго минимизирует количество использованных заготовок (kout)
          if (ostSm !== best.ostSm) {
            bIsVarBest = ostSm < best.ostSm;
          } else if (kout !== best.kout) {
            bIsVarBest = kout < best.kout; // Меньше заготовок побеждает!
          } else if (othSm !== best.othSm) {
            bIsVarBest = othSm < best.othSm;
          } else {
            bIsVarBest = kolVar < best.kolVarBest;
          }
        } else if (settings.optimizationGoal === 'max_reusable') {
          // 3. МАКСИМУМ ДЕЛОВОГО: строго стремится сформировать крупные остатки >= targetRemnantMin!
          if (ostSm !== best.ostSm) {
            bIsVarBest = ostSm < best.ostSm;
          } else if (curTargetRemnantsLen !== best.targetRemnantsLen) {
            bIsVarBest = curTargetRemnantsLen > best.targetRemnantsLen; // Больше целевых крупных остатков побеждает!
          } else if (curReusableLen !== best.reusableLen) {
            bIsVarBest = curReusableLen > best.reusableLen; // Больше общего делового побеждает!
          } else if (othSm !== best.othSm) {
            bIsVarBest = othSm < best.othSm; // Меньше лома побеждает!
          } else {
            bIsVarBest = kout < best.kout;
          }
        } else {
          // 4. МИНИМУМ ОТХОДОВ: строго минимизирует неиспользуемый отход/лом (othSm)
          if (ostSm !== best.ostSm) {
            bIsVarBest = ostSm < best.ostSm;
          } else if (othSm !== best.othSm) {
            bIsVarBest = othSm < best.othSm; // Меньше отхода побеждает!
          } else if (kout !== best.kout) {
            bIsVarBest = kout < best.kout;
          } else {
            bIsVarBest = kolVar < best.kolVarBest;
          }
        }

        if (bIsVarBest) {
          best = {
            kout,
            maxOst,
            ostSm,
            othSm,
            kolVarBest: kolVar,
            remnantsUsed: curRemnantsUsed,
            remnantLengthUsed: curRemnantLengthUsed,
            reusableLen: curReusableLen,
            targetRemnantsLen: curTargetRemnantsLen,
            outSmIsh: [...curOutSmIsh],
            outSm: [...curOutSm],
            outTxt: [...curOutTxt],
            outPieces: [...curOutPieces],
            remainingData: [...data],
          };
        }

        // Periodic Stage 2 progress report
        const now = performance.now();
        if (now - lastProgressReportTime > 50 || currentPass === totalPasses) {
          lastProgressReportTime = now;
          const elapsed = now - startTime;
          const pct = Math.min(85, 10 + Math.round((currentPass / totalPasses) * 75));
          const estTotal = pct > 0 ? (elapsed / pct) * 100 : 0;
          const etaSec = Math.max(0, Math.round((estTotal - elapsed) / 1000));
          const placed = rawRng.length - (best ? best.remainingData.length : data.length);
          const currentBestKIM =
            best && best.kout > 0
              ? Number(
                  (
                    ((best.outSm.reduce((a, b) => a + b, 0) * nod) /
                      (best.outSmIsh.reduce((a, b) => a + b, 0) * nod)) *
                    100
                  ).toFixed(1)
                )
              : 0;

          options?.onProgress?.({
            stage: 2,
            totalStages: 3,
            stageName: `Многопроходный подбор схем реза (проход ${currentPass}/${totalPasses})`,
            stageStepName: `Поиск комбинаций: карт ${best ? best.kolVarBest : kolVar} · КИМ ${currentBestKIM}%`,
            percent: pct,
            placedParts: Math.max(0, placed),
            totalParts: rawRng.length,
            usedBars: best ? best.kout : kout,
            totalBarsEstimate: Math.ceil(totalDemandLength / (rawSmArr[0] || 6000)),
            bestKIM: currentBestKIM,
            uniqueCardsCount: best ? best.kolVarBest : kolVar,
            elapsedMs: Math.round(elapsed),
            etaSeconds: etaSec,
          });
        }
      }
    }
  }

  // Stage 3: 2-Opt Inter-pattern Local Search and Tail Consolidation with granular progress
  if (best && best.kout > 1) {
    const totalBarsEst = Math.ceil(totalDemandLength / (rawSmArr[0] || 6000));
    const placedPartsCount = rawRng.length - (best ? best.remainingData.length : 0);
    const initialKIM =
      best.kout > 0
        ? Number(
            (
              ((best.outSm.reduce((a, b) => a + b, 0) * nod) /
                (best.outSmIsh.reduce((a, b) => a + b, 0) * nod)) *
              100
            ).toFixed(1)
          )
        : 0;

    options?.onProgress?.({
      stage: 3,
      totalStages: 3,
      stageName: 'Локальная оптимизация и сжатие схем раскроя',
      stageStepName: 'Инициализация 2-Opt переупаковки...',
      percent: 86,
      placedParts: placedPartsCount,
      totalParts: rawRng.length,
      usedBars: best.kout,
      totalBarsEstimate: totalBarsEst,
      bestKIM: initialKIM,
      uniqueCardsCount: best.kolVarBest,
      elapsedMs: Math.round(performance.now() - startTime),
    });

    best = run2OptLocalSearch(
      best,
      nod,
      dRez,
      krm,
      delOst,
      targetRemnantMin,
      settings.optimizationGoal,
      settings.searchSpeed,
      customCfg,
      (stepName, round, maxRounds, cardsCount, curKim) => {
        const pct = Math.min(92, 86 + Math.round((round / maxRounds) * 6));
        options?.onProgress?.({
          stage: 3,
          totalStages: 3,
          stageName: 'Локальная переупаковка 2-Opt',
          stageStepName: stepName,
          percent: pct,
          placedParts: placedPartsCount,
          totalParts: rawRng.length,
          usedBars: best ? best.kout : 0,
          totalBarsEstimate: totalBarsEst,
          bestKIM: curKim,
          uniqueCardsCount: cardsCount,
          elapsedMs: Math.round(performance.now() - startTime),
        });
      }
    );

    // Pattern Tail Consolidation & Recombination Optimizer (The Tail Squeezer)
    // Synthesizes additional copies of major patterns from fragmented tail bars
    // and repacks leftovers into concentrated, minimal-card layouts matching Excel
    if (best.kout > 2) {
      options?.onProgress?.({
        stage: 3,
        totalStages: 3,
        stageName: 'Консолидация хвостов и схлопывание карт',
        stageStepName: 'Анализ минорных карт и синтез базовых шаблонов...',
        percent: 93,
        placedParts: placedPartsCount,
        totalParts: rawRng.length,
        usedBars: best.kout,
        totalBarsEstimate: totalBarsEst,
        bestKIM: Number(
          (
            ((best.outSm.reduce((a, b) => a + b, 0) * nod) /
              (best.outSmIsh.reduce((a, b) => a + b, 0) * nod)) *
            100
          ).toFixed(1)
        ),
        uniqueCardsCount: best.kolVarBest,
        elapsedMs: Math.round(performance.now() - startTime),
      });

      best = consolidateTailPatterns(
        best,
        nod,
        dRez,
        krm,
        delOst,
        targetRemnantMin,
        settings.optimizationGoal,
        customCfg,
        (stepName, cardsCount, curKim) => {
          options?.onProgress?.({
            stage: 3,
            totalStages: 3,
            stageName: 'Консолидация хвостов и схлопывание карт',
            stageStepName: stepName,
            percent: 97,
            placedParts: placedPartsCount,
            totalParts: rawRng.length,
            usedBars: best ? best.kout : 0,
            totalBarsEstimate: totalBarsEst,
            bestKIM: curKim,
            uniqueCardsCount: cardsCount,
            elapsedMs: Math.round(performance.now() - startTime),
          });
        }
      );
    }
  }

  // Final Stage 3 completion report
  options?.onProgress?.({
    stage: 3,
    totalStages: 3,
    stageName: 'Формирование финальной раскладки',
    stageStepName: 'Группировка карт и расчет итогового баланса',
    percent: 99,
    placedParts: rawRng.length - (best ? best.remainingData.length : 0),
    totalParts: rawRng.length,
    usedBars: best ? best.kout : 0,
    totalBarsEstimate: Math.ceil(totalDemandLength / (rawSmArr[0] || 6000)),
    bestKIM:
      best && best.kout > 0
        ? Number(
            (
              ((best.outSm.reduce((a, b) => a + b, 0) * nod) /
                (best.outSmIsh.reduce((a, b) => a + b, 0) * nod)) *
              100
            ).toFixed(1)
          )
        : 0,
    uniqueCardsCount: best ? best.kolVarBest : 0,
    elapsedMs: Math.round(performance.now() - startTime),
  });

  if (!best || best.kout === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      overallKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: Number((performance.now() - startTime).toFixed(1)),
    };
  }

  // Sort and group solution patterns by canonical multiset key
  const getCanonicalPatternKey = (smIsh: number, pieces: number[]): string => {
    const sorted = [...pieces].sort((a, b) => b - a);
    return `${smIsh}:${sorted.join(',')}`;
  };

  interface PatternItem {
    smIsh: number;
    sm: number;
    txt: string;
    pieceLengths: number[];
    canonicalKey: string;
  }

  const patternList: PatternItem[] = [];
  for (let i = 0; i < best.kout; i++) {
    const pLengths = best.outPieces[i] || [];
    patternList.push({
      smIsh: best.outSmIsh[i],
      sm: best.outSm[i],
      txt: best.outTxt[i],
      pieceLengths: pLengths,
      canonicalKey: getCanonicalPatternKey(best.outSmIsh[i], pLengths),
    });
  }

  // Count frequencies of each canonical pattern to place largest batches first
  const patternFreq = new Map<string, number>();
  for (const item of patternList) {
    patternFreq.set(item.canonicalKey, (patternFreq.get(item.canonicalKey) || 0) + 1);
  }

  patternList.sort((a, b) => {
    // 1. Group by bar size (descending)
    if (b.smIsh !== a.smIsh) return b.smIsh - a.smIsh;
    // 2. Group by pattern multiplicity (descending: 76 bars, then 27 bars, then 1 bar)
    const freqA = patternFreq.get(a.canonicalKey) || 0;
    const freqB = patternFreq.get(b.canonicalKey) || 0;
    if (freqB !== freqA) return freqB - freqA;
    // 3. Group by canonical key to keep identical patterns strictly contiguous
    if (a.canonicalKey !== b.canonicalKey) return a.canonicalKey.localeCompare(b.canonicalKey);
    // 4. By spent
    return b.sm - a.sm;
  });

  // Group patterns if bGroupe is true
  interface GroupedRow {
    barSize: number;
    spent: number;
    count: number;
    pieceLengths: number[];
  }

  const groupedRows: GroupedRow[] = [];
  let curKey = '';
  let curK = 0;

  for (let i = 0; i < patternList.length; i++) {
    const item = patternList[i];
    const barSize = item.smIsh * nod + krm;
    const spent = item.sm * nod + krm;

    if (item.canonicalKey !== curKey || !bGroupe) {
      curK = 1;
      groupedRows.push({
        barSize,
        spent,
        count: curK,
        pieceLengths: [...item.pieceLengths],
      });
      curKey = item.canonicalKey;
    } else {
      curK++;
      groupedRows[groupedRows.length - 1].count = curK;
    }
  }

  // Feature 1: Контроль заполнения заготовок при раскрое «В 2 профиля» (и длинномерных заготовок)
  // Проверяем ВСЕ карты раскроя, где заполнение фактическими деталями
  // ниже установленного порога fillControlThreshold (например, 32% на 12-метровом хлысте при пороге 70%).
  if (settings.fillControlEnabled && groupedRows.length > 0) {
    const threshold = settings.fillControlThreshold ?? 50;
    const piecesToReNest: number[] = [];
    const preservedRows: GroupedRow[] = [];

    for (let rIdx = 0; rIdx < groupedRows.length; rIdx++) {
      const row = groupedRows[rIdx];
      const partsSum = row.pieceLengths.reduce((a, b) => a + b, 0);
      const purePartsKIM = row.barSize > 0 ? (partsSum / row.barSize) * 100 : 0;

      // Условие контроля заполнения:
      // Любая карта, у которой полезное заполнение деталями (без учета остатка) ниже порога threshold,
      // либо длинномерная заготовка (>= 5000 мм), на которой остаток превышает длину самих деталей.
      const isUnderfilled =
        row.pieceLengths.length > 0 &&
        (purePartsKIM < threshold || (row.barSize >= 5000 && purePartsKIM < 70));

      if (isUnderfilled) {
        // Извлекаем все детали из недозаполненной карты раскроя для переупаковки
        for (let c = 0; c < row.count; c++) {
          piecesToReNest.push(...row.pieceLengths);
        }
      } else {
        preservedRows.push(row);
      }
    }

    if (piecesToReNest.length > 0) {
      // Преобразуем детали в DemandItem
      const pieceCounts = new Map<number, number>();
      piecesToReNest.forEach((len) => {
        pieceCounts.set(len, (pieceCounts.get(len) || 0) + 1);
      });

      const reCutDemands: DemandItem[] = [];
      let dIdx = 1;
      pieceCounts.forEach((qty, len) => {
        reCutDemands.push({
          id: `fill_renest_${dIdx++}`,
          orderIndex: dIdx,
          length: len,
          quantity: qty,
        });
      });

      // Рассчитываем оставшийся неиспользованный складской запас
      const consumedCountByLength = new Map<number, number>();
      preservedRows.forEach((r) => {
        consumedCountByLength.set(
          r.barSize,
          (consumedCountByLength.get(r.barSize) || 0) + r.count
        );
      });

      const reCutStockInput: StockItem[] = [];
      stockInput.forEach((s) => {
        if (s.isActive === false) return;
        const isStandardUnlimited =
          s.isStandardUnlimited ||
          ((s.length === 6000 || s.length === 12000) && (!s.quantity || s.quantity <= 0));
        if (isStandardUnlimited) {
          reCutStockInput.push({ ...s });
        } else {
          const used = consumedCountByLength.get(s.length) || 0;
          const remainingQty = Math.max(0, (s.quantity || 0) - used);
          if (used > 0) {
            consumedCountByLength.set(s.length, Math.max(0, used - (s.quantity || 0)));
          }
          if (remainingQty > 0) {
            reCutStockInput.push({ ...s, quantity: remainingQty });
          }
        }
      });

      // Перераскрой деталей в 1 профиль (без спаривания) со стратегией 'min_waste'
      const reCutSettings: AppSettings = {
        ...settings,
        dualProfileCut: false,
        optimizationGoal: 'min_waste',
        fillControlEnabled: false,
      };

      const reCutSolution = solveLinearCutting(reCutStockInput, reCutDemands, reCutSettings);

      if (reCutSolution.rows.length > 0) {
        groupedRows.length = 0;
        groupedRows.push(...preservedRows);

        for (const sRow of reCutSolution.rows) {
          const pieceLengths: number[] = [];
          sRow.pieces.forEach((p) => {
            for (let i = 0; i < p.count; i++) {
              pieceLengths.push(p.length);
            }
          });

          groupedRows.push({
            barSize: sRow.barSize,
            spent: sRow.spent,
            count: sRow.barsCount,
            pieceLengths,
          });
        }

        // Сортировка карт: по убыванию длины заготовки, затем по убыванию заполнения
        groupedRows.sort((a, b) => {
          if (b.barSize !== a.barSize) return b.barSize - a.barSize;
          return b.spent - a.spent;
        });
      }
    }
  }

  // Build final SolutionRow items and formulas
  let totalStockLength = 0;
  let totalSpentLength = 0;
  let totalBarsUsed = 0;
  let totalWasteLength = 0;
  let totalReusableLength = 0;

  const rows: SolutionRow[] = groupedRows.map((gr, idx) => {
    // 1. Group pieces by length
    const pieceCountMap = new Map<number, number>();
    gr.pieceLengths.forEach((len) => {
      pieceCountMap.set(len, (pieceCountMap.get(len) || 0) + 1);
    });
    const sortedUniquePieces = Array.from(pieceCountMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([len, count]) => ({ length: len, count }));

    // 2. Build piece string in < >: e.g. <800х7 + 150х2>
    const piecesStr = sortedUniquePieces.map((p) => `${p.length}х${p.count}`).join(' + ');

    // 3. Trim in [ ]: e.g. [10] or []
    const trimStr = krm > 0 ? `[${krm}]` : '[]';
    const trimCuts = krm > 0 ? 1 : 0;
    const totalPiecesCount = gr.pieceLengths.length;
    const totalPartsLength = gr.pieceLengths.reduce((a, b) => a + b, 0);

    // 4. Physical cuts count: trim cut + internal cuts between pieces + cut separating piece from remainder
    // If remainder > 0: trimCuts + (totalPiecesCount - 1) + 1 = trimCuts + totalPiecesCount
    // If remainder === 0: trimCuts + Math.max(0, totalPiecesCount - 1)
    const rawRemainderCheck = gr.barSize - totalPartsLength - krm;
    const cutsCount =
      totalPiecesCount > 0
        ? trimCuts + Math.max(0, totalPiecesCount - 1) + (rawRemainderCheck > dRez ? 1 : 0)
        : trimCuts;
    const kerfLoss = dRez * cutsCount;

    // 5. Remainder calculation (exact millimeter balance: barSize = trim + parts + kerf + remainder)
    const totalKerfAndParts = totalPartsLength + krm + kerfLoss;
    const remainder = Math.max(0, gr.barSize - totalKerfAndParts);

    const isReusable = delOst > 0 && remainder >= delOst;
    const reusableRemnant = isReusable ? remainder : 0;
    const scrapRemnant = isReusable ? 0 : remainder;

    // Waste for the bar: trim + kerf cuts + scrap (торцовка + резы + лом)
    const barWaste = krm + kerfLoss + scrapRemnant;

    // 6. Format reusable remnant and waste
    const reusableStr = isReusable ? `!<${reusableRemnant}>` : '!<>';
    const wasteStr = scrapRemnant > 0 ? `(${dRez}х${cutsCount}+${scrapRemnant})` : `(${dRez}х${cutsCount})`;

    // 7. Full formula matching user specification:
    // 20х{[10] + <800х7 + 150х2> + !<> + (3х10+60)}=6000
    const formulaStr = `${gr.count}х{${trimStr} + <${piecesStr}> + ${reusableStr} + ${wasteStr}}=${gr.barSize}`;

    let wasteLabel = 'О';
    if (isReusable) {
      wasteLabel = reusableRemnant >= 100 ? 'Остат' : 'Ос';
    }

    const pieces: SolutionPiece[] = sortedUniquePieces.map((p, sIdx) => ({
      id: `p_${idx}_${sIdx}`,
      length: p.length,
      count: p.count,
      color: demandColorMap.get(p.length) || getColorForLength(p.length, sIdx),
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
      const color = demandColorMap.get(p.length) || getColorForLength(p.length, sIdx);
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

    if (remainder > 0) {
      layoutItems.push({
        id: `waste_${idx}`,
        length: remainder,
        color: isReusable ? '#FCD34D' : '#E2E8F0',
        isWaste: true,
        wasteType: isReusable ? 'reusable' : 'scrap',
        mark: isReusable ? `${reusableRemnant} (Ост)` : `${scrapRemnant}`,
      });
    }

    totalStockLength += gr.barSize * gr.count;
    totalSpentLength += totalPartsLength * gr.count;
    totalBarsUsed += gr.count;
    totalReusableLength += reusableRemnant * gr.count;
    totalWasteLength += barWaste * gr.count;

    const efficiency = Number(((((totalPartsLength + reusableRemnant) / gr.barSize)) * 100).toFixed(2));

    return {
      id: `row_${idx + 1}`,
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
      wasteLabel,
      efficiency,
      layoutItems,
    };
  });

  // Calculate Overall KIM:
  // (Total Stock - Total Non-reusable Waste) / Total Stock * 100%
  const overallKIM =
    totalStockLength > 0
      ? Number((((totalStockLength - totalWasteLength) / totalStockLength) * 100).toFixed(2))
      : 0;

  // Calculate Net (Instant) KIM:
  // Total Pieces Spent / Total Stock * 100% (without reusable remnant)
  const netKIM =
    totalStockLength > 0
      ? Number(((totalSpentLength / totalStockLength) * 100).toFixed(2))
      : 0;

  // Track warehouse remaining stock (Блок «Осталось»)
  // Requirement 9: Remove rows with quantity <= 0
  const usedCountByStockLength = new Map<number, number>();
  groupedRows.forEach((r) => {
    usedCountByStockLength.set(
      r.barSize,
      (usedCountByStockLength.get(r.barSize) || 0) + r.count
    );
  });

  const remainingWarehouseStock: RemnantItem[] = [];

  stockInput.forEach((s) => {
    if (s.isActive === false) return;
    const isAuto =
      s.isStandardUnlimited ||
      ((s.length === 6000 || s.length === 12000) && s.quantity <= 0);
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

  // Add reusable remnants from cut bars back to warehouse inventory (delOst > 0)
  if (delOst > 0) {
    rows.forEach((r) => {
      if (r.isReusable && r.reusableRemnant >= delOst && r.reusableRemnant > 0) {
        remainingWarehouseStock.push({
          length: r.reusableRemnant,
          quantity: r.barsCount,
          mark: 'Деловой остаток',
        });
      }
    });
  }

  // Unplaced demand (Блок «Не сделано»)
  const unplacedDemand: UnplacedItem[] = [];
  if (best.remainingData && best.remainingData.length > 0) {
    const unplacedCounts = new Map<number, number>();
    best.remainingData.forEach((scaled) => {
      const len = scaled * nod - dRez;
      unplacedCounts.set(len, (unplacedCounts.get(len) || 0) + 1);
    });
    unplacedCounts.forEach((qty, len) => {
      unplacedDemand.push({
        length: len,
        quantity: b2prof ? qty * 2 : qty,
      });
    });
  }

  const endTime = performance.now();

  return {
    totalStockLength,
    totalSpentLength,
    totalBarsUsed,
    totalWasteLength,
    totalReusableLength,
    overallKIM,
    netKIM,
    rows,
    remainingWarehouseStock,
    unplacedDemand,
    calculationTimeMs: Number((endTime - startTime).toFixed(1)),
  };
}

/**
 * Fast recalculation when display/remnant thresholds change without needing full re-solve.
 * Updates remnant classification (isReusable, wasteLabel), KIM, and warehouse stock instantly.
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

    const efficiency = Number(((((row.spent + reusableRemnant) / row.barSize)) * 100).toFixed(2));

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
      ? Number((((existingSolution.totalStockLength - totalWasteLength) / existingSolution.totalStockLength) * 100).toFixed(2))
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
      ((s.length === 6000 || s.length === 12000) && s.quantity <= 0);
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
      ? Number(((existingSolution.totalSpentLength / existingSolution.totalStockLength) * 100).toFixed(2))
      : 0;

  return {
    ...existingSolution,
    rows: updatedRows,
    totalReusableLength,
    totalWasteLength,
    overallKIM,
    netKIM,
    remainingWarehouseStock,
  };
}

// Backward-compatibility wrapper for legacy reports
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
    stockName: `Хлыст ${r.barSize} мм`,
    stockLength: r.barSize,
    trimStart: settings.edgeTrim,
    trimEnd: 0,
    bladeWidth: settings.bladeWidth,
    cuts: r.pieces.flatMap((p, pIdx) =>
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
    wasteLength: r.waste,
    isReusableWaste: r.isReusable,
    reusableLength: r.isReusable ? r.waste : 0,
    scrapLength: !r.isReusable ? r.waste : 0,
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
    algorithmName: 'Excel VBA Exact Port (MyRaskroy.bas: LongSumEl & SortLongArray)',
  };
}

/**
 * Naive Sequential Cutting (Порезка подряд от самых крупных к мелким без оптимизации)
 * Simulates manual saw operator cutting pieces sequentially in order of descending length with minimal combining.
 * Serves as «Расчет #0» baseline to evaluate economic gain and material savings from optimization.
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
  const b2prof = settings.dualProfileCut === true;
  const bGroupe = settings.groupSolutions !== false;

  // 1. Separate demands into paired pieces and odd single pieces if b2prof
  const pairQueue: number[] = [];
  const singleQueue: number[] = [];

  for (const d of demandInput) {
    if (d.length <= 0 || d.quantity <= 0) continue;
    const pairs = b2prof ? Math.floor(d.quantity / 2) : d.quantity;
    const odd = b2prof ? d.quantity % 2 : 0;
    for (let j = 0; j < pairs; j++) {
      pairQueue.push(d.length);
    }
    if (odd > 0) {
      singleQueue.push(d.length);
    }
  }

  if (pairQueue.length === 0 && singleQueue.length === 0) {
    return {
      totalStockLength: 0,
      totalSpentLength: 0,
      totalBarsUsed: 0,
      totalWasteLength: 0,
      totalReusableLength: 0,
      overallKIM: 0,
      netKIM: 0,
      rows: [],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    };
  }

  // Sort queues strictly descending by length: largest parts first
  pairQueue.sort((a, b) => b - a);
  singleQueue.sort((a, b) => b - a);

  // 2. Prepare available stock sizes (descending)
  const availableStandardSizes = stockInput
    .filter(
      (st) =>
        st.isActive !== false &&
        (st.isStandard || st.isStandardUnlimited || st.length === 6000 || st.length === 12000)
    )
    .map((st) => st.length)
    .sort((a, b) => b - a);

  let defaultStandardSize = forcedStandardSize || availableStandardSizes[0] || 12000;
  if (forcedStandardSize === 6000) {
    defaultStandardSize = 6000;
  } else if (forcedStandardSize === 12000) {
    defaultStandardSize = 12000;
  }

  // Remnant bars pool from warehouse
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
      remaining: b2prof ? Math.floor(st.quantity / 2) : st.quantity,
    }))
    .sort((a, b) => b.length - a.length);

  interface RawBarCut {
    barSize: number;
    barCount: number;
    spent: number;
    pieceLengths: number[];
    spaceLeft: number;
  }

  const rawBarCuts: RawBarCut[] = [];

  const packQueue = (queue: number[], barCount: number) => {
    for (let q = 0; q < queue.length; q++) {
      const pLen = queue[q];

      // Step A: "использовать ранее полученные деловые отходы в расчете для раскроя в случае если деталь помещается на какой-то из них - расчет сразу перерабатывает полученные деловые отходы, полностью или частично"
      let bestIdx = -1;
      let minSlack = Infinity;

      for (let b = 0; b < rawBarCuts.length; b++) {
        if (rawBarCuts[b].barCount !== barCount) continue;
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

      // Step B: Check warehouse remnants pool
      let chosenRemnant: RemnantPoolItem | null = null;
      for (const rem of remnantPool) {
        if (rem.remaining > 0 && rem.length - krm >= pLen) {
          chosenRemnant = rem;
          break;
        }
      }

      if (chosenRemnant) {
        chosenRemnant.remaining--;
        const usableLength = chosenRemnant.length - krm;
        rawBarCuts.push({
          barSize: chosenRemnant.length,
          barCount,
          spent: pLen,
          pieceLengths: [pLen],
          spaceLeft: usableLength - pLen,
        });
        continue;
      }

      // Step C: Open a standard bar
      const barSizeToOpen = defaultStandardSize;
      const usableLength = barSizeToOpen - krm;
      rawBarCuts.push({
        barSize: barSizeToOpen,
        barCount,
        spent: pLen,
        pieceLengths: [pLen],
        spaceLeft: usableLength - pLen,
      });
    }
  };

  // Pack paired pieces first
  packQueue(pairQueue, b2prof ? 2 : 1);

  // If there are odd single pieces (b2prof), pack them (they can also reuse single bars or open 1-bar cuts)
  if (singleQueue.length > 0) {
    packQueue(singleQueue, 1);
  }

  // Adaptive downsizing: if parts fit in shorter active standard size (e.g. 6000 mm instead of 12000 mm)
  // Only apply when forcedStandardSize is not strictly set (so Эталон-12 stays 12м, and Эталон-6 stays 6м)
  if (!forcedStandardSize) {
    rawBarCuts.forEach((cut) => {
      cut.spent = cut.pieceLengths.reduce((a, b) => a + b, 0);
      if (cut.barSize >= 11000 && availableStandardSizes.includes(6000)) {
        const cutsCount = cut.pieceLengths.length > 0 ? (krm > 0 ? 1 : 0) + cut.pieceLengths.length - 1 : 0;
        const requiredMm = cut.spent + krm + cutsCount * dRez;
        if (requiredMm <= 6000) {
          cut.barSize = 6000;
          cut.spaceLeft = 6000 - requiredMm;
        }
      }
    });
  }

  // 3. Group identical bars
  interface GroupedRow {
    barSize: number;
    spent: number;
    count: number;
    pieceLengths: number[];
  }

  const groupedRows: GroupedRow[] = [];
  rawBarCuts.forEach((cut) => {
    cut.pieceLengths.sort((a, b) => b - a);
    const signature = `${cut.barSize}_${cut.pieceLengths.join(',')}`;

    const existing = bGroupe
      ? groupedRows.find((r) => `${r.barSize}_${r.pieceLengths.join(',')}` === signature)
      : null;

    if (existing) {
      existing.count += cut.barCount;
    } else {
      groupedRows.push({
        barSize: cut.barSize,
        spent: cut.spent,
        count: cut.barCount,
        pieceLengths: [...cut.pieceLengths],
      });
    }
  });

  // Sort grouped rows descending by barSize, then count descending
  groupedRows.sort((a, b) => {
    if (b.barSize !== a.barSize) return b.barSize - a.barSize;
    return b.count - a.count;
  });

  // 4. Build solution rows
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
    const wasteStr = scrapRemnant > 0 ? `(${dRez}х${cutsCount}+${scrapRemnant})` : `(${dRez}х${cutsCount})`;
    const formulaStr = `${gr.count}х{${trimStr} + <${piecesStr}> + ${reusableStr} + ${wasteStr}}=${gr.barSize}`;

    totalStockLength += gr.barSize * gr.count;
    totalSpentLength += totalPartsLength * gr.count;
    totalBarsUsed += gr.count;
    totalReusableLength += reusableRemnant * gr.count;
    totalWasteLength += barWaste * gr.count;

    const efficiency = Number(((((totalPartsLength + reusableRemnant) / gr.barSize)) * 100).toFixed(2));

    const pieces: SolutionPiece[] = sortedUniquePieces.map((p, sIdx) => ({
      id: `p_naive_${idx}_${sIdx}`,
      length: p.length,
      count: p.count,
      color: demandColorMap.get(p.length) || getColorForLength(p.length, sIdx),
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
      const color = demandColorMap.get(p.length) || getColorForLength(p.length, sIdx);
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

  return {
    totalStockLength,
    totalSpentLength,
    totalBarsUsed,
    totalWasteLength,
    totalReusableLength,
    overallKIM,
    netKIM,
    rows,
    remainingWarehouseStock: [],
    unplacedDemand: [],
    calculationTimeMs: Number((performance.now() - startTime).toFixed(1)),
  };
}

export interface PrimaryStandardSizeInfo {
  primarySize: number; // 12000 or 6000
  label: string; // '12 м' | '6 м' | '12 / 6 м'
  counts12: number;
  counts6: number;
  totalBars: number;
}

/**
 * Determines the dominant standard stock size used in a cutting solution.
 */
export function getPrimaryStandardSize(solution: FullOptimizationSolution): PrimaryStandardSizeInfo {
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
    return { primarySize: 12000, label: counts6 > 0 ? '12 / 6 м' : '12 м', counts12, counts6, totalBars };
  }
  if (counts6 > 0) {
    return { primarySize: 6000, label: counts12 > 0 ? '6 / 12 м' : '6 м', counts12, counts6, totalBars };
  }
  return { primarySize: 12000, label: '12 м', counts12, counts6, totalBars };
}
