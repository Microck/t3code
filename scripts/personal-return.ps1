# Each release substitutes its exact official source version before publication.
$ErrorActionPreference = "Stop"
$version = "__UPSTREAM_VERSION__"
$installer = Join-Path ([IO.Path]::GetTempPath()) "T3-Code-official-$version-x64.exe"
$url = "https://github.com/pingdotgg/t3code/releases/download/v$version/T3-Code-$version-x64.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UserAgent "OpenAI File Downloader, XaiImageApiFetch/1.0"
if ((Get-AuthenticodeSignature -FilePath $installer).Status -ne "Valid") {
    throw "The official installer signature could not be verified. Nothing was installed."
}
Write-Host "Close T3 Code before continuing in the installer. Chats and settings stay in place."
Start-Process -FilePath $installer -Wait
Write-Host "The official desktop installer has exited. Ashburn is separate; use return-to-official.sh there."
