import React, { useState, useEffect } from 'react';
import { CheckCircle2, ArrowRight, Cpu } from 'lucide-react';
import { FullOptimizationSolution } from '../types/cutting';

interface CalculationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: FullOptimizationSolution | null;
  onExecuteCalculation: () => void;
  onGoToResults: () => void;
}

export const CalculationProgressModal: React.FC<CalculationProgressModalProps> = ({
  isOpen,
  onClose,
  solution,
  onExecuteCalculation,
  onGoToResults,
}) => {
  const [phase, setPhase] = useState<'calculating' | 'done'>('calculating');
  const [progressPercent, setProgressPercent] = useState(10);
  const [statusText, setStatusText] = useState('Инициализация параметров и структуры данных...');

  useEffect(() => {
    if (!isOpen) {
      setPhase('calculating');
      setProgressPercent(10);
      return;
    }

    // Modal is now open IMMEDIATELY on click!
    setPhase('calculating');
    setProgressPercent(15);
    setStatusText('Инициализация параметров и подготовка списков заготовок...');

    const step1Timer = setTimeout(() => {
      setProgressPercent(45);
      setStatusText('Вычисление НОД размерностей и проверка складских хлыстов...');
    }, 60);

    const calcTimer = setTimeout(() => {
      if (onExecuteCalculation) {
        onExecuteCalculation();
      }
      setProgressPercent(85);
      setStatusText('Динамическое программирование рюкзака (LongSumEl) и оптимизация...');
    }, 120);

    const step3Timer = setTimeout(() => {
      setProgressPercent(100);
      setStatusText('Оптимизация карт раскроя завершена!');
      setPhase('done');
    }, 240);

    return () => {
      clearTimeout(step1Timer);
      clearTimeout(calcTimer);
      clearTimeout(step3Timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in duration-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {phase === 'calculating' ? 'Выполняется расчет раскроя' : 'Расчет успешно выполнен!'}
            </h3>
          </div>

          {/* Time ONLY shown here on completion */}
          {phase === 'done' && (
            <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Время расчета: {solution?.calculationTimeMs || 15} мс
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {phase === 'calculating' ? (
            <div className="space-y-4 text-center py-2">
              <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-900">{statusText}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Эвристический многопроходный перебор перестановок и оптимизация вариантов
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  style={{ width: `${progressPercent}%` }}
                  className="bg-blue-600 h-full transition-all duration-200 rounded-full"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-emerald-900">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold">Оптимальный раскрой сформирован!</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    Получены математические формулы и векторные схемы хлыстов.
                  </div>
                </div>
              </div>

              {/* Quick KPI summary */}
              {solution && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                      Общий КИМ
                    </span>
                    <strong className="text-xl font-mono text-blue-600 font-extrabold">
                      {solution.overallKIM.toFixed(2)}%
                    </strong>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                      Расход заготовок
                    </span>
                    <strong className="text-xl font-mono text-slate-800 font-extrabold">
                      {solution.totalBarsUsed} <span className="text-xs font-normal text-slate-500">шт.</span>
                    </strong>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                      Полезный металл
                    </span>
                    <strong className="text-sm font-mono text-slate-800 font-bold">
                      {(solution.totalSpentLength / 1000).toFixed(1)} м
                    </strong>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                      Деловой остаток
                    </span>
                    <strong className="text-sm font-mono text-amber-700 font-bold">
                      {(solution.totalReusableLength / 1000).toFixed(1)} м
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium"
          >
            Остаться в данных
          </button>

          {phase === 'done' && (
            <button
              onClick={() => {
                onClose();
                onGoToResults();
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <span>Перейти к результатам раскроя</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
