import React from 'react';
import { Play, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab: 'workspace' | 'visualizer' | 'reports';
  setActiveTab: (tab: 'workspace' | 'visualizer' | 'reports') => void;
  onCalculate: () => void;
  onPrint?: () => void;
  onExportExcel?: () => void;
  hasResults: boolean;
  onLoadBenchmarkExample?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onCalculate,
  onPrint,
  hasResults,
  onLoadBenchmarkExample,
}) => {
  return (
    <header className="no-print bg-slate-900 border-b border-slate-800 text-white static sm:sticky sm:top-0 sm:z-40 shadow-md">
      {/* Main Top Bar */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workspace');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span>Линейный Раскрой Про</span>
        </a>

        {/* Zone 2: Navigation Links for Desktop (md and up) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'workspace' ? 'text-white border-b-2 border-blue-500 pb-0.5' : ''
            }`}
          >
            Спецификация и склад
          </button>

          {hasResults && (
            <>
              <button
                onClick={() => setActiveTab('visualizer')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'visualizer' ? 'text-white border-b-2 border-blue-500 pb-0.5' : ''
                }`}
              >
                Результаты раскроя
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'reports' ? 'text-white border-b-2 border-blue-500 pb-0.5' : ''
                }`}
              >
                Печать и бирки
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Actions - Example is shown only before first calculation, Print is shown after */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!hasResults && onLoadBenchmarkExample && (
            <button
              onClick={onLoadBenchmarkExample}
              title="Загрузить контрольный пример (82 хлыста, КИМ 98.6%)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-200 bg-blue-950/70 hover:bg-blue-900 border border-blue-700/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Пример (82 хлыста)</span>
            </button>
          )}


          <button
            onClick={onCalculate}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Рассчитать раскрой</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Strip (Requirement 12: visible and scrollable on mobile) */}
      <nav className="flex md:hidden items-center gap-2 px-3 py-2 bg-slate-800/80 border-t border-slate-800/80 overflow-x-auto text-xs font-medium text-slate-300">
        <button
          onClick={() => setActiveTab('workspace')}
          className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'workspace'
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          Спецификация и склад
        </button>

        {hasResults && (
          <>
            <button
              onClick={() => setActiveTab('visualizer')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'visualizer'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Результаты раскроя
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Печать и бирки
            </button>
          </>
        )}
      </nav>
    </header>
  );
};
