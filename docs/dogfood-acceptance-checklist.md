# OpenMeow SDK Dogfood Acceptance Checklist

This is the validation target for Cody's OpenMeow SDK dogfood work.

The point is not to prove every future SDK noun exists. The point is to prove that the **current app-client happy path** is real enough for a native product UI, and to capture exact SDK/Gateway gaps when it is not.

## Ground rules

- OpenMeow should talk to OpenClaw through `@openclaw/sdk` or SDK-compatible Gateway calls.
- OpenMeow should not import OpenClaw core internals.
- OpenMeow should not use plugin SDK APIs directly.
- OpenMeow should not shell out to `openclaw` for normal agent/session/run behavior.
- UI should prefer normalized `OpenClawEvent` values over raw Gateway/provider payloads.

## P0 happy path

| Step | Behavior | Acceptance | Evidence |
|---|---|---|---|
| 1 | Connect | App can connect to configured Gateway without hardcoded local-only assumptions. | Screenshot/log of connection success. |
| 2 | Discover agents | App can list agents and identify at least `main`, Kitty, or Cody when configured. | Captured response shape or UI roster. |
| 3 | Agent identity | App can fetch metadata for a lane/agent. | Identity payload or UI label/avatar mapping. |
| 4 | Create/resume session | App can create or reuse a durable session for a lane. | Stable `sessionKey`. |
| 5 | Send prompt | App can send a message and receive `runId`. | Stable `runId` + `sessionKey`. |
| 6 | Stream events | App can render assistant streaming from normalized events. | Streaming bubble or event trace. |
| 7 | Tool activity | App can show compact tool activity when tool events occur. | Tool activity UI or fixture render. |
| 8 | Approval state | App can represent an approval request as a UI card, even if approval response is stubbed. | Approval fixture render. |
| 9 | Wait result | App can map final result status to UI. | `completed`, `failed`, `cancelled`, or `timed_out`. |
| 10 | Cancel/stop | Active run can be cancelled from the composer. | Stop button triggers cancel and terminal UI state. |

## Event contract checks

OpenMeow should handle these event types without falling back to raw payload parsing:

- [ ] `run.created`
- [ ] `run.started`
- [ ] `assistant.delta`
- [ ] `assistant.message`
- [ ] `thinking.delta`
- [ ] `tool.call.started`
- [ ] `tool.call.delta`
- [ ] `tool.call.completed`
- [ ] `tool.call.failed`
- [ ] `approval.requested`
- [ ] `approval.resolved`
- [ ] `artifact.created`
- [ ] `artifact.updated`
- [ ] `run.completed`
- [ ] `run.failed`
- [ ] `run.cancelled`
- [ ] `run.timed_out`

## UI state checks

### Composer

- [ ] Idle state shows send.
- [ ] Active run state shows stop.
- [ ] Composer never shows send and stop at the same time.
- [ ] Stop uses the active `runId` and `sessionKey`.
- [ ] Cancel failure leaves the UI recoverable.

### Message stream

- [ ] User message appears immediately on send.
- [ ] Assistant placeholder appears on `run.started` or first assistant delta.
- [ ] Assistant deltas append into the placeholder.
- [ ] Final assistant message completes/replaces the placeholder.
- [ ] Failure/cancel/timeout creates a visible terminal state.

### Tool and approval cards

- [ ] Tool start creates a compact activity row.
- [ ] Tool delta updates the row without flooding chat.
- [ ] Tool completion collapses or marks the row done.
- [ ] Approval request creates a card with requested action and risk/summary.
- [ ] Approval resolution updates/removes the card.

## Gaps to capture

For each failure, capture:

1. SDK call attempted.
2. Gateway RPC invoked, if known.
3. Expected app behavior.
4. Actual result/error.
5. Whether the gap is SDK ergonomics, Gateway RPC missing, event contract ambiguity, or OpenMeow UI state.

## Fixture pack

Use the JSONL fixtures under `fixtures/openclaw-events/` to test UI rendering without a live Gateway:

- `happy-path.jsonl`
- `tool-approval.jsonl`
- `cancelled-run.jsonl`
- `timed-out-run.jsonl`

Validation command:

```bash
node scripts/validate-event-fixtures.mjs
```

Current local coverage:

- `npm test` validates fixture shape and runs the OpenMeow adapter/UI reducer tests.
- Fixture reducer tests prove known P0 event types render without raw/debug UI fallback.
- Tool fixture events collapse into one stable activity row across start/delta/completed.
- Approval fixture events create/update one stable approval card across requested/resolved.

Live Gateway dogfood evidence:

- See [`live-dogfood-2026-04-29.md`](live-dogfood-2026-04-29.md).
- Happy path connected, listed agents, fetched Cody identity, created a lane session, sent a prompt, streamed assistant deltas, rendered final assistant text, and waited to `completed`.
- Cancel path returned a successful `status: "aborted"` response; OpenMeow maps that response to a deterministic `cancelled` composer state.
- Live gaps found: raw `chat` events currently leak into `run.events()`, and cancel response / stream terminal event / wait result disagree.
