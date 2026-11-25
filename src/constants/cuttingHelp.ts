import type { AppSettings, ReusableRemnantMode } from '../types/cutting';
import { resolveBatchSize } from '../utils/cuttingEngine';

export interface HelpOptionItem<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly shortLabel?: string;
  readonly explanation: string;
}

export interface HelpEntry {
  readonly label: string;
  readonly explanation: string;
}

export interface StrategyBadgeMeta {
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

export function formatHelpList(items: readonly HelpEntry[], indent: string = ''): string {
  return items
    .map((option) => `${indent}• ${option.label} — ${option.explanation}`)
    .join('\n');
}

export const OPTIMIZATION_OPTIONS: readonly HelpOptionItem<AppSettings['optimizationGoal']>[] = [
  {
    value: 'balance',
    label: 'Баланс',
    explanation:
      'Серия вариантов по компромиссу между расходом материала и числом карт (базой служит минимум материала).',
  },
  {
    value: 'variants',
    label: 'Минимум наладок',
    explanation: 'Меньше уникальных карт раскроя и переналадок пилы.',
  },
  {
    value: 'min_bars',
    label: 'Минимум материала',
    explanation: 'Минимум заготовок; при равенстве меньше карт и отхода.',
  },
];

export const DEFICIT_OPTIMIZATION_OPTIONS = OPTIMIZATION_OPTIONS.filter(
  (option): option is HelpOptionItem<'variants' | 'min_bars'> =>
    option.value === 'variants' || option.value === 'min_bars'
);

export const OPTIMIZATION_HELP = formatHelpList(OPTIMIZATION_OPTIONS);

export const OPTIMIZATION_BADGES: Record<AppSettings['optimizationGoal'], StrategyBadgeMeta> = {
  variants: {
    label: 'Меньше наладок',
    icon: '⚡',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  min_bars: {
    label: 'Мин. материал',
    icon: '📦',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  balance: {
    label: 'Баланс',
    icon: '⚖️',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

export function normalizeOptimizationGoal(goal?: string): AppSettings['optimizationGoal'] {
  if (goal === 'variants' || goal === 'min_bars' || goal === 'balance') {
    return goal;
  }
  if (goal === 'min_setups') {
    return 'variants';
  }
  // Migrates legacy 'comprehensive' and 'custom' (and any unknown goal) to 'min_bars'
  return 'min_bars';
}

export const BATCH_SIZE_MIN = 2;
export const BATCH_SIZE_MAX = 10;
export const FILL_CONTROL_MIN = 20;
export const FILL_CONTROL_MAX = 85;

export function clampBatchSizeN(value?: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : BATCH_SIZE_MIN;
  return Math.min(BATCH_SIZE_MAX, Math.max(BATCH_SIZE_MIN, n));
}

export function clampFillControlThreshold(value?: number): number {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 50;
  return Math.min(FILL_CONTROL_MAX, Math.max(FILL_CONTROL_MIN, v));
}

export function normalizeLegacySettings(
  raw: AppSettings,
  demandItems: readonly { length: number; quantity: number }[] = []
): AppSettings {
  const normalizedGoal = normalizeOptimizationGoal(raw.optimizationGoal);
  const {
    customStrategyConfig: legacyCustom,
    batchSizeMode: legacyBatchMode,
    ...rest
  } = raw as AppSettings & {
    customStrategyConfig?: unknown;
  };

  let resolvedBatchN: number;
  if (legacyBatchMode === 'auto' || (legacyBatchMode === undefined && raw.batchSizeN === undefined)) {
    resolvedBatchN = clampBatchSizeN(resolveBatchSize(demandItems, { batchSizeMode: 'auto' }));
  } else {
    resolvedBatchN = clampBatchSizeN(raw.batchSizeN);
  }

  const normalizedFillThreshold =
    raw.fillControlThreshold !== undefined
      ? clampFillControlThreshold(raw.fillControlThreshold)
      : undefined;

  const unchanged =
    normalizedGoal === raw.optimizationGoal &&
    legacyCustom === undefined &&
    legacyBatchMode === undefined &&
    raw.batchSizeN === resolvedBatchN &&
    normalizedFillThreshold === raw.fillControlThreshold;

  if (unchanged) {
    return raw;
  }

  return {
    ...rest,
    optimizationGoal: normalizedGoal,
    batchSizeN: resolvedBatchN,
    ...(normalizedFillThreshold !== undefined
      ? { fillControlThreshold: normalizedFillThreshold }
      : {}),
  };
}

export function getOptimizationOption(
  goal?: string
): HelpOptionItem<AppSettings['optimizationGoal']> | undefined {
  if (!goal) return undefined;
  const normalized = normalizeOptimizationGoal(goal);
  return OPTIMIZATION_OPTIONS.find((option) => option.value === normalized);
}

export function getOptimizationLabel(goal?: string, compact: boolean = false): string {
  const option = getOptimizationOption(goal);
  if (!option) return goal || '—';
  return compact ? option.shortLabel ?? option.label : option.label;
}

export function getOptimizationBadge(goal?: string): StrategyBadgeMeta | null {
  if (!goal) return null;
  const normalized = normalizeOptimizationGoal(goal);
  return OPTIMIZATION_BADGES[normalized];
}

export const SEARCH_SPEED_OPTIONS: readonly HelpOptionItem<AppSettings['searchSpeed']>[] = [
  {
    value: 'fast',
    label: 'Поверхностный поиск',
    shortLabel: 'Поверхностный',
    explanation: 'Быстрый подбор базовых схем для оперативной оценки.',
  },
  {
    value: 'standard',
    label: 'Стандартный поиск',
    shortLabel: 'Стандартный',
    explanation: 'Сбалансированная глубина перебора и 2-Opt оптимизации.',
  },
  {
    value: 'deep',
    label: 'Глубокий перебор',
    shortLabel: 'Глубокий',
    explanation: 'Максимальный перебор комбинаций и раундов оптимизации.',
  },
  {
    value: 'exact',
    label: 'Точный поиск (LP решатель)',
    shortLabel: 'Точный',
    explanation:
      'Стандартная глубина перебора с подключением точного LP-решателя для минимального расхода материала.',
  },
];

export const SEARCH_SPEED_HELP = formatHelpList(SEARCH_SPEED_OPTIONS);

export function getSearchSpeedOption(
  speed?: string
): HelpOptionItem<AppSettings['searchSpeed']> | undefined {
  return SEARCH_SPEED_OPTIONS.find((option) => option.value === speed);
}

export function getSearchSpeedLabel(speed?: string, compact: boolean = false): string {
  const option = getSearchSpeedOption(speed);
  if (!option) return speed || '—';
  return compact ? option.shortLabel ?? option.label : option.label;
}

export const REUSABLE_REMNANT_MODE_OPTIONS: readonly HelpOptionItem<ReusableRemnantMode>[] = [
  {
    value: 'weighted',
    label: 'Средневзвешенное значение',
    explanation:
      'Медианная длина детали заказа с учётом количества деталей (с округлением до 100 мм).',
  },
  {
    value: 'min_part',
    label: 'Минимальное значение',
    explanation:
      'Длина наименьшей детали заказа + 1 мм, округлённая вверх до 10 мм.',
  },
  {
    value: 'manual',
    label: 'Ручной ввод',
    explanation: 'Пользователь явно задаёт минимальную длину делового остатка в мм.',
  },
];

export type AlgorithmExtraOptionKey =
  | 'multiThreadEnabled'
  | 'exactSolverEnabled'
  | 'prioritizeRemnants'
  | 'shapeRemnantsInSearch';

export const ALGORITHM_EXTRA_OPTIONS: readonly HelpOptionItem<AlgorithmExtraOptionKey>[] = [
  {
    value: 'multiThreadEnabled',
    label: 'Многопоточный режим',
    explanation:
      'Параллельный перебор проходов пулом потоков при глубоком поиске для стратегии «Минимум материала» и базового прогона «Баланса».',
  },
  {
    value: 'exactSolverEnabled',
    label: 'Точный решатель (LP)',
    explanation:
      'Дополнительный поиск оптимального раскроя методом генерации столбцов и целочисленного программирования (HiGHS) для стратегий «Минимум материала» и базового прогона «Баланса».',
  },
  {
    value: 'prioritizeRemnants',
    label: 'Приоритет остатков со склада',
    explanation:
      'Двухэтапный раскрой: сначала складские деловые остатки с минимальным заполнением не ниже заданного порога %, затем оставшиеся детали на стандартных заготовках выбранной стратегией.',
  },
  {
    value: 'shapeRemnantsInSearch',
    label: 'Формировать деловые остатки',
    explanation:
      'После отработки стратегии карты с обрезками выше заданного % от порога делового принудительно разбиваются в общий пул деталей и перераскраиваются по стратегии минимум материала с доведением обрезок до делового остатка.',
  },
];

export function getAlgorithmExtraHelp(key: AlgorithmExtraOptionKey): string {
  return ALGORITHM_EXTRA_OPTIONS.find((item) => item.value === key)?.explanation ?? '';
}

export const MULTI_THREAD_DEEP_ONLY_HINT = 'Доступно для глубокого перебора';
export const MULTI_THREAD_UNAVAILABLE_HINT = 'Недоступно на этом устройстве';
export const EXACT_SOLVER_PRESET_HINT = 'Включено пресетом «Точный поиск»';

export const REMNANT_MIN_FILL_HELP =
  'Минимальное заполнение делового остатка деталями (%) — остатки с заполнением ниже порога не раскраиваются на этапе 1.';
export const SHAPE_REMNANTS_THRESHOLD_HELP =
  'Перераскрой карт с обрезком выше указанного % от порога делового остатка.';
export const FILL_CONTROL_THRESHOLD_HELP =
  'Порог чистого КИМ пакетной карты (20–85%) для дозаполнения по 1 профилю.';

export const REUSABLE_REMNANT_MIN_HELP =
  'Минимальная длина годного остатка, записываемого в деловые по итогам расчёта (используется и для возврата на склад, и в Индексе раскроя).';

export type GeometryOptionKey =
  | 'bladeWidth'
  | 'edgeTrim'
  | 'cutAngle45';

export const GEOMETRY_OPTIONS: readonly HelpOptionItem<GeometryOptionKey>[] = [
  {
    value: 'bladeWidth',
    label: 'Рез (пропил)',
    explanation: 'Ширина режущего диска пилы (вычитается при каждом резе).',
  },
  {
    value: 'edgeTrim',
    label: 'Кромка',
    explanation: 'Длина технологической торцовки краев профиля (0–50 мм).',
  },
  {
    value: 'cutAngle45',
    label: 'Рез под углом 45°',
    explanation: 'Временно отключено: учет косого реза 45° находится в разработке.',
  },
];

export function getGeometryHelp(key: GeometryOptionKey): string {
  return GEOMETRY_OPTIONS.find((item) => item.value === key)?.explanation ?? '';
}

export const ANGLE_45_DISABLED_HINT = getGeometryHelp('cutAngle45');

export type BatchOptionKey = 'dualProfileCut' | 'batchSizeN' | 'fillControl';

export const BATCH_OPTIONS: readonly HelpOptionItem<BatchOptionKey>[] = [
  {
    value: 'dualProfileCut',
    label: 'Пакетный рез',
    explanation:
      'Объединение равных профилей в пакеты от 2 шт. для одновременной резки. Детали, не кратные размеру пакета N, автоматически раскраиваются по 1 профилю в конце (карты с меткой «одиночный»).',
  },
  {
    value: 'batchSizeN',
    label: 'Пакетный рез, шт.',
    explanation:
      'Число профилей, зажимаемых и раскраиваемых одновременно одним пакетом (от 2 до 10 шт.).',
  },
  {
    value: 'fillControl',
    label: 'Контроль заполнения',
    explanation:
      'Если чистый КИМ пакетной карты ниже указанного порога % (20–85%), алгоритм перераспределяет её по 1 профилю для дозаполнения и экономии материала.',
  },
];

export function getBatchHelp(key: BatchOptionKey): string {
  return BATCH_OPTIONS.find((item) => item.value === key)?.explanation ?? '';
}

export type ComparisonMetricKey =
  | 'cuttingIndex'
  | 'kim'
  | 'netKim'
  | 'maxReusable'
  | 'offcuts'
  | 'kerf'
  | 'waste';

export const COMPARISON_METRIC_OPTIONS: readonly HelpOptionItem<ComparisonMetricKey>[] = [
  {
    value: 'cuttingIndex',
    label: 'Индекс',
    explanation:
      'Шкала от 0 до 100: 100 соответствует идеалу (индекс 1,00), 0 соответствует индексу 0,90 и ниже. Учитывает использование материала (деловые остатки засчитываются тем полнее, чем они длиннее), число карт (наладок) и число разных длин заготовок.',
  },
  {
    value: 'kim',
    label: 'КИМ (вал.)',
    explanation: 'Валовый КИМ: учитывает суммарный выход готовых деталей и делового остатка.',
  },
  {
    value: 'netKim',
    label: 'Мгн. КИМ',
    explanation:
      'Мгновенный (чистый) КИМ: отношение длины готовых деталей к расходу материала без учета делового остатка.',
  },
  {
    value: 'maxReusable',
    label: 'Макс. остаток',
    explanation: 'Длина наибольшего цельного делового остатка среди всех карт.',
  },
  {
    value: 'offcuts',
    label: 'Обрезки',
    explanation: 'Торцовка края + неделовой концевой остаток.',
  },
  {
    value: 'kerf',
    label: 'Стружка',
    explanation: 'Потери металла на ширину реза пилы.',
  },
  {
    value: 'waste',
    label: 'Отходы всего',
    explanation: 'Обрезки + Стружка.',
  },
];

export function getComparisonMetricHelp(key: ComparisonMetricKey): string {
  const option = COMPARISON_METRIC_OPTIONS.find((item) => item.value === key);
  return option ? `${option.label} — ${option.explanation}` : '';
}

export function formatCuttingIndexRowTooltip(
  cuttingIndex: number,
  cuttingIndexMaterial: number,
  cuttingIndexSetup: number
): string {
  const base = getComparisonMetricHelp('cuttingIndex');
  const raw = cuttingIndex.toFixed(3).replace('.', ',');
  const mat = cuttingIndexMaterial.toFixed(3).replace('.', ',');
  const setup = cuttingIndexSetup.toFixed(3).replace('.', ',');
  return `${base}\nНе зависит от других строк таблицы. Для этой строки: сырой индекс ${raw} · материал ${mat} · наладки ${setup}`;
}

export function formatUnplacedDeficitTooltip(unplacedCount: number): string {
  return `Не все детали вошли в раскрой! Не разложено: ${unplacedCount} шт.`;
}
