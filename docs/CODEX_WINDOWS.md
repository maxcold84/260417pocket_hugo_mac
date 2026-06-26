# Codex Windows Desktop Notes

These notes apply only when working from the Codex desktop app on Windows. They are local tooling notes, not project runtime or deployment requirements.

## ripgrep Access Denied

In some Codex Windows desktop sessions, `rg` resolves to the bundled app resource path:

```text
C:\Program Files\WindowsApps\OpenAI.Codex_...\app\resources\rg.exe
```

That binary can fail to start with `Access is denied`. If this happens once, treat ripgrep as unavailable for that session and do not retry the same failing command repeatedly.

## Search Fallbacks

Use PowerShell search directly when ripgrep is unavailable:

```powershell
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern 'pattern'
```

Exclude generated/runtime-heavy directories unless the task specifically needs them:

```text
.git/
pb_data/
pb_public/
node_modules/
dist/
build/
```

## Local rg Shim

This repo includes a limited Windows shim for common agent search commands:

```text
tools/rg.cmd
tools/rg-shim.ps1
```

It supports the common cases used during coding work:

```powershell
rg --files
rg --files -g '*.md'
rg -n 'routerAdd' pb_hooks -g '*.js'
rg -i -n 'pattern' docs
rg -F -n 'literal text' docs
```

Treat the shim as a narrow compatibility helper, not full ripgrep compatibility. If a command needs advanced ripgrep behavior, use PowerShell directly or install a normal `rg.exe` outside the WindowsApps package path.

When using PowerShell, quote glob arguments such as `-g '*.js'`. Unquoted globs may be expanded by the shell before the shim sees them.

## Optional PATH Setup

To prefer the shim over the inaccessible WindowsApps `rg`, copy both shim files into a user PATH directory that appears before the Codex app resources path:

```powershell
Copy-Item -LiteralPath .\tools\rg.cmd,.\tools\rg-shim.ps1 -Destination "$env:USERPROFILE\.local\bin" -Force
where.exe rg
```

The first `where.exe rg` result should be the user PATH shim, not the WindowsApps path.
