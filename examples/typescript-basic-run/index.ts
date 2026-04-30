import { OpenClaw } from "@openclaw/sdk";

const oc = new OpenClaw({
  gateway: process.env.OPENCLAW_GATEWAY_URL ?? "auto",
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  password: process.env.OPENCLAW_GATEWAY_PASSWORD,
});

try {
  const agent = await oc.agents.get(process.env.OPENCLAW_AGENT_ID ?? "main");
  const run = await agent.run({
    input: process.argv.slice(2).join(" ") || "Say hello from the OpenClaw SDK.",
    label: "sdk-basic-run-example",
  });

  for await (const event of run.events()) {
    if (event.type === "assistant.delta") {
      process.stdout.write(String(event.data));
    }

    if (
      event.type === "run.completed" ||
      event.type === "run.failed" ||
      event.type === "run.cancelled" ||
      event.type === "run.timed_out"
    ) {
      break;
    }
  }

  const result = await run.wait({ timeoutMs: 30_000 });
  console.log("\nstatus:", result.status);
} finally {
  await oc.close();
}
