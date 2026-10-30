Attribute VB_Name = "MyGraph"
Option Explicit

Sub OutGraph()
    Dim i&, j&, s&, a&, t$, k1&, v1&, s1&, a1 As Double, s2 As Double, dRez&
    Dim inpRng As Range, outRng As Range, otrRng As Range
    Dim rws&, zgt&, oth&, maxZgt&, txt, sTxt$, k&, n&, maxLen&, v0#, v#, iColor&
    Dim MyShape As Shape
    Dim b45grad As Boolean
    
    Set otrRng = [d25]
    Set inpRng = [m4]
    Set outRng = [r4]
    
    b45grad = [g6] = True
        
    ActiveSheet.Unprotect
    Call ShapesDelete
    
    rws = 0
    maxLen = 455
    
    While Val(inpRng.Offset(rws, 0)) > 0
        zgt = Val(inpRng.Offset(rws, 0))
        If maxZgt = 0 Then maxZgt = zgt
        oth = zgt - Val(inpRng.Offset(rws, 1))
        v0 = 0
        For Each txt In Split(Mid$(inpRng.Offset(rws, 3), 2), " + ")
            sTxt = Replace(Replace(Replace(Replace(txt, " ", ""), "(", ""), ")", ""), "шт.", "")
            i = InStr(sTxt, "-")
            If i = 0 Then k = 1 Else k = Val(Mid(sTxt, i + 1)): sTxt = Left(sTxt, i - 1)
            i = InStr(sTxt, "+")
            If i = 0 Then dRez = 0 Else dRez = Val(Mid(sTxt, i + 1)): sTxt = Left(sTxt, i - 1)
            n = Val(sTxt)
            
            v = n * (maxLen + 2) / maxZgt - 2
           
            For i = 1 To 90
                If otrRng.Offset(i - 1, 0) = n Then iColor = Val(otrRng.Offset(i - 1, -2)): Exit For
            Next i
            If iColor < 1 Then iColor = 1

            For j = 1 To k
                If v > 1 Then DrawBar IIf(b45grad, 3, 5), outRng.Offset(rws, 0).Left + v0, outRng.Offset(rws, 0).Top + 1, v, 13, CStr(n), iColor
                v0 = v0 + v + dRez * maxLen / maxZgt + 2
            Next j
        Next txt
        v = oth * (maxLen + 2) / maxZgt - 2
        If v > 1 Then DrawBar 5, outRng.Offset(rws, 0).Left + v0, outRng.Offset(rws, 0).Top + 1, v, 13, "Остаток: " & oth, 1
        rws = rws + 1
    Wend
    
    [f5] = True
    ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
End Sub

Sub DrawBar(typ&, y, x, h, v, txt$, bgColor&)
    On Error Resume Next
    With ActiveSheet.Shapes.AddShape(typ, y + 1.5, x, h, v)
        If typ = 3 Then .Adjustments.Item(1) = 1
        With .Line
            .ForeColor.SchemeColor = bgColor
            .ForeColor.TintAndShade = -0.6
            .Weight = 1
        End With
        With .TextFrame2
            .VerticalAnchor = msoAnchorMiddle
            .HorizontalAnchor = msoAnchorCenter
            .TextRange.Characters.Font.Fill.ForeColor.SchemeColor = 0
            .TextRange.Characters.Font.Size = 8
            .MarginLeft = 0
            .MarginRight = 0
            .TextRange.Characters.Text = txt
        End With
        With .Fill
            .TwoColorGradient msoGradientHorizontal, 2
            .ForeColor.SchemeColor = bgColor
            .ForeColor.TintAndShade = 0.2
            .BackColor.SchemeColor = bgColor
            .BackColor.TintAndShade = 0.6
        End With
    End With
End Sub

Sub OffGraph()
    ActiveSheet.Unprotect
    [f5] = False
    Call ShapesDelete
    ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
End Sub

Sub ShapesDelete()
    Dim MyShape As Shape, i&
    For Each MyShape In ActiveSheet.Shapes
        i = i + 1
        If i > 0 And MyShape.Type = 1 And MyShape.AutoShapeType = 5 Then
            MyShape.Delete
        End If
    Next MyShape
End Sub
