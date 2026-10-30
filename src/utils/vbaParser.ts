import { VbaInspectionResult } from '../types/cutting';

/**
 * VBA Code Analyzer & Inspection Tool
 * Parses .bas, .cls, .frm or raw text to inspect subroutines,
 * functions, loops, cut parameters, and mathematical heuristics.
 */
export function analyzeVbaCode(code: string, fileName = 'macro.bas'): VbaInspectionResult {
  const lines = code.split(/\r?\n/);
  const subroutines: string[] = [];
  const functions: string[] = [];
  const variablesDetected: string[] = [];
  const sortingDetected: string[] = [];
  const algorithmHints: string[] = [];

  let moduleType: VbaInspectionResult['moduleType'] = 'text';
  if (fileName.toLowerCase().endsWith('.bas')) moduleType = 'bas';
  else if (fileName.toLowerCase().endsWith('.cls')) moduleType = 'cls';
  else if (fileName.toLowerCase().endsWith('.frm')) moduleType = 'frm';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Check Sub declarations
    const subMatch = line.match(/^Public\s+Sub\s+(\w+)|^Private\s+Sub\s+(\w+)|^Sub\s+(\w+)/i);
    if (subMatch) {
      const subName = subMatch[1] || subMatch[2] || subMatch[3];
      if (subName && !subroutines.includes(subName)) {
        subroutines.push(subName);
      }
    }

    // Check Function declarations
    const funcMatch = line.match(/^Public\s+Function\s+(\w+)|^Private\s+Function\s+(\w+)|^Function\s+(\w+)/i);
    if (funcMatch) {
      const funcName = funcMatch[1] || funcMatch[2] || funcMatch[3];
      if (funcName && !functions.includes(funcName)) {
        functions.push(funcName);
      }
    }

    // Check Variables / Dim / ReDim
    const dimMatch = line.match(/^(?:Dim|ReDim(?:\s+Preserve)?)\s+([\w\d_,\s()]+)/i);
    if (dimMatch) {
      const vars = dimMatch[1].split(',').map((v) => v.trim().split(/\s+/)[0]);
      for (const v of vars) {
        if (v && !variablesDetected.includes(v) && variablesDetected.length < 30) {
          variablesDetected.push(v);
        }
      }
    }

    // Detect sorting logic
    if (line.match(/(?:sort|bubble|quick|order|xlDescending|xlAscending)/i)) {
      if (!sortingDetected.includes(line) && sortingDetected.length < 8) {
        sortingDetected.push(line);
      }
    }

    // Detect cutting parameters or heuristics
    if (line.match(/(?:kerf|рез|пропил|ширина|отход|хлыст|заготовк|длин|длина|waste|stock|scrap|trim|остаток)/i)) {
      if (!algorithmHints.includes(line) && algorithmHints.length < 12) {
        algorithmHints.push(line);
      }
    }
  }

  return {
    fileName,
    moduleType,
    subroutines,
    functions,
    variablesDetected,
    sortingDetected,
    algorithmHints,
    rawCode: code,
  };
}

export const SAMPLE_VBA_CODE = `' ===============================================================
' Модуль: CutOptimizer_Linear.bas
' Алгоритм оптимального раскроя линейного проката (1D Cutting Stock)
' ===============================================================
Option Explicit

Public Sub RunCuttingOptimization()
    Dim wsInput As Worksheet, wsOutput As Worksheet
    Dim bladeKerf As Double, trimLeft As Double, trimRight As Double
    Dim minReusableRemnant As Double
    Dim stockLengths() As Double, stockQty() As Long
    Dim partsDemand() As Double, partsMarks() As String, partsCount() As Long
    Dim i As Long, j As Long, totalBarsUsed As Long
    
    ' Параметры оборудования
    bladeKerf = 3.5        ' Ширина пропила диска пилы, мм
    trimLeft = 15#         ' Торцовка в начале хлыста, мм
    trimRight = 15#        ' Торцовка в конце хлыста, мм
    minReusableRemnant = 500# ' Минимальный деловой остаток, мм
    
    ' Сортировка деталей по убыванию длины (Best-Fit Decreasing)
    Call QuickSortDescending(partsDemand, partsMarks, partsCount)
    
    ' Основной цикл раскроя по хлыстам
    Do While HasUncutParts(partsCount)
        ' Подбор оптимального хлыста со склада
        ' Учет делового остатка и минимизация невозвратного лома
    Loop
    
    MsgBox "Раскрой успешно рассчитан! КИМ = " & Format(CalcEfficiency(), "0.0%"), vbInformation
End Sub

Private Sub QuickSortDescending(arr() As Double, marks() As String, qty() As Long)
    ' Эвристика: крупные заготовки размещаются первыми
End Sub
`;
