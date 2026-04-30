# OpenMeow SDK Adapter Shape

This is the smallest adapter OpenMeow needs to dogfood `@openclaw/sdk` without binding UI code directly to transport details.

## Interface

```ts
type OpenMeowLaneTarget = {
  agentId: string;
  label?: string;
  sessionKey?: string;
};

type OpenMeowSendResult = {
  runId: string;
  sessionKey: string;
};

interface OpenMeowSDKClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  listAgents(): Promise<unknown>;
  getAgentIdentity(agentId: string): Promise<unknown>;
  createLaneSession(target: OpenMeowLaneTarget): Promise<{ sessionKey: string }>;
  send(sessionKey: string, message: string): Promise<OpenMeowSendResult>;
  events(runId: string): AsyncIterable<unknown>;
  wait(runId: string, timeoutMs?: number): Promise<unknown>;
  cancel(runId: string, sessionKey: string): Promise<unknown>;
  effectiveTools(sessionKey?: string): Promise<unknown>;
}
```

## Mapping to SDK today

| Adapter method | SDK/Gateway path |
|---|---|
| `connect` | `oc.connect()` |
| `listAgents` | `oc.agents.list()` |
| `getAgentIdentity` | `oc.agents.get(id).identity()` |
| `createLaneSession` | `oc.sessions.create({ agentId, label })` |
| `send` | `oc.sessions.send({ key, message })` |
| `events` | `oc.runs.events(runId)` |
| `wait` | `oc.runs.wait(runId, { timeoutMs })` |
| `cancel` | `oc.runs.cancel(runId, sessionKey)` |
| `effectiveTools` | `oc.tools.effective({ sessionKey })` |

## Local implementation

The initial dogfood implementation lives in `src/index.js` with declarations in `src/index.d.ts`.

It intentionally depends only on the public `@openclaw/sdk` package boundary:

- `createOpenMeowSDKClient()` wraps agents, sessions, runs, cancellation, and effective tools.
- `mapOpenClawEventToOpenMeowUIEvent()` converts normalized SDK events into compact OpenMeow UI events.
- `initialOpenMeowUIState()` and `reduceOpenMeowUIState()` build app-facing lane state: assistant messages/drafts, compact tool activity, approval cards, terminal composer state, and debug-only raw events.
- `reduceOpenMeowRunState()` and `markOpenMeowRunCancelling()` implement the send-or-stop composer state.
- `normalizeOpenMeowWaitResult()` separates a wait deadline (`status: "accepted"`) from a runtime timeout (`status: "timed_out"`).

## UI state guarantees OpenMeow wants

- Every send returns a stable `runId` and `sessionKey`.
- Every active run can be cancelled.
- Event stream can be consumed after run creation without losing early lifecycle events.
- Wait timeout and runtime timeout are distinguishable.
- Tool/approval events are normalized enough for UI cards.
