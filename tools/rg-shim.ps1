param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $RemainingArgs
)

$ErrorActionPreference = 'SilentlyContinue'

$showFiles = $false
$lineNumber = $false
$ignoreCase = $false
$fixedString = $false
$pattern = $null
$paths = New-Object System.Collections.Generic.List[string]
$includeGlobs = New-Object System.Collections.Generic.List[string]
$excludeGlobs = New-Object System.Collections.Generic.List[string]

for ($index = 0; $index -lt $RemainingArgs.Count; $index++) {
    $arg = $RemainingArgs[$index]

    switch -Regex ($arg) {
        '^--files$' {
            $showFiles = $true
            continue
        }
        '^-n$|^--line-number$' {
            $lineNumber = $true
            continue
        }
        '^-i$|^--ignore-case$' {
            $ignoreCase = $true
            continue
        }
        '^-F$|^--fixed-strings$' {
            $fixedString = $true
            continue
        }
        '^-g$|^--glob$' {
            $index++
            if ($index -lt $RemainingArgs.Count) {
                $glob = $RemainingArgs[$index]
                if ($glob.StartsWith('!')) {
                    $excludeGlobs.Add($glob.Substring(1))
                } else {
                    $includeGlobs.Add($glob)
                }
            }
            continue
        }
        '^--glob=' {
            $glob = $arg.Substring(7)
            if ($glob.StartsWith('!')) {
                $excludeGlobs.Add($glob.Substring(1))
            } else {
                $includeGlobs.Add($glob)
            }
            continue
        }
        '^--color$|^--colors$|^-m$|^--max-count$|^-A$|^-B$|^-C$|^--context$' {
            $index++
            continue
        }
        '^--color=|^--colors=|^--max-count=|^--context=' {
            continue
        }
        '^--hidden$|^--no-heading$|^--heading$|^--smart-case$|^-S$' {
            continue
        }
        '^-.*' {
            continue
        }
        default {
            if (-not $showFiles -and $null -eq $pattern) {
                $pattern = $arg
            } else {
                $paths.Add($arg)
            }
        }
    }
}

$cwd = (Get-Location).Path
$excludedDirs = @('.git', 'pb_data', 'pb_public', 'node_modules', '.next', 'dist', 'build', 'vendor')
$binaryExtensions = @(
    '.7z', '.avif', '.bin', '.bmp', '.db', '.dll', '.exe', '.gif', '.ico', '.jpeg',
    '.jpg', '.pdf', '.png', '.sqlite', '.sqlite3', '.webp', '.zip'
)

function Get-RelativePath {
    param([string] $Path)

    try {
        $base = [System.IO.Path]::GetFullPath($cwd).TrimEnd('\', '/')
        $full = [System.IO.Path]::GetFullPath($Path)

        if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
            return ($full.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/')
        }

        return ($full -replace '\\', '/')
    } catch {
        return ($Path -replace '\\', '/')
    }
}

function Test-RepoFile {
    param(
        [System.IO.FileInfo] $File,
        [bool] $ForSearch
    )

    $relative = Get-RelativePath $File.FullName
    $segments = $relative -split '/'

    foreach ($segment in $segments) {
        if ($excludedDirs -contains $segment) {
            return $false
        }
    }

    foreach ($glob in $excludeGlobs) {
        if ($relative -like ($glob -replace '\\', '/')) {
            return $false
        }
    }

    if ($includeGlobs.Count -gt 0) {
        $included = $false
        foreach ($glob in $includeGlobs) {
            if ($relative -like ($glob -replace '\\', '/')) {
                $included = $true
                break
            }
        }
        if (-not $included) {
            return $false
        }
    }

    if ($ForSearch -and ($binaryExtensions -contains $File.Extension.ToLowerInvariant())) {
        return $false
    }

    return $true
}

function Get-RepoFiles {
    param([bool] $ForSearch)

    $roots = if ($paths.Count -gt 0) { $paths } else { @('.') }

    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        $item = Get-Item -LiteralPath $root -Force
        if ($item -is [System.IO.FileInfo]) {
            if (Test-RepoFile -File $item -ForSearch $ForSearch) {
                $item
            }
            continue
        }

        Get-ChildItem -LiteralPath $item.FullName -Recurse -File -Force |
            Where-Object { Test-RepoFile -File $_ -ForSearch $ForSearch }
    }
}

if ($showFiles) {
    Get-RepoFiles -ForSearch $false | ForEach-Object { Get-RelativePath $_.FullName }
    exit 0
}

if ([string]::IsNullOrEmpty($pattern)) {
    Write-Error 'rg shim: missing search pattern'
    exit 2
}

$found = $false
$selectArgs = @{
    Pattern = $pattern
}

if (-not $ignoreCase) {
    $selectArgs['CaseSensitive'] = $true
}

if ($fixedString) {
    $selectArgs['SimpleMatch'] = $true
}

foreach ($file in (Get-RepoFiles -ForSearch $true)) {
    foreach ($match in (Select-String -LiteralPath $file.FullName @selectArgs)) {
        $found = $true
        $relative = Get-RelativePath $match.Path
        "${relative}:$($match.LineNumber):$($match.Line)"
    }
}

if ($found) {
    exit 0
}

exit 1
