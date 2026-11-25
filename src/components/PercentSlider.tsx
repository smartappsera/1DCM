import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

export interface HelpHintProps {
  text: string;
  ariaLabel?: string;
  iconSizeClass?: string;
  className?: string;
}

export const HelpHint: React.FC<HelpHintProps> = ({
  text,
  ariaLabel = 'Пояснение',
  iconSizeClass = 'w-3.5 h-3.5',
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTapped, setIsTapped] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false,
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);
  const lastTouchTimeRef = useRef(0);
  const tooltipId = useId();

  const isOpen = Boolean(text) && (isHovered || isFocused || isTapped);

  const updatePosition = () => {
    const triggerEl = triggerRef.current;
    const tooltipEl = tooltipRef.current;
    if (!triggerEl || !tooltipEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const margin = 10;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = triggerRect.right + gap;
    let top = triggerRect.top - 4;

    if (left + tooltipRect.width > vw - margin) {
      left = Math.max(margin, Math.min(triggerRect.left, vw - tooltipRect.width - margin));
      top = triggerRect.bottom + 6;
      if (top + tooltipRect.height > vh - margin) {
        const aboveTop = triggerRect.top - tooltipRect.height - 6;
        top = aboveTop >= margin ? aboveTop : Math.max(margin, vh - tooltipRect.height - margin);
      }
    } else if (top + tooltipRect.height > vh - margin) {
      top = Math.max(margin, vh - tooltipRect.height - margin);
    }

    setCoords({ top, left, ready: true });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    updatePosition();
  }, [isOpen, text]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsHovered(false);
        setIsFocused(false);
        setIsTapped(false);
      }
    };

    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !tooltipRef.current?.contains(target)
      ) {
        setIsHovered(false);
        setIsFocused(false);
        setIsTapped(false);
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen]);

  if (!text) return null;

  return (
    <span className={`inline-flex items-center shrink-0 pointer-events-auto ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') {
            lastTouchTimeRef.current = Date.now();
          } else {
            pointerDownRef.current = true;
          }
        }}
        onMouseEnter={() => {
          if (Date.now() - lastTouchTimeRef.current < 600) return;
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          if (Date.now() - lastTouchTimeRef.current < 600) return;
          setIsHovered(false);
          setIsTapped(false);
        }}
        onFocus={() => {
          if (pointerDownRef.current || Date.now() - lastTouchTimeRef.current < 600) {
            pointerDownRef.current = false;
            return;
          }
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsTapped(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsTapped((prev) => !prev);
        }}
        className={`inline-flex items-center justify-center p-0.5 rounded transition-colors cursor-help focus:outline-hidden focus-visible:ring-1 focus-visible:ring-blue-500 ${
          isOpen ? 'text-slate-700' : 'text-slate-400 hover:text-slate-700'
        }`}
      >
        <HelpCircle className={iconSizeClass} />
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            visibility: coords.ready ? 'visible' : 'hidden',
          }}
          className="z-50 max-w-72 w-max px-2.5 py-2 rounded-lg bg-slate-900 text-slate-50 text-[11px] font-normal normal-case tracking-normal leading-snug shadow-lg border border-slate-700/80 whitespace-pre-line pointer-events-none select-none"
        >
          {text}
        </div>
      )}
    </span>
  );
};

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
  const [draft, setDraft] = useState<string | null>(null);

  const clampValue = (n: number) => Math.min(max, Math.max(min, n));

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawStr = e.target.value;
    setDraft(rawStr);
    if (rawStr.trim() === '') return;
    const raw = parseInt(rawStr, 10);
    if (Number.isNaN(raw)) return;
    if (raw > max) {
      setDraft(String(max));
      onChange(max);
    } else if (raw >= min) {
      onChange(raw);
    }
  };

  const handleNumberBlur = () => {
    if (draft !== null) {
      const raw = parseInt(draft, 10);
      const next = Number.isNaN(raw) ? min : clampValue(raw);
      onChange(next);
      setDraft(null);
    }
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(null);
    const raw = parseInt(e.target.value, 10);
    const next = Number.isNaN(raw) ? min : clampValue(raw);
    onChange(next);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-700 min-w-0">
          <span className={`truncate ${disabled ? 'opacity-50' : ''}`}>{label}</span>
          {tooltip && <HelpHint text={tooltip} ariaLabel={label} />}
        </span>
        <div className={`flex items-center shrink-0 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={draft !== null ? draft : clamped}
            onFocus={() => setDraft(String(clamped))}
            onChange={handleNumberChange}
            onBlur={handleNumberBlur}
            className="w-13 text-xs font-mono font-bold text-blue-700 px-1.5 py-0.5 border border-slate-300 rounded-l-md bg-white text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <span className="bg-slate-100 border border-l-0 border-slate-300 px-1.5 py-0.5 text-[10.5px] text-blue-700 font-mono font-bold rounded-r-md">
            %
          </span>
        </div>
      </div>

      <div className="space-y-0.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={clamped}
          onChange={handleRangeChange}
          className={`w-full h-1.5 accent-blue-600 cursor-pointer disabled:cursor-not-allowed ${
            disabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        />
        <div
          className={`flex items-center justify-between text-[9.5px] font-mono text-slate-400 leading-none select-none ${
            disabled ? 'opacity-50' : ''
          }`}
        >
          <span>{min}%</span>
          <span>{max}%</span>
        </div>
      </div>

      {helperText && (
        <div className={`text-[10px] text-slate-500 leading-tight ${disabled ? 'opacity-50' : ''}`}>
          {helperText}
        </div>
      )}
    </div>
  );
};
