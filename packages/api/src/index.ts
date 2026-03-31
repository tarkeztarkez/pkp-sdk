import { startServer } from "./server";

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(`pkp api

Commands:
  serve [--host HOST] [--port PORT]
`);
} else if (command !== "serve") {
  throw new Error(`Unknown api command: ${command}`);
} else {
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < rest.length; index++) {
    const current = rest[index];
    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    index++;
  }

  const host = typeof flags.get("host") === "string" ? String(flags.get("host")) : "127.0.0.1";
  const port = parsePort(typeof flags.get("port") === "string" ? String(flags.get("port")) : undefined, 3000);
  const server = startServer({ host, port });

  console.log(`PKP server listening on http://${server.hostname}:${server.port}`);
  console.log(`OpenAPI document: http://${server.hostname}:${server.port}/openapi.json`);
}
