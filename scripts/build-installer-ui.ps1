param([switch]$Preview)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDirectory = Join-Path $repoRoot '.runtime/installer-assets'
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
$version = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).version
$installer = Join-Path $repoRoot "dist/ToZ-Setup-$version-x64.exe"
$engine = Join-Path $assetDirectory "ToZ-Engine-$version-x64.exe"
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw '缺少 Windows .NET Framework C# 编译器' }
$options = @('/nologo','/target:winexe','/platform:x64','/optimize+','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Core.dll',"/win32manifest:$repoRoot/build/installer-ui.manifest","/win32icon:$repoRoot/build/icon.ico","/resource:$repoRoot/build/icon.ico,ToZ.Icon","/resource:$repoRoot/build/icon.png,ToZ.Brand")
if ($Preview) {
    $outputDirectory = Join-Path $repoRoot 'artifacts/installer-ui'
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $output = Join-Path $outputDirectory 'preview.exe'
    $options += '/define:UI_PREVIEW'
    $engineHash = ''
} else {
    if (!(Test-Path -LiteralPath $installer)) { throw '请先构建 NSIS 安装引擎' }
    Copy-Item -LiteralPath $installer -Destination $engine -Force
    $hasher = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($engine)
    try { $engineHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
    $options += "/resource:$engine,ToZ.Engine"
    $output = $installer
}
$metadata = Join-Path $assetDirectory 'installer-meta.cs'
$source = "internal static class BuildInfo { internal const string Version = `"$version`"; internal const string EngineSha256 = `"$engineHash`"; }"
[IO.File]::WriteAllText($metadata,$source,[Text.Encoding]::UTF8)
& $compiler @options "/out:$output" $metadata (Join-Path $repoRoot 'build/installer-ui.cs')
if ($LASTEXITCODE -ne 0) { throw '自定义安装界面编译失败' }
if ($Preview) {
    # This build omits the payload and compile-time disables installation and startup writes.
    $fixture = Start-Process -FilePath $output -ArgumentList ('"'+$outputDirectory+'"') -WindowStyle Hidden -PassThru
    if (!$fixture.WaitForExit(15000)) { $fixture.Kill(); throw '安装界面定向检查超时' }
    $result = Get-Content -Raw -LiteralPath (Join-Path $outputDirectory 'result.txt')
    if ($fixture.ExitCode -ne 0 -or !$result.StartsWith('PASS:')) { throw $result }
    Write-Output $result
} else {
    # The outer host is the downloadable setup. NSIS update metadata describes the
    # inner engine, so remove it rather than publishing hashes for another file.
    foreach ($name in @("ToZ-Setup-$version-x64.exe.blockmap",'latest.yml')) {
        $metadataArtifact = Join-Path $repoRoot "dist/$name"
        if (Test-Path -LiteralPath $metadataArtifact) { Remove-Item -LiteralPath $metadataArtifact }
    }
    Write-Output "安装界面已生成：$output"
}
