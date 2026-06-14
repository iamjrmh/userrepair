# Bumps the app version across every file that carries it, in one place.
# Called by build.bat. Run directly with:  powershell -File bump-version.ps1 -Version 1.2.3
param([Parameter(Mandatory = $true)][string]$Version)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if ($Version -notmatch '^\d+\.\d+\.\d+([-.+0-9A-Za-z]*)$') {
  Write-Error "Version must look like 1.2.3"
  exit 1
}

function Set-Version([string]$RelPath, [string]$Pattern, [string]$Replacement) {
  $full = Join-Path $root $RelPath
  if (-not (Test-Path -LiteralPath $full)) { Write-Error "Missing file: $RelPath"; exit 1 }
  $text = Get-Content -LiteralPath $full -Raw
  $rx = [regex]$Pattern
  if (-not $rx.IsMatch($text)) { Write-Error "No version field found in $RelPath"; exit 1 }
  $new = $rx.Replace($text, $Replacement, 1)
  [System.IO.File]::WriteAllText($full, $new)
  Write-Host "  updated $RelPath"
}

Set-Version 'package.json'              '"version":\s*"[^"]*"'       ('"version": "' + $Version + '"')
Set-Version 'src-tauri/tauri.conf.json' '"version":\s*"[^"]*"'       ('"version": "' + $Version + '"')
Set-Version 'src-tauri/Cargo.toml'      '(?m)^version\s*=\s*"[^"]*"' ('version = "' + $Version + '"')

# Keep Cargo.lock's own package entry in step so the build never has to resolve it.
$lock = Join-Path $root 'src-tauri/Cargo.lock'
if (Test-Path -LiteralPath $lock) {
  $text = Get-Content -LiteralPath $lock -Raw
  $rx = [regex]'(name = "userrepair"\r?\nversion = ")[^"]*"'
  if ($rx.IsMatch($text)) {
    $new = $rx.Replace($text, ('${1}' + $Version + '"'), 1)
    [System.IO.File]::WriteAllText($lock, $new)
    Write-Host "  updated src-tauri/Cargo.lock"
  }
}

Write-Host "Version set to $Version"
