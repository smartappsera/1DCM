import * as XLSX from 'xlsx';
import {
  StockItem,
  DemandItem,
  FullOptimizationSolution,
  AppSettings,
  RemnantItem,
} from '../types/cutting';

export interface ExportableItem {
  length: number;
  quantity: number;
  mark?: string;
  notes?: string;
}

/**
 * Export array of items to CSV file with optional material and designation
 */
export function exportItemsToCsv(
  items: ExportableItem[],
  materialName?: string,
  filename = 'export.csv'
) {
  let content = '';
  if (materialName) {
    content += `Материал:;${materialName}\n`;
  }
  content += '№;Обозначение;Размер (мм);Количество (шт);Примечание\n';
  items.forEach((item, idx) => {
    content += `${idx + 1};"${item.mark || ''}";${item.length};${item.quantity};"${item.notes || ''}"\n`;
  });

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * Export array of items to XML file with dedicated Material section
 */
export function exportItemsToXml(
  items: ExportableItem[],
  rootTag: 'Склад' | 'Спецификация',
  materialName = 'Труба профильная',
  filename = 'export.xml'
) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n`;
  xml += `  <Материал наименование="${escapeXml(materialName)}">\n`;

  items.forEach((item, idx) => {
    xml += `    <Заготовка id="${idx + 1}">\n`;
    if (item.mark) {
      xml += `      <Обозначение>${escapeXml(item.mark)}</Обозначение>\n`;
    }
    xml += `      <Размер>${item.length}</Размер>\n`;
    xml += `      <Количество>${item.quantity}</Количество>\n`;
    if (item.notes) {
      xml += `      <Примечание>${escapeXml(item.notes)}</Примечание>\n`;
    }
    xml += `    </Заготовка>\n`;
  });

  xml += `  </Материал>\n`;
  xml += `</${rootTag}>\n`;

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * Export remnants list to XML
 */
export function exportRemnantsToXml(
  remnants: RemnantItem[],
  materialName: string,
  filename = 'remnants.xml'
) {
  exportItemsToXml(
    remnants.map((r) => ({
      length: r.length,
      quantity: r.quantity,
      mark: r.mark || 'Деловой остаток',
      notes: r.notes || '',
    })),
    'Склад',
    materialName,
    filename
  );
}

/**
 * Update the material block in an existing XML warehouse file,
 * keeping all other materials untouched!
 */
export function updateWarehouseMaterialXml(
  existingXmlText: string,
  targetMaterial: string,
  newRemnants: RemnantItem[]
): string {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(existingXmlText, 'text/xml');

    // Check parse errors
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      throw new Error('Ошибка структуры XML файла');
    }

    let root = xmlDoc.documentElement;
    if (!root) {
      root = xmlDoc.createElement('Склад');
      xmlDoc.appendChild(root);
    }

    // Find existing <Материал> node matching targetMaterial
    const materials = root.getElementsByTagName('Материал');
    let targetMatNode: Element | null = null;
    const cleanTarget = targetMaterial.trim().toLowerCase();

    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      const name = (mat.getAttribute('наименование') || mat.getAttribute('name') || '').trim().toLowerCase();
      if (name === cleanTarget) {
        targetMatNode = mat;
        break;
      }
    }

    // If found, clear its children; otherwise create new <Материал>
    if (targetMatNode) {
      while (targetMatNode.firstChild) {
        targetMatNode.removeChild(targetMatNode.firstChild);
      }
    } else {
      targetMatNode = xmlDoc.createElement('Материал');
      targetMatNode.setAttribute('наименование', targetMaterial);
      root.appendChild(targetMatNode);
    }

    // Add new remnant blanks to targetMatNode
    newRemnants.forEach((item, idx) => {
      const zag = xmlDoc.createElement('Заготовка');
      zag.setAttribute('id', String(idx + 1));

      if (item.mark) {
        const markNode = xmlDoc.createElement('Обозначение');
        markNode.textContent = item.mark;
        zag.appendChild(markNode);
      }

      const lenNode = xmlDoc.createElement('Размер');
      lenNode.textContent = String(item.length);
      zag.appendChild(lenNode);

      const qtyNode = xmlDoc.createElement('Количество');
      qtyNode.textContent = String(item.quantity);
      zag.appendChild(qtyNode);

      const noteNode = xmlDoc.createElement('Примечание');
      noteNode.textContent = item.notes || 'Деловой остаток со склада';
      zag.appendChild(noteNode);

      targetMatNode!.appendChild(zag);
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
  } catch (e: any) {
    console.error('Error updating XML warehouse:', e);
    // Fallback: create fresh XML
    let fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>\n<Склад>\n  <Материал наименование="${escapeXml(targetMaterial)}">\n`;
    newRemnants.forEach((r, idx) => {
      fallbackXml += `    <Заготовка id="${idx + 1}">\n      <Размер>${r.length}</Размер>\n      <Количество>${r.quantity}</Количество>\n    </Заготовка>\n`;
    });
    fallbackXml += `  </Материал>\n</Склад>`;
    return fallbackXml;
  }
}

