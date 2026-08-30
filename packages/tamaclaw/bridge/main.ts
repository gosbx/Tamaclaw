#!/usr/bin/env node
// Standalone entry: run the bridge without OpenClaw (dev / LaunchAgent / npx tamaclaw).
//   node bridge/main.ts     — or from the repo root: npm run dev
import { startBridge } from "./server.ts";

const { port } = await startBridge();
console.log(
  `   try     : curl -X POST localhost:${port}/say -H 'content-type: application/json' -d '{"text":"hola, soy Tamaclaw","mood":"happy"}'`,
);
