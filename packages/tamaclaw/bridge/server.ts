import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  CHART_TYPES,
  DASHBOARD_TTL_DEFAULT,
  DEFAULT_PORT,
  MOODS,
  NOTIFY_LEVELS,
  NOTIFY_TTL_DEFAULTS,
  SHOW_TTL_DEFAULT,
  SKINS,
  type DashboardEvent,
  type DashboardRequest,
  type Mood,
  type MoodRequest,
  type NotifyRequest,
  type SayRequest,
  type ServerEvent,
  type ShowEvent,
  type Skin,
} from "../shared/protocol.ts";
import { createEngine } from "./tts.ts";
import { SayQueue } from "./say-queue.ts";
import { wakeDisplay } from "./wake.ts";

const VERSION = "0.1.0";

const here = path.dirname(fileURLToPath(import.meta.url));
// When running from compiled dist/bridge/, display is at ../../display;
// when running from source bridge/, it's at ../display.
const displayCandidate = path.resolve(here, "../display");
const displayRoot = existsSync(displayCandidate)
  ? displayCandidate
  : path.resolve(here, "../../display");

export interface BridgeOptions {
  port?: number;
  log?: (msg: string) => void;
}

export interface BridgeHandle {
  port: number;
  close: () => Promise<void>;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (stateless)
// ---------------------------------------------------------------------------

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 512 * 1024) reject(new HttpError(413, "body too large"));
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("expected a JSON object");
        }
        resolve(parsed as Record<string, unknown>);
      } catch (err) {
        reject(new HttpError(400, `invalid JSON body: ${(err as Error).message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(data));
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `"${key}" (non-empty string) is required`);
  }
  return value.trim();
}

function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `"${key}" must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function optionalNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, `"${key}" must be a non-negative number`);
  }
  return value;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export function startBridge(options: BridgeOptions = {}): Promise<BridgeHandle> {
  const port = options.port ?? Number(process.env.TAMACLAW_PORT ?? DEFAULT_PORT);
  const log = options.log ?? ((msg: string) => console.log(msg));

  const wss = new WebSocketServer({ noServer: true });
  let lastMood: Mood = "idle";
  /** Only replayed once explicitly set (the display persists its own choice). */
  let lastSkin: Skin | null = (process.env.TAMACLAW_SKIN as Skin) || null;
  /** Live widgets so a display that reconnects gets its dashboard back. */
  const widgets = new Map<string, { event: DashboardEvent; expiresAt: number | null }>();
  /** Current show card, replayed to reconnecting displays until it expires. */
  let lastShow: { event: ShowEvent; expiresAt: number } | null = null;

  function broadcast(event: ServerEvent): void {
    if (event.type === "mood") lastMood = event.value;
    if (event.type === "skin") lastSkin = event.value;
    if (event.type === "show") lastShow = { event, expiresAt: Date.now() + event.ttl };
    if (event.type === "show:clear") lastShow = null;
    if (event.type === "say:start") lastMood = event.mood;
    if (event.type === "say:end") lastMood = "idle";
    if (event.type === "dashboard") {
      widgets.set(event.widget, {
        event,
        expiresAt: event.pin ? null : Date.now() + event.ttl,
      });
    }
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  const engine = createEngine();
  const sayQueue = new SayQueue(engine, broadcast);

  wss.on("connection", (socket) => {
    const hello: ServerEvent = {
      type: "hello",
      server: "tamaclaw-bridge",
      version: VERSION,
      queued: sayQueue.length,
    };
    socket.send(JSON.stringify(hello));
    socket.send(JSON.stringify({ type: "mood", value: lastMood } satisfies ServerEvent));
    if (lastSkin && SKINS.includes(lastSkin)) {
      socket.send(JSON.stringify({ type: "skin", value: lastSkin } satisfies ServerEvent));
    }
    const now = Date.now();
    for (const [id, w] of widgets) {
      if (w.expiresAt !== null && w.expiresAt <= now) {
        widgets.delete(id);
        continue;
      }
      const remaining = w.expiresAt === null ? w.event.ttl : Math.max(1_000, w.expiresAt - now);
      socket.send(JSON.stringify({ ...w.event, ttl: remaining } satisfies DashboardEvent));
    }
    if (lastShow) {
      if (lastShow.expiresAt <= now) lastShow = null;
      else {
        socket.send(
          JSON.stringify({
            ...lastShow.event,
            ttl: Math.max(1_000, lastShow.expiresAt - now),
          } satisfies ShowEvent),
        );
      }
    }
  });

  // ----------------------------------------------------------------- routes

  function handleSay(body: Record<string, unknown>) {
    const req: SayRequest = {
      text: requireString(body, "text"),
      mood: optionalEnum(body, "mood", MOODS),
      voice: typeof body.voice === "string" ? body.voice : undefined,
      rate: optionalNumber(body, "rate"),
    };
    wakeDisplay(); // screen on before the voice starts
    const id = sayQueue.enqueue(req);
    return { ok: true, id, queued: sayQueue.length };
  }

  function handleNotify(body: Record<string, unknown>) {
    const level = optionalEnum(body, "level", NOTIFY_LEVELS) ?? "info";
    const req: Required<Pick<NotifyRequest, "title" | "level">> & NotifyRequest = {
      title: requireString(body, "title"),
      body: typeof body.body === "string" ? body.body : undefined,
      level,
      ttl: optionalNumber(body, "ttl") ?? NOTIFY_TTL_DEFAULTS[level],
      sound: typeof body.sound === "boolean" ? body.sound : level === "critical",
    };
    wakeDisplay();
    const interrupted = level === "critical" ? sayQueue.interruptCurrent() : false;
    const id = randomUUID();
    broadcast({
      type: "notify",
      id,
      title: req.title,
      body: req.body,
      level: req.level,
      ttl: req.ttl!,
      sound: req.sound!,
    });
    return { ok: true, id, interruptedSpeech: interrupted };
  }

  function handleDashboard(body: Record<string, unknown>) {
    const chart = optionalEnum(body, "chart", CHART_TYPES) ?? "bar";
    const data = body.data;
    const looksLikeData =
      Array.isArray(data) ||
      (typeof data === "object" && data !== null && Array.isArray((data as { labels?: unknown }).labels));
    if (!looksLikeData) {
      throw new HttpError(
        400,
        '"data" must be an array of {label, value} or {labels: [...], series: [{label?, values}]}',
      );
    }
    const req: DashboardRequest = {
      widget: requireString(body, "widget"),
      chart,
      title: requireString(body, "title"),
      data: data as DashboardRequest["data"],
      pin: body.pin === true,
      ttl: optionalNumber(body, "ttl") ?? DASHBOARD_TTL_DEFAULT,
    };
    wakeDisplay();
    broadcast({
      type: "dashboard",
      widget: req.widget,
      chart: req.chart,
      title: req.title,
      data: req.data,
      pin: req.pin!,
      ttl: req.ttl!,
    });
    return { ok: true, widget: req.widget };
  }

  function handleMood(body: Record<string, unknown>) {
    const value = optionalEnum(body, "value", MOODS) ?? optionalEnum(body, "mood", MOODS);
    if (!value) throw new HttpError(400, `"value" must be one of: ${MOODS.join(", ")}`);
    broadcast({ type: "mood", value } satisfies ServerEvent);
    const req: MoodRequest = { value };
    return { ok: true, value: req.value };
  }

  function handleShow(body: Record<string, unknown>) {
    if (body.clear === true) {
      broadcast({ type: "show:clear" });
      return { ok: true, cleared: true };
    }
    const bodyText = typeof body.body === "string" ? body.body : undefined;
    const html = typeof body.html === "string" ? body.html : undefined;
    if (!bodyText?.trim() && !html?.trim()) {
      throw new HttpError(400, 'at least one of "body" (text) or "html" is required');
    }
    if (html && html.length > 256 * 1024) {
      throw new HttpError(413, '"html" too large (max 256KB)');
    }
    wakeDisplay();
    const id = randomUUID();
    broadcast({
      type: "show",
      id,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      source: typeof body.source === "string" ? body.source : undefined,
      body: bodyText,
      html,
      ttl: optionalNumber(body, "ttl") ?? SHOW_TTL_DEFAULT,
    });
    if (typeof body.say === "string" && body.say.trim()) {
      sayQueue.enqueue({ text: body.say.trim() });
    }
    return { ok: true, id };
  }

  function handleSkin(body: Record<string, unknown>) {
    const value = optionalEnum(body, "value", SKINS) ?? optionalEnum(body, "skin", SKINS);
    if (!value) throw new HttpError(400, `"value" must be one of: ${SKINS.join(", ")}`);
    broadcast({ type: "skin", value } satisfies ServerEvent);
    return { ok: true, value };
  }

  function serveStatic(res: ServerResponse, urlPath: string): void {
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.join(displayRoot, rel);
    if (!file.startsWith(displayRoot) || !existsSync(file)) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  }

  // ----------------------------------------------------------------- server

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          version: VERSION,
          tts: engine.name,
          displays: wss.clients.size,
          sayQueue: sayQueue.length,
          widgets: widgets.size,
          skin: lastSkin,
        });
        return;
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        switch (url.pathname) {
          case "/say":
            sendJson(res, 200, handleSay(body));
            return;
          case "/notify":
            sendJson(res, 200, handleNotify(body));
            return;
          case "/dashboard":
            sendJson(res, 200, handleDashboard(body));
            return;
          case "/mood":
            sendJson(res, 200, handleMood(body));
            return;
          case "/skin":
            sendJson(res, 200, handleSkin(body));
            return;
          case "/show":
            sendJson(res, 200, handleShow(body));
            return;
          default:
            sendJson(res, 404, { ok: false, error: `unknown endpoint ${url.pathname}` });
            return;
        }
      }
      if (req.method === "GET") {
        serveStatic(res, url.pathname);
        return;
      }
      sendJson(res, 405, { ok: false, error: "method not allowed" });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      sendJson(res, status, { ok: false, error: (err as Error).message });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      log(`🥚🦞 tamaclaw bridge v${VERSION}`);
      log(`   display : http://localhost:${port}`);
      log(`   ws      : ws://localhost:${port}/ws`);
      log(`   tts     : ${engine.name}`);
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            sayQueue.interruptCurrent();
            for (const client of wss.clients) client.terminate();
            wss.close();
            server.close(() => res());
          }),
      });
    });
  });
}
