import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createOpenMeowSDKClient,
  initialOpenMeowRunState,
  initialOpenMeowUIState,
  markOpenMeowRunCancelling,
  mapOpenClawEventToOpenMeowUIEvent,
  normalizeOpenMeowWaitResult,
  reduceOpenMeowRunState,
  reduceOpenMeowUIState,
  reduceOpenMeowCancelResult,
} from "../src/index.js";

function readFixtureEvents(name) {
  const file = new URL(`../fixtures/openclaw-events/${name}.jsonl`, import.meta.url);
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function makeFakeOpenClaw() {
  const calls = [];
  const events = [
    { type: "run.started", runId: "run_1", sessionKey: "session:cody" },
    { type: "assistant.delta", runId: "run_1", data: { delta: "hello" } },
    { type: "run.completed", runId: "run_1" },
  ];

  return {
    calls,
    async connect() {
      calls.push(["connect"]);
    },
    async close() {
      calls.push(["close"]);
    },
    agents: {
      async list() {
        calls.push(["agents.list"]);
        return [{ id: "cody", label: "Cody" }];
      },
      get(agentId) {
        calls.push(["agents.get", agentId]);
        return {
          async identity() {
            calls.push(["agent.identity", agentId]);
            return { id: agentId, name: "Cody" };
          },
        };
      },
    },
    sessions: {
      async create(params) {
        calls.push(["sessions.create", params]);
        return { sessionKey: `session:${params.agentId}` };
      },
      async send(params) {
        calls.push(["sessions.send", params]);
        return { runId: "run_1", status: "started" };
      },
    },
    runs: {
      events(runId) {
        calls.push(["runs.events", runId]);
        return events.values();
      },
      async wait(runId, params) {
        calls.push(["runs.wait", runId, params]);
        return { runId, status: "completed" };
      },
      async cancel(runId, sessionKey) {
        calls.push(["runs.cancel", runId, sessionKey]);
        return { runId, sessionKey, status: "cancelled" };
      },
    },
    tools: {
      async effective(params) {
        calls.push(["tools.effective", params]);
        return { tools: [], params };
      },
      async invoke(name, params) {
        calls.push(["tools.invoke", name, params]);
        return { ok: true, toolName: name, output: { invoked: true } };
      },
    },
  };
}

describe("OpenMeow SDK adapter", () => {
  it("wraps the P0 OpenClaw SDK happy path without importing OpenClaw internals", async () => {
    const openClaw = makeFakeOpenClaw();
    const client = createOpenMeowSDKClient({ openClaw });

    await client.connect();
    assert.deepEqual(await client.listAgents(), [{ id: "cody", label: "Cody" }]);
    assert.deepEqual(await client.getAgentIdentity("cody"), { id: "cody", name: "Cody" });

    const session = await client.createLaneSession({ agentId: "cody", label: "Cody lane" });
    assert.deepEqual(session, { sessionKey: "session:cody" });

    const sent = await client.send(session.sessionKey, "ship it");
    assert.deepEqual(sent, { runId: "run_1", sessionKey: "session:cody", status: "started" });

    assert.deepEqual(await collect(client.events(sent.runId)), [
      { type: "run.started", runId: "run_1", sessionKey: "session:cody" },
      { type: "assistant.delta", runId: "run_1", data: { delta: "hello" } },
      { type: "run.completed", runId: "run_1" },
    ]);

    assert.deepEqual(await client.wait(sent.runId, 30_000), { runId: "run_1", status: "completed" });
    assert.deepEqual(await client.cancel(sent.runId, sent.sessionKey), {
      runId: "run_1",
      sessionKey: "session:cody",
      status: "cancelled",
    });
    assert.deepEqual(await client.effectiveTools(sent.sessionKey), {
      tools: [],
      params: { sessionKey: "session:cody" },
    });
    assert.deepEqual(
      await client.invokeTool("demo", {
        args: { mode: "test" },
        sessionKey: sent.sessionKey,
        confirm: false,
        idempotencyKey: "openmeow-tool-test",
      }),
      { ok: true, toolName: "demo", output: { invoked: true } },
    );
    await client.close();

    assert.deepEqual(openClaw.calls, [
      ["connect"],
      ["agents.list"],
      ["agents.get", "cody"],
      ["agent.identity", "cody"],
      ["sessions.create", { agentId: "cody", label: "Cody lane" }],
      ["sessions.send", { key: "session:cody", message: "ship it" }],
      ["runs.events", "run_1"],
      ["runs.wait", "run_1", { timeoutMs: 30_000 }],
      ["runs.cancel", "run_1", "session:cody"],
      ["tools.effective", { sessionKey: "session:cody" }],
      [
        "tools.invoke",
        "demo",
        {
          args: { mode: "test" },
          sessionKey: "session:cody",
          confirm: false,
          idempotencyKey: "openmeow-tool-test",
        },
      ],
      ["close"],
    ]);
  });

  it("fails clearly when direct tool invocation is unavailable and no HTTP fallback is configured", async () => {
    const client = createOpenMeowSDKClient({ openClaw: { tools: {} } });

    await assert.rejects(
      client.invokeTool("demo", { args: {} }),
      /HTTP tool fallback requires an explicit Gateway URL/,
    );
  });

  it("falls back to HTTP /tools/invoke when the live Gateway does not advertise tools.invoke yet", async () => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({
        url: String(url),
        method: init.method,
        authorization: init.headers.Authorization,
        body: JSON.parse(init.body),
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, result: { desktop: "ok" } };
        },
      };
    };

    try {
      const client = createOpenMeowSDKClient({
        gateway: "ws://127.0.0.1:18789",
        token: "token-secret",
        password: "password-secret",
        openClaw: {
          tools: {
            async invoke() {
              throw new Error("unknown method: tools.invoke");
            },
          },
        },
      });

      assert.deepEqual(
        await client.invokeTool("desktop_use", {
          args: { action: "doctor" },
          sessionKey: "agent:cody:main",
          idempotencyKey: "desktop-doctor",
        }),
        { ok: true, toolName: "desktop_use", output: { desktop: "ok" }, source: "http" },
      );
      assert.deepEqual(requests, [
        {
          url: "http://127.0.0.1:18789/tools/invoke",
          method: "POST",
          authorization: "Bearer password-secret",
          body: {
            tool: "desktop_use",
            args: { action: "doctor" },
            sessionKey: "agent:cody:main",
            idempotencyKey: "desktop-doctor",
          },
        },
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("does not use HTTP fallback for confirm:true tool approvals", async () => {
    const client = createOpenMeowSDKClient({
      gateway: "ws://127.0.0.1:18789",
      openClaw: {
        tools: {
          async invoke() {
            throw new Error("unknown method: tools.invoke");
          },
        },
      },
    });

    await assert.rejects(
      client.invokeTool("desktop_use", { confirm: true }),
      /HTTP tool fallback does not support confirm: true/,
    );
  });

  it("exposes OpenClaw environment discovery through the adapter", async () => {
    const gatewayEnvironment = {
      id: "gateway",
      type: "gateway",
      label: "Local Gateway",
      status: "available",
      capabilities: ["runs", "tools"],
    };
    const calls = [];
    const client = createOpenMeowSDKClient({
      openClaw: {
        environments: {
          async list(params) {
            calls.push(["environments.list", params]);
            return { environments: [gatewayEnvironment] };
          },
          async status(environmentId) {
            calls.push(["environments.status", environmentId]);
            return gatewayEnvironment;
          },
        },
      },
    });

    assert.deepEqual(await client.listEnvironments(), { environments: [gatewayEnvironment] });
    assert.deepEqual(await client.getEnvironmentStatus("gateway"), gatewayEnvironment);
    assert.deepEqual(calls, [
      ["environments.list", {}],
      ["environments.status", "gateway"],
    ]);
  });

  it("supports current SDK handle objects that expose async agents.get(), Session.key, and Run.id", async () => {
    const calls = [];
    const client = createOpenMeowSDKClient({
      openClaw: {
        agents: {
          async get(agentId) {
            calls.push(["agents.get", agentId]);
            return {
              async identity() {
                calls.push(["agent.identity", agentId]);
                return { id: agentId };
              },
            };
          },
        },
        sessions: {
          async create(params) {
            calls.push(["sessions.create", params]);
            return { key: "session:from-sdk" };
          },
          async send(params) {
            calls.push(["sessions.send", params]);
            return { id: "run_from_sdk" };
          },
        },
      },
    });

    assert.deepEqual(await client.getAgentIdentity("cody"), { id: "cody" });
    assert.deepEqual(await client.createLaneSession({ agentId: "cody" }), {
      sessionKey: "session:from-sdk",
    });
    assert.deepEqual(await client.send("session:from-sdk", "hi"), {
      runId: "run_from_sdk",
      sessionKey: "session:from-sdk",
    });
  });

  it("resolves an existing lane session without creating a new Gateway session", async () => {
    const openClaw = makeFakeOpenClaw();
    const client = createOpenMeowSDKClient({ openClaw });

    assert.deepEqual(
      await client.createLaneSession({ agentId: "cody", sessionKey: "session:existing" }),
      { sessionKey: "session:existing" },
    );
    assert.equal(openClaw.calls.some(([name]) => name === "sessions.create"), false);
  });

  it("falls back to sessions.abort when the SDK has no runs.cancel helper yet", async () => {
    const calls = [];
    const client = createOpenMeowSDKClient({
      openClaw: {
        sessions: {
          async abort(params) {
            calls.push(["sessions.abort", params]);
            return { ok: true, aborted: true, runIds: [params.runId] };
          },
        },
      },
    });

    assert.deepEqual(await client.cancel("run_1", "session:cody"), {
      ok: true,
      aborted: true,
      runIds: ["run_1"],
    });
    assert.deepEqual(calls, [["sessions.abort", { key: "session:cody", runId: "run_1" }]]);
  });
});

describe("OpenMeow normalized event UI mapping", () => {
  it("maps assistant deltas, tool activity, approvals, and terminal states from normalized SDK events", () => {
    assert.deepEqual(
      mapOpenClawEventToOpenMeowUIEvent({
        type: "assistant.delta",
        runId: "run_1",
        data: { delta: "hello" },
      }),
      { kind: "assistant_delta", runId: "run_1", text: "hello" },
    );

    assert.deepEqual(
      mapOpenClawEventToOpenMeowUIEvent({
        type: "tool.call.started",
        runId: "run_1",
        data: { name: "exec", input: { command: "git status" } },
      }),
      {
        kind: "tool_activity",
        phase: "started",
        runId: "run_1",
        title: "exec",
        detail: { command: "git status" },
      },
    );

    assert.deepEqual(
      mapOpenClawEventToOpenMeowUIEvent({
        type: "approval.requested",
        runId: "run_1",
        data: { id: "approval_1", commandText: "pnpm test" },
      }),
      {
        kind: "approval_card",
        phase: "requested",
        runId: "run_1",
        approvalId: "approval_1",
        title: "pnpm test",
      },
    );

    assert.deepEqual(
      mapOpenClawEventToOpenMeowUIEvent({ type: "run.timed_out", runId: "run_1" }),
      { kind: "run_terminal", runId: "run_1", status: "timed_out" },
    );
  });
});

describe("OpenMeow stop/wait state", () => {
  it("keeps the composer in send-or-stop mode and returns to idle on terminal events", () => {
    const active = reduceOpenMeowRunState(initialOpenMeowRunState(), {
      type: "run.started",
      runId: "run_1",
      sessionKey: "session:cody",
    });

    assert.deepEqual(active, {
      mode: "streaming",
      activeRun: { runId: "run_1", sessionKey: "session:cody" },
      canSend: false,
      canStop: true,
      lastTerminalStatus: null,
      waitDeadlineExpired: false,
    });

    const cancelling = markOpenMeowRunCancelling(active);
    assert.equal(cancelling.mode, "cancelling");
    assert.equal(cancelling.canSend, false);
    assert.equal(cancelling.canStop, false);

    assert.deepEqual(
      reduceOpenMeowRunState(cancelling, { type: "run.cancelled", runId: "run_1" }),
      {
        mode: "idle",
        activeRun: null,
        canSend: true,
        canStop: false,
        lastTerminalStatus: "cancelled",
        waitDeadlineExpired: false,
      },
    );
  });

  it("preserves the send-result session key when run.started omits sessionKey", () => {
    const seeded = {
      mode: "streaming",
      activeRun: { runId: "run_1", sessionKey: "session:cody" },
      canSend: false,
      canStop: true,
      lastTerminalStatus: null,
      waitDeadlineExpired: false,
    };

    assert.deepEqual(reduceOpenMeowRunState(seeded, { type: "run.started", runId: "run_1" }), seeded);
  });

  it("distinguishes wait deadline from runtime timeout", () => {
    assert.deepEqual(normalizeOpenMeowWaitResult({ runId: "run_1", status: "accepted" }), {
      kind: "wait_deadline",
      terminal: false,
      runId: "run_1",
      status: "accepted",
      raw: { runId: "run_1", status: "accepted" },
    });

    assert.deepEqual(normalizeOpenMeowWaitResult({ runId: "run_1", status: "timed_out" }), {
      kind: "terminal",
      terminal: true,
      runId: "run_1",
      status: "timed_out",
      raw: { runId: "run_1", status: "timed_out" },
    });
  });
});

describe("OpenMeow lane UI state", () => {
  it("builds assistant bubbles, compact tool activity, approval cards, and terminal state from normalized events", () => {
    let state = initialOpenMeowUIState({ sessionKey: "session:cody" });

    for (const event of [
      { type: "run.started", runId: "run_1", sessionKey: "session:cody" },
      { type: "assistant.delta", runId: "run_1", data: { delta: "hel" } },
      { type: "assistant.delta", runId: "run_1", data: { delta: "lo" } },
      {
        type: "tool.call.started",
        runId: "run_1",
        data: { id: "tool_1", name: "exec", input: { command: "git status" } },
      },
      { type: "tool.call.delta", runId: "run_1", data: { id: "tool_1", delta: "clean" } },
      { type: "tool.call.completed", runId: "run_1", data: { id: "tool_1" } },
      {
        type: "approval.requested",
        runId: "run_1",
        data: { id: "approval_1", commandText: "pnpm test" },
      },
      { type: "approval.resolved", runId: "run_1", data: { id: "approval_1" } },
      { type: "assistant.message", runId: "run_1", data: { text: "hello final" } },
      { type: "run.completed", runId: "run_1" },
    ]) {
      state = reduceOpenMeowUIState(state, event);
    }

    assert.deepEqual(state.composer, {
      mode: "idle",
      activeRun: null,
      canSend: true,
      canStop: false,
      lastTerminalStatus: "completed",
      waitDeadlineExpired: false,
    });
    assert.deepEqual(state.assistantDrafts, {});
    assert.deepEqual(state.messages, [
      {
        id: "assistant:run_1:0",
        role: "assistant",
        runId: "run_1",
        text: "hello final",
        streaming: false,
      },
    ]);
    assert.deepEqual(state.toolActivities, [
      {
        id: "tool_1",
        runId: "run_1",
        title: "exec",
        phase: "completed",
        detail: { command: "git status" },
        preview: "clean",
      },
    ]);
    assert.deepEqual(state.approvals, [
      {
        id: "approval_1",
        runId: "run_1",
        title: "pnpm test",
        status: "resolved",
      },
    ]);
    assert.deepEqual(state.debugEvents, []);
  });

  it("keeps raw/unknown normalized events in debug-only state", () => {
    const state = reduceOpenMeowUIState(initialOpenMeowUIState(), {
      type: "raw",
      runId: "run_1",
      data: { provider: "strange" },
    });

    assert.deepEqual(state.messages, []);
    assert.deepEqual(state.toolActivities, []);
    assert.deepEqual(state.approvals, []);
    assert.equal(state.debugEvents.length, 1);
    assert.equal(state.debugEvents[0].kind, "debug_event");
  });
});

describe("OpenMeow fixture contract", () => {
  it("renders fixture events without falling back to raw/debug UI for known event types", () => {
    const expectedTerminal = {
      "happy-path": "completed",
      "tool-approval": "completed",
      "cancelled-run": "cancelled",
      "timed-out-run": "timed_out",
    };

    for (const [fixture, terminalStatus] of Object.entries(expectedTerminal)) {
      const finalState = readFixtureEvents(fixture).reduce(
        (state, event) => reduceOpenMeowUIState(state, event),
        initialOpenMeowUIState(),
      );

      assert.equal(finalState.debugEvents.length, 0, fixture);
      assert.equal(finalState.composer.mode, "idle", fixture);
      assert.equal(finalState.composer.lastTerminalStatus, terminalStatus, fixture);
    }
  });

  it("keeps tool/approval fixture activity compact and stable across start/delta/completed events", () => {
    const finalState = readFixtureEvents("tool-approval").reduce(
      (state, event) => reduceOpenMeowUIState(state, event),
      initialOpenMeowUIState(),
    );

    assert.deepEqual(finalState.toolActivities, [
      {
        id: "run_approval:tool:exec",
        runId: "run_approval",
        title: "exec",
        phase: "completed",
        detail: "Run test command",
        preview: "tests running...",
      },
    ]);
    assert.deepEqual(finalState.approvals, [
      {
        id: "approval_exec_tests",
        runId: "run_approval",
        title: "Run pnpm test",
        status: "resolved",
      },
    ]);
  });
});

describe("OpenMeow live cancel response mapping", () => {
  it("uses a successful sessions.abort response as deterministic cancelled UI state", () => {
    const running = reduceOpenMeowUIState(initialOpenMeowUIState({ sessionKey: "session:cody" }), {
      type: "run.started",
      runId: "run_1",
      sessionKey: "session:cody",
    });
    const cancelling = { ...running, composer: markOpenMeowRunCancelling(running.composer) };

    assert.deepEqual(
      reduceOpenMeowCancelResult(cancelling, { runId: "run_1", sessionKey: "session:cody" }, {
        ok: true,
        abortedRunId: "run_1",
        status: "aborted",
      }).composer,
      {
        mode: "idle",
        activeRun: null,
        canSend: true,
        canStop: false,
        lastTerminalStatus: "cancelled",
        waitDeadlineExpired: false,
      },
    );
  });

  it("keeps the active run recoverable when cancel fails", () => {
    const running = reduceOpenMeowUIState(initialOpenMeowUIState({ sessionKey: "session:cody" }), {
      type: "run.started",
      runId: "run_1",
      sessionKey: "session:cody",
    });
    const cancelling = { ...running, composer: markOpenMeowRunCancelling(running.composer) };

    assert.deepEqual(
      reduceOpenMeowCancelResult(cancelling, { runId: "run_1", sessionKey: "session:cody" }, {
        ok: false,
        abortedRunId: "run_1",
        status: "aborted",
        error: "not active",
      }).composer,
      {
        mode: "streaming",
        activeRun: { runId: "run_1", sessionKey: "session:cody" },
        canSend: false,
        canStop: true,
        lastTerminalStatus: null,
        waitDeadlineExpired: false,
      },
    );
  });
});
