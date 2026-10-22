$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.runtime\install-check\ToZ'))
if (-not $testRoot.StartsWith((Join-Path $projectRoot '.runtime\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Install test path is outside the workspace' }
$packageVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $projectRoot "dist\ToZ-Setup-$packageVersion-x64.exe"
$appExe = Join-Path $testRoot 'ToZ.exe'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\1d101d23-307c-5be8-9c21-3a83d6538425'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ToZ.lnk'
$menuLink = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\ToZ.lnk'
$oldRun = (Get-ItemProperty -LiteralPath $runKey -Name ToZ -ErrorAction SilentlyContinue).ToZ
if ((Test-Path -LiteralPath (Join-Path $env:APPDATA 'ToZ\toz.sqlite')) -or (Test-Path -LiteralPath $uninstallKey) -or $oldRun -or (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $menuLink)) { throw 'Existing ToZ installation or shortcuts detected; refusing to modify them for tests' }
$reportFolder = Join-Path $projectRoot 'artifacts\installed-smoke'
New-Item -ItemType Directory -Path $reportFolder -Force | Out-Null
$result = [ordered]@{ installed = $false; directoryChoice = $false; desktopShortcut = $false; startMenuShortcut = $false; autoStart = $false; packagedApp = $false; uninstalled = $false; cleanedStartup = $false }
try {
  $installProcess = Start-Process -FilePath $installer -ArgumentList "/S /DESKTOP=1 /STARTMENU=1 /AUTOSTART=1 /D=$testRoot" -WindowStyle Hidden -Wait -PassThru
  if ($installProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $appExe)) { throw "Installer failed: $($installProcess.ExitCode)" }
  $result.installed = $true; $result.directoryChoice = $true
  $wsh = New-Object -ComObject WScript.Shell
  $result.desktopShortcut = (Test-Path -LiteralPath $desktopLink) -and $wsh.CreateShortcut($desktopLink).TargetPath.Equals($appExe, [StringComparison]::OrdinalIgnoreCase)
  $result.startMenuShortcut = (Test-Path -LiteralPath $menuLink) -and $wsh.CreateShortcut($menuLink).TargetPath.Equals($appExe, [StringComparison]::OrdinalIgnoreCase)
  $newRun = (Get-ItemProperty -LiteralPath $runKey -Name ToZ -ErrorAction SilentlyContinue).ToZ
  $result.autoStart = $newRun -eq ('"' + $appExe + '" --autostart')
  $dataPath = Join-Path $projectRoot '.runtime\installed-data'
  $reportPath = Join-Path $reportFolder 'result.json'
  $testProcess = Start-Process -FilePath $appExe -ArgumentList "--smoke-test --toz-data=$dataPath --smoke-result=$reportPath" -WindowStyle Hidden -Wait -PassThru
  $appReport = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  $result.packagedApp = $appReport.ok -and $appReport.synchronized -and $testProcess.ExitCode -eq 0
} finally {
  $uninstaller = Get-ChildItem -LiteralPath $testRoot -Filter '*Uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($uninstaller) {
    $resolvedUninstaller = [System.IO.Path]::GetFullPath($uninstaller.FullName)
    if (-not $resolvedUninstaller.StartsWith($testRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid uninstaller location' }
    $uninstallProcess = Start-Process -FilePath $resolvedUninstaller -ArgumentList "/S _?=$testRoot" -WindowStyle Hidden -Wait -PassThru
    $result.uninstalled = -not (Test-Path -LiteralPath $appExe) -and -not (Test-Path -LiteralPath $uninstallKey)
    $result.cleanedStartup = -not (Get-ItemProperty -LiteralPath $runKey -Name ToZ -ErrorAction SilentlyContinue).ToZ
  }
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportFolder 'installer-result.json') -Encoding utf8
}
$result | ConvertTo-Json
if ($result.Values -contains $false) { throw 'One or more installer verification checks failed' }
