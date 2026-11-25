/**
 * Контрольный набор (регрессии движка раскроя).
 * Запуск в браузере: `?bench=1` (полный) или `?bench=quick` (быстрый).
 * Каждый кейс: фиксированные входные данные + пороги. FAIL = регрессия.
 */
import type { AppSettings, DemandItem, FullOptimizationSolution, StockItem } from '../../types/cutting';
import {
  computeCuttingIndexFromSolution,
  computeCuttingIndexScale,
  computeMaxReusableRemnantFromSolution,
  resolveBatchSize,
  runBalanceSuite,
  solveLinearCutting,
} from '../cuttingEngine';

import {
  MinimizeBalanceStrategy,
  MinimizeMaterialStrategy,
  MinimizeSetupsStrategy,
} from './strategies';
import type { CutContext, CutMetrics } from './types';

interface BenchCase {
  name: string;
  stock: StockItem[];
  demand: { length: number; quantity: number }[];
  settings: AppSettings;
  maxBars: number; // потолок числа хлыстов (эталон)
  maxCards?: number; // потолок числа карт
  exactTailSingleCards?: number; // ожидаемое число одиночных хвостовых карт
  maxMs: number; // потолок времени (WARN для больших кейсов)
  warnOnlyOnTime?: boolean;
  heavy?: boolean;
}

const std = (len = 6000): StockItem => ({
  id: `s_${len}`,
  orderIndex: 0,
  length: len,
  quantity: 0,
  isStandard: true,
  isStandardUnlimited: true,
  isActive: true,
});

const baseSettings: AppSettings = {
  material: 'T',
  orderNumber: '1',
  bladeWidth: 3,
  edgeTrim: 0,
  reusableRemnantMin: 250,
  targetRemnantMinLength: 1500,
  cutAngle45: false,
  dualProfileCut: true,
  prioritizeRemnants: false,
  groupSolutions: true,
  showGraphics: false,
  searchSpeed: 'standard',
  optimizationGoal: 'min_bars',
  shapeRemnantsInSearch: false,
};

const mk = (a: [number, number][]) => a.map(([length, quantity]) => ({ length, quantity }));

const A = mk([
  [250, 1048],
  [1350, 262],
]);
const A10 = mk([
  [250, 10480],
  [1350, 2620],
]);
const BIG = mk([
  [5230, 31],
  [150, 400],
  [320, 30],
  [280, 50],
  [800, 150],
  [810, 150],
  [564, 1200],
  [312, 112],
  [85, 1224],
  [5300, 1120],
  [788, 15],
  [99, 12],
  [780, 130],
  [1144, 780],
  [3288, 600],
  [2500, 600],
  [1320, 600],
  [4212, 35],
  [4220, 140],
  [879, 4500],
  [1111, 4500],
  [400, 100],
]);

export const CASES: BenchCase[] = [
  {
    name: 'A: мин.материала, глубокий, парный',
    stock: [std()],
    demand: A,
    settings: { ...baseSettings, optimizationGoal: 'min_bars', searchSpeed: 'deep' },
    maxBars: 104,
    maxCards: 3,
    maxMs: 30000,
  },
  {
    name: 'A: мин.материала, глубокий, без пар',
    stock: [std()],
    demand: A,
    settings: { ...baseSettings, dualProfileCut: false, optimizationGoal: 'min_bars', searchSpeed: 'deep' },
    maxBars: 104,
    maxMs: 30000,
  },
  {
    name: 'A: нечётные количества (пакетный рез + одиночный остаток)',
    stock: [std()],
    demand: mk([
      [250, 1049],
      [1350, 263],
    ]),
    settings: { ...baseSettings, optimizationGoal: 'min_bars', searchSpeed: 'deep' },
    maxBars: 105,
    exactTailSingleCards: 1,
    maxMs: 15000,
  },
  {
    name: 'A×10: мин.материала, глубокий',
    stock: [std()],
    demand: A10,
    settings: { ...baseSettings, optimizationGoal: 'min_bars', searchSpeed: 'deep' },
    maxBars: 1038,
    maxMs: 60000,
    warnOnlyOnTime: true,
    heavy: true,
  },
  {
    name: 'A×10: мин.наладок, глубокий, одиночный',
    stock: [std()],
    demand: A10,
    settings: { ...baseSettings, dualProfileCut: false, optimizationGoal: 'variants', searchSpeed: 'deep' },
    maxBars: 1048,
    maxCards: 2,
    maxMs: 60000,
    warnOnlyOnTime: true,
    heavy: true,
  },
  {
    name: 'БОЛЬШОЙ: мин.материала, стандарт',
    stock: [std()],
    demand: BIG,
    settings: { ...baseSettings, optimizationGoal: 'min_bars', searchSpeed: 'standard' },
    maxBars: 3759,
    maxCards: 33,
    maxMs: 45000,
    warnOnlyOnTime: true,
    heavy: true,
  },
  {
    name: 'БОЛЬШОЙ: мин.наладок, стандарт',
    stock: [std()],
    demand: BIG,
    settings: { ...baseSettings, optimizationGoal: 'variants', searchSpeed: 'standard' },
    maxBars: 3760,
    maxCards: 23,
    maxMs: 20000,
    warnOnlyOnTime: true,
    heavy: true,
  },
  {
    name: 'БОЛЬШОЙ: мин.наладок + приоритет остатков (без остатков на складе)',
    stock: [std()],
    demand: BIG,
    settings: { ...baseSettings, optimizationGoal: 'variants', searchSpeed: 'standard', prioritizeRemnants: true },
    maxBars: 3760,
    maxCards: 23,
    maxMs: 20000,
    warnOnlyOnTime: true,
    heavy: true,
  },
];

