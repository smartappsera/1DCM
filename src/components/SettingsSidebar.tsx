import React from 'react';
import { AppSettings } from '../types/cutting';
import { getDefaultCustomConfig } from '../utils/cuttingEngine';
import {
  Sliders,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Play,
  RotateCw,
} from 'lucide-react';

interface SettingsSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCalculate: () => void;
  onLoadBenchmarkExample?: () => void;
  hasResults: boolean;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  settings,
  setSettings,
  isOpen,
  setIsOpen,
  onCalculate,
  onLoadBenchmarkExample,
  hasResults,
}) => {
  const updateSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

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
        {/* Block 1: Алгоритм и стратегия (ОПТИМИЗАЦИЯ И СКОРОСТЬ) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Оптимизация и скорость
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={"• Скорость расчета: «Быстро» (10–15 сек) — быстрый эвристический перебор с локальной оптимизацией; «Стандарт» (1–2 мин) — многопроходный генератор карт; «Глубокий» (от 2 мин) — максимальный комбинаторный перебор и отжиг.\n• Стратегия оптимизации: «Схемы» — минимум разных карт раскроя; «Минимум отходов» — наивысший КИМ и минимум лома; «Минимум хлыстов» — экономия исходного проката; «Максимум делового» — получение крупных полезных обрезков; «Приоритет остатков» — первоочередной раскрой коротких складских заготовок."}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Скорость расчета:
              </label>
              <select
                value={settings.searchSpeed}
                onChange={(e) => updateSetting('searchSpeed', e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="fast">Быстро (~10-15 сек)</option>
                <option value="standard">Стандарт (~1-2 мин)</option>
                <option value="deep">Глубокий перебор (от 2 мин)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Стратегия оптимизации:
              </label>
              <select
                value={settings.optimizationGoal}
                onChange={(e) => updateSetting('optimizationGoal', e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="variants">Оптимизация вариантов (схем)</option>
                <option value="min_waste">Минимум отходов</option>
                <option value="min_bars">Минимум хлыстов</option>
                <option value="max_reusable">Максимум делового остатка</option>
                <option value="prioritize_remnants">Приоритет остатков со склада</option>
                <option value="comprehensive">Комплексный подбор (4 стратегии)</option>
                <option value="custom">Пользовательская (настраиваемая)</option>
              </select>
            </div>

            {settings.optimizationGoal === 'max_reusable' && (
              <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold text-amber-950 block">
                    Мин. размер остатка:
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      maxLength={5}
                      value={settings.targetRemnantMinLength ?? 1500}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '');
                        updateSetting(
                          'targetRemnantMinLength',
                          clean === '' ? 0 : parseInt(clean, 10)
                        );
                      }}
                      placeholder="1500"
                      className="w-16 text-xs font-mono font-bold text-amber-900 px-2 py-1 border border-amber-300 rounded-l-lg bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="bg-amber-100/80 border border-l-0 border-amber-300 px-2 py-1 text-[11px] text-amber-800 rounded-r-lg font-mono">
                      мм
                    </span>
                  </div>
                </div>

                {/* Preset quick buttons */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-amber-800/80 font-medium">Кнопки:</span>
                  {[1000, 1500, 2000, 3000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updateSetting('targetRemnantMinLength', preset)}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        (settings.targetRemnantMinLength ?? 1500) === preset
                          ? 'bg-amber-600 text-white font-bold shadow-2xs'
                          : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-amber-800/90 leading-tight">
                  Алгоритм будет компоновать детали так, чтобы оставлять цельные деловые обрезки длиной не менее{' '}
                  <strong>{settings.targetRemnantMinLength ?? 1500} мм</strong> для возврата на склад.
                </p>
              </div>
            )}

            {settings.optimizationGoal === 'prioritize_remnants' && (
              <div className="flex items-center justify-between gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-[11px] font-semibold text-blue-900">
                  Целевой КИМ остатка:
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={settings.targetRemnantKIM ?? 75}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const clamped = isNaN(val) ? 75 : Math.min(99, Math.max(1, val));
                      updateSetting('targetRemnantKIM', clamped);
                    }}
                    className="w-12 text-xs font-mono font-bold text-blue-700 px-1.5 py-0.5 border border-slate-300 rounded bg-white text-right"
                  />
                  <span className="text-[11px] text-blue-700 font-mono">%</span>
                </div>
              </div>
            )}

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
                          <span className="text-slate-600">Пул хвостов (хлыстов):</span>
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
              title={"• Рез (пропил): ширина режущего диска пилы (вычитается при каждом резе).\n• Кромка: длина технологической торцовки краев хлыста (0–50 мм).\n• Порог делового остатка: минимальная длина годного обрезка для возврата на склад (все что короче — лом).\n• Рез под углом 45°: учет косых резов на торцах профилей."}
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

          {/* Деловой остаток */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Порог делового остатка:
            </label>
            <div className="flex items-center">
              <input
                type="text"
                maxLength={4}
                value={settings.reusableRemnantMin || ''}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9]/g, '');
                  updateSetting('reusableRemnantMin', clean === '' ? 0 : parseInt(clean, 10));
                }}
                placeholder="250"
                className="w-full text-xs font-mono font-bold text-amber-700 px-2.5 py-1.5 border border-slate-300 rounded-l-lg bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-500 rounded-r-lg font-mono">
                мм
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Обрезки от этой длины возвращаются на склад
            </p>
          </div>

          {/* Рез под 45 градусов */}
          <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={settings.cutAngle45}
              onChange={(e) => updateSetting('cutAngle45', e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-slate-800">
              Рез под углом 45°
            </span>
          </label>
        </div>

        {/* Block 3: Пакетный раскрой (Пакетный рез + Контроль заполнения) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Пакетный раскрой
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={"• Пакетный рез: объединение заготовок равной длины в группы от 2 шт. с любым шагом для одновременного реза пакета заготовок за один проход пилы.\n• Контроль заполнения: если в крайней неполной пачке КИМ падает ниже указанного порога, алгоритм распускает пакет по 1 профилю со стратегией «Минимум отходов»."}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.dualProfileCut}
                onChange={(e) => updateSetting('dualProfileCut', e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-[11px] font-bold text-slate-900 block">
                  Пакетный рез
                </span>
                <span className="text-[10px] text-slate-500 block leading-tight">
                  Группы равных заготовок от 2 шт.
                </span>
              </div>
            </label>

            {/* Контроль заполнения */}
            <div
              className={`p-2.5 rounded-lg border transition-all ${
                settings.dualProfileCut
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-100/60 border-slate-200/60 opacity-40 pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!settings.dualProfileCut}
                    checked={settings.dualProfileCut && (settings.fillControlEnabled ?? false)}
                    onChange={(e) => updateSetting('fillControlEnabled', e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-[11px] font-semibold text-slate-800">
                    Контроль заполнения:
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Порог КИМ:</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  disabled={!settings.dualProfileCut || !settings.fillControlEnabled}
                  value={settings.fillControlThreshold ?? 50}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const clamped = isNaN(val) ? 50 : Math.min(99, Math.max(1, val));
                    updateSetting('fillControlThreshold', clamped);
                  }}
                  className="w-14 text-xs font-mono font-bold text-blue-700 px-1.5 py-1 border border-slate-300 rounded bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="text-xs text-blue-700 font-mono font-bold">%</span>
              </div>
            </div>
          </div>
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
