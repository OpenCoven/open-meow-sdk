# OpenMeow + OpenClaw SDK Architecture

## Review thesis

The OpenClaw SDK should become the **external app/client facade** for OpenClaw. OpenMeow should dogfood it first because OpenMeow is exactly the kind of app the SDK exists for: a real UI that needs agents, sessions, streaming, cancellation, approvals, tools, and eventually artifacts.

The key boundary is:

> OpenMeow should call `@openclaw/sdk`, and `@openclaw/sdk` should call OpenClaw Gateway RPCs. OpenMeow should not depend on OpenClaw internals, plugin runtime APIs, or shell commands.

## 1. System boundary

```mermaid
flowchart LR
  subgraph App[External App Layer]
    OM[OpenMeow\nmacOS notch inbox]
    OMUI[SwiftUI / AppKit UI]
    OMSDK[OpenMeow SDK Adapter\nSwift/TS bridge or local wrapper]
  end

  subgraph SDK[Public App SDK]
    OCSDK["@openclaw/sdk"]
    Client[OpenClaw client]
    Events[Normalized event stream]
    Namespaces[agents / sessions / runs / models / tools / approvals]
  end

  subgraph Gateway[OpenClaw Gateway Boundary]
    RPC[Gateway RPC methods]
    WS[WebSocket transport]
    HTTP[HTTP helpers\nwhere applicable]
    Auth[Gateway auth\ntoken/password/device]
  end

  subgraph Runtime[OpenClaw Runtime]
    AgentLoop[Agent loop]
    Sessions[Session store]
    Tools[Tool policy + tool registry]
    Approvals[Approval system]
    Plugins[Plugin SDK runtime\ninternal only]
    ACP[ACP / harness adapters]
  end

  OM --> OMUI
  OMUI --> OMSDK
  OMSDK --> OCSDK
  OCSDK --> Client
  OCSDK --> Events
  OCSDK --> Namespaces
  Client --> WS
  Client --> RPC
  Client --> Auth
  RPC --> AgentLoop
  RPC --> Sessions
  RPC --> Tools
  RPC --> Approvals
  Tools --> Plugins
  AgentLoop --> ACP

  classDef app fill:#111827,stroke:#a78bfa,color:#fff
  classDef sdk fill:#172554,stroke:#38bdf8,color:#fff
  classDef gw fill:#312e81,stroke:#818cf8,color:#fff
  classDef rt fill:#064e3b,stroke:#34d399,color:#fff
  class OM,OMUI,OMSDK app
  class OCSDK,Client,Events,Namespaces sdk
  class RPC,WS,HTTP,Auth gw
  class AgentLoop,Sessions,Tools,Approvals,Plugins,ACP rt
```

## 2. SDK vs Plugin SDK

```mermaid
flowchart TB
  Question{Where does code run?}
  External[Outside OpenClaw\napps, scripts, dashboards, IDEs, OpenMeow]
  Internal[Inside OpenClaw\ntrusted extension runtime]

  Question --> External
  Question --> Internal

  External --> AppSDK[Use @openclaw/sdk]
  AppSDK --> Gateway[Gateway RPC + events]
  Gateway --> Runtime[OpenClaw runtime]

  Internal --> PluginSDK[Use plugin SDK]
  PluginSDK --> Extend[Register tools, channels, providers, hooks, harnesses]
  Extend --> Runtime

  AppSDK -. must not import .-> PluginSDK
  PluginSDK -. should not expose app client objects .-> AppSDK
```

**Rule:** OpenMeow belongs on the left side. Desktop-use, channels, providers, and tool registrations belong on the right side.

## 3. OpenMeow run lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant OpenMeow
  participant SDK as @openclaw/sdk
  participant Gateway as OpenClaw Gateway
  participant Agent as Agent Loop
  participant Tools as Tools/Approvals

  User->>OpenMeow: Send prompt / toss task
  OpenMeow->>SDK: oc.sessions.create or session.send
  SDK->>Gateway: sessions.create / sessions.send / agent
  Gateway->>Agent: enqueue run
  Gateway-->>SDK: runId + sessionKey
  SDK-->>OpenMeow: Run object

  par Stream events
    Agent-->>Gateway: assistant/tool/lifecycle events
    Gateway-->>SDK: raw Gateway events
    SDK-->>OpenMeow: normalized OpenClawEvent
    OpenMeow-->>User: streaming message + status
  and Wait for result
    OpenMeow->>SDK: run.wait()
    SDK->>Gateway: agent.wait
    Gateway-->>SDK: terminal or accepted result
    SDK-->>OpenMeow: RunResult
  end

  opt Tool/exec approval needed
    Tools-->>Gateway: approval.requested
    Gateway-->>SDK: approval event
    SDK-->>OpenMeow: approval.requested
    User->>OpenMeow: approve/deny
    OpenMeow->>SDK: approvals.respond
    SDK->>Gateway: exec/plugin approval RPC
  end
