export type OpenMeowLaneTarget = {
  agentId: string;
  label?: string;
  sessionKey?: string;
};

export type OpenMeowSendResult = {
  runId: string;
  sessionKey: string;
  status?: string;
};

export type OpenMeowRunRef = {
  runId: string;
  sessionKey: string;
};

export type OpenMeowRunState = {
  mode: "idle" | "streaming" | "cancelling";
  activeRun: OpenMeowRunRef | null;
  canSend: boolean;
  canStop: boolean;
  lastTerminalStatus: "completed" | "cancelled" | "timed_out" | "failed" | null;
  waitDeadlineExpired: boolean;
};

export type OpenMeowWaitResult =
  | {
      kind: "wait_deadline";
      terminal: false;
      runId?: string;
      status: "accepted";
      raw: unknown;
    }
  | {
      kind: "terminal" | "unknown";
      terminal: boolean;
      runId?: string;
      status: string;
      raw: unknown;
    };

export type OpenMeowMessage = {
  id: string;
  role: "assistant";
  runId?: string;
  text: string;
  streaming: boolean;
};

export type OpenMeowToolActivity = {
  id: string;
  runId?: string;
  title: string;
  phase: string;
  detail?: unknown;
  preview?: string;
};

export type OpenMeowApprovalCard = {
  id: string;
  runId?: string;
  title: string;
  status: "requested" | "resolved";
};

export type OpenMeowLaneUIState = {
  sessionKey?: string;
  composer: OpenMeowRunState;
  messages: OpenMeowMessage[];
  assistantDrafts: Record<string, string>;
  toolActivities: OpenMeowToolActivity[];
  approvals: OpenMeowApprovalCard[];
  debugEvents: OpenMeowUIEvent[];
};

export type OpenMeowUIEvent =
  | { kind: "run_created"; runId?: string; sessionKey?: string }
  | { kind: "run_active"; runId?: string; sessionKey?: string }
  | { kind: "assistant_delta"; runId?: string; text: string }
  | { kind: "assistant_message"; runId?: string; text: string }
  | { kind: "thinking_delta"; runId?: string; text: string }
  | {
      kind: "tool_activity";
      phase: string;
      runId?: string;
      title: string;
      detail?: unknown;
    }
  | {
      kind: "approval_card";
      phase: "requested" | "resolved";
      runId?: string;
      approvalId?: string;
      title: string;
    }
  | { kind: "run_terminal"; runId?: string; status: "completed" | "cancelled" | "timed_out" | "failed" }
  | { kind: "debug_event"; type?: unknown; runId?: string; raw: unknown };

export type OpenMeowSDKClient = {
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
};

export type OpenMeowSDKClientOptions = {
  openClaw?: unknown;
  gateway?: string;
  token?: string;
  password?: string;
};

export function createOpenMeowSDKClient(options?: OpenMeowSDKClientOptions): OpenMeowSDKClient;
export function mapOpenClawEventToOpenMeowUIEvent(event: unknown): OpenMeowUIEvent;
export function initialOpenMeowRunState(): OpenMeowRunState;
export function reduceOpenMeowRunState(state: OpenMeowRunState | undefined, event: unknown): OpenMeowRunState;
export function markOpenMeowRunCancelling(state: OpenMeowRunState | undefined): OpenMeowRunState;
export function normalizeOpenMeowWaitResult(result: unknown): OpenMeowWaitResult;
export function initialOpenMeowUIState(options?: { sessionKey?: string }): OpenMeowLaneUIState;
export function reduceOpenMeowUIState(state: OpenMeowLaneUIState | undefined, event: unknown): OpenMeowLaneUIState;
