Attribute VB_Name = "MyRaskroy"
Option Explicit

Sub ClearData()
    Dim inpRng As Range
    Dim inpRng2 As Range
    Dim outRng As Range
    Dim outRng2 As Range
    
    Set inpRng = [d25]
    Set inpRng2 = [d11]
    Set outRng = [m4]
    Set outRng2 = [i25]
    
    ActiveSheet.Unprotect
    ShapesDelete
    inpRng.Resize(100, 2).ClearContents
    inpRng2.Resize(10, 2).ClearContents
    inpRng2.Offset(0, 5).Resize(10, 2).ClearContents
    outRng2.Resize(100, 2).ClearContents
    outRng.Resize(150, 6).Clear
    ActiveSheet.ListObjects("СписокРаскроя").Resize Range("$M$2:$R$3")
    ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
End Sub

Sub ClearSolve()
    Dim inpRng As Range
    Dim inpRng2 As Range
    Dim outRng As Range
    Dim outRng2 As Range
    
    Set inpRng = [d25]
    Set inpRng2 = [d11]
    Set outRng = [m4]
    Set outRng2 = [i25]
    
    ActiveSheet.Unprotect
    ShapesDelete
    inpRng2.Offset(0, 5).Resize(10, 2).ClearContents
    outRng2.Resize(100, 2).ClearContents
    outRng.Resize(150, 6).Clear
    ActiveSheet.ListObjects("СписокРаскроя").Resize Range("$M$2:$R$3")
    ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
End Sub

