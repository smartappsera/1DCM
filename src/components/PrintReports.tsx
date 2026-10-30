import React, { useState } from 'react';
import {
  CuttingOptimizationResult,
  CuttingParams,
  PartDemand,
  StockBar,
} from '../types/cutting';
import { Printer, Tag, FileText, Download } from 'lucide-react';

interface PrintReportsProps {
  result: CuttingOptimizationResult | null;
  params: CuttingParams;
  demands: PartDemand[];
  stocks: StockBar[];
}

export const PrintReports: React.FC<PrintReportsProps> = ({
  result,
  params,
  demands,
  stocks,
}) => {
  const [activeReport, setActiveReport] = useState<'work_order' | 'labels' | 'remnants'>(
    'work_order'
  );
  const [labelSize, setLabelSize] = useState<'medium' | 'compact'>('medium');
  const [highlightedCut, setHighlightedCut] = useState<{
    patternId: string;
    cutIndex: number;
  } | null>(null);

  if (!result || result.patterns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-800">
          Нет данных для формирования отчетов
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Выполните расчет раскроя во вкладке «Спецификация и склад».
        </p>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  // Requirement 14: Revised Download HTML with clean dividers, bold values, and no graphic between header and table
  const handleDownloadHtml = () => {
    const safeOrder = params.orderNumber || '1';
    const safeProject = params.projectName || 'Без названия';
    const safeMat = params.materialName || 'Профиль';

    let cardsHtml = '';
    result.patterns.forEach((pattern) => {
      let progressiveStop = pattern.trimStart || 0;
      const cutsCount = pattern.cuts.length + (pattern.trimStart > 0 ? 1 : 0) + 1;
      const kerfLoss = params.bladeWidth * cutsCount;
      const scrapPart = pattern.isReusableWaste ? 0 : pattern.wasteLength;

      let wasteText = '';
      if (pattern.trimStart > 0 && scrapPart > 0) {
        wasteText = `${pattern.trimStart}+${scrapPart} мм (лом), ${kerfLoss} мм (стружка)`;
      } else if (scrapPart > 0) {
        wasteText = `${scrapPart} мм (лом), ${kerfLoss} мм (стружка)`;
      } else if (pattern.trimStart > 0) {
        wasteText = `${pattern.trimStart} мм (лом), ${kerfLoss} мм (стружка)`;
      } else {
        wasteText = `${kerfLoss} мм (стружка)`;
      }

      const reusableBadge = pattern.isReusableWaste
        ? ` &middot; Деловой остаток: <strong>${pattern.wasteLength} мм</strong>`
        : '';

      let tableRows = '';
      if (pattern.trimStart > 0) {
        tableRows += `
          <tr style="background:#f8fafc; color:#64748b; font-style:italic;">
            <td style="text-align:center; font-family:monospace;">0</td>
            <td style="text-align:right; font-family:monospace; font-weight:bold;">${pattern.trimStart} мм</td>
            <td>Торцовка начала заготовки</td>
            <td>Удаление дефектного края</td>
          </tr>`;
      }

      pattern.cuts.forEach((cut, idx) => {
        const stopPosition = progressiveStop + cut.length;
        progressiveStop = stopPosition + params.bladeWidth;

        tableRows += `
          <tr>
            <td style="text-align:center; font-family:monospace; font-weight:bold;">${idx + 1}</td>
            <td style="text-align:right; font-family:monospace; font-weight:bold; color:#1e40af; background:#eff6ff;">${stopPosition} мм</td>
            <td style="font-weight:600;">${cut.mark} (${cut.length} мм)</td>
            <td style="color:#64748b;">${cut.notes || '&mdash;'}</td>
          </tr>`;
      });

      if (pattern.wasteLength > 0) {
        tableRows += `
          <tr style="background:${pattern.isReusableWaste ? '#fffbeb' : '#f8fafc'};">
            <td style="text-align:center; font-family:monospace; color:#94a3b8;">&mdash;</td>
            <td style="text-align:right; font-family:monospace; color:#475569;">Хвост: ${pattern.stockLength} мм</td>
            <td style="font-weight:bold; color:${pattern.isReusableWaste ? '#92400e' : '#475569'};">
              ${pattern.isReusableWaste ? `Деловой остаток (${pattern.wasteLength} мм)` : `Невозвратный лом (${pattern.wasteLength} мм)`}
            </td>
            <td style="font-size:11px;">${pattern.isReusableWaste ? 'Промаркировать и оприходовать' : 'В бункер стружки'}</td>
          </tr>`;
      }

      cardsHtml += `
        <div class="card-block">
          <div class="card-header">
            <div>
              <span class="badge">Карта #${pattern.patternIndex}</span>
              <strong>${pattern.stockName} &mdash; ${pattern.stockLength} мм</strong>
              &nbsp;&middot;&nbsp; Количество хлыстов: <strong>${pattern.count} шт</strong>
            </div>
            <div style="font-family:monospace; font-size:12px;">
              Отходы: <strong>${wasteText}</strong>${reusableBadge} &nbsp;&middot;&nbsp; КИМ: <strong>${pattern.efficiencyPercent}%</strong>
            </div>
          </div>
          <hr class="divider" />
          <table>
            <thead>
              <tr>
                <th style="width:48px; text-align:center;">#№</th>
                <th style="width:140px; text-align:right;">Позиция упора</th>
                <th>Марка (длина)</th>
                <th>Примечания</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    });

    const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Технологическая карта раскроя №${safeOrder}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #0f172a; background: #fff; line-height: 1.4; }
    h1 { font-size: 18px; margin: 0 0 8px 0; text-transform: uppercase; font-weight: 800; letter-spacing: -0.02em; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .meta-line { font-size: 12px; color: #475569; margin-top: 4px; }
    .divider { border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0; }
    .thick-divider { border: 0; border-top: 2px solid #94a3b8; margin: 20px 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; margin-bottom: 20px; }
    .card-block { border: 1px solid #94a3b8; border-radius: 8px; padding: 14px; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
    .card-header { display: flex; justify-content: space-between; align-items: center; }
    .badge { background: #0f172a; color: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 11px; font-weight: bold; margin-right: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; }
    th { background: #f1f5f9; text-align: left; font-weight: bold; }
    @media print { body { margin: 0; } .card-block { border-color: #000; } }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <h1>ТЕХНОЛОГИЧЕСКАЯ КАРТА РАСКРОЯ № ${safeOrder}</h1>
      <div class="meta-line">
        Заказ / Проект: <strong>${safeProject}</strong> &nbsp;&middot;&nbsp;
        Материал: <strong>${safeMat}</strong> &nbsp;&middot;&nbsp;
        Дата: <strong>${new Date().toLocaleDateString('ru-RU')}</strong>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px; text-transform:uppercase; color:#64748b; font-weight:bold;">Общий КИМ</div>
      <div style="font-size:24px; font-weight:bold; font-family:monospace; color:#2563eb;">${result.overallEfficiencyPercent}%</div>
    </div>
  </div>

  <div class="summary-grid">
    <div>Ширина пропила: <strong>${params.bladeWidth} мм</strong></div>
    <div>Торцовка: <strong>${params.trimStart} мм</strong></div>
    <div>Всего заготовок: <strong>${result.totalStockBarsUsed} шт (${(result.totalStockLengthUsed / 1000).toFixed(1)} м)</strong></div>
    <div>Деловой остаток: <strong>${(result.totalReusableLength / 1000).toFixed(1)} м</strong></div>
  </div>

  <div class="cards-container">
    ${cardsHtml}
  </div>
</body>
</html>`;

    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Техкарта_раскроя_${safeOrder}_${safeMat.replace(/[/\\?%*:|"<>]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Flatten all cut pieces across all patterns into individual labels
  interface FlatLabel {
    labelId: string;
    mark: string;
    length: number;
    color: string;
    notes?: string;
    barIndex: number;
    stockLength: number;
    pieceIndexOnBar: number;
    totalPiecesOnBar: number;
    material: string;
    project: string;
  }

  const flatLabels: FlatLabel[] = [];
  result.patterns.forEach((pattern) => {
    for (let barCopy = 1; barCopy <= pattern.count; barCopy++) {
      pattern.cuts.forEach((cut, pIdx) => {
        flatLabels.push({
          labelId: `${pattern.patternIndex}_${barCopy}_${cut.id}`,
          mark: cut.mark,
          length: cut.length,
          color: cut.color,
          notes: cut.notes,
          barIndex: pattern.patternIndex,
          stockLength: pattern.stockLength,
          pieceIndexOnBar: pIdx + 1,
          totalPiecesOnBar: pattern.cuts.length,
          material: params.materialName || 'Профиль/Труба',
          project: params.projectName || 'Заказ',
        });
      });
    }
  });

  return (
    <div className="space-y-6">
      {/* Top Controls Strip (Hidden during print) */}
      <div className="no-print bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveReport('work_order')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeReport === 'work_order'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 inline mr-1.5" />
            Технологическая карта цеха
          </button>
          <button
            onClick={() => setActiveReport('labels')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeReport === 'labels'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-3.5 h-3.5 inline mr-1.5" />
            Печатные бирки ({flatLabels.length} шт)
          </button>
          <button
            onClick={() => setActiveReport('remnants')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeReport === 'remnants'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ведомость деловых остатков
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {activeReport === 'work_order' && (
            <button
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Скачать чистую HTML карту раскроя"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать HTML</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Распечатать</span>
          </button>
        </div>
      </div>

      {/* REPORT 1: Production Work Order (Технологическая карта цеха) */}
      {activeReport === 'work_order' && (
        <div id="printable-work-order" className="bg-white p-8 rounded-xl border border-slate-200 shadow-xs text-slate-900 print:border-0 print:p-0">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase">
                ТЕХНОЛОГИЧЕСКАЯ КАРТА РАСКРОЯ № {params.orderNumber || '1'}
              </h1>
              <div className="text-xs text-slate-600 mt-1 space-x-3">
                <span>
                  Заказ / Проект: <strong>{params.projectName || 'Без названия'}</strong>
                </span>
                <span>·</span>
                <span>
                  Материал: <strong>{params.materialName || 'Прокат'}</strong>
                </span>
                <span>·</span>
                <span>Дата: <strong>{new Date().toLocaleDateString('ru-RU')}</strong></span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-semibold text-slate-500 uppercase">Общий КИМ</div>
              <div className="text-2xl font-bold font-mono text-blue-600">
                {result.overallEfficiencyPercent}%
              </div>
            </div>
          </div>

          {/* Quick Params */}
          <div className="grid grid-cols-4 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-6">
            <div>
              <span className="text-slate-500 block">Ширина пропила:</span>
              <strong className="font-mono">{params.bladeWidth} мм</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Торцовка:</span>
              <strong className="font-mono">
                {params.trimStart} мм
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Всего заготовок:</span>
              <strong className="font-mono">
                {result.totalStockBarsUsed} шт ({(result.totalStockLengthUsed / 1000).toFixed(1)} м)
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Деловой остаток:</span>
              <strong className="font-mono text-amber-700">
                {(result.totalReusableLength / 1000).toFixed(1)} м
              </strong>
            </div>
          </div>

          {/* Cutting Maps List */}
          <div className="space-y-6">
            {result.patterns.map((pattern) => {
              let progressiveStop = pattern.trimStart || 0;
              const cutsCount = pattern.cuts.length + (pattern.trimStart > 0 ? 1 : 0) + 1;
              const kerfLoss = params.bladeWidth * cutsCount;
              const scrapPart = pattern.isReusableWaste ? 0 : pattern.wasteLength;

              // Format Отходы according to Requirement 10
              let wasteText = '';
              if (pattern.trimStart > 0 && scrapPart > 0) {
                wasteText = `${pattern.trimStart}+${scrapPart} мм (лом), ${kerfLoss} мм (стружка)`;
              } else if (scrapPart > 0) {
                wasteText = `${scrapPart} мм (лом), ${kerfLoss} мм (стружка)`;
              } else if (pattern.trimStart > 0) {
                wasteText = `${pattern.trimStart} мм (лом), ${kerfLoss} мм (стружка)`;
              } else {
                wasteText = `${kerfLoss} мм (стружка)`;
              }

              return (
                <div
                  key={pattern.id}
                  className="border border-slate-300 rounded-lg p-4 break-inside-avoid print:border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap justify-between items-center pb-2 border-b border-slate-200 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 text-white font-mono font-bold text-xs px-2 py-0.5 rounded">
                        Карта #{pattern.patternIndex}
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        {pattern.stockName} — {pattern.stockLength} мм
                      </span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-mono">
                        Количество хлыстов: {pattern.count} шт
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 font-mono">
                      Отходы: <strong>{wasteText}</strong>
                      {pattern.isReusableWaste && (
                        <span className="text-amber-800 font-bold ml-1.5">
                          · Деловой: {pattern.wasteLength} мм
                        </span>
                      )}{' '}
                      · КИМ: <strong>{pattern.efficiencyPercent}%</strong>
                    </div>
                  </div>

                  {/* Graphic cutting bar with interactive highlighting (Requirement 13) */}
                  <div className="my-2">
                    <div className="h-9 rounded-md overflow-hidden flex items-stretch border border-slate-700 bg-slate-100 shadow-2xs w-full relative">
                      {pattern.trimStart > 0 && (
                        <div
                          style={{
                            width: `${Math.max(1.8, (pattern.trimStart / pattern.stockLength) * 100)}%`,
                          }}
                          title={`Торцовка: ${pattern.trimStart} мм`}
                          className="bg-black text-white border-r-[10px] border-black flex items-center justify-center text-[10px] font-mono font-bold select-none shrink-0 min-w-[16px]"
                        >
                          Т
                        </div>
                      )}

                      {(() => {
                        const hasAnyPatternHighlight =
                          highlightedCut !== null && highlightedCut.patternId === pattern.id;

                        return pattern.cuts.map((cut, cIdx) => {
                          const piecePercent = (cut.length / pattern.stockLength) * 100;
                          const isHighlighted =
                            highlightedCut?.patternId === pattern.id &&
                            highlightedCut?.cutIndex === cIdx;
                          const isDimmed = hasAnyPatternHighlight && !isHighlighted;

                          return (
                            <div
                              key={cut.id || cIdx}
                              onClick={() =>
                                setHighlightedCut((prev) =>
                                  prev?.patternId === pattern.id && prev?.cutIndex === cIdx
                                    ? null
                                    : { patternId: pattern.id, cutIndex: cIdx }
                                )
                              }
                              onMouseEnter={() =>
                                setHighlightedCut({ patternId: pattern.id, cutIndex: cIdx })
                              }
                              onMouseLeave={() => setHighlightedCut(null)}
                              style={{
                                width: `${piecePercent}%`,
                                backgroundColor: cut.color || '#93C5FD',
                              }}
                              title={`Деталь: ${cut.length} мм (${cut.mark || ''}) — нажмите для подсветки в таблице`}
                              className={`h-full flex items-center justify-center font-mono font-bold text-[11px] text-slate-950 border-r-[2px] border-dashed border-slate-900 px-0.5 shrink-0 select-none truncate cursor-pointer transition-all ${
                                isHighlighted
                                  ? 'ring-3 ring-blue-600 scale-105 z-20 brightness-110 shadow-lg font-black'
                                  : isDimmed
                                  ? 'opacity-25 grayscale brightness-90'
                                  : 'hover:brightness-105'
                              }`}
                            >
                              {piecePercent > 4 && <span>{cut.length}</span>}
                            </div>
                          );
                        });
                      })()}

                      {pattern.wasteLength > 0 && (
                        <div
                          style={{ width: `${(pattern.wasteLength / pattern.stockLength) * 100}%` }}
                          title={`${
                            pattern.isReusableWaste ? 'Деловой остаток' : 'Невозвратный лом'
                          }: ${pattern.wasteLength} мм`}
                          className={`h-full flex-1 flex items-center justify-center font-mono font-bold text-[10px] select-none px-1 border-l ${
                            highlightedCut?.patternId === pattern.id
                              ? 'opacity-25 grayscale brightness-90'
                              : ''
                          } ${
                            pattern.isReusableWaste
                              ? 'bg-amber-100 text-amber-900 border-amber-400'
                              : 'bg-slate-200 text-slate-700 border-slate-400'
                          }`}
                        >
                          <span>
                            {pattern.wasteLength} {pattern.isReusableWaste ? '(Ост)' : '(Лом)'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-1 px-0.5">
                      <span>0 мм</span>
                      <span>{pattern.stockLength} мм</span>
                    </div>
                  </div>

                  {/* Cuts Table with Reordered Columns: #№, Позиция упора, Марка, Примечания (Requirement 10) */}
                  <table className="w-full text-xs text-left border-collapse mt-2">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <tr>
                        <th className="py-1.5 px-2 font-semibold w-12 text-center">#№</th>
                        <th className="py-1.5 px-2 font-semibold text-right w-36 bg-blue-50/60 text-blue-900">
                          Позиция упора (мм)
                        </th>
                        <th className="py-1.5 px-2 font-semibold">Марка (Обозначение / длина)</th>
                        <th className="py-1.5 px-2 font-semibold">Примечания</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pattern.trimStart > 0 && (
                        <tr className="bg-slate-50/50 text-slate-500 italic">
                          <td className="py-1 px-2 text-center font-mono">0</td>
                          <td className="py-1 px-2 text-right font-mono font-bold text-slate-800 bg-blue-50/30">
                            {pattern.trimStart} мм
                          </td>
                          <td className="py-1 px-2">Торцовка начала заготовки</td>
                          <td className="py-1 px-2">Удаление дефектного края</td>
                        </tr>
                      )}
                      {(() => {
                        const hasAnyPatternHighlight =
                          highlightedCut !== null && highlightedCut.patternId === pattern.id;

                        return pattern.cuts.map((cut, idx) => {
                          const stopPosition = progressiveStop + cut.length;
                          progressiveStop = stopPosition + params.bladeWidth;

                          const isRowHighlighted =
                            highlightedCut?.patternId === pattern.id &&
                            highlightedCut?.cutIndex === idx;
                          const isRowDimmed = hasAnyPatternHighlight && !isRowHighlighted;

                          return (
                            <tr
                              key={cut.id}
                              onClick={() =>
                                setHighlightedCut((prev) =>
                                  prev?.patternId === pattern.id && prev?.cutIndex === idx
                                    ? null
                                    : { patternId: pattern.id, cutIndex: idx }
                                )
                              }
                              onMouseEnter={() =>
                                setHighlightedCut({ patternId: pattern.id, cutIndex: idx })
                              }
                              onMouseLeave={() => setHighlightedCut(null)}
                              className={`transition-colors cursor-pointer ${
                                isRowHighlighted
                                  ? 'bg-blue-100 font-bold border-l-4 border-l-blue-600'
                                  : isRowDimmed
                                  ? 'text-slate-300 opacity-40'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td
                                className={`py-1.5 px-2 text-center font-mono font-bold ${
                                  isRowDimmed ? 'text-slate-300' : ''
                                }`}
                              >
                                {idx + 1}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right font-mono font-bold ${
                                  isRowDimmed
                                    ? 'text-slate-300 bg-transparent'
                                    : 'text-blue-900 bg-blue-50/40'
                                }`}
                              >
                                {stopPosition} мм
                              </td>
                              <td
                                className={`py-1.5 px-2 font-semibold ${
                                  isRowDimmed ? 'text-slate-300' : 'text-slate-900'
                                }`}
                              >
                                {cut.mark} ({cut.length} мм)
                              </td>
                              <td
                                className={`py-1.5 px-2 ${
                                  isRowDimmed ? 'text-slate-300' : 'text-slate-500'
                                }`}
                              >
                                {cut.notes || '—'}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {pattern.wasteLength > 0 && (
                        <tr className={pattern.isReusableWaste ? 'bg-amber-50/60' : 'bg-slate-50'}>
                          <td className="py-1 px-2 text-center font-mono text-slate-400">—</td>
                          <td className="py-1 px-2 text-right font-mono text-slate-500 bg-blue-50/20">
                            Хвост: {pattern.stockLength} мм
                          </td>
                          <td className="py-1 px-2 font-semibold">
                            {pattern.isReusableWaste
                              ? `Деловой остаток (${pattern.wasteLength} мм)`
                              : `Невозвратный лом (${pattern.wasteLength} мм)`}
                          </td>
                          <td className="py-1 px-2 text-[11px]">
                            {pattern.isReusableWaste
                              ? 'Промаркировать и оприходовать на склад'
                              : 'В бункер стружки'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Signatures block removed per Requirement 11 */}
        </div>
      )}

      {/* REPORT 2: Printable Component Labels / Бирки */}
      {activeReport === 'labels' && (
        <div className="space-y-4">
          <div className="no-print text-xs text-slate-500 bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center justify-between">
            <span>
              Сформировано <strong>{flatLabels.length} бирок</strong> для наклейки на детали в цеху.
              Подготовлено для печати на самоклеящейся бумаге или термопринтере.
            </span>
          </div>

          <div
            className={`grid gap-3 print:gap-2 ${
              labelSize === 'medium'
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 print:grid-cols-3'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 print:grid-cols-4'
            }`}
          >
            {flatLabels.map((lbl) => (
              <div
                key={lbl.labelId}
                className="border-2 border-slate-900 rounded-lg p-3 bg-white flex flex-col justify-between break-inside-avoid shadow-2xs print:shadow-none"
              >
                <div>
                  <div className="flex justify-between items-start border-b border-slate-300 pb-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {lbl.project}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-slate-900 text-white px-1.5 py-0.2 rounded">
                      К#{lbl.barIndex} [{lbl.pieceIndexOnBar}/{lbl.totalPiecesOnBar}]
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl font-black font-mono tracking-tight text-slate-900">
                      {lbl.length} мм
                    </div>
                    <div className="text-xs font-bold text-blue-700 truncate">{lbl.mark}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between items-center">
                  <span className="truncate max-w-[120px]">{lbl.material}</span>
                  <span className="font-mono">{lbl.notes || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORT 3: Reusable Remnants Report (Ведомость деловых остатков) */}
      {activeReport === 'remnants' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Ведомость деловых остатков после раскроя
              </h2>
              <p className="text-xs text-slate-500">
                Заказ: <strong>{params.orderNumber || '1'}</strong> · Материал:{' '}
                <strong>{params.materialName || 'Профиль'}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Всего деловых остатков:</span>
              <strong className="text-base font-mono text-amber-700">
                {(result.totalReusableLength / 1000).toFixed(2)} м
              </strong>
            </div>
          </div>

          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b">
              <tr>
                <th className="py-2 px-3 w-12 text-center">№</th>
                <th className="py-2 px-3">От какой карты</th>
                <th className="py-2 px-3 text-right">Длина остатка (мм)</th>
                <th className="py-2 px-3 text-right">Количество (шт)</th>
                <th className="py-2 px-3">Статус для склада</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {result.patterns
                .filter((p) => p.isReusableWaste && p.wasteLength > 0)
                .map((p, idx) => (
                  <tr key={p.id} className="hover:bg-amber-50/40">
                    <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 font-sans font-semibold">Карта #{p.patternIndex} ({p.stockLength} мм)</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-800">{p.wasteLength}</td>
                    <td className="py-2 px-3 text-right font-bold text-blue-700">{p.count}</td>
                    <td className="py-2 px-3 font-sans text-slate-700">Годен к повторному использованию</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
