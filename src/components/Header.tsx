import React from 'react';
import { Play, FileSpreadsheet } from 'lucide-react';

interface HeaderProps {
  activeTab: 'workspace' | 'visualizer' | 'reports';
  setActiveTab: (tab: 'workspace' | 'visualizer' | 'reports') => void;
  onCalculate: () => void;
  onExportExcel: () => void;
  hasResults: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onCalculate,
  onExportExcel,
  hasResults,
}) => {
  return (
    <header className="no-print bg-slate-900 border-b border-slate-800 text-white">
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

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {hasResults && (
            <button
              onClick={onExportExcel}
              title="Экспорт отчета в Excel (.xlsx)"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel (.xlsx)</span>
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
