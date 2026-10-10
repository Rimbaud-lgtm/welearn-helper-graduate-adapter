param()
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    & node tools/build.cjs
    if($LASTEXITCODE -ne 0){throw 'Build failed'}
    $bundle=Join-Path $projectRoot 'dist/edge'
    $manifest=Get-Content -Raw (Join-Path $bundle 'manifest.json') | ConvertFrom-Json
    $allowed=@('background.js','capabilities.js','catalog-adapter.js','content.js','core.js','dom-adapter.js','legacy-adapter.js','manifest.json','options.html','options.js','popup.html','popup.js','ui.css','INSTALL.md','LICENSE','icons/16.png','icons/48.png','icons/128.png')
    $actual=@(Get-ChildItem -LiteralPath $bundle -Recurse -File | ForEach-Object {[IO.Path]::GetRelativePath($bundle,$_.FullName).Replace('\','/')})
    if(Compare-Object ($allowed|Sort-Object) ($actual|Sort-Object)){throw 'Unexpected or missing bundle files; inspect before publishing'}
    $releaseDir=Join-Path $projectRoot 'releases'
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    $filename='welearn-edge-'+$manifest.version_name+'.zip'
    $archive=Join-Path $releaseDir $filename
    Compress-Archive -Path (Join-Path $bundle '*') -DestinationPath $archive -Force
    $digest=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($archive+'.sha256',"$digest  $filename`n",[Text.Encoding]::ASCII)
    [PSCustomObject]@{Version=$manifest.version_name;Archive=$archive;SHA256=$digest;Files=$actual.Count}
} finally { Pop-Location }
