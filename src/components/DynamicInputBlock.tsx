import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  Upload,
  ClipboardPaste,
  Columns,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  exportItemsToCsv,
  exportItemsToXml,
  parseItemsFromCsv,
  parseItemsFromXml,
} from '../utils/dataIO';
import { getColorForLength, getDefaultDemandColor } from '../utils/cuttingEngine';
import { StockUploadModal } from './StockUploadModal';
import { RemnantExportModal } from './RemnantExportModal';

export interface DynamicRowItem {
  id: string;
  orderIndex: number;
  length: number;
  quantity: number;
  mark?: string; // Обозначение
  notes?: string; // Примечание
  isStandardUnlimited?: boolean; // Авторасчет для 6000/12000 (По потребности)
  isStandard?: boolean; // Стандартная заготовка (6000 или 12000)
  isActive?: boolean; // Активна ли для расчета (галочка)
  usedOrPlaced?: number;
  remainingOrUnplaced?: number;
  color?: string; // Зафиксированный цвет заготовки как неотъемлемое свойство
}

export interface CompanionResultItem {
  length: number;
  quantity: number;
  mark?: string;
  notes?: string;
}

interface DynamicInputBlockProps {
  title: 'Есть' | 'Нужно';
  companionTitle: 'Осталось' | 'Не сделано';
  items: DynamicRowItem[];
  setItems: React.Dispatch<React.SetStateAction<DynamicRowItem[]>>;
  companionItems: CompanionResultItem[];
  usedOrPlacedColHeader: 'Использовано' | 'Разложено';
  remainingColHeader: 'Не использов.' | 'Не разложено';
  currentMaterial?: string;
  onMaterialChange?: (materialName: string, source?: 'file' | 'manual') => void;
  getUsedOrPlaced?: (item: DynamicRowItem) => number;
  getRemaining?: (item: DynamicRowItem) => number;
  hasCalculated?: boolean;
  onOpenPasteModal?: () => void;
  isLocked?: boolean;
  onRequestUnlock?: () => void;
  onUnlockMaterial?: () => void;
}

