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
}

export interface FullOptimizationSolution {
  totalStockLength: number; // Суммарный размер исп. заготовок, мм (492 000)
  totalSpentLength: number; // Суммарный расход, мм (484 430)
  totalBarsUsed: number; // Всего исп. заготовок, шт (82)
  totalWasteLength: number; // Отходы, мм (6 892 или 7 570)
  totalReusableLength: number; // Из них деловой остаток, мм
  overallKIM: number; // Общий КИМ, % (98.60%)
  rows: SolutionRow[];
  remainingWarehouseStock: RemnantItem[]; // Блок «Осталось»
  unplacedDemand: UnplacedItem[]; // Блок «Не сделано»
  calculationTimeMs: number;
}

export interface AppSettings {
  material: string;
  orderNumber: string;
  bladeWidth: number; // Ширина реза, мм (по умолчанию 3)
  edgeTrim: number; // Кромка (торцовка), мм (по умолчанию 0)
  reusableRemnantMin: number; // Деловой остат., мм (по умолчанию 0 или 250)
  cutAngle45: boolean; // Рез под 45 градусов
  dualProfileCut: boolean; // Раскрой в два профиля
  fillControlEnabled?: boolean; // Контроль заполнения крайней пары
  fillControlThreshold?: number; // Порог КИМ для контроля заполнения, % (по умолчанию 50)
  groupSolutions: boolean; // Группировать решение
  showGraphics: boolean; // Отображать графику
  searchSpeed: 'fast' | 'standard' | 'deep'; // Быстро / Обычный / Глубокий
  optimizationGoal: 'variants' | 'min_waste' | 'min_bars' | 'max_reusable' | 'prioritize_remnants'; // Оптимизация
  targetRemnantKIM?: number; // Целевой КИМ делового остатка (1 - 99%), default: 75%
}

export interface CalculationProgressInfo {
  stage: number; // 1, 2, 3
  totalStages: number; // 3
  stageName: string;
  percent: number; // 0 - 100
  placedParts: number;
  totalParts: number;
  usedBars: number;
  totalBarsEstimate: number;
  bestKIM: number;
  elapsedMs: number;
  etaSeconds?: number;
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
}

export interface CuttingOptimizationResult {
  patterns: BarCuttingPattern[];
  totalStockBarsUsed: number;
  totalStockLengthUsed: number;
  totalPartsLength: number;
  totalWasteLength: number;
  totalReusableLength: number;
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
  algorithmName: string;
}

export interface VbaInspectionResult {
  fileName: string;
  moduleType: 'bas' | 'cls' | 'frm' | 'text';
  subroutines: string[];
  functions: string[];
  variablesDetected: string[];
  sortingDetected: string[];
  algorithmHints: string[];
  rawCode: string;
}
