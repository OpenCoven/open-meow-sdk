# OpenMeow SDK Architecture

Architecture notes and Mermaid drawings for dogfooding the new `@openclaw/sdk` from OpenMeow.

This repo is intentionally docs-first. Its job is to clarify the product boundary before implementation:

- **OpenMeow** is the native macOS notch/inbox client.
- **`@openclaw/sdk`** is the external app SDK that talks to OpenClaw Gateway.
- **OpenClaw Gateway RPCs** are the stable protocol boundary.
- **Plugin SDK** remains separate: it is for code running inside OpenClaw, not app clients.

## Start here

- [`docs/peter-review-brief.md`](docs/peter-review-brief.md) — concise review packet to share with Peter.
- [`docs/architecture.md`](docs/architecture.md) — system architecture and Mermaid diagrams.
- [`docs/gateway-rpc-gap-map.md`](docs/gateway-rpc-gap-map.md) — SDK method vs Gateway RPC readiness.
- [`docs/rpc-contract-proposals.md`](docs/rpc-contract-proposals.md) — proposed Gateway RPC contracts for SDK gaps.
- [`docs/openmeow-dogfood-plan.md`](docs/openmeow-dogfood-plan.md) — parallel implementation plan for OpenMeow.
- [`docs/openmeow-sdk-adapter-shape.md`](docs/openmeow-sdk-adapter-shape.md) — smallest adapter OpenMeow needs.
- [`docs/prioritized-backlog.md`](docs/prioritized-backlog.md) — P0/P1/P2 work breakdown.
- [`docs/adr/0001-use-openmeow-as-sdk-dogfood.md`](docs/adr/0001-use-openmeow-as-sdk-dogfood.md) — ADR for OpenMeow as SDK dogfood client.
- [`examples/typescript-basic-run`](examples/typescript-basic-run) — target app-developer quickstart shape.

## Status

This repo now includes the first local P0 dogfood adapter implementation:

- `src/index.js` — OpenMeow-side adapter over `@openclaw/sdk` plus UI event/lane-state/run-state helpers.
- `src/index.d.ts` — app-facing TypeScript types.
- `test/openmeow-sdk-client.test.js` — Node test coverage for agents/sessions/runs, normalized UI events, wait deadlines, and stop-button state.

No OpenClaw core changes live here.