```

## 4. Event normalization contract

```mermaid
stateDiagram-v2
  [*] --> Queued: run.created / run.queued
  Queued --> Started: run.started
  Started --> Streaming: assistant.delta / thinking.delta
  Started --> Tooling: tool.call.started
  Streaming --> Streaming: assistant.delta
  Streaming --> Tooling: tool.call.started
  Tooling --> Tooling: tool.call.delta
  Tooling --> Streaming: tool.call.completed
  Tooling --> Failed: tool.call.failed
  Started --> Approval: approval.requested
  Tooling --> Approval: approval.requested
  Approval --> Started: approval.resolved
  Streaming --> Completed: run.completed
  Started --> Cancelled: run.cancelled
  Streaming --> Cancelled: run.cancelled
  Started --> TimedOut: run.timed_out
  Streaming --> TimedOut: run.timed_out
  Started --> Failed: run.failed
  Completed --> [*]
  Cancelled --> [*]
  TimedOut --> [*]
  Failed --> [*]
```

OpenMeow should build UI state from normalized events, not provider-native raw events. Raw events remain available for debugging.

## 5. Runtime and environment direction

```mermaid
flowchart LR
  RunRequest[SDK RunCreateParams] --> Runtime{runtime}
  RunRequest --> Environment{environment}
  RunRequest --> Workspace{workspace}

  Runtime --> Auto[auto]
  Runtime --> Embedded[embedded\npi/codex]
  Runtime --> CLI[cli\nclaude-cli/etc]
  Runtime --> ACP[acp\nclaude/cursor/gemini/opencode]
  Runtime --> ManagedRuntime[managed runtime]

  Environment --> Local[local Gateway]
  Environment --> Node[node host]
  Environment --> ManagedEnv[managed/cloud/testbox]
  Environment --> Ephemeral[ephemeral workspace]

  Workspace --> CWD[cwd]
  Workspace --> Repo[repo/ref]
  Workspace --> Worktree[future worktree]

  Auto --> Gateway[Gateway dispatch]
  Embedded --> Gateway
  CLI --> Gateway
  ACP --> Gateway
  ManagedRuntime --> Gateway
  Local --> Gateway
  Node --> Gateway
  ManagedEnv --> Gateway
  Ephemeral --> Gateway
```

Current SDK can discover environments read-only through `environments.list/status`, but run-level runtime/environment/workspace selection and provisioning should still reject unsupported fields explicitly rather than silently ignoring them.

## 6. OpenMeow module cut

```mermaid
flowchart TB
  subgraph OpenMeow[OpenMeow app]
    UI[Notch inbox UI]
    Composer[Composer / toss action]
    Lane[Lane/session view]
    Store[Local UI state store]
    Adapter[OpenMeowSDKClient]
  end

  subgraph SDKLayer[SDK layer]
    OC[OpenClaw client]
    Run[Run object]
    EventStream[Event stream adapter]
  end

  UI --> Composer
  UI --> Lane
  Composer --> Adapter
  Lane --> Store
  Adapter --> OC
  OC --> Run
  Run --> EventStream
  EventStream --> Store
  Store --> UI
```

OpenMeow should keep local UI conversation state distinct from OpenClaw runtime session state. The SDK adapter maps between them.

## 7. Public contract principles

1. **Gateway is the protocol boundary.** Apps should not import OpenClaw internals.
2. **SDK should be boring and stable.** High-level nouns should not leak implementation-specific runtime details.
3. **Normalized events are product-critical.** UI apps need stable event names and status semantics.
4. **Unsupported future nouns should throw loudly.** No silent fallback for runtime/environment/artifact/task APIs.
5. **Plugin SDK stays separate.** It extends OpenClaw from inside; it is not the app client SDK.
