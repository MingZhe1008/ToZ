Add-Type -AssemblyName System.Drawing
$iconRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)
$shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
$shape.AddArc(8,8,88,88,180,90);$shape.AddArc(160,8,88,88,270,90)
$shape.AddArc(160,160,88,88,0,90);$shape.AddArc(8,160,88,88,90,90)
$shape.CloseFigure()
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16,16,18))
$graphics.FillPath($brush,$shape)
$font = [System.Drawing.Font]::new('Segoe UI Semibold',152,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('tz',$font,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new(0,-12,256,256),$format)
$bitmap.Save((Join-Path $iconRoot 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose();$shape.Dispose();$brush.Dispose();$font.Dispose();$format.Dispose()
$sizes = @(16,24,32,48,64,128,256)
$entries = @()
foreach($size in $sizes){
  $small = [System.Drawing.Bitmap]::new($size,$size)
  $canvas = [System.Drawing.Graphics]::FromImage($small)
  $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $canvas.DrawImage($bitmap,0,0,$size,$size)
  $memory = [System.IO.MemoryStream]::new()
  $small.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png)
  $entries += ,$memory.ToArray()
  $memory.Dispose();$canvas.Dispose();$small.Dispose()
}
$bitmap.Dispose()
$stream = [System.IO.File]::Create((Join-Path $iconRoot 'icon.ico'))
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for($index=0;$index -lt $sizes.Count;$index++){
  $dimension = if($sizes[$index] -eq 256){0}else{$sizes[$index]}
  $writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0)
  $writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$entries[$index].Length);$writer.Write([uint32]$offset)
  $offset += $entries[$index].Length
}
foreach($entry in $entries){$writer.Write([byte[]]$entry)}
$writer.Dispose()
