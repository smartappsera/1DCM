import { PartDemand, StockBar, CuttingParams } from '../types/cutting';

export interface ProjectPreset {
  name: string;
  materialName: string;
  orderNumber: string;
  params: Partial<CuttingParams>;
  demands: PartDemand[];
  stocks: StockBar[];
}

export const PRESETS: Record<string, ProjectPreset> = {
  profile_pipe: {
    name: 'Каркас ангара (Профильная труба 60х40х2)',
    materialName: 'Труба профильная 60х40х2.0',
    orderNumber: 'ПР-2026-08',
    params: {
      bladeWidth: 3.5,
      trimStart: 15,
      trimEnd: 15,
      minReusableLength: 600,
      strategy: 'best_fit',
    },
    stocks: [
      {
        id: 'stock_6000',
        name: 'Хлыст 6.0 м (стандарт)',
        length: 6000,
        availableQuantity: 50,
        isRemnant: false,
      },
      {
        id: 'stock_remnant_2450',
        name: 'Остаток со склада №1',
        length: 2450,
        availableQuantity: 2,
        isRemnant: true,
      },
      {
        id: 'stock_remnant_1820',
        name: 'Остаток со склада №2',
        length: 1820,
        availableQuantity: 1,
        isRemnant: true,
      },
    ],
    demands: [
      {
        id: 'p1',
        mark: 'Стойка С-1',
        length: 2850,
        quantity: 8,
        color: '#2563EB',
        notes: 'Основной каркас',
      },
      {
        id: 'p2',
        mark: 'Стойка С-2',
        length: 1950,
        quantity: 6,
        color: '#059669',
        notes: 'Промежуточные',
      },
      {
        id: 'p3',
        mark: 'Раскос Р-1',
        length: 1420,
        quantity: 12,
        color: '#D97706',
        notes: 'Связевой блок',
      },
      {
        id: 'p4',
        mark: 'Перемычка П-1',
        length: 880,
        quantity: 16,
        color: '#7C3AED',
        notes: 'Горизонтали',
      },
      {
        id: 'p5',
        mark: 'Косынка опорная',
        length: 420,
        quantity: 10,
        color: '#DB2777',
        notes: 'Усиление',
      },
    ],
  },
  steel_pipe: {
    name: 'Магистральный контур (Труба ДУ-50)',
    materialName: 'Труба водогазопроводная ВГП 50х3.5',
    orderNumber: 'ТР-2026-14',
    params: {
      bladeWidth: 4.0,
      trimStart: 20,
      trimEnd: 20,
      minReusableLength: 800,
      strategy: 'best_fit',
    },
    stocks: [
      {
        id: 'stock_11700',
        name: 'Труба 11.7 м (заводская пачка)',
        length: 11700,
        availableQuantity: 20,
        isRemnant: false,
      },
      {
        id: 'stock_remnant_4300',
        name: 'Остаток складской',
        length: 4300,
        availableQuantity: 1,
        isRemnant: true,
      },
    ],
    demands: [
      {
        id: 'sp1',
        mark: 'Участок А-1',
        length: 4600,
        quantity: 4,
        color: '#0284C7',
      },
      {
        id: 'sp2',
        mark: 'Участок Б-2',
        length: 3200,
        quantity: 6,
        color: '#16A34A',
      },
      {
        id: 'sp3',
        mark: 'Отвод В-1',
        length: 1750,
        quantity: 8,
        color: '#EA580C',
      },
      {
        id: 'sp4',
        mark: 'Патрубок П-4',
        length: 950,
        quantity: 10,
        color: '#9333EA',
      },
    ],
  },
  channel_beam: {
    name: 'Эстакада (Швеллер 16П / Балка)',
    materialName: 'Швеллер горячекатаный 16П',
    orderNumber: 'ЭСТ-44',
    params: {
      bladeWidth: 4.5,
      trimStart: 25,
      trimEnd: 25,
      minReusableLength: 1000,
      strategy: 'best_fit',
    },
    stocks: [
      {
        id: 'stock_12000',
        name: 'Хлыст 12.0 м',
        length: 12000,
        availableQuantity: 30,
        isRemnant: false,
      },
    ],
    demands: [
      {
        id: 'cb1',
        mark: 'Балка Б-1',
        length: 5800,
        quantity: 6,
        color: '#2563EB',
      },
      {
        id: 'cb2',
        mark: 'Опора О-1',
        length: 3600,
        quantity: 8,
        color: '#059669',
      },
      {
        id: 'cb3',
        mark: 'Связь С-3',
        length: 2200,
        quantity: 14,
        color: '#D97706',
      },
    ],
  },
};
