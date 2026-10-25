# Digital Asset Factory for Windows (PowerShell): right-click > Run with PowerShell.
Set-Location -Path $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Get version 26 or newer from https://nodejs.org and run this again.'
  Read-Host 'Press Enter to close'
  exit 1
}
if (-not (Test-Path node_modules)) {
  Write-Host 'First run: installing... this takes a few minutes.'
  npm install
  if ($LASTEXITCODE -ne 0) { Read-Host 'Install failed. Press Enter to close'; exit 1 }
}
Write-Host 'Starting Digital Asset Factory. Leave this window open; close it to stop the app.'
npm start
