param(
    [Parameter(Mandatory = $true)][string]$BuildTools,
    [Parameter(Mandatory = $true)][string]$AndroidJar,
    [Parameter(Mandatory = $true)][string]$OutputApk
)
$ErrorActionPreference = 'Stop'
$BuildTools = (Resolve-Path -LiteralPath $BuildTools).Path
$AndroidJar = (Resolve-Path -LiteralPath $AndroidJar).Path
$OutputApk = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputApk)
$stage = Join-Path $env:TEMP ('cup-recall-build-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path "$stage/classes", "$stage/dex", "$stage/res", "$stage/assets"
Copy-Item -LiteralPath "$PSScriptRoot/AndroidManifest.xml" -Destination "$stage/AndroidManifest.xml"
Copy-Item -Path "$PSScriptRoot/res/*" -Destination "$stage/res" -Recurse
Copy-Item -Path "$PSScriptRoot/assets/*" -Destination "$stage/assets"
Copy-Item -LiteralPath "$PSScriptRoot/src/com/recall/coffeenotes/MainActivity.java" -Destination "$stage/MainActivity.java"

function Invoke-Checked($Executable, $Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE" }
}

Invoke-Checked "$BuildTools/aapt2.exe" @('compile', '--dir', "$stage/res", '-o', "$stage/resources.zip")
Invoke-Checked "$BuildTools/aapt2.exe" @('link', '-I', $AndroidJar, '--manifest', "$stage/AndroidManifest.xml", '-A', "$stage/assets", '-o', "$stage/unsigned.apk", "$stage/resources.zip")
Invoke-Checked 'javac' @('--release', '8', '-encoding', 'UTF-8', '-classpath', $AndroidJar, '-d', "$stage/classes", "$stage/MainActivity.java")
Invoke-Checked 'jar' @('cf', "$stage/classes.jar", '-C', "$stage/classes", '.')
Invoke-Checked "$BuildTools/d8.bat" @('--min-api', '23', '--lib', $AndroidJar, '--output', "$stage/dex", "$stage/classes.jar")
Push-Location "$stage/dex"
try { Invoke-Checked 'jar' @('uf', "$stage/unsigned.apk", 'classes.dex') }
finally { Pop-Location }
Invoke-Checked "$BuildTools/zipalign.exe" @('-f', '4', "$stage/unsigned.apk", "$stage/aligned.apk")

$keyDir = Join-Path $env:LOCALAPPDATA 'CupRecall'
$null = New-Item -ItemType Directory -Force -Path $keyDir
$key = Join-Path $keyDir 'development-signing.p12'
if (!(Test-Path -LiteralPath $key)) {
    Invoke-Checked 'keytool' @('-genkeypair', '-keystore', $key, '-storetype', 'PKCS12', '-storepass', 'android', '-alias', 'cuprecall', '-dname', 'CN=Cup Recall Development', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000')
}

$null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputApk)
Invoke-Checked "$BuildTools/apksigner.bat" @('sign', '--ks', $key, '--ks-key-alias', 'cuprecall', '--ks-pass', 'pass:android', '--out', "$stage/cup-recall.apk", "$stage/aligned.apk")
Invoke-Checked "$BuildTools/apksigner.bat" @('verify', '--verbose', "$stage/cup-recall.apk")
Invoke-Checked "$BuildTools/zipalign.exe" @('-c', '4', "$stage/cup-recall.apk")
Copy-Item -LiteralPath "$stage/cup-recall.apk" -Destination $OutputApk -Force
Write-Output $OutputApk