/**
 * Parse CSV / TSV text with columns support
 */
export function parseItemsFromCsv(text: string): ExportableItem[] {
  const lines = text.trim().split(/\r?\n/);
  const result: ExportableItem[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // skip material header or title lines
    if (line.toLowerCase().startsWith('материал:')) continue;
    // skip header row if contains letters and no clear digits
    if (line.match(/[a-zA-Zа-яА-Я]/) && !line.match(/\d/)) continue;

    const parts = line.split(/[;,|\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length === 0) continue;

    let mark = '';
    let len = 0;
    let qty = 1;
    let notes = '';

    // Check if first col is index (№)
    let colOffset = 0;
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && isNaN(parseFloat(parts[1]))) {
      // Format: №, Обозначение, Длина, Кол-во, Примечание
      colOffset = 1;
      mark = parts[1];
      len = parseFloat(parts[2]?.replace(',', '.'));
      qty = parseFloat(parts[3]?.replace(',', '.'));
      notes = parts[4] || '';
    } else if (isNaN(parseFloat(parts[0])) && parts.length >= 2) {
      // First is mark, second is length
      mark = parts[0];
      len = parseFloat(parts[1]?.replace(',', '.'));
      qty = parseFloat(parts[2]?.replace(',', '.'));
      notes = parts[3] || '';
    } else {
      // Standard: length, quantity
      len = parseFloat(parts[0]?.replace(',', '.'));
      qty = parseFloat(parts[1]?.replace(',', '.'));
      mark = parts[2] || '';
    }

    if (!isNaN(len) && len > 0) {
      result.push({
        mark: mark || undefined,
        length: len,
        quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
        notes: notes || undefined,
      });
    }
  }

  return result;
}

export interface ParsedStockMaterialGroup {
  name: string;
  items: ExportableItem[];
  totalLengthMeters: number;
  totalPieces: number;
}

export interface DeepParsedStockResult {
  fileName: string;
  fileType: 'xml' | 'csv' | 'txt' | 'other';
  materials: ParsedStockMaterialGroup[];
}

/**
 * Deeply parse XML / CSV / TXT warehouse file, extracting all materials,
 * their remnants/bars, and calculating statistics for each material.
 */
