export interface StockItem {
  id: string;
  orderIndex: number;
  length: number; // мм
  quantity: number; // шт
  mark?: string; // Обозначение / Марка / Стеллаж
  notes?: string; // Примечание
  isStandardUnlimited?: boolean; // Для стандартных 6000/12000 - авторасчет количества (По потребности)
  isStandard?: boolean; // Стандартный хлыст (6000 / 12000)
  isActive?: boolean; // Включен ли хлыст в расчет (галочка)
  used?: number; // использовано шт
  remaining?: number; // не использов. шт
}

export interface DemandItem {
  id: string;
  orderIndex: number;
  length: number; // мм
  quantity: number; // шт
  mark?: string; // Обозначение детали (напр. Стойка С-1)
  notes?: string; // Примечание
  placed?: number; // разложено шт
  unplaced?: number; // не разложено шт
  color?: string;
}

export interface RemnantItem {
  length: number;
  quantity: number;
  mark?: string;
  notes?: string;
}

export interface UnplacedItem {
  length: number;
  quantity: number;
  mark?: string;
  notes?: string;
}

export interface SolutionPiece {
  id: string;
  length: number;
  count: number;
  color: string;
  mark?: string;
}

export interface SolutionBarLayoutItem {
  id: string;
  length: number;
  color: string;
  mark?: string;
  isWaste?: boolean;
  isTrim?: boolean;
  wasteType?: 'scrap' | 'reusable';
}

export interface SolutionRow {
  id: string;
  barIndex: number;
  barSize: number; // Размер, мм (напр. 6000)
  spent: number; // Расход, мм (напр. 5994)
  barsCount: number; // Кол-во исп. заготовок (напр. 30 шт)
  formula: string; // Формула раскроя: 20х{[10] + <800х7 + 150х2> + !<> + (3х11+57)}=6000
  pieces: SolutionPiece[];
  waste: number; // Отходы хлыста, мм (полный неделовой отход: торцовка + резы + лом)
  reusableRemnant: number; // Деловой остаток, мм (если есть)
  scrapRemnant: number; // Конечный лом, мм (не деловой)
  kerfLoss: number; // Металл на резы, мм
  trimLoss: number; // Торцовка, мм
  isReusable: boolean; // Деловой остаток
  wasteLabel: string; // 'О' / 'Ост' / 'Лом'
  efficiency: number; // КИМ хлыста, %
  layoutItems: SolutionBarLayoutItem[];
  isTailSingle?: boolean;
}

export interface FullOptimizationSolution {
  totalStockLength: number; // Суммарный размер исп. заготовок, мм (492 000)
  totalSpentLength: number; // Суммарный расход, мм (484 430)
  totalBarsUsed: number; // Всего исп. заготовок, шт (82)
  totalWasteLength: number; // Отходы, мм (6 892 или 7 570)
  totalReusableLength: number; // Из них деловой остаток, мм
  maxReusableRemnantLength?: number; // Макс. длина одного делового остатка (>= reusableRemnantMin), мм
  cuttingIndex?: number; // Индекс раскроя E_мат * E_нал
  cuttingIndexMaterial?: number; // Материальная составляющая E_мат
  cuttingIndexSetup?: number; // Наладочная составляющая E_нал
  overallKIM: number; // Общий (валовый) КИМ, % (с учетом делового остатка)
  netKIM?: number; // Мгновенный (чистый) КИМ, % (отношение длины готовых деталей к расходу материала без учета делового остатка)
  rows: SolutionRow[];
  remainingWarehouseStock: RemnantItem[]; // Блок «Осталось»
  unplacedDemand: UnplacedItem[]; // Блок «Не сделано»
  calculationTimeMs: number;
  telemetry?: CalculationTelemetry;
  abortedInfo?: {
    viewedPasses: number;
    totalPasses: number;
  };
  batchInfo?: {
    batchSize: number;
    batchBarsUsed: number;
    tailBarsUsed: number;
    nonMultipleDetails: { length: number; quantity: number; tailQuantity: number }[];
  };
}

export interface CalculationTelemetry {
  calculationId: string;
  timestamp: number;
  environment: 'client_worker' | 'client_main' | 'server_node';
  // Временные метрики (мс)
  totalDurationMs: number;
  stageTimingsMs: {
    stage1Init: number;      // Анализ заготовок, НОД и сортировка
    stage2Search: number;    // Многопроходный подбор комбинаций
    stage3Refine: number;    // 2-Opt локальный поиск и схлопывание карт
  };
  // Алгоритмическая и вычислительная нагрузка
  passesEvaluated: number;
  prunedPasses?: number;
  totalCombinationsChecked: number;
  twoOptSwapIterations: number;
  tailConsolidationCardsMerged: number;
  throughputPartsPerSecond: number;
  // Память и процессорная среда
  memoryUsedMb?: number;       // JS Heap (performance.memory / Node heapUsed)
  memoryDeltaMb?: number;      // Дельта выделенной памяти
  cpuLoadPercent?: number;     // Загрузка ядра (~100% выделенного ядра Worker во время расчета)
  workerThreadCount: number;   // Количество потоков (1 для Worker, N для пула помощников)
  chunksProcessed?: number;    // Количество обработанных порций проходов (0 в однопоточном режиме)
}

export type ReusableRemnantMode = 'manual' | 'weighted' | 'min_part';

