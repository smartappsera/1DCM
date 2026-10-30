import React from 'react';
import { Scale, ChevronRight } from 'lucide-react';

interface CalculationSpoilerProps {
  runsCount: number;
  activeKIM?: number;
  onOpen: () => void;
}

export const CalculationSpoiler: React.FC<CalculationSpoilerProps> = ({
  runsCount,
  activeKIM,
  onOpen,
}) => {
  return (
    <aside
      onClick={onOpen}
      className="no-print w-12 h-full bg-blue-50/90 hover:bg-blue-100/90 border-r border-blue-200 flex flex-col items-center py-3.5 shrink-0 z-20 cursor-pointer transition-colors group select-none shadow-2xs relative notranslate"
      translate="no"
      title={`Сравнение расчетов (${runsCount} вар.) — нажать для открытия`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="p-1.5 rounded-lg text-blue-700 group-hover:bg-blue-200/80 transition-colors cursor-pointer"
        title="Развернуть сравнение расчетов"
      >
        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center mt-2 shadow-xs group-hover:scale-105 transition-transform">
        <Scale className="w-3.5 h-3.5" />
      </div>

      <span className="mt-1 px-1.5 py-0.2 bg-blue-700 text-white text-[10px] font-mono font-bold rounded-full shadow-2xs">
        {runsCount}
      </span>

      <div className="flex-1 flex items-center justify-center my-4">
        <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold uppercase tracking-wider text-blue-900 group-hover:text-blue-950 transition-colors whitespace-nowrap">
          Сравнение расчетов
        </span>
      </div>

      {activeKIM !== undefined && (
        <div className="mb-1">
          <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/90 px-1 py-0.5 rounded border border-emerald-300">
            {activeKIM.toFixed(1)}%
          </span>
        </div>
      )}
    </aside>
  );
};
