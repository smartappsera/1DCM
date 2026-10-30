import React, { useState } from 'react';
import {
  CuttingOptimizationResult,
  BarCuttingPattern,
  CutPiece,
} from '../types/cutting';
import {
  Layers,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Search,
  Maximize2,
  Filter,
} from 'lucide-react';

interface CuttingVisualizerProps {
  result: CuttingOptimizationResult | null;
  onSelectTab: (tab: 'workspace' | 'visualizer' | 'reports' | 'vba') => void;
}

export const CuttingVisualizer: React.FC<CuttingVisualizerProps> = ({
  result,
  onSelectTab,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredPiece, setHoveredPiece] = useState<CutPiece | null>(null);

  if (!result || result.patterns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="max-w-md mx-auto space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-800">
            Карты раскроя еще не сформированы
          </h3>
          <p className="text-xs text-slate-500">
            Заполните спецификацию деталей и складские заготовки, затем нажмите кнопку «Рассчитать раскрой».
          </p>
          <button
            onClick={() => onSelectTab('workspace')}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Перейти к спецификации
          </button>
        </div>
      </div>
    );
  }

  // Filter patterns by search term
  const filteredPatterns = result.patterns.filter((p) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.stockName.toLowerCase().includes(term) ||
      p.cuts.some((c) => c.mark.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* КИМ */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            КИМ (КПД)
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
            {result.overallEfficiencyPercent}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">полезный выход</div>
        </div>

        {/* Всего хлыстов */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Заготовок
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {result.totalStockBarsUsed} <span className="text-sm font-normal text-slate-500">шт</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            {(result.totalStockLengthUsed / 1000).toFixed(1)} м со склада
          </div>
        </div>

        {/* Полезная длина */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Готовые детали
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {(result.totalPartsLength / 1000).toFixed(1)}{' '}
            <span className="text-sm font-normal text-slate-500">м</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {result.patterns.reduce((acc, p) => acc + p.cuts.length * p.count, 0)} деталей
          </div>
        </div>

        {/* Деловой остаток */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Деловой остаток
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
            {(result.totalReusableLength / 1000).toFixed(1)}{' '}
            <span className="text-sm font-normal text-slate-500">м</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">возврат на склад</div>
        </div>

        {/* Потери на рез (керф) */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Пропилы пилы
          </div>
          <div className="text-2xl font-bold font-mono text-slate-700 mt-1">
            {(result.totalKerfLoss / 1000).toFixed(2)}{' '}
            <span className="text-sm font-normal text-slate-500">м</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">стружка диска</div>
        </div>

        {/* Невозвратный лом */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Отходы (лом)
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 mt-1">
            {(result.totalScrapLength / 1000).toFixed(2)}{' '}
            <span className="text-sm font-normal text-slate-500">м</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">обрезки и торцовка</div>
        </div>
      </div>

      {/* Warnings if unfulfilled */}
      {result.unfulfilledDemand.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <span className="font-semibold">Внимание: Складских заготовок не хватило на полный раскрой!</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {result.unfulfilledDemand.map((u) => (
                <span
                  key={u.partId}
                  className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono"
                >
                  {u.mark}: не хватает {u.missing} шт из {u.requested} (длина {u.length} мм)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Control strip: search / filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск детали или хлыста..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-hidden w-60"
          />
        </div>

        <div className="text-xs text-slate-500">
          Показано карт: <span className="font-semibold text-slate-800">{filteredPatterns.length}</span> из{' '}
          {result.patterns.length}
        </div>
      </div>

      {/* Patterns Cutting Diagrams */}
      <div className="space-y-4">
        {filteredPatterns.map((pattern) => {
          const totalStockLen = pattern.stockLength;
          return (
            <div
              key={pattern.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-colors"
            >
              {/* Pattern Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 text-white text-xs font-bold px-2 py-0.5 rounded font-mono">
                    Карта №{pattern.patternIndex}
                  </span>
                  <span className="text-xs font-semibold text-slate-800">
                    {pattern.stockName} ({pattern.stockLength} мм)
                  </span>
                  <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full font-mono">
                    × {pattern.count} {pattern.count === 1 ? 'хлыст' : pattern.count < 5 ? 'хлыста' : 'хлыстов'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">
                    КИМ хлыста:{' '}
                    <strong className="text-slate-800 font-mono">{pattern.efficiencyPercent}%</strong>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">
                    Остаток:{' '}
                    <strong
                      className={`font-mono ${
                        pattern.isReusableWaste ? 'text-amber-600' : 'text-slate-600'
                      }`}
                    >
                      {pattern.wasteLength} мм
                    </strong>{' '}
                    ({pattern.isReusableWaste ? 'Деловой' : 'Лом'})
                  </span>
                </div>
              </div>

              {/* Graphical Cutting Bar (SVG) */}
              <div className="relative mb-3">
                <div className="w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-300 h-11 relative flex">
                  {/* Trim Start */}
                  {pattern.trimStart > 0 && (
                    <div
                      style={{ width: `${(pattern.trimStart / totalStockLen) * 100}%` }}
                      title={`Торцовка начала: ${pattern.trimStart} мм`}
                      className="h-full bg-slate-300 border-r border-slate-400 flex items-center justify-center text-[10px] text-slate-600 font-mono select-none overflow-hidden"
                    >
                      Т
                    </div>
                  )}

                  {/* Pieces and kerfs */}
                  {pattern.cuts.map((cut, idx) => {
                    const widthPercent = (cut.length / totalStockLen) * 100;
                    const kerfPercent = (pattern.bladeWidth / totalStockLen) * 100;

                    return (
                      <React.Fragment key={cut.id}>
                        {idx > 0 && pattern.bladeWidth > 0 && (
                          <div
                            style={{ width: `${kerfPercent}%` }}
                            title={`Пропил пилы: ${pattern.bladeWidth} мм`}
                            className="h-full bg-slate-800 shrink-0"
                          />
                        )}

                        <div
                          style={{
                            width: `${widthPercent}%`,
                            backgroundColor: cut.color,
                          }}
                          onMouseEnter={() => setHoveredPiece(cut)}
                          onMouseLeave={() => setHoveredPiece(null)}
                          className="h-full relative flex items-center justify-center text-white px-1 font-semibold text-xs transition-opacity hover:opacity-90 cursor-pointer overflow-hidden shadow-inner"
                        >
                          <span className="truncate drop-shadow-xs font-mono text-[11px]">
                            {cut.mark} ({cut.length})
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {/* Remaining waste / remnant */}
                  {pattern.wasteLength > 0 && (
                    <div
                      style={{ width: `${(pattern.wasteLength / totalStockLen) * 100}%` }}
                      title={`${
                        pattern.isReusableWaste ? 'Деловой остаток' : 'Невозвратный лом'
                      }: ${pattern.wasteLength} мм`}
                      className={`h-full flex items-center justify-center text-[11px] font-mono select-none overflow-hidden font-medium ${
                        pattern.isReusableWaste
                          ? 'bg-amber-100 text-amber-800 border-l border-amber-300'
                          : 'bg-slate-200 text-slate-500 border-l border-slate-300'
                      }`}
                    >
                      <span className="truncate px-1">
                        {pattern.isReusableWaste ? 'Остаток' : 'Лом'} {pattern.wasteLength}
                      </span>
                    </div>
                  )}

                  {/* Trim End */}
                  {pattern.trimEnd > 0 && (
                    <div
                      style={{ width: `${(pattern.trimEnd / totalStockLen) * 100}%` }}
                      title={`Торцовка конца: ${pattern.trimEnd} мм`}
                      className="h-full bg-slate-300 border-l border-slate-400 flex items-center justify-center text-[10px] text-slate-600 font-mono select-none overflow-hidden"
                    >
                      Т
                    </div>
                  )}
                </div>

                {/* Dimension markers beneath the bar */}
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1 px-0.5">
                  <span>0 мм</span>
                  <span>{pattern.stockLength} мм</span>
                </div>
              </div>

              {/* Pieces Breakdown Pill List */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-500">Порядок распила:</span>
                {pattern.cuts.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 border border-slate-200 text-slate-800"
                  >
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="font-semibold">{c.mark}</span>
                    <span className="text-slate-500">{c.length} мм</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
