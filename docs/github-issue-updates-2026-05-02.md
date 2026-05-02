# GitHub issue updates — OpenMeow SDK dogfood, 2026-05-02

These comments are intentionally public-safe: no tokens, passwords, private Gateway URLs, device IDs, or infrastructure URLs.

## openclaw/openclaw#74704

```markdown
Dogfood update from OpenMeow SDK validation on 2026-05-02:

Validated the app-client happy path against a live local Gateway using the OpenClaw SDK source and the OpenMeow adapter.

Evidence:
- SDK adapter tests passed: 23 fixture events validated; 14 Node tests passed.
- OpenMeow Gateway core Swift tests passed: 58 tests passed.
- Live Gateway flow succeeded:
  - listed agents
  - fetched agent identity
  - created a lane session
  - sent a run
  - streamed normalized run events into the OpenMeow UI reducer
  - waited for terminal result
- Observed normalized event stream:
  - `run.started`
  - `assistant.delta` events
  - `run.completed`
- `run.events()` did not leak raw duplicate chat/provider events in the happy path probe (`rawEvents: 0`).
- `run.wait()` normalized to `completed` for the happy path.
- Cancel/stop probe returned an abort response and `run.wait()` normalized the stopped run to `cancelled`.

Current assessment:
- The original SDK app-client happy-path blocker appears resolved for OpenMeow's Node adapter proof.
- Remaining follow-up is app-shell signoff inside the actual OpenMeow UI, plus separate tracking for the still-missing live JSON-RPC `tools.invoke` method.
```

## OpenCoven/open-meow-sdk#2

```markdown
Dogfood update from 2026-05-02:

Validated that OpenMeow can drive UI state from normalized `OpenClawEvent` values.

Evidence:
- Fixture validation passed for 23 normalized events.
- Adapter/reducer test suite passed: 14 tests.
- Live Gateway happy path streamed only normalized UI-facing events into the OpenMeow reducer:
  - `run.started`
  - `assistant.delta`
  - `run.completed`
- No raw duplicate chat/provider events appeared in the live `run.events()` happy-path stream (`rawEvents: 0`).
- Final assistant text rendered through the reducer as expected.
- Composer recovered to idle/sendable terminal state after completion.

Assessment:
- SDK-only/adapter-level criteria for this issue are satisfied.
- Recommend keeping final closure gated on one actual OpenMeow app-shell run, unless we decide the Node adapter proof is sufficient for this issue.
```

## OpenCoven/open-meow-sdk#3

```markdown
Dogfood update from 2026-05-02:

Validated wait/cancel semantics for the OpenMeow stop-button path.

Evidence:
- Started a live run through a Cody lane session.
- Called the OpenMeow adapter cancel path with `runId` and `sessionKey`.
- Gateway abort response returned success with an aborted run id.
- OpenMeow cancel reducer mapped the immediate response to a deterministic cancelled composer state:
  - `mode: idle`
  - `activeRun: null`
  - `canSend: true`
  - `canStop: false`
  - `lastTerminalStatus: cancelled`
- Follow-up `run.wait()` normalized the stopped run to `cancelled`.

Note:
- The raw Gateway wait envelope still reported a timeout-like raw status with an RPC stop reason. The SDK/UI-facing normalization is correct for OpenMeow, but the raw envelope should either be documented or cleaned up separately.

Assessment:
- Stop-button semantics are usable for OpenMeow.
- Recommend app-shell signoff next, then close if the UI behavior matches the adapter proof.
```

## OpenCoven/open-meow-sdk#8

```markdown
Dogfood update from 2026-05-02:

Validated the raw-event suppression/normalization concern in the live happy path.

Evidence:
- Live run event stream consumed through OpenMeow adapter and reducer.
- Observed only normalized run/assistant events:
  - `run.started`
  - `assistant.delta`
  - `run.completed`
- Raw event count in `run.events()` for the happy-path probe was `0`.
- Fixture contract tests continue to assert known events render without falling back to debug/raw UI.

Assessment:
- Happy-path raw duplicate event leakage appears resolved.
- Recommend one final app-shell smoke test before closing.
```

## OpenCoven/open-meow-sdk#9

```markdown
Dogfood update from 2026-05-02:

Validated the cancel response, terminal wait status, and UI recovery behavior together.

Evidence:
- `sessions.abort`/cancel returned a successful abort response.
- OpenMeow reducer recovered the composer to an idle/can-send state immediately after cancel response.
- Follow-up `run.wait()` normalized the stopped run to `cancelled` rather than `completed`.
- Adapter tests and live probe agree on the expected UI-facing state.

Caveat:
- The raw wait payload still has a timeout/RPC-stop-shaped envelope underneath the normalized result. This does not block OpenMeow UI behavior, but it is worth clarifying in Gateway docs/internals.

Assessment:
- The P0 OpenMeow stop/cancel behavior is functionally satisfied at the SDK adapter level.
- Recommend app-shell signoff next.
```

## OpenCoven/open-meow-sdk#4

```markdown
Dogfood update from 2026-05-02:

Desktop-use bridge status is mixed:

What works:
- Direct HTTP `POST /tools/invoke` can invoke `desktop_use` successfully with shared-secret Gateway auth.
- `desktop_use` doctor returned success.
- Adapter/backend summary from the successful probe:
  - adapter: `coven-desktop-use`
  - platform: `macos`
  - backend: `peekaboo`
  - permission doctor exited successfully

What does not work yet:
- SDK-facing JSON-RPC `oc.tools.invoke("desktop_use", ...)` failed against the live installed Gateway with `unknown method: tools.invoke`.
- `oc.tools.list()` returned no catalog entries in that live path.

Auth/config note:
- The local shared-secret credentials appear inconsistent across Gateway surfaces. Password-style shared-secret auth worked for HTTP `/tools/invoke`; token-style auth did not. No secret values were exposed in the dogfood evidence.

Assessment:
- Keep this issue open.
- Next fix should align the live Gateway SDK/RPC tool invocation path with the working HTTP `/tools/invoke` path, then make OpenMeow choose the credential mode that works consistently for HTTP tool calls.
```

## OpenCoven/open-meow-sdk#5/#6/#7

```markdown
Dogfood update from 2026-05-02:

P1 SDK surface probe results:

- `artifacts.list` via SDK: live Gateway returned `unknown method: artifacts.list`.
- raw `artifacts.list`: live Gateway returned `unknown method: artifacts.list`.
- `tasks.list` via SDK: SDK reports this is not supported by the current Gateway yet.
- raw `tasks.list`: live Gateway returned `unknown method: tasks.list`.
- `environments.list` via SDK: SDK reports this is not supported by the current Gateway yet.

Assessment:
- Keep these as design/proposal issues for now.
- They are not blockers for the P0 OpenMeow chat/run/cancel dogfood path.
```
