import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SayRequest } from "../shared/protocol.ts";

/**
 * Voice layer. Pick an engine with TAMACLAW_TTS:
 *
 *   say         macOS `say` (default) — zero deps, offline.
 *               Tip: download an Enhanced/Premium voice in
 *               System Settings → Accessibility → Spoken Content for a big
 *               quality jump, then TAMACLAW_VOICE="Paulina (Enhanced)".
 *   openai      OpenAI TTS (needs OPENAI_API_KEY). Natural neural voices.
 *   elevenlabs  ElevenLabs (needs ELEVENLABS_API_KEY). Best-in-class voices.
 *   off         silent (still emits say:start/say:end for lip-sync).
 *
 * Cloud engines fall back to `say` per-utterance on any error (no key works
 * differently: createEngine refuses to select them and warns at startup), so
 * the display always speaks. An engine speaks one utterance at a time and
 * `stop()` must cut the current utterance short.
 */
export interface TtsEngine {
  readonly name: string;
  /** Resolves when the utterance finished (or was stopped). Returns true if it was interrupted. */
  speak(req: SayRequest): Promise<{ interrupted: boolean }>;
  stop(): void;
}

/** macOS `say` — zero dependencies, ships with the OS. */
export class MacSayEngine implements TtsEngine {
  readonly name: string = "macos-say";
  #child: ChildProcess | null = null;
  #interrupted = false;
  #defaults: { voice?: string; rate?: number };

  constructor(defaults: { voice?: string; rate?: number } = {}) {
    this.#defaults = defaults;
  }

  speak(req: SayRequest): Promise<{ interrupted: boolean }> {
    return new Promise((resolve) => {
      const args: string[] = [];
      const voice = req.voice ?? this.#defaults.voice;
      const rate = req.rate ?? this.#defaults.rate;
      if (voice) args.push("-v", voice);
      if (rate) args.push("-r", String(rate));
      args.push("--", req.text);

      this.#interrupted = false;
      const child = spawn("say", args, { stdio: "ignore" });
      this.#child = child;

      const done = () => {
        if (this.#child === child) this.#child = null;
        resolve({ interrupted: this.#interrupted });
      };
      child.on("error", done); // e.g. `say` missing — resolve, never hang the queue
      child.on("exit", done);
    });
  }

  stop(): void {
    if (this.#child) {
      this.#interrupted = true;
      this.#child.kill("SIGTERM");
    }
  }
}

/** Silent engine: still emits say:start/say:end so the mouth animates. */
export class NullTtsEngine implements TtsEngine {
  readonly name = "null";
  #timer: NodeJS.Timeout | null = null;
  #resolve: ((r: { interrupted: boolean }) => void) | null = null;

  speak(req: SayRequest): Promise<{ interrupted: boolean }> {
    // Rough reading time: ~15 chars/second, capped.
    const ms = Math.min(12_000, Math.max(800, req.text.length * 66));
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#resolve = null;
        resolve({ interrupted: false });
      }, ms);
    });
  }

  stop(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#resolve?.({ interrupted: true });
      this.#resolve = null;
    }
  }
}

/**
 * Base for cloud engines: fetch an mp3, play it with `afplay`, clean up.
 * Any failure (network, quota, bad key) falls back to `say` for that
 * utterance so the pet never goes mute.
 */
abstract class CloudTtsEngine implements TtsEngine {
  abstract readonly name: string;
  #child: ChildProcess | null = null;
  #aborter: AbortController | null = null;
  #interrupted = false;
  #fallback = new MacSayEngine();

  /** Fetch the audio for `req` and return the mp3 bytes. */
  protected abstract fetchAudio(req: SayRequest, signal: AbortSignal): Promise<ArrayBuffer>;

  async speak(req: SayRequest): Promise<{ interrupted: boolean }> {
    this.#interrupted = false;
    this.#aborter = new AbortController();
    let file: string | null = null;
    try {
      const audio = await this.fetchAudio(req, this.#aborter.signal);
      if (this.#interrupted) return { interrupted: true };
      file = path.join(os.tmpdir(), `tamaclaw-${randomUUID()}.mp3`);
      await writeFile(file, Buffer.from(audio));
      await this.#play(file);
      return { interrupted: this.#interrupted };
    } catch (err) {
      if (this.#interrupted) return { interrupted: true };
      console.warn(`[tts] ${this.name} failed (${(err as Error).message}) — falling back to say`);
      return this.#fallback.speak(req);
    } finally {
      this.#aborter = null;
      if (file) void unlink(file).catch(() => {});
    }
  }

  #play(file: string): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn("afplay", [file], { stdio: "ignore" });
      this.#child = child;
      const done = () => {
        if (this.#child === child) this.#child = null;
        resolve();
      };
      child.on("error", done);
      child.on("exit", done);
    });
  }

  stop(): void {
    this.#interrupted = true;
    this.#aborter?.abort();
    this.#child?.kill("SIGTERM");
    this.#fallback.stop();
  }
}

/** OpenAI TTS — https://platform.openai.com/docs/guides/text-to-speech */
export class OpenAiTtsEngine extends CloudTtsEngine {
  readonly name = "openai-tts";

  protected async fetchAudio(req: SayRequest, signal: AbortSignal): Promise<ArrayBuffer> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.TAMACLAW_OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
        voice: req.voice ?? process.env.TAMACLAW_OPENAI_VOICE ?? "nova",
        input: req.text,
        response_format: "mp3",
        ...(req.rate ? { speed: Math.min(4, Math.max(0.25, req.rate / 175)) } : {}),
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.arrayBuffer();
  }
}

/** ElevenLabs — https://elevenlabs.io/docs/api-reference/text-to-speech */
export class ElevenLabsEngine extends CloudTtsEngine {
  readonly name = "elevenlabs";

  protected async fetchAudio(req: SayRequest, signal: AbortSignal): Promise<ArrayBuffer> {
    // req.voice doubles as the ElevenLabs voice id here.
    const voiceId =
      req.voice ?? process.env.TAMACLAW_ELEVEN_VOICE ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: req.text,
          model_id: process.env.TAMACLAW_ELEVEN_MODEL ?? "eleven_flash_v2_5",
        }),
      },
    );
    if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.arrayBuffer();
  }
}

export function createEngine(): TtsEngine {
  const requested = (process.env.TAMACLAW_TTS ?? "say").toLowerCase();

  if (requested === "off") return new NullTtsEngine();

  if (requested === "openai") {
    if (process.env.OPENAI_API_KEY) return new OpenAiTtsEngine();
    console.warn("[tts] TAMACLAW_TTS=openai but OPENAI_API_KEY is not set — using macOS say");
  }
  if (requested === "elevenlabs") {
    if (process.env.ELEVENLABS_API_KEY) return new ElevenLabsEngine();
    console.warn("[tts] TAMACLAW_TTS=elevenlabs but ELEVENLABS_API_KEY is not set — using macOS say");
  }

  if (process.platform !== "darwin") return new NullTtsEngine();
  return new MacSayEngine({
    voice: process.env.TAMACLAW_VOICE,
    rate: process.env.TAMACLAW_RATE ? Number(process.env.TAMACLAW_RATE) : undefined,
  });
}
