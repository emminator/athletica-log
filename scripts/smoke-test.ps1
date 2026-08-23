param(
    [string]$BaseUrl = "https://athletica.emminger-net.de",
    [string]$ExpectedRelease = ""
)

$ErrorActionPreference = "Stop"
$normalizedBaseUrl = $BaseUrl.TrimEnd("/")

function Invoke-HttpGet {
    param(
        [string]$Uri,
        [int]$Attempts = 3
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 10 -SkipHttpErrorCheck
        }
        catch {
            if ($attempt -eq $Attempts) {
                throw
            }
            Start-Sleep -Seconds 2
            continue
        }

        $statusCode = [int]$response.StatusCode
        if ($statusCode -eq 200) {
            return $response
        }
        if ($statusCode -ge 500 -and $attempt -lt $Attempts) {
            Start-Sleep -Seconds 2
            continue
        }
        throw "Unexpected HTTP status for ${Uri}: $statusCode"
    }
}

function Test-Endpoint {
    param(
        [string]$Path,
        [string]$ExpectedStatus
    )

    $response = Invoke-HttpGet -Uri "$normalizedBaseUrl$Path"
    $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
    if ($payload.status -ne $ExpectedStatus) {
        throw "Unexpected application status for ${Path}: $($payload.status)"
    }
    if ($ExpectedRelease -and $payload.release -ne $ExpectedRelease) {
        throw "Unexpected release for ${Path}: $($payload.release)"
    }
    Write-Host "OK  $Path  http=$($response.StatusCode)  status=$($payload.status)  release=$($payload.release)"
}

Test-Endpoint -Path "/health/live" -ExpectedStatus "ok"
Test-Endpoint -Path "/health/ready" -ExpectedStatus "ready"

$page = Invoke-HttpGet -Uri $normalizedBaseUrl
if ($page.Content -notmatch "Athletica Log") {
    throw "The application page did not contain the expected title."
}
Write-Host "OK  /  Athletica Log is reachable"
