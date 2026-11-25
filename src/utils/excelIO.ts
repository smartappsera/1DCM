/**
 * Parse clipboard text copied from Excel (tab-separated or semicolon-separated)
 */
export function parseExcelClipboardText(text: string): {
  mark: string;
  length: number;
  quantity: number;
  notes?: string;
}[] {
  const lines = text.trim().split(/\r?\n/);
  const parsedItems: {
    mark: string;
    length: number;
    quantity: number;
    notes?: string;
  }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Split by tab or semicolon or comma
    const cols = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
      ? line.split(';')
      : line.split(/[,|]/);

    const cleanCols = cols.map((c) => c.trim().replace(/"/g, ''));
    if (cleanCols.length === 0) continue;

    // Detect if column contains numbers
    // Possibility 1: Mark, Length, Quantity, Notes
    // Possibility 2: Length, Quantity, Mark
    let length = 0;
    let qty = 1;
    let mark = '';
    let notes = '';

    const num1 = parseFloat(cleanCols[0]?.replace(',', '.'));
    const num2 = parseFloat(cleanCols[1]?.replace(',', '.'));
    const num3 = parseFloat(cleanCols[2]?.replace(',', '.'));

    if (isNaN(num1)) {
      // First column is Mark
      mark = cleanCols[0];
      length = !isNaN(num2) ? num2 : 0;
      qty = !isNaN(num3) && num3 > 0 ? num3 : 1;
      notes = cleanCols[3] || '';
    } else {
      // First column is length
      length = num1;
      qty = !isNaN(num2) && num2 > 0 ? num2 : 1;
      mark = cleanCols[2] || `Деталь_${parsedItems.length + 1}`;
      notes = cleanCols[3] || '';
    }

    if (length > 0) {
      parsedItems.push({
        mark: mark || `Поз.${parsedItems.length + 1}`,
        length,
        quantity: Math.max(1, Math.round(qty)),
        notes,
      });
    }
  }

  return parsedItems;
}
