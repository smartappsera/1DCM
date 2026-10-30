/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { SettingsHeader } from './components/SettingsHeader';
import { DynamicInputBlock, DynamicRowItem } from './components/DynamicInputBlock';
import { SolutionOutputView } from './components/SolutionOutputView';
import { PrintReports } from './components/PrintReports';
import { ExcelPasteModal } from './components/ExcelPasteModal';
import { CalculationProgressModal, CalculationRun } from './components/CalculationProgressModal';
import { solveLinearCutting, recalculateSolutionWithSettings } from './utils/cuttingEngine';
import { exportSolutionToExcel } from './utils/dataIO';
import {
  AppSettings,
  FullOptimizationSolution,
  StockItem,
  DemandItem,
} from './types/cutting';
import { Play } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'visualizer' | 'reports'>('workspace');
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<'stock' | 'demand'>('demand');
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
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
    fillControlEnabled: false,
    fillControlThreshold: 50,
    groupSolutions: true,
    showGraphics: true,
    searchSpeed: 'fast',
    optimizationGoal: 'variants',
  });

  // Stocks («Есть») initialized with pinned standard bars + benchmark remnants
  // Point 10: Default state of standard bars checkboxes: unchecked (isActive: false)
  const [stockItems, setStockItems] = useState<DynamicRowItem[]>([
    {
      id: 's_std_6000',
      orderIndex: 1,
      length: 6000,
      quantity: 0,
      isStandard: true,
      isActive: false,
      isStandardUnlimited: true,
      mark: 'Стандарт',
    },
    {
      id: 's_std_12000',
      orderIndex: 2,
      length: 12000,
      quantity: 0,
      isStandard: true,
      isActive: false,
      isStandardUnlimited: true,
      mark: 'Стандарт',
    },
    { id: 's2', orderIndex: 3, length: 2630, quantity: 18, mark: 'Склад', isActive: true },
    { id: 's3', orderIndex: 4, length: 580, quantity: 100, mark: 'Склад', isActive: true },
  ]);

  // Demands («Нужно») initialized with the exact benchmark from Screenshot 3
  const [demandItems, setDemandItems] = useState<DynamicRowItem[]>([
    { id: 'd1', orderIndex: 1, length: 5230, quantity: 30 },
    { id: 'd2', orderIndex: 2, length: 150, quantity: 400 },
    { id: 'd3', orderIndex: 3, length: 320, quantity: 30 },
    { id: 'd4', orderIndex: 4, length: 280, quantity: 50 },
    { id: 'd5', orderIndex: 5, length: 800, quantity: 150 },
    { id: 'd6', orderIndex: 6, length: 810, quantity: 150 },
  ]);

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
      .map((d) => ({
        id: d.id,
        orderIndex: d.orderIndex,
        length: d.length,
        quantity: d.quantity,
        mark: d.mark,
        notes: d.notes,
      }));

    const res = solveLinearCutting(stocks, demands, currentSettings);
    setSolution(res);
    setLastSolvedSettings(currentSettings);
    return res;
  };

  const handleStartCalculation = () => {
    // Open progress modal immediately with 0 delay for seamless UX
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
    const demands: DemandItem[] = demandItems.map((d) => ({
      id: d.id,
      orderIndex: d.orderIndex,
      length: d.length,
      quantity: d.quantity,
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
        id: 's_std_6000',
        orderIndex: 1,
        length: 6000,
        quantity: 0,
        isStandard: true,
        isActive: true,
        isStandardUnlimited: true,
        mark: 'Стандарт',
      },
      {
        id: 's_std_12000',
        orderIndex: 2,
        length: 12000,
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
      { id: 'd1', orderIndex: 1, length: 5230, quantity: 30 },
      { id: 'd2', orderIndex: 2, length: 150, quantity: 400 },
      { id: 'd3', orderIndex: 3, length: 320, quantity: 30 },
      { id: 'd4', orderIndex: 4, length: 280, quantity: 50 },
      { id: 'd5', orderIndex: 5, length: 800, quantity: 150 },
      { id: 'd6', orderIndex: 6, length: 810, quantity: 150 },
    ]);

    setSolution(null);
    setLastSolvedSettings(null);
    setSavedRuns([]);
  };

  const handleImportClipboard = (
    items: { mark: string; length: number; quantity: number; notes?: string }[]
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
      }));
      setDemandItems((prev) => [...prev, ...newItems]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white notranslate" translate="no">
      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onCalculate={handleStartCalculation}
        onPrint={() => setActiveTab('reports')}
        onExportExcel={handleExportExcel}
        hasResults={Boolean(solution && solution.rows.length > 0)}
        onLoadBenchmarkExample={handleLoadBenchmarkExample}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Workspace Tab: ONLY 3 BLOCKS + Calculate Button */}
        {activeTab === 'workspace' && (
          <div className="space-y-6">
            {/* Block 1: Parameters (SettingsHeader) */}
            <SettingsHeader
              settings={settings}
              setSettings={setSettings}
              onLoadBenchmarkExample={handleLoadBenchmarkExample}
            />

            {/* Block 2: «Есть» (Склад) + «Осталось» */}
            <DynamicInputBlock
              title="Есть"
              companionTitle="Осталось"
              items={stockItems}
              setItems={setStockItems}
              companionItems={solution?.remainingWarehouseStock || []}
              usedOrPlacedColHeader="Использовано"
              remainingColHeader="Не использов."
              currentMaterial={settings.material}
              onMaterialChange={(newMat) => setSettings((prev) => ({ ...prev, material: newMat }))}
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
              getUsedOrPlaced={getDemandPlaced}
              getRemaining={getDemandUnplaced}
              hasCalculated={Boolean(solution)}
              onOpenPasteModal={() => {
                setPasteTarget('demand');
                setIsPasteModalOpen(true);
              }}
            />

            {/* Prominent Calculation Action Button */}
            <div className="flex justify-center pt-2 pb-6">
              <button
                onClick={handleStartCalculation}
                className="flex items-center gap-3 px-8 py-4 text-base font-extrabold text-white bg-blue-600 hover:bg-blue-500 rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Рассчитать оптимальный раскрой</span>
              </button>
            </div>
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
            onPrint={() => setActiveTab('reports')}
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
                wasteLength: r.waste,
                isReusableWaste: r.isReusable,
                reusableLength: r.isReusable ? r.waste : 0,
                scrapLength: !r.isReusable ? r.waste : 0,
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
              strategy: 'best_fit',
              projectName: settings.orderNumber || 'Заказ',
              materialName: settings.material || 'Профиль',
              orderNumber: settings.orderNumber || '1',
            }}
            demands={demandItems.map((d) => ({
              id: d.id,
              mark: `Д-${d.length}`,
              length: d.length,
              quantity: d.quantity,
              color: '#3B82F6',
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
      </main>

      {/* Progress, Comparison & Parameter Tuning Modal */}
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
        onGoToResults={() => setActiveTab('visualizer')}
      />

      {/* Paste from Excel Clipboard Modal */}
      <ExcelPasteModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onImport={handleImportClipboard}
        targetTitle={pasteTarget === 'stock' ? 'Есть (Склад)' : 'Нужно (Спецификация)'}
      />
    </div>
  );
}
