$ErrorActionPreference = 'Stop'
$r = Invoke-RestMethod 'https://registry.npmjs.org/pi-purge'
'--- versions ---'
$r.versions.PSObject.Properties.Name
'--- dist-tags ---'
$r.'dist-tags' | ConvertTo-Json -Compress
'--- time ---'
$r.time.PSObject.Properties | ForEach-Object { "$($_.Name) = $($_.Value)" }
