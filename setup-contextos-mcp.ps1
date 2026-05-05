param(
  [Parameter(Mandatory=$true)]
  [string]$ExtensionId,

  [int]$Port = 19960,

  [switch]$ConfigureCursor = $true
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Get-Location).Path
$HostName = "com.contextprompt.ai"
$NativeDir = Join-Path $RepoRoot "native-host"
$IndexJs = Join-Path $NativeDir "index.js"
$RunBat = Join-Path $NativeDir "run.bat"
$Manifest = Join-Path $NativeDir "manifest.json"
$McpUrl = "http://127.0.0.1:$Port/mcp"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not in PATH."
}
if (-not (Test-Path $IndexJs)) {
  throw "native-host/index.js not found. Run this script from the ContextOS repo root."
}

"@echo off`r`nnode `"$IndexJs`" --port=$Port %*`r`n" | Set-Content -Path $RunBat -Encoding ASCII

$manifestObject = [ordered]@{
  name = $HostName
  description = "ContextOS Native Messaging Host for MCP protocol bridge"
  path = $RunBat
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifestObject | ConvertTo-Json -Depth 10 | Set-Content -Path $Manifest -Encoding UTF8

& reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName" /ve /t REG_SZ /d "$Manifest" /f | Out-Null

function ConvertTo-Hashtable($Object) {
  if ($null -eq $Object) { return $null }
  if ($Object -is [string]) { return $Object }
  if ($Object -is [System.Collections.IEnumerable] -and -not ($Object -is [pscustomobject])) {
    $arr = @()
    foreach ($item in $Object) { $arr += ConvertTo-Hashtable $item }
    return $arr
  }
  if ($Object -is [pscustomobject]) {
    $hash = [ordered]@{}
    foreach ($prop in $Object.PSObject.Properties) {
      $hash[$prop.Name] = ConvertTo-Hashtable $prop.Value
    }
    return $hash
  }
  return $Object
}

function Set-McpJsonServer($Path, $Name, $Server) {
  $Dir = Split-Path $Path -Parent
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null

  if (Test-Path $Path) {
    $Raw = Get-Content -Path $Path -Raw
    if ([string]::IsNullOrWhiteSpace($Raw)) {
      $Cfg = [ordered]@{}
    } else {
      $Cfg = ConvertTo-Hashtable ($Raw | ConvertFrom-Json)
    }
  } else {
    $Cfg = [ordered]@{}
  }

  if (-not $Cfg.Contains("mcpServers") -or $null -eq $Cfg["mcpServers"]) {
    $Cfg["mcpServers"] = [ordered]@{}
  }

  $Cfg["mcpServers"][$Name] = $Server
  $Cfg | ConvertTo-Json -Depth 20 | Set-Content -Path $Path -Encoding UTF8
}

if ($ConfigureCursor) {
  $CursorConfig = Join-Path $HOME ".cursor\mcp.json"
  Set-McpJsonServer $CursorConfig "contextos" ([ordered]@{
    url = $McpUrl
    type = "streamableHttp"
    autoApprove = @(
      "search_papers",
      "get_paper_context",
      "list_recent_papers",
      "search_knowledge",
      "get_context"
    )
    disabled = $false
  })
}

Write-Host "ContextOS MCP setup complete."
Write-Host "Native host: $Manifest"
Write-Host "MCP URL:     $McpUrl"
Write-Host ""
Write-Host "Next: enable MCP Server inside the Chrome extension settings, then restart Cursor/Claude Code."
