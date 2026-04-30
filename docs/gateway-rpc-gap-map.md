# Gateway RPC Gap Map for `@openclaw/sdk`

This maps the current SDK shape to Gateway methods so we can help Peter by validating what is real today vs future-facing.

| SDK surface | Intended use | Gateway RPC today | Status | Notes |
|---|---|---:|---|---|
| `oc.runs.create()` | Start one agent run | `agent` | Works today | Uses Gateway `agent` method and returns `runId`. |
| `run.wait()` / `oc.runs.wait()` | Await run result | `agent.wait` | Works today | Recent commits distinguish wait deadline `accepted` from runtime `timed_out`. |
| `run.cancel()` / `oc.runs.cancel()` | Abort run | `sessions.abort` | Works today | Needs session/run routing to be reliable for OpenMeow stop button. |
| `oc.sessions.create()` | Create durable session | `sessions.create` | Works today | Good fit for OpenMeow lanes. |
| `session.send()` | Send message into session | `sessions.send` | Works today | Should support streaming event correlation cleanly. |
| `session.abort()` | Abort active session run | `sessions.abort` | Works today | Needed for OpenMeow send/stop toggle. |
| `session.compact()` | Compact transcript | `sessions.compact` | Works today | Useful later, not first dogfood path. |
| `oc.agents.list()` | Discover configured agents | `agents.list` | Works today | OpenMeow can use for Kitty/Cody/other lanes. |
| `oc.agents.get(id).identity()` | Agent identity metadata | `agent.identity.get` | Works today | Good for roster/lane UI. |
| `oc.models.list()` | Model catalog | `models.list` | Works today | Useful for settings. |
| `oc.models.status()` | Model/provider auth | `models.authStatus` | Works today | Useful for diagnostics. |
| `oc.tools.list()` | Tool catalog | `tools.catalog` | Works today | General discovery. |
| `oc.tools.effective()` | Effective tool surface | `tools.effective` | Works today | Important for OpenMeow capability UI. |
| `oc.approvals.list()` | Pending exec approvals | `exec.approval.list` | Works today | Exec only today. |
| `oc.approvals.respond()` | Resolve approval | `exec.approval.resolve` | Works today | May need unified exec/plugin approval facade. |
| plugin approvals | Tool/plugin approval flow | `plugin.approval.*` | Gateway exists | SDK facade should normalize with exec approvals. |
| `oc.tools.invoke()` | Generic app tool invocation | Proposed `tools.invoke` RPC | Missing | There is HTTP `/tools/invoke`, but SDK wants a clean Gateway RPC. |
| `oc.tasks.list/get/cancel()` | Detached task ledger | Proposed `tasks.*` RPC | Missing/scaffolded | Background tasks exist conceptually, but SDK API throws unsupported. |
| `oc.artifacts.list/get/download()` | Files/media/diffs/logs | Proposed `artifacts.*` RPC | Missing/scaffolded | Critical for rich OpenMeow results later. |
| `oc.environments.*` | Local/node/managed execution envs | Proposed `environments.*` RPC | Missing/scaffolded | Good design target; should stay explicit unsupported for now. |

## Suggested next Gateway RPCs

### `tools.invoke`

A Gateway RPC equivalent of HTTP `/tools/invoke`, with the same policy and approval semantics.

```ts
type ToolsInvokeParams = {
  name: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
  agentId?: string;
  confirm?: boolean;
  idempotencyKey?: string;
};
```

### `tasks.*`

Minimal task ledger for SDK:

```ts
tasks.list({ sessionKey?, agentId?, status?, limit? })
tasks.get({ taskId })
tasks.cancel({ taskId })
```

### `artifacts.*`

Minimal artifact surface:

```ts
artifacts.list({ runId?, sessionKey?, taskId? })
artifacts.get({ artifactId })
artifacts.download({ artifactId })
```

### `environments.*`

Start read-only/discovery first:

```ts
environments.list()
environments.status({ environmentId })
```

Create/delete can follow once managed/node execution semantics are clearer.
