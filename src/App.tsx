/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { SettingsSidebar } from './components/SettingsSidebar';
import { CalculationSpoiler } from './components/CalculationSpoiler';
import { DynamicInputBlock, DynamicRowItem } from './components/DynamicInputBlock';
import { SolutionOutputView } from './components/SolutionOutputView';
import { PrintReports } from './components/PrintReports';
import { ExcelPasteModal } from './components/ExcelPasteModal';
import { CalculationProgressModal, CalculationRun } from './components/CalculationProgressModal';
import { FeedbackDonationModal } from './components/FeedbackDonationModal';
import { AuditTelemetryModal } from './components/AuditTelemetryModal';
import { solveLinearCutting, recalculateSolutionWithSettings, getDefaultDemandColor } from './utils/cuttingEngine';
import { exportSolutionToExcel } from './utils/dataIO';
import {
  AppSettings,
  FullOptimizationSolution,
  StockItem,
  DemandItem,
} from './types/cutting';
import { Play, Lock, Unlock } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'visualizer' | 'reports'>('workspace');
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  const TAB_ORDER: Record<'workspace' | 'visualizer' | 'reports', number> = {
    workspace: 0,
    visualizer: 1,
    reports: 2,
  };

  const handleTabChange = (newTab: 'workspace' | 'visualizer' | 'reports') => {
    if (newTab === activeTab) return;
    const currentIdx = TAB_ORDER[activeTab];
    const nextIdx = TAB_ORDER[newTab];
    setSlideDirection(nextIdx > currentIdx ? 'left' : 'right');
    setActiveTab(newTab);
  };

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<'stock' | 'demand'>('demand');
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [calcTriggerNonce, setCalcTriggerNonce] = useState(0);
  const [lastSolvedSettings, setLastSolvedSettings] = useState<AppSettings | null>(null);
  const [savedRuns, setSavedRuns] = useState<CalculationRun[]>([]);

  // Settings matching user's Excel VBA
  const [settings, setSettings] = useState<AppSettings>({
    material: 'Труба профильная 60х40х2',
    orderNumber: 'ПР-01',
    bladeWidth: 3,
    edgeTrim: 0,
    reusableRemnantMin: 250, // Yields 98.60% KIM matching Screenshot 5 & 6
    cutAngle45: false,
    dualProfileCut: true,
    prioritizeRemnants: false,
    fillControlEnabled: false,
    fillControlThreshold: 50,
    groupSolutions: true,
    showGraphics: true,
    searchSpeed: 'fast',
    optimizationGoal: 'variants',
    targetRemnantMinLength: 1500,
  });

  // Stocks («Есть») initialized with pinned standard bars + benchmark remnants
  // Stocks («Есть») initialized with pinned standard bars disabled by default
  const [stockItems, setStockItems] = useState<DynamicRowItem[]>([
    {
      id: 's_std_12000',
      orderIndex: 1,
      length: 12000,
      quantity: 0,
      isStandard: true,
      isActive: false,
      isStandardUnlimited: true,
      mark: 'Стандарт',
    },
    {
      id: 's_std_6000',
      orderIndex: 2,
      length: 6000,
      quantity: 0,
      isStandard: true,
      isActive: false,
      isStandardUnlimited: true,
      mark: 'Стандарт',
    },
  ]);

  // Demands («Нужно») initialized empty by default
  const [demandItems, setDemandItems] = useState<DynamicRowItem[]>([]);

  // Solution is initially null: results page is NOT visible until calculate is pressed!
  const [solution, setSolution] = useState<FullOptimizationSolution | null>(null);

  // Compute a deterministic signature of active stock and demand items
  const inputSignature = useMemo(() => {
    const activeStocks = stockItems
      .filter((s) => s.isActive !== false && s.length > 0)
      .map(
        (s) =>
          `${s.length}:${s.quantity}:${
            s.isStandardUnlimited ||
            ((s.length === 6000 || s.length === 12000) && s.quantity <= 0)
              ? 'U'
              : 'Q'
          }`
      )
      .sort()
      .join(';');

    const activeDemands = demandItems
      .filter((d) => d.length > 0 && d.quantity > 0)
      .map((d) => `${d.length}:${d.quantity}`)
      .sort()
      .join(';');

    return `${activeStocks}|${activeDemands}`;
  }, [stockItems, demandItems]);

  // Point 4: Deterministic signature of demand items to invalidate obsolete runs
  const demandSignature = useMemo(() => {
    return demandItems
      .map((d) => `${d.id}:${d.length}:${d.quantity}:${d.mark || ''}`)
      .join('|');
  }, [demandItems]);

  const prevDemandSigRef = useRef<string>(demandSignature);
  useEffect(() => {
    if (prevDemandSigRef.current !== demandSignature) {
      prevDemandSigRef.current = demandSignature;
      // When demand items change, delete stale runs and clear solution
      if (savedRuns.length > 0 || solution) {
        setSavedRuns([]);
        setSolution(null);
        setLastSolvedSettings(null);
      }
    }
  }, [demandSignature, savedRuns.length, solution]);

  // Synchronize solution piece colors dynamically when demandItem colors are customized
  useEffect(() => {
    if (!solution || solution.rows.length === 0) return;
    const colorMap = new Map<number, string>();
    demandItems.forEach((d) => {
      if (d.color && !colorMap.has(d.length)) colorMap.set(d.length, d.color);
    });

    let needsUpdate = false;
    for (const row of solution.rows) {
      for (const p of row.pieces) {
        const expectedColor = colorMap.get(p.length);
        if (expectedColor && p.color !== expectedColor) {
          needsUpdate = true;
          break;
        }
      }
      if (needsUpdate) break;
    }

    if (needsUpdate) {
      setSolution((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          rows: prev.rows.map((row) => ({
            ...row,
            pieces: row.pieces.map((p) => ({
              ...p,
              color: colorMap.get(p.length) || p.color,
            })),
            layoutItems: row.layoutItems.map((lay) => {
              if (lay.isTrim || lay.isWaste) return lay;
              return {
                ...lay,
                color: colorMap.get(lay.length) || lay.color,
              };
            }),
          })),
        };
      });
    }
  }, [demandItems, solution]);

  // Point 2: Material change handler with lock semantics
  const handleMaterialChange = (newMat: string, source: 'file' | 'manual' = 'manual') => {
    setSettings((prev) => ({
      ...prev,
      material: newMat,
      isMaterialLocked: source === 'file' ? true : prev.isMaterialLocked,
      materialLockSource: source === 'file' ? 'file' : prev.materialLockSource,
    }));
  };

  const handleToggleMaterialLock = () => {
    if (settings.materialLockSource === 'file') {
      // Cannot manually unlock if set by file from CSV/XML
      return;
    }
    setSettings((prev) => ({
      ...prev,
      isMaterialLocked: !prev.isMaterialLocked,
      materialLockSource: !prev.isMaterialLocked ? 'manual' : null,
    }));
  };

  const [isDemandLocked, setIsDemandLocked] = useState<boolean>(false);
  const [showDemandUnlockConfirm, setShowDemandUnlockConfirm] = useState<boolean>(false);

  // Check for deficit transfer task from other browser tab/window
  useEffect(() => {
    const checkDeficitHash = () => {
      if (window.location.hash.includes('deficit_task')) {
        try {
          const raw = localStorage.getItem('pending_deficit_payload');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.items && Array.isArray(parsed.items)) {
              setDemandItems(parsed.items);
              if (parsed.material) {
                setSettings((prev) => ({
                  ...prev,
                  material: parsed.material,
                  orderNumber: parsed.orderNumber || `${prev.orderNumber || 'ПР'}-ДЕФИЦИТ`,
                }));
              }
              setSolution(null);
              setSavedRuns([]);
              setIsDemandLocked(false);
            }
            localStorage.removeItem('pending_deficit_payload');
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {
          console.warn('Failed to parse deficit payload:', err);
        }
      }
    };
    checkDeficitHash();
    window.addEventListener('hashchange', checkDeficitHash);
    return () => {
      window.removeEventListener('hashchange', checkDeficitHash);
    };
  }, []);

  const performSolve = (customSettings?: AppSettings) => {
    const currentSettings = customSettings || settings;

    const stocks: StockItem[] = stockItems
      .filter((s) => s.isActive !== false)
      .filter((s) => {
        if (s.length <= 0) return false;
        // Standard length bars (6000, 12000) or explicit isStandardUnlimited can have quantity === 0 (auto-calculate)
        if (s.isStandardUnlimited || ((s.length === 6000 || s.length === 12000) && s.quantity <= 0)) {
          return true;
        }
        return s.quantity > 0;
      })
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

    const demands: DemandItem[] = demandItems
      .filter((d) => d.length > 0 && d.quantity > 0)
      .map((d, dIdx) => ({
        id: d.id,
        orderIndex: d.orderIndex,
        length: d.length,
        quantity: d.quantity,
        mark: d.mark,
        notes: d.notes,
        color: d.color || getDefaultDemandColor(dIdx, d.length),
      }));

    const res = solveLinearCutting(stocks, demands, currentSettings);
    setSolution(res);
    setLastSolvedSettings(currentSettings);
    setIsDemandLocked(true);
    return res;
  };

  const handleStartCalculation = () => {
    setIsDemandLocked(true);
    // Increment calc trigger nonce to notify comparison modal if already open
    setCalcTriggerNonce((prev) => prev + 1);
    setIsProgressModalOpen(true);
  };

  const handleApplySettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (!solution) return;

    const isCoreDimensionChanged =
      newSettings.bladeWidth !== settings.bladeWidth ||
      newSettings.edgeTrim !== settings.edgeTrim ||
      newSettings.optimizationGoal !== settings.optimizationGoal ||
      newSettings.targetRemnantKIM !== settings.targetRemnantKIM ||
      newSettings.targetRemnantMinLength !== settings.targetRemnantMinLength ||
      newSettings.dualProfileCut !== settings.dualProfileCut ||
      newSettings.cutAngle45 !== settings.cutAngle45 ||
      newSettings.groupSolutions !== settings.groupSolutions;

    if (isCoreDimensionChanged) {
      performSolve(newSettings);
    } else {
      const updated = recalculateSolutionWithSettings(
        solution,
        newSettings,
        stockItems.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          length: s.length,
          quantity: s.quantity,
          isActive: s.isActive !== false,
          isStandardUnlimited:
            s.isStandardUnlimited ||
            ((s.length === 6000 || s.length === 12000) && s.quantity <= 0),
          mark: s.mark,
          notes: s.notes,
        }))
      );
      setSolution(updated);
    }
  };

  // Derived lookups for Stock table without any state mutation
  const getStockUsed = (item: DynamicRowItem): number => {
    if (!solution) return 0;
    // Count directly from actual solution rows for precision
    const usedCount = solution.rows
      .filter((r) => r.barSize === item.length)
      .reduce((sum, r) => sum + r.barsCount, 0);
    return usedCount;
  };

  const getStockRemaining = (item: DynamicRowItem): number => {
    if (!solution) return 0;
    const isAuto =
      item.isStandardUnlimited ||
      ((item.length === 6000 || item.length === 12000) && item.quantity <= 0);
    if (isAuto) return 0;
    const usedCount = solution.rows
      .filter((r) => r.barSize === item.length)
      .reduce((sum, r) => sum + r.barsCount, 0);
    return Math.max(0, item.quantity - usedCount);
  };

  // Derived lookups for Demand table without any state mutation
  const getDemandPlaced = (item: DynamicRowItem): number => {
    if (!solution) return 0;
    const unplacedObj = solution.unplacedDemand.find((u) => u.length === item.length);
    const unplacedQty = unplacedObj ? unplacedObj.quantity : 0;
    return Math.max(0, item.quantity - unplacedQty);
  };

  const getDemandUnplaced = (item: DynamicRowItem): number => {
    if (!solution) return 0;
    const unplacedObj = solution.unplacedDemand.find((u) => u.length === item.length);
    return unplacedObj ? unplacedObj.quantity : 0;
  };

  const handleExportExcel = () => {
    if (!solution) return;
    const stocks: StockItem[] = stockItems.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      length: s.length,
      quantity: s.quantity,
    }));
    const demands: DemandItem[] = demandItems.map((d, dIdx) => ({
      id: d.id,
      orderIndex: d.orderIndex,
      length: d.length,
      quantity: d.quantity,
      mark: d.mark,
      notes: d.notes,
      color: d.color || getDefaultDemandColor(dIdx, d.length),
    }));
    exportSolutionToExcel(solution, settings, stocks, demands);
  };

  const handleLoadBenchmarkExample = () => {
    setSettings((prev) => ({
      ...prev,
      material: 'Труба профильная 60х40х2',
      orderNumber: 'ПР-01',
      bladeWidth: 3,
      edgeTrim: 0,
      reusableRemnantMin: 250,
      groupSolutions: true,
      showGraphics: true,
    }));

    setStockItems([
      {
        id: 's_std_12000',
        orderIndex: 1,
        length: 12000,
        quantity: 0,
        isStandard: true,
        isActive: true,
        isStandardUnlimited: true,
        mark: 'Стандарт',
      },
      {
        id: 's_std_6000',
        orderIndex: 2,
        length: 6000,
        quantity: 0,
        isStandard: true,
        isActive: true,
        isStandardUnlimited: true,
        mark: 'Стандарт',
      },
      { id: 's2', orderIndex: 3, length: 2630, quantity: 18, mark: 'Склад', isActive: true },
      { id: 's3', orderIndex: 4, length: 580, quantity: 100, mark: 'Склад', isActive: true },
    ]);

    setDemandItems([
      { id: 'd1', orderIndex: 1, length: 5230, quantity: 31, mark: '1', color: '#F87171' },
      { id: 'd2', orderIndex: 2, length: 150, quantity: 400, mark: '2', color: '#4ADE80' },
      { id: 'd3', orderIndex: 3, length: 320, quantity: 30, mark: '3', color: '#6366F1' },
      { id: 'd4', orderIndex: 4, length: 280, quantity: 50, mark: '4', color: '#FACC15' },
      { id: 'd5', orderIndex: 5, length: 800, quantity: 150, mark: '5', color: '#E879F9' },
      { id: 'd6', orderIndex: 6, length: 810, quantity: 150, mark: '6', color: '#38BDF8' },
      { id: 'd7', orderIndex: 7, length: 564, quantity: 1200, mark: '7', color: '#FB923C' },
      { id: 'd8', orderIndex: 8, length: 312, quantity: 112, mark: '8', color: '#2DD4BF' },
      { id: 'd9', orderIndex: 9, length: 85, quantity: 1224, mark: '9', color: '#A78BFA' },
      { id: 'd10', orderIndex: 10, length: 5300, quantity: 1120, mark: '10', color: '#F472B6' },
      { id: 'd11', orderIndex: 11, length: 788, quantity: 15, mark: '11', color: '#34D399' },
      { id: 'd12', orderIndex: 12, length: 99, quantity: 12, mark: '12', color: '#60A5FA' },
      { id: 'd13', orderIndex: 13, length: 780, quantity: 130, mark: '13', color: '#FBBF24' },
      { id: 'd14', orderIndex: 14, length: 1144, quantity: 780, mark: '14', color: '#C084FC' },
      { id: 'd15', orderIndex: 15, length: 3288, quantity: 600, mark: '15', color: '#F43F5E' },
      { id: 'd16', orderIndex: 16, length: 2500, quantity: 600, mark: '16', color: '#14B8A6' },
      { id: 'd17', orderIndex: 17, length: 1320, quantity: 600, mark: '17', color: '#818CF8' },
      { id: 'd18', orderIndex: 18, length: 4212, quantity: 35, mark: '18', color: '#FB7185' },
      { id: 'd19', orderIndex: 19, length: 4220, quantity: 140, mark: '19', color: '#A3E635' },
      { id: 'd20', orderIndex: 20, length: 879, quantity: 4500, mark: '20', color: '#06B6D4' },
      { id: 'd21', orderIndex: 21, length: 1111, quantity: 4500, mark: '21', color: '#E11D48' },
      { id: 'd22', orderIndex: 22, length: 400, quantity: 100, mark: '22', color: '#0EA5E9' },
    ]);

    setSolution(null);
    setLastSolvedSettings(null);
    setSavedRuns([]);
  };

  const handleImportClipboard = (
    items: { mark: string; length: number; quantity: number; notes?: string; color?: string }[]
  ) => {
    if (pasteTarget === 'stock') {
      const newItems: DynamicRowItem[] = items.map((item, idx) => ({
        id: `imp_stk_${Date.now()}_${idx}`,
        orderIndex: stockItems.length + idx + 1,
        length: item.length,
        quantity: item.quantity,
        mark: item.mark || '',
        notes: item.notes || '',
        isStandardUnlimited:
          (item.length === 6000 || item.length === 12000) && item.quantity === 0,
      }));
      setStockItems((prev) => [...prev, ...newItems]);
    } else {
      const newItems: DynamicRowItem[] = items.map((item, idx) => ({
        id: `imp_dmd_${Date.now()}_${idx}`,
        orderIndex: demandItems.length + idx + 1,
        length: item.length,
        quantity: item.quantity,
        mark: item.mark || '',
        notes: item.notes || '',
        color: item.color || getDefaultDemandColor(demandItems.length + idx, item.length),
      }));
      setDemandItems((prev) => [...prev, ...newItems]);
    }
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white notranslate overflow-hidden" translate="no">
      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onCalculate={handleStartCalculation}
        onOpenFeedback={() => setIsFeedbackModalOpen(true)}
        onOpenAudit={() => setIsAuditModalOpen(true)}
        onPrint={() => handleTabChange('reports')}
        onExportExcel={handleExportExcel}
        hasResults={Boolean(solution && solution.rows.length > 0)}
        onLoadBenchmarkExample={handleLoadBenchmarkExample}
      />

      {/* Main Workbench Layout: Left Persistent Sidebar + Optional Calculation Spoiler + Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Full-Height Settings Sidebar (or collapsed vertical spoiler) */}
        <SettingsSidebar
          settings={settings}
          setSettings={setSettings}
          isOpen={isSettingsOpen}
          setIsOpen={setIsSettingsOpen}
          onCalculate={handleStartCalculation}
          onLoadBenchmarkExample={handleLoadBenchmarkExample}
          hasResults={Boolean(solution && solution.rows.length > 0)}
        />

        {/* Calculation Comparison Vertical Spoiler (visible when calculations exist and panel is collapsed) */}
        {Boolean(solution || savedRuns.length > 0) && !isProgressModalOpen && (
          <CalculationSpoiler
            runsCount={savedRuns.length > 0 ? savedRuns.length : (solution ? 1 : 0)}
            activeKIM={solution?.overallKIM}
            onOpen={() => setIsProgressModalOpen(true)}
          />
        )}

        {/* Main Content Pane */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 space-y-6">
          <div
            key={activeTab}
            className={`w-full max-w-7xl mx-auto ${slideDirection === 'left' ? 'animate-slide-left' : 'animate-slide-right'}`}
          >
            {/* Workspace Tab: ONLY Tables «Есть»/«Осталось» and «Нужно»/«Не сделано» + Calculate Button */}
            {activeTab === 'workspace' && (
              <div className="space-y-4">
                {/* Point 1: Top bar order: № заказа -> Комментарий -> Материал */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  {/* 1. Order Number */}
                  <div className="flex items-center gap-2 min-w-[190px]">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      № заказа:
                    </label>
                    <input
                      type="text"
                      value={settings.orderNumber || ''}
                      onChange={(e) => setSettings((prev) => ({ ...prev, orderNumber: e.target.value }))}
                      placeholder="ПР-01"
                      className="flex-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                    />
                  </div>

                  {/* 2. Order Comment (Requirement 1: Поле КОММЕНТАРИЙ расположить после поля № ЗАКАЗА) */}
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Комментарий:
                    </label>
                    <input
                      type="text"
                      value={settings.orderComment || ''}
                      onChange={(e) => setSettings((prev) => ({ ...prev, orderComment: e.target.value }))}
                      placeholder="Примечание к заказу..."
                      className="flex-1 px-2.5 py-1 text-xs font-normal text-slate-800 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  {/* 3. Material with Lock/Unlock Button */}
                  <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Материал:
                    </label>
                    <div className="relative flex-1 flex items-center">
                      <input
                        type="text"
                        value={settings.material || ''}
                        disabled={settings.isMaterialLocked}
                        onChange={(e) => setSettings((prev) => ({ ...prev, material: e.target.value }))}
                        placeholder="Наименование профиля/материала"
                        className={`w-full pl-2.5 pr-8 py-1 text-xs font-bold rounded-lg border transition-all ${
                          settings.isMaterialLocked
                            ? 'bg-slate-100 text-slate-700 border-slate-300 cursor-not-allowed select-none'
                            : 'bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleToggleMaterialLock}
                        disabled={settings.materialLockSource === 'file'}
                        title={
                          settings.materialLockSource === 'file'
                            ? 'Заблокировано источником остатков (CSV/XML). Ручное снятие блокировки запрещено.'
                            : settings.isMaterialLocked
                            ? 'Заблокировано вручную. Нажмите, чтобы разблокировать.'
                            : 'Разблокировано. Нажмите, чтобы заблокировать наименование.'
                        }
                        className={`absolute right-1 p-1 rounded-md transition-colors ${
                          settings.materialLockSource === 'file'
                            ? 'text-amber-600 bg-amber-50 cursor-not-allowed opacity-90'
                            : settings.isMaterialLocked
                            ? 'text-blue-600 hover:bg-blue-50 cursor-pointer'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer'
                        }`}
                      >
                        {settings.isMaterialLocked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Block 1: «Есть» (Склад) + «Осталось» */}
                <DynamicInputBlock
                  title="Есть"
                  companionTitle="Осталось"
                  items={stockItems}
                  setItems={setStockItems}
                  companionItems={solution?.remainingWarehouseStock || []}
                  usedOrPlacedColHeader="Использовано"
                  remainingColHeader="Не использов."
                  currentMaterial={settings.material}
                  onMaterialChange={handleMaterialChange}
                  onUnlockMaterial={() =>
                    setSettings((prev) => ({
                      ...prev,
                      isMaterialLocked: false,
                      materialLockSource: null,
                    }))
                  }
                  getUsedOrPlaced={getStockUsed}
                  getRemaining={getStockRemaining}
                  hasCalculated={Boolean(solution)}
                  onOpenPasteModal={() => {
                    setPasteTarget('stock');
                    setIsPasteModalOpen(true);
                  }}
                />

                {/* Block 3: «Нужно» (Спецификация) + «Не сделано» */}
                <DynamicInputBlock
                  title="Нужно"
                  companionTitle="Не сделано"
                  items={demandItems}
                  setItems={setDemandItems}
                  companionItems={solution?.unplacedDemand || []}
                  usedOrPlacedColHeader="Разложено"
                  remainingColHeader="Не разложено"
                  currentMaterial={settings.material}
                  isLocked={isDemandLocked}
                  onRequestUnlock={() => setShowDemandUnlockConfirm(true)}
                  getUsedOrPlaced={getDemandPlaced}
                  getRemaining={getDemandUnplaced}
                  hasCalculated={Boolean(solution)}
                  onOpenPasteModal={() => {
                    setPasteTarget('demand');
                    setIsPasteModalOpen(true);
                  }}
                />

                {/* Requirement 4: Confirmation modal before unlocking and modifying НУЖНО */}
                {showDemandUnlockConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                      <div className="flex items-center gap-3 text-amber-600 mb-3">
                        <div className="p-2.5 bg-amber-100 rounded-xl">
                          <Lock className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                            Разблокировка спецификации
                          </h3>
                          <span className="text-xs text-slate-500">
                            Очистка вариантов и пересчет эталонов
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed mb-5">
                        Изменение спецификации <strong>«НУЖНО»</strong> приведет к удалению всех вариантов из сравнительной таблицы и обязательному пересчету эталонов. Вы уверены, что хотите разблокировать спецификацию?
                      </p>

                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowDemandUnlockConfirm(false)}
                          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDemandLocked(false);
                            setSavedRuns([]);
                            setSolution(null);
                            setLastSolvedSettings(null);
                            setShowDemandUnlockConfirm(false);
                          }}
                          className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors cursor-pointer shadow-sm"
                        >
                          Разблокировать и очистить варианты
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

        {/* Results Tab: Visible after calculation */}
        {activeTab === 'visualizer' && solution && (
          <SolutionOutputView
            solution={solution}
            settings={settings}
            setSettings={setSettings}
            stockInput={stockItems.map((s) => ({
              id: s.id,
              orderIndex: s.orderIndex,
              length: s.length,
              quantity: s.quantity,
            }))}
            onApplySettings={handleApplySettings}
            onExportExcel={handleExportExcel}
            onPrint={() => handleTabChange('reports')}
          />
        )}

        {/* Reports Tab: Production Work Order & Component Labels */}
        {activeTab === 'reports' && solution && (
          <PrintReports
            result={{
              patterns: solution.rows.map((r) => ({
                id: r.id,
                patternIndex: r.barIndex,
                stockBarId: 's1',
                stockName: `Хлыст ${r.barSize} мм`,
                stockLength: r.barSize,
                trimStart: settings.edgeTrim,
                trimEnd: 0,
                bladeWidth: settings.bladeWidth,
                cuts: r.pieces.flatMap((p) =>
                  Array.from({ length: p.count }).map((_, cIdx) => ({
                    id: `${r.id}_${p.length}_${cIdx}`,
                    partId: `part_${p.length}`,
                    mark: `Д-${p.length}`,
                    length: p.length,
                    startOffset: 0,
                    endOffset: 0,
                    color: p.color,
                  }))
                ),
                totalPartsLength: r.spent,
                totalKerfLength: r.pieces.reduce(
                  (sum, p) => sum + p.count * settings.bladeWidth,
                  0
                ),
                wasteLength: r.isReusable ? (r.reusableRemnant || 0) : (r.scrapRemnant || r.waste),
                isReusableWaste: r.isReusable,
                reusableLength: r.isReusable ? (r.reusableRemnant || 0) : 0,
                scrapLength: r.isReusable ? r.waste : (r.scrapRemnant || r.waste),
                efficiencyPercent: r.efficiency,
                count: r.barsCount,
              })),
              totalStockBarsUsed: solution.totalBarsUsed,
              totalStockLengthUsed: solution.totalStockLength,
              totalPartsLength: solution.totalSpentLength,
              totalWasteLength: solution.totalWasteLength,
              totalReusableLength: solution.totalReusableLength,
              totalScrapLength: solution.totalWasteLength,
              totalKerfLoss:
                solution.totalStockLength -
                solution.totalSpentLength -
                solution.totalWasteLength,
              overallEfficiencyPercent: solution.overallKIM,
              unfulfilledDemand: solution.unplacedDemand.map((u) => ({
                partId: `u_${u.length}`,
                mark: `Д-${u.length}`,
                length: u.length,
                requested: u.quantity,
                fulfilled: 0,
                missing: u.quantity,
              })),
              calculationTimeMs: solution.calculationTimeMs,
              algorithmName: 'Excel VBA Exact Port (MyRaskroy.bas)',
            }}
            params={{
              bladeWidth: settings.bladeWidth,
              trimStart: settings.edgeTrim,
              trimEnd: 0,
              minReusableLength: settings.reusableRemnantMin,
              strategy: settings.optimizationGoal,
              projectName: settings.orderNumber || 'Заказ',
              materialName: settings.material || 'Профиль',
              orderNumber: settings.orderNumber || '1',
              reusableRemnantMin: settings.reusableRemnantMin,
              cutAngle45: settings.cutAngle45,
              dualProfileCut: settings.dualProfileCut,
              searchSpeed: settings.searchSpeed,
              orderComment: settings.orderComment,
            }}
            demands={demandItems.map((d, dIdx) => ({
              id: d.id,
              mark: d.mark || `Д-${d.length}`,
              length: d.length,
              quantity: d.quantity,
              color: d.color || getDefaultDemandColor(dIdx, d.length),
            }))}
            stocks={stockItems.map((s) => ({
              id: s.id,
              name: `Хлыст ${s.length} мм`,
              length: s.length,
              availableQuantity: s.quantity,
              isRemnant: s.length < 6000,
            }))}
          />
        )}
          </div>
        </main>
      </div>

      {/* Progress, Comparison & Parameter Tuning Modal (Docked alongside Settings Sidebar) */}
      <CalculationProgressModal
        isOpen={isProgressModalOpen}
        onClose={() => setIsProgressModalOpen(false)}
        solution={solution}
        settings={settings}
        lastSolvedSettings={lastSolvedSettings}
        inputSignature={inputSignature}
        savedRuns={savedRuns}
        onSaveRuns={setSavedRuns}
        onExecuteCalculation={(customSettings?: AppSettings) => performSolve(customSettings)}
        onApplySolutionAndSettings={(sol, newSettings) => {
          setSolution(sol);
          setSettings(newSettings);
          setLastSolvedSettings(newSettings);
        }}
        onGoToResults={() => handleTabChange('visualizer')}
        isSettingsOpen={isSettingsOpen}
        calcTriggerNonce={calcTriggerNonce}
        stockItems={stockItems}
        demandItems={demandItems}
        onSetDemandItems={setDemandItems}
      />

      {/* Paste from Excel Clipboard Modal */}
      <ExcelPasteModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onImport={handleImportClipboard}
        targetTitle={pasteTarget === 'stock' ? 'Есть (Склад)' : 'Нужно (Спецификация)'}
      />

      {/* Feedback and Crypto Donation Modal */}
      <FeedbackDonationModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      {/* System Audit & Resource Telemetry Modal */}
      <AuditTelemetryModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        runs={savedRuns.length > 0 ? savedRuns : (solution ? [{
          id: 'run_current',
          index: 1,
          title: 'Текущий расчет',
          timestamp: Date.now(),
          settings,
          solution,
        }] : [])}
        activeRunId={savedRuns[savedRuns.length - 1]?.id || 'run_current'}
        onClearHistory={() => setSavedRuns([])}
      />
    </div>
  );
}
