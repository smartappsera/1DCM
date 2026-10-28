import React, { useState } from 'react';
import { AppSettings } from '../types/cutting';
import { Sparkles, Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface SettingsHeaderProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onLoadBenchmarkExample: () => void;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  settings,
  setSettings,
  onLoadBenchmarkExample,
}) => {
  const [isSpoilerOpen, setIsSpoilerOpen] = useState(false);

  const updateSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
      {/* LINE 1: ЗАКАЗ № и МАТЕРИАЛ in the first row, plus spoiler toggle and benchmark loader */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Order No */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Заказ №:
            </label>
            <input
              type="text"
              value={settings.orderNumber}
              onChange={(e) => updateSetting('orderNumber', e.target.value)}
              placeholder="—"
              className="w-24 text-xs font-medium px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Material */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Материал:
            </label>
            <input
              type="text"
              value={settings.material}
              onChange={(e) => updateSetting('material', e.target.value)}
              placeholder="— (напр. Труба 60х40х2)"
              className="w-full text-xs font-medium px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Action buttons on Line 1 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSpoilerOpen(!isSpoilerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isSpoilerOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>Параметры раскроя</span>
            {isSpoilerOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onLoadBenchmarkExample}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
            title="Загрузить контрольный пример (82 хлыста, КИМ 98.6%)"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="hidden sm:inline">Пример (82 хлыста)</span>
          </button>
        </div>
      </div>

      {/* LINE 2: Collapsible Spoiler - Point 6: All fields in ONE single line */}
      {isSpoilerOpen && (
        <div className="pt-2.5 border-t border-slate-200 flex items-center gap-3.5 overflow-x-auto text-xs py-1 animate-in fade-in duration-150 notranslate whitespace-nowrap" translate="no">
          {/* Ширина реза */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-600">
              Рез:
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
                className="w-12 text-xs font-mono font-bold px-1.5 py-1 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-1 text-[11px] text-slate-500 rounded-r-md font-mono">
                мм
              </span>
            </div>
          </div>

          {/* Кромка (торцовка) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-600">
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
                className="w-14 text-xs font-mono px-1.5 py-1 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-1 text-[11px] text-slate-500 rounded-r-md font-mono">
                мм
              </span>
            </div>
          </div>

          {/* Деловой остаток */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-600">
              Деловой:
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
                className="w-16 text-xs font-mono font-bold text-amber-700 px-1.5 py-1 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-1 text-[11px] text-slate-500 rounded-r-md font-mono">
                мм
              </span>
            </div>
          </div>

          {/* Скорость */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-600">
              Скорость:
            </label>
            <select
              value={settings.searchSpeed}
              onChange={(e) => updateSetting('searchSpeed', e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="fast">Быстро</option>
              <option value="standard">Стандарт</option>
              <option value="deep">Глубокий</option>
            </select>
          </div>

          {/* Стратегия оптимизации */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-600">
              Стратегия:
            </label>
            <select
              value={settings.optimizationGoal}
              onChange={(e) => updateSetting('optimizationGoal', e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="variants">Оптимизация вариантов</option>
              <option value="min_waste">Минимум отходов</option>
              <option value="min_bars">Минимум хлыстов</option>
              <option value="max_reusable">Максимум делового</option>
              <option value="prioritize_remnants">Приоритет остатков</option>
            </select>
          </div>

          {/* Рез под 45 градусов */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 text-slate-800">
            <input
              type="checkbox"
              checked={settings.cutAngle45}
              onChange={(e) => updateSetting('cutAngle45', e.target.checked)}
              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-[11px] font-medium">Рез 45°</span>
          </label>

          {/* Раскрой в два профиля */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 text-slate-800">
            <input
              type="checkbox"
              checked={settings.dualProfileCut}
              onChange={(e) => updateSetting('dualProfileCut', e.target.checked)}
              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-slate-900">В два профиля</span>
          </label>

          {/* Целевой КИМ остатка (при приоритете остатков) */}
          {settings.optimizationGoal === 'prioritize_remnants' && (
            <div className="flex items-center gap-1 shrink-0 bg-blue-50/70 border border-blue-200 px-2 py-0.5 rounded-md">
              <span className="text-[11px] font-semibold text-blue-900">Целевой КИМ:</span>
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
                className="w-12 text-xs font-mono font-bold text-blue-700 px-1 py-0.5 border border-slate-300 rounded bg-white text-right"
              />
              <span className="text-[11px] text-blue-700 font-mono">%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
