param(
    [string]$BaseUrl = "https://athletica.emminger-net.de",
    [string]$ExpectedRelease = ""
)

$ErrorActionPreference = "Stop"
$normalizedBaseUrl = $BaseUrl.TrimEnd("/")

function Invoke-WithRetry {
    param(
        [scriptblock]$Operation,
        [int]$Attempts = 5
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            return & $Operation
        }
        catch {
            if ($attempt -eq $Attempts) {
                throw
            }
            Start-Sleep -Seconds 2
        }
    }
}

function Test-Endpoint {
    param(
        [string]$Path,
        [string]$ExpectedStatus
    )

    $response = Invoke-WithRetry {
        Invoke-RestMethod -Uri "$normalizedBaseUrl$Path" -TimeoutSec 10
    }
    if ($response.status -ne $ExpectedStatus) {
        throw "Unexpected status for ${Path}: $($response.status)"
    }
    if ($ExpectedRelease -and $response.release -ne $ExpectedRelease) {
        throw "Unexpected release for ${Path}: $($response.release)"
    }
    Write-Host "OK  $Path  status=$($response.status)  release=$($response.release)"
}

Test-Endpoint -Path "/health/live" -ExpectedStatus "ok"
Test-Endpoint -Path "/health/ready" -ExpectedStatus "ready"

$page = Invoke-WithRetry {
    Invoke-WebRequest -Uri $normalizedBaseUrl -TimeoutSec 10
}
if ($page.Content -notmatch "Athletica Log") {
    throw "The application page did not contain the expected title."
}
Write-Host "OK  /  Athletica Log is reachable"
