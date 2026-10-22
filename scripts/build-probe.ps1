$ErrorActionPreference = 'Stop'
$probeDir = Join-Path $PSScriptRoot '..\artifacts\中文 空格'
New-Item -ItemType Directory -Force -Path $probeDir | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /platform:x64 /target:exe /reference:System.Web.Extensions.dll "/out:$probeDir\RegionProbe.exe" "$PSScriptRoot\..\tests\windows-integration\RegionProbe.cs"
if ($LASTEXITCODE -ne 0) { throw 'Probe compilation failed' }
