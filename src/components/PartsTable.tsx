import React, { useState } from 'react';
import { Plus, Trash2, ClipboardPaste, Palette, Sparkles } from 'lucide-react';
import { PartDemand } from '../types/cutting';

interface PartsTableProps {
  demands: PartDemand[];
  setDemands: React.Dispatch<React.SetStateAction<PartDemand[]>>;
  onOpenPasteModal: () => void;
  onLoadPreset: (presetKey: string) => void;
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#84CC16', // Lime
];

export const PartsTable: React.FC<PartsTableProps> = ({
  demands,
  setDemands,
  onOpenPasteModal,
  onLoadPreset,
}) => {
  const [newMark, setNewMark] = useState('');
  const [newLength, setNewLength] = useState<number | ''>('');
  const [newQuantity, setNewQuantity] = useState<number | ''>(1);
  const [newNotes, setNewNotes] = useState('');

  const handleAdd = () => {
    if (!newLength || newLength <= 0) return;
    const qty = typeof newQuantity === 'number' && newQuantity > 0 ? newQuantity : 1;
    const color = DEFAULT_COLORS[demands.length % DEFAULT_COLORS.length];

    const newItem: PartDemand = {
      id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      mark: newMark.trim() || `Д-${demands.length + 1}`,
      length: Number(newLength),
      quantity: qty,
      color,
      notes: newNotes.trim() || undefined,
    };

    setDemands((prev) => [...prev, newItem]);
    setNewMark('');
    setNewLength('');
    setNewQuantity(1);
    setNewNotes('');
  };

  const handleDelete = (id: string) => {
    setDemands((prev) => prev.filter((d) => d.id !== id));
  };

  const handleUpdate = (id: string, field: keyof PartDemand, val: any) => {
    setDemands((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: val } : d))
    );
  };

  const handleClearAll = () => {
    if (confirm('Очистить всю спецификацию деталей?')) {
      setDemands([]);
    }
  };

  const totalParts = demands.reduce((acc, d) => acc + (d.quantity || 0), 0);
  const totalLengthM = (
    demands.reduce((acc, d) => acc + (d.length || 0) * (d.quantity || 0), 0) / 1000
  ).toFixed(2);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col h-full">
      {/* Table Top Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 bg-slate-50/70">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Спецификация деталей на раскрой</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              ({demands.length} поз. · {totalParts} шт · {totalLengthM} м)
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Preset dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 hidden sm:inline">Пример:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onLoadPreset(e.target.value);
                  e.target.value = '';
                }
              }}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 hover:border-slate-400 focus:outline-hidden"
              defaultValue=""
            >
              <option value="" disabled>
                Загрузить готовый пример...
              </option>
              <option value="profile_pipe">Труба профильная 60х40 (каркас)</option>
              <option value="steel_pipe">Труба стальная ДУ-50 (контур)</option>
              <option value="channel_beam">Швеллер / Балка (опоры)</option>
            </select>
          </div>

          <button
            onClick={onOpenPasteModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
            <span>Вставить из Excel</span>
          </button>

          {demands.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Очистить список"
            >
              Очистить
            </button>
          )}
        </div>
      </div>

      {/* Grid list */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[380px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/75 sticky top-0 border-b border-slate-200 text-slate-600 select-none z-10">
            <tr>
              <th className="py-2.5 px-3 font-semibold w-10 text-center">Цвет</th>
              <th className="py-2.5 px-3 font-semibold">Марка / Имя</th>
              <th className="py-2.5 px-3 font-semibold text-right w-28">Длина, мм</th>
              <th className="py-2.5 px-3 font-semibold text-right w-24">Кол-во, шт</th>
              <th className="py-2.5 px-3 font-semibold text-right w-24">Итого, м</th>
              <th className="py-2.5 px-3 font-semibold">Примечание</th>
              <th className="py-2.5 px-3 font-semibold text-center w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {demands.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="max-w-sm mx-auto space-y-2">
                    <p className="text-sm font-medium text-slate-600">
                      Спецификация деталей пуста
                    </p>
                    <p className="text-xs text-slate-400">
                      Добавьте детали вручную в строке ниже, вставьте из Excel (Ctrl+V) или
                      загрузите готовый шаблон из выпадающего списка.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              demands.map((d, idx) => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors group">
                  {/* Color tag */}
                  <td className="py-2 px-3 text-center">
                    <input
                      type="color"
                      value={d.color}
                      onChange={(e) => handleUpdate(d.id, 'color', e.target.value)}
                      title="Изменить цвет маркировки"
                      className="w-4 h-4 rounded cursor-pointer border-0 p-0 inline-block align-middle"
                    />
                  </td>

                  {/* Mark */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={d.mark}
                      onChange={(e) => handleUpdate(d.id, 'mark', e.target.value)}
                      className="w-full font-medium text-slate-900 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                    />
                  </td>

                  {/* Length */}
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      value={d.length}
                      min={1}
                      onChange={(e) =>
                        handleUpdate(d.id, 'length', Math.max(1, parseFloat(e.target.value) || 0))
                      }
                      className="w-full text-right font-mono font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                    />
                  </td>

                  {/* Quantity */}
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      value={d.quantity}
                      min={1}
                      onChange={(e) =>
                        handleUpdate(
                          d.id,
                          'quantity',
                          Math.max(1, parseInt(e.target.value, 10) || 1)
                        )
                      }
                      className="w-full text-right font-mono font-semibold text-blue-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white transition-colors"
                    />
                  </td>

                  {/* Total Length in meters */}
                  <td className="py-2 px-3 text-right font-mono text-slate-500">
                    {((d.length * d.quantity) / 1000).toFixed(2)}
                  </td>

                  {/* Notes */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={d.notes || ''}
                      placeholder="—"
                      onChange={(e) => handleUpdate(d.id, 'notes', e.target.value)}
                      className="w-full text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 focus:bg-white text-[11px] transition-colors"
                    />
                  </td>

                  {/* Action */}
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 transition-opacity"
                      title="Удалить строку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Add Row */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 shrink-0">Добавить:</span>
        <input
          type="text"
          placeholder="Марка (напр. Стойка С-1)"
          value={newMark}
          onChange={(e) => setNewMark(e.target.value)}
          className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Длина, мм *"
          value={newLength}
          min={1}
          onChange={(e) => setNewLength(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="w-28 text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Кол-во, шт"
          value={newQuantity}
          min={1}
          onChange={(e) => setNewQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className="w-24 text-xs font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="text"
          placeholder="Примечание (опционально)"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          className="w-40 text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={!newLength || newLength <= 0}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            newLength && newLength > 0
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-2xs'
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