export const DynamicInputBlock: React.FC<DynamicInputBlockProps> = ({
  title,
  companionTitle,
  items,
  setItems,
  companionItems,
  usedOrPlacedColHeader,
  remainingColHeader,
  currentMaterial = 'Труба профильная',
  onMaterialChange,
  getUsedOrPlaced,
  getRemaining,
  hasCalculated = false,
  onOpenPasteModal,
  isLocked = false,
  onRequestUnlock,
  onUnlockMaterial,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStockUploadModalOpen, setIsStockUploadModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Column visibility settings (Requirement 12: used/remaining hidden by default)
  const [showColumnsPopover, setShowColumnsPopover] = useState(false);
  const columnsPopoverRef = useRef<HTMLDivElement>(null);
  const [columnsConfig, setColumnsConfig] = useState({
    mark: title === 'Нужно', // In standard set: "Обозначение" is enabled for НУЖНО
    notes: false,
    usedOrPlaced: false, // Default hidden per req 12
    remainingOrUnplaced: false, // Default hidden per req 12
  });

  // Table sorting (Requirement 11)
  const [sortField, setSortField] = useState<'orderIndex' | 'mark' | 'length' | 'quantity' | 'notes' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Companion table sorting (Requirement 13: default descending by length)
  const [companionSortField, setCompanionSortField] = useState<'length' | 'quantity'>('length');
  const [companionSortDir, setCompanionSortDir] = useState<'asc' | 'desc'>('desc');

  // Mobile actions dropdown
  const [showMobileActions, setShowMobileActions] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside automatically
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showColumnsPopover &&
        columnsPopoverRef.current &&
        !columnsPopoverRef.current.contains(event.target as Node)
      ) {
        setShowColumnsPopover(false);
      }
      if (
        showMobileActions &&
        mobileActionsRef.current &&
        !mobileActionsRef.current.contains(event.target as Node)
      ) {
        setShowMobileActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnsPopover, showMobileActions]);

  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Filter companion items (Requirement 9: remove items with quantity <= 0)
  const filteredCompanionItems = companionItems.filter((c) => c.quantity > 0);

  // Totals for main table
  const activeItems = items.filter((i) => i.isActive !== false);
  const totalLength = activeItems.reduce((sum, i) => sum + (i.length || 0), 0);

  // Check if any active standard item is in "По потребности"
  const hasAutoStandard =
    title === 'Есть' &&
    activeItems.some(
      (i) =>
        (i.length === 6000 || i.length === 12000 || i.isStandard || i.isStandardUnlimited) &&
        (i.isStandardUnlimited || i.quantity <= 0)
    );

  const fixedQtyTotal = activeItems
    .filter(
      (i) =>
        !(
          title === 'Есть' &&
          (i.length === 6000 || i.length === 12000 || i.isStandard || i.isStandardUnlimited) &&
          (i.isStandardUnlimited || i.quantity <= 0)
        )
    )
    .reduce((sum, i) => sum + (i.quantity || 0), 0);

  const totalUsedOrPlaced = items.reduce(
    (sum, i) => sum + (getUsedOrPlaced ? getUsedOrPlaced(i) : i.usedOrPlaced || 0),
    0
  );

  const totalRemaining = items.reduce(
    (sum, i) => sum + (getRemaining ? getRemaining(i) : i.remainingOrUnplaced || 0),
    0
  );

  // Totals for companion table
  const companionTotalLength = filteredCompanionItems.reduce(
    (sum, c) => sum + (c.length || 0) * (c.quantity || 0),
    0
  );
  const companionTotalQty = filteredCompanionItems.reduce(
    (sum, c) => sum + (c.quantity || 0),
    0
  );
  // Sorting for main table (Requirement 11: 12000 first, 6000 second always pinned at top in "Есть")
  const displayItems = useMemo(() => {
    if (title === 'Есть') {
      const std12 = items.find(
        (i) => (i.length === 12000 || i.id === 's_def_12000') && (i.isStandard || i.isStandardUnlimited || i.length === 12000)
      );
      const std6 = items.find(
        (i) => (i.length === 6000 || i.id === 's_def_6000') && (i.isStandard || i.isStandardUnlimited || i.length === 6000)
      );
      const customItems = items.filter(
        (i) => i.id !== std12?.id && i.id !== std6?.id
      );

      if (sortField) {
        customItems.sort((a, b) => {
          let diff = 0;
          if (sortField === 'orderIndex') diff = a.orderIndex - b.orderIndex;
          else if (sortField === 'length') diff = a.length - b.length;
          else if (sortField === 'quantity') diff = a.quantity - b.quantity;
          else if (sortField === 'mark') diff = (a.mark || '').localeCompare(b.mark || '');
          else if (sortField === 'notes') diff = (a.notes || '').localeCompare(b.notes || '');
          return sortDir === 'asc' ? diff : -diff;
        });
      }

      const pinned: DynamicRowItem[] = [];
      if (std12) pinned.push(std12);
      if (std6) pinned.push(std6);
      return [...pinned, ...customItems];
    } else {
      const list = [...items];
      if (sortField) {
        list.sort((a, b) => {
          let diff = 0;
          if (sortField === 'orderIndex') diff = a.orderIndex - b.orderIndex;
          else if (sortField === 'length') diff = a.length - b.length;
          else if (sortField === 'quantity') diff = a.quantity - b.quantity;
          else if (sortField === 'mark') diff = (a.mark || '').localeCompare(b.mark || '');
          else if (sortField === 'notes') diff = (a.notes || '').localeCompare(b.notes || '');
          return sortDir === 'asc' ? diff : -diff;
        });
      }
      return list;
    }
  }, [items, title, sortField, sortDir]);

  // Sorting for companion table (Requirement 13: default descending by length)
  const sortedCompanionItems = useMemo(() => {
    const list = [...filteredCompanionItems];
    list.sort((a, b) => {
      let diff = 0;
      if (companionSortField === 'length') {
        diff = a.length - b.length;
      } else {
        diff = a.quantity - b.quantity;
      }
      return companionSortDir === 'asc' ? diff : -diff;
    });
    return list;
  }, [filteredCompanionItems, companionSortField, companionSortDir]);

  const handleSortToggle = (field: 'orderIndex' | 'mark' | 'length' | 'quantity' | 'notes') => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleCompanionSortToggle = (field: 'length' | 'quantity') => {
    if (companionSortField === field) {
      setCompanionSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCompanionSortField(field);
      setCompanionSortDir(field === 'length' ? 'desc' : 'asc');
    }
  };

  const handleAddRow = () => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    const newItem: DynamicRowItem = {
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderIndex: items.length + 1,
      length: 0,
      quantity: 1,
      mark: '',
      isActive: true,
      color: title === 'Нужно' ? getDefaultDemandColor(items.length) : undefined,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleDeleteRow = (id: string) => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    setItems((prev) =>
      prev
        .filter((i) => i.id !== id)
        .map((item, idx) => ({ ...item, orderIndex: idx + 1 }))
    );
  };

  const handleMoveUp = (index: number) => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    if (index === 0) return;
    setItems((prev) => {
      const arr = [...prev];
      const temp = arr[index - 1];
      arr[index - 1] = arr[index];
      arr[index] = temp;
      return arr.map((item, idx) => ({ ...item, orderIndex: idx + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    if (index >= items.length - 1) return;
    setItems((prev) => {
      const arr = [...prev];
      const temp = arr[index + 1];
      arr[index + 1] = arr[index];
      arr[index] = temp;
      return arr.map((item, idx) => ({ ...item, orderIndex: idx + 1 }));
    });
  };

  const handleUpdate = (id: string, field: keyof DynamicRowItem, val: any) => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        if (field === 'length') {
          const num = Math.max(0, parseFloat(val) || 0);
          // Point 13: When user adds/enters length 6000 or 12000 in custom rows, it transitions into standard bar
          if (title === 'Есть' && (num === 6000 || num === 12000)) {
            return {
              ...i,
              length: num,
              isStandard: true,
              isActive: false, // Point 10: default unchecked
              isStandardUnlimited: true,
              mark: 'Стандарт',
            };
          }
          const assignedColor = i.color || (title === 'Нужно' ? getDefaultDemandColor(i.orderIndex - 1, num) : undefined);
          return { ...i, length: num, color: assignedColor };
        }
        if (field === 'quantity') {
          const qty = Math.max(0, parseInt(val, 10) || 0);
          return {
            ...i,
            quantity: qty,
            isStandardUnlimited: qty === 0 && (i.length === 6000 || i.length === 12000),
          };
        }
        return { ...i, [field]: val };
      })
    );
  };

  // Clear handler: for "Есть" leaves two default standard rows (6000 and 12000) pinned, unchecked by default
  const handleClear = () => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      return;
    }
    if (title === 'Есть') {
      // Requirement 2: Очистка ЕСТЬ снимает блокировку с МАТЕРИАЛ
      onUnlockMaterial?.();
      setItems([
        {
          id: `s_def_6000`,
          orderIndex: 1,
          length: 6000,
          quantity: 0,
          isStandard: true,
          isActive: false,
          isStandardUnlimited: true,
          mark: 'Стандарт',
        },
        {
          id: `s_def_12000`,
          orderIndex: 2,
          length: 12000,
          quantity: 0,
          isStandard: true,
          isActive: false,
          isStandardUnlimited: true,
          mark: 'Стандарт',
        },
      ]);
      showToast('Склад очищен, наименование материала разблокировано. Стандартные 6000 и 12000 мм сохранены.');
    } else {
      setItems([]);
      showToast('Спецификация очищена');
    }
  };

  const handleExportCsv = () => {
    exportItemsToCsv(
      items.map((i) => ({
        length: i.length,
        quantity: i.quantity,
        mark: i.mark,
        notes: i.notes,
      })),
      currentMaterial,
      `${title}_${currentMaterial || 'Профиль'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const handleExportXml = () => {
    exportItemsToXml(
      items.map((i) => ({
        length: i.length,
        quantity: i.quantity,
        mark: i.mark,
        notes: i.notes,
      })),
      title === 'Есть' ? 'Склад' : 'Спецификация',
      currentMaterial,
      `${title}_${currentMaterial || 'Профиль'}_${new Date().toISOString().slice(0, 10)}.xml`
    );
  };

  // File Upload with Material Filtering for Multi-Material XML files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked && title === 'Нужно') {
      onRequestUnlock?.();
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      if (file.name.toLowerCase().endsWith('.xml')) {
        const parsed = parseItemsFromXml(text, currentMaterial);
        if (parsed.items.length > 0) {
          const newItems: DynamicRowItem[] = parsed.items.map((p, idx) => ({
            id: `imp_${Date.now()}_${idx}`,
            orderIndex: idx + 1,
            length: p.length,
            quantity: p.quantity,
            mark: p.mark,
            notes: p.notes,
            isActive: true,
            isStandard: p.length === 6000 || p.length === 12000,
            isStandardUnlimited: (p.length === 6000 || p.length === 12000) && p.quantity === 0,
            color: (p as any).color || (title === 'Нужно' ? getDefaultDemandColor(idx, p.length) : undefined),
          }));
          setItems(newItems);
          if (parsed.detectedMaterial && onMaterialChange) {
            onMaterialChange(parsed.detectedMaterial, 'file');
          }
          showToast(
            `Импортировано ${newItems.length} поз. для материала «${parsed.detectedMaterial || currentMaterial}»`
          );
        } else {
          showToast(`В файле не найдены заготовки для материала «${currentMaterial}»`);
        }
      } else {
        const parsed = parseItemsFromCsv(text);
        if (parsed.length > 0) {
          const newItems: DynamicRowItem[] = parsed.map((p, idx) => ({
            id: `imp_${Date.now()}_${idx}`,
            orderIndex: idx + 1,
            length: p.length,
            quantity: p.quantity,
            mark: p.mark,
            notes: p.notes,
            isActive: true,
            isStandard: p.length === 6000 || p.length === 12000,
            isStandardUnlimited: (p.length === 6000 || p.length === 12000) && p.quantity === 0,
            color: (p as any).color || (title === 'Нужно' ? getDefaultDemandColor(idx, p.length) : undefined),
          }));
          setItems(newItems);
          showToast(`Импортировано ${newItems.length} позиций из CSV`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start notranslate" translate="no">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Primary Input Block (e.g. «Есть» or «Нужно») - 8 cols */}
      <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col notranslate" translate="no">
        {/* ROW 1: Title - strictly h-11 (44px) - Clean title with lock status badge */}
        <div className="h-11 px-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 notranslate" translate="no">
          <div className="flex items-center gap-2.5 notranslate" translate="no">
            <span className="text-lg font-black text-slate-900 tracking-tight">{title}</span>
            {title === 'Нужно' && isLocked && (
              <button
                type="button"
                onClick={onRequestUnlock}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer shadow-2xs transition-colors"
                title="Спецификация заблокирована после расчета. Нажмите для разблокировки и изменения"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Заблокировано (разблокировать)</span>
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: Action Toolbar - strictly h-11 (44px) */}
        <div className="h-11 px-3 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-1.5 text-xs notranslate" translate="no">
          <div className="flex items-center gap-1.5 notranslate" translate="no">
            <button
              type="button"
              onClick={handleAddRow}
              translate="no"
              className={`flex items-center gap-1 px-2.5 py-1 font-semibold text-white rounded-lg transition-colors shadow-2xs whitespace-nowrap cursor-pointer ${
                title === 'Нужно'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Добавить строку</span>
            </button>

            {/* Mobile Actions Dropdown (sm:hidden - Point 14) */}
            <div ref={mobileActionsRef} className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setShowMobileActions(!showMobileActions)}
                className="flex items-center gap-1 px-2 py-1 font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
              >
                <span>Действия</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {showMobileActions && (
                <div className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-lg shadow-xl border border-slate-200 p-1.5 z-40 space-y-1 text-xs">
                  {onOpenPasteModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileActions(false);
                        if (isLocked && title === 'Нужно') {
                          onRequestUnlock?.();
                          return;
                        }
                        onOpenPasteModal();
                      }}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 text-slate-700"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                      <span>Из Excel</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileActions(false);
                      setShowColumnsPopover(true);
                    }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 text-slate-700"
                  >
                    <Columns className="w-3.5 h-3.5 text-slate-600" />
                    <span>Столбцы</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileActions(false);
                      handleExportCsv();
                    }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Экспорт в CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileActions(false);
                      handleExportXml();
                    }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>Экспорт в XML</span>
                  </button>
                  {title === 'Есть' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileActions(false);
                        setIsStockUploadModalOpen(true);
                      }}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-blue-50 text-blue-700 font-semibold"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Загрузить склад</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileActions(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 text-slate-700"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Загрузить из файла</span>
                    </button>
                  )}
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileActions(false);
                      handleClear();
                    }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-rose-50 text-rose-600 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Очистить строки</span>
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Actions Toolbar (hidden sm:flex) */}
            <div className="hidden sm:flex items-center gap-1.5 notranslate" translate="no">
              {onOpenPasteModal && (
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked && title === 'Нужно') {
                      onRequestUnlock?.();
                      return;
                    }
                    onOpenPasteModal();
                  }}
                  translate="no"
                  className="flex items-center gap-1 px-2.5 py-1 font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  title="Вставить из буфера Excel"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Из Excel</span>
                </button>
              )}

              {/* Column Customizer Button */}
              <div ref={columnsPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnsPopover(!showColumnsPopover)}
                  translate="no"
                  className={`flex items-center gap-1 px-2 py-1 font-medium border rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    showColumnsPopover
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200'
                  }`}
                  title="Настройка колонок таблицы"
                >
                  <Columns className="w-3 h-3 text-slate-600" />
                  <span>Столбцы</span>
                </button>

                {/* Columns Popover */}
                {showColumnsPopover && (
                  <div className="absolute left-0 top-full mt-1.5 w-52 bg-white rounded-lg shadow-lg border border-slate-200 p-2.5 z-30 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 border-b pb-1 text-[11px] uppercase tracking-wider">
                      Отображение столбцов
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={columnsConfig.mark}
                        onChange={(e) =>
                          setColumnsConfig((prev) => ({ ...prev, mark: e.target.checked }))
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span className="font-medium">Обозначение (марка)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={columnsConfig.notes}
                        onChange={(e) =>
                          setColumnsConfig((prev) => ({ ...prev, notes: e.target.checked }))
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span className="font-medium">Примечание</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={columnsConfig.usedOrPlaced}
                        onChange={(e) =>
                          setColumnsConfig((prev) => ({ ...prev, usedOrPlaced: e.target.checked }))
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span className="font-medium">
                        {title === 'Есть' ? 'Использовано' : 'Разложено'}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={columnsConfig.remainingOrUnplaced}
                        onChange={(e) =>
                          setColumnsConfig((prev) => ({ ...prev, remainingOrUnplaced: e.target.checked }))
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span className="font-medium">
                        {title === 'Есть' ? 'Не использовано' : 'Не разложено'}
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Export buttons */}
              <button
                type="button"
                onClick={handleExportCsv}
                translate="no"
                className="flex items-center gap-1 px-2 py-1 font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                title="Экспорт в .CSV"
              >
                <Download className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportXml}
                translate="no"
                className="flex items-center gap-1 px-2 py-1 font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                title="Экспорт в .XML"
              >
                <Download className="w-3 h-3 text-amber-600 shrink-0" />
                <span>XML</span>
              </button>

              {title === 'Есть' ? (
                <button
                  type="button"
                  onClick={() => setIsStockUploadModalOpen(true)}
                  translate="no"
                  className="flex items-center gap-1 px-2 py-1 font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  title="Загрузка заготовок и анализ склада (XML/CSV)"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Загрузить</span>
                </button>
              ) : (
                <label
                  translate="no"
                  className="flex items-center gap-1 px-2 py-1 font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  title="Загрузить из XML или CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Файл</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClear}
            translate="no"
            className="hidden sm:flex items-center gap-1 px-2 py-1 font-medium text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer ml-auto"
            title="Очистить строки"
          >
            <Trash2 className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Очистить</span>
          </button>
        </div>

        {/* Excel-style Data Grid */}
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-left text-xs border-collapse">
            {/* Point 1: Шапка НУЖНО зеленого цвета (bg-emerald-600) */}
            <thead
              className={`text-white select-none sticky top-0 z-10 font-bold ${
                title === 'Нужно' ? 'bg-emerald-600' : 'bg-blue-600'
              }`}
            >
              <tr className="h-9">
                {/* Delete column placed OUTSIDE table border and BEFORE column № */}
                <th
                  className={`py-2 px-1 text-center w-7 ${
                    title === 'Нужно' ? 'bg-emerald-700/80' : 'bg-blue-700/80'
                  }`}
                ></th>
                <th
                  onClick={() => handleSortToggle('orderIndex')}
                  className={`py-2 px-2 text-center w-10 border-r cursor-pointer hover:bg-black/10 transition-colors select-none ${
                    title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                  }`}
                  title="Сортировать по порядковому номеру"
                >
                  <div className="flex items-center justify-center gap-0.5">
                    <span>№</span>
                    {sortField === 'orderIndex' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100" />
                    )}
                  </div>
                </th>
                {title === 'Нужно' && (
                  <th
                    className="py-2 px-1 text-center w-8 border-r border-emerald-400 select-none text-[10px] font-bold uppercase tracking-wider"
                    title="Цветовая индикация детали"
                  >
                    Цвет
                  </th>
                )}
                {columnsConfig.mark && (
                  <th
                    onClick={() => handleSortToggle('mark')}
                    className={`py-2 px-3 border-r min-w-[120px] cursor-pointer hover:bg-black/10 transition-colors select-none ${
                      title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                    }`}
                    title="Сортировать по обозначению"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Обозначение</span>
                      {sortField === 'mark' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                      )}
                    </div>
                  </th>
                )}
                <th
                  onClick={() => handleSortToggle('length')}
                  className={`py-2 px-3 border-r cursor-pointer hover:bg-black/10 transition-colors select-none ${
                    title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                  }`}
                  title="Сортировать по размеру заготовки"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Размер (мм)</span>
                    {sortField === 'length' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle('quantity')}
                  className={`py-2 px-3 border-r w-44 min-w-[170px] max-w-[170px] cursor-pointer hover:bg-black/10 transition-colors select-none ${
                    title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                  }`}
                  title="Сортировать по количеству"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Кол-во (шт)</span>
                    {sortField === 'quantity' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                </th>
                {columnsConfig.usedOrPlaced && (
                  <th
                    className={`py-2 px-3 border-r ${
                      title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                    }`}
                  >
                    {usedOrPlacedColHeader}
                  </th>
                )}
                {columnsConfig.remainingOrUnplaced && (
                  <th
                    className={`py-2 px-3 border-r ${
                      title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                    }`}
                  >
                    {remainingColHeader}
                  </th>
                )}
                {columnsConfig.notes && (
                  <th
                    onClick={() => handleSortToggle('notes')}
                    className={`py-2 px-3 border-r cursor-pointer hover:bg-black/10 transition-colors select-none ${
                      title === 'Нужно' ? 'border-emerald-400' : 'border-blue-400'
                    }`}
                    title="Сортировать по примечанию"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Примечание</span>
                      {sortField === 'notes' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                      )}
                    </div>
                  </th>
                )}
                <th className="py-2 px-2 text-center w-14">Порядок</th>
              </tr>

              {/* Summary Row inside the table matching height */}
              <tr
                className={`text-white font-mono text-[11px] h-7 ${
                  title === 'Нужно'
                    ? 'bg-emerald-800 border-b border-emerald-600'
                    : 'bg-blue-800/90 border-b border-blue-600'
                }`}
              >
                <td
                  className={`py-1 px-1 ${
                    title === 'Нужно' ? 'bg-emerald-900/40' : 'bg-blue-900/40'
                  }`}
                ></td>
                <td className="py-1 px-2 text-center">—</td>
                {title === 'Нужно' && <td className="py-1 px-1 text-center font-bold">—</td>}
                {columnsConfig.mark && <td className="py-1 px-3">—</td>}
                {/* Point 11: В строке итогов «ЕСТЬ» в столбце «Размер (мм)» убрать сумму (показывать "—") */}
                <td className="py-1 px-3 font-bold">
                  {title === 'Есть'
                    ? '—'
                    : totalLength > 0
                    ? totalLength.toLocaleString('ru-RU')
                    : '—'}
                </td>
                <td className="py-1 px-3 font-semibold w-44 min-w-[170px] max-w-[170px]">
                  {hasAutoStandard
                    ? fixedQtyTotal > 0
                      ? `Всего: ${fixedQtyTotal.toLocaleString('ru-RU')} шт. + по потр.`
                      : 'Всего: по потребности'
                    : fixedQtyTotal > 0
                    ? `Всего: ${fixedQtyTotal.toLocaleString('ru-RU')} шт.`
                    : '—'}
                </td>
                {columnsConfig.usedOrPlaced && (
                  <td className="py-1 px-3 font-semibold">
                    {!hasCalculated
                      ? '—'
                      : totalUsedOrPlaced > 0
                      ? `Всего: ${totalUsedOrPlaced.toLocaleString('ru-RU')} шт.`
                      : '—'}
                  </td>
                )}
                {/* В столбце «Не использовано» до расчета всегда показывать "—" */}
                {columnsConfig.remainingOrUnplaced && (
                  <td className="py-1 px-3 font-semibold">
                    {!hasCalculated
                      ? '—'
                      : totalRemaining > 0
                      ? `Всего: ${totalRemaining.toLocaleString('ru-RU')} шт.`
                      : '—'}
                  </td>
                )}
                {columnsConfig.notes && <td className="py-1 px-3">—</td>}
                <td className="py-1 px-2 text-center"></td>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {displayItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      3 +
                      (title === 'Нужно' ? 1 : 0) +
                      (columnsConfig.mark ? 1 : 0) +
                      (columnsConfig.notes ? 1 : 0) +
                      (columnsConfig.usedOrPlaced ? 1 : 0) +
                      (columnsConfig.remainingOrUnplaced ? 1 : 0) +
                      1
                    }
                    className="py-8 text-center text-slate-400 text-xs"
                  >
                    Нет строк. Нажмите «Добавить строку» или «Из Excel».
                  </td>
                </tr>
              ) : (
                displayItems.map((item: DynamicRowItem, idx: number) => {
                  const isStandardLength =
                    title === 'Есть' &&
                    (item.isStandard || item.length === 6000 || item.length === 12000);
                  const isAutoCalculated =
                    isStandardLength && (item.quantity === 0 || item.isStandardUnlimited);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        item.isActive === false
                          ? 'bg-slate-100/70 opacity-50 text-slate-400'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Control column: For standard lengths has enable/disable CHECKBOX, for custom has DELETE button */}
                      <td className="py-1 px-1 text-center bg-slate-50/60">
                        {isStandardLength ? (
                          <input
                            type="checkbox"
                            checked={item.isActive !== false}
                            onChange={(e) => handleUpdate(item.id, 'isActive', e.target.checked)}
                            title={
                              item.isActive !== false
                                ? 'Стандартный хлыст включен в расчет (нажмите чтобы отключить)'
                                : 'Стандартный хлыст отключен (нажмите чтобы включить)'
                            }
                            className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(item.id)}
                            title="Удалить строку"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>

                      {/* Index */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700 bg-slate-50/80 border-r border-slate-200">
                        {idx + 1}
                      </td>

                      {/* Color indicator in НУЖНО */}
                      {title === 'Нужно' && (
                        <td className="py-1.5 px-1 text-center border-r border-slate-200 bg-slate-50/40">
                          <label
                            className={`relative inline-block w-4 h-4 rounded-xs border border-black/35 shadow-2xs transition-transform overflow-hidden align-middle ${
                              isLocked
                                ? 'cursor-not-allowed opacity-90'
                                : 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-emerald-400'
                            }`}
                            style={{ backgroundColor: item.color || getDefaultDemandColor(idx, item.length) }}
                            title={
                              isLocked
                                ? `Цвет детали: ${item.length ? item.length + ' мм' : 'деталь'} (заблокировано)`
                                : `Цвет детали: ${item.length ? item.length + ' мм' : 'деталь'} (нажмите для выбора цвета)`
                            }
                            onClick={(e) => {
                              if (isLocked) {
                                e.preventDefault();
                                onRequestUnlock?.();
                              }
                            }}
                          >
                            <input
                              type="color"
                              value={item.color || getDefaultDemandColor(idx, item.length)}
                              disabled={isLocked}
                              onChange={(e) => handleUpdate(item.id, 'color', e.target.value)}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                            />
                          </label>
                        </td>
                      )}

                      {/* Designation (mark) */}
                      {columnsConfig.mark && (
                        <td className="py-1 px-2 border-r border-slate-200">
                          <input
                            type="text"
                            value={item.mark || ''}
                            readOnly={isLocked && title === 'Нужно'}
                            onClick={() => {
                              if (isLocked && title === 'Нужно') onRequestUnlock?.();
                            }}
                            onChange={(e) => handleUpdate(item.id, 'mark', e.target.value)}
                            placeholder={title === 'Нужно' ? 'Деталь (С-1)' : 'Склад'}
                            className={`w-full text-xs text-slate-800 bg-transparent border-0 px-1 py-0.5 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 rounded ${isLocked && title === 'Нужно' ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                          />
                        </td>
                      )}

                      {/* Length input: For standard lengths, fixed and read-only */}
                      <td className="py-1 px-2 bg-emerald-50/40 border-r border-slate-200">
                        {isStandardLength ? (
                          <div className="flex items-center justify-between px-1 py-0.5">
                            <span className="font-mono font-bold text-slate-900">
                              {item.length}
                            </span>
                            <span className="text-[10px] text-blue-700 bg-blue-50 px-1 py-0.2 rounded font-semibold">
                              стандарт
                            </span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            value={item.length || ''}
                            readOnly={isLocked && title === 'Нужно'}
                            onClick={() => {
                              if (isLocked && title === 'Нужно') onRequestUnlock?.();
                            }}
                            onChange={(e) => handleUpdate(item.id, 'length', e.target.value)}
                            placeholder="0"
                            className={`w-full font-mono font-bold text-slate-900 bg-transparent border-0 px-1 py-0.5 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 rounded ${isLocked && title === 'Нужно' ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                          />
                        )}
                      </td>

                      {/* Quantity input: Point 8: fixed 170px width. Point 9: disabled when isActive === false */}
                      <td className="py-1 px-2 bg-emerald-50/40 border-r border-slate-200 w-44 min-w-[170px] max-w-[170px]">
                        {isStandardLength && item.isActive === false ? (
                          <div className="flex items-center justify-between gap-1 opacity-50">
                            <span className="text-[11px] font-semibold text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {item.quantity > 0 ? `${item.quantity} шт.` : 'По потребности'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold cursor-not-allowed whitespace-nowrap">
                              выключен
                            </span>
                          </div>
                        ) : isStandardLength && isAutoCalculated ? (
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold text-blue-700 font-mono bg-blue-100/70 px-1.5 py-0.5 rounded whitespace-nowrap">
                              По потребности
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdate(item.id, 'quantity', 1);
                                handleUpdate(item.id, 'isStandardUnlimited', false);
                              }}
                              title="Задать фиксированное количество"
                              className="text-[10px] text-slate-600 hover:text-blue-700 underline font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Задать
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={
                                item.quantity === 0 && isStandardLength
                                  ? ''
                                  : item.quantity || ''
                              }
                              readOnly={isLocked && title === 'Нужно'}
                              onClick={() => {
                                if (isLocked && title === 'Нужно') onRequestUnlock?.();
                              }}
                              onChange={(e) => handleUpdate(item.id, 'quantity', e.target.value)}
                              placeholder={isStandardLength ? '1' : '1'}
                              className={`w-full font-mono font-bold text-blue-700 bg-transparent border-0 px-1 py-0.5 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 rounded ${isLocked && title === 'Нужно' ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                            />
                            {isStandardLength && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdate(item.id, 'quantity', 0);
                                  handleUpdate(item.id, 'isStandardUnlimited', true);
                                }}
                                title="Переключить в авторасчет (По потребности)"
                                className="text-[10px] text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer px-1 py-0.5 bg-blue-50 rounded font-semibold"
                              >
                                По потр.
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Used or Placed (calculated) */}
                      {columnsConfig.usedOrPlaced && (
                        <td className="py-1.5 px-3 font-mono font-semibold text-slate-700 border-r border-slate-200">
                          {(() => {
                            if (!hasCalculated) return '—';
                            const val = getUsedOrPlaced ? getUsedOrPlaced(item) : item.usedOrPlaced;
                            return typeof val === 'number' && val > 0 ? val : '—';
                          })()}
                        </td>
                      )}

                      {/* Remaining or Unplaced (calculated) - Point 12: show "—" before calculation */}
                      {columnsConfig.remainingOrUnplaced && (
                        <td className="py-1.5 px-3 font-mono font-semibold text-slate-700 border-r border-slate-200">
                          {(() => {
                            if (!hasCalculated) return '—';
                            if (isAutoCalculated) {
                              return <span className="text-[10px] text-slate-400 font-sans">По потребности</span>;
                            }
                            const val = getRemaining ? getRemaining(item) : item.remainingOrUnplaced;
                            return typeof val === 'number' && val > 0 ? val : '—';
                          })()}
                        </td>
                      )}

                      {/* Notes (optional) */}
                      {columnsConfig.notes && (
                        <td className="py-1 px-2 border-r border-slate-200">
                          <input
                            type="text"
                            value={item.notes || ''}
                            readOnly={isLocked && title === 'Нужно'}
                            onClick={() => {
                              if (isLocked && title === 'Нужно') onRequestUnlock?.();
                            }}
                            onChange={(e) => handleUpdate(item.id, 'notes', e.target.value)}
                            placeholder="Примечание"
                            className={`w-full text-xs text-slate-600 bg-transparent border-0 px-1 py-0.5 focus:outline-hidden focus:bg-white rounded ${isLocked && title === 'Нужно' ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                          />
                        </td>
                      )}

                      {/* Row Reordering (Up/Down): Disabled for standard fixed rows */}
                      <td className="py-1 px-1 text-center flex items-center justify-center gap-0.5">
                        {isStandardLength ? (
                          <span className="text-slate-300 font-mono text-[10px] select-none">—</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMoveUp(idx)}
                              disabled={idx === 0}
                              title="Поднять вверх"
                              className={`p-1 rounded ${
                                idx === 0
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer'
                              }`}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(idx)}
                              disabled={idx === items.length - 1}
                              title="Опустить вниз"
                              className={`p-1 rounded ${
                                idx === items.length - 1
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer'
                              }`}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Companion Result Block (e.g. «Осталось» or «Не сделано») - 4 cols */}
      <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col notranslate" translate="no">
        {/* ROW 1: Title - strictly h-11 (44px) matching left block Row 1 - Clean title without badge or count (Point 16) */}
        <div className="h-11 px-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 notranslate" translate="no">
          <div className="flex items-center gap-2 notranslate" translate="no">
            <span className="text-lg font-black text-slate-900 tracking-tight">
              {companionTitle}
            </span>
          </div>
        </div>

        {/* ROW 2: Companion Toolbar - strictly h-11 (44px) matching left block Row 2 */}
        <div className="h-11 px-3 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-2 text-xs notranslate" translate="no">
          {companionTitle === 'Осталось' ? (
            <>
              <span className="text-[11px] text-slate-500 font-medium">
                {hasCalculated && filteredCompanionItems.length > 0
                  ? 'Готово к выгрузке:'
                  : 'Остатки склада:'}
              </span>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                disabled={!hasCalculated || filteredCompanionItems.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1 font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer ml-auto ${
                  hasCalculated && filteredCompanionItems.length > 0
                    ? 'text-slate-800 bg-white hover:bg-slate-50 border border-slate-300'
                    : 'text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed'
                }`}
                title="Экспорт списка остатков и обновление в файле склада"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Экспорт остатков</span>
              </button>
            </>
          ) : (
            // Point 5: "НЕ СДЕЛАНО: СТАТУС РАСКРОЯ "Все детали разложены" заменить на "расчет не выполнен" до выполнения расчета;
            // "Все детали успешно разложены! Нехватки нет." убрать после расчета; "Всего: ### шт." после неполного раскроя убрать,
            // дублируется в строке ниже (Неразложенные позиции - оставить как до расчета "Статус раскроя:")"
            <div className="flex items-center justify-between w-full text-[11px] text-slate-500">
              <span>Статус раскроя:</span>
              <span className="font-semibold text-slate-700">
                {!hasCalculated
                  ? 'расчет не выполнен'
                  : filteredCompanionItems.length > 0
                  ? 'Есть неразложенные детали'
                  : 'Все детали разложены'}
              </span>
            </div>
          )}
        </div>

        {/* Companion Grid: Point 2: Шапка НЕ СДЕЛАНО красного цвета (bg-rose-600) */}
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead
              className={`text-white select-none sticky top-0 z-10 font-bold ${
                companionTitle === 'Не сделано' ? 'bg-rose-600' : 'bg-slate-600'
              }`}
            >
              <tr className="h-9">
                <th
                  onClick={() => handleCompanionSortToggle('length')}
                  className={`py-2 px-3 border-r cursor-pointer hover:bg-black/10 transition-colors select-none ${
                    companionTitle === 'Не сделано' ? 'border-rose-500' : 'border-slate-500'
                  }`}
                  title="Сортировать по размеру"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Размер (мм)</span>
                    {companionSortField === 'length' ? (
                      companionSortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleCompanionSortToggle('quantity')}
                  className="py-2 px-3 cursor-pointer hover:bg-black/10 transition-colors select-none"
                  title="Сортировать по количеству"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Кол-во (шт)</span>
                    {companionSortField === 'quantity' ? (
                      companionSortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                </th>
              </tr>
              {/* Summary Row */}
              <tr
                className={`text-white font-mono text-[11px] h-7 ${
                  companionTitle === 'Не сделано'
                    ? 'bg-rose-800 border-b border-rose-700'
                    : 'bg-slate-700 border-b border-slate-600'
                }`}
              >
                <td
                  className={`py-1 px-3 font-bold border-r ${
                    companionTitle === 'Не сделано' ? 'border-rose-700' : 'border-slate-600'
                  }`}
                >
                  {hasCalculated && companionTotalLength > 0
                    ? companionTotalLength.toLocaleString('ru-RU')
                    : '—'}
                </td>
                <td className="py-1 px-3">
                  {hasCalculated && companionTotalQty > 0
                    ? `Всего: ${companionTotalQty.toLocaleString('ru-RU')} шт.`
                    : '—'}
                </td>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {sortedCompanionItems.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-slate-400 text-xs">
                    {companionTitle === 'Осталось'
                      ? !hasCalculated
                        ? 'Остатков нет или расчет еще не выполнен.'
                        : 'Остатков нет (все израсходовано).'
                      : !hasCalculated
                      ? 'Расчет еще не выполнен.'
                      : '—'}
                  </td>
                </tr>
              ) : (
                sortedCompanionItems.map((comp: CompanionResultItem, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-200">
                      {comp.length}
                    </td>
                    <td
                      className={`py-2 px-3 font-mono font-bold ${
                        companionTitle === 'Не сделано' ? 'text-rose-700' : 'text-blue-700'
                      }`}
                    >
                      {comp.quantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dedicated Warehouse Upload & Analysis Modal */}
      {title === 'Есть' && (
        <StockUploadModal
          isOpen={isStockUploadModalOpen}
          onClose={() => setIsStockUploadModalOpen(false)}
          currentMaterial={currentMaterial}
          onImportItems={(importedItems, selectedMatName, mode, updateMatSettings) => {
            if (mode === 'replace') {
              setItems(importedItems);
            } else {
              setItems((prev) => {
                const combined = [...prev, ...importedItems];
                return combined.map((it, idx) => ({ ...it, orderIndex: idx + 1 }));
              });
            }

            if (updateMatSettings && onMaterialChange) {
              onMaterialChange(selectedMatName, 'file');
            }

            showToast(
              `Загружено ${importedItems.length} поз. для материала «${selectedMatName}» (${
                mode === 'replace' ? 'замена склада' : 'добавление к складу'
              })`
            );
          }}
        />
      )}

      {/* Remnant Export & Update Modal for «Осталось» */}
      {companionTitle === 'Осталось' && (
        <RemnantExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          remnants={filteredCompanionItems}
          currentMaterial={currentMaterial}
          onSuccessToast={showToast}
        />
      )}
    </div>
  );
};
