$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$manifestPath = Join-Path $project '.astro/tool-packages-phase-b/manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$code = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package-browser.js') -Raw -Encoding utf8
$code = $code.Replace('__PACKAGE_FIXTURE__', ($manifest | ConvertTo-Json -Depth 15 -Compress))
$generated = Join-Path $manifest.output 'browser.generated.js'
Set-Content -LiteralPath $generated -Value $code -Encoding utf8
$npxExecutable = (Get-Command npx.cmd -ErrorAction Stop).Source
$session = '-s=tool-packages-linked'
Push-Location -LiteralPath $manifest.run
try {
& $npxExecutable --yes '@playwright/cli@0.1.23' $session open "http://127.0.0.1:$($manifest.devPort)/blog/" --browser chrome | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot open Chrome' }
# Inspect the actual page before executing the locator-based acceptance script.
& $npxExecutable --yes '@playwright/cli@0.1.23' $session snapshot | Set-Content -LiteralPath (Join-Path $manifest.output 'home-snapshot.txt') -Encoding utf8
$transcript = (& $npxExecutable --yes '@playwright/cli@0.1.23' $session run-code --filename $generated) -join "`n"
Set-Content -LiteralPath (Join-Path $manifest.output 'browser-cli.txt') -Value $transcript -Encoding utf8
if ($transcript -notmatch '(?s)### Result\s*\n(.*?)\n### Ran') { throw 'Missing browser report; inspect browser-cli.txt' }
$report = $Matches[1] | ConvertFrom-Json
$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $manifest.output 'browser-report.json') -Encoding utf8
$report.results | Select-Object name,status,error | Format-Table -Wrap
if (@($report.results | Where-Object status -eq 'fail').Count -gt 0) { exit 1 }
Write-Output "PASS: $($report.results.Count) browser checks; $($manifest.output)"
} finally {
  & $npxExecutable --yes '@playwright/cli@0.1.23' $session close | Out-Null
  Pop-Location
}
