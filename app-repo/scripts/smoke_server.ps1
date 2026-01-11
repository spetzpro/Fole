$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Resolve-Path returns a PathInfo object, we need the string path
$RepoRoot = (Resolve-Path "$ScriptDir\..\..").Path
$LogFile = Join-Path $ScriptDir "smoke_server.log"
$LogFileErr = Join-Path $ScriptDir "smoke_server.err.log"
$ServerPort = 3000
$BaseUrl = "http://127.0.0.1:$ServerPort"

function Write-Log {
    param([string]$Message)
    $TimeStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$TimeStamp] $Message"
}

try {
    # 1. Cleanup existing server processes
    Write-Log "Checking for existing server processes..."
    # Attempt to find node processes running serverMain
    $ExistingProcesses = Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq 'node.exe' -and $_.CommandLine -like '*serverMain.ts*' 
    }

    if ($ExistingProcesses) {
        Write-Log "Found $($ExistingProcesses.Count) existing server process(es). Killing them..."
        foreach ($proc in $ExistingProcesses) {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    } else {
        Write-Log "No existing server processes found."
    }

    # 2. Start Server
    Write-Log "Starting server (logs: $LogFile)..."
    
    # Use ts-node.cmd directly to avoid npm/npx wrappers
    $TsNodePath = Join-Path $RepoRoot "node_modules\.bin\ts-node.cmd"
    if (-not (Test-Path $TsNodePath)) {
        throw "Could not find ts-node at $TsNodePath"
    }

    # Clean existing log
    if (Test-Path $LogFile) { Remove-Item $LogFile }
    if (Test-Path $LogFileErr) { Remove-Item $LogFileErr }

    $ProcessArgs = @(
        "--project", "tsconfig.json",
        "app-repo/src/server/serverMain.ts"
    )

    $ServerProcess = Start-Process -FilePath $TsNodePath -ArgumentList $ProcessArgs -WorkingDirectory $RepoRoot -RedirectStandardOutput $LogFile -RedirectStandardError $LogFileErr -PassThru -NoNewWindow
    
    if (-not $ServerProcess) {
        throw "Failed to start server process."
    }
    
    $ServerPid = $ServerProcess.Id
    Write-Log "Server started with PID: $ServerPid"

    # 3. Wait for Health
    Write-Log "Waiting for health check..."
    $MaxRetries = 20
    $RetryCount = 0
    $Healthy = $false

    while ($RetryCount -lt $MaxRetries) {
        try {
            $Response = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -ErrorAction Stop
            if ($Response.ok -eq $true) {
                $Healthy = $true
                break
            }
        } catch {
             Write-Host -NoNewline "."
             Start-Sleep -Milliseconds 500
        }
        $RetryCount++
    }
    Write-Host "" # Newline

    if (-not $Healthy) {
        Write-Log "Server failed to become healthy. Dumping log tail:"
        if (Test-Path $LogFile) { Get-Content $LogFile -Tail 10 | ForEach-Object { Write-Log $_ } }
        throw "Server health check timeout."
    }
    Write-Log "Server is healthy!"

    # 4. Run Smoke Tests
    
    # GET /active
    Write-Log "GET /api/config/shell/active"
    try {
        $Active = Invoke-RestMethod -Uri "$BaseUrl/api/config/shell/active" -Method Get
        Write-Log "Current Active Version: $($Active.activeVersionId)"
    } catch {
        Write-Log "No active version found (expected if fresh install)"
    }

    # GET /bundle
    Write-Log "GET /api/config/shell/bundle"
    try {
        $Bundle = Invoke-RestMethod -Uri "$BaseUrl/api/config/shell/bundle" -Method Get
        Write-Log "Retrieved Bundle. Blocks: $($Bundle.bundle.blocks.Count)"
    } catch {
        Write-Log "Bundle fetch failed (expected if no active version)."
    }

    # POST /deploy
    Write-Log "POST /api/config/shell/deploy"
    $DeployPayload = @{
        message = "Smoke Test Deploy $(Get-Date)"
        bundle = @{
            manifest = @{
                schemaVersion = "1.0.0"
                regions = @{
                    top = @{ blockId = "header" }
                    main = @{ blockId = "viewport" }
                    bottom = @{ blockId = "footer" }
                }
            }
            blocks = @{
                header = @{
                    blockId = "header"
                    blockType = "header"
                    schemaVersion = "1.0.0"
                    data = @{ title = "Smoke Test App" }
                }
                viewport = @{
                    blockId = "viewport"
                    blockType = "viewport"
                    schemaVersion = "1.0.0"
                    data = @{ zoom = 1 }
                }
                footer = @{
                    blockId = "footer"
                    blockType = "footer"
                    schemaVersion = "1.0.0"
                    data = @{ copyright = "2027" }
                }
            }
        }
    } | ConvertTo-Json -Depth 10

    try {
        $DeployResponse = Invoke-RestMethod -Uri "$BaseUrl/api/config/shell/deploy" -Method Post -Body $DeployPayload -ContentType "application/json"
        Write-Log "Deploy Success! New Version: $($DeployResponse.activeVersionId)"
        $NewVersionId = $DeployResponse.activeVersionId

        # Verify Active Updated
        Write-Log "Verifying Active Pointer..."
        $ActiveAfter = Invoke-RestMethod -Uri "$BaseUrl/api/config/shell/active" -Method Get
        if ($ActiveAfter.activeVersionId -eq $NewVersionId) {
            Write-Log "Active pointer verified ($NewVersionId)."
        } else {
            throw "Active pointer MISMATCH. Expected $NewVersionId, got $($ActiveAfter.activeVersionId)"
        }
        
    } catch {
        Write-Log "Deploy/Verify Failed: $($_.Exception.Message)"
        if ($_.Exception.Response) {
             $Stream = $_.Exception.Response.GetResponseStream()
             $Reader = New-Object System.IO.StreamReader($Stream)
             Write-Log "Response Body: $($Reader.ReadToEnd())"
        }
        throw
    }

    Write-Log "TESTS PASSED"

} catch {
    Write-Log "TESTS FAILED: $($_.Exception.Message)"
    $exitCode = 1
} finally {
    if ($ServerPid) {
        Write-Log "Stopping server (PID $ServerPid)..."
        Stop-Process -Id $ServerPid -Force -ErrorAction SilentlyContinue
        # Ensure children are killed (ts-node -> node)
        Start-Sleep -Seconds 1
        # Fallback cleanup just in case
        Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ServerPid } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}

if ($exitCode -eq 1) {
    exit 1
}