interface BalanceCase {
  name: string;
  stock: StockItem[];
  demand: { length: number; quantity: number }[];
  settings: AppSettings;
  expectedFirstBars: number;
  expectedExactVariants?: number;
  minVariants?: number;
  maxFirstCards?: number;
  maxLastCards?: number;
  compareSetupsBaseline?: boolean;
  heavy?: boolean;
}

export const BALANCE_CASES: BalanceCase[] = [
  {
    name: 'A: баланс, глубокий, парный',
    stock: [std()],
    demand: A,
    settings: { ...baseSettings, optimizationGoal: 'balance', searchSpeed: 'deep' },
    expectedFirstBars: 104,
    maxFirstCards: 4,
    expectedExactVariants: 1,
  },
  {
    name: 'A: баланс, глубокий, без пар',
    stock: [std()],
    demand: A,
    settings: { ...baseSettings, dualProfileCut: false, optimizationGoal: 'balance', searchSpeed: 'deep' },
    expectedFirstBars: 104,
    maxFirstCards: 4,
    expectedExactVariants: 1,
  },
  {
    name: 'A×10: баланс, глубокий',
    stock: [std()],
    demand: A10,
    settings: { ...baseSettings, optimizationGoal: 'balance', searchSpeed: 'deep' },
    expectedFirstBars: 1038,
    maxFirstCards: 3,
    minVariants: 1,
    heavy: true,
  },
  {
    name: 'БОЛЬШОЙ: баланс, стандарт',
    stock: [std()],
    demand: BIG,
    settings: { ...baseSettings, optimizationGoal: 'balance', searchSpeed: 'standard' },
    expectedFirstBars: 3759,
    minVariants: 2,
    maxLastCards: 23,
    compareSetupsBaseline: true,
    heavy: true,
  },
];

function toDemandItems(items: { length: number; quantity: number }[], prefix: string): DemandItem[] {
  return items.map((d, i) => ({
    id: `${prefix}_${i}`,
    orderIndex: i + 1,
    length: d.length,
    quantity: d.quantity,
  }));
}

export interface BenchmarkOptions {
  quick?: boolean;
  log?: (s: string) => void;
}

const yieldTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function runBenchmarkAsync(options: BenchmarkOptions = {}): Promise<boolean> {
  const quick = options.quick === true;
  const log = options.log ?? console.log;

  let failed = 0;
  let setupsBigCards: number | undefined;
  let totalChecks = 0;

  const activeCases = quick ? CASES.filter((c) => !c.heavy) : CASES;
  const activeBalanceCases = quick ? BALANCE_CASES.filter((c) => !c.heavy) : BALANCE_CASES;

  for (const c of activeCases) {
    totalChecks++;
    const demand = toDemandItems(c.demand, 'd');
    const t0 = performance.now();
    const s: FullOptimizationSolution = solveLinearCutting(c.stock, demand, c.settings, {});
    const ms = Math.round(performance.now() - t0);

    if (c.name === 'БОЛЬШОЙ: мин.наладок, стандарт') {
      setupsBigCards = s.rows.length;
    }

    const errs: string[] = [];
    const warns: string[] = [];

    if ((s.unplacedDemand?.length ?? 0) > 0) {
      errs.push(`неразмещено ${s.unplacedDemand.length}`);
    }

    const lb = Math.ceil(
      c.demand.reduce((a, d) => a + d.quantity * (d.length + c.settings.bladeWidth), 0) /
        (c.stock[0].length - c.settings.edgeTrim)
    );
    if (s.totalBarsUsed < lb) errs.push(`хлыстов ${s.totalBarsUsed} < нижней границы ${lb} (ошибка учёта)`);
    if (s.totalBarsUsed > c.maxBars) errs.push(`хлыстов ${s.totalBarsUsed} > ${c.maxBars}`);
    if (c.maxCards !== undefined && s.rows.length > c.maxCards) errs.push(`карт ${s.rows.length} > ${c.maxCards}`);
    if (c.exactTailSingleCards !== undefined) {
      const tailCount = s.rows.filter((r) => r.isTailSingle).length;
      if (tailCount !== c.exactTailSingleCards) {
        errs.push(`одиночных хвостовых карт ${tailCount} != ${c.exactTailSingleCards}`);
      }
    }
    if (ms > c.maxMs) {
      if (c.warnOnlyOnTime) {
        warns.push(`время ${ms}мс > ${c.maxMs}мс`);
      } else {
        errs.push(`время ${ms}мс > ${c.maxMs}мс`);
      }
    }

    if (errs.length) failed++;
    const status = errs.length ? 'FAIL' : warns.length ? 'WARN' : 'ok  ';
    const note = [...errs, ...warns].join('; ');
    const idx =
      s.cuttingIndex ??
      computeCuttingIndexFromSolution(s, c.stock, c.settings.targetRemnantMinLength ?? 1500).cuttingIndex;
    const idxScale = computeCuttingIndexScale(idx);
    const maxRem = s.maxReusableRemnantLength ?? computeMaxReusableRemnantFromSolution(s);
    log(
      `${status} ${c.name} | хлыстов ${s.totalBarsUsed} карт ${s.rows.length} инд ${idxScale} (${idx.toFixed(
        3
      )}) максОст ${maxRem}мм ${ms}мс (НГ ${lb})${note ? ' :: ' + note : ''}`
    );
    await yieldTick();
  }

  for (const bc of activeBalanceCases) {
    totalChecks++;
    const demand = toDemandItems(bc.demand, 'bd');
    const res = runBalanceSuite(bc.stock, demand, bc.settings, {});
    const errs: string[] = [];
    const warns: string[] = [];
    const variants = res.suite;

    if (variants.length === 0) {
      errs.push('пустой результат suite');
    } else if (variants.length > 9) {
      errs.push(`вариантов ${variants.length} > 9`);
    } else {
      const first = variants[0].solution;
      const last = variants[variants.length - 1].solution;
      if (first.totalBarsUsed > bc.expectedFirstBars) {
        errs.push(`1-й вариант хлыстов ${first.totalBarsUsed} > ${bc.expectedFirstBars}`);
      }
      if (bc.maxFirstCards !== undefined && first.rows.length > bc.maxFirstCards) {
        errs.push(`1-й вариант карт ${first.rows.length} > ${bc.maxFirstCards}`);
      }
      if (bc.expectedExactVariants !== undefined && variants.length !== bc.expectedExactVariants) {
        errs.push(`вариантов ${variants.length} != ${bc.expectedExactVariants}`);
      }
      if (bc.minVariants !== undefined && variants.length < bc.minVariants) {
        errs.push(`вариантов ${variants.length} < ${bc.minVariants}`);
      }
      if (variants.length === 1 && variants[0].title !== 'Баланс') {
        errs.push(`подпись единственного варианта "${variants[0].title}" != "Баланс"`);
      }
      if (bc.maxLastCards !== undefined && last.rows.length > bc.maxLastCards) {
        errs.push(`последний вариант карт ${last.rows.length} > ${bc.maxLastCards}`);
      }
      if (bc.compareSetupsBaseline && setupsBigCards !== undefined && last.rows.length > setupsBigCards) {
        errs.push(`последний вариант карт ${last.rows.length} > min_setups ${setupsBigCards}`);
      }

      // Строгий Парето-порядок: totalStockLength строго возрастает, число карт строго убывает
      for (let i = 1; i < variants.length; i++) {
        const prev = variants[i - 1].solution;
        const cur = variants[i].solution;
        if (cur.totalStockLength <= prev.totalStockLength) {
          errs.push(`расход не растёт (${prev.totalStockLength} -> ${cur.totalStockLength})`);
        }
        if (cur.rows.length >= prev.rows.length) {
          errs.push(`карты не убывают (${prev.rows.length} -> ${cur.rows.length})`);
        }
      }

      const maxCap = res.timings.reduce((m, t) => Math.max(m, t.capMm), 0);
      for (const v of variants) {
        if (maxCap > 0 && v.solution.totalStockLength > maxCap) {
          errs.push(`расход ${v.solution.totalStockLength} > maxCap ${maxCap}`);
        }
        if ((v.solution.unplacedDemand?.length ?? 0) > 0) {
          errs.push(`неразмещено ${v.solution.unplacedDemand.length}`);
        }
      }
      for (const t of res.timings) {
        if (t.stockMm > t.capMm) {
          errs.push(`${t.label}: расход ${t.stockMm} > cap ${t.capMm}`);
        }
      }
      if (res.timings.length > 9) {
        errs.push(`число прогонов ${res.timings.length} > 9`);
      }

      const baseMs = res.timings[0]?.durationMs ?? 0;
      const ceilingMs = Math.max(baseMs * 3.5, 3000);
      if (baseMs > 0 && res.totalDurationMs > ceilingMs) {
        warns.push(`время ${Math.round(res.totalDurationMs)}мс > порога ${Math.round(ceilingMs)}мс`);
      }
    }

    if (errs.length) failed++;
    const status = errs.length ? 'FAIL' : warns.length ? 'WARN' : 'ok  ';
    const variantsSummary = variants
      .map((v) => {
        const idx =
          v.solution.cuttingIndex ??
          computeCuttingIndexFromSolution(v.solution, bc.stock, bc.settings.targetRemnantMinLength ?? 1500).cuttingIndex;
        return `[${v.title}: ${v.solution.totalBarsUsed} хл., ${v.solution.rows.length} карт, ${v.solution.totalStockLength} мм, инд ${computeCuttingIndexScale(idx)} (${idx.toFixed(3)})]`;
      })
      .join(' -> ');
    const timingsSummary = res.timings
      .map((t) => `${t.label}: ${Math.round(t.durationMs)}мс (${t.bars} хл./${t.cards} к., cap ${t.capMm})`)
      .join('; ');
    const note = [...errs, ...warns].join('; ');
    log(
      `${status} ${bc.name} | вариантов ${variants.length} (прогонов ${res.timings.length}) | сумма ${Math.round(
        res.totalDurationMs
      )}мс${note ? ' :: ' + note : ''}`
    );
    log(`     варианты: ${variantsSummary}`);
    log(`     тайминги: ${timingsSummary}`);
    await yieldTick();
  }

  // Проверка fillControl в пакетном режиме (до/после на недозаполненной карте < 50% КИМ)
  {
    totalChecks++;
    const pairUnderfilledDemand = toDemandItems(
      mk([
        [2950, 2],
        [3100, 8],
      ]),
      'fc'
    );
    const fcBase = solveLinearCutting([std()], pairUnderfilledDemand, {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'standard',
      dualProfileCut: true,
      fillControlEnabled: false,
      fillControlThreshold: 50,
    });
    const fcOn = solveLinearCutting([std()], pairUnderfilledDemand, {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'standard',
      dualProfileCut: true,
      fillControlEnabled: true,
      fillControlThreshold: 50,
    });
    const errs: string[] = [];
    if (fcOn.unplacedDemand.length > fcBase.unplacedDemand.length) {
      errs.push(`unplaced вырос: ${fcBase.unplacedDemand.length} -> ${fcOn.unplacedDemand.length}`);
    }
    if (fcOn.totalBarsUsed >= fcBase.totalBarsUsed) {
      errs.push(`ожидалось сокращение хлыстов: ДО ${fcBase.totalBarsUsed} -> ПОСЛЕ ${fcOn.totalBarsUsed}`);
    }
    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Парный fillControl (<50%): ДО ${fcBase.totalBarsUsed} хл./${fcBase.rows.length} к. (КИМ ${fcBase.overallKIM.toFixed(
        2
      )}%) -> ПОСЛЕ ${fcOn.totalBarsUsed} хл./${fcOn.rows.length} к. (КИМ ${fcOn.overallKIM.toFixed(2)}%)${
        errs.length ? ' :: ' + errs.join('; ') : ''
      }`
    );
    await yieldTick();
  }

  // Проверка единого пула одиночных деталей после fillControl (isTailSingle + fillControl + смешанные карты)
  {
    totalChecks++;
    const unifiedDemand = toDemandItems(
      mk([
        [3500, 2],
        [2850, 6],
        [3100, 1],
        [2950, 1],
      ]),
      'usp'
    );
    const uspSettings: AppSettings = {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'standard',
      dualProfileCut: true,
      batchSizeMode: 'manual',
      batchSizeN: 2,
      fillControlEnabled: true,
      fillControlThreshold: 50,
    };
    const uspBase = solveLinearCutting([std()], unifiedDemand, {
      ...uspSettings,
      fillControlEnabled: false,
    });
    const uspOn = solveLinearCutting([std()], unifiedDemand, uspSettings);
    const errs: string[] = [];
    if (uspOn.unplacedDemand.length > 0) {
      errs.push(`неразмещено ${uspOn.unplacedDemand.length}`);
    }
    if (uspOn.totalBarsUsed > 6) {
      errs.push(`ожидалось <= 6 хлыстов (было ${uspOn.totalBarsUsed}, без fillControl ${uspBase.totalBarsUsed})`);
    }
    for (const r of uspOn.rows) {
      if (!r.isTailSingle && r.barsCount % 2 !== 0) {
        errs.push(`пакетная карта ${r.id} имеет некратное count=${r.barsCount}`);
      }
    }
    const batch3500 = uspOn.rows.find((r) => !r.isTailSingle && r.pieces.some((p) => p.length === 3500));
    if (!batch3500 || batch3500.barsCount !== 2) {
      errs.push('нетронутая пакетная карта [3500] x 2 была изменена');
    }
    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Единый пул одиночных деталей: ДО ${uspBase.totalBarsUsed} хл./${uspBase.rows.length} к. -> ПОСЛЕ ${uspOn.totalBarsUsed} хл./${uspOn.rows.length} к.${
        errs.length ? ' :: ' + errs.join('; ') : ''
      }`
    );
    await yieldTick();
  }

  // Проверка обощённого пакетного реза N >= 2 + одиночный хвост (isTailSingle)
  {
    totalChecks++;
    const batchTestDemand = toDemandItems(
      mk([
        [1350, 5],
        [250, 10],
      ]),
      'bt'
    );
    const errs: string[] = [];
    const autoN = resolveBatchSize(batchTestDemand, { batchSizeMode: 'auto' });
    const solAuto = solveLinearCutting([std()], batchTestDemand, {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'standard',
      dualProfileCut: true,
      batchSizeMode: 'auto',
      fillControlEnabled: false,
    });
    const solManual3 = solveLinearCutting([std()], batchTestDemand, {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'standard',
      dualProfileCut: true,
      batchSizeMode: 'manual',
      batchSizeN: 3,
      fillControlEnabled: false,
    });

    if (autoN !== 5) {
      errs.push(`autoN=${autoN} != 5 для количеств 5 и 10`);
    }
    if (solAuto.unplacedDemand.length > 0) {
      errs.push(`auto: неразмещено ${solAuto.unplacedDemand.length}`);
    }
    if (solManual3.unplacedDemand.length > 0) {
      errs.push(`manual N=3: неразмещено ${solManual3.unplacedDemand.length}`);
    }
    if (!solManual3.batchInfo || solManual3.batchInfo.batchSize !== 3 || solManual3.batchInfo.tailBarsUsed <= 0) {
      errs.push(`manual N=3: неверный batchInfo=${JSON.stringify(solManual3.batchInfo)}`);
    }
    if (!solManual3.rows.some((r) => r.isTailSingle)) {
      errs.push('manual N=3: отсутствуют карты с пометкой isTailSingle');
    }
    for (const r of solManual3.rows) {
      if (!r.isTailSingle && r.barsCount % 3 !== 0) {
        errs.push(`manual N=3: пакетная карта ${r.id} имеет count=${r.barsCount} (не кратно 3)`);
      }
    }
    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Пакетный рез N>=2 и одиночный хвост (auto N=${autoN}, manual N=3: пакет ${
        solManual3.batchInfo?.batchBarsUsed ?? 0
      } + одинок. ${solManual3.batchInfo?.tailBarsUsed ?? 0})${errs.length ? ' :: ' + errs.join('; ') : ''}`
    );
    await yieldTick();
  }

  // Проверка shapeRemnantsInSearch: false (инвариантность) vs true (допустимое поведение)
  {
    totalChecks++;
    const demandA = toDemandItems(A, 'inv');
    const thresholds = [250, 500, 1500];
    const goals: Array<'min_bars' | 'variants' | 'balance'> = ['min_bars', 'variants', 'balance'];
    const errs: string[] = [];
    for (const goal of goals) {
      const resultsFalse = thresholds.map((thr) =>
        solveLinearCutting([std()], demandA, {
          ...baseSettings,
          optimizationGoal: goal,
          searchSpeed: 'standard',
          reusableRemnantMin: thr,
          shapeRemnantsInSearch: false,
        })
      );
      const refBars = resultsFalse[0].totalBarsUsed;
      const refCards = resultsFalse[0].rows.length;
      for (let i = 1; i < resultsFalse.length; i++) {
        if (resultsFalse[i].totalBarsUsed !== refBars || resultsFalse[i].rows.length !== refCards) {
          errs.push(
            `${goal} (false): порог ${thresholds[i]} дал ${resultsFalse[i].totalBarsUsed}хл/${resultsFalse[i].rows.length}к != ${refBars}хл/${refCards}к`
          );
        }
      }

      const resultTrue = solveLinearCutting([std()], demandA, {
        ...baseSettings,
        optimizationGoal: goal,
        searchSpeed: 'standard',
        reusableRemnantMin: 500,
        shapeRemnantsInSearch: true,
      });
      if (resultTrue.unplacedDemand.length > 0) {
        errs.push(`${goal} (true): неразмещено ${resultTrue.unplacedDemand.length}`);
      }
    }
    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Порог ДО & shapeRemnantsInSearch (false инвариантен, true корректен)${
        errs.length ? ' :: ' + errs.join('; ') : ''
      }`
    );
    await yieldTick();
  }

  // Проверка пропорционального Индекса раскроя, шкалы 0–100 и Макс. остатка
  {
    totalChecks++;
    const idealSol = solveLinearCutting([std(6000)], toDemandItems(mk([[6000, 1]]), 'ideal'), {
      ...baseSettings,
      bladeWidth: 0,
      edgeTrim: 0,
      dualProfileCut: false,
      optimizationGoal: 'min_bars',
      searchSpeed: 'fast',
    });
    const idealIdx = idealSol.cuttingIndex ?? computeCuttingIndexFromSolution(idealSol).cuttingIndex;
    const demandA = toDemandItems(A, 'idx');
    const solMatA = solveLinearCutting([std()], demandA, {
      ...baseSettings,
      optimizationGoal: 'min_bars',
      searchSpeed: 'deep',
    });
    const solSetupsA = solveLinearCutting([std()], demandA, {
      ...baseSettings,
      optimizationGoal: 'variants',
      searchSpeed: 'deep',
    });
    const idxMat = solMatA.cuttingIndex ?? computeCuttingIndexFromSolution(solMatA, [std()], 1500).cuttingIndex;
    const idxSetups = solSetupsA.cuttingIndex ?? computeCuttingIndexFromSolution(solSetupsA, [std()], 1500).cuttingIndex;

    const mkSolWithRemnant = (reusableLen: number): FullOptimizationSolution => ({
      totalStockLength: 6000,
      totalSpentLength: 4000,
      totalBarsUsed: 1,
      totalWasteLength: 2000 - reusableLen,
      totalReusableLength: reusableLen,
      maxReusableRemnantLength: reusableLen,
      overallKIM: ((4000 + reusableLen) / 6000) * 100,
      netKIM: (4000 / 6000) * 100,
      rows: [
        {
          id: 'r1',
          barIndex: 1,
          barSize: 6000,
          spent: 4000,
          barsCount: 1,
          formula: '',
          pieces: [],
          waste: 2000 - reusableLen,
          reusableRemnant: reusableLen,
          scrapRemnant: 2000 - reusableLen,
          kerfLoss: 0,
          trimLoss: 0,
          isReusable: reusableLen > 0,
          wasteLabel: 'Остат',
          efficiency: ((4000 + reusableLen) / 6000) * 100,
          layoutItems: [],
        },
      ],
      remainingWarehouseStock: [],
      unplacedDemand: [],
      calculationTimeMs: 0,
    });

    const idxShortRem = computeCuttingIndexFromSolution(mkSolWithRemnant(300), [std(6000)], 1500).cuttingIndex;
    const idxLongRem = computeCuttingIndexFromSolution(mkSolWithRemnant(1500), [std(6000)], 1500).cuttingIndex;

    const errs: string[] = [];
    if (Math.abs(idealIdx - 1) > 1e-6) {
      errs.push(`идеальный индекс ${idealIdx.toFixed(6)} != 1.000`);
    }
    if (computeCuttingIndexScale(idealIdx) !== 100) {
      errs.push(`идеальная шкала ${computeCuttingIndexScale(idealIdx)} != 100`);
    }
    if (
      computeCuttingIndexScale(0.9) !== 0 ||
      computeCuttingIndexScale(0.85) !== 0 ||
      computeCuttingIndexScale(0.95) !== 50 ||
      computeCuttingIndexScale(1.0) !== 100
    ) {
      errs.push('ошибка шкалы 0–100');
    }
    if (!(idxShortRem < idxLongRem)) {
      errs.push(`ожидался больший индекс для ДО 1500мм (${idxLongRem}) чем 300мм (${idxShortRem})`);
    }
    if ((idealSol.maxReusableRemnantLength ?? 0) !== 0) {
      errs.push(`идеальный макс.остаток ${idealSol.maxReusableRemnantLength} != 0`);
    }
    if (idxMat <= 0 || idxMat > 1 || idxSetups <= 0 || idxSetups > 1) {
      errs.push(`индекс вне [0,1]: mat=${idxMat}, setups=${idxSetups}`);
    }
    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Пропорциональный Индекс (0–100) и Макс.остаток | идеал=${computeCuttingIndexScale(
        idealIdx
      )} (${idealIdx.toFixed(3)}) | ДО 300vs1500: ${idxShortRem.toFixed(4)} < ${idxLongRem.toFixed(
        4
      )} | A min_bars=${computeCuttingIndexScale(idxMat)} (${idxMat.toFixed(3)}) vs min_setups=${computeCuttingIndexScale(
        idxSetups
      )} (${idxSetups.toFixed(3)})${errs.length ? ' :: ' + errs.join('; ') : ''}`
    );
    await yieldTick();
  }

  // Проверка лексикографического порядка score() всех трёх стратегий на масштабах A×10 и BIG
  {
    totalChecks++;
    const errs: string[] = [];
    const setupsStrat = new MinimizeSetupsStrategy();
    const matStrat = new MinimizeMaterialStrategy();
    const mkCtx = (cap?: number): CutContext => ({
      startTime: 0,
      bladeWidth: 3,
      edgeTrim: 0,
      reusableRemnantMin: 250,
      searchRemnantMin: 250,
      targetRemnantMin: 1500,
      targetRemnantKIM: 75,
      dualProfileCut: false,
      fillControlEnabled: false,
      fillControlThreshold: 50,
      groupSolutions: true,
      searchSpeed: 'standard',
      prioritizeRemnants: false,
      nod: 1,
      scaledDemand: [],
      scaledStockAll: [],
      scaledStockRemnants: [],
      scaledStockStandard: [],
      activeStandardLengths: [6000],
      totalDemandLengthMm: 0,
      totalPartsCount: 0,
      totalBarsEstimate: 0,
      maxSortZ: 0,
      maxSort: 14,
      maxVar: 10,
      stockInput: [std()],
      settings: baseSettings,
      ...(cap !== undefined ? { materialCapMm: cap } : {}),
    });
    const mkMetrics = (bars: number, cards: number, waste: number): CutMetrics => ({
      uniqueCardsCount: cards,
      totalBarsUsed: bars,
      totalStockLengthMm: bars * 6000,
      totalPartsLengthMm: bars * 6000 - waste,
      totalWasteMm: waste,
      totalScrapMm: waste,
      totalReusableMm: 0,
      maxReusableRemnantMm: 0,
      targetReusableMm: 0,
      remnantsUsedCount: 0,
      remnantsUsedMm: 0,
      overallKIM: 99,
      netKIM: 99,
      cuttingIndex: 0.99,
      cuttingIndexMaterial: 0.99,
      cuttingIndexSetup: 0.99,
      unplacedCount: 0,
      unplacedLengthMm: 0,
    });

    const scales = [
      { label: 'A×10', bars: 1038, cards: 3, waste: 50000 },
      { label: 'BIG', bars: 3760, cards: 23, waste: 500000 },
    ];
    for (const sc of scales) {
      const ctx = mkCtx(sc.bars * 6000);
      const balStrat = new MinimizeBalanceStrategy(sc.bars * 6000);
      const baseM = mkMetrics(sc.bars, sc.cards, sc.waste);

      // 1) MinimizeSetupsStrategy: (cards, bars, waste)
      const sLessCardMoreBars = setupsStrat.score([], mkMetrics(sc.bars + 10, sc.cards - 1, sc.waste), ctx);
      const sBase = setupsStrat.score([], baseM, ctx);
      const sOneMoreBar = setupsStrat.score([], mkMetrics(sc.bars + 1, sc.cards, sc.waste), ctx);
      const sMoreWaste = setupsStrat.score([], mkMetrics(sc.bars, sc.cards, sc.waste + 1000), ctx);
      if (!(sLessCardMoreBars > sBase && sBase > sMoreWaste && sMoreWaste > sOneMoreBar)) {
        errs.push(`${sc.label} min_setups: нарушен порядок (карты, заготовки, отход)`);
      }

      // 2) MinimizeMaterialStrategy: (bars/stock, cards, waste)
      const mOneLessBarMoreCards = matStrat.score([], mkMetrics(sc.bars - 1, sc.cards + 5, sc.waste), ctx);
      const mBase = matStrat.score([], baseM, ctx);
      const mOneMoreCardLessWaste = matStrat.score([], mkMetrics(sc.bars, sc.cards + 1, Math.max(0, sc.waste - 10000)), ctx);
      const mMoreWaste = matStrat.score([], mkMetrics(sc.bars, sc.cards, sc.waste + 1000), ctx);
      if (!(mOneLessBarMoreCards > mBase && mBase > mMoreWaste && mMoreWaste > mOneMoreCardLessWaste)) {
        errs.push(`${sc.label} min_material: нарушен порядок (заготовки, карты, отход)`);
      }

      // 3) MinimizeBalanceStrategy: (overCap, cards, stock, waste)
      const bLessCardAtCap = balStrat.score([], mkMetrics(sc.bars, sc.cards - 1, sc.waste), ctx);
      const bLessStockSameCards = balStrat.score([], mkMetrics(sc.bars - 1, sc.cards, sc.waste), ctx);
      const bBase = balStrat.score([], baseM, ctx);
      const bMoreWaste = balStrat.score([], mkMetrics(sc.bars, sc.cards, sc.waste + 1000), ctx);
      const bOverCap = balStrat.score([], mkMetrics(sc.bars + 1, Math.max(1, sc.cards - 5), sc.waste), ctx);
      if (!(bLessCardAtCap > bLessStockSameCards && bLessStockSameCards > bBase && bBase > bMoreWaste && bMoreWaste > bOverCap)) {
        errs.push(`${sc.label} balance: нарушен порядок (over, карты, расход, отход)`);
      }
    }

    if (errs.length) failed++;
    log(
      `${errs.length ? 'FAIL' : 'ok  '} Приоритеты score() на A×10 и BIG (1 карта / 1 заготовка / отход)${
        errs.length ? ' :: ' + errs.join('; ') : ''
      }`
    );
    await yieldTick();
  }

  log(failed ? `ИТОГ: провалено ${failed} из ${totalChecks}` : `ИТОГ: все ${totalChecks} проверок пройдены`);
  return failed === 0;
}

export function runBenchmark(log: (s: string) => void = console.log): boolean {
  let failed = 0;
  let totalChecks = 0;

  for (const c of CASES) {
    totalChecks++;
    const demand = toDemandItems(c.demand, 'd');
    const t0 = performance.now();
    const s = solveLinearCutting(c.stock, demand, c.settings, {});
    const ms = Math.round(performance.now() - t0);
    const errs: string[] = [];
    if ((s.unplacedDemand?.length ?? 0) > 0) errs.push(`неразмещено ${s.unplacedDemand.length}`);
    if (s.totalBarsUsed > c.maxBars) errs.push(`хлыстов ${s.totalBarsUsed} > ${c.maxBars}`);
    if (c.maxCards !== undefined && s.rows.length > c.maxCards) errs.push(`карт ${s.rows.length} > ${c.maxCards}`);
    if (c.exactTailSingleCards !== undefined) {
      const tailCount = s.rows.filter((r) => r.isTailSingle).length;
      if (tailCount !== c.exactTailSingleCards) {
        errs.push(`одиночных хвостовых карт ${tailCount} != ${c.exactTailSingleCards}`);
      }
    }
    if (errs.length) failed++;
    log(`${errs.length ? 'FAIL' : 'ok  '} ${c.name} | хлыстов ${s.totalBarsUsed} карт ${s.rows.length} (${ms}мс)`);
  }

  log(failed ? `ИТОГ: провалено ${failed} из ${totalChecks}` : `ИТОГ: все ${totalChecks} проверок пройдены`);
  return failed === 0;
}
