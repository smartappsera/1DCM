import React, { useState } from 'react';
import { Plus, Trash2, Box, Sparkles } from 'lucide-react';
import { StockBar } from '../types/cutting';

interface StockTableProps {
  stocks: StockBar[];
  setStocks: React.Dispatch<React.SetStateAction<StockBar[]>>;
}

export const StockTable: React.FC<StockTableProps> = ({ stocks, setStocks }) => {
  const [newName, setNewName] = useState('');
  const [newLength, setNewLength] = useState<number | ''>('');
  const [newQuantity, setNewQuantity] = useState<number | ''>(10);
  const [isRemnant, setIsRemnant] = useState(false);

  const handleAdd = () => {
    if (!newLength || newLength <= 0) return;
    const qty = typeof newQuantity === 'number' && newQuantity > 0 ? newQuantity : 10;

    const newItem: StockBar = {
      id: `stock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newName.trim() || (isRemnant ? `Остаток ${newLength}мм` : `Хлыст ${newLength}мм`),
      length: Number(newLength),
      availableQuantity: qty,
      isRemnant,
    };

    setStocks((prev) => [...prev, newItem]);
    setNewName('');
    setNewLength('');
    setNewQuantity(10);
    setIsRemnant(false);
  };

  const handleDelete = (id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdate = (id: string, field: keyof StockBar, val: any) => {
    setStocks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  const handleAddStandardBar = (len: number) => {
    const existing = stocks.find((s) => s.length === len && !s.isRemnant);
    if (existing) {
      handleUpdate(existing.id, 'availableQuantity', existing.availableQuantity + 20);
    } else {
      setStocks((prev) => [
        ...prev,
        {
          id: `stock_std_${len}_${Date.now()}`,
          name: `Стандартный хлыст ${len / 1000}м`,
          length: len,
          availableQuantity: 100,
          isRemnant: false,
        },
      ]);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 bg-slate-50/70">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Доступные заготовки на складе</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              ({stocks.length} типоразмеров)
            </span>
          </h2>
        </div>

        {/* Quick add standard lengths */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Быстро:</span>
          <button
            onClick={() => handleAddStandardBar(6000)}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 transition-colors font-mono"
          >
            +6 000 мм
          </button>
          <button
            onClick={() => handleAddStandardBar(11700)}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 transition-colors font-mono"
          >
            +11 700 мм
          </button>
          <button
            onClick={() => handleAddStandardBar(12000)}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 transition-colors font-mono"
          >
            +12 000 мм
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[220px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/75 sticky top-0 border-b border-slate-200 text-slate-600 select-none z-10">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Наименование</th>
              <th className="py-2.5 px-3 font-semibold text-right w-28">Длина, мм</th>
              <th className="py-2.5 px-3 font-semibold text-right w-28">В наличии, шт</th>
              <th className="py-2.5 px-3 font-semibold w-32">Тип заготовки</th>
              <th className="py-2.5 px-3 font-semibold text-center w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stocks.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="py-2 px-3 font-medium text-slate-900">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => handleUpdate(s.id, 'name', e.target.value)}
                    className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                  />
                </td>

                <td className="py-2 px-3 text-right">
                  <input
                    type="number"
                    value={s.length}
                    min={1}
                    onChange={(e) =>
                      handleUpdate(s.id, 'length', Math.max(1, parseFloat(e.target.value) || 0))
                    }
                    className="w-full text-right font-mono font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                  />
                </td>

                <td className="py-2 px-3 text-right">
                  <input
                    type="number"
                    value={s.availableQuantity}
                    min={1}
                    onChange={(e) =>
                      handleUpdate(
                        s.id,
                        'availableQuantity',
                        Math.max(1, parseInt(e.target.value, 10) || 1)
                      )
                    }
                    className="w-full text-right font-mono font-semibold text-emerald-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                  />
                </td>

                <td className="py-2 px-3">
                  <button
                    onClick={() => handleUpdate(s.id, 'isRemnant', !s.isRemnant)}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                      s.isRemnant
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {s.isRemnant ? 'Деловой остаток' : 'Стандартный хлыст'}
                  </button>
                </td>

                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 transition-opacity"
                    title="Удалить заготовку"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 shrink-0">Добавить:</span>
        <input
          type="text"
          placeholder="Название (опц.)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Длина, мм *"
          value={newLength}
          min={1}
          onChange={(e) => setNewLength(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="w-28 text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Кол-во"
          value={newQuantity}
          min={1}
          onChange={(e) => setNewQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className="w-20 text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={isRemnant}
            onChange={(e) => setIsRemnant(e.target.checked)}
            className="rounded text-blue-600"
          />
          <span>Остаток</span>
        </label>
        <button
          onClick={handleAdd}
          disabled={!newLength || newLength <= 0}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            newLength && newLength > 0
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xs'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </button>
      </div>
    </div>
  );
};
