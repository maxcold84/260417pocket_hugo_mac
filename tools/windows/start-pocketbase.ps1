[CmdletBinding()]
param(
    [int] $Port = 0,
    [int] $StartPort = 8090,
    [int] $EndPort = 8999,
    [switch] $Background,
    [string] $LogDir = 'C:\tmp\server_01_qa'
)

$ErrorActionPreference = 'Stop'

function Resolve-PocketBasePath {
    try {
        return (Get-Command pocketbase -ErrorAction Stop).Source
    } catch {
        $repoBinary = Join-Path $script:RepoRoot 'pocketbase.exe'
        if (Test-Path -LiteralPath $repoBinary) {
            return $repoBinary
        }

        throw 'PocketBase command was not found. Install PocketBase or make the local shim available first.'
    }
}

function Test-PortUsable {
    param(
        [Parameter(Mandatory = $true)]
        [int] $CandidatePort
    )

    $listener = $null

    try {
        $address = [System.Net.IPAddress]::Parse('127.0.0.1')
        $listener = [System.Net.Sockets.TcpListener]::new($address, $CandidatePort)
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            try {
                $listener.Stop()
            } catch {
            }
        }
    }
}

function Resolve-Port {
    if ($Port -gt 0) {
        if (Test-PortUsable -CandidatePort $Port) {
            return $Port
        }

        throw "Requested port $Port is not usable on 127.0.0.1."
    }

    for ($candidate = $StartPort; $candidate -le $EndPort; $candidate++) {
        if (Test-PortUsable -CandidatePort $candidate) {
            return $candidate
        }
    }

    throw "No usable port found in range $StartPort-$EndPort."
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pocketbasePath = Resolve-PocketBasePath
$selectedPort = Resolve-Port
$baseUrl = "http://127.0.0.1:$selectedPort"
$args = @(
    'serve',
    '--dev',
    '--indexFallback=false',
    "--http=127.0.0.1:$selectedPort"
)

if (-not $pocketbasePath.EndsWith('.cmd', [System.StringComparison]::OrdinalIgnoreCase)) {
    $args += @(
        "--dir=$RepoRoot\pb_data",
        "--hooksDir=$RepoRoot\pb_hooks",
        "--migrationsDir=$RepoRoot\pb_migrations",
        "--publicDir=$RepoRoot\pb_public"
    )
}

Write-Host "Repository: $RepoRoot"
Write-Host "PocketBase: $pocketbasePath"

if ($Port -eq 0 -and $selectedPort -ne 8090) {
    Write-Host "Selected next available port because 8090 was unavailable: $selectedPort"
} else {
    Write-Host "Selected port: $selectedPort"
}

Write-Host "Storefront: $baseUrl/"
Write-Host "CMS: $baseUrl/cms/"
Write-Host "Admin: $baseUrl/_/"

if ($Background) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

    $outLog = Join-Path $LogDir "pb-serve-$selectedPort.out.log"
    $errLog = Join-Path $LogDir "pb-serve-$selectedPort.err.log"

    if (Test-Path -LiteralPath $outLog) {
        Remove-Item -LiteralPath $outLog -Force
    }

    if (Test-Path -LiteralPath $errLog) {
        Remove-Item -LiteralPath $errLog -Force
    }

    $process = Start-Process -FilePath $pocketbasePath -ArgumentList $args -WorkingDirectory $RepoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3

    if ($process.HasExited) {
        $stdout = if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Raw } else { '' }
        $stderr = if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Raw } else { '' }
        throw "PocketBase exited immediately on port $selectedPort.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
    }

    Write-Host "PID: $($process.Id)"
    Write-Host "Logs: $outLog"
    Write-Host "Run the CMS rebuild once if you want generated local absolute URLs to match this port."
    exit 0
}

Push-Location $RepoRoot

try {
    & $pocketbasePath @args
} finally {
    Pop-Location
}
