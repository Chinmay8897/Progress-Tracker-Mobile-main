<#
.SYNOPSIS
Builds the React Native Android APK locally, bypassing Windows MAX_PATH limits.
#>

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$MainProjectDir = $PSScriptRoot
$ShortBuildDir = "C:\src"

Write-Host "Syncing project to short directory ($ShortBuildDir) to avoid Windows path limits..." -ForegroundColor Cyan

# Stop any running Gradle daemons that might hold locks on node_modules
if (Test-Path "$ShortBuildDir\artifacts\mobile\android\gradlew.bat") {
    Write-Host "Stopping Gradle daemons to release file locks..."
    $OldCwd = Get-Location
    Set-Location "$ShortBuildDir\artifacts\mobile\android"
    .\gradlew.bat --stop
    Set-Location $OldCwd
}

# Sync the project (excluding bloated/unnecessary folders)
# /MIR = Mirror directory tree
# /XD = Exclude directories
# /XF = Exclude files
# /R:1 /W:1 = Retry once, wait 1 second
$RobocopyArgs = @(
    $MainProjectDir,
    $ShortBuildDir,
    "/MIR",
    "/XD", "node_modules", "build", ".git", ".expo", ".idea",
    "/XF", "pnpm-lock.yaml", "app-debug.apk", "app-release.apk",
    "/R:1", "/W:1",
    "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
)

& robocopy $RobocopyArgs
# Robocopy exit codes < 8 are considered success
if ($LASTEXITCODE -ge 8) {
    Write-Error "Failed to sync project to $ShortBuildDir"
    exit 1
}

# Explicitly copy build.gradle since we excluded the android folder
Copy-Item -Path "$MainProjectDir\artifacts\mobile\android\app\build.gradle" -Destination "$ShortBuildDir\artifacts\mobile\android\app\build.gradle" -Force

Write-Host "Checking dependencies..." -ForegroundColor Cyan
Set-Location $ShortBuildDir
pnpm install

Write-Host "Building APK..." -ForegroundColor Cyan
Set-Location "$ShortBuildDir\artifacts\mobile\android"

# Force new CMake version to prevent Ninja bugs globally for all modules
$env:CMAKE_VERSION="3.31.6"
Add-Content -Path "local.properties" -Value "`ncmake.dir=C:/Users/adity/AppData/Local/Android/Sdk/cmake/3.31.6"


Write-Host "Cleaning Gradle caches..." -ForegroundColor Cyan
if (Test-Path ".gradle") { Remove-Item -Recurse -Force .gradle -ErrorAction SilentlyContinue }
if (Test-Path "app\build") { Remove-Item -Recurse -Force "app\build" -ErrorAction SilentlyContinue }
if (Test-Path "build") { Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue }
if (Test-Path "..\.expo") { Remove-Item -Recurse -Force "..\.expo" -ErrorAction SilentlyContinue }
if (Test-Path "$env:TEMP\metro-cache") { Remove-Item -Recurse -Force "$env:TEMP\metro-cache" -ErrorAction SilentlyContinue }
if (Test-Path "$env:TEMP\haste-map-*") { Remove-Item -Recurse -Force "$env:TEMP\haste-map-*" -ErrorAction SilentlyContinue }

# Run Gradle Build (Assemble Debug/Release APK)
$BuildTask = if ($Release) { "assembleRelease" } else { "assembleDebug" }
$ApkName = if ($Release) { "app-release.apk" } else { "app-debug.apk" }

Write-Host "Running Gradle task: $BuildTask" -ForegroundColor Cyan
.\gradlew.bat $BuildTask --no-configuration-cache

if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle build failed!"
    exit $LASTEXITCODE
}

Write-Host "Copying APK back to project folder..." -ForegroundColor Cyan
$ApkSource = if ($Release) {
    "$ShortBuildDir\artifacts\mobile\android\app\build\outputs\apk\release\app-release.apk"
} else {
    "$ShortBuildDir\artifacts\mobile\android\app\build\outputs\apk\debug\app-debug.apk"
}
$ApkDest = "$MainProjectDir\$ApkName"

Copy-Item -Path $ApkSource -Destination $ApkDest -Force

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "SUCCESS! Your APK is ready at: $ApkDest" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
