# Peter Review Brief: OpenClaw SDK + OpenMeow Dogfood

## TL;DR

Strong yes on the OpenClaw SDK direction.

The abstraction is right: **external apps talk to OpenClaw through a public SDK over Gateway RPCs; internal extensions use the plugin SDK.** That boundary makes OpenClaw feel like a programmable agent runtime instead of only a CLI or local gateway.

OpenMeow is a good first dogfood client because it stresses the exact product surfaces the SDK needs to get right:

- agent discovery
- session creation and resume
- run streaming
- wait/cancel semantics
- normalized UI events
- approvals
- effective tool visibility
- read-only environment discovery
- future artifacts/tasks

## What is already good

1. **The nouns are right**

   `OpenClaw`, `Agent`, `Session`, `Run`, `Task`, `Artifact`, `Environment`, `ToolSpace`, and `Approval` are the correct product nouns. They hide internal runtime details without erasing important concepts.

2. **The app SDK vs plugin SDK split is correct**

   This should be explicit everywhere:

   - App SDK: external clients, dashboards, IDEs, OpenMeow, CI, automations.
   - Plugin SDK: trusted code running inside OpenClaw to register providers/channels/tools/hooks/runtimes.

3. **Normalized events are the key product surface**

   UI clients should consume stable event names such as `assistant.delta`, `tool.call.started`, `approval.requested`, `run.completed`, etc. Raw Gateway/provider events should remain available, but apps should not need to parse them for normal UI.

4. **Unsupported future options currently fail loudly**

   Runtime/workspace selections and environment provisioning are future-facing. Throwing explicit unsupported errors is better than silently dropping those fields.

## Main concern

The SDK should avoid looking more complete than the Gateway contract behind it.

The current working core is real:

- `agent`
- `agent.wait`
- `sessions.create`
- `sessions.send`
- `sessions.abort`
- `agents.list`
- `agent.identity.get`
- `models.list`
- `models.authStatus`
- `tools.catalog`
- `tools.effective`
- `exec.approval.*`
- `plugin.approval.*`

Some future namespaces are still scaffolded ahead of Gateway RPCs:

- `tasks.*`
- `artifacts.*`

`tools.invoke` and read-only `environments.list/status` are now implemented upstream, so OpenMeow can validate those through the public SDK instead of treating them as design-only surfaces.

That is fine if clearly marked as planned/unsupported, but it should not feel shipped yet.

## Recommended near-term priorities

### P0 — Stabilize the app-client happy path

This is the OpenMeow path:

1. Connect to Gateway.
2. Discover agents and models.
3. Create or resume a session.
4. Send a run.
5. Stream normalized events.
6. Wait for result.
7. Cancel/stop active run.
8. Surface approvals.

### P1 — Standardize missing Gateway RPCs

Add clean RPC methods for SDK-facing future nouns:

- `tasks.list/get/cancel`
- `artifacts.list/get/download`
- environment create/delete later, after read-only `environments.list/status` has proven useful.

### P2 — Validate with OpenMeow

Use OpenMeow as the first real consumer and capture friction as concrete SDK/Gateway issues.

This gives the SDK a product-quality test: not just “does it compile,” but “can a real app build a delightful agent UI with it?”

## Proposed success bar

The SDK is ready for public-ish usage when this script and OpenMeow flow both feel boring:

```ts
import { OpenClaw } from "@openclaw/sdk";

const oc = new OpenClaw({ gateway: "auto" });
const agent = await oc.agents.get("main");
const run = await agent.run({ input: "Summarize the current repo state." });

for await (const event of run.events()) {
  if (event.type === "assistant.delta") {
    process.stdout.write(String(event.data));
  }
}

const result = await run.wait();
console.log(result.status);
```

## Bottom line

This is the right layer. The next move is to keep the public contract disciplined, dogfood it through OpenMeow, and fill Gateway RPC gaps in the order real app usage demands.
