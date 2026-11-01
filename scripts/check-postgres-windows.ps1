param([Parameter(Mandatory=$true)][string]$BinaryPath)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LensPostgresWindowCheck {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@
$visible=@(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -eq $BinaryPath -and $_.MainWindowHandle -ne 0 -and
  [LensPostgresWindowCheck]::IsWindowVisible($_.MainWindowHandle)
})
Write-Output ("visiblePostgresWindows=" + $visible.Count)
if ($visible.Count -gt 0) { exit 1 }
