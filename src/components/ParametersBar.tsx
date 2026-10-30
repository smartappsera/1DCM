import React from 'react';
import { Sliders, HelpCircle, Scissors, Layers } from 'lucide-react';
import { CuttingParams } from '../types/cutting';

interface ParametersBarProps {
  params: CuttingParams;
  setParams: React.Dispatch<React.SetStateAction<CuttingParams>>;
}

export const ParametersBar: React.FC<ParametersBarProps> = ({ params, setParams }) => {
  const handleChange = (field: keyof CuttingParams, value: any) => {
    setParams((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Project info */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Проект / Заказ
            </label>
            <input
              type="text"
              value={params.projectName}
              onChange={(e) => handleChange('projectName', e.target.value)}
              placeholder="Название заказа..."
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white w-44 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Материал / Профиль
            </label>
            <input
              type="text"
              value={params.materialName}
              onChange={(e) => handleChange('materialName', e.target.value)}
              placeholder="Напр. Труба 60х40х2"
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white w-44 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Machine & Technology parameters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Blade Kerf */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>Пропил (керф), мм</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="20"
                value={params.bladeWidth}
                onChange={(e) => handleChange('bladeWidth', parseFloat(e.target.value) || 0)}
                className="text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white w-24 text-right pr-2 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Trim Start/End */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Торцовка (нач/кон), мм
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                value={params.trimStart}
                onChange={(e) => handleChange('trimStart', parseFloat(e.target.value) || 0)}
                title="Торцовка начала хлыста, мм"
                className="text-xs font-mono px-2 py-1.5 border border-slate-300 rounded-lg bg-white w-16 text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400">/</span>
              <input
                type="number"
                min="0"
                value={params.trimEnd}
                onChange={(e) => handleChange('trimEnd', parseFloat(e.target.value) || 0)}
                title="Торцовка конца хлыста, мм"
                className="text-xs font-mono px-2 py-1.5 border border-slate-300 rounded-lg bg-white w-16 text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Min Reusable Remnant */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Деловой остаток, от мм
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={params.minReusableLength}
              onChange={(e) => handleChange('minReusableLength', parseFloat(e.target.value) || 0)}
              className="text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white w-24 text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Приоритет раскроя
            </label>
            <select
              value={params.strategy}
              onChange={(e) => handleChange('strategy', e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="best_fit">Минимум отходов (Best-Fit)</option>
              <option value="prefer_remnants">Сначала остатки со склада</option>
              <option value="first_fit">Последовательный (First-Fit)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