Sub Raskroy()
    Dim rng(), data()
    Dim out&(), outMass()
    Dim smArr(), kSm&, iSm&
    Dim txt$
    Dim rws&
    Dim i&, j&, k&, a&
    Dim t&
    Dim kRng&, n&
    Dim sm&
    Dim dm&
    Dim dRez&
    Dim delOst&
    Dim inpRng As Range
    Dim inpRng2 As Range
    Dim outRng As Range
    Dim outRng2 As Range
    Dim nod&
    Dim varOptim As Long
    Dim b2prof As Boolean
    Dim bIsVarBest As Boolean
    Dim kolVar As Long
    Dim kolVarBest As Long
    Dim sort&, sortZ&, s&, arrEl, var&, kEl&, el&, outSmIsh&(), outSm&(), outTxt$(), kout&, bestK&, bestSm&
    Dim ostArr, kOst&, bestOst&, ostSm&, othSm&, bestOth&, maxOst&
    Dim proc As Double
    Dim iTimer!, kPB&, nSortZ&, nSort&, nVar&, iSpeed&, bGroupe As Boolean, bGraph As Boolean, krm&
    Dim tmp, kZgt&, bFlag As Boolean, zs&
    
    Randomize 0
    iTimer = Timer
    
    Set inpRng = [d25]
    Set inpRng2 = [d11]
    Set outRng = [m4]
    Set outRng2 = [i25]

    Call ClearSolve
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    ActiveSheet.Unprotect
    
    On Error GoTo EndSolution
    Application.EnableCancelKey = xlErrorHandler

    dRez = Val([e4])
    varOptim = Val([i5])
    If dRez < 0 Then dRez = 0
    krm = Val([e5])
    delOst = Val([e6])
    b2prof = [f6] = True
    
    If b2prof Then
        For i = 1 To 90
            If Val(inpRng.Offset(i - 1, 1)) Mod 2 Then b2prof = False: Exit For
        Next i
        If Not b2prof Then
            [f6] = False
            MsgBox "Число деталей должно быть четным для раскроя в два профиля"
        End If
    End If
    
    kRng = 0
    For i = 1 To 90
        s = Val(inpRng.Offset(i - 1, 0))
        If s > 0 Then
            For j = 1 To IIf(inpRng.Offset(i - 1, 1) = "", Int(inpRng.Offset(-1, 5) / inpRng.Offset(i - 1, 0)), Val(inpRng.Offset(i - 1, 1))) \ (1 - b2prof)
                kRng = kRng + 1
                ReDim Preserve rng(1 To kRng)
                rng(kRng) = s + dRez
                ostSm = ostSm + s
            Next j
        End If
    Next i
    
    kSm = 0
    For i = 1 To 10
        s = Val(inpRng2.Offset(i - 1, 0)) - krm
        If s > 0 Then
            If inpRng2.Offset(i - 1, 1) = "" Then
                kZgt = 0
                ReDim bRng(1 To kRng) As Boolean
                Do
                    bFlag = False
                    kZgt = kZgt + 1
                    zs = s
                    For j = 1 To kRng
                        If Not bRng(j) Then
                            If zs >= rng(j) Then
                                zs = zs - rng(j)
                                bRng(j) = True
                                bFlag = True
                            End If
                        End If
                    Next j
                Loop While bFlag And zs < s
            Else
                kZgt = Val(inpRng2.Offset(i - 1, 1))
                If b2prof Then kZgt = kZgt \ 2
            End If
            For j = 1 To kZgt
                kSm = kSm + 1
                ReDim Preserve smArr(1 To kSm)
                smArr(kSm) = s
            Next j
        End If
    Next i
    
    If kRng = 0 Or kSm = 0 Then
        ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
        Application.Calculation = xlCalculationAutomatic
        Application.ScreenUpdating = True
        Exit Sub
    End If
    
    nod = dRez
    For i = 1 To kRng: nod = myGcd(nod, rng(i)): Next i
    For i = 1 To kSm: nod = myGcd(nod, smArr(i)): Next i
        
    For i = 1 To kRng: rng(i) = rng(i) \ nod: Next i
    For i = 1 To kSm: smArr(i) = smArr(i) \ nod: Next i
    
    iSpeed = Val([i4])
    If iSpeed < 1 Then iSpeed = 1
    If iSpeed > 5 Then iSpeed = 6
    
    bGroupe = [f4] = True
    bGraph = [f5] = True

    nSortZ = IIf(WorksheetFunction.count(inpRng2.Resize(10, 1)) > 1, Choose(iSpeed, 4, 8, 12, 24, 48, 96), 0)
    nSort = Choose(iSpeed, 4, 8, 12, 24, 96, 400)
    nVar = Choose(iSpeed, 4, 5, 6, 8, 16, 32)
    
    For sortZ = 0 To nSortZ
        SortLongArray smArr, sortZ
        For sort = 0 To nSort
            SortLongArray rng, sort
            For var = 0 To nVar
                kPB = kPB + 1
                maxOst = 0
                kout = 0
                data = rng
                n = kRng
                iSm = 0
                othSm = 0
                Do
                    iSm = iSm + 1
                    sm = smArr(iSm)
                    If var = 0 Then
                        arrEl = GreedyAlgo(data, sm)
                    Else
                        s = 0
                        For i = 1 To n
                            s = s + data(i)
                        Next i
                        Select Case var
                        Case 1: dm = sm - s \ (-Int(-s / sm))
                        Case 2: dm = (sm - s \ (-Int(-s / sm))) \ 2
                        Case Else: dm = sm * (var - 3) \ 200
                        End Select
                        arrEl = LongSumEl(data, sm, dm)
                    End If
                    If IsArray(arrEl) Then
                        SortLongArray arrEl

                        kEl = UBound(arrEl)
                        ReDim Newarr(1 To n)
                        For i = 1 To n
                            Newarr(i) = data(i)
                        Next i
                        
                        t = 0
                        k = 1
                        s = 0
                        txt = ""
                        For i = 1 To kEl
                            el = arrEl(i)
                            If el = t Then k = k + 1 Else txt = txt & IIf(k = 1, IIf(txt = "", "", ")"), " - " & k & " шт.)") & IIf(txt = "", "", " + ") & "(" & el * nod - dRez & IIf(dRez, "+" & dRez, ""): k = 1
                            If i = kEl Then txt = txt & IIf(k = 1, ")", " - " & k & " шт.)")
                            t = el
                            
                            s = s + el
                            j = 1
                            While Newarr(j) <> el
                                j = j + 1
                            Wend
                            Newarr(j) = 0
                        Next i
                        othSm = othSm + sm - s
                        If maxOst < sm - s Then maxOst = sm - s
                        
                        kout = kout + 1
                        ReDim Preserve outSmIsh&(1 To kout)
                        ReDim Preserve outSm&(1 To kout)
                        ReDim Preserve outTxt$(1 To kout)
                        outSmIsh(kout) = sm
                        outSm(kout) = s
                        outTxt(kout) = txt
                        
                        If n = kEl Then n = 0: ostSm = 0: Exit Do
                        ReDim data(1 To n - kEl)
                        n = 0
                        ostSm = 0
                        For i = 1 To UBound(Newarr)
                            If Newarr(i) > 0 Then
                                n = n + 1
                                data(n) = Newarr(i)
                                ostSm = ostSm + Newarr(i)
                            End If
                        Next i
                    End If
                Loop While iSm < kSm

                With CreateObject("Scripting.Dictionary")
                    For i = 1 To kout
                        .Item(outTxt(i)) = 0&
                    Next i
                    kolVar = .count
                End With
                
                bIsVarBest = False
                If varOptim = 1 Then
                    bIsVarBest = bestK = 0 Or bestOst > ostSm Or (bestOst = ostSm And bestOth > othSm) Or (bestOst = ostSm And bestOth = othSm And bestSm < maxOst)
                Else
                    bIsVarBest = bestK = 0 Or bestOst > ostSm Or (bestOst = ostSm And bestOth > othSm) Or (bestOst = ostSm And bestOth = othSm And kolVar < kolVarBest)
                End If
                
                If bIsVarBest Then
                    bestK = kout
                    bestSm = maxOst
                    bestOst = ostSm
                    bestOth = othSm
                    ostArr = data
                    kOst = n
                    kolVarBest = kolVar
                    
                    For i = 1 To kout
                        For j = i + 1 To kout
                            If outSmIsh(i) < outSmIsh(j) Or (outSmIsh(i) = outSmIsh(j) And outSm(i) < outSm(j)) Or _
                                    (outSmIsh(i) = outSmIsh(j) And outSm(i) = outSm(j) And outTxt(i) < outTxt(j)) Then
                                t = outSmIsh(i): outSmIsh(i) = outSmIsh(j): outSmIsh(j) = t
                                t = outSm(i): outSm(i) = outSm(j): outSm(j) = t
                                txt = outTxt(i): outTxt(i) = outTxt(j): outTxt(j) = txt
                            End If
                    Next j, i
    
                    txt = ""
                    rws = 0
                    t = 0
                    
                    ReDim outMass(1 To 4, 1 To 1)
                    For i = 1 To kout
                        If txt <> outTxt(i) Or t <> outSmIsh(i) Or Not bGroupe Then
                            k = 1
                            rws = rws + 1
                            ReDim Preserve outMass(1 To 4, 1 To rws)
                            outMass(1, rws) = outSmIsh(i) * nod + krm
                            outMass(2, rws) = outSm(i) * nod + krm
                            outMass(3, rws) = k * (1 - b2prof)
                            outMass(4, rws) = "'=" & outTxt(i) & IIf(krm > 0, " + [" & krm & "]", "")
                            txt = outTxt(i)
                            t = outSmIsh(i)
                        Else
                            k = k + 1
                            outMass(3, rws) = k * (1 - b2prof)
                        End If
                    Next i
                End If
    Next var, sort, sortZ
    
