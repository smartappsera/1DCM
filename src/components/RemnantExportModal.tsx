import React, { useState, useRef } from 'react';
import { RemnantItem } from '../types/cutting';
import {
  X,
  Download,
  FileSpreadsheet,
  FileCode,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  exportRemnantsToXml,
  exportItemsToCsv,
  updateWarehouseMaterialXml,
} from '../utils/dataIO';

interface RemnantExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  remnants: RemnantItem[];
  currentMaterial: string;
  onSuccessToast: (msg: string) => void;
}

export const RemnantExportModal: React.FC<RemnantExportModalProps> = ({
  isOpen,
  onClose,
  remnants,
  currentMaterial,
  onSuccessToast,
}) => {
  const [exportMode, setExportMode] = useState<'new_file' | 'update_file'>('new_file');
  const [fileFormat, setFileFormat] = useState<'xml' | 'csv'>('xml');
  const [includeStandard, setIncludeStandard] = useState(false);
  const [appendDate, setAppendDate] = useState(true);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContentToUpdate, setFileContentToUpdate] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const updateFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Filter remnants based on includeStandard
  const filteredRemnants = remnants.filter((r) => {
    if (!includeStandard && (r.length === 6000 || r.length === 12000)) {
      return false;
    }
    return r.quantity > 0;
  });

  const totalQty = filteredRemnants.reduce((sum, r) => sum + r.quantity, 0);
  const totalLengthMeters = (
    filteredRemnants.reduce((sum, r) => sum + r.length * r.quantity, 0) / 1000
  ).toFixed(2);

  const handleSelectUpdateFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setErrorMsg('Файл пуст');
        return;
      }
      setFileContentToUpdate(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecute = () => {
    if (filteredRemnants.length === 0) {
      setErrorMsg('Нет остатков для выгрузки');
      return;
    }

    const dateStr = appendDate ? `_${new Date().toISOString().slice(0, 10)}` : '';
    const safeMat = (currentMaterial || 'Профиль').replace(/[/\\?%*:|"<>]/g, '_');

    if (exportMode === 'new_file') {
      if (fileFormat === 'xml') {
        const filename = `Остатки_${safeMat}${dateStr}.xml`;
        exportRemnantsToXml(filteredRemnants, currentMaterial, filename);
        onSuccessToast(`Файл «${filename}» успешно сформирован (${filteredRemnants.length} поз.)`);
      } else {
        const filename = `Остатки_${safeMat}${dateStr}.csv`;
        exportItemsToCsv(
          filteredRemnants.map((r) => ({
            length: r.length,
            quantity: r.quantity,
            mark: r.mark || 'Деловой остаток',
            notes: r.notes || '',
          })),
          currentMaterial,
          filename
        );
        onSuccessToast(`Файл CSV «${filename}» успешно сформирован`);
      }
      onClose();
    } else {
      // Update existing file
      if (!fileContentToUpdate) {
        setErrorMsg('Пожалуйста, выберите файл склада (.xml) для обновления');
        return;
      }

      try {
        const updatedXml = updateWarehouseMaterialXml(
          fileContentToUpdate,
          currentMaterial,
          filteredRemnants
        );
        const blob = new Blob([updatedXml], { type: 'application/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const outName = selectedFileName.replace(/\.xml$/i, '') + '_обновлен.xml';
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        onSuccessToast(`Файл «${outName}» сохранен с обновленными остатками для «${currentMaterial}»`);
        onClose();
      } catch (err: any) {
        setErrorMsg(`Ошибка обновления: ${err.message}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">Экспорт и обновление остатков</h3>
              <p className="text-[11px] text-slate-400">
                Материал: <strong className="text-white">{currentMaterial || '—'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
          {/* Summary Box */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-blue-900 font-semibold block">Готово к выгрузке:</span>
              <span className="text-slate-600 text-[11px]">
                {filteredRemnants.length} типоразмеров · {totalQty} шт.
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Суммарная длина
              </span>
              <span className="font-mono font-bold text-blue-700 text-sm">
                {totalLengthMeters} м
              </span>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Выберите действие:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-3 rounded-lg border flex flex-col gap-1 cursor-pointer transition-colors ${
                  exportMode === 'new_file'
                    ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exportMode"
                    checked={exportMode === 'new_file'}
                    onChange={() => setExportMode('new_file')}
                    className="text-blue-600"
                  />
                  <span className="font-bold">Новый файл остатков</span>
                </div>
                <span className="text-[11px] text-slate-500 pl-5">
                  Выгрузить в отдельный XML или CSV файл
                </span>
              </label>

              <label
                className={`p-3 rounded-lg border flex flex-col gap-1 cursor-pointer transition-colors ${
                  exportMode === 'update_file'
                    ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exportMode"
                    checked={exportMode === 'update_file'}
                    onChange={() => setExportMode('update_file')}
                    className="text-blue-600"
                  />
                  <span className="font-bold">Обновить файл склада</span>
                </div>
                <span className="text-[11px] text-slate-500 pl-5">
                  Заменить блок текущего материала в существующем XML
                </span>
              </label>
            </div>
          </div>

          {/* Conditional Options: New File vs Update Existing */}
          {exportMode === 'new_file' ? (
            <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Формат файла:</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="fileFormat"
                      checked={fileFormat === 'xml'}
                      onChange={() => setFileFormat('xml')}
                      className="text-blue-600"
                    />
                    <FileCode className="w-3.5 h-3.5 text-blue-600" />
                    <span>XML (.xml)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="fileFormat"
                      checked={fileFormat === 'csv'}
                      onChange={() => setFileFormat('csv')}
                      className="text-blue-600"
                    />
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CSV (.csv)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStandard}
                    onChange={(e) => setIncludeStandard(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Включать стандартные размеры (6000 / 12000 мм)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appendDate}
                    onChange={(e) => setAppendDate(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Добавлять текущую дату к имени файла</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <RefreshCw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-amber-900 block">
                    Выбор файла склада для обновления
                  </span>
                  <p className="text-[11px] text-amber-800 leading-tight">
                    Будет заменен только блок остатков для материала «{currentMaterial}». Все
                    остальные материалы, профили и комментарии в исходном файле склада останутся
                    нетронутыми.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateFileInputRef.current?.click()}
                  className="px-3 py-1.5 font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>{selectedFileName ? 'Выбрать другой файл' : 'Выбрать файл склада (.xml)'}</span>
                </button>
                <input
                  ref={updateFileInputRef}
                  type="file"
                  accept=".xml"
                  onChange={handleSelectUpdateFile}
                  className="hidden"
                />
                {selectedFileName && (
                  <span className="text-[11px] text-slate-700 font-mono font-medium truncate max-w-xs">
                    {selectedFileName}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Remnants Table Preview */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Предпросмотр записей:
            </span>
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-36">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b">
                  <tr>
                    <th className="py-1 px-2 w-8 text-center">№</th>
                    <th className="py-1 px-2">Обозначение</th>
                    <th className="py-1 px-2 text-right">Размер (мм)</th>
                    <th className="py-1 px-2 text-right">Кол-во (шт)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredRemnants.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-1 px-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-1 px-2 font-sans text-slate-800">
                        {r.mark || 'Деловой остаток'}
                      </td>
                      <td className="py-1 px-2 text-right font-bold text-slate-900">{r.length}</td>
                      <td className="py-1 px-2 text-right font-bold text-blue-700">{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleExecute}
            className="flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            {exportMode === 'new_file' ? (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Выгрузить файл</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Обновить в файле</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
