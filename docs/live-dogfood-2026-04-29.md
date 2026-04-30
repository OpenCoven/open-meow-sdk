# Live OpenMeow SDK Dogfood — 2026-04-29

## Environment

- Gateway: local loopback WebSocket (`ws://127.0.0.1:18789`)
- SDK package used for live run: local `@openclaw/sdk` build from the OpenClaw worktree
- OpenMeow adapter: `src/index.js`
- Agent selected by dogfood script: `cody`
- Agent discovery count: 7

## Happy path result

Live flow exercised:

1. connect
2. list agents
3. get agent identity
4. create lane session
5. send prompt
6. stream run events
7. reduce events into OpenMeow UI state
8. wait for terminal result

Evidence:

- Session key returned in expected `agent:cody:dashboard:<uuid>` shape.
- Run ID returned in expected UUID shape.
- Event types observed:
  - `run.started`
  - `assistant.delta`
  - `raw`
  - `assistant.delta`
  - `assistant.delta`
  - `assistant.delta`
  - `assistant.delta`
  - `assistant.delta`
  - `assistant.delta`
  - `run.completed`
- Final assistant message in OpenMeow UI state: `OpenMeow SDK dogfood OK`
- Composer terminal state: `idle`, `canSend: true`, `canStop: false`, `lastTerminalStatus: completed`
- `run.wait()` normalized result: `terminal: true`, `status: completed`

## Cancel/stop result

Live flow exercised:

1. create lane session
2. send prompt
3. mark composer as cancelling
4. call adapter `cancel(runId, sessionKey)`
5. reduce cancel response into OpenMeow UI state
6. call wait to inspect Gateway result

Evidence:

- Session key returned in expected `agent:cody:dashboard:<uuid>` shape.
- Run ID returned in expected UUID shape.
- Cancel response returned:

```json
{
  "ok": true,
  "abortedRunId": "<run-id>",
  "status": "aborted"
}
```

- OpenMeow UI reducer now maps that successful cancel response to:
  - `mode: idle`
  - `canSend: true`
  - `canStop: false`
  - `lastTerminalStatus: cancelled`
- `run.wait()` still normalized to `status: completed` for the same aborted run.
- No `run.cancelled` terminal stream event was observed during the cancel probe window.

## Confirmed working locally

- Adapter can connect to the live Gateway through the public SDK boundary.
- Adapter can list agents and fetch agent identity.
- Adapter can create a lane session and send a prompt.
- Live assistant deltas are enough to build the final assistant bubble.
- `run.wait()` returns a terminal completed result for the happy path.
- `sessions.abort`/`run.cancel` response includes enough data for OpenMeow to deterministically restore composer state after stop.

## Gaps found

### 1. Raw `chat` events leak into normalized SDK stream

The live happy-path stream included `raw` events whose raw event name was `chat` and whose payload looked like assistant delta content. These appear to duplicate or overlap with normalized `assistant.delta` events.

Impact:

- OpenMeow can still render the assistant response from normalized `assistant.delta` events.
- The app UI would need to ignore or debug-log these raw events today.
- The SDK normalization contract should probably either normalize `chat` events into stable app event types or suppress duplicate raw chat deltas from `run.events()`.

Classification: SDK event normalization ambiguity.

### 2. Cancel response, stream terminal event, and wait result disagree

The cancel probe returned `status: aborted`, but no `run.cancelled` stream event was observed, and `run.wait()` returned `completed`.

Impact:

- OpenMeow cannot rely only on streamed terminal events for stop-button recovery today.
- OpenMeow can recover deterministically by treating a successful cancel response as a synthetic cancelled UI terminal state.
- Gateway/SDK should clarify whether `agent.wait` after abort should return `cancelled`, `completed`, or a separate accepted/aborted envelope.

Classification: wait/cancel contract mismatch.

## Local mitigation added

Added `reduceOpenMeowCancelResult(state, run, result)` so OpenMeow can update UI state from the immediate cancel response:

- successful abort/cancel result -> composer returns to idle with `lastTerminalStatus: cancelled`
- failed cancel result -> composer returns to streaming/recoverable with `canStop: true`

This keeps the native UI deterministic while the Gateway/SDK cancellation contract is clarified upstream.
