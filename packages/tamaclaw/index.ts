// Tamaclaw OpenClaw plugin. Self-contained package: this entry registers the
// agent tools AND a gateway service that runs the bridge (REST + WebSocket +
// TTS) and serves the display app — installing the plugin installs everything.

import type {
  ChartType,
  DashboardRequest,
  Mood,
  NotifyLevel,
  NotifyRequest,
  SayRequest,
  Skin,
} from "./shared/protocol.ts";
import { CHART_TYPES, DEFAULT_PORT, MOODS, NOTIFY_LEVELS, SKINS } from "./shared/protocol.ts";

// Minimal structural typing of the OpenClaw plugin API (external plugins
// can't import kopenclaw internals). Matches src/plugins/types.ts.
type ToolResult = { content: Array<{ type: "text"; text: string }> };
type AgentToolLike = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
};
type OpenClawPluginApiLike = {
  pluginConfig?: Record<string, unknown>;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
  registerTool: (tool: unknown, opts?: { optional?: boolean }) => void;
  registerService?: (service: {
    id: string;
    start: (ctx: { logger?: { info?: (msg: string) => void } }) => void | Promise<void>;
    stop?: (ctx: unknown) => void | Promise<void>;
  }) => void;
};

const DEFAULT_TIMEOUT_MS = 3000;

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

async function postToBridge(
  baseUrl: string,
  timeoutMs: number,
  path: string,
  body: unknown,
): Promise<ToolResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await res.text();
    if (!res.ok) {
      return textResult(`Tamaclaw bridge rejected the request (${res.status}): ${payload}`);
    }
    return textResult(`ok: ${payload}`);
  } catch (err) {
    // Never hang or crash the agent when the display is off.
    const reason = err instanceof Error ? err.message : String(err);
    return textResult(
      `Tamaclaw bridge is not reachable at ${url} (${reason}). ` +
        `The companion display is probably off — start it with \`npm run dev\` in the tamaclaw repo. ` +
        `Continue the task without the display.`,
    );
  }
}

