import React from 'react';
import { HelpCircle } from 'lucide-react';

interface PercentSliderProps {
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  helperText?: React.ReactNode;
  tooltip?: string;
  className?: string;
}

export const PercentSlider: React.FC<PercentSliderProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  helperText,
  tooltip,
  className = '',
}) => {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    const next = Number.isNaN(raw) ? min : Math.min(max, Math.max(min, raw));
    onChange(next);
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    const next = Number.isNaN(raw) ? min : Math.min(max, Math.max(min, raw));
    onChange(next);
  };

  return (
    <div
      className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-700 min-w-0">
          <span className="truncate">{label}</span>
          {tooltip && (
            <span
              className="cursor-help text-slate-400 hover:text-blue-600 transition-colors shrink-0"
              title={tooltip}
            >
              <HelpCircle className="w-3 h-3" />
            </span>
          )}
        </span>
        <div className="flex items-center shrink-0">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={clamped}
            onChange={handleNumberChange}
            className="w-13 text-xs font-mono font-bold text-blue-700 px-1.5 py-0.5 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-0.5 text-[10.5px] text-blue-700 font-mono font-bold rounded-r-md">
            %
          </span>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={clamped}
        onChange={handleRangeChange}
        className="w-full h-1.5 accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
      />

      {helperText && (
        <div className="text-[10px] text-slate-500 leading-tight">{helperText}</div>
      )}
    </div>
  );
};