export interface AppSettings {
  material: string;
  orderNumber: string;
  bladeWidth: number; // Ширина реза, мм (по умолчанию 3)
  edgeTrim: number; // Кромка (торцовка), мм (по умолчанию 0)
  reusableRemnantMin: number; // Порог делового остатка, мм (по умолчанию 250)
  reusableRemnantMode?: ReusableRemnantMode; // Способ задания порога: ручной, средневзвешенное, минимальное
  shapeRemnantsInSearch?: boolean; // Принудительно доводить обрезки до делового остатка на финальном этапе
  shapeRemnantsThresholdPct?: number; // Порог отбора карт для доработки в % от порога делового (по умолчанию 50%)
  cutAngle45: boolean; // Рез под 45 градусов
  dualProfileCut: boolean; // Пакетный рез
  /** @deprecated Больше не используется; оставлено опционально для миграции старых сохранённых настроек */
  batchSizeMode?: 'auto' | 'manual';
  batchSizeN?: number; // Размер пакета N (2..10, по умолчанию 2)
  prioritizeRemnants?: boolean; // Приоритет остатков со склада
  fillControlEnabled?: boolean; // Контроль заполнения крайней пары
  fillControlThreshold?: number; // Порог КИМ для контроля заполнения, % (20..85, по умолчанию 50)
  groupSolutions: boolean; // Группировать решение
  showGraphics: boolean; // Отображать графику
  searchSpeed: 'fast' | 'standard' | 'exact' | 'deep'; // Поверхностный / Стандартный / Точный / Глубокий
  optimizationGoal: 'variants' | 'min_bars' | 'balance'; // Оптимизация
  orderComment?: string; // Комментарий к заказу (цех, примечание)
  isMaterialLocked?: boolean; // Блокировка редактирования наименования материала
  materialLockSource?: 'file' | 'manual' | null; // Источник блокировки (из csv/xml или вручную)
  remnantMinFillPct?: number; // Минимальное заполнение делового остатка (%) (0 - 100), по умолчанию 75%
  /** @deprecated Заменён на remnantMinFillPct; оставлено опционально для чтения старых запусков */
  targetRemnantKIM?: number;
  /** @deprecated Объединён с reusableRemnantMin; оставлено опционально для совместимости тестов */
  targetRemnantMinLength?: number;
  multiThreadEnabled?: boolean; // Многопоточный режим перебора проходов (при deep)
  exactSolverEnabled?: boolean; // Точный решатель (LP) как дополнительный кандидат для min_bars и Баланса
}

export interface CalculationProgressInfo {
  stage: number; // 1, 2, 3
  totalStages: number; // 3
  stageName: string;
  stageStepName?: string; // Детальный шаг (напр. "Раунд 2-Opt 4/15", "Схлопывание карт 4 -> 3")
  percent: number; // 0 - 100
  placedParts: number;
  totalParts: number;
  usedBars: number;
  totalBarsEstimate: number;
  bestKIM: number;
  uniqueCardsCount?: number; // Живой счетчик уникальных карт
  elapsedMs: number;
  viewedPasses?: number;
  totalPasses?: number;
  workerThreadCount?: number;
  chunksCompleted?: number;
  totalChunks?: number;
  hasMeasurableProgress?: boolean;
}

export interface ComplexityEstimate {
  totalMeters: number;
  totalParts: number;
  uniqueParts: number;
  isHeavy: boolean;
  estimatedSeconds: {
    fast: number;
    standard: number;
    deep: number;
  };
  recommendation: string;
}

// Backward-compatible types for legacy & reporting components
export interface PartDemand {
  id: string;
  mark: string;
  length: number;
  quantity: number;
  priority?: number;
  color: string;
  notes?: string;
}

export interface StockBar {
  id: string;
  name: string;
  length: number;
  availableQuantity: number;
  costPerBar?: number;
  isRemnant: boolean;
}

export interface CuttingParams {
  bladeWidth: number;
  trimStart: number;
  trimEnd: number;
  minReusableLength: number;
  strategy?: string;
  projectName: string;
  materialName: string;
  orderNumber: string;
  reusableRemnantMin?: number;
  cutAngle45?: boolean;
  dualProfileCut?: boolean;
  groupSolutions?: boolean;
  searchSpeed?: string;
  orderComment?: string;
}

export interface CutPiece {
  id: string;
  partId: string;
  mark: string;
  length: number;
  startOffset: number;
  endOffset: number;
  color: string;
  notes?: string;
}

export interface BarCuttingPattern {
  id: string;
  patternIndex: number;
  stockBarId: string;
  stockName: string;
  stockLength: number;
  trimStart: number;
  trimEnd: number;
  bladeWidth: number;
  cuts: CutPiece[];
  totalPartsLength: number;
  totalKerfLength: number;
  wasteLength: number;
  isReusableWaste: boolean;
  reusableLength: number;
  scrapLength: number;
  efficiencyPercent: number;
  count: number;
  isTailSingle?: boolean;
}

export interface CuttingOptimizationResult {
  patterns: BarCuttingPattern[];
  totalStockBarsUsed: number;
  totalStockLengthUsed: number;
  totalPartsLength: number;
  totalWasteLength: number;
  totalReusableLength: number;
  maxReusableRemnantLength?: number;
  cuttingIndex?: number;
  cuttingIndexMaterial?: number;
  cuttingIndexSetup?: number;
  totalScrapLength: number;
  totalKerfLoss: number;
  overallEfficiencyPercent: number;
  unfulfilledDemand: {
    partId: string;
    mark: string;
    length: number;
    requested: number;
    fulfilled: number;
    missing: number;
  }[];
  calculationTimeMs: number;
  telemetry?: CalculationTelemetry;
  batchInfo?: FullOptimizationSolution['batchInfo'];
  algorithmName: string;
}