export default function register(api: OpenClawPluginApiLike) {
  const cfg = api.pluginConfig ?? {};
  const port =
    (typeof cfg.port === "number" && cfg.port) ||
    Number(process.env.TAMACLAW_PORT ?? DEFAULT_PORT);
  const bridgeUrl =
    (typeof cfg.bridgeUrl === "string" && cfg.bridgeUrl) ||
    process.env.TAMACLAW_BRIDGE_URL ||
    `http://127.0.0.1:${port}`;
  const timeoutMs = typeof cfg.timeoutMs === "number" ? cfg.timeoutMs : DEFAULT_TIMEOUT_MS;
  const runBridge = cfg.startBridge !== false; // set startBridge:false if you run it yourself

  // The bridge runs as a gateway-managed service: install plugin = install all.
  if (runBridge && api.registerService) {
    let handle: { close: () => Promise<void> } | null = null;
    api.registerService({
      id: "tamaclaw-bridge",
      start: async () => {
        const { startBridge } = await import("./bridge/server.ts");
        try {
          handle = await startBridge({
            port,
            log: (msg) => api.logger?.info?.(msg),
          });
        } catch (err) {
          // e.g. port taken by a standalone bridge — tools still work against it
          api.logger?.warn?.(
            `tamaclaw bridge not started (${(err as Error).message}); ` +
              `assuming one is already running at ${bridgeUrl}`,
          );
        }
      },
      stop: async () => {
        await handle?.close();
        handle = null;
      },
    });
  }

  const post = (path: string, body: unknown) => postToBridge(bridgeUrl, timeoutMs, path, body);

  const sayTool: AgentToolLike = {
    name: "tamaclaw_say",
    label: "Tamaclaw Say",
    description:
      "Make the Tamaclaw companion display speak out loud (TTS on the Mac's speakers). " +
      "Utterances are queued, never talk over each other. Keep it short and conversational.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", description: "What to say out loud." },
        mood: {
          type: "string",
          enum: [...MOODS],
          description: "Mood shown while/after speaking (default talking).",
        },
      },
    },
    async execute(_id, params) {
      const body: SayRequest = {
        text: String(params.text ?? ""),
        mood: params.mood as Mood | undefined,
      };
      if (!body.text.trim()) return textResult("error: text is required");
      return post("/say", body);
    },
  };

  const notifyTool: AgentToolLike = {
    name: "tamaclaw_notify",
    label: "Tamaclaw Notify",
    description:
      "Show a toast notification on the Tamaclaw companion display. " +
      "Levels: info, warning, critical (critical chimes and may interrupt current speech).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: { type: "string", description: "Short notification title." },
        body: { type: "string", description: "Optional detail line." },
        level: { type: "string", enum: [...NOTIFY_LEVELS], description: "Default info." },
        ttl: { type: "number", description: "Milliseconds on screen (defaults per level)." },
      },
    },
    async execute(_id, params) {
      const body: NotifyRequest = {
        title: String(params.title ?? ""),
        body: typeof params.body === "string" ? params.body : undefined,
        level: params.level as NotifyLevel | undefined,
        ttl: typeof params.ttl === "number" ? params.ttl : undefined,
      };
      if (!body.title.trim()) return textResult("error: title is required");
      return post("/notify", body);
    },
  };

  const chartTool: AgentToolLike = {
    name: "tamaclaw_chart",
    label: "Tamaclaw Chart",
    description:
      "Render a chart widget on the Tamaclaw companion display dashboard. " +
      "Prefer this over text when the user asks for metrics/numbers that fit a chart. " +
      'data is an array of {"label","value"} points (or {"labels":[...],"series":[{"label","values":[...]}]} for multi-series). ' +
      "Re-using the same widget id replaces that widget. pin=true keeps it on screen.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["widget", "title", "type", "data"],
      properties: {
        widget: { type: "string", description: "Stable widget id, e.g. 'sales_today'." },
        title: { type: "string", description: "Human title shown above the chart." },
        type: { type: "string", enum: [...CHART_TYPES], description: "Chart type." },
        data: {
          description: 'Array of {"label","value"} or {"labels","series"} object.',
          anyOf: [{ type: "array" }, { type: "object" }],
        },
        pin: { type: "boolean", description: "Keep the widget until replaced (default false)." },
        ttl: { type: "number", description: "Ms before an unpinned widget expires (default 120000)." },
      },
    },
    async execute(_id, params) {
      const body: DashboardRequest = {
        widget: String(params.widget ?? ""),
        title: String(params.title ?? ""),
        chart: params.type as ChartType,
        data: params.data as DashboardRequest["data"],
        pin: params.pin === true,
        ttl: typeof params.ttl === "number" ? params.ttl : undefined,
      };
      if (!body.widget.trim() || !body.title.trim()) {
        return textResult("error: widget and title are required");
      }
      return post("/dashboard", body);
    },
  };

  const moodTool: AgentToolLike = {
    name: "tamaclaw_mood",
    label: "Tamaclaw Mood",
    description:
      "Set the Tamaclaw character's emotional state on the companion display. " +
      "Use as ambient feedback: thinking while working, happy on success, alert on problems. " +
      "It returns to idle on its own.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["mood"],
      properties: {
        mood: { type: "string", enum: [...MOODS], description: "The mood to show." },
      },
    },
    async execute(_id, params) {
      const value = params.mood as Mood;
      if (!MOODS.includes(value)) {
        return textResult(`error: mood must be one of ${MOODS.join(", ")}`);
      }
      return post("/mood", { value });
    },
  };

  const showTool: AgentToolLike = {
    name: "tamaclaw_show",
    label: "Tamaclaw Show",
    description:
      "Show a rich content card on the companion display, chat-style — the mascot steps " +
      "aside and the card takes the stage. Use it for things the user should READ: an email " +
      "summary (icon 📧), an important Slack message (💬), a news item (📰), or any HTML " +
      "(pie/bar charts as inline SVG or styled divs, tables, images as data URIs…). " +
      "Provide body (plain text) and/or html. Scripts in html do not execute. " +
      "Optionally pass say to read a short version out loud. " +
      "Call it again to replace the card, or with clear=true to dismiss it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        icon: { type: "string", description: 'Emoji for the header, e.g. "📧", "💬", "📰".' },
        title: { type: "string", description: "Card title." },
        source: { type: "string", description: 'Origin label, e.g. "Gmail", "Slack #alerts".' },
        body: { type: "string", description: "Plain text, chat-message style." },
        html: { type: "string", description: "Raw HTML rendered in the card (max 256KB)." },
        ttl: { type: "number", description: "Ms on stage (default 45000)." },
        say: { type: "string", description: "Optional short version to speak out loud." },
        clear: { type: "boolean", description: "True: dismiss the current card." },
      },
    },
    async execute(_id, params) {
      if (params.clear === true) return post("/show", { clear: true });
      const body = {
        icon: typeof params.icon === "string" ? params.icon : undefined,
        title: typeof params.title === "string" ? params.title : undefined,
        source: typeof params.source === "string" ? params.source : undefined,
        body: typeof params.body === "string" ? params.body : undefined,
        html: typeof params.html === "string" ? params.html : undefined,
        ttl: typeof params.ttl === "number" ? params.ttl : undefined,
        say: typeof params.say === "string" ? params.say : undefined,
      };
      if (!body.body?.trim() && !body.html?.trim()) {
        return textResult("error: provide body (text) and/or html — or clear=true");
      }
      return post("/show", body);
    },
  };

  const skinTool: AgentToolLike = {
    name: "tamaclaw_skin",
    label: "Tamaclaw Skin",
    description:
      "Switch the Tamaclaw mascot skin on the companion display. " +
      "Use only when the user asks to change the pet's look. " +
      `Available: ${SKINS.join(", ")}.`,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["skin"],
      properties: {
        skin: { type: "string", enum: [...SKINS], description: "The mascot to show." },
      },
    },
    async execute(_id, params) {
      const value = params.skin as Skin;
      if (!SKINS.includes(value)) {
        return textResult(`error: skin must be one of ${SKINS.join(", ")}`);
      }
      return post("/skin", { value });
    },
  };

  for (const tool of [sayTool, notifyTool, chartTool, showTool, moodTool, skinTool]) {
    api.registerTool(tool, { optional: true });
  }
}
