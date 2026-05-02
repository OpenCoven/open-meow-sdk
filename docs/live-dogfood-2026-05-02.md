# Live OpenMeow SDK Dogfood — 2026-05-02

## Environment

- Gateway: local loopback WebSocket (`ws://127.0.0.1:18789`)
- Gateway app version reported by `openclaw status`: `2026.4.29`
- SDK package used for live run: local OpenClaw SDK source from `openclaw/openclaw/packages/sdk/src`
- OpenMeow adapter: `src/index.js`
- Agent selected by dogfood script: `cody`
- Agent discovery count: 7 (`main`, `astra`, `charm`, `cody`, `echo`, `kitty`, `sage`)

## Static verification

- `OpenCoven/open-meow-sdk`: `npm test` passed.
  - 23 fixture events validated.
  - 14 adapter/reducer tests passed.
- `OpenCoven/open-meow`: `swift test` passed.
  - 58 Swift tests passed.

## P0 happy path result

Live flow exercised:

1. Connect to Gateway.
2. List agents.
3. Fetch Cody identity.
4. Create a Cody lane session.
5. Send a prompt.
6. Stream normalized run events into the OpenMeow UI reducer.
7. Wait for terminal result.

Evidence:

- Session key returned in expected Cody lane shape.
- Run ID returned.
- Event types observed:
  - `run.started`
  - `assistant.delta` × 7
  - `run.completed`
- Raw event count in `run.events()` was `0`.
- Final assistant message in OpenMeow UI state: `OpenMeow SDK dogfood OK`.
- Composer terminal state: `idle`, `canSend: true`, `canStop: false`, `lastTerminalStatus: completed`.
- `run.wait()` normalized result: `terminal: true`, `status: completed`.

## Cancel/stop result

Live flow exercised:

1. Create a Cody lane session.
2. Send a prompt.
3. Mark composer as cancelling.
4. Call adapter `cancel(runId, sessionKey)`.
5. Reduce cancel response into OpenMeow UI state.
6. Call wait to inspect Gateway result.

Evidence:

- Cancel response returned `ok: true`, `status: aborted`, and an `abortedRunId`.
- OpenMeow reducer mapped the immediate cancel response to a nested composer state with:
  - `mode: idle`
  - `activeRun: null`
  - `canSend: true`
  - `canStop: false`
  - `lastTerminalStatus: cancelled`
- `run.wait()` now normalized to `status: cancelled` for the aborted run.
- Underlying raw wait payload still reported `status: timeout` with `stopReason: rpc`; the SDK normalization is doing the right UI-facing thing, but the raw envelope is still worth clarifying in docs or Gateway internals.

## P0 conclusion

The original P0 dogfood blockers appear resolved for the live app-client happy path:

- `run.events()` no longer leaked raw duplicate `chat` events in the happy path probe.
- `run.wait()` returned `cancelled` after abort instead of `completed`.
- OpenMeow's immediate-cancel reducer still gives deterministic stop-button recovery.

Remaining P0 follow-up: rerun inside the actual OpenMeow app shell, not only the Node adapter proof, then post this evidence back to the tracking issues.

## tools.invoke / desktop_use probe

### SDK RPC path

Using `oc.tools.invoke("desktop_use", { args: { action: "doctor" } })` against the live Gateway failed with:

```text
unknown method: tools.invoke
```

`oc.tools.list()` also returned no catalog entries in this live Gateway path.

### HTTP path

Direct HTTP `POST /tools/invoke` with Gateway password bearer auth succeeded for:

```json
{
  "tool": "desktop_use",
  "args": { "action": "doctor" }
}
```

Result summary:

- Gateway returned `ok: true`.
- `desktop_use` adapter reported `ok: true`.
- Adapter: `coven-desktop-use`.
- Platform: `macos`.
- Backend: `peekaboo`.
- Permission doctor command exited `0`.

### Auth note

For HTTP `/tools/invoke`, `OPENCLAW_GATEWAY_PASSWORD` bearer auth succeeded while `OPENCLAW_GATEWAY_TOKEN` bearer auth returned Unauthorized. That suggests the local token/password auth pair still has drift for HTTP-compatible surfaces, even though SDK/WebSocket auth could connect with the provided environment.

## P1 RPC probes

- `artifacts.list` via SDK: `unknown method: artifacts.list`.
- raw `artifacts.list`: `unknown method: artifacts.list`.
- `tasks.list` via SDK: SDK explicit unsupported error.
- raw `tasks.list`: `unknown method: tasks.list`.
- `environments.list` via SDK: SDK explicit unsupported error.

## Recommendations from this run

1. Treat #74704/#2/#3/#8/#9 as ready for final app-shell signoff rather than more SDK-only debugging.
2. Keep #4 open: HTTP `/tools/invoke` works, but SDK-facing JSON-RPC `tools.invoke` is not available in the live installed Gateway.
3. Prioritize auth drift cleanup before wiring OpenMeow's `GatewayDesktopUseClient` into product UI, because its current token-first bearer selection may choose a credential that works for WebSocket but fails for HTTP `/tools/invoke`.
4. Keep #5/#6/#7 as design/proposal issues; the live Gateway does not expose artifact/task/environment RPCs yet.


## Follow-up probes — 2026-05-02

- `oc.tools.list()` against the live Gateway now returns a populated tool catalog (core groups plus the `opencoven-desktop-use` plugin tool).
- `oc.request("tools.invoke", { name: "desktop_use", args: { action: "doctor" } })` still fails with `unknown method: tools.invoke`.
- `xcodebuild -project OpenMeow.xcodeproj -scheme OpenMeow -configuration Debug -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build` succeeds, which means the app is buildable locally even though the signed build path still needs attention.
- `desktop_use inspect --app OpenMeow` is still blocked by missing Screen Recording permission on this machine.
