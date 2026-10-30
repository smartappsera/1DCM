import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  ArrowRight,
  Cpu,
  RefreshCw,
  Sliders,
  Scale,
  Check,
  X,
  PackageCheck,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import { FullOptimizationSolution, AppSettings } from '../types/cutting';

export interface CalculationRun {
  id: string;
  index: number;
  title: string;
  timestamp: number;
  settings: AppSettings;
  solution: FullOptimizationSolution;
}

interface CalculationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: FullOptimizationSolution | null;
  settings: AppSettings;
  lastSolvedSettings?: AppSettings | null;
  savedRuns?: CalculationRun[];
  onSaveRuns?: (runs: CalculationRun[]) => void;
  onExecuteCalculation: (customSettings?: AppSettings) => FullOptimizationSolution;
  onApplySolutionAndSettings?: (sol: FullOptimizationSolution, newSettings: AppSettings) => void;
  onGoToResults: () => void;
}

export const CalculationProgressModal: React.FC<CalculationProgressModalProps> = ({
  isOpen,
  onClose,
  solution,
  settings,
  lastSolvedSettings,
  savedRuns,
  onSaveRuns,
  onExecuteCalculation,
  onApplySolutionAndSettings,
  onGoToResults,
}) => {
  const [phase, setPhase] = useState<'calculating' | 'done'>('calculating');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'remnants'>('summary');
  const [modalSettings, setModalSettings] = useState<AppSettings>(settings);
  const [runs, setRuns] = useState<CalculationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>('');
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(15);
  const [statusText, setStatusText] = useState<string>('Инициализация параметров...');

  const areSettingsEqual = (a: AppSettings, b: AppSettings): boolean => {
    return (
      a.bladeWidth === b.bladeWidth &&
      a.edgeTrim === b.edgeTrim &&
      a.reusableRemnantMin === b.reusableRemnantMin &&
      a.cutAngle45 === b.cutAngle45 &&
      a.dualProfileCut === b.dualProfileCut &&
      (a.fillControlEnabled ?? false) === (b.fillControlEnabled ?? false) &&
      (a.fillControlThreshold ?? 50) === (b.fillControlThreshold ?? 50) &&
      a.searchSpeed === b.searchSpeed &&
      a.optimizationGoal === b.optimizationGoal &&
      a.targetRemnantKIM === b.targetRemnantKIM
    );
  };

  // Reset or run initial calculation on open, preserving prior results when settings changed
  useEffect(() => {
    if (!isOpen) {
      setPhase('calculating');
      setProgressPercent(15);
      setHighlightedRunId(null);
      setDuplicateWarning(null);
      return;
    }

    setModalSettings({ ...settings });
    setHighlightedRunId(null);
    setDuplicateWarning(null);

    // Scenario A: If savedRuns already exist
    if (savedRuns && savedRuns.length > 0) {
      const matchRun = savedRuns.find((r) => areSettingsEqual(r.settings, settings));
      if (matchRun) {
        setRuns(savedRuns);
        setActiveRunId(matchRun.id);
        setProgressPercent(100);
        setStatusText('Расчет успешно выполнен!');
        setPhase('done');
        return;
      }

      // Settings changed! Keep previous saved runs and calculate new run
      setPhase('calculating');
      setProgressPercent(40);
      setStatusText('Расчет нового варианта с измененными настройками...');

      const timer = setTimeout(() => {
        try {
          const newSol = onExecuteCalculation(settings);
          const newRun: CalculationRun = {
            id: `run_${Date.now()}_${savedRuns.length + 1}`,
            index: savedRuns.length + 1,
            title: `Расчет #${savedRuns.length + 1}`,
            timestamp: Date.now(),
            settings: { ...settings },
            solution: newSol,
          };
          const updated = [...savedRuns, newRun];
          setRuns(updated);
          setActiveRunId(newRun.id);
          if (onSaveRuns) onSaveRuns(updated);
          if (onApplySolutionAndSettings) onApplySolutionAndSettings(newSol, settings);
          setProgressPercent(100);
          setStatusText('Расчет успешно выполнен!');
          setPhase('done');
        } catch (err) {
          console.error('Calculation error:', err);
          setPhase('done');
        }
      }, 150);

      return () => clearTimeout(timer);
    }

    // Scenario B: Feature 4 - savedRuns is empty, but solution exists on page and lastSolvedSettings exists
    if (solution && lastSolvedSettings && !areSettingsEqual(settings, lastSolvedSettings)) {
      setPhase('calculating');
      setProgressPercent(40);
      setStatusText('Расчет нового варианта и сравнение с предыдущим...');

      const timer = setTimeout(() => {
        try {
          const prevRun: CalculationRun = {
            id: `run_${Date.now()}_1`,
            index: 1,
            title: 'Расчет #1 (Текущий)',
            timestamp: Date.now() - 1000,
            settings: { ...lastSolvedSettings },
            solution: solution,
          };

          const newSol = onExecuteCalculation(settings);
          const newRun: CalculationRun = {
            id: `run_${Date.now()}_2`,
            index: 2,
            title: 'Расчет #2 (Новый)',
            timestamp: Date.now(),
            settings: { ...settings },
            solution: newSol,
          };

          const updated = [prevRun, newRun];
          setRuns(updated);
          setActiveRunId(newRun.id);
          if (onSaveRuns) onSaveRuns(updated);
          if (onApplySolutionAndSettings) onApplySolutionAndSettings(newSol, settings);
          setProgressPercent(100);
          setStatusText('Расчет успешно выполнен!');
          setPhase('done');
        } catch (err) {
          console.error('Calculation error:', err);
          setPhase('done');
        }
      }, 150);

      return () => clearTimeout(timer);
    }

    // Scenario C: First ever calculation or settings unchanged from solution
    setPhase('calculating');
    setProgressPercent(20);
    setStatusText('Инициализация списков заготовок и склада...');

    const timer1 = setTimeout(() => {
      setProgressPercent(60);
      setStatusText('Динамическое программирование рюкзака и перебор перестановок...');
    }, 80);

    const timer2 = setTimeout(() => {
      try {
        const initialSol =
          solution && lastSolvedSettings && areSettingsEqual(settings, lastSolvedSettings)
            ? solution
            : onExecuteCalculation(settings);
        const firstRun: CalculationRun = {
          id: `run_${Date.now()}_1`,
          index: 1,
          title: 'Расчет #1',
          timestamp: Date.now(),
          settings: { ...settings },
          solution: initialSol,
        };
        setRuns([firstRun]);
        setActiveRunId(firstRun.id);
        if (onSaveRuns) onSaveRuns([firstRun]);
        if (onApplySolutionAndSettings) onApplySolutionAndSettings(initialSol, settings);
        setProgressPercent(100);
        setStatusText('Расчет успешно выполнен!');
        setPhase('done');
      } catch (err) {
        console.error('Calculation error:', err);
        setPhase('done');
      }
    }, 180);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen]);

  // Active run and solution
  const activeRun = useMemo(() => {
    return runs.find((r) => r.id === activeRunId) || runs[runs.length - 1] || null;
  }, [runs, activeRunId]);

  const activeSolution = activeRun ? activeRun.solution : solution;

  // Recalculate avoiding duplicate runs
  const handleRecalculate = () => {
    const existingRun = runs.find(
      (r) =>
        r.settings.searchSpeed === modalSettings.searchSpeed &&
        r.settings.optimizationGoal === modalSettings.optimizationGoal &&
        r.settings.dualProfileCut === modalSettings.dualProfileCut &&
        (r.settings.fillControlEnabled ?? false) === (modalSettings.fillControlEnabled ?? false) &&
        (r.settings.fillControlThreshold ?? 50) === (modalSettings.fillControlThreshold ?? 50) &&
        r.settings.reusableRemnantMin === modalSettings.reusableRemnantMin
    );

    if (existingRun) {
      setActiveRunId(existingRun.id);
      setHighlightedRunId(existingRun.id);
      setDuplicateWarning(`Вариант с такими параметрами уже рассчитан (${existingRun.title})`);
      setActiveSubTab('summary');

      setTimeout(() => {
        setHighlightedRunId(null);
        setDuplicateWarning(null);
      }, 3000);

      if (onApplySolutionAndSettings) {
        onApplySolutionAndSettings(existingRun.solution, existingRun.settings);
      }
      return;
    }

    setDuplicateWarning(null);
    setIsRecalculating(true);
    setTimeout(() => {
      try {
        const newSol = onExecuteCalculation(modalSettings);
        const newRun: CalculationRun = {
          id: `run_${Date.now()}_${runs.length + 1}`,
          index: runs.length + 1,
          title: `Расчет #${runs.length + 1}`,
          timestamp: Date.now(),
          settings: { ...modalSettings },
          solution: newSol,
        };
        const updatedRuns = [...runs, newRun];
        setRuns(updatedRuns);
        setActiveRunId(newRun.id);
        if (onSaveRuns) {
          onSaveRuns(updatedRuns);
        }
        if (onApplySolutionAndSettings) {
          onApplySolutionAndSettings(newSol, modalSettings);
        }
      } catch (err) {
        console.error('Recalculation error:', err);
      } finally {
        setIsRecalculating(false);
      }
    }, 50);
  };

  const handleSelectRun = (run: CalculationRun) => {
    setActiveRunId(run.id);
    setModalSettings({ ...run.settings });
    if (onApplySolutionAndSettings) {
      onApplySolutionAndSettings(run.solution, run.settings);
    }
  };

  const handleConfirmAndGo = () => {
    if (activeRun && onApplySolutionAndSettings) {
      onApplySolutionAndSettings(activeRun.solution, activeRun.settings);
    }
    onClose();
    onGoToResults();
  };

  // Group reusable remnants generated from cut bars
  const cutRemnants = useMemo(() => {
    if (!activeSolution) return [];
    const map = new Map<
      number,
      { length: number; count: number; barSizes: Set<number>; barIndices: Set<number> }
    >();

    activeSolution.rows.forEach((row) => {
      if (row.isReusable && row.reusableRemnant > 0) {
        const len = row.reusableRemnant;
        const existing = map.get(len) || {
          length: len,
          count: 0,
          barSizes: new Set<number>(),
          barIndices: new Set<number>(),
        };
        existing.count += row.barsCount;
        existing.barSizes.add(row.barSize);
        existing.barIndices.add(row.barIndex);
        map.set(len, existing);
      }
    });

    return Array.from(map.values())
      .map((item) => ({
        length: item.length,
        count: item.count,
        totalLengthMeters: (item.length * item.count) / 1000,
        sourceInfo: Array.from(item.barIndices)
          .map((idx) => `Карта №${idx}`)
          .join(', '),
        barSizesInfo: Array.from(item.barSizes)
          .map((s) => `${s} мм`)
          .join(', '),
      }))
      .sort((a, b) => b.length - a.length);
  }, [activeSolution]);

  const totalCutRemnantsCount = cutRemnants.reduce((sum, r) => sum + r.count, 0);
  const totalCutRemnantsMeters = cutRemnants.reduce((sum, r) => sum + r.totalLengthMeters, 0);

  const warehouseLeftovers = activeSolution?.remainingWarehouseStock || [];
  const totalWarehouseLeftoversCount = warehouseLeftovers.reduce((sum, r) => sum + r.quantity, 0);
  const totalWarehouseLeftoversMeters = warehouseLeftovers.reduce(
    (sum, r) => sum + (r.length * r.quantity) / 1000,
    0
  );

  const getStrategyLabel = (goal?: string) => {
    switch (goal) {
      case 'variants':
        return 'По вариантам';
      case 'min_waste':
        return 'Минимум отходов';
      case 'min_bars':
        return 'Минимум хлыстов';
      case 'max_reusable':
        return 'Максимум делового';
      case 'prioritize_remnants':
        return 'Приоритет остатков';
      default:
        return goal || '—';
    }
  };

  const getSpeedLabel = (spd?: string) => {
    switch (spd) {
      case 'fast':
        return 'Быстро';
      case 'standard':
        return 'Стандарт';
      case 'deep':
        return 'Глубокий';
      default:
        return spd || '—';
    }
  };

  // Point 3: Цвета КИМ (98%+ зеленый, 92%-97.99% желтый, <92% красный)
  const getKimTheme = (kim: number) => {
    if (kim >= 98) {
      return {
        cardBg: 'bg-emerald-50/80 border-emerald-300 text-emerald-950',
        labelColor: 'text-emerald-800',
        valueColor: 'text-emerald-700',
        subColor: 'text-emerald-600',
        tableText: 'text-emerald-700 font-bold',
      };
    }
    if (kim >= 92) {
      return {
        cardBg: 'bg-amber-50/80 border-amber-300 text-amber-950',
        labelColor: 'text-amber-800',
        valueColor: 'text-amber-700',
        subColor: 'text-amber-700',
        tableText: 'text-amber-700 font-bold',
      };
    }
    return {
      cardBg: 'bg-rose-50/80 border-rose-300 text-rose-950',
      labelColor: 'text-rose-800',
      valueColor: 'text-rose-600',
      subColor: 'text-rose-600',
      tableText: 'text-rose-600 font-bold',
    };
  };

  // Point 4: Цвета Делового остатка (серый если 0, желтый если > 0)
  const getRemnantTheme = (reusableMeters: number) => {
    if (reusableMeters > 0) {
      return {
        cardBg: 'bg-amber-50/80 border-amber-300 text-amber-950',
        labelColor: 'text-amber-800',
        valueColor: 'text-amber-700',
        subColor: 'text-amber-700',
        tableText: 'text-amber-700 font-bold',
      };
    }
    return {
      cardBg: 'bg-slate-50 border-slate-200 text-slate-600',
      labelColor: 'text-slate-500',
      valueColor: 'text-slate-400',
      subColor: 'text-slate-400',
      tableText: 'text-slate-400',
    };
  };

  // Feature 2: Color theme for Cards count column
  const cardsList = useMemo(() => runs.map((r) => r.solution.rows.length), [runs]);
  const minCards = useMemo(() => (cardsList.length > 0 ? Math.min(...cardsList) : 0), [cardsList]);
  const maxCards = useMemo(() => (cardsList.length > 0 ? Math.max(...cardsList) : 0), [cardsList]);

  const getCardsTheme = (cardsCount: number) => {
    if (runs.length <= 1 || minCards === maxCards) {
      return 'text-slate-800 font-mono font-medium';
    }
    if (cardsCount === minCards) {
      return 'text-emerald-700 font-bold font-mono'; // зеленый - наименьшее количество вариантов (карт)
    }
    if (cardsCount === maxCards) {
      return 'text-rose-600 font-bold font-mono'; // красный - наибольшее
    }
    return 'text-amber-700 font-bold font-mono'; // промежуточные значения - желтым
  };

  // Feature 3: Color theme for Spent (Расход) column
  const spentList = useMemo(
    () => runs.map((r) => Number(((r.solution.totalStockLength || 0) / 1000).toFixed(2))),
    [runs]
  );
  const minSpent = useMemo(() => (spentList.length > 0 ? Math.min(...spentList) : 0), [spentList]);
  const maxSpent = useMemo(() => (spentList.length > 0 ? Math.max(...spentList) : 0), [spentList]);

  const getSpentTheme = (spentMeters: number) => {
    if (runs.length <= 1 || minSpent === maxSpent) {
      return 'text-slate-800 font-mono font-medium';
    }
    if (spentMeters === minSpent) {
      return 'text-emerald-700 font-bold font-mono'; // минимальный расход - зеленым
    }
    if (spentMeters === maxSpent) {
      return 'text-rose-600 font-bold font-mono'; // максимальный расход - красным
    }
    return 'text-amber-700 font-bold font-mono'; // промежуточные значения - желтым
  };

  // Feature 3: Color theme for Waste (Отход) column
  const wasteList = useMemo(
    () => runs.map((r) => Number(((r.solution.totalWasteLength || 0) / 1000).toFixed(2))),
    [runs]
  );
  const minWaste = useMemo(() => (wasteList.length > 0 ? Math.min(...wasteList) : 0), [wasteList]);
  const maxWaste = useMemo(() => (wasteList.length > 0 ? Math.max(...wasteList) : 0), [wasteList]);

  const getWasteTheme = (wasteMeters: number) => {
    if (runs.length <= 1 || minWaste === maxWaste) {
      return 'text-slate-500 font-mono font-medium';
    }
    if (wasteMeters === minWaste) {
      return 'text-emerald-700 font-bold font-mono'; // минимальный отход - зеленым
    }
    if (wasteMeters === maxWaste) {
      return 'text-rose-600 font-bold font-mono'; // максимальный отход - красным
    }
    return 'text-amber-700 font-bold font-mono'; // промежуточные значения - желтым
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                {phase === 'calculating' ? 'Выполняется расчет раскроя' : 'Оптимизация раскроя'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {phase === 'calculating'
                  ? 'Эвристический подбор схем реза'
                  : `Рассчитано вариантов: ${runs.length} · Выбран ${activeRun?.title || 'Расчет #1'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {phase === 'done' && activeSolution && (
              <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {activeSolution.calculationTimeMs || 15} мс
              </span>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {phase === 'calculating' ? (
            <div className="space-y-4 text-center py-10">
              <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>

              <div>
                <div className="text-xs font-bold text-slate-900">{statusText}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Эвристический многопроходный перебор перестановок и оптимизация вариантов
                </div>
              </div>

              <div className="w-full max-w-md mx-auto bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  style={{ width: `${progressPercent}%` }}
                  className="bg-blue-600 h-full transition-all duration-200 rounded-full"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Quick settings control bar inside the modal */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    <span>Параметры для расчета и сравнения</span>
                  </div>
                  <button
                    onClick={handleRecalculate}
                    disabled={isRecalculating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                    <span>Пересчитать вариант</span>
                  </button>
                </div>

                {/* Point 2: Увеличенная ширина комбобокса Стратегия (sm:col-span-5) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                  {/* Скорость: 2 cols */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      Скорость
                    </label>
                    <select
                      value={modalSettings.searchSpeed}
                      onChange={(e) =>
                        setModalSettings((prev) => ({
                          ...prev,
                          searchSpeed: e.target.value as any,
                        }))
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                    >
                      <option value="fast">Быстро</option>
                      <option value="standard">Стандарт</option>
                      <option value="deep">Глубокий</option>
                    </select>
                  </div>

                  {/* Стратегия: 5 cols (расширенный для полного отображения текста) */}
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      Стратегия
                    </label>
                    <select
                      value={modalSettings.optimizationGoal}
                      onChange={(e) =>
                        setModalSettings((prev) => ({
                          ...prev,
                          optimizationGoal: e.target.value as any,
                        }))
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                    >
                      <option value="variants">Оптимизация вариантов</option>
                      <option value="min_waste">Минимум отходов</option>
                      <option value="min_bars">Минимум хлыстов</option>
                      <option value="max_reusable">Максимум делового</option>
                      <option value="prioritize_remnants">Приоритет остатков</option>
                    </select>
                  </div>

                  {/* В два профиля и Контроль заполнения (единый фиксированный блок без изменения размеров) */}
                  <div className="sm:col-span-3 flex flex-col justify-end">
                    <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2 py-1 h-[30px]">
                      <label className="flex items-center gap-1 cursor-pointer select-none text-slate-800 shrink-0">
                        <input
                          type="checkbox"
                          checked={modalSettings.dualProfileCut}
                          onChange={(e) =>
                            setModalSettings((prev) => ({
                              ...prev,
                              dualProfileCut: e.target.checked,
                            }))
                          }
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-[11px] font-semibold whitespace-nowrap">2 проф.</span>
                      </label>

                      <div className="w-px h-3.5 bg-slate-300 mx-0.5 shrink-0" />

                      <div className={`flex items-center gap-1 transition-opacity duration-150 ${modalSettings.dualProfileCut ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <label className="flex items-center gap-1 cursor-pointer select-none text-slate-800 shrink-0">
                          <input
                            type="checkbox"
                            disabled={!modalSettings.dualProfileCut}
                            checked={modalSettings.dualProfileCut && (modalSettings.fillControlEnabled ?? false)}
                            onChange={(e) =>
                              setModalSettings((prev) => ({
                                ...prev,
                                fillControlEnabled: e.target.checked,
                              }))
                            }
                            className="w-3 h-3 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="text-[10px] font-semibold text-slate-800 whitespace-nowrap">Контроль</span>
                        </label>

                        <div className="flex items-center shrink-0">
                          <input
                            type="number"
                            min="1"
                            max="99"
                            disabled={!modalSettings.dualProfileCut || !modalSettings.fillControlEnabled}
                            value={modalSettings.fillControlThreshold ?? 50}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const clamped = isNaN(val) ? 50 : Math.min(99, Math.max(1, val));
                              setModalSettings((prev) => ({
                                ...prev,
                                fillControlThreshold: clamped,
                              }));
                            }}
                            className="w-7 text-[11px] font-mono font-bold text-blue-700 px-0.5 py-0 border border-slate-300 rounded bg-white text-right focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          <span className="text-[10px] text-blue-700 font-mono ml-0.5">%</span>
                        </div>

                        <div
                          className="cursor-help text-slate-400 hover:text-blue-600 transition-colors ml-auto"
                          title="Контроль заполнения: если в крайней паре заготовок (в карте не более двух заготовок) КИМ без учета делового отхода ниже указанного значения (по умолчанию 50%), алгоритм автоматически перераскладывает эту карту без режима «В 2 профиля» со стратегией «Минимум отходов» для снижения расхода материала."
                        >
                          <HelpCircle className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Деловой порог: 2 cols */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                      Деловой (мм)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalSettings.reusableRemnantMin}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setModalSettings((prev) => ({
                          ...prev,
                          reusableRemnantMin: isNaN(val) ? 0 : val,
                        }));
                      }}
                      className="w-full text-xs font-mono font-bold text-amber-700 bg-white border border-slate-300 rounded-md px-2 py-1 text-right focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Point 5: Предупреждение о дубликате */}
                {duplicateWarning && (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold animate-in fade-in duration-150">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}
              </div>

              {/* Sub-tab navigation */}
              <div className="flex items-center border-b border-slate-200 gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('summary')}
                  className={`pb-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeSubTab === 'summary'
                      ? 'text-blue-700 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Итоги и сравнение расчетов</span>
                  {runs.length > 1 && (
                    <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full text-[10px]">
                      {runs.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('remnants')}
                  className={`pb-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeSubTab === 'remnants'
                      ? 'text-amber-700 border-b-2 border-amber-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>Список деловых остатков</span>
                  {totalCutRemnantsCount > 0 && (
                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full text-[10px]">
                      {totalCutRemnantsCount} шт.
                    </span>
                  )}
                </button>
              </div>

              {/* Sub-tab 1: Summary & Comparison */}
              {activeSubTab === 'summary' && (
                <div className="space-y-4">
                  {/* KPI summary cards */}
                  {activeSolution && (() => {
                    const kimTheme = getKimTheme(activeSolution.overallKIM);
                    const remnantTheme = getRemnantTheme(activeSolution.totalReusableLength);

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        {/* Point 3: Общий КИМ с динамическим цветом */}
                        <div className={`p-3 border rounded-xl ${kimTheme.cardBg}`}>
                          <span className={`text-[10px] uppercase block font-bold ${kimTheme.labelColor}`}>
                            Общий КИМ
                          </span>
                          <strong className={`text-xl font-mono font-extrabold ${kimTheme.valueColor}`}>
                            {activeSolution.overallKIM.toFixed(2)}%
                          </strong>
                          <span className={`text-[10px] block mt-0.5 ${kimTheme.subColor}`}>
                            Полезный выход металла
                          </span>
                        </div>

                        {/* Point 1: Сумма длин всех использованных заготовок в метрах вместо шт */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] text-slate-500 uppercase block font-bold">
                            Расход заготовок
                          </span>
                          <strong className="text-xl font-mono text-slate-900 font-extrabold">
                            {((activeSolution.totalStockLength || 0) / 1000).toFixed(1)}{' '}
                            <span className="text-xs font-normal text-slate-500">м</span>
                          </strong>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Использовано {activeSolution.totalBarsUsed} хлыстов
                          </span>
                        </div>

                        {/* Point 4: Деловой остаток (серый если 0, желтый если > 0) */}
                        <div className={`p-3 border rounded-xl ${remnantTheme.cardBg}`}>
                          <span className={`text-[10px] uppercase block font-bold ${remnantTheme.labelColor}`}>
                            Деловой остаток
                          </span>
                          <strong className={`text-xl font-mono font-extrabold ${remnantTheme.valueColor}`}>
                            {(activeSolution.totalReusableLength / 1000).toFixed(2)}{' '}
                            <span className="text-xs font-normal">м</span>
                          </strong>
                          <span className={`text-[10px] block mt-0.5 ${remnantTheme.subColor}`}>
                            {totalCutRemnantsCount > 0
                              ? `${totalCutRemnantsCount} обрезков на склад`
                              : 'Остатков нет (все в лом)'}
                          </span>
                        </div>

                        {/* Отход и рез */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] text-slate-500 uppercase block font-bold">
                            Отход и рез
                          </span>
                          <strong className="text-xl font-mono text-slate-700 font-extrabold">
                            {(activeSolution.totalWasteLength / 1000).toFixed(2)}{' '}
                            <span className="text-xs font-normal text-slate-500">м</span>
                          </strong>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {(100 - activeSolution.overallKIM).toFixed(2)}% от объема
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Warning if unplaced items */}
                  {activeSolution && activeSolution.unplacedDemand.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-medium">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        Внимание: <strong>{activeSolution.unplacedDemand.reduce((s, u) => s + u.quantity, 0)} шт.</strong> не разложено из-за нехватки материала на складе!
                      </span>
                    </div>
                  )}

                  {/* Comparative table if more than 1 run */}
                  {runs.length > 1 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>Сравнение рассчитанных вариантов:</span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          Нажмите на строку, чтобы выбрать вариант
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs">
                        <table className="w-full border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left text-[11px] whitespace-nowrap">
                              <th className="py-2.5 px-3 w-28 whitespace-nowrap">Вариант</th>
                              <th className="py-2.5 px-3 min-w-[280px] whitespace-nowrap">Параметры</th>
                              <th className="py-2.5 px-3 text-right w-20 whitespace-nowrap">КИМ</th>
                              <th className="py-2.5 px-3 text-right w-20 whitespace-nowrap">Карт</th>
                              <th className="py-2.5 px-3 text-right w-28 whitespace-nowrap">Расход (м)</th>
                              <th className="py-2.5 px-3 text-right w-28 whitespace-nowrap">Деловой (м)</th>
                              <th className="py-2.5 px-3 text-right w-24 whitespace-nowrap">Отход (м)</th>
                              <th className="py-2.5 px-3 text-center w-28 whitespace-nowrap">Выбор</th>
                            </tr>
                          </thead>
                          <tbody>
                            {runs.map((r) => {
                              const isActive = r.id === activeRunId;
                              const isHighlighted = r.id === highlightedRunId;
                              const kimTheme = getKimTheme(r.solution.overallKIM);
                              const remnantTheme = getRemnantTheme(r.solution.totalReusableLength);
                              const spentMeters = Number(((r.solution.totalStockLength || 0) / 1000).toFixed(2));
                              const wasteMeters = Number(((r.solution.totalWasteLength || 0) / 1000).toFixed(2));

                              return (
                                <tr
                                  key={r.id}
                                  onClick={() => handleSelectRun(r)}
                                  className={`border-b border-slate-100 transition-all duration-300 cursor-pointer whitespace-nowrap h-10 ${
                                    isHighlighted
                                      ? 'bg-amber-100 ring-2 ring-amber-400 font-bold'
                                      : isActive
                                      ? 'bg-blue-50/80 font-bold text-blue-950'
                                      : 'hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          isActive ? 'bg-blue-600' : 'bg-slate-300'
                                        }`}
                                      />
                                      <span className="whitespace-nowrap">{r.title}</span>
                                    </div>
                                  </td>
                                  <td className={`py-2 px-3 text-[11px] whitespace-nowrap ${isActive ? 'text-blue-900 font-semibold' : 'text-slate-600'}`}>
                                    {getStrategyLabel(r.settings.optimizationGoal)} ·{' '}
                                    {getSpeedLabel(r.settings.searchSpeed)}
                                    {r.settings.dualProfileCut ? ' · 2 проф.' : ''}
                                    {r.settings.dualProfileCut && r.settings.fillControlEnabled ? ` (Контроль ${r.settings.fillControlThreshold ?? 50}%)` : ''}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${kimTheme.tableText}`}>
                                    {r.solution.overallKIM.toFixed(2)}%
                                  </td>
                                  {/* Feature 2: Колонка с количеством карт и цветовой индикацией */}
                                  <td className={`py-2 px-3 text-right whitespace-nowrap ${getCardsTheme(r.solution.rows.length)}`}>
                                    {r.solution.rows.length}
                                  </td>
                                  {/* Feature 3: Расход в метрах с цветовой индикацией */}
                                  <td className={`py-2 px-3 text-right whitespace-nowrap ${getSpentTheme(spentMeters)}`}>
                                    {((r.solution.totalStockLength || 0) / 1000).toFixed(1)} м
                                  </td>
                                  {/* Деловой остаток */}
                                  <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${remnantTheme.tableText}`}>
                                    {(r.solution.totalReusableLength / 1000).toFixed(2)}
                                  </td>
                                  {/* Feature 3: Отход с цветовой индикацией */}
                                  <td className={`py-2 px-3 text-right whitespace-nowrap ${getWasteTheme(wasteMeters)}`}>
                                    {(r.solution.totalWasteLength / 1000).toFixed(2)}
                                  </td>
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    {isActive ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-md whitespace-nowrap">
                                        <Check className="w-3 h-3" />
                                        Активен
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 hover:text-blue-600 whitespace-nowrap">
                                        Выбрать
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 2: Reusable Remnants List */}
              {activeSubTab === 'remnants' && (
                <div className="space-y-4">
                  {/* Explanation banner */}
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold">Порог делового остатка:</span> обрезки длиной от{' '}
                      <strong>{modalSettings.reusableRemnantMin} мм</strong> и более считаются пригодными для повторного использования и возвращаются на склад.
                    </div>
                    <div className="shrink-0 font-mono font-bold text-amber-800 text-sm">
                      {totalCutRemnantsMeters.toFixed(2)} м / {totalCutRemnantsCount} шт.
                    </div>
                  </div>

                  {/* Table of new cut remnants */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>Образовавшиеся деловые остатки раскроя:</span>
                    </div>

                    {cutRemnants.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left text-[11px]">
                              <th className="py-2 px-3">Размер (мм)</th>
                              <th className="py-2 px-3 text-right">Кол-во (шт.)</th>
                              <th className="py-2 px-3 text-right">Суммарная длина (м)</th>
                              <th className="py-2 px-3">Получен из хлыстов</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cutRemnants.map((r, idx) => (
                              <tr
                                key={idx}
                                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                              >
                                <td className="py-2 px-3 font-mono font-bold text-amber-800">
                                  {r.length} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold">
                                  {r.count} шт.
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                                  {r.totalLengthMeters.toFixed(2)} м
                                </td>
                                <td className="py-2 px-3 text-[11px] text-slate-500">
                                  {r.sourceInfo} ({r.barSizesInfo})
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-amber-50/60 font-bold text-amber-950 border-t border-amber-200">
                              <td className="py-2 px-3">Итого деловых остатков:</td>
                              <td className="py-2 px-3 text-right font-mono">
                                {totalCutRemnantsCount} шт.
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {totalCutRemnantsMeters.toFixed(2)} м
                              </td>
                              <td className="py-2 px-3 text-[11px] text-amber-700">
                                Готовы к экспорту на склад
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                        В этом варианте нет деловых остатков (все обрезки менее {modalSettings.reusableRemnantMin} мм ушли в лом).
                      </div>
                    )}
                  </div>

                  {/* Table of unused warehouse stock */}
                  {warehouseLeftovers.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Неиспользованный складской остаток:</span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          {totalWarehouseLeftoversCount} шт. / {totalWarehouseLeftoversMeters.toFixed(2)} м
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left text-[11px]">
                              <th className="py-1.5 px-3">Размер (мм)</th>
                              <th className="py-1.5 px-3 text-right">Кол-во (шт.)</th>
                              <th className="py-1.5 px-3 text-right">Суммарная длина (м)</th>
                              <th className="py-1.5 px-3">Марка / Стеллаж</th>
                            </tr>
                          </thead>
                          <tbody>
                            {warehouseLeftovers.map((w, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-1.5 px-3 font-mono font-medium text-slate-800">
                                  {w.length} мм
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono">{w.quantity} шт.</td>
                                <td className="py-1.5 px-3 text-right font-mono text-slate-600">
                                  {((w.length * w.quantity) / 1000).toFixed(2)} м
                                </td>
                                <td className="py-1.5 px-3 text-[11px] text-slate-500">
                                  {w.mark || 'Склад'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 transition-colors font-medium cursor-pointer"
          >
            Остаться в данных
          </button>

          {phase === 'done' && (
            <button
              onClick={handleConfirmAndGo}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <span>Применить и перейти к раскрою</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