EndSolution:
End Sub

Sub SortLongArray(arr, Optional sort As Long = 1)
    Dim i&, j&, k&, t&, b(), m&, l&
    k = UBound(arr)
    If sort < 5 And sort > 0 Then
        If k > 100 Then
            For i = 1 To k
                If arr(i) > m Or i = 1 Then m = arr(i)
            Next i
            ReDim nArr&(1 To m)
            For i = 1 To k
                nArr(arr(i)) = nArr(arr(i)) + 1
            Next i
            For i = IIf(sort <> 2, 1, m) To IIf(sort <> 2, m, 1) Step IIf(sort <> 2, 1, -1)
                For j = 1 To nArr(i)
                    l = l + 1
                    arr(l) = i
            Next j, i
        Else
            For i = 1 To k
                For j = i + 1 To k
                    If sort <> 2 Then
                        If arr(i) < arr(j) Then t = arr(i): arr(i) = arr(j): arr(j) = t
                    Else
                        If arr(i) > arr(j) Then t = arr(i): arr(i) = arr(j): arr(j) = t
                    End If
            Next j, i
        End If
    End If
    If sort > 2 And sort Mod 2 Then
        For i = 2 To k \ 2 Step 2
            j = k + 2 - i
            t = arr(i)
            arr(i) = arr(j)
            arr(j) = t
        Next i
    ElseIf sort > 2 Then
        b = arr
        For i = 1 To k
            If i Mod 2 Then arr(i) = b((i + 1) \ 2) Else arr(i) = b(k + 1 - i \ 2)
        Next i
    End If
    If sort > 12 Then
        For i = 1 To k
            j = Int(Rnd * i) + 1
            t = arr(i): arr(i) = arr(j): arr(j) = t
        Next i
    End If
End Sub

Function LongSumEl(arr(), sm As Long, Optional ds As Long = 0)
    Dim out&(), i&, j&, k&, n&, l&, sm1&
    n = sm + 0
    sm1 = sm - ds
    If n > 80000000 Or n < 0 Then Exit Function
    ReDim a&(n)
    For i = 1 To n: a(i) = -1: Next i
    
    Do
        For i = 1 To UBound(arr)
            For j = n - arr(i) To 0 Step -1
                If a(j) >= 0 Then
                    k = j + arr(i)
                    If a(k) = -1 Then a(k) = j
                    If k >= sm1 Then Exit Do
                End If
        Next j, i
    Loop While False
    
    For i = sm To 1 Step -1
        If a(i) >= 0 Then
            k = i
            Do
                l = l + 1
                ReDim Preserve out&(1 To l)
                out(l) = k - a(k)
                k = a(k)
            Loop While k
            LongSumEl = out
            Exit Function
        End If
    Next i
End Function

Function GreedyAlgo(arr(), sm As Long)
    Dim i&, j&, s&, out&()
    s = sm
    For i = 1 To UBound(arr)
        If arr(i) <= s Then
            j = j + 1
            ReDim Preserve out(1 To j)
            out(j) = arr(i)
            s = s - arr(i)
        End If
    Next i
    If s < sm Then GreedyAlgo = out
End Function

Function myGcd&(ByVal a&, ByVal b&)
    Dim t&
    If a < b Then t = a: a = b: b = t
    While b
        t = b
        b = a Mod b
        a = t
    Wend
    myGcd = a
End Function
