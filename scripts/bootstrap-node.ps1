$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$version = '24.22.1'
$archive = "node-v$version-win-x64.zip"
$checksum = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
$exe = Join-Path $tools "node-v$version-win-x64/node.exe"
if (!(Test-Path -LiteralPath $exe)) {
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $zip = Join-Path $tools $archive
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$version/$archive" -OutFile $zip
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum) {
        throw 'Node archive SHA256 mismatch; extraction cancelled.'
    }
    Expand-Archive -LiteralPath $zip -DestinationPath $tools -Force
    Remove-Item -LiteralPath $zip
}
$env:Path = "$(Split-Path -Parent $exe);$env:Path"
$env:PYTHONUTF8 = '1'
& $exe --version
Write-Host 'Node 24 is active in this PowerShell session. Run npm ci, then npm run demo.'
