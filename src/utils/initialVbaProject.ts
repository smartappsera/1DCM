export const VBA_MY_RASKROY = `' ================================================================
' ФАЙЛ: MyRaskroy.bas (BAS)
' Ядро алгоритма линейного раскроя
' ================================================================
Attribute VB_Name = "MyRaskroy"
Option Explicit

Sub Raskroy()
    ' Основной алгоритм оптимального линейного раскроя
    Dim rng(), data()
    Dim out&(), outMass()
    Dim smArr(), kSm&, iSm&
    Dim txt$
    Dim i&, j&, k&, a&, t&, kRng&, n&, sm&, dm&, dRez&, delOst&
    Dim inpRng As Range, inpRng2 As Range, outRng As Range, outRng2 As Range
    Dim nod&, varOptim As Long, b2prof As Boolean, bIsVarBest As Boolean
    Dim kolVar As Long, kolVarBest As Long
    Dim sort&, sortZ&, s&, arrEl, var&, kEl&, el&, outSmIsh&(), outSm&(), outTxt$(), kout&, bestK&, bestSm&
    Dim ostArr, kOst&, bestOst&, ostSm&, othSm&, bestOth&, maxOst&
    Dim iSpeed&, bGroupe As Boolean, bGraph As Boolean, krm&

    dRez = Val([e4])     ' Ширина реза
    varOptim = Val([i5]) ' Вариант оптимизации
    krm = Val([e5])      ' Кромка (торцовка)
    delOst = Val([e6])   ' Деловой остаток
    b2prof = [f6] = True ' Раскрой в два профиля
    
    ' Нахождение НОД (наибольшего общего делителя) для масштабирования задачи
    nod = dRez
    For i = 1 To kRng: nod = myGcd(nod, rng(i)): Next i
    For i = 1 To kSm: nod = myGcd(nod, smArr(i)): Next i
    For i = 1 To kRng: rng(i) = rng(i) \\ nod: Next i
    For i = 1 To kSm: smArr(i) = smArr(i) \\ nod: Next i

    ' Многопроходный перебор перестановок и эвристик рюкзака
    For sortZ = 0 To nSortZ
        SortLongArray smArr, sortZ
        For sort = 0 To nSort
            SortLongArray rng, sort
            For var = 0 To nVar
                ' Решение подзадачи рюкзака динамическим программированием
                If var = 0 Then
                    arrEl = GreedyAlgo(data, sm)
                Else
                    arrEl = LongSumEl(data, sm, dm)
                End If
                ' Оценка качества решения (КИМ, минимизация отходов и вариантов)
            Next var
        Next sort
    Next sortZ
End Sub

Function LongSumEl(arr(), sm As Long, Optional ds As Long = 0)
    ' Динамическое программирование: нахождение подмножества деталей с максимальной суммой
    Dim out&(), i&, j&, k&, n&, l&, sm1&
    n = sm: sm1 = sm - ds
    ReDim a&(n)
    For i = 1 To n: a(i) = -1: Next i
    a(0) = 0
    For i = 1 To UBound(arr)
        For j = n - arr(i) To 0 Step -1
            If a(j) >= 0 Then
                k = j + arr(i)
                If a(k) = -1 Then a(k) = j
                If k >= sm1 Then Exit For
            End If
    Next j, i
    For i = sm To 1 Step -1
        If a(i) >= 0 Then
            k = i: Do: l = l + 1: ReDim Preserve out&(1 To l): out(l) = k - a(k): k = a(k): Loop While k
            LongSumEl = out: Exit Function
        End If
    Next i
End Function
`;

export const VBA_MY_GRAPH = `' ================================================================
' ФАЙЛ: MyGraph.bas (BAS)
' Построение графических схем раскладки заготовок
' ================================================================
Attribute VB_Name = "MyGraph"
Option Explicit

Sub OutGraph()
    ' Отрисовка цветных графических прямоугольников раскладки хлыста
    Dim i&, j&, rws&, zgt&, oth&, maxZgt&, txt, sTxt$, k&, n&, maxLen&, v0#, v#, iColor&
    Dim b45grad As Boolean
    b45grad = [g6] = True
    maxLen = 455

    While Val(inpRng.Offset(rws, 0)) > 0
        zgt = Val(inpRng.Offset(rws, 0))
        For Each txt In Split(Mid$(inpRng.Offset(rws, 3), 2), " + ")
            ' Отрисовка детали пропорционально длине
            DrawBar IIf(b45grad, 3, 5), outRng.Offset(rws, 0).Left + v0, outRng.Offset(rws, 0).Top + 1, v, 13, CStr(n), iColor
        Next txt
        ' Отрисовка остатка
        DrawBar 5, outRng.Offset(rws, 0).Left + v0, outRng.Offset(rws, 0).Top + 1, v, 13, "Остаток: " & oth, 1
        rws = rws + 1
    Wend
End Sub
`;

export const VBA_MY_LPSOLVE = `' ================================================================
' ФАЙЛ: MyLPsolve.bas (BAS)
' Линейное программирование (Column Generation CSP)
' ================================================================
Attribute VB_Name = "MyLPsolve"
Option Explicit

Sub lpCSP()
    ' Решение Cutting Stock Problem симплекс-методом / генерацией столбцов
    ' fGenerateSum: генерация допустимых паттернов
    ' fCSP_LPsolve: решение релаксации LP
End Sub
`;
