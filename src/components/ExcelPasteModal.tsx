import React, { useState } from 'react';
import { X, Clipboard, Check, FileSpreadsheet } from 'lucide-react';
import { parseExcelClipboardText } from '../utils/excelIO';

interface ExcelPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: { mark: string; length: number; quantity: number; notes?: string }[]) => void;
  targetTitle?: string;
}

export const ExcelPasteModal: React.FC<ExcelPasteModalProps> = ({
  isOpen,
  onClose,
  onImport,
  targetTitle = 'Нужно (Спецификация)',
}) => {
  const [pasteText, setPasteText] = useState('');
  const [previewItems, setPreviewItems] = useState<
    { mark: string; length: number; quantity: number; notes?: string }[]
  >([]);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setPasteText(text);
    const parsed = parseExcelClipboardText(text);
    setPreviewItems(parsed);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      handleTextChange(text);
    } catch {
      // Manual paste fallback
    }
  };

  const handleApply = () => {
    if (previewItems.length > 0) {
      onImport(previewItems);
      onClose();
      setPasteText('');
      setPreviewItems([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-semibold text-slate-900">
              Вставка в «{targetTitle}» из Excel / Буфера обмена
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="text-xs text-slate-600 leading-relaxed">
            Скопируйте ячейки из Excel (Ctrl+C) и вставьте в поле ниже.
            Поддерживаются форматы: <br />
            <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">
              Позиция / Марка [Tab] Длина (мм) [Tab] Количество (шт) [Tab] Примечание
            </span>{' '}
            или наоборот с длины.
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePasteFromClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Clipboard className="w-4 h-4 text-slate-500" />
              <span>Вставить из буфера</span>
            </button>
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Вставьте скопированные строки из Excel сюда...&#10;Пример:&#10;Стойка 1	1850	8&#10;Стойка 2	1420	12&#10;Перемычка	650	24"
            rows={5}
            className="w-full font-mono text-xs p-3 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />

          {previewItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800">
                  Распознано позиций: {previewItems.length} (всего{' '}
                  {previewItems.reduce((acc, i) => acc + i.quantity, 0)} деталей)
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">№</th>
                      <th className="py-2 px-3 font-semibold">Марка / Имя</th>
                      <th className="py-2 px-3 font-semibold text-right">Длина, мм</th>
                      <th className="py-2 px-3 font-semibold text-right">Кол-во, шт</th>
                      <th className="py-2 px-3 font-semibold">Примечания</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-3 font-medium text-slate-900">{item.mark}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-medium text-slate-800">
                          {item.length}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-medium text-blue-700">
                          {item.quantity}
                        </td>
                        <td className="py-1.5 px-3 text-slate-500 text-[11px] truncate max-w-[150px]">
                          {item.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleApply}
            disabled={previewItems.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              previewItems.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-xs'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Добавить в спецификацию ({previewItems.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
