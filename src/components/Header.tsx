import React from 'react';
import { Sparkles, MessageSquareHeart } from 'lucide-react';

interface HeaderProps {
  activeTab: 'workspace' | 'visualizer' | 'reports';
  setActiveTab: (tab: 'workspace' | 'visualizer' | 'reports') => void;
  onCalculate?: () => void;
  onOpenFeedback: () => void;
  onPrint?: () => void;
  onExportExcel?: () => void;
  hasResults: boolean;
  onLoadBenchmarkExample?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onCalculate,
  onOpenFeedback,
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
          className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2.5 group"
        >
          <img
            src="/logo.png"
            alt="Логотип сайта"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain shrink-0 shadow-xs group-hover:scale-105 transition-transform"
          />
          <span className="group-hover:text-blue-200 transition-colors">Линейный Раскрой Про</span>
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
              title="Загрузить пример"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-200 bg-blue-950/70 hover:bg-blue-900 border border-blue-700/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Пример</span>
            </button>
          )}


          <button
            onClick={onOpenFeedback}
            title="Обратная связь и поддержка проекта"
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquareHeart className="w-4 h-4 text-slate-950" />
            <span>Обратная связь</span>
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
