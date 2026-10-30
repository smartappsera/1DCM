import React from 'react';
import { AppSettings } from '../types/cutting';
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
        {/* Block 1: Заказ и материал */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Заказ и материал
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={"• Номер заказа: идентификатор заказа для накладных, отчетов и бирок деталей.\n• Наименование материала: марка или тип профиля (напр. Труба 60х40х2) для ведомостей раскроя и складского учета."}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Номер заказа:
              </label>
              <input
                type="text"
                value={settings.orderNumber}
                onChange={(e) => updateSetting('orderNumber', e.target.value)}
                placeholder="ПР-01"
                className="w-full text-xs font-medium px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Наименование материала:
              </label>
              <input
                type="text"
                value={settings.material}
                onChange={(e) => updateSetting('material', e.target.value)}
                placeholder="Труба 60х40х2"
                className="w-full text-xs font-medium px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Block 2: Геометрия и параметры реза */}
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

        {/* Block 3: Режим раскроя (В 2 профиля + Контроль заполнения) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Парный раскрой
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={"• Раскрой в 2 профиля: одновременный раскрой двух одинаковых хлыстов на пиле за один проход для удвоения производительности цеха.\n• Контроль заполнения: если в крайней неполной паре хлыстов КИМ падает ниже указанного порога, алгоритм автоматически раскладывает эту пару раздельно по 1 профилю со стратегией «Минимум отходов»."}
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
              <span className="text-[11px] font-semibold text-slate-900">
                Раскрой в 2 профиля
              </span>
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

        {/* Block 4: Алгоритм и стратегия */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              Оптимизация и скорость
            </div>
            <div
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors"
              title={"• Скорость расчета: «Быстро» — быстрый эвристический перебор; «Стандарт» — многопроходная оптимизация; «Глубокий» — максимальный перебор перестановок.\n• Стратегия оптимизации: «Схемы» — минимум разных карт раскроя; «Минимум отходов» — наивысший КИМ; «Минимум хлыстов» — экономия исходного проката; «Максимум делового» — получение крупных полезных обрезков; «Приоритет остатков» — первоочередной раскрой коротких складских заготовок.\n• Целевой КИМ: желаемый уровень плотности раскроя деловых обрезков."}
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
                <option value="fast">Быстро (эвристика)</option>
                <option value="standard">Стандарт (многопроходный)</option>
                <option value="deep">Глубокий перебор</option>
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
              </select>
            </div>

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
