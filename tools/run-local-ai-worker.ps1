$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location $projectPath

node --env-file=.env.local tools/bellore-local-ai-worker.mjs