export function deepParseFileForStock(text: string, fileName: string): DeepParsedStockResult {
  const isXml = fileName.toLowerCase().endsWith('.xml') || text.trim().startsWith('<');
  const fileType: 'xml' | 'csv' | 'txt' | 'other' = isXml
    ? 'xml'
    : fileName.toLowerCase().endsWith('.csv')
    ? 'csv'
    : 'txt';

  if (isXml) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      const parseError = xmlDoc.getElementsByTagName('parsererror');
      if (parseError.length > 0) {
        throw new Error('Ошибка синтаксиса XML');
      }

      // 1. Search for material / profile container tags
      const matNodes = Array.from(xmlDoc.getElementsByTagName('Материал')).concat(
        Array.from(xmlDoc.getElementsByTagName('Material')),
        Array.from(xmlDoc.getElementsByTagName('Profile')),
        Array.from(xmlDoc.getElementsByTagName('Профиль'))
      );

      const groups: ParsedStockMaterialGroup[] = [];

      if (matNodes.length > 0) {
        matNodes.forEach((node, idx) => {
          const matName =
            node.getAttribute('наименование') ||
            node.getAttribute('name') ||
            node.getAttribute('title') ||
            node.getElementsByTagName('Name')[0]?.textContent?.trim() ||
            node.getElementsByTagName('Наименование')[0]?.textContent?.trim() ||
            `Материал ${idx + 1}`;

          const itemNodes = Array.from(node.getElementsByTagName('Заготовка')).concat(
            Array.from(node.getElementsByTagName('Item')),
            Array.from(node.getElementsByTagName('Piece')),
            Array.from(node.getElementsByTagName('Bar'))
          );

          const items: ExportableItem[] = [];
          itemNodes.forEach((itemNode) => {
            const mark =
              itemNode.getElementsByTagName('Обозначение')[0]?.textContent?.trim() ||
              itemNode.getElementsByTagName('Mark')[0]?.textContent?.trim() ||
              itemNode.getAttribute('mark') ||
              itemNode.getAttribute('обозначение') ||
              '';

            const lenStr =
              itemNode.getElementsByTagName('Размер')[0]?.textContent ||
              itemNode.getElementsByTagName('Длина')[0]?.textContent ||
              itemNode.getElementsByTagName('Length')[0]?.textContent ||
              itemNode.getAttribute('размер') ||
              itemNode.getAttribute('длина') ||
              itemNode.getAttribute('length') ||
              '0';

            const qtyStr =
              itemNode.getElementsByTagName('Количество')[0]?.textContent ||
              itemNode.getElementsByTagName('Quantity')[0]?.textContent ||
              itemNode.getElementsByTagName('Count')[0]?.textContent ||
              itemNode.getAttribute('количество') ||
              itemNode.getAttribute('quantity') ||
              itemNode.getAttribute('count') ||
              '1';

            const notes =
              itemNode.getElementsByTagName('Примечание')[0]?.textContent?.trim() ||
              itemNode.getElementsByTagName('Note')[0]?.textContent?.trim() ||
              itemNode.getAttribute('примечание') ||
              itemNode.getAttribute('note') ||
              '';

            const len = parseFloat(lenStr.replace(',', '.'));
            const qty = parseFloat(qtyStr.replace(',', '.'));

            if (!isNaN(len) && len > 0) {
              items.push({
                mark: mark || undefined,
                length: len,
                quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
                notes: notes || undefined,
              });
            }
          });

          if (items.length > 0) {
            const totalLenMm = items.reduce((sum, it) => sum + it.length * it.quantity, 0);
            const totalPieces = items.reduce((sum, it) => sum + it.quantity, 0);
            groups.push({
              name: matName,
              items,
              totalLengthMeters: +(totalLenMm / 1000).toFixed(2),
              totalPieces,
            });
          }
        });
      }

      // If no material containers found, look for flat items under root
      if (groups.length === 0) {
        const itemNodes = Array.from(xmlDoc.getElementsByTagName('Заготовка')).concat(
          Array.from(xmlDoc.getElementsByTagName('Item')),
          Array.from(xmlDoc.getElementsByTagName('Piece')),
          Array.from(xmlDoc.getElementsByTagName('Bar'))
        );

        const items: ExportableItem[] = [];
        itemNodes.forEach((itemNode) => {
          const mark =
            itemNode.getElementsByTagName('Обозначение')[0]?.textContent?.trim() ||
            itemNode.getElementsByTagName('Mark')[0]?.textContent?.trim() ||
            '';
          const lenStr =
            itemNode.getElementsByTagName('Размер')[0]?.textContent ||
            itemNode.getElementsByTagName('Length')[0]?.textContent ||
            '0';
          const qtyStr =
            itemNode.getElementsByTagName('Количество')[0]?.textContent ||
            itemNode.getElementsByTagName('Count')[0]?.textContent ||
            '1';
          const notes =
            itemNode.getElementsByTagName('Примечание')[0]?.textContent?.trim() || '';

          const len = parseFloat(lenStr.replace(',', '.'));
          const qty = parseFloat(qtyStr.replace(',', '.'));
          if (!isNaN(len) && len > 0) {
            items.push({
              mark: mark || undefined,
              length: len,
              quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
              notes: notes || undefined,
            });
          }
        });

        if (items.length > 0) {
          const totalLenMm = items.reduce((sum, it) => sum + it.length * it.quantity, 0);
          const totalPieces = items.reduce((sum, it) => sum + it.quantity, 0);
          groups.push({
            name: fileName.replace(/\.[^/.]+$/, '') || 'Материал из файла',
            items,
            totalLengthMeters: +(totalLenMm / 1000).toFixed(2),
            totalPieces,
          });
        }
      }

      return {
        fileName,
        fileType: 'xml',
        materials: groups,
      };
    } catch (e) {
      console.warn('Failed parsing XML, fallback to CSV parser:', e);
    }
  }

  // 2. CSV / TXT parser with multi-material support
  const lines = text.trim().split(/\r?\n/);
  const groups: ParsedStockMaterialGroup[] = [];
  let currentGroupName = fileName.replace(/\.[^/.]+$/, '') || 'Основной материал';
  let currentGroupItems: ExportableItem[] = [];

  const finalizeCurrentGroup = () => {
    if (currentGroupItems.length > 0) {
      const totalLenMm = currentGroupItems.reduce((sum, it) => sum + it.length * it.quantity, 0);
      const totalPieces = currentGroupItems.reduce((sum, it) => sum + it.quantity, 0);
      groups.push({
        name: currentGroupName,
        items: [...currentGroupItems],
        totalLengthMeters: +(totalLenMm / 1000).toFixed(2),
        totalPieces,
      });
      currentGroupItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for material header line: "Материал: ..." or "Material: ..."
    const matMatch = trimmed.match(/^(?:материал|material|профиль|profile)[:;=\s]+(.*)$/i);
    if (matMatch && matMatch[1]) {
      finalizeCurrentGroup();
      currentGroupName = matMatch[1].replace(/^[";]+|[";]+$/g, '').trim() || `Материал ${groups.length + 1}`;
      continue;
    }

    // Skip table column headers if purely alphabetical
    if (trimmed.match(/[a-zA-Zа-яА-Я]/) && !trimmed.match(/\d/)) {
      continue;
    }

    const parts = trimmed.split(/[;,|\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length === 0) continue;

    let mark = '';
    let len = 0;
    let qty = 1;
    let notes = '';

    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && isNaN(parseFloat(parts[1]))) {
      // №, Обозначение, Длина, Кол-во, Примечание
      mark = parts[1];
      len = parseFloat(parts[2]?.replace(',', '.'));
      qty = parseFloat(parts[3]?.replace(',', '.'));
      notes = parts[4] || '';
    } else if (isNaN(parseFloat(parts[0])) && parts.length >= 2) {
      mark = parts[0];
      len = parseFloat(parts[1]?.replace(',', '.'));
      qty = parseFloat(parts[2]?.replace(',', '.'));
      notes = parts[3] || '';
    } else {
      len = parseFloat(parts[0]?.replace(',', '.'));
      qty = parseFloat(parts[1]?.replace(',', '.'));
      mark = parts[2] || '';
      notes = parts[3] || '';
    }

    if (!isNaN(len) && len > 0) {
      currentGroupItems.push({
        mark: mark || undefined,
        length: len,
        quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
        notes: notes || undefined,
      });
    }
  }

  finalizeCurrentGroup();

  return {
    fileName,
    fileType: fileType,
    materials: groups,
  };
}

