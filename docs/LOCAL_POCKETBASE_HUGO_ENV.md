# Local PocketBase and Hugo Environment Guard

These notes prevent the local Windows/Codex environment from building Hugo against the wrong PocketBase data directory.

## Failure This Prevents

If PocketBase is started with the wrong data path, the REST API can return missing collections or empty data during `hugo --ignoreCache`.

Observed failure shape:

```text
GET /api/collections/products/records?... -> 404 Missing collection context
```

When Hugo builds in that state, `resources.GetRemote` receives invalid product data. Static output in `pb_public/` can then be generated without data-backed sections such as product recommendations, even though the JavaScript function definitions still exist in the generated HTML.

Do not treat a script definition such as `productRecommendationCarousel(total, intervalMs)` as proof that the rendered section exists. Check for the actual static markup, for example `id="recommended-products"` or `data-recommendation-id`.

## Correct Local Paths

The active PocketBase runtime directories are at the repository root:

```text
pb_data/
pb_hooks/
pb_migrations/
pb_public/
```

Do not start PocketBase with these paths:

```text
pocketbase/pb_data
pocketbase/pb_hooks
pocketbase/pb_migrations
```

Using `pocketbase/pb_data` can silently create a fresh empty database in the wrong location. That fresh DB will not have the expected collections or records.

## Start PocketBase Locally

In this Windows/Codex desktop environment, the restored local PATH shim makes the old short command safe again from the repository root:

```bash
tools\windows\start-pocketbase.cmd
```

The helper probes `127.0.0.1` for a usable local port, prefers `8090` when available, and prints the actual storefront/CMS/Admin URLs it selected. If `8090` is blocked by another process or by a Windows excluded-port range, it will automatically move to the next usable port.

If you want to force a specific port, pass it explicitly:

```bash
tools\windows\start-pocketbase.cmd -Port 8400
```

PowerShell resolves `pocketbase` to:

```text
C:\Users\Droll\.local\bin\pocketbase.cmd
```

Git Bash resolves `pocketbase` to:

```text
/c/Users/Droll/.local/bin/pocketbase
```

Those local-only shims are ignored by git. When the current directory contains root-level `pb_data/`, `pb_hooks/`, `pb_migrations/`, and `pb_public/`, they call the installed PocketBase v0.36.9 binary and automatically append the matching project paths:

```text
--dir=<repo>\pb_data
--hooksDir=<repo>\pb_hooks
--migrationsDir=<repo>\pb_migrations
--publicDir=<repo>\pb_public
```

If command discovery does not find the shim first, or when running in a service/deployment environment, use the full PocketBase executable path and explicit root-level runtime directories:

```bash
PB_BIN="/d/A/설치완료/pocketbase_0.36.9_windows_amd64/pocketbase"
ROOT="D:\\cod\\codex\\server_01\\git_win"

"$PB_BIN" serve \
  --dev \
  --indexFallback=false \
  --http=127.0.0.1:<selected-port> \
  --dir="$ROOT\\pb_data" \
  --hooksDir="$ROOT\\pb_hooks" \
  --migrationsDir="$ROOT\\pb_migrations" \
  --publicDir="$ROOT\\pb_public"
```

For background QA runs, keep logs outside the repository:

```bash
mkdir -p /c/tmp/server_01_qa
nohup "$PB_BIN" serve \
  --dev \
  --indexFallback=false \
  --http=127.0.0.1:<selected-port> \
  --dir="$ROOT\\pb_data" \
  --hooksDir="$ROOT\\pb_hooks" \
  --migrationsDir="$ROOT\\pb_migrations" \
  --publicDir="$ROOT\\pb_public" \
  > /c/tmp/server_01_qa/pb-serve-<selected-port>.log \
  2> /c/tmp/server_01_qa/pb-serve-<selected-port>.err.log &
```

For PowerShell background QA runs, either call the helper with `-Background` from the repository root or pass the explicit executable path with the same project directory flags. Keep logs outside the repo.

## Pre-Build Checks

Before running Hugo, verify the API is reading the correct database on the port the helper printed:

```bash
curl -s -w '\n%{http_code}\n' \
  'http://127.0.0.1:<selected-port>/api/collections/products/records?sort=sort_order&expand=category&limit=1000' \
  | head -20
```

Expected:

```text
{"items":[...products...]}
200
```

Stop and fix PocketBase startup paths if the response is:

```text
404 Missing collection context
```

or if `items` is unexpectedly empty for a database that should have products.

## Hugo Build

Run Hugo from the `hugo/` directory only after the API check passes:

```bash
cd hugo
hugo --ignoreCache
```

If a template must fetch PocketBase through a non-default URL, set it explicitly for that build:

```bash
HUGO_POCKETBASE_INTERNAL_URL="http://127.0.0.1:<selected-port>/" hugo --ignoreCache
```

After building, verify the generated static output contains real data-backed markup, not just JavaScript helpers:

```bash
cd ..
grep -n 'recommended-products\|data-recommendation-id' pb_public/products/bmw-keychain/index.html | head
```

The `cd ..` returns from `hugo/` to the repository root. Adjust the product path or marker to match the feature being checked.

## Recovery Procedure

If Hugo was built while PocketBase used the wrong DB:

1. Stop the bad PocketBase process on the selected local port:

   ```bash
   pid=$(netstat -ano | grep '127.0.0.1:<selected-port>' | grep LISTENING | awk '{print $5}' | head -1)
   if [ -n "$pid" ]; then taskkill //PID "$pid" //F; fi
   ```

2. Restart PocketBase with root-level `pb_data`, `pb_hooks`, `pb_migrations`, and `pb_public`.

3. Re-run the API check until it returns product data and `200`.

4. Re-run `hugo --ignoreCache` from `hugo/`.

5. Re-check generated HTML for the actual rendered section or records.

6. If a mistaken `pocketbase/pb_data` directory was created, delete it only after confirming no running process is using it and after verifying the resolved path is inside this workspace:

   ```powershell
   $root = (Resolve-Path -LiteralPath 'D:\cod\codex\server_01\git_win').Path
   $target = Resolve-Path -LiteralPath 'D:\cod\codex\server_01\git_win\pocketbase\pb_data' -ErrorAction SilentlyContinue
   if ($target -and $target.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
     Remove-Item -LiteralPath $target.Path -Recurse -Force
   }
   ```

Never remove the root-level `pb_data/` directory as part of this cleanup.

## Quick Checklist

- PocketBase is serving from root-level `pb_data/`.
- `GET /api/collections/products/records?...` returns `200` and expected products.
- Hugo is run with `--ignoreCache`.
- Generated `pb_public/` contains the actual data-backed markup.
- Temporary logs stay under `C:\tmp`, not the repository.
