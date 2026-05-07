const TERMINAL_RUN_EVENT_TYPES = new Set([
  "run.completed",
  "run.cancelled",
  "run.timed_out",
  "run.failed",
]);

const TERMINAL_WAIT_STATUSES = new Set(["completed", "cancelled", "timed_out", "failed"]);

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isAsyncIterable(value) {
  return value && typeof value[Symbol.asyncIterator] === "function";
}

function isIterable(value) {
  return value && typeof value[Symbol.iterator] === "function";
}

function eventType(event) {
  return isObject(event) ? event.type ?? event.event : undefined;
}

function eventPayload(event) {
  if (!isObject(event)) return undefined;
  return event.data ?? event.payload ?? event;
}

function nestedRunId(event) {
  if (!isObject(event)) return undefined;
  const payload = eventPayload(event);
  return event.runId ?? event.id ?? (isObject(payload) ? payload.runId ?? payload.id : undefined);
}

function nestedSessionKey(event) {
  if (!isObject(event)) return undefined;
  const payload = eventPayload(event);
  return event.sessionKey ?? (isObject(payload) ? payload.sessionKey ?? payload.key : undefined);
}

function extractText(event) {
  const payload = eventPayload(event);
  if (typeof payload === "string") return payload;
  if (!isObject(payload)) return "";

  const candidates = [payload.delta, payload.text, payload.content, payload.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function extractToolTitle(payload) {
  if (!isObject(payload)) return "tool";
  const candidates = [payload.name, payload.toolName, payload.title, payload.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (isObject(payload.call) && typeof payload.call.name === "string") return payload.call.name;
  return "tool";
}

function extractToolDetail(payload) {
  if (!isObject(payload)) return undefined;
  return payload.input ?? payload.args ?? payload.arguments ?? payload.summary ?? payload.delta ?? payload.output;
}

function extractToolId(payload) {
  if (!isObject(payload)) return undefined;
  const candidates = [payload.id, payload.toolCallId, payload.callId, payload.toolUseId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (isObject(payload.call) && typeof payload.call.id === "string" && payload.call.id.trim()) {
    return payload.call.id;
  }
  return undefined;
}

function extractToolPreview(payload) {
  if (!isObject(payload)) return "";
  const candidates = [payload.delta, payload.preview, payload.output, payload.text, payload.content];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function extractApprovalId(payload) {
  if (!isObject(payload)) return undefined;
  const candidates = [payload.approvalId, payload.id, payload.requestId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

function extractApprovalTitle(payload) {
  if (!isObject(payload)) return "Approval requested";
  const candidates = [
    payload.commandText,
    payload.commandPreview,
    payload.summary,
    payload.title,
    payload.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "Approval requested";
}

function normalizeSessionCreateResult(result, fallbackSessionKey) {
  const sessionKey = isObject(result)
    ? result.sessionKey ?? result.key ?? result.id ?? fallbackSessionKey
    : fallbackSessionKey;
  return { sessionKey: assertNonEmptyString(sessionKey, "sessionKey") };
}

function normalizeSendResult(result, sessionKey) {
  const runId = isObject(result) ? result.runId ?? result.id ?? result.run?.id : undefined;
  const normalized = {
    runId: assertNonEmptyString(runId, "runId"),
    sessionKey,
  };
  if (isObject(result) && typeof result.status === "string") {
    normalized.status = result.status;
  }
  return normalized;
}

async function loadOpenClawFromSdk(options) {
  const { OpenClaw } = await import("@openclaw/sdk");
  return new OpenClaw({
    gateway: options.gateway ?? process.env.OPENCLAW_GATEWAY_URL ?? "auto",
    token: options.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
    password: options.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD,
  });
}

function isMissingToolsInvokeRpc(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("unknown method: tools.invoke") ||
    message.includes("OpenClaw SDK client does not expose tools.invoke()") ||
    message.includes("oc.tools.invoke is not supported")
  );
}

function resolveGatewayHttpUrl(options) {
  const rawGateway = options.gateway ?? process.env.OPENCLAW_GATEWAY_URL;
  if (typeof rawGateway !== "string" || !rawGateway.trim() || rawGateway === "auto") {
    throw new Error("OpenMeow HTTP tool fallback requires an explicit Gateway URL");
  }
  const url = new URL(rawGateway);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "/tools/invoke";
  url.search = "";
  url.hash = "";
  return url;
}

function resolveHttpBearer(options) {
  return (
    options.password ??
    process.env.OPENCLAW_GATEWAY_PASSWORD ??
    options.token ??
    process.env.OPENCLAW_GATEWAY_TOKEN
  );
}

async function invokeToolOverHttp(options, name, params) {
  if (params.confirm === true) {
    throw new Error("OpenMeow HTTP tool fallback does not support confirm: true approvals");
  }
  const url = resolveGatewayHttpUrl(options);
  const headers = { "Content-Type": "application/json" };
  const bearer = resolveHttpBearer(options);
  if (typeof bearer === "string" && bearer.trim()) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tool: name,
      args: params.args,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      idempotencyKey: params.idempotencyKey,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok && body?.ok === true) {
    return { ok: true, toolName: name, output: body.result, source: "http" };
  }
  return {
    ok: false,
    toolName: name,
    source: "http",
    error: {
      code: body?.error?.type ?? `http_${response.status}`,
      message: body?.error?.message ?? response.statusText ?? "tool invocation failed",
    },
  };
}

export function createOpenMeowSDKClient(options = {}) {
  let openClaw = options.openClaw;

  async function getOpenClaw() {
    if (!openClaw) {
      openClaw = await loadOpenClawFromSdk(options);
    }
    return openClaw;
  }

  return {
    async connect() {
      const oc = await getOpenClaw();
      if (typeof oc.connect === "function") {
        await oc.connect();
      }
    },

    async close() {
      const oc = await getOpenClaw();
      if (typeof oc.close === "function") {
        await oc.close();
      }
    },

    async listAgents() {
      const oc = await getOpenClaw();
      if (!oc.agents || typeof oc.agents.list !== "function") {
        throw new Error("OpenClaw SDK client does not expose agents.list()");
      }
      return oc.agents.list();
    },

    async getAgentIdentity(agentId) {
      assertNonEmptyString(agentId, "agentId");
      const oc = await getOpenClaw();
      if (!oc.agents || typeof oc.agents.get !== "function") {
        throw new Error("OpenClaw SDK client does not expose agents.get(id)");
      }
      const agent = await oc.agents.get(agentId);
      if (!agent || typeof agent.identity !== "function") {
        throw new Error("OpenClaw SDK agent handle does not expose identity()");
      }
      return agent.identity();
    },

    async createLaneSession(target) {
      if (!isObject(target)) {
        throw new TypeError("target must be an object");
      }
      assertNonEmptyString(target.agentId, "target.agentId");
      if (target.sessionKey) {
        return { sessionKey: assertNonEmptyString(target.sessionKey, "target.sessionKey") };
      }

      const oc = await getOpenClaw();
      if (!oc.sessions || typeof oc.sessions.create !== "function") {
        throw new Error("OpenClaw SDK client does not expose sessions.create()");
      }
      const params = { agentId: target.agentId };
      if (typeof target.label === "string" && target.label.trim()) {
        params.label = target.label;
      }
      return normalizeSessionCreateResult(await oc.sessions.create(params));
    },

    async send(sessionKey, message) {
      const key = assertNonEmptyString(sessionKey, "sessionKey");
      assertNonEmptyString(message, "message");
      const oc = await getOpenClaw();
      if (!oc.sessions || typeof oc.sessions.send !== "function") {
        throw new Error("OpenClaw SDK client does not expose sessions.send()");
      }
      return normalizeSendResult(await oc.sessions.send({ key, message }), key);
    },

    async *events(runId) {
      const id = assertNonEmptyString(runId, "runId");
      const oc = await getOpenClaw();
      if (!oc.runs || typeof oc.runs.events !== "function") {
        throw new Error("OpenClaw SDK client does not expose runs.events(runId)");
      }
      const stream = oc.runs.events(id);
      if (isAsyncIterable(stream) || isIterable(stream)) {
        yield* stream;
        return;
      }
      throw new Error("OpenClaw SDK runs.events(runId) must return an iterable event stream");
    },

    async wait(runId, timeoutMs) {
      const id = assertNonEmptyString(runId, "runId");
      const oc = await getOpenClaw();
      if (!oc.runs || typeof oc.runs.wait !== "function") {
        throw new Error("OpenClaw SDK client does not expose runs.wait(runId)");
      }
      const params = typeof timeoutMs === "number" ? { timeoutMs } : undefined;
      return oc.runs.wait(id, params);
    },

    async cancel(runId, sessionKey) {
      const id = assertNonEmptyString(runId, "runId");
      const key = assertNonEmptyString(sessionKey, "sessionKey");
      const oc = await getOpenClaw();
      if (oc.runs && typeof oc.runs.cancel === "function") {
        return oc.runs.cancel(id, key);
      }
      if (oc.sessions && typeof oc.sessions.abort === "function") {
        return oc.sessions.abort({ key, runId: id });
      }
      throw new Error("OpenClaw SDK client does not expose runs.cancel() or sessions.abort()");
    },

    async effectiveTools(sessionKey) {
      const oc = await getOpenClaw();
      if (!oc.tools || typeof oc.tools.effective !== "function") {
        throw new Error("OpenClaw SDK client does not expose tools.effective()");
      }
      const params = typeof sessionKey === "string" && sessionKey.trim() ? { sessionKey } : {};
      return oc.tools.effective(params);
    },

    async listEnvironments(params = {}) {
      if (!isObject(params)) {
        throw new TypeError("params must be an object");
      }
      const oc = await getOpenClaw();
      if (!oc.environments || typeof oc.environments.list !== "function") {
        throw new Error("OpenClaw SDK client does not expose environments.list()");
      }
      return oc.environments.list(params);
    },

    async getEnvironmentStatus(environmentId) {
      const id = assertNonEmptyString(environmentId, "environmentId");
      const oc = await getOpenClaw();
      if (!oc.environments || typeof oc.environments.status !== "function") {
        throw new Error("OpenClaw SDK client does not expose environments.status(environmentId)");
      }
      return oc.environments.status(id);
    },

    async invokeTool(name, params = {}) {
      const toolName = assertNonEmptyString(name, "name");
      if (!isObject(params)) {
        throw new TypeError("params must be an object");
      }
      const oc = await getOpenClaw();
      if (!oc.tools || typeof oc.tools.invoke !== "function") {
        return await invokeToolOverHttp(options, toolName, params);
      }
      try {
        return await oc.tools.invoke(toolName, params);
      } catch (error) {
        if (!isMissingToolsInvokeRpc(error)) {
          throw error;
        }
        return await invokeToolOverHttp(options, toolName, params);
      }
    },
  };
}

export function mapOpenClawEventToOpenMeowUIEvent(event) {
  const type = eventType(event);
  const payload = eventPayload(event);
  const runId = nestedRunId(event);

  if (type === "assistant.delta") {
    return { kind: "assistant_delta", runId, text: extractText(event) };
  }

  if (type === "assistant.message") {
    return { kind: "assistant_message", runId, text: extractText(event) };
  }

  if (type === "thinking.delta") {
    return { kind: "thinking_delta", runId, text: extractText(event) };
  }

  if (typeof type === "string" && type.startsWith("tool.call.")) {
    const phase = type.slice("tool.call.".length);
    return {
      kind: "tool_activity",
      phase,
      runId,
      title: extractToolTitle(payload),
      detail: extractToolDetail(payload),
    };
  }

  if (type === "approval.requested" || type === "approval.resolved") {
    return {
      kind: "approval_card",
      phase: type === "approval.requested" ? "requested" : "resolved",
      runId,
      approvalId: extractApprovalId(payload),
      title: extractApprovalTitle(payload),
    };
  }

  if (TERMINAL_RUN_EVENT_TYPES.has(type)) {
    return { kind: "run_terminal", runId, status: type.slice("run.".length) };
  }

  if (type === "run.created") {
    return { kind: "run_created", runId, sessionKey: nestedSessionKey(event) };
  }

  if (type === "run.started") {
    return { kind: "run_active", runId, sessionKey: nestedSessionKey(event) };
  }

  return { kind: "debug_event", type, runId, raw: event };
}

export function initialOpenMeowRunState() {
  return {
    mode: "idle",
    activeRun: null,
    canSend: true,
    canStop: false,
    lastTerminalStatus: null,
    waitDeadlineExpired: false,
  };
}

export function reduceOpenMeowRunState(state, event) {
  const current = state ?? initialOpenMeowRunState();
  const type = eventType(event);

  if (type === "run.started") {
    const runId = assertNonEmptyString(nestedRunId(event), "runId");
    const sessionKey =
      nestedSessionKey(event) ??
      (current.activeRun?.runId === runId ? current.activeRun.sessionKey : undefined);
    return {
      mode: "streaming",
      activeRun: {
        runId,
        sessionKey: assertNonEmptyString(sessionKey, "sessionKey"),
      },
      canSend: false,
      canStop: true,
      lastTerminalStatus: null,
      waitDeadlineExpired: false,
    };
  }

  if (TERMINAL_RUN_EVENT_TYPES.has(type)) {
    return {
      mode: "idle",
      activeRun: null,
      canSend: true,
      canStop: false,
      lastTerminalStatus: type.slice("run.".length),
      waitDeadlineExpired: false,
    };
  }

  return current;
}

export function markOpenMeowRunCancelling(state) {
  const current = state ?? initialOpenMeowRunState();
  if (!current.activeRun) {
    return current;
  }
  return {
    ...current,
    mode: "cancelling",
    canSend: false,
    canStop: false,
  };
}

export function normalizeOpenMeowWaitResult(result) {
  const status = isObject(result) && typeof result.status === "string" ? result.status : "unknown";
  const runId = isObject(result) ? result.runId : undefined;
  if (status === "accepted") {
    return { kind: "wait_deadline", terminal: false, runId, status, raw: result };
  }
  return {
    kind: TERMINAL_WAIT_STATUSES.has(status) ? "terminal" : "unknown",
    terminal: TERMINAL_WAIT_STATUSES.has(status),
    runId,
    status,
    raw: result,
  };
}

export function initialOpenMeowUIState(options = {}) {
  return {
    sessionKey: typeof options.sessionKey === "string" ? options.sessionKey : undefined,
    composer: initialOpenMeowRunState(),
    messages: [],
    assistantDrafts: {},
    toolActivities: [],
    approvals: [],
    debugEvents: [],
  };
}

function appendAssistantMessage(state, params) {
  const id = `assistant:${params.runId ?? "unknown"}:${state.messages.length}`;
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        id,
        role: "assistant",
        runId: params.runId,
        text: params.text,
        streaming: false,
      },
    ],
  };
}

function removeDraft(drafts, runId) {
  if (!runId || !(runId in drafts)) return drafts;
  const next = { ...drafts };
  delete next[runId];
  return next;
}

function upsertToolActivity(state, event, uiEvent) {
  const payload = eventPayload(event);
  const runId = uiEvent.runId;
  const title = uiEvent.title;
  const id =
    extractToolId(payload) ??
    (runId && title ? `${runId}:tool:${title}` : `${runId ?? "unknown"}:tool:${state.toolActivities.length}`);
  const existingIndex = state.toolActivities.findIndex((activity) => activity.id === id);
  const existing = existingIndex >= 0 ? state.toolActivities[existingIndex] : undefined;
  const preview = extractToolPreview(payload);
  const nextActivity = {
    id,
    runId,
    title: existing?.title ?? title,
    phase: uiEvent.phase,
    detail: existing?.detail ?? uiEvent.detail,
    ...(existing?.preview || preview ? { preview: [existing?.preview, preview].filter(Boolean).join("") } : {}),
  };
  const toolActivities = [...state.toolActivities];
  if (existingIndex >= 0) {
    toolActivities[existingIndex] = nextActivity;
  } else {
    toolActivities.push(nextActivity);
  }
  return { ...state, toolActivities };
}

function upsertApproval(state, event, uiEvent) {
  const payload = eventPayload(event);
  const id = uiEvent.approvalId ?? `${uiEvent.runId ?? "unknown"}:approval:${state.approvals.length}`;
  const existingIndex = state.approvals.findIndex((approval) => approval.id === id);
  const existing = existingIndex >= 0 ? state.approvals[existingIndex] : undefined;
  const title =
    uiEvent.phase === "resolved" && existing ? existing.title : uiEvent.title ?? extractApprovalTitle(payload);
  const nextApproval = {
    id,
    runId: uiEvent.runId,
    title,
    status: uiEvent.phase,
  };
  const approvals = [...state.approvals];
  if (existingIndex >= 0) {
    approvals[existingIndex] = nextApproval;
  } else {
    approvals.push(nextApproval);
  }
  return { ...state, approvals };
}

function cancelSucceededForRun(result, runId) {
  if (!isObject(result) || result.ok === false) return false;
  const status = typeof result.status === "string" ? result.status.toLowerCase() : undefined;
  if (status === "aborted" || status === "cancelled" || status === "canceled") return true;
  if (result.aborted === true) return true;
  if (typeof result.abortedRunId === "string" && result.abortedRunId === runId) return true;
  if (Array.isArray(result.runIds) && result.runIds.includes(runId) && result.aborted !== false) return true;
  return false;
}

export function reduceOpenMeowCancelResult(state, run, result) {
  const current = state ?? initialOpenMeowUIState();
  const runId = assertNonEmptyString(run?.runId ?? current.composer.activeRun?.runId, "runId");
  const sessionKey = assertNonEmptyString(
    run?.sessionKey ?? current.composer.activeRun?.sessionKey,
    "sessionKey",
  );

  if (cancelSucceededForRun(result, runId)) {
    return {
      ...current,
      composer: reduceOpenMeowRunState(current.composer, {
        type: "run.cancelled",
        runId,
        sessionKey,
      }),
    };
  }

  return {
    ...current,
    composer: {
      mode: "streaming",
      activeRun: { runId, sessionKey },
      canSend: false,
      canStop: true,
      lastTerminalStatus: null,
      waitDeadlineExpired: false,
    },
  };
}

export function reduceOpenMeowUIState(state, event) {
  let next = state ?? initialOpenMeowUIState();
  const uiEvent = mapOpenClawEventToOpenMeowUIEvent(event);

  if (uiEvent.kind === "run_active" || uiEvent.kind === "run_terminal") {
    next = { ...next, composer: reduceOpenMeowRunState(next.composer, event) };
  }

  if (uiEvent.kind === "assistant_delta") {
    const runId = uiEvent.runId ?? "unknown";
    return {
      ...next,
      assistantDrafts: {
        ...next.assistantDrafts,
        [runId]: `${next.assistantDrafts[runId] ?? ""}${uiEvent.text}`,
      },
    };
  }

  if (uiEvent.kind === "assistant_message") {
    const runId = uiEvent.runId ?? "unknown";
    const text = uiEvent.text || next.assistantDrafts[runId] || "";
    return {
      ...appendAssistantMessage(next, { runId, text }),
      assistantDrafts: removeDraft(next.assistantDrafts, runId),
    };
  }

  if (uiEvent.kind === "tool_activity") {
    return upsertToolActivity(next, event, uiEvent);
  }

  if (uiEvent.kind === "approval_card") {
    return upsertApproval(next, event, uiEvent);
  }

  if (uiEvent.kind === "run_terminal") {
    const runId = uiEvent.runId ?? "unknown";
    const draft = next.assistantDrafts[runId];
    if (draft) {
      return {
        ...appendAssistantMessage(next, { runId, text: draft }),
        assistantDrafts: removeDraft(next.assistantDrafts, runId),
      };
    }
    return next;
  }

  if (uiEvent.kind === "debug_event") {
    return { ...next, debugEvents: [...next.debugEvents, uiEvent] };
  }

  return next;
}