/**
 * Parse XML text. If multiple materials are present, filter ONLY items matching `targetMaterial`.
 * If no matching material is found or no <Материал> tag, return all items or fallback.
 */
export function parseItemsFromXml(
  text: string,
  targetMaterial?: string
): { items: ExportableItem[]; detectedMaterial?: string; availableMaterials: string[] } {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, 'text/xml');
  const result: ExportableItem[] = [];
  const availableMaterials: string[] = [];

  const matNodes = xmlDoc.getElementsByTagName('Материал');

  if (matNodes.length > 0) {
    for (let m = 0; m < matNodes.length; m++) {
      const matName = matNodes[m].getAttribute('наименование') || matNodes[m].getAttribute('name') || `Материал ${m + 1}`;
      availableMaterials.push(matName);
    }

    // Try finding exact or partial match with targetMaterial
    let matchedNode: Element | null = null;
    let matchedName: string | undefined = undefined;

    if (targetMaterial && targetMaterial.trim()) {
      const cleanTarget = targetMaterial.trim().toLowerCase();
      for (let m = 0; m < matNodes.length; m++) {
        const name = (matNodes[m].getAttribute('наименование') || matNodes[m].getAttribute('name') || '').trim().toLowerCase();
        if (name === cleanTarget || name.includes(cleanTarget) || cleanTarget.includes(name)) {
          matchedNode = matNodes[m];
          matchedName = matNodes[m].getAttribute('наименование') || matNodes[m].getAttribute('name') || undefined;
          break;
        }
      }
    }

    // If no match found, pick the first material
    if (!matchedNode) {
      matchedNode = matNodes[0];
      matchedName = availableMaterials[0];
    }

    const items = matchedNode.getElementsByTagName('Заготовка');
    for (let i = 0; i < items.length; i++) {
      const node = items[i];
      const mark = node.getElementsByTagName('Обозначение')[0]?.textContent?.trim() || '';
      const lenStr = node.getElementsByTagName('Размер')[0]?.textContent || '0';
      const qtyStr = node.getElementsByTagName('Количество')[0]?.textContent || '1';
      const notes = node.getElementsByTagName('Примечание')[0]?.textContent?.trim() || '';
      const len = parseFloat(lenStr);
      const qty = parseFloat(qtyStr);

      if (!isNaN(len) && len > 0) {
        result.push({
          mark: mark || undefined,
          length: len,
          quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
          notes: notes || undefined,
        });
      }
    }

    return { items: result, detectedMaterial: matchedName, availableMaterials };
  }

  // Legacy flat XML without <Материал> tag
  const items = xmlDoc.getElementsByTagName('Заготовка');
  for (let i = 0; i < items.length; i++) {
    const node = items[i];
    const mark = node.getElementsByTagName('Обозначение')[0]?.textContent?.trim() || '';
    const lenStr = node.getElementsByTagName('Размер')[0]?.textContent || '0';
    const qtyStr = node.getElementsByTagName('Количество')[0]?.textContent || '1';
    const notes = node.getElementsByTagName('Примечание')[0]?.textContent?.trim() || '';
    const len = parseFloat(lenStr);
    const qty = parseFloat(qtyStr);
    if (!isNaN(len) && len > 0) {
      result.push({
        mark: mark || undefined,
        length: len,
        quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
        notes: notes || undefined,
      });
    }
  }

  return { items: result, availableMaterials: [] };
}

