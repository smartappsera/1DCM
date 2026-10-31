import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  RotateCcw,
  Trash2,
  ChevronLeft,
  Clock,
  Timer,
  Square,
  Zap,
} from 'lucide-react';
import {
  FullOptimizationSolution,
  AppSettings,
  CalculationProgressInfo,
  ComplexityEstimate,
  StockItem,
  DemandItem,
} from '../types/cutting';
import { estimateCalculationComplexity } from '../utils/cuttingEngine';
import { DynamicRowItem } from './DynamicInputBlock';

export interface CalculationRun {
  id: string;
  index: number;
  title: string;
  timestamp: number;
  settings: AppSettings;
  solution: FullOptimizationSolution;
  inputSignature?: string;
}

interface CalculationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: FullOptimizationSolution | null;
  settings: AppSettings;
  lastSolvedSettings?: AppSettings | null;
  inputSignature?: string;
  savedRuns?: CalculationRun[];
  onSaveRuns?: (runs: CalculationRun[]) => void;
  onExecuteCalculation: (customSettings?: AppSettings) => FullOptimizationSolution;
  onApplySolutionAndSettings?: (sol: FullOptimizationSolution, newSettings: AppSettings) => void;
  onGoToResults: () => void;
  isSettingsOpen?: boolean;
  calcTriggerNonce?: number;
  stockItems?: DynamicRowItem[];
  demandItems?: DynamicRowItem[];
}

