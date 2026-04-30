import {
  createOpenMeowSDKClient,
  initialOpenMeowUIState,
  mapOpenClawEventToOpenMeowUIEvent,
  normalizeOpenMeowWaitResult,
  reduceOpenMeowUIState,
} from "../../src/index.js";

const client = createOpenMeowSDKClient({
  gateway: process.env.OPENCLAW_GATEWAY_URL ?? "auto",
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  password: process.env.OPENCLAW_GATEWAY_PASSWORD,
});

let uiState = initialOpenMeowUIState();

try {
  await client.connect();

  const agentId = process.env.OPENCLAW_AGENT_ID ?? "main";
  const session = await client.createLaneSession({
    agentId,
    label: "openmeow-sdk-basic-run-example",
  });

  uiState = { ...uiState, sessionKey: session.sessionKey };

  const run = await client.send(
    session.sessionKey,
    process.argv.slice(2).join(" ") || "Say hello from the OpenMeow SDK adapter.",
  );

  uiState = reduceOpenMeowUIState(uiState, {
    type: "run.started",
    runId: run.runId,
    sessionKey: run.sessionKey,
  });

  for await (const event of client.events(run.runId)) {
    uiState = reduceOpenMeowUIState(uiState, event);
    const uiEvent = mapOpenClawEventToOpenMeowUIEvent(event);

    if (uiEvent.kind === "assistant_delta") {
      process.stdout.write(uiEvent.text);
    }

    if (uiEvent.kind === "approval_card" && uiEvent.phase === "requested") {
      console.log(`\napproval requested: ${uiEvent.title}`);
    }

    if (uiEvent.kind === "tool_activity" && uiEvent.phase === "started") {
      console.log(`\ntool: ${uiEvent.title}`);
    }

    if (uiEvent.kind === "run_terminal") {
      break;
    }
  }

  const wait = normalizeOpenMeowWaitResult(await client.wait(run.runId, 30_000));
  console.log("\nwait:", wait.status, "terminal:", wait.terminal);
  console.log(
    "composer:",
    uiState.composer.mode,
    "canSend:",
    uiState.composer.canSend,
    "canStop:",
    uiState.composer.canStop,
  );
  console.log(
    "ui:",
    `${uiState.messages.length} messages,`,
    `${uiState.toolActivities.length} tools,`,
    `${uiState.approvals.length} approvals,`,
    `${uiState.debugEvents.length} debug events`,
  );
} finally {
  await client.close();
}
