# OpenClaw Event Fixtures

JSONL fixtures for testing OpenMeow UI rendering against normalized `OpenClawEvent` streams.

Each line is one normalized event shaped like the SDK public event contract:

```ts
type OpenClawEvent = {
  version: 1;
  id: string;
  ts: number;
  type: string;
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  data: unknown;
};
```

## Fixtures

- `happy-path.jsonl` — simple successful assistant response.
- `tool-approval.jsonl` — tool activity plus approval request/resolution.
- `cancelled-run.jsonl` — active run stopped by user.
- `timed-out-run.jsonl` — runtime timeout terminal state.

## How to use

OpenMeow can load these as a fake event stream and verify UI state transitions without waiting on live Gateway behavior.

```bash
node scripts/validate-event-fixtures.mjs
```
