import React, { useState } from 'react';
import {
  X,
  Activity,
  Cpu,
  Clock,
  HardDrive,
  Layers,
  Zap,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileCode2,
} from 'lucide-react';
import { CalculationRun } from './CalculationProgressModal';
import { CalculationTelemetry } from '../types/cutting';

interface AuditTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  runs: CalculationRun[];
  activeRunId: string;
  onSelectRun?: (runId: string) => void;
  onClearHistory?: () => void;
}

export const AuditTelemetryModal: React.FC<AuditTelemetryModalProps> = ({
  isOpen,
  onClose,
  runs,
  activeRunId,
  onSelectRun,
  onClearHistory,
}) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Runs with valid solutions, reversed for chronological history
  const historyRuns = runs.filter((r) => r.solution);
  const activeRun =
    historyRuns.find((r) => r.id === (selectedLogId || activeRunId)) ||
    historyRuns[historyRuns.length - 1] ||
    null;

  const telemetry = activeRun?.solution?.telemetry;

  const handleExportJSON = () => {
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      totalRunsCount: historyRuns.length,
      runs: historyRuns.map((r) => ({
        id: r.id,
        index: r.index,
        title: r.title,
        badge: r.badge,
        timestamp: new Date(r.timestamp).toISOString(),
        settings: r.settings,
        summary: {
          overallKIM: r.solution.overallKIM,
          netKIM: r.solution.netKIM,
          totalStockLengthMeters: (r.solution.totalStockLength || 0) / 1000,
          totalBarsUsed: r.solution.totalBarsUsed,
          totalWasteLengthMeters: r.solution.totalWasteLength / 1000,
          totalReusableMeters: r.solution.totalReusableLength / 1000,
          calculationTimeMs: r.solution.calculationTimeMs,
        },
        telemetry: r.solution.telemetry || null,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutting_audit_telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Название',
      'Время (мс)',
      'Этап 1 Подготовка (мс)',
      'Этап 2 Поиск (мс)',
      'Этап 3 2-Opt (мс)',
      'КИМ (%)',
      'Проверено комбинаций',
      'Проходов',
      'Память JS (МБ)',
      'Скорость (дет/сек)',
      'Среда',
    ];

    const rows = historyRuns.map((r) => {
      const t = r.solution.telemetry;
      return [
        `"${r.id}"`,
        `"${r.title}"`,
        r.solution.calculationTimeMs,
        t?.stageTimingsMs.stage1Init ?? 0,
        t?.stageTimingsMs.stage2Search ?? 0,
        t?.stageTimingsMs.stage3Refine ?? 0,
        r.solution.overallKIM,
        t?.totalCombinationsChecked ?? 0,
        t?.passesEvaluated ?? 0,
        t?.memoryUsedMb ?? 'N/A',
        t?.throughputPartsPerSecond ?? 0,
        t?.environment ?? 'client_worker',
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutting_audit_telemetry_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Журнал аудита и телеметрии ресурсов
                </h2>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Web Worker 60fps
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Фиксация процессорного времени, выделения памяти и вычислительной сложности алгоритма
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJSON}
              title="Экспорт детального журнала в JSON для отладки"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5 text-blue-600" />
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              title="Экспорт таблицы в Excel / CSV"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>

            {onClearHistory && historyRuns.length > 1 && (
              <button
                type="button"
                onClick={onClearHistory}
                title="Очистить историю расчетов"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeRun && (
            <div className="space-y-4">
              {/* Selected Run Title & Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                    Активный замер:
                  </span>
                  <span className="text-sm font-bold text-slate-900">{activeRun.title}</span>
                  {activeRun.badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {activeRun.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Зафиксировано: {new Date(activeRun.timestamp).toLocaleTimeString()} · Среда:{' '}
                  <span className="text-slate-800 font-semibold">
                    {telemetry?.environment === 'client_worker'
                      ? 'Web Worker (фоновый поток)'
                      : 'Основной поток'}
                  </span>
                </div>
              </div>

              {/* 4 Main KPI Telemetry Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* 1. Time */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Время вычислений
                    </span>
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-xl font-mono font-extrabold text-slate-900 tabular-nums">
                    {activeRun.solution.calculationTimeMs.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">мс</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {(activeRun.solution.calculationTimeMs / 1000).toFixed(2)} с чистого времени ЦПУ
                  </div>
                </div>

                {/* 2. Memory */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Память JS Heap
                    </span>
                    <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="text-xl font-mono font-extrabold text-slate-900 tabular-nums">
                    {telemetry?.memoryUsedMb !== undefined ? `${telemetry.memoryUsedMb}` : '—'}{' '}
                    <span className="text-xs font-normal text-slate-500">МБ</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {telemetry?.memoryDeltaMb !== undefined
                      ? `Дельта: ${telemetry.memoryDeltaMb > 0 ? '+' : ''}${telemetry.memoryDeltaMb} МБ`
                      : 'Стабильный профиль кучи'}
                  </div>
                </div>

                {/* 3. Combinations & Passes */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Комбинаций карт
                    </span>
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-mono font-extrabold text-slate-900 tabular-nums">
                    {(telemetry?.totalCombinationsChecked ?? activeRun.solution.rows.length).toLocaleString('ru-RU')}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {telemetry?.passesEvaluated ? `${telemetry.passesEvaluated} проходов поиска` : 'Быстрый проход'}
                  </div>
                </div>

                {/* 4. CPU & Throughput */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Скорость раскладки
                    </span>
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-xl font-mono font-extrabold text-slate-900 tabular-nums">
                    {telemetry?.throughputPartsPerSecond ?? 0}{' '}
                    <span className="text-xs font-normal text-slate-500">дет/с</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    100% поток 1 ядра (без блокировки UI)
                  </div>
                </div>
              </div>

              {/* Timing Breakdown Progress Bar */}
              {telemetry?.stageTimingsMs && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Распределение времени по этапам расчета:</span>
                    <span className="font-mono text-slate-500 font-normal">
                      Сумма: {activeRun.solution.calculationTimeMs.toFixed(1)} мс
                    </span>
                  </div>

                  {(() => {
                    const total = Math.max(1, activeRun.solution.calculationTimeMs);
                    const t1 = telemetry.stageTimingsMs.stage1Init;
                    const t2 = telemetry.stageTimingsMs.stage2Search;
                    const t3 = telemetry.stageTimingsMs.stage3Refine;
                    const p1 = Math.round((t1 / total) * 100);
                    const p2 = Math.round((t2 / total) * 100);
                    const p3 = Math.max(0, 100 - p1 - p2);

                    return (
                      <>
                        <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-200">
                          <div
                            style={{ width: `${p1}%` }}
                            className="bg-blue-500 h-full transition-all"
                            title={`Этап 1: Подготовка и НОД (${t1} мс, ${p1}%)`}
                          />
                          <div
                            style={{ width: `${p2}%` }}
                            className="bg-indigo-600 h-full transition-all"
                            title={`Этап 2: Многопроходный подбор (${t2} мс, ${p2}%)`}
                          />
                          <div
                            style={{ width: `${p3}%` }}
                            className="bg-emerald-500 h-full transition-all"
                            title={`Этап 3: 2-Opt и сжатие (${t3} мс, ${p3}%)`}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                            <span>
                              <strong>Этап 1 (Анализ):</strong> {t1.toFixed(1)} мс ({p1}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                            <span>
                              <strong>Этап 2 (Поиск):</strong> {t2.toFixed(1)} мс ({p2}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>
                              <strong>Этап 3 (2-Opt):</strong> {t3.toFixed(1)} мс ({p3}%)
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Historical Log Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>История расчетов текущей сессии ({historyRuns.length}):</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Нажмите на строку для детального просмотра телеметрии
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs shadow-2xs">
              <table className="w-full border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left text-[11px] font-semibold">
                    <th className="py-2.5 px-3">Вариант</th>
                    <th className="py-2.5 px-3">Время создания</th>
                    <th className="py-2.5 px-3 text-right">Время ЦПУ</th>
                    <th className="py-2.5 px-3 text-right">КИМ</th>
                    <th className="py-2.5 px-3 text-right">Комбинаций</th>
                    <th className="py-2.5 px-3 text-right">Память JS</th>
                    <th className="py-2.5 px-3 text-right">Скорость</th>
                    <th className="py-2.5 px-3 text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyRuns.length > 0 ? (
                    historyRuns.map((r) => {
                      const isSelected = activeRun?.id === r.id;
                      const t = r.solution.telemetry;

                      return (
                        <tr
                          key={r.id}
                          onClick={() => {
                            setSelectedLogId(r.id);
                            if (onSelectRun) onSelectRun(r.id);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/80 font-medium text-blue-950'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span>{r.title}</span>
                              {r.badge && (
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded border bg-slate-100 text-slate-600 border-slate-200">
                                  {r.badge}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {new Date(r.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {r.solution.calculationTimeMs.toFixed(1)} мс
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {r.solution.overallKIM.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                            {(t?.totalCombinationsChecked ?? r.solution.rows.length).toLocaleString('ru-RU')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                            {t?.memoryUsedMb !== undefined ? `${t.memoryUsedMb} МБ` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                            {t?.throughputPartsPerSecond ? `${t.throughputPartsPerSecond} дет/с` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-2xs">
                                Выбран
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Просмотр</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                        Нет сохраненных расчетов в текущей сессии
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span>
              Готовность к серверному профилированию: схема данных совместима с{' '}
              <code className="px-1 py-0.5 bg-slate-200 rounded font-mono text-[10px] text-slate-800">
                process.cpuUsage() / memoryUsage()
              </code>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors cursor-pointer shadow-xs"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
