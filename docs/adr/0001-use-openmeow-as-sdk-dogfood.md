# ADR 0001: Use OpenMeow as the first OpenClaw SDK dogfood client

## Status

Proposed

## Context

Peter added the first `@openclaw/sdk` package and design docs for a public app SDK. The core direction is strong, but several SDK nouns are future-facing until Gateway RPCs are standardized.

OpenMeow is an ideal validation client because it is a real native app surface that needs the SDK's core promises:

- stable sessions
- streaming runs
- cancellation
- agent identity
- effective tools
- approvals
- eventually artifacts and tasks

## Decision

Use OpenMeow as a first dogfood client for the OpenClaw app SDK.

OpenMeow should consume OpenClaw through Gateway/SDK boundaries only. It should not import OpenClaw internals, call plugin SDK APIs, or shell out for normal agent/session work.

## Consequences

Positive:

- Validates the SDK against a real product UI.
- Produces concrete Gateway RPC gap reports.
- Keeps OpenMeow aligned with OpenClaw's public integration story.
- Clarifies app SDK vs plugin SDK boundaries.

Tradeoffs:

- Some OpenMeow work may temporarily use SDK-compatible Gateway calls until SDK coverage catches up.
- Missing Gateway RPCs will become visible quickly.
- The SDK may need small ergonomic changes for native app consumers.

## Success criteria

OpenMeow can:

1. discover agents,
2. create/resume a session,
3. send a run,
4. stream normalized events,
5. wait/cancel,
6. show approvals,
7. render tool activity,
8. avoid raw Gateway/provider event parsing for normal UI.
