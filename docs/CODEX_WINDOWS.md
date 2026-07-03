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

This workspace may include local-only Windows shim files for common agent search commands. They are ignored by git and are not required for the project to run:

```text
tools/windows/rg.cmd
tools/windows/rg-shim.ps1
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

If these local shim files exist and you want to prefer them over the inaccessible WindowsApps `rg`, copy both files into a user PATH directory that appears before the Codex app resources path:

```powershell
Copy-Item -LiteralPath .\tools\windows\rg.cmd,.\tools\windows\rg-shim.ps1 -Destination "$env:USERPROFILE\.local\bin" -Force
where.exe rg
```

The first `where.exe rg` result should be the user PATH shim, not the WindowsApps path.

## Local PocketBase Shim

This workstation uses local-only PocketBase shims so `pocketbase serve` works from the repository root even when the installed PocketBase binary lives outside the repo:

```text
C:\Users\Droll\.local\bin\pocketbase.cmd
C:\Users\Droll\.local\bin\pocketbase
```

Expected command discovery:

```powershell
where.exe pocketbase
```

The first entries should be the `.local\bin` shims, before the installed `pocketbase.exe`. The shims are not tracked by git. When run from a directory containing `pb_data/`, `pb_hooks/`, `pb_migrations/`, and `pb_public/`, they invoke PocketBase with explicit project runtime paths so the homepage is served from this repository's `pb_public/`.

If `pocketbase serve` returns `404 File not found` for `/`, check command discovery first. A direct call to an installed binary outside the repo may default `--dir` and `--publicDir` to the binary installation directory instead of this workspace.
