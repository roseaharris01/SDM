param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $root "build\publish\SDM"

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

dotnet publish (Join-Path $root "src\Silent.DownloadManager.App\Silent.DownloadManager.App.csproj") `
    -c $Configuration `
    -r win-x64 `
    --self-contained false `
    -o $publishDir

dotnet publish (Join-Path $root "src\Silent.DownloadManager.NativeHost\Silent.DownloadManager.NativeHost.csproj") `
    -c $Configuration `
    -r win-x64 `
    --self-contained false `
    -o $publishDir

Write-Host "Published to: $publishDir"

