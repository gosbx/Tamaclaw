/**
 * Tamaclaw event protocol.
 *
 * Three parties speak this protocol:
 *   - clients (OpenClaw plugin, curl, anything) POST *Request bodies to the bridge REST API
 *   - the bridge turns them into ServerEvent messages pushed over WebSocket
 *   - the display consumes ServerEvent messages and animates the character
 *
 * NOTE: `packages/openclaw-plugin/shared-types.ts` is a committed copy of this
 * file so the plugin stays self-contained when installed into
 * ~/.openclaw/extensions/. After editing this file run: npm run sync-types
 */

// ---------------------------------------------------------------------------
// Core vocabulary
// ---------------------------------------------------------------------------

export const MOODS = ["idle", "thinking", "talking", "happy", "alert", "sleeping"] as const;
export type Mood = (typeof MOODS)[number];

export const NOTIFY_LEVELS = ["info", "warning", "critical"] as const;
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number];

export const CHART_TYPES = ["bar", "line", "pie", "doughnut"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Available mascot skins. "claw" is the original v1 blob. */
export const SKINS = ["nebula", "pixa", "mochi", "holo", "claw"] as const;
export type Skin = (typeof SKINS)[number];

/** Single-series data point. */
export interface ChartDatum {
  label: string;
  value: number;
}

/** Multi-series data. */
export interface ChartSeriesData {
  labels: string[];
  series: Array<{ label?: string; values: number[] }>;
}

/** The display normalizes either shape before rendering. */
export type ChartData = ChartDatum[] | ChartSeriesData;

// ---------------------------------------------------------------------------
// REST requests (client -> bridge)
// ---------------------------------------------------------------------------

/** POST /say */
export interface SayRequest {
  text: string;
  mood?: Mood;
  /** macOS voice name (e.g. "Monica", "Paulina"). Defaults to the system voice. */
  voice?: string;
  /** Words per minute for the TTS engine. */
  rate?: number;
}

/** POST /notify */
export interface NotifyRequest {
  title: string;
  body?: string;
  level?: NotifyLevel;
  /** Milliseconds the toast stays on screen. Defaults per level. */
  ttl?: number;
  /** Play a chime on the display. Defaults to true for critical, false otherwise. */
  sound?: boolean;
}

/** POST /dashboard */
export interface DashboardRequest {
  /** Stable id: posting the same widget id again replaces it. */
  widget: string;
  chart: ChartType;
  title: string;
  data: ChartData;
  /** Pinned widgets never expire. */
  pin?: boolean;
  /** Milliseconds before an unpinned widget expires (default 120000). */
  ttl?: number;
}

/** POST /mood */
export interface MoodRequest {
  value: Mood;
}

/** POST /skin — switch the mascot. The display persists the choice locally. */
export interface SkinRequest {
  value: Skin;
}

/**
 * POST /show — rich content card, chat-style. The mascot moves to a corner
 * and the card takes the stage: an email summary, an important Slack message,
 * a news item, or any HTML (charts, tables…). At least one of body/html.
 */
export interface ShowRequest {
  /** Emoji shown big next to the title, e.g. "📧", "💬", "📰". */
  icon?: string;
  title?: string;
  /** Small origin label, e.g. "Gmail", "Slack #alerts". */
  source?: string;
  /** Plain text, chat-message style (newlines respected). */
  body?: string;
  /** Raw HTML rendered inside the card (scripts do not execute). */
  html?: string;
  /** Milliseconds on stage (default 45000). */
  ttl?: number;
  /** Optional: speak this out loud while showing. */
  say?: string;
  /** True: dismiss the current card immediately (other fields ignored). */
  clear?: boolean;
}

// ---------------------------------------------------------------------------
// WebSocket events (bridge -> display)
// ---------------------------------------------------------------------------

export interface HelloEvent {
  type: "hello";
  server: "tamaclaw-bridge";
  version: string;
  /** Utterances currently waiting in the say queue. */
  queued: number;
}

export interface SayStartEvent {
  type: "say:start";
  id: string;
  text: string;
  mood: Mood;
}

export interface SayEndEvent {
  type: "say:end";
  id: string;
  /** True when the utterance was cut short (e.g. by a critical notify). */
  interrupted: boolean;
}

export interface NotifyEvent {
  type: "notify";
  id: string;
  title: string;
  body?: string;
  level: NotifyLevel;
  ttl: number;
  sound: boolean;
}

export interface DashboardEvent {
  type: "dashboard";
  widget: string;
  chart: ChartType;
  title: string;
  data: ChartData;
  pin: boolean;
  ttl: number;
}

export interface MoodEvent {
  type: "mood";
  value: Mood;
}

export interface SkinEvent {
  type: "skin";
  value: Skin;
}

export interface ShowEvent {
  type: "show";
  id: string;
  icon?: string;
  title?: string;
  source?: string;
  body?: string;
  html?: string;
  ttl: number;
}

export interface ShowClearEvent {
  type: "show:clear";
}

export type ServerEvent =
  | HelloEvent
  | SayStartEvent
  | SayEndEvent
  | NotifyEvent
  | DashboardEvent
  | MoodEvent
  | SkinEvent
  | ShowEvent
  | ShowClearEvent;

// ---------------------------------------------------------------------------
// Defaults shared by bridge and display
// ---------------------------------------------------------------------------

export const DEFAULT_PORT = 4321;

export const NOTIFY_TTL_DEFAULTS: Record<NotifyLevel, number> = {
  info: 8_000,
  warning: 12_000,
  critical: 20_000,
};

export const DASHBOARD_TTL_DEFAULT = 120_000;

export const SHOW_TTL_DEFAULT = 45_000;
