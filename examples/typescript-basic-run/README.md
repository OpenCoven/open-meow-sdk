# TypeScript Basic Run Example

A tiny target shape for the OpenClaw app SDK.

This is intentionally a design/dogfood example. It documents the app developer experience we want to make boring.

```bash
pnpm add @openclaw/sdk
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789 pnpm tsx index.ts
```

Expected behavior:

1. Connect to Gateway.
2. Resolve the `main` agent.
3. Start a run.
4. Stream normalized events.
5. Wait for final status.
6. Close cleanly.
