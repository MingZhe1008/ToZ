$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDirectory = Join-Path $repoRoot '.runtime/installer-assets'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
$brandImage = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'icon.png'))
function Write-InstallerArtwork([string]$Name, [int]$Width, [int]$Height, [bool]$Sidebar) {
    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#252527'))
    $muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#64646A'))
    $title = [System.Drawing.Font]::new('Segoe UI', $(if ($Sidebar) { 22 } else { 16 }), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $body = [System.Drawing.Font]::new('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $small = [System.Drawing.Font]::new('Segoe UI', 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($(if ($Sidebar) { '#F0F0EE' } else { '#F8F8F7' })))
        if ($Sidebar) {
            $graphics.DrawImage($brandImage, 22, 30, 48, 48)
            $graphics.DrawString('ToZ', $title, $ink, [single]22, [single]90)
            $graphics.DrawString("让开始`n有迹可循。", $body, $muted, [single]22, [single]130)
            $graphics.DrawString('WINDOWS / x64', $small, $muted, [single]22, [single]258)
            $graphics.DrawString('LOCAL FIRST', $small, $muted, [single]22, [single]276)
        } else {
            $graphics.DrawImage($brandImage, 25, 14, 30, 30)
            $graphics.DrawString('ToZ', $title, $ink, [single]66, [single]18)
        }
        $bitmap.Save((Join-Path $assetDirectory $Name), [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally {
        $small.Dispose(); $body.Dispose(); $title.Dispose(); $muted.Dispose(); $ink.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    }
}
try {
    Write-InstallerArtwork 'header.bmp' 150 57 $false
    Write-InstallerArtwork 'sidebar.bmp' 164 314 $true
} finally { $brandImage.Dispose() }
