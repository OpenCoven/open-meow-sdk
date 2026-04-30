# OpenMeow SDK Architecture

Architecture notes and Mermaid drawings for dogfooding the new `@openclaw/sdk` from OpenMeow.

This repo is intentionally docs-first. Its job is to clarify the product boundary before implementation:

- **OpenMeow** is the native macOS notch/inbox client.
- **`@openclaw/sdk`** is the external app SDK that talks to OpenClaw Gateway.
- **OpenClaw Gateway RPCs** are the stable protocol boundary.
- **Plugin SDK** remains separate: it is for code running inside OpenClaw, not app clients.

## Start here

- [`docs/architecture.md`](docs/architecture.md) — system architecture and Mermaid diagrams.
- [`docs/gateway-rpc-gap-map.md`](docs/gateway-rpc-gap-map.md) — SDK method vs Gateway RPC readiness.
- [`docs/openmeow-dogfood-plan.md`](docs/openmeow-dogfood-plan.md) — parallel implementation plan for OpenMeow.

## Status

Draft architecture for review with Peter/OpenClaw maintainers. No OpenClaw core changes live here.
