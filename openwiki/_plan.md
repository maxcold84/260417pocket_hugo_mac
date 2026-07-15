# OpenWiki Update Plan

## Intended pages
- /openwiki/quickstart.md — entrypoint and navigation hub
- /openwiki/architecture/overview.md — runtime model, entrypoints, source tree
- /openwiki/operations/local-dev.md — local startup and build loop
- /openwiki/domain/data-model.md — collections, state machine, access rules
- /openwiki/frontend.md — UI patterns and Alpine/HTMX guidance
- /openwiki/payments.md — checkout, PortOne, coupons, refunds
- /openwiki/cms/rebuild.md — CMS rebuild and theme workflow
- /openwiki/security.md — hardening notes and release blockers

## Evidence used
- README.md
- DESIGN.md
- docs/HUGO_ARCHITECTURE.md
- docs/LOCAL_POCKETBASE_HUGO_ENV.md
- docs/DATABASE.md
- docs/FRONTEND.md
- docs/PORTONE.md
- docs/SECURITY_HARDENING.md
- hugo/hugo.toml
- pb_hooks/main.pb.js
- pb_hooks/routes/main.pb.js
- pb_hooks/routes/admin.pb.js
- pb_hooks/routes/portone.pb.js
- pb_hooks/utils/cms.js
- test_create.js
- test_stock.js
- Recent git history from the provided context

## Remaining questions
- None blocking for the first-pass wiki.
