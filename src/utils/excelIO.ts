import * as XLSX from 'xlsx';
import {
  CuttingOptimizationResult,
  CuttingParams,
  PartDemand,
  StockBar,
} from '../types/cutting';

/**
 * Export full optimization results into a well-structured multi-sheet Excel file (.xlsx)
 */
export function exportResultsToExcel(
  result: CuttingOptimizationResult,
  demands: PartDemand[],
  stocks: StockBar[],
  params: CuttingParams
) {
  const wb = XLSX.utils.book_new();

  // 1. Сводная ведомость
  const summaryData = [
    ['ОТЧЕТ ПО ОПТИМИЗАЦИИ ЛИНЕЙНОГО РАСКРОЯ'],
    ['Дата расчета', new Date().toLocaleString('ru-RU')],
    ['Проект / Заказ', params.projectName || 'Без названия'],
    ['Материал / Профиль', params.materialName || 'Труба/Профиль'],
    ['Ширина пропила (керф), мм', params.bladeWidth],
    ['Торцовка (начало/конец), мм', `${params.trimStart} / ${params.trimEnd}`],
    ['Мин. деловой остаток, мм', params.minReusableLength],
    [],
    ['ИТОГОВЫЕ ПОКАЗАТЕЛИ'],
    ['Коэффициент использования материала (КИМ)', `${result.overallEfficiencyPercent}%`],
    ['Всего израсходовано заготовок (шт)', result.totalStockBarsUsed],
    ['Общая длина заготовок со склада, мм', result.totalStockLengthUsed],
    ['Полезная длина готовых деталей, мм', result.totalPartsLength],
    ['Стружка и технологический пропил, мм', result.totalKerfLoss],
    ['Деловой остаток (на склад), мм', result.totalReusableLength],
    ['Невозвратные отходы (лом), мм', result.totalScrapLength],
    ['Время расчета алгоритма, мс', `${result.calculationTimeMs} мс`],
    ['Использованный алгоритм', result.algorithmName],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка');

  // 2. Карты раскроя по хлыстам
  const cuttingMapsData: (string | number)[][] = [
    [
      '№ Карты',
      'Кол-во хлыстов',
      'Заготовка (мм)',
      'Торцовка 1',
      'Список деталей (Марка: Длина мм)',
      'Кол-во резов',
      'Потери на рез (мм)',
      'Остаток (мм)',
      'Тип остатка',
      'КИМ хлыста (%)',
    ],
  ];

  result.patterns.forEach((pattern) => {
    const piecesStr = pattern.cuts
      .map((c) => `${c.mark} (${c.length} мм)`)
      .join(' + ');

    cuttingMapsData.push([
      pattern.patternIndex,
      pattern.count,
      pattern.stockLength,
      pattern.trimStart,
      piecesStr,
      pattern.cuts.length,
      pattern.totalKerfLength,
      pattern.wasteLength,
      pattern.isReusableWaste ? 'Деловой остаток' : 'Лом / Отход',
      `${pattern.efficiencyPercent}%`,
    ]);
  });

  const wsCutting = XLSX.utils.aoa_to_sheet(cuttingMapsData);
  XLSX.utils.book_append_sheet(wb, wsCutting, 'Карты раскроя');

  // 3. Спецификация деталей (факт / план)
  const partsData: (string | number)[][] = [
    ['Марка / Позиция', 'Длина детали, мм', 'Требуется, шт', 'Раскроено, шт', 'Статус', 'Примечания'],
  ];

  demands.forEach((d) => {
    const unfulfilled = result.unfulfilledDemand.find((u) => u.partId === d.id);
    const fulfilled = unfulfilled ? unfulfilled.fulfilled : d.quantity;
    const status = fulfilled >= d.quantity ? 'Выполнено' : `Нехватка ${d.quantity - fulfilled} шт`;

    partsData.push([d.mark, d.length, d.quantity, fulfilled, status, d.notes || '']);
  });

  const wsParts = XLSX.utils.aoa_to_sheet(partsData);
  XLSX.utils.book_append_sheet(wb, wsParts, 'Спецификация');

  // 4. Оприходование деловых остатков
  const remnantsData: (string | number)[][] = [
    ['№ Хлыста', 'Длина делового остатка, мм', 'Количество, шт', 'Рекомендуемое назначение'],
  ];

  result.patterns
    .filter((p) => p.isReusableWaste && p.wasteLength > 0)
    .forEach((p) => {
      remnantsData.push([
        `Карта №${p.patternIndex}`,
        p.wasteLength,
        p.count,
        'Возврат на склад (деловой остаток)',
      ]);
    });

  const wsRemnants = XLSX.utils.aoa_to_sheet(remnantsData);
  XLSX.utils.book_append_sheet(wb, wsRemnants, 'Деловые остатки');

  // Save file
  const filename = `Раскрой_${params.projectName.replace(/\s+/g, '_') || 'Проект'}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Parse clipboard text copied from Excel (tab-separated or semicolon-separated)
 */
export function parseExcelClipboardText(text: string): {
  mark: string;
  length: number;
  quantity: number;
  notes?: string;
}[] {
  const lines = text.trim().split(/\r?\n/);
  const parsedItems: {
    mark: string;
    length: number;
    quantity: number;
    notes?: string;
  }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Split by tab or semicolon or comma
    const cols = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
      ? line.split(';')
      : line.split(/[,|]/);

    const cleanCols = cols.map((c) => c.trim().replace(/"/g, ''));
    if (cleanCols.length === 0) continue;

    // Detect if column contains numbers
    // Possibility 1: Mark, Length, Quantity, Notes
    // Possibility 2: Length, Quantity, Mark
    let length = 0;
    let qty = 1;
    let mark = '';
    let notes = '';

    const num1 = parseFloat(cleanCols[0]?.replace(',', '.'));
    const num2 = parseFloat(cleanCols[1]?.replace(',', '.'));
    const num3 = parseFloat(cleanCols[2]?.replace(',', '.'));

    if (isNaN(num1)) {
      // First column is Mark
      mark = cleanCols[0];
      length = !isNaN(num2) ? num2 : 0;
      qty = !isNaN(num3) && num3 > 0 ? num3 : 1;
      notes = cleanCols[3] || '';
    } else {
      // First column is length
      length = num1;
      qty = !isNaN(num2) && num2 > 0 ? num2 : 1;
      mark = cleanCols[2] || `Деталь_${parsedItems.length + 1}`;
      notes = cleanCols[3] || '';
    }

    if (length > 0) {
      parsedItems.push({
        mark: mark || `Поз.${parsedItems.length + 1}`,
        length,
        quantity: Math.max(1, Math.round(qty)),
        notes,
      });
    }
  }

  return parsedItems;
}
