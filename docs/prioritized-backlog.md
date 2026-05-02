# Prioritized Backlog

## P0 — OpenMeow dogfood happy path

### 1. Build OpenMeow SDK adapter

**Goal:** a tiny client wrapper OpenMeow can use without importing OpenClaw internals.

Acceptance:

- Connects to Gateway through SDK or SDK-compatible transport.
- Lists agents.
- Creates/resolves session.
- Sends prompt.
- Streams normalized events.
- Waits and cancels run.

### 2. Validate normalized event UI mapping

**Goal:** prove OpenMeow can render from `OpenClawEvent`, not raw provider events.

Acceptance:

- Assistant streaming works.
- Tool activity can be shown compactly.
- Approval requests can be represented.
- Run terminal states map cleanly to UI.

### 3. Confirm stop button semantics

**Goal:** OpenMeow composer shows send or stop, never both.

Acceptance:

- Active run exposes run/session identifiers needed for cancel.
- Cancel maps to `sessions.abort` today.
- UI receives a terminal cancellation/failure state.

## P1 — Gateway RPC gaps

### 4. Add SDK-style `tools.invoke` RPC — done upstream

**Why:** HTTP `/tools/invoke` exists, but SDK needs a Gateway RPC method with the same policy semantics.

Status: implemented upstream by OpenClaw PR #74804 for issue #74705; this repo's adapter exposes it as `invokeTool()` with a temporary HTTP fallback for older installed Gateways.

Acceptance:

- Invokes core and plugin tools through policy pipeline.
- Preserves confirmation/approval requirements.
- Supports session/agent scoping.
- Has tests for refusal without confirmation.

### 5. Add read-only artifacts RPCs

**Why:** OpenMeow will need rich outputs: diffs, screenshots, logs, generated files.

Start with:

- `artifacts.list`
- `artifacts.get`
- `artifacts.download`

### 6. Add task ledger RPCs

**Why:** background/subagent/ACP jobs need a stable app-visible lifecycle.

Start with:

- `tasks.list`
- `tasks.get`
- `tasks.cancel`

### 7. Add environment discovery RPCs

**Why:** managed/node/local environments should be visible before they are creatable.

Start with:

- `environments.list`
- `environments.status`

## P2 — Docs and examples

### 8. Add official SDK quickstart

Should include:

- connect
- list agents
- create session
- run prompt
- stream events
- wait
- cancel

### 9. Add OpenMeow dogfood case study

Document where SDK ergonomics worked and where Gateway RPCs were missing.

### 10. Clarify app SDK vs plugin SDK everywhere

Docs should repeatedly say:

- App SDK runs outside OpenClaw.
- Plugin SDK runs inside OpenClaw.
- They should not depend on each other.
