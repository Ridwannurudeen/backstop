$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$app = Join-Path $repo "app"
$archive = Join-Path $env:TEMP "backstop-dist.tgz"
$vps = if ($env:BACKSTOP_VPS) { $env:BACKSTOP_VPS } else { "root@75.119.153.252" }
$webroot = if ($env:BACKSTOP_WEBROOT) { $env:BACKSTOP_WEBROOT } else { "/opt/backstop/web" }

Push-Location $app
try {
  npm install
  npm run build
}
finally {
  Pop-Location
}

if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar -czf $archive -C (Join-Path $app "dist") .
scp $archive "${vps}:/tmp/backstop-dist.tgz"
ssh $vps "set -e; mkdir -p $webroot; rm -rf $webroot/*; tar -xzf /tmp/backstop-dist.tgz -C $webroot; rm -f /tmp/backstop-dist.tgz; nginx -t && systemctl reload nginx; echo DEPLOYED"
Remove-Item -LiteralPath $archive -Force