export const CalculationProgressModal: React.FC<CalculationProgressModalProps> = ({
  isOpen,
  onClose,
  solution,
  settings,
  lastSolvedSettings,
  inputSignature,
  savedRuns,
  onSaveRuns,
  onExecuteCalculation,
  onApplySolutionAndSettings,
  onGoToResults,
  isSettingsOpen = true,
  calcTriggerNonce,
  stockItems,
  demandItems,
}) => {
  const [phase, setPhase] = useState<'calculating' | 'done'>('calculating');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'remnants'>('summary');
  const [modalSettings, setModalSettings] = useState<AppSettings>(settings);
  const [runs, setRuns] = useState<CalculationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>('');
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(10);
  const [statusText, setStatusText] = useState<string>('Инициализация параметров...');

  // Live worker execution states
  const [progressInfo, setProgressInfo] = useState<CalculationProgressInfo | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const stopwatchIntervalRef = useRef<any>(null);
  const latestSolutionRef = useRef<FullOptimizationSolution | null>(null);

  const [sortField, setSortField] = useState<
    | 'index'
    | 'speed'
    | 'strategy'
    | 'dualProfile'
    | 'fillControl'
    | 'reusableMin'
    | 'kim'
    | 'cards'
    | 'spent'
    | 'reusable'
    | 'waste'
    | 'unplaced'
  >('index');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'unplaced'>('all');
  const [filterStrategy, setFilterStrategy] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pre-flight calculation complexity and volume assessment
  const complexityEstimate = useMemo<ComplexityEstimate | null>(() => {
    if (!demandItems || demandItems.length === 0) return null;
    const stocks: StockItem[] = (stockItems || [])
      .filter((s) => s.isActive !== false && s.length > 0)
      .map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        length: s.length,
        quantity: s.quantity,
        isActive: s.isActive !== false,
        isStandard: s.isStandard || s.length === 6000 || s.length === 12000,
        isStandardUnlimited:
          s.isStandardUnlimited ||
          ((s.length === 6000 || s.length === 12000) && s.quantity <= 0),
        mark: s.mark,
        notes: s.notes,
      }));

    const demands: DemandItem[] = (demandItems || [])
      .filter((d) => d.length > 0 && d.quantity > 0)
      .map((d) => ({
        id: d.id,
        orderIndex: d.orderIndex,
        length: d.length,
        quantity: d.quantity,
        mark: d.mark,
        notes: d.notes,
      }));

    return estimateCalculationComplexity(stocks, demands, settings);
  }, [stockItems, demandItems, settings]);

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

  const formatStopwatch = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return `${mm}:${ss}.${tenths}`;
  };

  const formatETA = (progress: CalculationProgressInfo | null, elapsedMs: number): string => {
    if (!progress) return 'Оценка...';
    if (progress.etaSeconds !== undefined) {
      if (progress.etaSeconds <= 0) return 'Завершение...';
      if (progress.etaSeconds < 2) return 'Менее 2 сек';
      if (progress.etaSeconds < 60) return `~${progress.etaSeconds} сек`;
      const min = Math.floor(progress.etaSeconds / 60);
      const sec = progress.etaSeconds % 60;
      return `~${min} мин ${sec} сек`;
    }
    if (progress.percent > 5) {
      const totalEstMs = (elapsedMs / progress.percent) * 100;
      const remainingSec = Math.max(0, Math.round((totalEstMs - elapsedMs) / 1000));
      return remainingSec <= 0 ? 'Завершение...' : `~${remainingSec} сек`;
    }
    return 'Оценка...';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * High-performance worker-based calculation runner with live telemetry
   */
  const startOptimizationRun = (
    settingsToRun: AppSettings,
    existingRunsList: CalculationRun[],
    onFinished?: (sol: FullOptimizationSolution) => void
  ) => {
    setPhase('calculating');
    setProgressPercent(10);
    setStatusText('Инициализация параметров и подготовка заготовок...');
    setElapsedTimeMs(0);
    setProgressInfo(null);
    latestSolutionRef.current = null;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (stopwatchIntervalRef.current) {
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }

    const startPerfTime = performance.now();
    stopwatchIntervalRef.current = setInterval(() => {
      setElapsedTimeMs(performance.now() - startPerfTime);
    }, 40);

    const finishRun = (sol: FullOptimizationSolution) => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      const nextIndex = existingRunsList.length + 1;
      const newRun: CalculationRun = {
        id: `run_${Date.now()}_${nextIndex}`,
        index: nextIndex,
        title: `Расчет #${nextIndex}`,
        timestamp: Date.now(),
        settings: { ...settingsToRun },
        solution: sol,
        inputSignature,
      };

      const updated = [...existingRunsList, newRun];
      setRuns(updated);
      setActiveRunId(newRun.id);
      if (onSaveRuns) onSaveRuns(updated);
      if (onApplySolutionAndSettings) onApplySolutionAndSettings(sol, settingsToRun);
      setProgressPercent(100);
      setStatusText('Расчет успешно выполнен!');
      setPhase('done');
      setIsRecalculating(false);
      if (onFinished) onFinished(sol);
    };

    // Prepare Stock & Demand items for Worker
    const stocks: StockItem[] = (stockItems || [])
      .filter((s) => s.isActive !== false && s.length > 0)
      .map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        length: s.length,
        quantity: s.quantity,
        isActive: s.isActive !== false,
        isStandard: s.isStandard || s.length === 6000 || s.length === 12000,
        isStandardUnlimited:
          s.isStandardUnlimited ||
          ((s.length === 6000 || s.length === 12000) && s.quantity <= 0),
        mark: s.mark,
        notes: s.notes,
      }));

    const demands: DemandItem[] = (demandItems || [])
      .filter((d) => d.length > 0 && d.quantity > 0)
      .map((d) => ({
        id: d.id,
        orderIndex: d.orderIndex,
        length: d.length,
        quantity: d.quantity,
        mark: d.mark,
        notes: d.notes,
      }));

    try {
      const worker = new Worker(new URL('../workers/cuttingWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<any>) => {
        const { type, payload } = e.data;
        if (type === 'PROGRESS') {
          setProgressInfo(payload);
          setProgressPercent(payload.percent);
          setStatusText(payload.stageName);
        } else if (type === 'DONE') {
          latestSolutionRef.current = payload;
          finishRun(payload);
        } else if (type === 'ERROR') {
          console.error('Worker returned error:', payload);
          // Fallback to sync
          const sol = onExecuteCalculation(settingsToRun);
          finishRun(sol);
        }
      };

      worker.onerror = (err) => {
        console.warn('Worker runtime error, falling back to sync:', err);
        const sol = onExecuteCalculation(settingsToRun);
        finishRun(sol);
      };

      worker.postMessage({
        type: 'START',
        payload: {
          stockInput: stocks,
          demandInput: demands,
          settings: settingsToRun,
        },
      });
    } catch (err) {
      console.warn('Worker spawn error, using synchronous execution:', err);
      setTimeout(() => {
        try {
          const sol = onExecuteCalculation(settingsToRun);
          finishRun(sol);
        } catch (e) {
          console.error('Calculation execution error:', e);
          setPhase('done');
          setIsRecalculating(false);
        }
      }, 50);
    }
  };

  /**
   * Stop & apply best result found so far
   */
  const handleStopAndApply = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'ABORT' });
      setTimeout(() => {
        if (phase === 'calculating') {
          if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
          }
          if (stopwatchIntervalRef.current) {
            clearInterval(stopwatchIntervalRef.current);
            stopwatchIntervalRef.current = null;
          }

          const solToApply = latestSolutionRef.current || onExecuteCalculation({ ...modalSettings, searchSpeed: 'fast' });
          const nextIdx = runs.length + 1;
          const newRun: CalculationRun = {
            id: `run_${Date.now()}_${nextIdx}`,
            index: nextIdx,
            title: `Расчет #${nextIdx} (Остановлен)`,
            timestamp: Date.now(),
            settings: { ...modalSettings },
            solution: solToApply,
            inputSignature,
          };
          const updated = [...runs, newRun];
          setRuns(updated);
          setActiveRunId(newRun.id);
          if (onSaveRuns) onSaveRuns(updated);
          if (onApplySolutionAndSettings) onApplySolutionAndSettings(solToApply, modalSettings);
          setProgressPercent(100);
          setStatusText('Расчет прерван пользователем и применен текущий результат');
          setPhase('done');
          setIsRecalculating(false);
        }
      }, 250);
    } else {
      setPhase('done');
      setIsRecalculating(false);
    }
  };

  // Reset or run initial calculation on open, preserving prior results when settings and input conditions match
  useEffect(() => {
    if (!isOpen) {
      setPhase('calculating');
      setProgressPercent(10);
      setHighlightedRunId(null);
      setDuplicateWarning(null);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
        stopwatchIntervalRef.current = null;
      }
      return;
    }

    setModalSettings({ ...settings });
    setHighlightedRunId(null);
    setDuplicateWarning(null);

    // Gather all existing previous runs: from savedRuns, or synthesized from the completed solution on page
    let existingRuns: CalculationRun[] = savedRuns && savedRuns.length > 0 ? [...savedRuns] : [];
    if (existingRuns.length === 0 && solution) {
      existingRuns = [
        {
          id: `run_prev_${Date.now()}`,
          index: 1,
          title: 'Расчет #1',
          timestamp: Date.now() - 2000,
          settings: { ...(lastSolvedSettings || settings) },
          solution: solution,
          inputSignature: undefined,
        },
      ];
    }

    // If we have previous runs:
    if (existingRuns.length > 0) {
      // Check if an identical run matches BOTH settings AND inputSignature
      const matchRun = existingRuns.find(
        (r) =>
          areSettingsEqual(r.settings, settings) &&
          (!r.inputSignature || !inputSignature || r.inputSignature === inputSignature)
      );

      if (matchRun) {
        setRuns(existingRuns);
        setActiveRunId(matchRun.id);
        setProgressPercent(100);
        setStatusText('Расчет успешно выполнен!');
        setPhase('done');
        return;
      }

      // User modified settings or changed input conditions -> run optimization and append run to comparison table
      startOptimizationRun(settings, existingRuns);
      return;
    }

    // No previous runs or solution exist at all (first calculation ever):
    startOptimizationRun(settings, []);
  }, [isOpen, inputSignature]);

  // Active run and solution
  const activeRun = useMemo(() => {
    return runs.find((r) => r.id === activeRunId) || runs[runs.length - 1] || null;
  }, [runs, activeRunId]);

  const activeSolution = activeRun ? activeRun.solution : solution;

  // Recalculate avoiding blocked calculations and respecting all parameters
  const executeRecalculateWithSettings = (settingsToUse: AppSettings) => {
    // Check if an identical run exists in the current session
    const existingRun = runs.find(
      (r) =>
        (!r.inputSignature || !inputSignature || r.inputSignature === inputSignature) &&
        areSettingsEqual(r.settings, settingsToUse)
    );

    // If matching run exists and is NOT currently active, switch to it with a floating notice
    if (existingRun && existingRun.id !== activeRunId) {
      setActiveRunId(existingRun.id);
      setHighlightedRunId(existingRun.id);
      setDuplicateWarning(`Вариант с такими параметрами уже рассчитан (${existingRun.title})`);
      setActiveSubTab('summary');

      setTimeout(() => {
        setHighlightedRunId(null);
        setDuplicateWarning(null);
      }, 3500);

      if (onApplySolutionAndSettings) {
        onApplySolutionAndSettings(existingRun.solution, existingRun.settings);
      }
      return;
    }

    if (existingRun && existingRun.id === activeRunId) {
      setDuplicateWarning(`Вариант «${existingRun.title}» уже рассчитан с текущими параметрами`);
      setTimeout(() => setDuplicateWarning(null), 3000);
      return;
    }

    // Execute recalculation (new run added to comparison list)
    setDuplicateWarning(null);
    setIsRecalculating(true);
    startOptimizationRun(settingsToUse, runs);
  };

  const handleRecalculate = () => {
    executeRecalculateWithSettings(settings);
  };

  // Listen to calcTriggerNonce from App when user clicks "Рассчитать раскрой" in sidebar
  const lastNonceRef = useRef<number | undefined>(calcTriggerNonce);
  useEffect(() => {
    if (!isOpen || phase !== 'done') return;
    if (calcTriggerNonce !== undefined && calcTriggerNonce !== lastNonceRef.current) {
      lastNonceRef.current = calcTriggerNonce;
      executeRecalculateWithSettings(settings);
    }
  }, [calcTriggerNonce, isOpen, phase, settings]);

  const handleClearRuns = () => {
    if (!activeRun) return;
    const reset = [{ ...activeRun, index: 1, title: 'Расчет #1' }];
    setRuns(reset);
    setActiveRunId(reset[0].id);
    if (onSaveRuns) onSaveRuns(reset);
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
  const getKimTheme = (kim: number, isDeficit?: boolean) => {
    if (isDeficit) {
      return {
        cardBg: 'bg-rose-50/80 border-rose-300 text-rose-950',
        labelColor: 'text-rose-800',
        valueColor: 'text-rose-600',
        subColor: 'text-rose-600',
        tableText: 'text-rose-600 font-bold font-mono',
      };
    }
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
  const getRemnantTheme = (reusableMeters: number, isDeficit?: boolean) => {
    if (isDeficit) {
      return {
        cardBg: 'bg-slate-50 border-slate-200 text-slate-600',
        labelColor: 'text-slate-500',
        valueColor: 'text-slate-400',
        subColor: 'text-slate-400',
        tableText: 'text-slate-400 font-mono',
      };
    }
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

  // Runs WITHOUT material deficit (unplaced parts) - only these participate in comparative color scaling
  const validRuns = useMemo(() => {
    return runs.filter(
      (r) =>
        !r.solution.unplacedDemand ||
        r.solution.unplacedDemand.length === 0 ||
        r.solution.unplacedDemand.every((u) => (u.quantity || 0) === 0)
    );
  }, [runs]);

  // Color theme for Cards count column (runs with deficit do not participate in sample)
  const cardsList = useMemo(() => validRuns.map((r) => r.solution.rows.length), [validRuns]);
  const minCards = useMemo(() => (cardsList.length > 0 ? Math.min(...cardsList) : null), [cardsList]);
  const maxCards = useMemo(() => (cardsList.length > 0 ? Math.max(...cardsList) : null), [cardsList]);

  const getCardsTheme = (cardsCount: number, isDeficit: boolean) => {
    if (isDeficit) {
      return 'text-slate-400 font-mono font-normal';
    }
    if (validRuns.length <= 1 || minCards === null || maxCards === null || minCards === maxCards) {
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

  // Color theme for Spent (Расход) column (runs with deficit do not participate in sample)
  const spentList = useMemo(
    () => validRuns.map((r) => Number(((r.solution.totalStockLength || 0) / 1000).toFixed(2))),
    [validRuns]
  );
  const minSpent = useMemo(() => (spentList.length > 0 ? Math.min(...spentList) : null), [spentList]);
  const maxSpent = useMemo(() => (spentList.length > 0 ? Math.max(...spentList) : null), [spentList]);

  const getSpentTheme = (spentMeters: number, isDeficit: boolean) => {
    if (isDeficit) {
      return 'text-slate-400 font-mono font-normal';
    }
    if (validRuns.length <= 1 || minSpent === null || maxSpent === null || minSpent === maxSpent) {
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

  // Color theme for Waste (Отход) column (runs with deficit do not participate in sample)
  const wasteList = useMemo(
    () => validRuns.map((r) => Number(((r.solution.totalWasteLength || 0) / 1000).toFixed(2))),
    [validRuns]
  );
  const minWaste = useMemo(() => (wasteList.length > 0 ? Math.min(...wasteList) : null), [wasteList]);
  const maxWaste = useMemo(() => (wasteList.length > 0 ? Math.max(...wasteList) : null), [wasteList]);

  const getWasteTheme = (wasteMeters: number, isDeficit: boolean) => {
    if (isDeficit) {
      return 'text-slate-400 font-mono font-normal';
    }
    if (validRuns.length <= 1 || minWaste === null || maxWaste === null || minWaste === maxWaste) {
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

  const filteredAndSortedRuns = useMemo(() => {
    let list = [...runs];

    if (filterStatus === 'complete') {
      list = list.filter(
        (r) =>
          !r.solution.unplacedDemand ||
          r.solution.unplacedDemand.length === 0 ||
          r.solution.unplacedDemand.every((u) => u.quantity === 0)
      );
    } else if (filterStatus === 'unplaced') {
      list = list.filter(
        (r) =>
          r.solution.unplacedDemand &&
          r.solution.unplacedDemand.some((u) => u.quantity > 0)
      );
    }

    if (filterStrategy !== 'all') {
      list = list.filter((r) => r.settings.optimizationGoal === filterStrategy);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const titleMatch = r.title.toLowerCase().includes(q);
        const stratMatch = getStrategyLabel(r.settings.optimizationGoal).toLowerCase().includes(q);
        const speedMatch = getSpeedLabel(r.settings.searchSpeed).toLowerCase().includes(q);
        return titleMatch || stratMatch || speedMatch;
      });
    }

    list.sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case 'index':
          diff = a.index - b.index;
          break;
        case 'speed':
          diff = a.settings.searchSpeed.localeCompare(b.settings.searchSpeed);
          break;
        case 'strategy':
          diff = a.settings.optimizationGoal.localeCompare(b.settings.optimizationGoal);
          break;
        case 'dualProfile':
          diff = Number(a.settings.dualProfileCut) - Number(b.settings.dualProfileCut);
          break;
        case 'fillControl': {
          const fcA = a.settings.dualProfileCut && a.settings.fillControlEnabled ? (a.settings.fillControlThreshold ?? 50) : 0;
          const fcB = b.settings.dualProfileCut && b.settings.fillControlEnabled ? (b.settings.fillControlThreshold ?? 50) : 0;
          diff = fcA - fcB;
          break;
        }
        case 'reusableMin':
          diff = a.settings.reusableRemnantMin - b.settings.reusableRemnantMin;
          break;
        case 'kim':
          diff = a.solution.overallKIM - b.solution.overallKIM;
          break;
        case 'cards':
          diff = a.solution.rows.length - b.solution.rows.length;
          break;
        case 'spent':
          diff = (a.solution.totalStockLength || 0) - (b.solution.totalStockLength || 0);
          break;
        case 'reusable':
          diff = (a.solution.totalReusableLength || 0) - (b.solution.totalReusableLength || 0);
          break;
        case 'waste':
          diff = (a.solution.totalWasteLength || 0) - (b.solution.totalWasteLength || 0);
          break;
        case 'unplaced': {
          const unpA = a.solution.unplacedDemand ? a.solution.unplacedDemand.reduce((s, u) => s + (u.quantity || 0), 0) : 0;
          const unpB = b.solution.unplacedDemand ? b.solution.unplacedDemand.reduce((s, u) => s + (u.quantity || 0), 0) : 0;
          diff = unpA - unpB;
          break;
        }
        default:
          diff = a.index - b.index;
      }
      return sortDirection === 'asc' ? diff : -diff;
    });

    return list;
  }, [runs, filterStatus, filterStrategy, searchQuery, sortField, sortDirection]);

  const handleSortToggle = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600" />
    );
  };

  if (!isOpen) return null;

  const leftOffsetClass = isSettingsOpen
    ? 'left-0 sm:left-72 md:left-80'
    : 'left-0 sm:left-12';

  return (
    <>
      {/* Light backdrop over the right workspace only - left settings sidebar is NEVER obscured */}
      <div
        onClick={onClose}
        className={`fixed top-[57px] sm:top-[61px] bottom-0 right-0 z-30 bg-slate-900/20 backdrop-blur-2xs transition-all duration-300 ${leftOffsetClass}`}
      />

      {/* Docked Calculation Panel positioned immediately to the right of Settings Sidebar */}
      <div
        className={`fixed top-[57px] sm:top-[61px] bottom-0 right-0 z-40 bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left-4 duration-250 transition-all ${leftOffsetClass}`}
      >
        {/* Floating toast notification for duplicate or status warning (zero layout shift) */}
        {duplicateWarning && (
          <div className="absolute top-16 right-6 z-30 flex items-center gap-2.5 px-3.5 py-2 bg-amber-600 text-white rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150 border border-amber-500 max-w-md">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
            <span className="flex-1">{duplicateWarning}</span>
            <button
              onClick={() => setDuplicateWarning(null)}
              className="text-amber-200 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                {phase === 'calculating' ? 'Выполняется расчет раскроя' : 'Оптимизация и сравнение вариантов'}
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
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
              title="Свернуть"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-blue-600" />
              <span>Свернуть</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {phase === 'calculating' ? (
            <div className="py-4 px-2 sm:px-4 max-w-2xl mx-auto space-y-4">
              {/* Pre-flight complexity banner */}
              {complexityEstimate?.isHeavy && (
                <div className="bg-amber-50 border border-amber-200/90 rounded-xl p-3 flex items-start gap-3 text-amber-900 shadow-2xs">
                  <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <div className="font-bold flex items-center gap-2">
                      <span>Обнаружен большой объем спецификации</span>
                      <span className="bg-amber-200/90 text-amber-900 px-2 py-0.2 rounded-full text-[10px] font-mono font-bold">
                        {complexityEstimate.totalMeters.toLocaleString('ru-RU')} м · {complexityEstimate.totalParts.toLocaleString('ru-RU')} шт.
                      </span>
                    </div>
                    <p className="mt-0.5 text-amber-800 text-[11px]">
                      {complexityEstimate.recommendation}
                    </p>
                  </div>
                </div>
              )}

              {/* Live Stopwatch & ETA Dashboard Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                    <Timer className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Время расчета (Секундомер)
                    </div>
                    <div className="text-2xl sm:text-3xl font-mono font-extrabold text-blue-400 tracking-tight">
                      {formatStopwatch(elapsedTimeMs)}
                    </div>
                  </div>
                </div>

                <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Ориентировочное время (ETA)
                  </div>
                  <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>{formatETA(progressInfo, elapsedTimeMs)}</span>
                  </div>
                </div>
              </div>

              {/* 3-Stage Progress Tracker */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping inline-block" />
                    <span>{statusText}</span>
                  </span>
                  <span className="font-mono font-extrabold text-blue-600">{progressPercent}%</span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="bg-blue-600 h-full transition-all duration-150 rounded-full shadow-inner"
                  />
                </div>

                {/* Visual Stages */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  <div
                    className={`p-2 rounded-lg text-center border transition-colors ${
                      (progressInfo?.stage || 1) >= 1
                        ? (progressInfo?.stage || 1) === 1
                          ? 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                      {(progressInfo?.stage || 1) > 1 ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <span className="w-3 h-3 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center">
                          1
                        </span>
                      )}
                      <span>Этап 1</span>
                    </div>
                    <div className="text-[11px] font-semibold mt-0.5 truncate">Подготовка и анализ</div>
                  </div>

                  <div
                    className={`p-2 rounded-lg text-center border transition-colors ${
                      (progressInfo?.stage || 1) >= 2
                        ? (progressInfo?.stage || 1) === 2
                          ? 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                      {(progressInfo?.stage || 1) > 2 ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <span
                          className={`w-3 h-3 rounded-full text-white text-[9px] flex items-center justify-center ${
                            (progressInfo?.stage || 1) === 2 ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'
                          }`}
                        >
                          2
                        </span>
                      )}
                      <span>Этап 2</span>
                    </div>
                    <div className="text-[11px] font-semibold mt-0.5 truncate">Подбор схем реза</div>
                  </div>

                  <div
                    className={`p-2 rounded-lg text-center border transition-colors ${
                      (progressInfo?.stage || 1) >= 3
                        ? 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                      <span
                        className={`w-3 h-3 rounded-full text-white text-[9px] flex items-center justify-center ${
                          (progressInfo?.stage || 1) === 3 ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        3
                      </span>
                      <span>Этап 3</span>
                    </div>
                    <div className="text-[11px] font-semibold mt-0.5 truncate">Минимизация отходов</div>
                  </div>
                </div>
              </div>

              {/* Live Counters Quartet */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block">
                    Разложено деталей
                  </span>
                  <div className="text-base sm:text-lg font-mono font-extrabold text-slate-900 mt-0.5">
                    {progressInfo?.placedParts ?? 0}
                    <span className="text-xs text-slate-500 font-normal">
                      {' '}
                      / {progressInfo?.totalParts || complexityEstimate?.totalParts || '—'} шт.
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {progressInfo && progressInfo.totalParts > 0
                      ? `${Math.round((progressInfo.placedParts / progressInfo.totalParts) * 100)}% спецификации`
                      : 'В процессе размещения'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block">
                    Использовано хлыстов
                  </span>
                  <div className="text-base sm:text-lg font-mono font-extrabold text-slate-900 mt-0.5">
                    {progressInfo?.usedBars ?? 0}
                    <span className="text-xs text-slate-500 font-normal"> шт.</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {progressInfo?.usedBars
                      ? `~${((progressInfo.usedBars * 6000) / 1000).toFixed(0)} м металла`
                      : 'Подбор карт'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block">
                    Текущий КИМ
                  </span>
                  <div className="text-base sm:text-lg font-mono font-extrabold text-emerald-600 mt-0.5">
                    {progressInfo?.bestKIM && progressInfo.bestKIM > 0
                      ? `${progressInfo.bestKIM.toFixed(1)}%`
                      : 'Оптимизация...'}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Полезный выход металла
                  </span>
                </div>
              </div>

              {/* Stop & Apply Button */}
              <div className="pt-2 text-center space-y-1.5">
                <button
                  type="button"
                  onClick={handleStopAndApply}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-300 rounded-xl font-bold text-xs transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-600 text-rose-600" />
                  <span>Остановить и применить текущий результат</span>
                </button>
                <p className="text-[11px] text-slate-400">
                  Вы можете прервать расчет в любой момент — будет сохранен и применен лучший найденный вариант раскроя
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Left sidebar controller banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2.5 text-slate-700 shadow-2xs">
                <Sliders className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Параметры расчета настраиваются в <strong>боковой панели слева</strong>. Для расчета нового варианта нажмите кнопку «Рассчитать раскрой» в боковой панели или шапке.
                </span>
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
                  {runs.length > 0 && (
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

                  {/* Comparative table: shown even when only 1 run is generated */}
                  {runs.length > 0 && (
                    <div className="space-y-3 pt-1">
                      {/* Comparison Toolbar: Title, Filtering, Search, and Clear */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {runs.length > 1
                              ? `Сравнение рассчитанных вариантов (${runs.length}):`
                              : `Таблица вариантов (${runs.length}):`}
                          </span>
                          <span className="text-[11px] text-slate-500 font-normal hidden md:inline">
                            Нажмите на заголовок для сортировки или на строку для выбора
                          </span>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {runs.length > 1 && (
                            <button
                              type="button"
                              onClick={handleClearRuns}
                              title="Сбросить историю расчетов и оставить только выбранный"
                              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Очистить историю</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                            <Filter className="w-3 h-3 text-slate-400" />
                            Фильтр:
                          </span>

                          <button
                            type="button"
                            onClick={() => setFilterStatus('all')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              filterStatus === 'all'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            Все ({runs.length})
                          </button>

                          <button
                            type="button"
                            onClick={() => setFilterStatus('complete')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              filterStatus === 'complete'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            Без дефицита (
                            {
                              runs.filter(
                                (r) =>
                                  !r.solution.unplacedDemand ||
                                  r.solution.unplacedDemand.length === 0 ||
                                  r.solution.unplacedDemand.every((u) => u.quantity === 0)
                              ).length
                            }
                            )
                          </button>

                          <button
                            type="button"
                            onClick={() => setFilterStatus('unplaced')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                              filterStatus === 'unplaced'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            С дефицитом (
                            {
                              runs.filter(
                                (r) =>
                                  r.solution.unplacedDemand &&
                                  r.solution.unplacedDemand.some((u) => u.quantity > 0)
                              ).length
                            }
                            )
                          </button>

                          <select
                            value={filterStrategy}
                            onChange={(e) => setFilterStrategy(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg text-xs text-slate-700 px-2 py-1 ml-1 cursor-pointer font-medium focus:outline-hidden"
                          >
                            <option value="all">Все стратегии</option>
                            <option value="variants">Схемы (Кол-во вариантов)</option>
                            <option value="min_waste">Мин. отход</option>
                            <option value="min_bars">Мин. хлыстов</option>
                            <option value="max_reusable">Деловой остаток</option>
                            <option value="prioritize_remnants">Склад</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Поиск по названию..."
                              className="w-36 sm:w-44 pl-7 pr-6 py-1 text-xs bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                            />
                            {searchQuery && (
                              <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {(filterStatus !== 'all' || filterStrategy !== 'all' || searchQuery) && (
                            <button
                              onClick={() => {
                                setFilterStatus('all');
                                setFilterStrategy('all');
                                setSearchQuery('');
                              }}
                              title="Сбросить фильтры"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Interactive Table with Split Columns and Column Sorting */}
                      <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs shadow-2xs">
                        <table className="w-full border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left text-[11px] whitespace-nowrap select-none">
                              <th
                                onClick={() => handleSortToggle('index')}
                                className="py-2 px-2.5 cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-28"
                              >
                                <div className="flex items-center gap-1">
                                  <span>Вариант</span>
                                  {renderSortIndicator('index')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('speed')}
                                className="py-2 px-2.5 cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1">
                                  <span>Скорость</span>
                                  {renderSortIndicator('speed')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('strategy')}
                                className="py-2 px-2.5 cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1">
                                  <span>Стратегия</span>
                                  {renderSortIndicator('strategy')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('dualProfile')}
                                className="py-2 px-2.5 cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1">
                                  <span>2 проф.</span>
                                  {renderSortIndicator('dualProfile')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('fillControl')}
                                className="py-2 px-2.5 cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1">
                                  <span>Контроль</span>
                                  {renderSortIndicator('fillControl')}
                                </div>
                              </th>


                              <th
                                onClick={() => handleSortToggle('kim')}
                                className="py-2 px-2.5 text-right cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-20"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>КИМ</span>
                                  {renderSortIndicator('kim')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('cards')}
                                className="py-2 px-2.5 text-right cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-16"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Карт</span>
                                  {renderSortIndicator('cards')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('spent')}
                                className="py-2 px-2.5 text-right cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-24"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Расход (м)</span>
                                  {renderSortIndicator('spent')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('reusable')}
                                className="py-2 px-2.5 text-right cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-24"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Деловой (м)</span>
                                  {renderSortIndicator('reusable')}
                                </div>
                              </th>

                              <th
                                onClick={() => handleSortToggle('waste')}
                                className="py-2 px-2.5 text-right cursor-pointer hover:bg-slate-200 transition-colors group whitespace-nowrap w-22"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Отход (м)</span>
                                  {renderSortIndicator('waste')}
                                </div>
                              </th>

                              <th className="py-2 px-3 text-center w-24 whitespace-nowrap">
                                Выбор
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAndSortedRuns.length > 0 ? (
                              filteredAndSortedRuns.map((r) => {
                                const isActive = r.id === activeRunId;
                                const isHighlighted = r.id === highlightedRunId;
                                const hasUnplaced = Boolean(
                                  r.solution.unplacedDemand &&
                                  r.solution.unplacedDemand.some((u) => u.quantity > 0)
                                );
                                const unplacedCount = r.solution.unplacedDemand
                                  ? r.solution.unplacedDemand.reduce((sum, u) => sum + (u.quantity || 0), 0)
                                  : 0;
                                const kimTheme = getKimTheme(r.solution.overallKIM, hasUnplaced);
                                const remnantTheme = getRemnantTheme(r.solution.totalReusableLength, hasUnplaced);
                                const spentMeters = Number(((r.solution.totalStockLength || 0) / 1000).toFixed(2));
                                const wasteMeters = Number(((r.solution.totalWasteLength || 0) / 1000).toFixed(2));

                                return (
                                  <tr
                                    key={r.id}
                                    onClick={() => handleSelectRun(r)}
                                    className={`border-b border-slate-100 transition-all duration-200 cursor-pointer whitespace-nowrap h-10 ${
                                      isHighlighted
                                        ? 'bg-amber-100 ring-2 ring-amber-400 font-bold'
                                        : isActive
                                        ? 'bg-blue-50/80 font-bold text-blue-950'
                                        : 'hover:bg-slate-50 text-slate-800'
                                    }`}
                                  >
                                    {/* Вариант с кругом либо красным треугольником при дефиците деталей */}
                                    <td className="py-2 px-2.5 whitespace-nowrap">
                                      <div className="flex items-center gap-2 whitespace-nowrap">
                                        {hasUnplaced ? (
                                          <div
                                            className="flex items-center text-rose-600 shrink-0 cursor-help"
                                            title={`Не все детали вошли в раскрой! Не разложено: ${unplacedCount} шт.`}
                                          >
                                            <AlertTriangle className="w-4 h-4 fill-rose-100 text-rose-600 shrink-0" />
                                          </div>
                                        ) : (
                                          <span
                                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                              isActive ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-slate-300'
                                            }`}
                                          />
                                        )}
                                        <span className={`font-semibold ${isActive ? 'text-blue-950' : 'text-slate-900'}`}>
                                          {r.title}
                                        </span>
                                        {hasUnplaced && (
                                          <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                            -{unplacedCount}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Скорость */}
                                    <td className="py-2 px-2.5 text-[11px] whitespace-nowrap text-slate-600">
                                      {getSpeedLabel(r.settings.searchSpeed)}
                                    </td>

                                    {/* Стратегия */}
                                    <td className="py-2 px-2.5 text-[11px] whitespace-nowrap font-medium text-slate-800">
                                      {getStrategyLabel(r.settings.optimizationGoal)}
                                    </td>

                                    {/* 2 профиля */}
                                    <td className="py-2 px-2.5 text-[11px] whitespace-nowrap">
                                      {r.settings.dualProfileCut ? (
                                        <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                          Да
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-normal">Нет</span>
                                      )}
                                    </td>

                                    {/* Контроль заполнения */}
                                    <td className="py-2 px-2.5 text-[11px] whitespace-nowrap font-mono">
                                      {r.settings.dualProfileCut && r.settings.fillControlEnabled ? (
                                        <span className="text-blue-800 font-medium">
                                          {r.settings.fillControlThreshold ?? 50}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-normal">—</span>
                                      )}
                                    </td>


                                    {/* КИМ */}
                                    <td className={`py-2 px-2.5 text-right font-mono whitespace-nowrap ${kimTheme.tableText}`}>
                                      {r.solution.overallKIM.toFixed(2)}%
                                    </td>

                                    {/* Карт раскроя */}
                                    <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCardsTheme(r.solution.rows.length, hasUnplaced)}`}>
                                      {r.solution.rows.length}
                                    </td>

                                    {/* Расход хлыстов (м) */}
                                    <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getSpentTheme(spentMeters, hasUnplaced)}`}>
                                      {((r.solution.totalStockLength || 0) / 1000).toFixed(1)} м
                                    </td>

                                    {/* Деловой остаток (м) */}
                                    <td className={`py-2 px-2.5 text-right font-mono whitespace-nowrap ${remnantTheme.tableText}`}>
                                      {(r.solution.totalReusableLength / 1000).toFixed(2)}
                                    </td>

                                    {/* Отход и резы (м) */}
                                    <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getWasteTheme(wasteMeters, hasUnplaced)}`}>
                                      {(r.solution.totalWasteLength / 1000).toFixed(2)}
                                    </td>

                                    {/* Выбор */}
                                    <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                      {isActive ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-md whitespace-nowrap shadow-xs">
                                          <Check className="w-3 h-3" />
                                          Активен
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-slate-500 hover:text-blue-600 font-medium whitespace-nowrap">
                                          Выбрать
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={12} className="py-6 text-center text-slate-400 text-xs">
                                  Нет вариантов, соответствующих выбранным фильтрам
                                </td>
                              </tr>
                            )}
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
    </>
  );
};
