$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backend

$python = (Get-Command python -ErrorAction Stop).Source

Write-Host 'Starting Celery worker...'
$worker = Start-Process -FilePath $python `
    -ArgumentList '-m', 'celery', '-A', 'app.celery_app', 'worker', '--loglevel=info', '--pool=solo' `
    -WorkingDirectory $backend `
    -PassThru

Write-Host 'Starting FastAPI server at http://localhost:8000...'
$api = Start-Process -FilePath $python `
    -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '0.0.0.0', '--port', '8000' `
    -WorkingDirectory $backend `
    -PassThru

try {
    Write-Host ''
    Write-Host 'Backend is running. Press Ctrl+C to stop both processes.'
    Wait-Process -Id $api.Id
}
finally {
    if (-not $worker.HasExited) {
        Stop-Process -Id $worker.Id -Force -ErrorAction SilentlyContinue
    }
    if (-not $api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
}
