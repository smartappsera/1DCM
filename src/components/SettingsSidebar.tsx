import React from 'react';
import { AppSettings } from '../types/cutting';
import {
  getDefaultCustomConfig,
  resolveBatchSize,
  computeReusableRemnantMin,
  getMaxHelperThreads,
} from '../utils/cuttingEngine';
import {
  Sliders,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Play,
} from 'lucide-react';
import {
  ALGORITHM_EXTRA_OPTIONS,
  ALGORITHM_HELP,
  ANGLE_45_DISABLED_HINT,
  BATCH_HELP,
  EXACT_SOLVER_PRESET_HINT,
  FILL_CONTROL_THRESHOLD_HELP,
  GEOMETRY_HELP,
  MULTI_THREAD_DEEP_ONLY_HINT,
  MULTI_THREAD_UNAVAILABLE_HINT,
  OPTIMIZATION_OPTIONS,
  REMNANT_MIN_FILL_HELP,
  REUSABLE_REMNANT_MODE_OPTIONS,
  SEARCH_SPEED_OPTIONS,
  SHAPE_REMNANTS_THRESHOLD_HELP,
} from '../constants/cuttingHelp';
import { PercentSlider } from './PercentSlider';

interface SettingsSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCalculate: () => void;
  hasResults: boolean;
  demandItems?: { length: number; quantity: number }[];
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  settings,
  setSettings,
  isOpen,
  setIsOpen,
  onCalculate,
  hasResults,
  demandItems = [],
}) => {
  const updateSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const resolvedBatchN = resolveBatchSize(demandItems, { ...settings, batchSizeMode: 'auto' });
  const remnantMode = settings.reusableRemnantMode ?? 'manual';
  const effectiveRemnantMin =
    remnantMode === 'manual'
      ? settings.reusableRemnantMin
      : computeReusableRemnantMin(demandItems, remnantMode, settings.reusableRemnantMin);
  const remnantMinFillPct = Math.min(
    100,
    Math.max(0, settings.remnantMinFillPct ?? settings.targetRemnantKIM ?? 75)
  );
  const shapeThresholdPct = Math.min(
    100,
    Math.max(0, settings.shapeRemnantsThresholdPct ?? 50)
  );
  const shapeCutoffMm = Math.floor((Math.max(0, effectiveRemnantMin) * shapeThresholdPct) / 100);
  const fillControlThreshold = Math.min(
    100,
    Math.max(0, settings.fillControlThreshold ?? 50)
  );
  const autoHelperThreads = getMaxHelperThreads();
  const isWorkersSupported = typeof Worker !== 'undefined' && autoHelperThreads >= 2;
  const isDeepSearch = settings.searchSpeed === 'deep';
  const isExactPreset = settings.searchSpeed === 'exact';
  const isMultiThreadDisabled = !isWorkersSupported || !isDeepSearch;
  const multiThreadHint = !isWorkersSupported
    ? MULTI_THREAD_UNAVAILABLE_HINT
    : !isDeepSearch
      ? MULTI_THREAD_DEEP_ONLY_HINT
      : ALGORITHM_EXTRA_OPTIONS.find((opt) => opt.value === 'multiThreadEnabled')?.explanation || '';
  const exactSolverHint = isExactPreset
    ? EXACT_SOLVER_PRESET_HINT
    : ALGORITHM_EXTRA_OPTIONS.find((opt) => opt.value === 'exactSolverEnabled')?.explanation || '';

  // Collapsed Vertical Spoiler State
  if (!isOpen) {
    return (
      <aside
        onClick={() => setIsOpen(true)}
        className="no-print w-12 h-full bg-white border-r border-slate-200 flex flex-col items-center py-3.5 shrink-0 z-20 cursor-pointer hover:bg-slate-50 transition-colors group select-none shadow-2xs"
        title="Развернуть параметры раскроя"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="p-1.5 rounded-lg text-slate-500 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors cursor-pointer"
          title="Развернуть панель"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mt-2 group-hover:scale-105 transition-transform">
          <Sliders className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 flex items-center justify-center my-4">
          <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold uppercase tracking-wider text-slate-600 group-hover:text-blue-700 transition-colors whitespace-nowrap">
            Параметры раскроя
          </span>
        </div>

        <div className="text-[10px] font-mono text-slate-400 group-hover:text-slate-600">
          {settings.orderNumber || 'ПР-01'}
        </div>
      </aside>
    );
  }

  // Expanded Full-Height Sidebar State
  return (
    <aside className="no-print w-72 sm:w-80 h-full bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-xs transition-all duration-300 notranslate" translate="no">
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-slate-900 leading-tight">
              Параметры раскроя
            </h2>
            <span className="text-[10px] text-slate-500">
              Глобальные настройки реза
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          title="Свернуть параметры в спойлер"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Sidebar Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        {/* Block 1: Алгоритм и стратегия (СТРАТЕГИЯ И ПРОИЗВОДИТЕЛЬНОСТЬ) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Алгоритм работы
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={ALGORITHM_HELP}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Стратегия оптимизации:
              </label>
              <select
                value={settings.optimizationGoal}
                onChange={(e) =>
                  updateSetting('optimizationGoal', e.target.value as AppSettings['optimizationGoal'])
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
              >
                {OPTIMIZATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Глубина поиска:
              </label>
              <select
                value={settings.searchSpeed}
                onChange={(e) =>
                  updateSetting('searchSpeed', e.target.value as AppSettings['searchSpeed'])
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
              >
                {SEARCH_SPEED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <label
              title={multiThreadHint}
              className={`flex items-center justify-between gap-2 select-none pt-0.5 ${
                isMultiThreadDisabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={isMultiThreadDisabled}
                  checked={isWorkersSupported && (settings.multiThreadEnabled ?? false)}
                  onChange={(e) => updateSetting('multiThreadEnabled', e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-[11px] font-semibold text-slate-700">
                  Многопоточный режим
                </span>
              </span>
              <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                Потоков: авто ({autoHelperThreads})
              </span>
            </label>

            <label
              title={exactSolverHint}
              className={`flex items-center justify-between gap-2 select-none pt-0.5 ${
                isExactPreset ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={isExactPreset}
                  checked={isExactPreset || (settings.exactSolverEnabled ?? false)}
                  onChange={(e) => updateSetting('exactSolverEnabled', e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-[11px] font-semibold text-slate-700">
                  Точный решатель (LP)
                </span>
              </span>
              {isExactPreset && (
                <span className="text-[9.5px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                  пресет
                </span>
              )}
            </label>

            {settings.optimizationGoal === 'custom' && (
              <div className="p-3 bg-blue-50/80 border border-blue-200/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                  <div className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    <span>Параметры алгоритма</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateSetting('customStrategyConfig', getDefaultCustomConfig());
                    }}
                    className="text-[10px] text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    title="Сбросить к значениям по умолчанию"
                  >
                    Сброс
                  </button>
                </div>

                {/* Быстрые пресеты конфигурации */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-blue-900/80 font-semibold mr-0.5">Пресет:</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateSetting('customStrategyConfig', {
                        maxPassesMultiplier: 0.5,
                        enable2Opt: true,
                        twoOptRounds: 6,
                        enableTailConsolidation: true,
                        tailConsolidationMaxBars: 5,
                        cardMergeScrapToleranceMm: 60,
                        preferFewerCards: true,
                        remnantTargetMinLength: 1500,
                      });
                    }}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer transition-colors"
                  >
                    Быстрый
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSetting('customStrategyConfig', getDefaultCustomConfig());
                    }}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer transition-colors"
                  >
                    Баланс
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSetting('customStrategyConfig', {
                        maxPassesMultiplier: 2.0,
                        enable2Opt: true,
                        twoOptRounds: 30,
                        enableTailConsolidation: true,
                        tailConsolidationMaxBars: 15,
                        cardMergeScrapToleranceMm: 600,
                        preferFewerCards: true,
                        remnantTargetMinLength: 1500,
                      });
                    }}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer transition-colors"
                  >
                    Макс. сжатие
                  </button>
                </div>

                {/* 1. Множитель проходов / глубина поиска */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-semibold text-slate-700">Множитель проходов:</label>
                    <span className="font-mono font-bold text-blue-700">
                      {(settings.customStrategyConfig?.maxPassesMultiplier ?? 1.0).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="3.0"
                    step="0.25"
                    value={settings.customStrategyConfig?.maxPassesMultiplier ?? 1.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateSetting('customStrategyConfig', {
                        ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                        maxPassesMultiplier: val,
                      });
                    }}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>0.25x</span>
                    <span>1.0x</span>
                    <span>3.0x</span>
                  </div>
                </div>

                {/* 2. 2-Opt локальный поиск и раунды */}
                <div className="space-y-2 border-t border-blue-200/60 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[11px] font-semibold text-slate-700">2-Opt локальный поиск:</span>
                    <input
                      type="checkbox"
                      checked={settings.customStrategyConfig?.enable2Opt ?? true}
                      onChange={(e) => {
                        updateSetting('customStrategyConfig', {
                          ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                          enable2Opt: e.target.checked,
                        });
                      }}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  {(settings.customStrategyConfig?.enable2Opt ?? true) && (
                    <div className="space-y-1 pl-2 border-l-2 border-blue-300">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">Раундов 2-Opt:</span>
                        <span className="font-mono font-bold text-blue-700">
                          {settings.customStrategyConfig?.twoOptRounds ?? 15}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="50"
                        step="1"
                        value={settings.customStrategyConfig?.twoOptRounds ?? 15}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateSetting('customStrategyConfig', {
                            ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                            twoOptRounds: val,
                          });
                        }}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Tail Consolidation (Схлопывание карт) */}
                <div className="space-y-2 border-t border-blue-200/60 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[11px] font-semibold text-slate-700">Схлопывание карт хвостов:</span>
                    <input
                      type="checkbox"
                      checked={settings.customStrategyConfig?.enableTailConsolidation ?? true}
                      onChange={(e) => {
                        updateSetting('customStrategyConfig', {
                          ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                          enableTailConsolidation: e.target.checked,
                        });
                      }}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  {(settings.customStrategyConfig?.enableTailConsolidation ?? true) && (
                    <div className="space-y-2 pl-2 border-l-2 border-blue-300">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600">Пул хвостов (профилей):</span>
                          <span className="font-mono font-bold text-blue-700">
                            {settings.customStrategyConfig?.tailConsolidationMaxBars ?? 10}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="2"
                          max="20"
                          step="1"
                          value={settings.customStrategyConfig?.tailConsolidationMaxBars ?? 10}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            updateSetting('customStrategyConfig', {
                              ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                              tailConsolidationMaxBars: val,
                            });
                          }}
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600">Допуск обрезка при слиянии:</span>
                        <div className="flex items-center">
                          <input
                            type="text"
                            maxLength={4}
                            value={settings.customStrategyConfig?.cardMergeScrapToleranceMm ?? 120}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/[^0-9]/g, '');
                              updateSetting('customStrategyConfig', {
                                ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                                cardMergeScrapToleranceMm: clean === '' ? 0 : parseInt(clean, 10),
                              });
                            }}
                            className="w-14 text-xs font-mono font-bold text-slate-900 px-1.5 py-0.5 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden"
                          />
                          <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 rounded-r-md font-mono">
                            мм
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Приоритет минимального числа карт */}
                <div className="border-t border-blue-200/60 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[11px] font-semibold text-slate-700">Приоритет минимума карт:</span>
                    <input
                      type="checkbox"
                      checked={settings.customStrategyConfig?.preferFewerCards ?? true}
                      onChange={(e) => {
                        updateSetting('customStrategyConfig', {
                          ...(settings.customStrategyConfig || getDefaultCustomConfig()),
                          preferFewerCards: e.target.checked,
                        });
                      }}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    Группирует одинаковые детали в единые карты для сокращения переналадок пилы.
                  </p>
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.prioritizeRemnants ?? false}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        prioritizeRemnants: e.target.checked,
                        remnantMinFillPct: prev.remnantMinFillPct ?? prev.targetRemnantKIM ?? 75,
                      }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <span className="text-[11px] font-bold text-slate-900">
                    Приоритет остатков со склада
                  </span>
                </label>

                {settings.prioritizeRemnants && (
                  <div className="ml-6 p-2 bg-white border border-slate-200 rounded-lg">
                    <PercentSlider
                      label="Мин. заполнение остатка:"
                      value={remnantMinFillPct}
                      min={0}
                      max={100}
                      tooltip={REMNANT_MIN_FILL_HELP}
                      helperText={
                        remnantMinFillPct === 0
                          ? 'Используются остатки с любым заполнением'
                          : `На этапе 1 остатки заполняются не ниже ${remnantMinFillPct}%`
                      }
                      onChange={(val) => updateSetting('remnantMinFillPct', val)}
                    />
                  </div>
                )}
              </div>

              {/* Формирование деловых остатков + порог в % от порога делового */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.shapeRemnantsInSearch ?? false}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        shapeRemnantsInSearch: e.target.checked,
                        shapeRemnantsThresholdPct: prev.shapeRemnantsThresholdPct ?? 50,
                      }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <span className="text-[11px] font-bold text-slate-900">
                    Формировать деловые остатки
                  </span>
                </label>

                {settings.shapeRemnantsInSearch && (
                  <div className="ml-6 p-2 bg-white border border-slate-200 rounded-lg">
                    <PercentSlider
                      label="Порог обрезка (% от ДО):"
                      value={shapeThresholdPct}
                      min={0}
                      max={100}
                      tooltip={SHAPE_REMNANTS_THRESHOLD_HELP}
                      helperText={
                        effectiveRemnantMin > 0
                          ? `Перераскрой карт с обрезком > ${shapeCutoffMm} мм`
                          : 'Задайте порог делового остатка > 0 мм'
                      }
                      onChange={(val) => updateSetting('shapeRemnantsThresholdPct', val)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Block 2: Геометрия реза */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Геометрия реза
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={GEOMETRY_HELP}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Ширина реза */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Рез (пропил):
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  maxLength={2}
                  value={settings.bladeWidth}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    updateSetting('bladeWidth', clean === '' ? 0 : parseInt(clean, 10));
                  }}
                  className="w-full text-xs font-mono font-bold px-2 py-1.5 border border-slate-300 rounded-l-lg bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <span className="bg-slate-100 border border-l-0 border-slate-300 px-2 py-1.5 text-[11px] text-slate-500 rounded-r-lg font-mono">
                  мм
                </span>
              </div>
            </div>

            {/* Кромка (торцовка) */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Кромка:
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  maxLength={3}
                  value={settings.edgeTrim || ''}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    updateSetting('edgeTrim', clean === '' ? 0 : parseInt(clean, 10));
                  }}
                  placeholder="0"
                  className="w-full text-xs font-mono px-2 py-1.5 border border-slate-300 rounded-l-lg bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <span className="bg-slate-100 border border-l-0 border-slate-300 px-2 py-1.5 text-[11px] text-slate-500 rounded-r-lg font-mono">
                  мм
                </span>
              </div>
            </div>
          </div>

          {/* Порог делового остатка + 3 взаимоисключающих режима */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 block">
              Порог делового остатка:
            </label>
            <div className="flex items-center">
              <input
                type="text"
                maxLength={5}
                readOnly={remnantMode !== 'manual'}
                value={remnantMode === 'manual' ? settings.reusableRemnantMin || '' : effectiveRemnantMin}
                onChange={(e) => {
                  if (remnantMode !== 'manual') return;
                  const clean = e.target.value.replace(/[^0-9]/g, '');
                  updateSetting('reusableRemnantMin', clean === '' ? 0 : parseInt(clean, 10));
                }}
                placeholder="250"
                className={`w-full text-xs font-mono font-bold px-2.5 py-1.5 border border-slate-300 rounded-l-lg text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 ${
                  remnantMode !== 'manual'
                    ? 'bg-slate-100 text-slate-500 cursor-default'
                    : 'bg-white text-amber-700'
                }`}
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-500 rounded-r-lg font-mono">
                мм
              </span>
            </div>

            <div className="space-y-1 pt-0.5">
              {REUSABLE_REMNANT_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <input
                    type="radio"
                    name="reusableRemnantMode"
                    checked={remnantMode === option.value}
                    onChange={() => {
                      const nextMode = option.value;
                      setSettings((prev) => ({
                        ...prev,
                        reusableRemnantMode: nextMode,
                        reusableRemnantMin:
                          nextMode === 'manual'
                            ? prev.reusableRemnantMin
                            : computeReusableRemnantMin(
                                demandItems,
                                nextMode,
                                prev.reusableRemnantMin
                              ),
                      }));
                    }}
                    className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[10.5px] font-medium text-slate-700">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Рез под 45 градусов (временно отключено) */}
          <label
            className="flex items-center justify-between gap-2 select-none pt-0.5 opacity-50 cursor-not-allowed"
            title={ANGLE_45_DISABLED_HINT}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled
                checked={false}
                onChange={() => {}}
                className="w-4 h-4 rounded text-slate-400 cursor-not-allowed"
              />
              <span className="text-[11px] font-semibold text-slate-500">
                Рез под углом 45°
              </span>
            </div>
            <span className="text-[9.5px] font-semibold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">
              в разработке
            </span>
          </label>
        </div>

        {/* Block 3: Пакетный раскрой (сворачиваемый блок) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.dualProfileCut}
                onChange={(e) => updateSetting('dualProfileCut', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                Пакетный раскрой
              </span>
            </label>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={BATCH_HELP}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          {settings.dualProfileCut && (
            <div className="space-y-2.5">
              <div className="text-[10px] text-slate-500 leading-tight">
                Резка пакетами от 2 профилей (+ одиночный дорез остатка)
              </div>

              {/* Размер пакета N >= 2 */}
              <div className="p-2.5 rounded-lg border bg-white border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-800">
                    Пакетный рез, шт. (от 2):
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={(settings.batchSizeMode ?? 'auto') === 'auto'}
                      onChange={(e) => {
                        const isAuto = e.target.checked;
                        setSettings((prev) => ({
                          ...prev,
                          batchSizeMode: isAuto ? 'auto' : 'manual',
                          batchSizeN: isAuto
                            ? prev.batchSizeN
                            : Math.max(2, prev.batchSizeN ?? resolvedBatchN),
                        }));
                      }}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-[10.5px] font-semibold text-slate-700">Авто</span>
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2}
                    disabled={(settings.batchSizeMode ?? 'auto') === 'auto'}
                    value={
                      (settings.batchSizeMode ?? 'auto') === 'auto'
                        ? resolvedBatchN
                        : Math.max(2, settings.batchSizeN ?? 2)
                    }
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      updateSetting('batchSizeN', isNaN(val) ? 2 : Math.max(2, val));
                    }}
                    className="w-16 text-xs font-mono font-bold text-blue-700 px-2 py-1 border border-slate-300 rounded bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    {(settings.batchSizeMode ?? 'auto') === 'auto'
                      ? `авто: ${resolvedBatchN} шт.`
                      : 'профилей в пакете'}
                  </span>
                </div>
              </div>

              {/* Контроль заполнения */}
              <div className="p-2.5 rounded-lg border bg-white border-slate-200 space-y-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.fillControlEnabled ?? false}
                    onChange={(e) => updateSetting('fillControlEnabled', e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-slate-800">
                    Контроль заполнения
                  </span>
                </label>

                <PercentSlider
                  label="Порог КИМ:"
                  value={fillControlThreshold}
                  min={0}
                  max={100}
                  disabled={!settings.fillControlEnabled}
                  tooltip={FILL_CONTROL_THRESHOLD_HELP}
                  helperText={
                    settings.fillControlEnabled
                      ? `Дозаполнение карт по 1 шт. при чистом КИМ < ${fillControlThreshold}%`
                      : 'Включите для дозаполнения слабозаполненных пакетных карт'
                  }
                  onChange={(val) => updateSetting('fillControlThreshold', val)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Sticky Footer: Primary Calculate Button */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0">
        <button
          type="button"
          onClick={onCalculate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current shrink-0" />
          <span>{hasResults ? 'Пересчитать раскрой' : 'Рассчитать раскрой'}</span>
        </button>
      </div>
    </aside>
  );
};
