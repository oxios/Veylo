param(
  [string]$BaseUrl = "http://127.0.0.1:5173",
  [string]$Email = "owner@venueflow.local",
  [Parameter(Mandatory = $true)][string]$Password,
  [Parameter(Mandatory = $true)][string]$PdfPath,
  [switch]$KeepData
)

$ErrorActionPreference = "Stop"
$locationId = "smoke-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

try {
  $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
  $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $webSession
  if ($login.user.email -ne $Email) { throw "Unexpected login user" }

  $me = Invoke-RestMethod -Uri "$BaseUrl/api/auth/me" -WebSession $webSession
  if ($me.user.role -ne "owner") { throw "Owner role was not returned" }

  $locationBody = @{
    id = $locationId
    name = "Smoke Test Cafe"
    city = "Kyiv"
    address = "Testna 1"
    format = "Coffee shop"
    timezone = "Europe/Kyiv UTC+3"
    capacity = 60
    businessHours = "08:00-22:00"
    coordinates = @{ lat = 50.4501; lng = 30.5234 }
  } | ConvertTo-Json -Compress
  $created = Invoke-RestMethod -Uri "$BaseUrl/api/locations" -Method Post -ContentType "application/json" -Body $locationBody -WebSession $webSession
  $floorId = $created.floor.id
  if (-not $floorId) { throw "Default floor was not created" }

  $zoneBody = @{ name = "Main hall"; type = "Dining"; capacity = 30; coverage = 0; left = 8; top = 10; width = 54; height = 58 } | ConvertTo-Json -Compress
  $zone = Invoke-RestMethod -Uri "$BaseUrl/api/floors/$floorId/zones" -Method Post -ContentType "application/json" -Body $zoneBody -WebSession $webSession
  if (-not $zone.zone.id) { throw "Zone was not created" }

  $elementsBody = @{ elements = @(
    @{ id = "smoke-table-1"; floor = "1"; kind = "table"; x = 20; y = 25; width = 7; height = 8; rotation = 0; label = "Table 1" },
    @{ id = "smoke-door-1"; floor = "1"; kind = "door"; x = 8; y = 70; width = 9; height = 3; rotation = 0; label = "Main door" }
  ) } | ConvertTo-Json -Depth 5 -Compress
  $savedPlan = Invoke-RestMethod -Uri "$BaseUrl/api/floors/$floorId/plan/elements" -Method Put -ContentType "application/json" -Body $elementsBody -WebSession $webSession
  if ($savedPlan.planElements.Count -ne 2) { throw "Plan elements were not persisted" }

  $resolvedPdf = (Resolve-Path $PdfPath).Path
  $authCookie = $webSession.Cookies.GetCookies([Uri]$BaseUrl)["venueflow_token"].Value
  if (-not $authCookie) { throw "Authentication cookie was not set" }
  $importRaw = & curl.exe --silent --show-error --fail-with-body -H "Cookie: venueflow_token=$authCookie" -F "plan=@$resolvedPdf;type=application/pdf" "$BaseUrl/api/floors/$floorId/plan/import-pdf"
  if ($LASTEXITCODE -ne 0) { throw "PDF upload failed`n$importRaw" }
  $import = $importRaw | ConvertFrom-Json
  if ($import.importSummary.generatedElements -lt 4) { throw "PDF auto-layout generated too few elements" }
  if (-not $import.planPdfUrl) { throw "PDF stream URL was not returned" }

  $downloadedPdf = Join-Path $env:TEMP ("venueflow-plan-" + [guid]::NewGuid().ToString("N") + ".pdf")
  & curl.exe --silent --show-error --fail-with-body -H "Cookie: venueflow_token=$authCookie" -o $downloadedPdf "$BaseUrl$($import.planPdfUrl)"
  if ($LASTEXITCODE -ne 0) { throw "Stored PDF download failed" }
  $signature = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($downloadedPdf)[0..4])
  Remove-Item -LiteralPath $downloadedPdf -Force
  if ($signature -ne "%PDF-") { throw "Stored PDF has an invalid signature" }

  $reloaded = Invoke-RestMethod -Uri "$BaseUrl/api/floors/$floorId/plan" -WebSession $webSession
  if ($reloaded.planElements.Count -lt 4 -or -not $reloaded.planPdfUrl) { throw "Reloaded plan is incomplete" }

  [pscustomobject]@{
    login = "ok"
    location = $created.location.id
    floor = $floorId
    zone = $zone.zone.id
    generatedElements = $import.importSummary.generatedElements
    generatedZones = $import.importSummary.generatedZones
    storedPdf = "ok"
  }
}
finally {
  if (-not $KeepData -and $locationId) {
    try { Invoke-RestMethod -Uri "$BaseUrl/api/locations/$locationId" -Method Delete -WebSession $webSession | Out-Null } catch { }
  }
}
