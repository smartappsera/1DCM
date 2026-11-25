import React, { useEffect, useMemo, useState } from 'react';
import { AppSettings } from '../types/cutting';
import {
  computeReusableRemnantMin,
  getMaxHelperThreads,
} from '../utils/cuttingEngine';
import {
  Sliders,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import {
  ANGLE_45_DISABLED_HINT,
  BATCH_SIZE_MAX,
  BATCH_SIZE_MIN,
  EXACT_SOLVER_PRESET_HINT,
  FILL_CONTROL_MAX,
  FILL_CONTROL_MIN,
  FILL_CONTROL_THRESHOLD_HELP,
  MULTI_THREAD_DEEP_ONLY_HINT,
  MULTI_THREAD_UNAVAILABLE_HINT,
  OPTIMIZATION_HELP,
  OPTIMIZATION_OPTIONS,
  REMNANT_MIN_FILL_HELP,
  REUSABLE_REMNANT_MIN_HELP,
  REUSABLE_REMNANT_MODE_OPTIONS,
  SEARCH_SPEED_HELP,
  SEARCH_SPEED_OPTIONS,
  SHAPE_REMNANTS_THRESHOLD_HELP,
  clampBatchSizeN,
  clampFillControlThreshold,
  getAlgorithmExtraHelp,
  getBatchHelp,
  getGeometryHelp,
} from '../constants/cuttingHelp';
import { HelpHint, PercentSlider } from './PercentSlider';

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

  const remnantMode = settings.reusableRemnantMode ?? 'manual';
  const [lastManualRemnantMin, setLastManualRemnantMin] = useState<number>(() =>
    remnantMode === 'manual' ? settings.reusableRemnantMin : 250
  );
  useEffect(() => {
    if (remnantMode === 'manual') {
      setLastManualRemnantMin(settings.reusableRemnantMin);
    }
  }, [remnantMode, settings.reusableRemnantMin]);

  const weightedRemnantMin = useMemo(
    () => computeReusableRemnantMin(demandItems, 'weighted'),
    [demandItems]
  );
  const minPartRemnantMin = useMemo(
    () => computeReusableRemnantMin(demandItems, 'min_part'),
    [demandItems]
  );
  const effectiveRemnantMin =
    remnantMode === 'weighted'
      ? weightedRemnantMin
      : remnantMode === 'min_part'
        ? minPartRemnantMin
        : settings.reusableRemnantMin;

  const remnantMinFillPct = Math.min(
    100,
    Math.max(0, settings.remnantMinFillPct ?? settings.targetRemnantKIM ?? 75)
  );
  const shapeThresholdPct = Math.min(
    100,
    Math.max(0, settings.shapeRemnantsThresholdPct ?? 50)
  );
  const shapeCutoffMm = Math.floor((Math.max(0, effectiveRemnantMin) * shapeThresholdPct) / 100);
  const fillControlThreshold = clampFillControlThreshold(settings.fillControlThreshold);
  const clampedBatchSizeN = clampBatchSizeN(settings.batchSizeN);
  const [batchSizeDraft, setBatchSizeDraft] = useState<string | null>(null);

  const autoHelperThreads = getMaxHelperThreads();
  const isWorkersSupported = typeof Worker !== 'undefined' && autoHelperThreads >= 2;
  const isDeepSearch = settings.searchSpeed === 'deep';
  const isExactPreset = settings.searchSpeed === 'exact';
  const isMultiThreadDisabled = !isWorkersSupported || !isDeepSearch;
  const multiThreadBaseHelp = getAlgorithmExtraHelp('multiThreadEnabled');
  const multiThreadHint = !isWorkersSupported
    ? `${MULTI_THREAD_UNAVAILABLE_HINT}. ${multiThreadBaseHelp}`
    : !isDeepSearch
      ? `${MULTI_THREAD_DEEP_ONLY_HINT}. ${multiThreadBaseHelp}`
      : multiThreadBaseHelp;
  const exactSolverBaseHelp = getAlgorithmExtraHelp('exactSolverEnabled');
  const exactSolverHint = isExactPreset
    ? `${EXACT_SOLVER_PRESET_HINT}. ${exactSolverBaseHelp}`
    : exactSolverBaseHelp;

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
          <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
            Алгоритм работы
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <label className="text-[11px] font-semibold text-slate-600">
                  Стратегия оптимизации:
                </label>
                <HelpHint text={OPTIMIZATION_HELP} ariaLabel="Стратегия оптимизации" />
              </div>
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
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <label className="text-[11px] font-semibold text-slate-600">
                  Глубина поиска:
                </label>
                <HelpHint text={SEARCH_SPEED_HELP} ariaLabel="Глубина поиска" />
              </div>
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

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <label
                className={`flex items-center gap-2 select-none ${
                  isMultiThreadDisabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
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
              </label>
              <HelpHint text={multiThreadHint} ariaLabel="Многопоточный режим" />
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <label
                className={`flex items-center gap-2 select-none ${
                  isExactPreset ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
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
              </label>
              <div className="flex items-center gap-1.5 shrink-0">
                {isExactPreset && (
                  <span className="text-[9.5px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                    пресет
                  </span>
                )}
                <HelpHint text={exactSolverHint} ariaLabel="Точный решатель (LP)" />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
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
                  <HelpHint
                    text={getAlgorithmExtraHelp('prioritizeRemnants')}
                    ariaLabel="Приоритет остатков со склада"
                  />
                </div>

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
                <div className="flex items-center justify-between gap-2">
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
                  <HelpHint
                    text={getAlgorithmExtraHelp('shapeRemnantsInSearch')}
                    ariaLabel="Формировать деловые остатки"
                  />
                </div>

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
          <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
            Геометрия реза
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Ширина реза */}
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[11px] font-semibold text-slate-600 truncate">
                  Рез (пропил):
                </label>
                <HelpHint text={getGeometryHelp('bladeWidth')} ariaLabel="Рез (пропил)" />
              </div>
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
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[11px] font-semibold text-slate-600 truncate">
                  Кромка:
                </label>
                <HelpHint text={getGeometryHelp('edgeTrim')} ariaLabel="Кромка" />
              </div>
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

          {/* Рез под 45 градусов (временно отключено) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
            <label className="flex items-center gap-2 select-none opacity-50 cursor-not-allowed">
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
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9.5px] font-semibold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded opacity-65">
                в разработке
              </span>
              <HelpHint text={ANGLE_45_DISABLED_HINT} ariaLabel="Рез под углом 45°" />
            </div>
          </div>
        </div>

        {/* Block 3: Порог делового остатка (без внутренних рамок) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Порог делового остатка
            </div>
            <HelpHint text={REUSABLE_REMNANT_MIN_HELP} ariaLabel="Порог делового остатка" />
          </div>

          <div className="space-y-2">
            {REUSABLE_REMNANT_MODE_OPTIONS.map((option) => {
              const isManualOption = option.value === 'manual';
              const isWeightedOption = option.value === 'weighted';
              const approxValue = isWeightedOption ? weightedRemnantMin : minPartRemnantMin;

              return (
                <div
                  key={option.value}
                  className="flex items-center justify-between gap-2"
                >
                  <label className="flex items-center gap-1.5 cursor-pointer select-none min-w-0">
                    <input
                      type="radio"
                      name="reusableRemnantMode"
                      checked={remnantMode === option.value}
                      onChange={() => {
                        const nextMode = option.value;
                        const nextMin =
                          nextMode === 'manual'
                            ? lastManualRemnantMin
                            : nextMode === 'weighted'
                              ? weightedRemnantMin
                              : minPartRemnantMin;
                        setSettings((prev) => ({
                          ...prev,
                          reusableRemnantMode: nextMode,
                          reusableRemnantMin: nextMin,
                        }));
                      }}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <span className="text-[10.5px] font-medium text-slate-700 truncate">
                      {option.label}
                    </span>
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isManualOption ? (
                      <div className="flex items-center w-[84px]">
                        <input
                          type="text"
                          maxLength={5}
                          disabled={remnantMode !== 'manual'}
                          value={
                            remnantMode === 'manual'
                              ? settings.reusableRemnantMin || ''
                              : lastManualRemnantMin || ''
                          }
                          onChange={(e) => {
                            if (remnantMode !== 'manual') return;
                            const clean = e.target.value.replace(/[^0-9]/g, '');
                            const nextVal = clean === '' ? 0 : parseInt(clean, 10);
                            setLastManualRemnantMin(nextVal);
                            updateSetting('reusableRemnantMin', nextVal);
                          }}
                          placeholder="250"
                          className={`w-full min-w-0 text-xs font-mono font-bold px-1.5 py-1 border border-slate-300 rounded-l-md text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 ${
                            remnantMode !== 'manual'
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-white text-amber-700'
                          }`}
                        />
                        <span
                          className={`border border-l-0 border-slate-300 px-1.5 py-1 text-[10px] rounded-r-md font-mono ${
                            remnantMode !== 'manual'
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          мм
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10.5px] font-mono text-slate-500 whitespace-nowrap">
                        ≈ {approxValue} мм
                      </span>
                    )}
                    <HelpHint text={option.explanation} ariaLabel={option.label} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Block 4: Пакетный раскрой (сворачиваемый блок, без внутренних рамок) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
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
            <HelpHint text={getBatchHelp('dualProfileCut')} ariaLabel="Пакетный раскрой" />
          </div>

          {settings.dualProfileCut && (
            <div className="pl-5 space-y-2.5">
              {/* Строка 1: Пакетный рез N (2..10, шаг 1) */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="batch-size-n-input"
                  className="text-[11px] font-semibold text-slate-700 whitespace-nowrap"
                >
                  Пакетный рез, шт. (от 2):
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    id="batch-size-n-input"
                    type="number"
                    min={BATCH_SIZE_MIN}
                    max={BATCH_SIZE_MAX}
                    step={1}
                    value={batchSizeDraft !== null ? batchSizeDraft : clampedBatchSizeN}
                    onFocus={() => setBatchSizeDraft(String(clampedBatchSizeN))}
                    onChange={(e) => {
                      const rawStr = e.target.value;
                      setBatchSizeDraft(rawStr);
                      if (rawStr.trim() === '') return;
                      const parsed = parseInt(rawStr, 10);
                      if (Number.isNaN(parsed)) return;
                      if (parsed > BATCH_SIZE_MAX) {
                        setBatchSizeDraft(String(BATCH_SIZE_MAX));
                        updateSetting('batchSizeN', BATCH_SIZE_MAX);
                      } else if (parsed >= BATCH_SIZE_MIN) {
                        updateSetting('batchSizeN', parsed);
                      }
                    }}
                    onBlur={() => {
                      if (batchSizeDraft !== null) {
                        const parsed = parseInt(batchSizeDraft, 10);
                        updateSetting(
                          'batchSizeN',
                          clampBatchSizeN(Number.isNaN(parsed) ? BATCH_SIZE_MIN : parsed)
                        );
                        setBatchSizeDraft(null);
                      }
                    }}
                    className="w-14 text-xs font-mono font-bold text-blue-700 px-1.5 py-1 border border-slate-300 rounded-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                  <HelpHint text={getBatchHelp('batchSizeN')} ariaLabel="Пакетный рез, шт." />
                </div>
              </div>

              {/* Строка 2: Контроль заполнения */}
              <div className="flex items-center justify-between gap-2">
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
                <HelpHint text={getBatchHelp('fillControl')} ariaLabel="Контроль заполнения" />
              </div>

              {/* Строка 3: Порог КИМ (20..85%, шаг 5) */}
              <PercentSlider
                label="Порог КИМ:"
                value={fillControlThreshold}
                min={FILL_CONTROL_MIN}
                max={FILL_CONTROL_MAX}
                step={5}
                disabled={!settings.fillControlEnabled}
                tooltip={FILL_CONTROL_THRESHOLD_HELP}
                helperText={
                  settings.fillControlEnabled
                    ? `Дозаполнение карт по 1 шт. при чистом КИМ < ${fillControlThreshold}%`
                    : undefined
                }
                onChange={(val) => updateSetting('fillControlThreshold', val)}
              />
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
