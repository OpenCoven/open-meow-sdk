import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../fixtures/openclaw-events/", import.meta.url);
const allowedTerminal = new Set(["run.completed", "run.failed", "run.cancelled", "run.timed_out"]);
const required = ["version", "id", "ts", "type", "data"];
let checked = 0;

for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
  const path = join(dir.pathname, file);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error(`${file}: empty fixture`);
  let terminalCount = 0;
  const ids = new Set();

  lines.forEach((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: invalid JSON: ${error.message}`);
    }

    for (const key of required) {
      if (!(key in event)) throw new Error(`${file}:${index + 1}: missing ${key}`);
    }
    if (event.version !== 1) throw new Error(`${file}:${index + 1}: version must be 1`);
    if (typeof event.id !== "string" || !event.id) throw new Error(`${file}:${index + 1}: id must be string`);
    if (ids.has(event.id)) throw new Error(`${file}:${index + 1}: duplicate id ${event.id}`);
    ids.add(event.id);
    if (typeof event.ts !== "number") throw new Error(`${file}:${index + 1}: ts must be number`);
    if (typeof event.type !== "string" || !event.type) throw new Error(`${file}:${index + 1}: type must be string`);
    if (typeof event.runId !== "string" || !event.runId) throw new Error(`${file}:${index + 1}: runId required for fixture events`);
    if (allowedTerminal.has(event.type)) terminalCount += 1;
    checked += 1;
  });

  if (terminalCount !== 1) throw new Error(`${file}: expected exactly one terminal run event, got ${terminalCount}`);
}

console.log(`Validated ${checked} fixture events.`);
