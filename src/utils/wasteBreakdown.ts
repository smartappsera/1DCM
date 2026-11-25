import { FullOptimizationSolution, SolutionRow } from '../types/cutting';

export interface WasteBreakdown {
  /** Обрезки: торцовка + неделовой концевой остаток (мм) */
  offcutsMm: number;
  /** Стружка: потери на ширину пропила/реза (мм) */
  kerfMm: number;
  /** Суммарный невозвратный отход: обрезки + стружка (мм) */
  totalWasteMm: number;
  /** Торцовка края (мм) */
  trimMm: number;
  /** Неделовой концевой обрезок (мм) */
  scrapMm: number;
}

/**
 * Разделение отходов одной карты (на 1 хлыст) на обрезки и стружку.
 */
export function getRowWasteBreakdown(row: SolutionRow): WasteBreakdown {
  const kerfMm = Math.max(0, row.kerfLoss ?? 0);
  const trimMm = Math.max(0, row.trimLoss ?? 0);
  const scrapMm = Math.max(
    0,
    row.scrapRemnant ?? Math.max(0, (row.waste ?? 0) - kerfMm - trimMm)
  );
  const offcutsMm = trimMm + scrapMm;
  const totalWasteMm = row.waste > 0 ? row.waste : offcutsMm + kerfMm;

  return {
    offcutsMm,
    kerfMm,
    totalWasteMm,
    trimMm,
    scrapMm,
  };
}

/**
 * Суммарное разделение отходов по всему решению с учетом количества повторений карт.
 */
export function getSolutionWasteBreakdown(
  solution: FullOptimizationSolution | null | undefined
): WasteBreakdown {
  if (!solution || !solution.rows || solution.rows.length === 0) {
    const fallbackTotal = solution?.totalWasteLength ?? 0;
    return {
      offcutsMm: fallbackTotal,
      kerfMm: 0,
      totalWasteMm: fallbackTotal,
      trimMm: 0,
      scrapMm: fallbackTotal,
    };
  }

  let offcutsMm = 0;
  let kerfMm = 0;
  let trimMm = 0;
  let scrapMm = 0;

  for (const row of solution.rows) {
    const cnt = row.barsCount || 1;
    const rowBreakdown = getRowWasteBreakdown(row);
    offcutsMm += rowBreakdown.offcutsMm * cnt;
    kerfMm += rowBreakdown.kerfMm * cnt;
    trimMm += rowBreakdown.trimMm * cnt;
    scrapMm += rowBreakdown.scrapMm * cnt;
  }

  const computedTotal = offcutsMm + kerfMm;
  if (computedTotal === 0 && (solution.totalWasteLength || 0) > 0) {
    return {
      offcutsMm: solution.totalWasteLength,
      kerfMm: 0,
      totalWasteMm: solution.totalWasteLength,
      trimMm: 0,
      scrapMm: solution.totalWasteLength,
    };
  }

  return {
    offcutsMm,
    kerfMm,
    totalWasteMm: computedTotal,
    trimMm,
    scrapMm,
  };
}
