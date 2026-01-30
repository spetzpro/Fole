$ErrorActionPreference = "Stop"

$repoRoot = "e:\Fole\app-repo"
$archiveDir = "$repoRoot\config\shell\archive"
$currentVersionId = "v1769713594771"
$currentVersionPath = "$archiveDir\$currentVersionId"

# 1. Preparation
$timestamp = Get-Date -Format "yyyyMMddHHmmssfff"
$newVersionId = "v$timestamp"
$newVersionPath = "$archiveDir\$newVersionId"
$newBundlePath = "$newVersionPath\bundle"

Write-Host "Creating new version: $newVersionId"

New-Item -ItemType Directory -Path $newBundlePath -Force | Out-Null

# Copy files
Copy-Item "$currentVersionPath\bundle\*" -Destination $newBundlePath -Force
if (Test-Path "$currentVersionPath\meta.json") {
    Copy-Item "$currentVersionPath\meta.json" -Destination "$newVersionPath\meta.json"
}
if (Test-Path "$currentVersionPath\validation.json") {
    Copy-Item "$currentVersionPath\validation.json" -Destination "$newVersionPath\validation.json"
}

# 2. Transformations
# Load Manifest
$manifestPath = "$newBundlePath\shell.manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
# Update Regions
if (-not $manifest.regions) { $manifest | Add-Member -MemberType NoteProperty -Name "regions" -Value @{} }
if (-not $manifest.regions.header) { $manifest.regions | Add-Member -MemberType NoteProperty -Name "header" -Value @{ blockId = "header" } }
if (-not $manifest.regions.footer) { $manifest.regions | Add-Member -MemberType NoteProperty -Name "footer" -Value @{ blockId = "footer" } }
if (-not $manifest.regions.viewport) { $manifest.regions | Add-Member -MemberType NoteProperty -Name "viewport" -Value @{ blockId = "viewport" } }

$manifest | ConvertTo-Json -Depth 20 | Set-Content $manifestPath

# Viewport
$oldViewportPath = "$newBundlePath\viewport.json"
$rulesPath = "$newBundlePath\viewport-rules.json"
Rename-Item $oldViewportPath "viewport-rules.json"

$rulesJson = Get-Content $rulesPath -Raw | ConvertFrom-Json
$rulesJson.blockId = "viewport-rules"
$rulesJson | ConvertTo-Json -Depth 20 | Set-Content $rulesPath

# Create new viewport.json
$newViewportJson = [ordered]@{
    blockId = "viewport"
    blockType = "shell.region.viewport"
    schemaVersion = "1.0.0"
    data = [ordered]@{
        rulesId = "viewport-rules"
        contentRootId = "root-container"
    }
    filename = "viewport.json"
}
$newViewportJson | ConvertTo-Json -Depth 20 | Set-Content "$newBundlePath\viewport.json"

# UI Graph - root-container
$rootContainerJson = [ordered]@{
    blockId = "root-container"
    blockType = "ui.node.container"
    schemaVersion = "1.0.0"
    data = [ordered]@{
        id = "root-container"
        type = "container"
        direction = "column"
        children = @(
            @{ blockId = "v2-welcome-text" }
        )
    }
    filename = "root-container.json"
}
$rootContainerJson | ConvertTo-Json -Depth 20 | Set-Content "$newBundlePath\root-container.json"

# UI Graph - v2-welcome-text
$welcomeTextJson = [ordered]@{
    blockId = "v2-welcome-text"
    blockType = "ui.node.text"
    schemaVersion = "1.0.0"
    data = [ordered]@{
        id = "v2-welcome-text"
        type = "text"
        content = "Hello from v2 bridge"
        helpText = ""
        requiredPermission = ""
    }
    filename = "v2-welcome-text.json"
}
$welcomeTextJson | ConvertTo-Json -Depth 20 | Set-Content "$newBundlePath\v2-welcome-text.json"

# Window Manager
$windowManagerJson = [ordered]@{
    blockId = "window_manager"
    blockType = "ui.node.window"
    schemaVersion = "1.0.0"
    data = [ordered]@{
        id = "window_manager"
        type = "window"
        title = "Window Manager"
        dockable = $true
        children = @(
            @{ blockId = "root-container" }
        )
        helpText = ""
        requiredPermission = ""
    }
    filename = "window_manager.json"
}
$windowManagerJson | ConvertTo-Json -Depth 20 | Set-Content "$newBundlePath\window_manager.json"

# 3. Metadata
$metaPath = "$newVersionPath\meta.json"
if (Test-Path $metaPath) {
    $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
    # Use Add-Member -Force to update or add properties
    $meta | Add-Member -MemberType NoteProperty -Name "versionId" -Value $newVersionId -Force
    $meta | Add-Member -MemberType NoteProperty -Name "timestamp" -Value (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ") -Force
    
    $meta | ConvertTo-Json -Depth 10 | Set-Content $metaPath
} else {
    # Create dummy if missing, though typically expected
    [ordered]@{
        versionId = $newVersionId
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        description = "Auto-generated v2 bridge"
    } | ConvertTo-Json -Depth 10 | Set-Content $metaPath
}

# 4. Final Output
Write-Host "New Version Location:"
Write-Host $newVersionPath