/**
 * Export full solution directly into Excel (.xlsx) with all columns and material section
 */
export function exportSolutionToExcel(
  solution: FullOptimizationSolution,
  settings: AppSettings,
  stockInput: StockItem[],
  demandInput: DemandItem[]
) {
  const wb = XLSX.utils.book_new();

  // 1. Лист «Решение раскроя»
  const solutionData: (string | number)[][] = [
    ['РЕШЕНИЕ ЛИНЕЙНОГО РАСКРОЯ', '', '', '', `КИМ: ${solution.overallKIM.toFixed(2)}%`],
    ['Материал:', settings.material || '—', '', 'Заказ №:', settings.orderNumber || '—'],
    ['Ширина реза:', `${settings.bladeWidth} мм`, '', 'Деловой остаток:', `${settings.reusableRemnantMin} мм`],
    [],
    ['СВОДНЫЕ ПОКАЗАТЕЛИ'],
    ['КОЛИЧЕСТВО НАЛАДОК:', `${solution.rows.length}`],
    ['Использовано заготовок (всего):', `${solution.totalBarsUsed} шт.`],
    ['Суммарная длина материала:', `${solution.totalStockLength.toLocaleString('ru-RU')} мм (${(solution.totalStockLength / 1000).toFixed(2)} м)`],
    ['Деловой отход:', `${solution.totalReusableLength.toLocaleString('ru-RU')} мм (${(solution.totalReusableLength / 1000).toFixed(2)} м)`],
    ['Отход (лом):', `${solution.totalWasteLength.toLocaleString('ru-RU')} мм (${(solution.totalWasteLength / 1000).toFixed(2)} м)`],
    [],
    ['ДЕТАЛИЗИРОВАННЫЕ КАРТЫ РАСКРОЯ'],
    ['Карта №', 'Количество (шт)', 'Длина хлыста (мм)', 'Расход (мм)', 'Деловой отход (мм)', 'Отход/Лом (мм)', 'КИМ (%)', 'Раскрой (математическая запись)'],
  ];

  solution.rows.forEach((row) => {
    solutionData.push([
      `Карта №${row.barIndex}`,
      row.barsCount,
      row.barSize,
      row.spent,
      row.isReusable ? (row.reusableRemnant || 0) : 0,
      row.waste,
      `${row.efficiency}%`,
      row.formula,
    ]);
  });

  const wsSolution = XLSX.utils.aoa_to_sheet(solutionData);
  XLSX.utils.book_append_sheet(wb, wsSolution, 'Решение');

  // 2. Лист «Исходные данные (Склад и Спецификация)»
  const inputsData: (string | number)[][] = [
    ['ИСХОДНЫЕ ДАННЫЕ'],
    ['Материал:', settings.material || '—', '', 'Заказ №:', settings.orderNumber || '—'],
    [],
    ['ЕСТЬ (Склад)', '', '', '', '', 'НУЖНО (Спецификация)', '', '', ''],
    ['№', 'Обозначение', 'Размер (мм)', 'Кол-во (шт)', '', '№', 'Обозначение', 'Размер (мм)', 'Кол-во (шт)'],
  ];

  const maxRows = Math.max(stockInput.length, demandInput.length);
  for (let i = 0; i < maxRows; i++) {
    const s = stockInput[i];
    const d = demandInput[i];
    inputsData.push([
      s ? s.orderIndex : '',
      s?.mark || '',
      s ? (s.isStandardUnlimited && s.quantity === 0 ? 'Авто' : s.length) : '',
      s ? (s.isStandardUnlimited && s.quantity === 0 ? 'По потребности' : s.quantity) : '',
      '',
      d ? d.orderIndex : '',
      d?.mark || '',
      d ? d.length : '',
      d ? d.quantity : '',
    ]);
  }

  // 3. Секция «Осталось на складе»
  inputsData.push([]);
  inputsData.push(['ОСТАЛОСЬ НА СКЛАДЕ (Деловой отход)']);
  inputsData.push(['№', 'Обозначение', 'Размер (мм)', 'Количество (шт)']);
  solution.remainingWarehouseStock.forEach((r, idx) => {
    inputsData.push([idx + 1, r.mark || 'Деловой остаток', r.length, r.quantity]);
  });

  const wsInputs = XLSX.utils.aoa_to_sheet(inputsData);
  XLSX.utils.book_append_sheet(wb, wsInputs, 'Склад и Заказ');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `Раскрой_${settings.material || 'Профиль'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
