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
} from '../types/cutting';

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

const DYNAMIC_COLORS = [
  '#38BDF8',
  '#E879F9',
  '#FACC15',
  '#4ADE80',
  '#F87171',
  '#6366F1',
  '#FB923C',
  '#2DD4BF',
  '#A78BFA',
  '#F472B6',
  '#94A3B8',
];

export function getColorForLength(len: number, index = 0): string {
  if (PALETTE[len]) return PALETTE[len];
  return DYNAMIC_COLORS[index % DYNAMIC_COLORS.length];
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
    // Descending
    result.sort((a, b) => b - a);
  } else if (sortMode === 2) {
    // Ascending
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
  } else if (sortMode > 12) {
    // Pseudo-random shuffle (Fisher-Yates)
    for (let i = k - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
 * Full Port of Sub Raskroy() from MyRaskroy.bas
 */
export function solveLinearCutting(
  stockInput: StockItem[],
  demandInput: DemandItem[],
  settings: AppSettings
): FullOptimizationSolution {
  const startTime = performance.now();

  let dRez = Math.max(0, settings.bladeWidth || 0);
  const krm = Math.max(0, settings.edgeTrim || 0);
  const delOst = Math.max(0, settings.reusableRemnantMin || 0);
  let b2prof = settings.dualProfileCut === true;
  const bGroupe = settings.groupSolutions !== false;

  // Dual profile check (parity check from VBA)
  if (b2prof) {
    for (const d of demandInput) {
      if (d.length > 0 && d.quantity % 2 !== 0) {
        b2prof = false;
        break;
      }
    }
  }

  // Expand demand items: rng array in VBA
  // rng(kRng) = s + dRez
  const rawRng: number[] = [];
  let ostSmTotal = 0;

  for (const d of demandInput) {
    const s = d.length;
    const qty = b2prof ? Math.floor(d.quantity / 2) : d.quantity;
    if (s > 0 && qty > 0) {
      for (let j = 0; j < qty; j++) {
        rawRng.push(s + dRez);
        ostSmTotal += s;
      }
    }
  }

  // Expand stock bars: smArr array in VBA
  // Standard lengths (6000, 12000) or items with isStandardUnlimited can have auto quantity
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

  for (const st of stockInput) {
    if (st.isActive === false) continue;
    const s = st.length - krm;
    if (s <= 0) continue;

    const isStandardAuto =
      (st.length === 6000 || st.length === 12000 || st.isStandardUnlimited) &&
      (st.quantity <= 0 || !st.quantity);
    const neededEstimate = Math.ceil(totalDemandLength / s) + 20;
    const effQty = isStandardAuto ? Math.max(150, neededEstimate) : st.quantity;
    const qty = b2prof ? Math.floor(effQty / 2) : effQty;
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

  // Determine search iterations based on speed setting
  const speed = settings.searchSpeed;
  const maxSortZ = stockInput.length > 1 ? (speed === 'deep' ? 3 : speed === 'standard' ? 2 : 1) : 0;
  const maxSort = speed === 'deep' ? 4 : speed === 'standard' ? 3 : 2;
  const maxVar = speed === 'deep' ? 4 : speed === 'standard' ? 3 : 2;

  interface BestSolutionState {
    kout: number;
    maxOst: number;
    ostSm: number;
    othSm: number;
    kolVarBest: number;
    remnantsUsed: number;
    remnantLengthUsed: number;
    outSmIsh: number[];
    outSm: number[];
    outTxt: string[];
    outPieces: number[][];
    remainingData: number[];
  }

  let best: BestSolutionState | null = null;
  const varOptim = settings.optimizationGoal === 'variants' ? 2 : 1;

  // Fast, responsive search loops matching VBA heuristics
  for (let sortZ = 0; sortZ <= maxSortZ; sortZ++) {
    let smArr: number[];
    if (isPrioritizeRemnants) {
      // In "prioritize_remnants" strategy:
      // Remnants MUST ALWAYS BE AT THE FRONT, before standard bars!
      // We explore different orderings of remnants across sortZ:
      // sortZ === 0: descending remnants (longest first: e.g. 2630 then 580)
      // sortZ === 1: ascending remnants (shortest first: test if small remnants fit small pieces)
      // sortZ === 2: alternating
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
        let maxOst = 0;
        let kout = 0;
        let data = [...rng];
        let iSm = 0;
        let othSm = 0;
        let ostSm = 0;
        let curRemnantsUsed = 0;
        let curRemnantLengthUsed = 0;

        const curOutSmIsh: number[] = [];
        const curOutSm: number[] = [];
        const curOutTxt: string[] = [];
        const curOutPieces: number[][] = [];

        while (iSm < smArr.length && data.length > 0) {
          const sm = smArr[iSm];
          iSm++;

          let arrEl: number[] | null = null;
          if (v === 0) {
            arrEl = greedyAlgo(data, sm);
          } else {
            const sumData = data.reduce((a, b) => a + b, 0);
            let dm = 0;
            if (v === 1) {
              const ceilDiv = Math.ceil(sumData / sm);
              dm = ceilDiv > 0 ? sm - Math.floor(sumData / ceilDiv) : 0;
            } else if (v === 2) {
              const ceilDiv = Math.ceil(sumData / sm);
              dm = ceilDiv > 0 ? Math.floor((sm - Math.floor(sumData / ceilDiv)) / 2) : 0;
            } else {
              dm = Math.floor((sm * (v - 3)) / 200);
            }
            arrEl = longSumEl(data, sm, dm);
          }

          if (arrEl && arrEl.length > 0) {
            const sTemp = arrEl.reduce((a, b) => a + b, 0);
            const barSpentMm = sTemp * nod + krm;
            const barTotalMm = sm * nod + krm;
            const isRemnantBar = barTotalMm < 6000;
            const barKIM = (barSpentMm / barTotalMm) * 100;

            // If remnant does not achieve target KIM threshold, preserve the remnant for future orders
            if (isPrioritizeRemnants && isRemnantBar && barKIM < targetRemnantKIM) {
              continue;
            }

            arrEl = sortLongArray(arrEl, 1);
            const kEl = arrEl.length;
            const newArr = [...data];

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

              // Remove taken element
              const removeIdx = newArr.indexOf(el);
              if (removeIdx >= 0) newArr[removeIdx] = 0;
            }

            const barWaste = sm - s;
            othSm += barWaste;
            if (maxOst < barWaste) maxOst = barWaste;

            kout++;
            curOutSmIsh.push(sm);
            curOutSm.push(s);
            curOutTxt.push(txt);
            curOutPieces.push(patternPieceLengths);

            if (isRemnantBar) {
              curRemnantsUsed++;
              curRemnantLengthUsed += barTotalMm;
            }

            // Remaining elements in data
            data = newArr.filter((x) => x > 0);
            ostSm = data.reduce((acc, x) => acc + x, 0);
          }
        }

        // Count unique variants via Set
        const kolVar = new Set(curOutTxt).size;

        // Evaluate if this solution is better according to bIsVarBest in VBA
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
        } else if (varOptim === 1) {
          bIsVarBest =
            best.ostSm > ostSm ||
            (best.ostSm === ostSm && best.othSm > othSm) ||
            (best.ostSm === ostSm && best.othSm === othSm && best.maxOst < maxOst);
        } else {
          bIsVarBest =
            best.ostSm > ostSm ||
            (best.ostSm === ostSm && best.othSm > othSm) ||
            (best.ostSm === ostSm && best.othSm === othSm && kolVar < best.kolVarBest);
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
            outSmIsh: [...curOutSmIsh],
            outSm: [...curOutSm],
            outTxt: [...curOutTxt],
            outPieces: [...curOutPieces],
            remainingData: [...data],
          };
        }
      }
    }
  }

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

  // Sort solution patterns (matching VBA sort: outSmIsh, outSm, outTxt)
  const patternList: { smIsh: number; sm: number; txt: string; pieceLengths: number[] }[] = [];
  for (let i = 0; i < best.kout; i++) {
    patternList.push({
      smIsh: best.outSmIsh[i],
      sm: best.outSm[i],
      txt: best.outTxt[i],
      pieceLengths: best.outPieces[i] || [],
    });
  }

  patternList.sort((a, b) => {
    if (b.smIsh !== a.smIsh) return b.smIsh - a.smIsh;
    if (b.sm !== a.sm) return b.sm - a.sm;
    return a.txt.localeCompare(b.txt);
  });

  // Group patterns if bGroupe is true
  interface GroupedRow {
    barSize: number;
    spent: number;
    count: number;
    pieceLengths: number[];
  }

  const groupedRows: GroupedRow[] = [];
  let curTxt = '';
  let curSmIsh = 0;
  let curK = 0;

  for (let i = 0; i < patternList.length; i++) {
    const item = patternList[i];
    const barSize = item.smIsh * nod + krm;
    const spent = item.sm * nod + krm;

    if (item.txt !== curTxt || item.smIsh !== curSmIsh || !bGroupe) {
      curK = 1;
      groupedRows.push({
        barSize,
        spent,
        count: curK * (b2prof ? 2 : 1),
        pieceLengths: [...item.pieceLengths],
      });
      curTxt = item.txt;
      curSmIsh = item.smIsh;
    } else {
      curK++;
      groupedRows[groupedRows.length - 1].count = curK * (b2prof ? 2 : 1);
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
      color: getColorForLength(p.length, sIdx),
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
      const color = getColorForLength(p.length, sIdx);
      for (let c = 0; c < p.count; c++) {
        layoutItems.push({
          id: `lay_${idx}_${sIdx}_${c}`,
          length: p.length,
          color,
          mark: `${p.length}`,
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

  return {
    ...existingSolution,
    rows: updatedRows,
    totalReusableLength,
    totalWasteLength,
    overallKIM,
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
