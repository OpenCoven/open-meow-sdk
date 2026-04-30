# TypeScript Basic Run Example

A tiny target shape for OpenMeow dogfooding the OpenClaw app SDK through the local adapter.

This documents the app developer experience we want to make boring: OpenMeow calls its adapter, and the adapter calls `@openclaw/sdk` / Gateway.

```bash
pnpm add @openclaw/sdk
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789 pnpm tsx index.ts
```

Expected behavior:

1. Connect to Gateway through `createOpenMeowSDKClient()`.
2. Create a lane session for the selected agent.
3. Send a prompt and receive stable `runId` + `sessionKey`.
4. Stream normalized SDK events and map them into OpenMeow UI events.
5. Wait for final status while distinguishing wait deadline from runtime timeout.
6. Close cleanly.
