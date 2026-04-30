# Gateway RPC Contract Proposals for the App SDK

These are intentionally minimal contracts to support `@openclaw/sdk` without leaking OpenClaw internals.

## Design principles

1. RPCs should match product nouns, not implementation modules.
2. Every mutation should have idempotency where retry is plausible.
3. Long-running actions should return IDs and stream events instead of blocking indefinitely.
4. Approval/policy behavior should be explicit in the result envelope.
5. Unsupported capabilities should fail with typed errors rather than silently falling back.

## Common envelopes

```ts
type SDKRpcError = {
  code:
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "unsupported"
    | "validation_error"
    | "requires_approval"
    | "conflict"
    | "internal_error"
    | string;
  message: string;
  details?: unknown;
};
```

## `tools.invoke`

Goal: Gateway RPC equivalent of HTTP `/tools/invoke`, suitable for SDK clients.

```ts
type ToolsInvokeParams = {
  name: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
  agentId?: string;
  confirm?: boolean;
  idempotencyKey?: string;
};

type ToolsInvokeResult = {
  ok: boolean;
  output?: unknown;
  requiresApproval?: boolean;
  approvalId?: string;
  toolName: string;
  source?: "core" | "plugin" | "mcp" | "channel" | string;
  error?: SDKRpcError;
};
```

Notes:

- Should run through the same policy pipeline as agent tool use.
- Should preserve plugin confirmation semantics.
- Should not bypass approval gates just because the caller is an app.

## `tasks.list/get/cancel`

Goal: expose detached/background task ledger consistently.

```ts
type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";

type TaskSummary = {
  id: string;
  kind?: string;
  status: TaskStatus;
  title?: string;
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type TasksListParams = {
  status?: TaskStatus | TaskStatus[];
  agentId?: string;
  sessionKey?: string;
  limit?: number;
  cursor?: string;
};

type TasksListResult = {
  tasks: TaskSummary[];
  nextCursor?: string;
};

type TasksGetParams = { taskId: string };
type TasksCancelParams = { taskId: string; reason?: string };
```

## `artifacts.list/get/download`

Goal: app clients need stable access to files, diffs, media, logs, screenshots, and pull request artifacts.

```ts
type ArtifactSummary = {
  id: string;
  type:
    | "file"
    | "patch"
    | "diff"
    | "log"
    | "media"
    | "screenshot"
    | "trajectory"
    | "pull_request"
    | "workspace"
    | string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  runId?: string;
  sessionKey?: string;
  taskId?: string;
  createdAt?: string | number;
  expiresAt?: string | number;
};

type ArtifactsListParams = {
  runId?: string;
  sessionKey?: string;
  taskId?: string;
  limit?: number;
  cursor?: string;
};

type ArtifactsListResult = {
  artifacts: ArtifactSummary[];
  nextCursor?: string;
};

type ArtifactsGetParams = { artifactId: string };
type ArtifactsDownloadParams = { artifactId: string; as?: "url" | "bytes" };
```

## `environments.list/status`

Goal: start with discovery/readiness, not provisioning.

```ts
type EnvironmentSummary = {
  id: string;
  type: "local" | "gateway" | "node" | "managed" | "ephemeral" | string;
  label?: string;
  status: "available" | "unavailable" | "starting" | "stopping" | "error";
  capabilities?: string[];
};

type EnvironmentsListResult = {
  environments: EnvironmentSummary[];
};

type EnvironmentsStatusParams = { environmentId: string };
```

Create/delete should wait until OpenClaw has firmer managed environment semantics.

## Unified approvals follow-up

Today the SDK can map to `exec.approval.*` and `plugin.approval.*`, but the app SDK likely wants one normalized approvals facade:

```ts
approvals.list({ runId?, sessionKey?, kind? })
approvals.respond({ approvalId, decision, reason? })
```

The SDK can initially bridge to existing Gateway methods, but the public contract should avoid exposing separate internal approval subsystems unless apps truly need that distinction.
