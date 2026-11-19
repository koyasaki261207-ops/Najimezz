param(
    [ValidateSet("release", "dev")]
    [string]$Mode = "release",
    [string]$ShortcutName = "Nusa",
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$desktopDir  = [Environment]::GetFolderPath("Desktop")
$iconPath    = Join-Path $projectRoot "src-tauri\icons\icon.ico"

if (-not (Test-Path $iconPath) -or ((Get-Item $iconPath).Length -lt 512)) {
    Write-Host "Generating application icons..."
    Push-Location $projectRoot
    try {
        & npm run generate:icons
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to generate icons via 'npm run generate:icons'."
        }
    } finally {
        Pop-Location
    }
}

$wsh = New-Object -ComObject WScript.Shell

if ($Mode -eq "release") {
    $exePath = Join-Path $projectRoot "src-tauri\target\release\nusa.exe"

    if ($Rebuild -or -not (Test-Path $exePath)) {
        Write-Host "Building standalone executable..."
        Get-Process -Name "nusa" -ErrorAction SilentlyContinue | Stop-Process -Force
        Push-Location $projectRoot
        try {
            & npm run build:exe
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to build executable via 'npm run build:exe'."
            }
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $exePath)) {
        $fallbackExe = Get-ChildItem -Path (Join-Path $projectRoot "src-tauri\target\release") -Filter "*.exe" -File |
            Where-Object { $_.Name -notlike "*build-script*" } |
            Select-Object -First 1
        if ($null -eq $fallbackExe) {
            throw "Could not locate compiled release .exe in src-tauri\target\release."
        }
        $exePath = $fallbackExe.FullName
    }

    $desktopDirs = @($desktopDir)
    $localDesktop = "C:\Users\$env:USERNAME\Desktop"
    if ((Test-Path $localDesktop) -and ($localDesktop -ne $desktopDir)) {
        $desktopDirs += $localDesktop
    }

    foreach ($dir in $desktopDirs) {
        $shortcutPath = Join-Path $dir "$ShortcutName.lnk"
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $exePath
        $shortcut.WorkingDirectory = Split-Path -Parent $exePath
        $shortcut.Description = "Launch Nusa Floating Notch"
        if (Test-Path $iconPath) {
            $shortcut.IconLocation = "$iconPath,0"
        }
        $shortcut.Save()
        Write-Host "Created Desktop shortcut (Release): $shortcutPath"
    }
    Write-Host "Target: $exePath"
} else {
    $vbsPath = Join-Path $projectRoot "scripts\launch-dev.vbs"
    if (-not (Test-Path $vbsPath)) {
        throw "Missing launcher script: $vbsPath"
    }

    $wscriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
    $desktopDirs = @($desktopDir)
    $localDesktop = "C:\Users\$env:USERNAME\Desktop"
    if ((Test-Path $localDesktop) -and ($localDesktop -ne $desktopDir)) {
        $desktopDirs += $localDesktop
    }

    foreach ($dir in $desktopDirs) {
        $shortcutPath = Join-Path $dir "$ShortcutName (Dev).lnk"
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $wscriptExe
        $shortcut.Arguments = "`"$vbsPath`""
        $shortcut.WorkingDirectory = $projectRoot
        $shortcut.Description = "Launch Nusa Floating Notch in Dev Mode (Silent)"
        if (Test-Path $iconPath) {
            $shortcut.IconLocation = "$iconPath,0"
        }
        $shortcut.Save()
        Write-Host "Created Desktop shortcut (Dev): $shortcutPath"
    }
    Write-Host "Target: $wscriptExe `"$vbsPath`""
}
