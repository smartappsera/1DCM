import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileCode,
  FileSpreadsheet,
  Check,
  Plus,
  RefreshCw,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  deepParseFileForStock,
  DeepParsedStockResult,
  ParsedStockMaterialGroup,
  ExportableItem,
} from '../utils/dataIO';
import { DynamicRowItem } from './DynamicInputBlock';

interface StockUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMaterial: string;
  onImportItems: (
    items: DynamicRowItem[],
    selectedMaterialName: string,
    mode: 'replace' | 'append',
    updateMaterialInSettings: boolean
  ) => void;
}

export const StockUploadModal: React.FC<StockUploadModalProps> = ({
  isOpen,
  onClose,
  currentMaterial,
  onImportItems,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsedData, setParsedData] = useState<DeepParsedStockResult | null>(null);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number>(0);
  const [updateMaterialSettings, setUpdateMaterialSettings] = useState<boolean>(true);
  const [preserveStandardBars, setPreserveStandardBars] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileProcess = (file: File) => {
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text || !text.trim()) {
          setErrorMessage('Файл пуст или поврежден');
          return;
        }

        const result = deepParseFileForStock(text, file.name);
        if (!result.materials || result.materials.length === 0) {
          setErrorMessage(
            'В файле не найдено заготовок. Убедитесь, что файл содержит теги <Заготовка> с размерами или строки данных CSV/TXT.'
          );
          return;
        }

        setParsedData(result);

        // Try to match current active material
        let matchIdx = 0;
        if (currentMaterial) {
          const cleanCur = currentMaterial.trim().toLowerCase();
          const found = result.materials.findIndex((m) =>
            m.name.trim().toLowerCase().includes(cleanCur)
          );
          if (found >= 0) matchIdx = found;
        }
        setSelectedMaterialIndex(matchIdx);
      } catch (err: any) {
        setErrorMessage(`Ошибка обработки файла: ${err.message || 'Неизвестная ошибка'}`);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Не удалось прочитать выбранный файл');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  // Demo multi-material warehouse XML generator
  const handleLoadDemoWarehouse = () => {
    const demoXml = `<?xml version="1.0" encoding="UTF-8"?>
<Склад>
  <Материал наименование="Труба профильная 40х40х2">
    <Заготовка id="1">
      <Обозначение>Стандарт</Обозначение>
      <Размер>6000</Размер>
      <Количество>0</Количество>
      <Примечание>Рассчитать по потребности</Примечание>
    </Заготовка>
    <Заготовка id="2">
      <Обозначение>Остаток цех 1</Обозначение>
      <Размер>2630</Размер>
      <Количество>18</Количество>
      <Примечание>Деловой остаток</Примечание>
    </Заготовка>
    <Заготовка id="3">
      <Обозначение>Остаток стеллаж Б</Обозначение>
      <Размер>580</Размер>
      <Количество>100</Количество>
      <Примечание>Короткий обрезок</Примечание>
    </Заготовка>
    <Заготовка id="4">
      <Обозначение>Остаток раскроя</Обозначение>
      <Размер>1850</Размер>
      <Количество>5</Количество>
      <Примечание>Деловой остаток</Примечание>
    </Заготовка>
  </Материал>
  <Материал наименование="Труба профильная 60х40х3">
    <Заготовка id="1">
      <Обозначение>Стандарт</Обозначение>
      <Размер>6000</Размер>
      <Количество>0</Количество>
      <Примечание>Рассчитать</Примечание>
    </Заготовка>
    <Заготовка id="2">
      <Обозначение>Обрезок после заказа 114</Обозначение>
      <Размер>3420</Размер>
      <Количество>12</Количество>
      <Примечание>Деловой остаток</Примечание>
    </Заготовка>
    <Заготовка id="3">
      <Обозначение>Деловой рез</Обозначение>
      <Размер>2150</Размер>
      <Количество>8</Количество>
      <Примечание>Хорошее состояние</Примечание>
    </Заготовка>
  </Материал>
  <Материал наименование="Швеллер 12У ГОСТ 8240-97">
    <Заготовка id="1">
      <Обозначение>Стандарт 12м</Обозначение>
      <Размер>12000</Размер>
      <Количество>0</Количество>
      <Примечание>Авто</Примечание>
    </Заготовка>
    <Заготовка id="2">
      <Обозначение>Остаток монтаж</Обозначение>
      <Размер>4100</Размер>
      <Количество>6</Количество>
      <Примечание>Деловой</Примечание>
    </Заготовка>
  </Материал>
</Склад>`;

    const result = deepParseFileForStock(demoXml, 'Склад_Металлобаза_Пример.xml');
    setParsedData(result);
    setSelectedMaterialIndex(0);
    setErrorMessage(null);
  };

  const selectedGroup: ParsedStockMaterialGroup | null =
    parsedData && parsedData.materials[selectedMaterialIndex]
      ? parsedData.materials[selectedMaterialIndex]
      : null;

  const handleConfirmImport = (mode: 'replace' | 'append') => {
    if (!selectedGroup) return;

    let convertedItems: DynamicRowItem[] = selectedGroup.items.map((item, idx) => ({
      id: `stock_${Date.now()}_${idx}`,
      orderIndex: idx + 1,
      length: item.length,
      quantity: item.quantity,
      mark: item.mark || (item.length === 6000 || item.length === 12000 ? 'Стандарт' : 'Обрезок'),
      notes: item.notes || '',
      isStandardUnlimited: (item.length === 6000 || item.length === 12000) && item.quantity === 0,
    }));

    // If replace mode and user wants to preserve standard unlimited bars 6000 and 12000 if not present
    if (mode === 'replace' && preserveStandardBars) {
      const has6000 = convertedItems.some((i) => i.length === 6000);
      const has12000 = convertedItems.some((i) => i.length === 12000);

      const standardPrefix: DynamicRowItem[] = [];
      if (!has6000) {
        standardPrefix.push({
          id: `std_6000_${Date.now()}`,
          orderIndex: 0,
          length: 6000,
          quantity: 0,
          mark: 'Стандарт',
          notes: 'Рассчитать кол-во',
          isStandardUnlimited: true,
        });
      }
      if (!has12000) {
        standardPrefix.push({
          id: `std_12000_${Date.now()}`,
          orderIndex: 0,
          length: 12000,
          quantity: 0,
          mark: 'Стандарт',
          notes: 'Рассчитать кол-во',
          isStandardUnlimited: true,
        });
      }

      if (standardPrefix.length > 0) {
        convertedItems = [...standardPrefix, ...convertedItems].map((it, idx) => ({
          ...it,
          orderIndex: idx + 1,
        }));
      }
    }

    onImportItems(
      convertedItems,
      selectedGroup.name,
      mode,
      updateMaterialSettings
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Загрузка заготовок и обрезков на склад («ЕСТЬ»)
              </h2>
              <p className="text-xs text-slate-500">
                Анализ файла склада, выбор материала и предварительный просмотр заготовок
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 font-bold ml-2"
              >
                ×
              </button>
            </div>
          )}

          {/* 1. File Upload Dropzone / Trigger */}
          {!parsedData ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
              }`}
            >
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-blue-600">
                  <FileCode className="w-7 h-7" />
                </div>
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Перетащите файл склада сюда или нажмите для выбора
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Поддерживаются файлы склада <strong>.xml</strong> (с группировкой по материалам),{' '}
                <strong>.csv</strong> и <strong>.txt</strong>
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,.csv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Выбрать файл с диска</span>
                </button>
                <button
                  onClick={handleLoadDemoWarehouse}
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Пример склада (XML с 3 материалами)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    {parsedData.fileType === 'xml' ? (
                      <FileCode className="w-4 h-4" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      {parsedData.fileName}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Формат: {parsedData.fileType.toUpperCase()} · Обнаружено материалов:{' '}
                      <strong>{parsedData.materials.length}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,.csv,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Сменить файл</span>
                  </button>
                </div>
              </div>

              {/* Material Selector Block */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Выберите материал для загрузки на склад («ЕСТЬ»):</span>
                  </label>
                  <span className="text-[11px] font-semibold text-blue-700">
                    Доступно: {parsedData.materials.length} вар.
                  </span>
                </div>

                <select
                  value={selectedMaterialIndex}
                  onChange={(e) => setSelectedMaterialIndex(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-bold text-slate-900 bg-white border border-blue-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  {parsedData.materials.map((mat, idx) => (
                    <option key={idx} value={idx}>
                      {mat.name} ({mat.items.length} типоразм., {mat.totalPieces} шт., ~
                      {mat.totalLengthMeters} м)
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={updateMaterialSettings}
                      onChange={(e) => setUpdateMaterialSettings(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <span className="font-medium">
                      Установить «{selectedGroup?.name}» в общих параметрах материала
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={preserveStandardBars}
                      onChange={(e) => setPreserveStandardBars(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <span className="font-medium">
                      Добавить стандартные хлысты 6000 и 12000 мм (рассчитать кол-во)
                    </span>
                  </label>
                </div>
              </div>

              {/* Preview of blanks and remnants for selected material */}
              {selectedGroup && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span>Предварительный просмотр заготовок и обрезков:</span>
                      <span className="text-blue-700 font-bold">({selectedGroup.items.length} поз.)</span>
                    </h4>

                    {/* KPI badges for selected material */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-mono font-semibold">
                        Всего шт:{' '}
                        <strong className="text-slate-900">{selectedGroup.totalPieces}</strong>
                      </span>
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-mono font-semibold">
                        Метраж:{' '}
                        <strong className="text-blue-700">{selectedGroup.totalLengthMeters} м</strong>
                      </span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 text-center w-12">№</th>
                          <th className="py-2 px-3">Обозначение</th>
                          <th className="py-2 px-3 text-right">Длина (мм)</th>
                          <th className="py-2 px-3 text-right">Кол-во (шт)</th>
                          <th className="py-2 px-3 text-center">Тип</th>
                          <th className="py-2 px-3">Примечание</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedGroup.items.map((item, idx) => {
                          const isStd =
                            (item.length === 6000 || item.length === 12000) && item.quantity === 0;
                          const isRemnant = item.length < 6000;
                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-3 text-center font-mono text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">
                                {item.mark || (isStd ? 'Стандарт' : '—')}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                {item.length}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold">
                                {isStd ? (
                                  <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
                                    По потребности
                                  </span>
                                ) : (
                                  <span>{item.quantity} шт.</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isStd ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                    Стандарт
                                  </span>
                                ) : isRemnant ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                                    Деловой обрезок
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                    Хлыст
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-500 truncate max-w-xs">
                                {item.notes || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Отмена
          </button>

          {parsedData && selectedGroup && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleConfirmImport('append')}
                className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить к текущему складу</span>
              </button>
              <button
                onClick={() => handleConfirmImport('replace')}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Заменить склад выбранным материалом</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
