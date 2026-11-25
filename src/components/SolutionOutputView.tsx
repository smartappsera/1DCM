import React, { useState, useMemo, useEffect } from 'react';
import {
  FullOptimizationSolution,
  AppSettings,
  StockItem,
} from '../types/cutting';
import {
  Printer,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Table2,
  LayoutList,
  RotateCcw,
  Check,
} from 'lucide-react';
import { getPatternForLength } from '../utils/hatchPatterns';
import { getRowWasteBreakdown, getSolutionWasteBreakdown } from '../utils/wasteBreakdown';
import { getBatchRowSplit } from '../utils/cutting/metrics';
import { CuttingStatsTable } from './CuttingStatsTable';

interface SolutionOutputViewProps {
  solution: FullOptimizationSolution | null;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  stockInput: StockItem[];
  onApplySettings: (newSettings: AppSettings) => void;
  onExportExcel: () => void;
  onPrint: () => void;
}

export const SolutionOutputView: React.FC<SolutionOutputViewProps> = ({
  solution,
  settings,
  setSettings,
  onExportExcel,
  onPrint,
}) => {
  const [isFormulaHelpOpen, setIsFormulaHelpOpen] = useState(false);
  const [highContrastMono, setHighContrastMono] = useState(false);
  const [selectedLengths, setSelectedLengths] = useState<Set<number>>(() => new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const handleToggleGraphics = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, showGraphics: checked }));
  };

  const handleToggleGroupSolutions = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, groupSolutions: checked }));
  };

  // Scale graphics relative to the actual max stock bar size USED in the solution
  const maxStockLength = useMemo(() => {
    if (!solution || solution.rows.length === 0) return 6000;
    return Math.max(...solution.rows.map((r) => r.barSize), 1000);
  }, [solution]);

  // Extract all unique piece lengths to deterministically assign patterns / colors
  const allUniquePieces = useMemo(() => {
    if (!solution) return [];
    const map = new Map<number, { length: number; color: string; mark?: string }>();
    solution.rows.forEach((r) => {
      r.pieces.forEach((p) => {
        if (!map.has(p.length)) {
          map.set(p.length, { length: p.length, color: p.color, mark: p.mark });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.length - a.length);
  }, [solution]);

  const allUniqueLengths = useMemo(() => {
    return allUniquePieces.map((p) => p.length);
  }, [allUniquePieces]);

  // Prune selected legend filters when solution changes
  useEffect(() => {
    setSelectedLengths((prev) => {
      if (prev.size === 0) return prev;
      const available = new Set(allUniqueLengths);
      const next = new Set<number>();
      prev.forEach((len) => {
        if (available.has(len)) next.add(len);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [allUniqueLengths]);

  const toggleLegendLength = (length: number) => {
    setSelectedLengths((prev) => {
      const next = new Set(prev);
      if (next.has(length)) {
        next.delete(length);
      } else {
        next.add(length);
      }
      return next;
    });
  };

  // If groupSolutions is false, unroll rows so each individual bar is shown separately
  const displayedRows = useMemo(() => {
    if (!solution) return [];
    if (settings.groupSolutions !== false) {
      return solution.rows;
    }
    const expanded: typeof solution.rows = [];
    let barNum = 1;
    solution.rows.forEach((r) => {
      for (let i = 0; i < r.barsCount; i++) {
        expanded.push({
          ...r,
          id: `${r.id}_single_${i + 1}`,
          barIndex: barNum++,
          barsCount: 1,
          formula: r.formula.replace(/^\d+х\{/, '1х{'),
        });
      }
    });
    return expanded;
  }, [solution, settings.groupSolutions]);

  // Apply multi-select legend filter
  const filteredRows = useMemo(() => {
    if (selectedLengths.size === 0) return displayedRows;
    return displayedRows.filter((row) =>
      row.pieces.some((p) => selectedLengths.has(p.length))
    );
  }, [displayedRows, selectedLengths]);

  const wasteBreakdown = useMemo(
    () => getSolutionWasteBreakdown(solution),
    [solution]
  );

  if (!solution || solution.rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-800">Решение еще не рассчитано</h3>
        <p className="text-xs text-slate-500 mt-1">
          Перейдите во вкладку «Спецификация и склад» и нажмите кнопку «Рассчитать раскрой».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. ИТОГИ РАСКРОЯ - Непрокручиваемый (sticky) блок прямо под шапкой на всю ширину до правого края */}
      <div className="sticky -top-4 sm:-top-6 lg:-top-8 z-20 bg-slate-100/95 backdrop-blur-xs pt-1 pb-2">
        <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 shadow-md border border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-black tracking-tight text-white uppercase">
                Итоги раскроя
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Карт раскроя:{' '}
                <strong className="text-slate-200">
                  {selectedLengths.size > 0
                    ? `${filteredRows.length} из ${displayedRows.length}`
                    : displayedRows.length}
                </strong>
              </span>
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. КИМ */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <span className="text-slate-400 block text-[11px] mb-1">
                1. КИМ:
              </span>
              <div className="flex items-baseline gap-2">
                <strong className="font-mono text-xl font-black text-emerald-400 tabular-nums">
                  {solution.overallKIM.toFixed(2).replace('.', ',')}%
                </strong>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  ({solution.totalBarsUsed} проф.)
                </span>
              </div>
            </div>

            {/* 2. Суммарная длина материала */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <span className="text-slate-400 block text-[11px] mb-1">
                2. Суммарная длина материала:
              </span>
              <strong className="font-mono text-base text-blue-400 tabular-nums">
                {solution.totalStockLength.toLocaleString('ru-RU')}{' '}
                <span className="text-xs font-normal text-slate-400">мм</span>
              </strong>
              <span className="text-[10px] text-slate-400 block font-mono tabular-nums">
                ({(solution.totalStockLength / 1000).toFixed(2)} м)
              </span>
            </div>

            {/* 3. Деловой отход */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <span className="text-slate-400 block text-[11px] mb-1">
                3. Деловой остаток:
              </span>
              <strong className="font-mono text-base text-amber-400 tabular-nums">
                {solution.totalReusableLength.toLocaleString('ru-RU')}{' '}
                <span className="text-xs font-normal text-slate-400">мм</span>
              </strong>
              <span className="text-[10px] text-slate-400 block font-mono tabular-nums">
                ({(solution.totalReusableLength / 1000).toFixed(2)} м)
              </span>
            </div>

            {/* 4. Отход: Обрезки + Стружка */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <span className="text-slate-400 block text-[11px] mb-1">
                4. Отходы (обрезки + стружка):
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <strong className="font-mono text-base text-rose-400 tabular-nums">
                  {wasteBreakdown.totalWasteMm.toLocaleString('ru-RU')}{' '}
                  <span className="text-xs font-normal text-slate-400">мм</span>
                </strong>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  ({(wasteBreakdown.totalWasteMm / 1000).toFixed(2)} м)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono mt-1 tabular-nums">
                <span className="text-rose-300">
                  Обрезки: <strong>{wasteBreakdown.offcutsMm.toLocaleString('ru-RU')} мм</strong>{' '}
                  <span className="text-slate-400">({(wasteBreakdown.offcutsMm / 1000).toFixed(2)} м)</span>
                </span>
                <span className="text-slate-300">
                  Стружка: <strong>{wasteBreakdown.kerfMm.toLocaleString('ru-RU')} мм</strong>{' '}
                  <span className="text-slate-400">({(wasteBreakdown.kerfMm / 1000).toFixed(2)} м)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Общий блок: Настройки отображения, легенда и пояснения - сразу за ИТОГАМИ */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        {/* Upper section: Настройки отображения + Режим просмотра + Кнопки действий */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
            {/* View Mode Toggle: Карты | Таблица (без графики) */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Карты</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Таблица (без графики)</span>
              </button>
            </div>

            {viewMode === 'cards' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showGraphics !== false}
                  onChange={(e) => handleToggleGraphics(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
                <span className="font-semibold text-slate-800">Отображать графику</span>
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.groupSolutions !== false}
                onChange={(e) => handleToggleGroupSolutions(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />
              <span>Группировать решение</span>
            </label>

            {viewMode === 'cards' && (
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                <input
                  type="checkbox"
                  checked={highContrastMono}
                  onChange={(e) => setHighContrastMono(e.target.checked)}
                  className="w-4 h-4 rounded text-slate-900 cursor-pointer"
                />
                <span className="text-[11px] font-semibold text-slate-900">
                  Для Ч/Б печати (штриховка)
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Печать</span>
            </button>
          </div>
        </div>

        {/* Lower section: Интерактивная легенда цветов / штриховок (множественный выбор) + Сворачиваемая расшифровка формулы */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* B&W Hatch Pattern Legend */}
          {highContrastMono && allUniqueLengths.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Фильтр по деталям (Ч/Б):
              </span>
              {allUniqueLengths.map((len) => {
                const pat = getPatternForLength(len, allUniqueLengths);
                const isSelected = selectedLengths.has(len);
                const isDimmed = selectedLengths.size > 0 && !isSelected;

                return (
                  <button
                    key={len}
                    type="button"
                    onClick={() => toggleLegendLength(len)}
                    aria-pressed={isSelected}
                    title={
                      isSelected
                        ? `Убрать деталь ${len} мм из фильтра`
                        : `Показать карты с деталью ${len} мм`
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/30 text-blue-950 shadow-2xs'
                        : isDimmed
                        ? 'bg-slate-50 border-slate-200 opacity-50 hover:opacity-100'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-400 hover:bg-white'
                    }`}
                  >
                    <span
                      style={{ ...pat.style, width: '26px', height: '14px' }}
                      className="border border-slate-700 rounded-2xs inline-block shrink-0 shadow-2xs"
                    />
                    <span className="font-mono font-bold text-slate-900">{len} мм</span>
                    <span className="text-[10px] text-slate-500 font-mono">({pat.shortSymbol})</span>
                    {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                  </button>
                );
              })}

              {selectedLengths.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLengths(new Set())}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сбросить ({selectedLengths.size})</span>
                </button>
              )}
            </div>
          )}

          {/* Color Legend (Interactive Multi-Select Filter) */}
          {!highContrastMono && allUniquePieces.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="text-[11px] font-bold text-slate-700 uppercase tracking-wider"
                title="Нажмите на деталь, чтобы скрыть карты без нее. Поддерживается выбор нескольких деталей."
              >
                Детали (фильтр):
              </span>
              {allUniquePieces.map((piece) => {
                const isSelected = selectedLengths.has(piece.length);
                const isDimmed = selectedLengths.size > 0 && !isSelected;

                return (
                  <button
                    key={piece.length}
                    type="button"
                    onClick={() => toggleLegendLength(piece.length)}
                    aria-pressed={isSelected}
                    title={
                      isSelected
                        ? `Убрать деталь ${piece.length} мм из фильтра`
                        : `Показать карты с деталью ${piece.length} мм`
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/30 text-blue-950 shadow-2xs'
                        : isDimmed
                        ? 'bg-slate-50 border-slate-200 opacity-50 hover:opacity-100'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-400 hover:bg-white'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: piece.color }}
                      className="w-4 h-3.5 border border-slate-400 rounded-2xs inline-block shrink-0 shadow-2xs"
                    />
                    <span className="font-mono font-bold text-slate-900">{piece.length} мм</span>
                    {piece.mark && (
                      <span className="text-[10px] text-blue-700 font-semibold font-mono">
                        ({piece.mark})
                      </span>
                    )}
                    {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                  </button>
                );
              })}

              {selectedLengths.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLengths(new Set())}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сбросить ({selectedLengths.size})</span>
                </button>
              )}
            </div>
          )}

          {/* Spoiler toggle button for formula explanation */}
          <button
            type="button"
            onClick={() => setIsFormulaHelpOpen(!isFormulaHelpOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors ml-auto cursor-pointer whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Расшифровка формулы раскроя</span>
            {isFormulaHelpOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Collapsible formula explanation panel */}
        {isFormulaHelpOpen && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 animate-in fade-in duration-150">
            <div className="font-bold text-slate-900 text-xs flex flex-wrap items-center gap-2">
              <span>Принцип формирования формулы:</span>
              <span className="font-mono bg-white px-2.5 py-1 rounded border border-blue-300 text-blue-900 font-bold shadow-2xs">
                20х&#123;[10] + &lt;800х7 + 150х2&gt; + !&lt;&gt; + (3х11+57)&#125;=6000
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] text-slate-700 pt-1">
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">20х&#123;...&#125;</strong>
                Количество одинаковых заготовок (профилей) по данной карте раскроя.
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">[10] или []</strong>
                В квадратных скобках — размер торцовки (кромки). Если торцовка не задана, указывается <code>[]</code>.
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">&lt;800х7 + 150х2&gt;</strong>
                В треугольных скобках — получаемые детали с количеством (длина × шт).
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">!&lt;1200&gt; или !&lt;&gt;</strong>
                Размер делового остатка со знаком <code>!</code>. Если делового остатка нет, пишется <code>!&lt;&gt;</code>.
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">(3х11+57)</strong>
                В круглых скобках — отходы: стружка (ширина реза × количество резов) + концевой обрезок.
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <strong className="font-mono text-blue-700 block mb-0.5">=6000</strong>
                Номинальная длина исходной заготовки со склада в миллиметрах.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Сводка пакетного раскроя */}
      {solution.batchInfo && (() => {
        const { batchSize, batchBarsUsed, tailBarsUsed, nonMultipleDetails } = solution.batchInfo;
        const packagesCount = Math.floor(batchBarsUsed / batchSize);
        return (
          <div className="bg-blue-50/90 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-950 flex items-center gap-2 shadow-2xs">
            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              {tailBarsUsed > 0 || nonMultipleDetails.length > 0 ? (
                <>
                  <strong>Пакетный рез по {batchSize}:</strong>{' '}
                  {batchBarsUsed} заготовок пакетом ({packagesCount} пакетов), {tailBarsUsed} одиночно
                  {nonMultipleDetails.length > 0 && (
                    <>
                      {' '}
                      (детали с количеством, не кратным {batchSize}:{' '}
                      {nonMultipleDetails
                        .map((d) => `${d.length} мм — ${d.quantity} шт. (хвост ${d.tailQuantity})`)
                        .join(', ')}
                      )
                    </>
                  )}
                </>
              ) : (
                <>
                  <strong>Пакетный рез по {batchSize}:</strong> все заготовки пакетом ({batchBarsUsed} заготовок, {packagesCount} пакетов)
                </>
              )}
            </span>
          </div>
        );
      })()}

      {/* 3. ТАБЛИЦА СТАТИСТИКИ (без графики) ИЛИ ДЕТАЛИЗИРОВАННЫЕ КАРТЫ РАСКРОЯ */}
      {viewMode === 'table' ? (
        <CuttingStatsTable
          solution={solution}
          groupSolutions={settings.groupSolutions !== false}
          selectedPieceLengths={selectedLengths}
        />
      ) : (
        <div className="space-y-4">
          {filteredRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
              <p className="text-xs text-slate-600 font-medium">
                Нет карт раскроя, содержащих выбранные детали.
              </p>
              <button
                type="button"
                onClick={() => setSelectedLengths(new Set())}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить фильтр</span>
              </button>
            </div>
          ) : (
            filteredRows.map((row) => {
              // Proportional width relative to maximum stock length from «Есть»
              const barWidthPercent = (row.barSize / maxStockLength) * 100;
              const wb = getRowWasteBreakdown(row);

              // Visual bar graphic stretching to full available width of row 2
              const renderGraphicBar = () => (
                <div
                  style={{ width: `${barWidthPercent}%` }}
                  className="min-w-[280px] max-w-full"
                >
                  <div
                    className={`h-11 rounded-lg overflow-hidden flex items-stretch border relative shadow-inner w-full ${
                      highContrastMono
                        ? 'border-2 border-black bg-white'
                        : 'border-slate-400 bg-slate-100'
                    }`}
                  >
                    {/* Trim start with black fill and 10px solid border */}
                    {settings.edgeTrim > 0 && (
                      <div
                        style={{ width: `${Math.max(1.5, (settings.edgeTrim / row.barSize) * 100)}%` }}
                        title={`Кромка/торцовка (обрезок): ${settings.edgeTrim} мм`}
                        className="bg-black text-white border-r-[10px] border-black flex items-center justify-center text-[10px] font-mono font-bold select-none shrink-0 min-w-[16px]"
                      >
                        Т
                      </div>
                    )}

                    {/* Pieces on bar with BOLD DASHED line separator (kerf cut) */}
                    {(() => {
                      const hasRemainder = ((row.reusableRemnant || 0) + (row.scrapRemnant || 0)) > 0;
                      const totalPartsLen = row.layoutItems
                        .filter((item) => !item.isTrim && !item.isWaste)
                        .reduce((sum, item) => sum + item.length, 0);
                      const scaleFactor =
                        !hasRemainder && totalPartsLen > 0
                          ? (row.barSize - (settings.edgeTrim || 0)) / totalPartsLen
                          : 1;

                      return row.layoutItems
                        .filter((item) => !item.isTrim && !item.isWaste)
                        .map((item) => {
                          const pieceWidthPercent = ((item.length * scaleFactor) / row.barSize) * 100;
                          const hatchPattern = getPatternForLength(item.length, allUniqueLengths);

                          const pieceStyle: React.CSSProperties = highContrastMono
                            ? {
                                width: `${pieceWidthPercent}%`,
                                ...hatchPattern.style,
                              }
                            : {
                                width: `${pieceWidthPercent}%`,
                                backgroundColor: item.color,
                              };

                          const borderStyle = highContrastMono
                            ? 'border-r-[2.5px] border-dashed border-black'
                            : 'border-r-[2px] border-dashed border-slate-900';

                          return (
                            <div
                              key={item.id}
                              style={pieceStyle}
                              title={`Деталь: ${item.length} мм ${
                                highContrastMono ? `(${hatchPattern.name})` : ''
                              }`}
                              className={`h-full flex items-center justify-center font-mono font-bold select-none transition-transform hover:brightness-105 px-0.5 shrink-0 ${borderStyle}`}
                            >
                              {pieceWidthPercent > 3.5 && (
                                <span
                                  className={
                                    highContrastMono
                                      ? 'bg-white/95 text-black px-1 py-0.2 rounded border border-black text-[11px] font-mono font-black shadow-xs'
                                      : 'text-slate-950 font-bold text-xs truncate drop-shadow-2xs'
                                  }
                                >
                                  {item.length}
                                </span>
                              )}
                            </div>
                          );
                        });
                    })()}

                    {/* Waste / Remnant stretches to 100% of the bar with flex-1 */}
                    {((row.reusableRemnant || 0) + (row.scrapRemnant || 0)) > 0 && (
                      <div
                        title={`${
                          row.isReusable ? 'Деловой остаток' : 'Неделовой обрезок'
                        }: ${row.isReusable ? row.reusableRemnant : row.scrapRemnant} мм`}
                        className={`h-full flex-1 flex items-center justify-center font-mono font-bold text-xs select-none px-2 min-w-[20px] truncate ${
                          row.isReusable
                            ? highContrastMono
                              ? 'bg-white border-2 border-dashed border-black text-black font-black'
                              : 'bg-amber-100 text-amber-900 border-l-2 border-amber-400'
                            : highContrastMono
                            ? 'bg-slate-300 text-slate-800 border-l border-black'
                            : 'bg-slate-200 text-slate-600 border-l border-slate-400'
                        }`}
                      >
                        {((row.reusableRemnant || 0) + (row.scrapRemnant || 0)) >= 10 && (
                          <span className="truncate">
                            {row.isReusable
                              ? `${row.reusableRemnant} (Ост)`
                              : `${row.scrapRemnant} (Обр)`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dimension scale label below bar */}
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1 px-1">
                    <span className="font-semibold text-slate-600">0 мм</span>
                    <span>{row.barSize} мм</span>
                  </div>
                </div>
              );

              return (
                <div
                  key={row.id}
                  className="bg-white rounded-xl border border-slate-300 p-4 shadow-2xs hover:border-slate-400 transition-colors break-inside-avoid space-y-3"
                >
                  {/* ROW 1: Badges on left, ДЕЛОВОЙ and ОБРЕЗКИ / СТРУЖКА at the far right end */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    {/* Left section: Карта №, Количество, Длина, КИМ, Математическая запись */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-slate-900 text-white font-mono font-bold px-2 py-0.5 rounded text-xs">
                        Карта №{row.barIndex}
                      </span>
                      {(() => {
                        const batchSize =
                          settings.groupSolutions !== false
                            ? solution.batchInfo?.batchSize
                            : undefined;
                        const split =
                          batchSize && batchSize >= 2
                            ? getBatchRowSplit(row.barsCount, batchSize)
                            : null;
                        const showSingleBadge = split
                          ? split.batchCount === 0
                          : Boolean(row.isTailSingle);
                        return (
                          <>
                            <span className="bg-blue-100 text-blue-900 font-mono font-bold px-2 py-0.5 rounded text-xs">
                              {split && split.batchCount > 0 && split.singleCount > 0
                                ? `${row.barsCount} шт (${split.batchCount} пакетом + ${split.singleCount} одиночно)`
                                : `${row.barsCount} шт.`}
                            </span>
                            {showSingleBadge && (
                              <span className="bg-amber-100 text-amber-900 border border-amber-300 font-semibold px-2 py-0.5 rounded text-[11px]">
                                одиночный
                              </span>
                            )}
                          </>
                        );
                      })()}
                      <span className="text-slate-400">·</span>
                      <span className="font-bold text-slate-800 font-mono text-xs">
                        {row.barSize} мм
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 text-xs">
                        КИМ:{' '}
                        <strong className="text-blue-700 font-mono font-bold">
                          {row.efficiency}%
                        </strong>
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded">
                        {row.formula}
                      </span>
                    </div>

                    {/* Right section (end of row): ДЕЛОВОЙ, ОБРЕЗКИ, СТРУЖКА */}
                    <div className="flex flex-wrap items-center gap-1.5 ml-auto shrink-0">
                      {/* Деловой остаток */}
                      <span
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded tabular-nums ${
                          row.isReusable && (row.reusableRemnant || 0) > 0
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        Деловой: {row.isReusable && row.reusableRemnant ? `${row.reusableRemnant} мм` : '0 мм'}
                      </span>

                      {/* Обрезки (торцовка + неделовой остаток) */}
                      <span
                        title={`Обрезки = торцовка (${wb.trimMm} мм) + концевой остаток (${wb.scrapMm} мм). Всего отход с резом: ${wb.totalWasteMm} мм`}
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded tabular-nums ${
                          wb.offcutsMm > 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        Обрезки: {wb.offcutsMm} мм
                      </span>

                      {/* Стружка (потери на рез) */}
                      <span
                        title={`Стружка (потери металла на ширину пропила). Всего отход: ${wb.totalWasteMm} мм`}
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded tabular-nums ${
                          wb.kerfMm > 0
                            ? 'bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        Стружка: {wb.kerfMm} мм
                      </span>
                    </div>
                  </div>

                  {/* ROW 2: Proportional Graphic Bar across full width */}
                  {settings.showGraphics !== false && (
                    <div className="pt-1">{renderGraphicBar()}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

