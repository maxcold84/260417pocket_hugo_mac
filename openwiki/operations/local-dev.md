# Local Development

This repository has a small but important runtime constraint: PocketBase must point at the **root-level** runtime directories, and Hugo must build against the same live database.

## Correct directories

Use these paths from the repository root:

- `pb_data/`
- `pb_hooks/`
- `pb_migrations/`
- `pb_public/`

Do not start PocketBase with nested paths like `pocketbase/pb_data`; that can create a fresh empty database in the wrong place.

## Recommended startup

The repository includes a Windows/Codex helper that chooses an available local port and starts PocketBase with the correct repo-root directories.

See:
- `README.md`
- `docs/LOCAL_POCKETBASE_HUGO_ENV.md`

For non-helper environments, the documented pattern is:

```bash
./pocketbase serve --http=127.0.0.1:<selected-port> --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations --publicDir=pb_public
```

## Build loop

1. Start PocketBase.
2. Verify the API is reading the expected database.
3. Run `hugo --ignoreCache` from the `hugo/` directory.
4. Confirm the generated output in `pb_public/` contains real rendered markup.

## Why the build order matters

- Hugo templates fetch live PocketBase data during rebuilds.
- If PocketBase is pointed at the wrong DB, Hugo can compile stale or incomplete pages.
- Static layout edits only appear after the Hugo rebuild.

## Operational gotchas

- Keep temporary logs outside the repo when running QA or background processes.
- If the UI looks wrong, check whether `pb_public/` was rebuilt after the latest layout or TOML change.
- Use `--ignoreCache` so Hugo does not reuse stale remote data during rebuilds.

## Related docs

- `docs/LOCAL_POCKETBASE_HUGO_ENV.md`
- `docs/HUGO_ARCHITECTURE.md`
- `docs/SECURITY_HARDENING.md`
