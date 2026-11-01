# Starts NexDeck automatically when you log in to Windows (no console window).
#   powershell -ExecutionPolicy Bypass -File scripts\startup.ps1 -Install
#   powershell -ExecutionPolicy Bypass -File scripts\startup.ps1 -Uninstall
param([switch]$Install, [switch]$Uninstall)

$root = Split-Path -Parent $PSScriptRoot
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'NexDeck.lnk'

if ($Uninstall) {
    Remove-Item $link -ErrorAction SilentlyContinue
    Write-Output 'NexDeck removido da inicializacao.'
    exit 0
}
if (-not $Install) {
    Write-Output 'Use -Install ou -Uninstall.'
    exit 1
}

$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$root'; & '$node' src/index.js *> data/server.log`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output "NexDeck vai iniciar com o Windows. Log: $root\data\server.log"
