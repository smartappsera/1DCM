import React, { useState, useRef } from 'react';
import {
  Code2,
  FileCode,
  Upload,
  CheckCircle,
  Copy,
  Trash2,
  ArrowRight,
  Sparkles,
  Layers,
  FolderOpen,
  Plus,
  FileText,
} from 'lucide-react';
import { analyzeVbaCode, SAMPLE_VBA_CODE } from '../utils/vbaParser';
import {
  VBA_MY_RASKROY,
  VBA_MY_GRAPH,
  VBA_MY_LPSOLVE,
} from '../utils/initialVbaProject';
import { VbaInspectionResult, CuttingParams } from '../types/cutting';

interface VbaFileItem {
  id: string;
  name: string;
  content: string;
  type: 'bas' | 'cls' | 'frm' | 'text';
  linesCount: number;
}

interface VbaInspectorModalProps {
  onApplyVbaParams?: (extracted: Partial<CuttingParams>) => void;
}

export const VbaInspectorModal: React.FC<VbaInspectorModalProps> = ({
  onApplyVbaParams,
}) => {
  // Multi-file state initialized with user's real project modules
  const [files, setFiles] = useState<VbaFileItem[]>([
    {
      id: 'file_raskroy',
      name: 'MyRaskroy.bas',
      content: VBA_MY_RASKROY,
      type: 'bas',
      linesCount: VBA_MY_RASKROY.split('\n').length,
    },
    {
      id: 'file_graph',
      name: 'MyGraph.bas',
      content: VBA_MY_GRAPH,
      type: 'bas',
      linesCount: VBA_MY_GRAPH.split('\n').length,
    },
    {
      id: 'file_lpsolve',
      name: 'MyLPsolve.bas',
      content: VBA_MY_LPSOLVE,
      type: 'bas',
      linesCount: VBA_MY_LPSOLVE.split('\n').length,
    },
  ]);

  const [activeFileId, setActiveFileId] = useState<string>('file_raskroy');
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  // Analyze active file
  const activeInspection: VbaInspectionResult = activeFile
    ? analyzeVbaCode(activeFile.content, activeFile.name)
    : {
        fileName: '',
        moduleType: 'text',
        subroutines: [],
        functions: [],
        variablesDetected: [],
        sortingDetected: [],
        algorithmHints: [],
        rawCode: '',
      };

  // Cross-module aggregated analysis across all files
  const allInspections = files.map((f) => ({
    file: f,
    inspection: analyzeVbaCode(f.content, f.name),
  }));

  const allSubroutines = allInspections.flatMap((item) =>
    item.inspection.subroutines.map((s) => ({ name: s, file: item.file.name }))
  );

  const allFunctions = allInspections.flatMap((item) =>
    item.inspection.functions.map((fn) => ({ name: fn, file: item.file.name }))
  );

  const allVariables = Array.from(
    new Set(allInspections.flatMap((item) => item.inspection.variablesDetected))
  );

  const allHints = allInspections.flatMap((item) =>
    item.inspection.algorithmHints.map((hint) => ({ hint, file: item.file.name }))
  );

  // Helper to determine file type from extension
  const getFileType = (name: string): VbaFileItem['type'] => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.bas')) return 'bas';
    if (lower.endsWith('.cls')) return 'cls';
    if (lower.endsWith('.frm')) return 'frm';
    return 'text';
  };

  const [copiedAll, setCopiedAll] = useState(false);

  // Process multiple files
  const processUploadedFiles = async (fileList: FileList | File[]) => {
    const newItems: VbaFileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const text = await file.text();
        newItems.push({
          id: `file_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
          name: file.name,
          content: text,
          type: getFileType(file.name),
          linesCount: text.split('\n').length,
        });
      } catch (err) {
        console.error('Error reading file:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      setFiles((prev) => {
        // If previous had only the single sample file, replace it completely
        if (prev.length === 1 && prev[0].id === 'file_default') {
          return newItems;
        }
        return [...prev, ...newItems];
      });
      setActiveFileId(newItems[0].id);

      // Attempt to save to backend disk so agent can inspect directly
      try {
        await fetch('/api/save-vba-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: newItems.map((f) => ({ name: f.name, content: f.content })),
          }),
        });
      } catch (e) {
        console.error('Server save error:', e);
      }
    }
  };

  const handleCopyAllFilesForChat = () => {
    const combined = files
      .map(
        (f) =>
          `' ================================================================\n` +
          `' ФАЙЛ: ${f.name} (${f.type.toUpperCase()}, ${f.linesCount} строк)\n` +
          `' ================================================================\n\n` +
          f.content +
          `\n\n`
      )
      .join('\n');

    navigator.clipboard.writeText(combined);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      if (filtered.length > 0) {
        if (activeFileId === id) {
          setActiveFileId(filtered[0].id);
        }
      }
      return filtered;
    });
  };

  const handleClearAll = () => {
    if (confirm('Очистить все загруженные файлы?')) {
      setFiles([]);
      setActiveFileId('');
    }
  };

  const handleCopyCode = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Auto-extract parameters searching across all files
  const handleAutoExtractAll = () => {
    const extracted: Partial<CuttingParams> = {};
    const fullCombinedCode = files.map((f) => f.content).join('\n');

    const kerfMatch = fullCombinedCode.match(
      /bladeKerf\s*=\s*([0-9.]+)|керф\s*=\s*([0-9.]+)|пропил\s*=\s*([0-9.]+)|рез\s*=\s*([0-9.]+)/i
    );
    if (kerfMatch) {
      extracted.bladeWidth = parseFloat(
        kerfMatch[1] || kerfMatch[2] || kerfMatch[3] || kerfMatch[4]
      );
    }

    const trimLeftMatch = fullCombinedCode.match(
      /trimLeft\s*=\s*([0-9.]+)|торцовка(?:Начала)?\s*=\s*([0-9.]+)|кромка\s*=\s*([0-9.]+)/i
    );
    if (trimLeftMatch) {
      extracted.trimStart = parseFloat(trimLeftMatch[1] || trimLeftMatch[2] || trimLeftMatch[3]);
    }

    const remnantMatch = fullCombinedCode.match(
      /minReusable(?:Remnant)?\s*=\s*([0-9.]+)|деловой(?:Остаток)?\s*=\s*([0-9.]+)/i
    );
    if (remnantMatch) {
      extracted.minReusableLength = parseFloat(remnantMatch[1] || remnantMatch[2]);
    }

    if (onApplyVbaParams && Object.keys(extracted).length > 0) {
      onApplyVbaParams(extracted);
      alert(
        `Параметры успешно извлечены из всех ${files.length} модулей:\n` +
          `• Ширина реза: ${extracted.bladeWidth || '—'} мм\n` +
          `• Кромка/торцовка: ${extracted.trimStart || '—'} мм\n` +
          `• Деловой остаток: ${extracted.minReusableLength || '—'} мм`
      );
    } else {
      alert(`Просканировано ${files.length} файлов. Явных присваиваний констант не найдено.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl p-6 border-2 border-dashed transition-all duration-200 text-center flex flex-col items-center justify-center cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/50 shadow-xs'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".bas,.cls,.frm,.frx,.txt"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
          <Upload className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-slate-800">
          Перетащите сюда все 6 файлов проекта (.bas, .cls, .frm)
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-lg">
          Поддерживается одновременная загрузка любого количества файлов.
          Кликните для выбора через проводник или просто перетащите файлы мышью.
        </p>

        <div className="flex items-center gap-2 mt-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-100 text-blue-800">
            .BAS (модули)
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-100 text-purple-800">
            .CLS (классы)
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-800">
            .FRM (формы)
          </span>
        </div>
      </div>

      {/* Prominent Assistant Transfer Banner */}
      {files.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-4 shadow-sm border border-blue-800 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h4 className="text-sm font-bold">
                В проекте загружено {files.length} {files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'} ({files.reduce((a, b) => a + b.linesCount, 0)} строк кода)
              </h4>
            </div>
            <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
              Чтобы передать весь код ассистенту для полного анализа и переноса логики: нажмите кнопку справа, затем просто нажмите <kbd className="px-1.5 py-0.5 rounded bg-blue-800 border border-blue-700 font-mono text-[11px]">Ctrl+V</kbd> в окне чата и отправьте сообщение!
            </p>
          </div>

          <button
            onClick={handleCopyAllFilesForChat}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-900 bg-white hover:bg-blue-50 rounded-lg shadow-sm transition-all transform hover:scale-[1.02] shrink-0"
          >
            {copiedAll ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-extrabold">✓ Все файлы скопированы!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-blue-600" />
                <span>Скопировать все {files.length} файлов для чата</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Main Workspace: File List + Code Viewer + Cross-Module Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: File Manager / Project Tree (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
          <div className="p-3 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
              <FolderOpen className="w-4 h-4 text-blue-600" />
              <span>Файлы проекта ({files.length})</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Добавить еще файлы"
                className="p-1 text-slate-600 hover:text-blue-600 rounded hover:bg-slate-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              {files.length > 0 && (
                <button
                  onClick={handleClearAll}
                  title="Очистить все"
                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Files List */}
          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {files.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Файлы не загружены. Перетащите их в область выше.
              </div>
            ) : (
              files.map((file) => {
                const isActive = file.id === activeFileId;
                const badgeColor =
                  file.type === 'bas'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : file.type === 'cls'
                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                    : file.type === 'frm'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <div
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors group ${
                      isActive
                        ? 'bg-blue-50/90 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badgeColor}`}
                      >
                        {file.type}
                      </span>
                      <div className="overflow-hidden">
                        <div
                          className={`text-xs font-semibold truncate ${
                            isActive ? 'text-blue-900' : 'text-slate-800'
                          }`}
                          title={file.name}
                        >
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {file.linesCount} строк
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteFile(file.id, e)}
                      title="Удалить файл"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Column: Code Editor / Viewer (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2 font-mono text-slate-700">
              <FileCode className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-900">{activeFile?.name || 'Нет файла'}</span>
              <span className="text-slate-400">({activeFile?.linesCount || 0} строк)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                disabled={!activeFile}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
                title="Скопировать код файла"
              >
                {copied ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
          </div>

          {/* Code text area */}
          <div className="p-2 flex-1">
            <textarea
              value={activeFile?.content || ''}
              onChange={(e) => {
                const val = e.target.value;
                setFiles((prev) =>
                  prev.map((f) =>
                    f.id === activeFileId
                      ? { ...f, content: val, linesCount: val.split('\n').length }
                      : f
                  )
                );
              }}
              placeholder="Содержимое выбранного файла..."
              rows={20}
              className="w-full font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg border border-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
            />
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px]">
              Вы можете редактировать код прямо здесь или копировать отдельные фрагменты.
            </span>
            <button
              onClick={handleAutoExtractAll}
              className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Сканировать все файлы</span>
            </button>
          </div>
        </div>

        {/* Right Column: Cross-Module Unified Analysis (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Summary Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Сводный анализ проекта ({files.length} модулей)
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              {/* Procedures across all files */}
              <div>
                <span className="text-slate-500 font-semibold block mb-1">
                  Все процедуры ({allSubroutines.length + allFunctions.length}):
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {allSubroutines.length + allFunctions.length === 0 ? (
                    <span className="text-slate-400 italic">Процедуры не найдены</span>
                  ) : (
                    allSubroutines.concat(allFunctions).map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1 rounded bg-slate-50 text-[11px]"
                      >
                        <span className="font-mono font-bold text-slate-800">
                          {p.name}()
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                          {p.file}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Shared Variables */}
              <div>
                <span className="text-slate-500 font-semibold block mb-1">
                  Обнаруженные переменные и массивы:
                </span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {allVariables.length === 0 ? (
                    <span className="text-slate-400 italic">Переменные не найдены</span>
                  ) : (
                    allVariables.map((v, idx) => (
                      <span
                        key={idx}
                        className="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded font-mono text-[10px]"
                      >
                        {v}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Cutting parameter mentions */}
              <div>
                <span className="text-slate-500 font-semibold block mb-1">
                  Правила раскроя и технологические константы:
                </span>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {allHints.length === 0 ? (
                    <span className="text-slate-400 italic">Совпадений не найдено</span>
                  ) : (
                    allHints.slice(0, 8).map((h, idx) => (
                      <div
                        key={idx}
                        className="p-1 bg-slate-50 rounded border border-slate-200 font-mono text-[10px] text-slate-700 truncate"
                        title={`${h.file}: ${h.hint}`}
                      >
                        <span className="text-blue-600 mr-1">[{h.file}]</span>
                        {h.hint}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Migration Guidance Card */}
          <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-xs text-xs space-y-2">
            <div className="font-bold text-blue-400 flex items-center gap-1.5">
              <Code2 className="w-4 h-4" />
              <span>Сквозная архитектура модулей</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Загрузив все 6 файлов, вы можете скинуть их названия или ключевую математическую
              функцию, и я интегрирую ветки расчета в <code className="font-mono text-emerald-300">cuttingEngine.ts</code> со 100% точностью.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
