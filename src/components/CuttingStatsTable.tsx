import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { FullOptimizationSolution, SolutionRow } from '../types/cutting';
import { getRowWasteBreakdown } from '../utils/wasteBreakdown';
import { getBatchRowSplit } from '../utils/cutting/metrics';
import { getComparisonMetricHelp } from '../constants/cuttingHelp';

interface CuttingStatsTableProps {
  solution: FullOptimizationSolution;
  groupSolutions?: boolean;
  selectedPieceLengths?: Set<number>;
  title?: string;
}

type StatsSortField =
  | 'barIndex'
  | 'barsCount'
  | 'barSize'
  | 'efficiency'
  | 'offcuts'
  | 'kerf'
  | 'waste'
  | 'reusable'
  | 'maxReusable';

type RemnantFilterMode = 'all' | 'with_reusable' | 'no_reusable' | 'with_offcuts';

export const CuttingStatsTable: React.FC<CuttingStatsTableProps> = ({
  solution,
  groupSolutions = true,
  selectedPieceLengths,
  title = 'Подробная статистика по картам раскроя (без графики)',
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [barSizeFilter, setBarSizeFilter] = useState<string>('all');
  const [remnantFilter, setRemnantFilter] = useState<RemnantFilterMode>('all');
  const [valueScope, setValueScope] = useState<'per_bar' | 'total_group'>('per_bar');
  const [sortField, setSortField] = useState<StatsSortField>('barIndex');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const baseRows = useMemo<SolutionRow[]>(() => {
    if (groupSolutions) return solution.rows;
    const expanded: SolutionRow[] = [];
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
  }, [solution.rows, groupSolutions]);

  const distinctBarSizes = useMemo(() => {
    const sizes = new Set<number>();
    baseRows.forEach((r) => sizes.add(r.barSize));
    return Array.from(sizes).sort((a, b) => b - a);
  }, [baseRows]);

  const enrichedRows = useMemo(() => {
    return baseRows.map((row) => {
      const wb = getRowWasteBreakdown(row);
      const mult = valueScope === 'total_group' ? row.barsCount : 1;
      const reusablePerBar = row.isReusable ? row.reusableRemnant || 0 : 0;

      return {
        row,
        offcutsPerBar: wb.offcutsMm,
        kerfPerBar: wb.kerfMm,
        wastePerBar: wb.totalWasteMm,
        reusablePerBar,
        trimPerBar: wb.trimMm,
        scrapPerBar: wb.scrapMm,
        offcutsDisplay: wb.offcutsMm * mult,
        kerfDisplay: wb.kerfMm * mult,
        wasteDisplay: wb.totalWasteMm * mult,
        reusableDisplay: reusablePerBar * mult,
        piecesText: row.pieces.map((p) => `${p.length}×${p.count}`).join(', '),
      };
    });
  }, [baseRows, valueScope]);

  const filteredAndSorted = useMemo(() => {
    let list = enrichedRows;

    if (selectedPieceLengths && selectedPieceLengths.size > 0) {
      list = list.filter((item) =>
        item.row.pieces.some((p) => selectedPieceLengths.has(p.length))
      );
    }

    if (barSizeFilter !== 'all') {
      const target = Number(barSizeFilter);
      list = list.filter((item) => item.row.barSize === target);
    }

    if (remnantFilter === 'with_reusable') {
      list = list.filter((item) => item.reusablePerBar > 0);
    } else if (remnantFilter === 'no_reusable') {
      list = list.filter((item) => item.reusablePerBar === 0);
    } else if (remnantFilter === 'with_offcuts') {
      list = list.filter((item) => item.offcutsPerBar > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const cardStr = `карта №${item.row.barIndex} ${item.row.barIndex}`;
        const sizeStr = `${item.row.barSize}`;
        const piecesStr = item.row.pieces
          .map((p) => `${p.length} ${p.mark || ''}`)
          .join(' ')
          .toLowerCase();
        return (
          cardStr.includes(q) ||
          sizeStr.includes(q) ||
          piecesStr.includes(q) ||
          item.row.formula.toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...list].sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case 'barIndex':
          diff = a.row.barIndex - b.row.barIndex;
          break;
        case 'barsCount':
          diff = a.row.barsCount - b.row.barsCount;
          break;
        case 'barSize':
          diff = a.row.barSize - b.row.barSize;
          break;
        case 'efficiency':
          diff = a.row.efficiency - b.row.efficiency;
          break;
        case 'offcuts':
          diff = a.offcutsDisplay - b.offcutsDisplay;
          break;
        case 'kerf':
          diff = a.kerfDisplay - b.kerfDisplay;
          break;
        case 'waste':
          diff = a.wasteDisplay - b.wasteDisplay;
          break;
        case 'reusable':
          diff = a.reusableDisplay - b.reusableDisplay;
          break;
        case 'maxReusable':
          diff = a.reusablePerBar - b.reusablePerBar;
          break;
      }
      if (diff === 0) {
        diff = a.row.barIndex - b.row.barIndex;
      }
      return sortDirection === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [
    enrichedRows,
    selectedPieceLengths,
    barSizeFilter,
    remnantFilter,
    searchQuery,
    sortField,
    sortDirection,
  ]);

  const totals = useMemo(() => {
    let totalBars = 0;
    let totalStockMm = 0;
    let totalSpentMm = 0;
    let totalReusableMm = 0;
    let totalOffcutsMm = 0;
    let totalKerfMm = 0;
    let totalWasteMm = 0;
    let maxReusableMm = 0;

    for (const item of filteredAndSorted) {
      const cnt = item.row.barsCount;
      totalBars += cnt;
      totalStockMm += item.row.barSize * cnt;
      totalSpentMm += item.row.spent * cnt;
      totalReusableMm += item.reusablePerBar * cnt;
      totalOffcutsMm += item.offcutsPerBar * cnt;
      totalKerfMm += item.kerfPerBar * cnt;
      totalWasteMm += item.wastePerBar * cnt;
      if (item.reusablePerBar > maxReusableMm) {
        maxReusableMm = item.reusablePerBar;
      }
    }

    const weightedKim =
      totalStockMm > 0 ? ((totalSpentMm + totalReusableMm) / totalStockMm) * 100 : 0;

    return {
      cardsCount: filteredAndSorted.length,
      totalBars,
      totalStockMm,
      totalReusableMm,
      totalOffcutsMm,
      totalKerfMm,
      totalWasteMm,
      maxReusableMm,
      weightedKim,
    };
  }, [filteredAndSorted]);

  const handleSortToggle = (field: StatsSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'barIndex' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (field: StatsSortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50 group-hover:opacity-100 shrink-0" />
      );
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600 shrink-0" />
    );
  };

  const hasActiveFilters =
    barSizeFilter !== 'all' || remnantFilter !== 'all' || searchQuery.trim() !== '';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">{title}</span>
          <span className="text-[11px] font-mono text-slate-500">
            ({filteredAndSorted.length} из {enrichedRows.length} карт)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Scope switch: per bar vs group total */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setValueScope('per_bar')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                valueScope === 'per_bar'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              На 1 профиль
            </button>
            <button
              type="button"
              onClick={() => setValueScope('total_group')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                valueScope === 'total_group'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Суммарно (× повторения)
            </button>
          </div>

          {/* Bar size filter */}
          {distinctBarSizes.length > 1 && (
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={barSizeFilter}
                onChange={(e) => setBarSizeFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-xs text-slate-700 px-2 py-1 font-medium cursor-pointer focus:outline-hidden focus:border-blue-500"
              >
                <option value="all">Все размеры ({distinctBarSizes.length})</option>
                {distinctBarSizes.map((sz) => (
                  <option key={sz} value={String(sz)}>
                    {sz.toLocaleString('ru-RU')} мм
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Remnant / waste filter */}
          <select
            value={remnantFilter}
            onChange={(e) => setRemnantFilter(e.target.value as RemnantFilterMode)}
            className="bg-white border border-slate-200 rounded-lg text-xs text-slate-700 px-2 py-1 font-medium cursor-pointer focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">Все остатки и отходы</option>
            <option value="with_reusable">С деловым остатком (&gt; 0)</option>
            <option value="no_reusable">Без делового остатка</option>
            <option value="with_offcuts">С обрезками (&gt; 0)</option>
          </select>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Длина детали или № карты..."
              className="w-44 sm:w-52 pl-7 pr-6 py-1 text-xs bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setBarSizeFilter('all');
                setRemnantFilter('all');
              }}
              title="Сбросить фильтры таблицы"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] select-none">
              <th
                onClick={() => handleSortToggle('barIndex')}
                className="py-2.5 px-3 text-left cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center gap-1">
                  <span>Карта</span>
                  {renderSortIcon('barIndex')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('barsCount')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Повторений</span>
                  {renderSortIcon('barsCount')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('barSize')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Размер (мм)</span>
                  {renderSortIcon('barSize')}
                </div>
              </th>

              <th className="py-2.5 px-3 text-left">Детали (длина × шт)</th>

              <th
                onClick={() => handleSortToggle('efficiency')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>КИМ (%)</span>
                  {renderSortIcon('efficiency')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('offcuts')}
                title={getComparisonMetricHelp('offcuts')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Обрезки (мм)</span>
                  {renderSortIcon('offcuts')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('kerf')}
                title={getComparisonMetricHelp('kerf')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Стружка (мм)</span>
                  {renderSortIcon('kerf')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('waste')}
                title={getComparisonMetricHelp('waste')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Отходы всего (мм)</span>
                  {renderSortIcon('waste')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('reusable')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Деловой (мм)</span>
                  {renderSortIcon('reusable')}
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('maxReusable')}
                title={getComparisonMetricHelp('maxReusable')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200 transition-colors group"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Макс. остаток (мм)</span>
                  {renderSortIcon('maxReusable')}
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredAndSorted.length > 0 ? (
              filteredAndSorted.map((item) => {
                const { row } = item;
                const kimClass =
                  row.efficiency >= 98
                    ? 'text-emerald-700 font-bold'
                    : row.efficiency >= 92
                    ? 'text-amber-700 font-bold'
                    : 'text-rose-600 font-bold';

                const batchSize = groupSolutions ? solution.batchInfo?.batchSize : undefined;
                const split =
                  batchSize && batchSize >= 2
                    ? getBatchRowSplit(row.barsCount, batchSize)
                    : null;
                const showSingleBadge = split
                  ? split.batchCount === 0
                  : Boolean(row.isTailSingle);

                return (
                  <tr key={row.id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>Карта №{row.barIndex}</span>
                        {showSingleBadge && (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 font-sans font-semibold px-1.5 py-0.2 rounded text-[10px]">
                            одиночный
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-3 text-right font-mono font-bold text-blue-700 tabular-nums">
                      {split && split.batchCount > 0 && split.singleCount > 0
                        ? `${row.barsCount} шт (${split.batchCount} пакетом + ${split.singleCount} одиночно)`
                        : `${row.barsCount} шт.`}
                    </td>

                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 tabular-nums">
                      {row.barSize.toLocaleString('ru-RU')}
                    </td>

                    <td
                      className="py-2 px-3 font-mono text-[11px] text-slate-600 max-w-xs truncate"
                      title={item.piecesText}
                    >
                      {item.piecesText}
                    </td>

                    <td className={`py-2 px-3 text-right font-mono tabular-nums ${kimClass}`}>
                      {row.efficiency.toFixed(1)}%
                    </td>

                    <td
                      title={`Торцовка: ${item.trimPerBar} мм + концевой обрезок: ${item.scrapPerBar} мм`}
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        item.offcutsDisplay > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {item.offcutsDisplay.toLocaleString('ru-RU')}
                    </td>

                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        item.kerfDisplay > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {item.kerfDisplay.toLocaleString('ru-RU')}
                    </td>

                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        item.wasteDisplay > 0 ? 'text-slate-900 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {item.wasteDisplay.toLocaleString('ru-RU')}
                    </td>

                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        item.reusableDisplay > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {item.reusableDisplay.toLocaleString('ru-RU')}
                    </td>

                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        item.reusablePerBar > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {item.reusablePerBar > 0 ? item.reusablePerBar.toLocaleString('ru-RU') : '—'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                  Нет карт, соответствующих выбранным фильтрам
                </td>
              </tr>
            )}
          </tbody>

          {filteredAndSorted.length > 0 && (
            <tfoot>
              <tr className="bg-slate-900 text-white font-mono text-[11px] font-bold">
                <td className="py-2.5 px-3 font-sans">
                  Итого ({totals.cardsCount} карт)
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-blue-300">
                  {totals.totalBars.toLocaleString('ru-RU')} шт.
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">
                  {(totals.totalStockMm / 1000).toFixed(2)} м
                </td>
                <td className="py-2.5 px-3 font-sans font-normal text-slate-400">
                  Суммы с учетом повторений карт
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-emerald-400">
                  {totals.weightedKim.toFixed(2)}%
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-rose-300">
                  {totals.totalOffcutsMm.toLocaleString('ru-RU')} мм
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                  {totals.totalKerfMm.toLocaleString('ru-RU')} мм
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-white">
                  {totals.totalWasteMm.toLocaleString('ru-RU')} мм
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-amber-300">
                  {totals.totalReusableMm.toLocaleString('ru-RU')} мм
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-amber-200">
                  {totals.maxReusableMm > 0 ? `${totals.maxReusableMm.toLocaleString('ru-RU')} мм` : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
