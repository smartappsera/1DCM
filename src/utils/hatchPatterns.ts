import React from 'react';

export interface HatchPattern {
  id: string;
  name: string;
  shortSymbol: string;
  style: React.CSSProperties;
}

/**
 * 10 distinctive monochrome hatch patterns using THIN 1px lines and fine dots
 * for clean contrast and effortless readability of overlaid text/numbers.
 */
export const MONO_HATCH_PATTERNS: HatchPattern[] = [
  {
    id: 'diag_right',
    name: 'Наклонная вправо',
    shortSymbol: '//',
    style: {
      backgroundImage:
        'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 8px)',
    },
  },
  {
    id: 'diag_left',
    name: 'Наклонная влево',
    shortSymbol: '\\\\',
    style: {
      backgroundImage:
        'repeating-linear-gradient(-45deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 8px)',
    },
  },
  {
    id: 'vertical',
    name: 'Вертикальная тонкая',
    shortSymbol: '||',
    style: {
      backgroundImage:
        'repeating-linear-gradient(90deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 7px)',
    },
  },
  {
    id: 'horizontal',
    name: 'Горизонтальная тонкая',
    shortSymbol: '==',
    style: {
      backgroundImage:
        'repeating-linear-gradient(0deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 7px)',
    },
  },
  {
    id: 'cross_hatch',
    name: 'Прямая тонкая сетка',
    shortSymbol: '##',
    style: {
      backgroundImage:
        'repeating-linear-gradient(0deg, #1e293b 0, #1e293b 1px, transparent 1px, transparent 8px), repeating-linear-gradient(90deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 8px)',
    },
  },
  {
    id: 'diag_cross',
    name: 'Ромбовидная тонкая сетка',
    shortSymbol: 'XX',
    style: {
      backgroundImage:
        'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 1px, transparent 1px, transparent 9px), repeating-linear-gradient(-45deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 9px)',
    },
  },
  {
    id: 'dots',
    name: 'Мелкие точки',
    shortSymbol: '··',
    style: {
      backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
      backgroundSize: '7px 7px',
      backgroundColor: '#ffffff',
    },
  },
  {
    id: 'dense_dots',
    name: 'Сетка точек',
    shortSymbol: '••',
    style: {
      backgroundImage: 'radial-gradient(#1e293b 1.5px, transparent 1.5px)',
      backgroundSize: '10px 10px',
      backgroundColor: '#f8fafc',
    },
  },
  {
    id: 'zigzag',
    name: 'Тонкий шеврон',
    shortSymbol: 'VV',
    style: {
      backgroundImage:
        'linear-gradient(135deg, #1e293b 15%, transparent 15%), linear-gradient(225deg, #1e293b 15%, transparent 15%), linear-gradient(45deg, #1e293b 15%, transparent 15%), linear-gradient(315deg, #1e293b 15%, #ffffff 15%)',
      backgroundPosition: '4px 0, 4px 0, 0 0, 0 0',
      backgroundSize: '8px 8px',
    },
  },
  {
    id: 'bars_sparse',
    name: 'Редкий тонкий штрих',
    shortSymbol: '| |',
    style: {
      backgroundImage:
        'repeating-linear-gradient(90deg, #1e293b 0, #1e293b 1px, #ffffff 1px, #ffffff 14px)',
    },
  },
];

/**
 * Deterministically associates each unique piece length with a fixed hatch pattern.
 */
export function getPatternForLength(length: number, allUniqueLengths: number[]): HatchPattern {
  const sorted = [...allUniqueLengths].sort((a, b) => b - a);
  const idx = sorted.indexOf(length);
  const patternIndex = idx >= 0 ? idx % MONO_HATCH_PATTERNS.length : 0;
  return MONO_HATCH_PATTERNS[patternIndex];
}
