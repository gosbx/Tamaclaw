import { randomUUID } from "node:crypto";
import type { Mood, SayRequest, ServerEvent } from "../shared/protocol.ts";
import type { TtsEngine } from "./tts.ts";

interface QueuedSay extends SayRequest {
  id: string;
  mood: Mood;
}

/**
 * FIFO queue of utterances. `say` requests never talk over each other; a
 * critical notify may interrupt the one currently playing (the rest of the
 * queue survives). Emits say:start / say:end around each utterance so the
 * display can lip-sync.
 */
export class SayQueue {
  #queue: QueuedSay[] = [];
  #speaking = false;
  #currentId: string | null = null;

  #engine: TtsEngine;
  #broadcast: (event: ServerEvent) => void;

  constructor(engine: TtsEngine, broadcast: (event: ServerEvent) => void) {
    this.#engine = engine;
    this.#broadcast = broadcast;
  }

  get length(): number {
    return this.#queue.length + (this.#speaking ? 1 : 0);
  }

  enqueue(req: SayRequest): string {
    const item: QueuedSay = { ...req, id: randomUUID(), mood: req.mood ?? "talking" };
    this.#queue.push(item);
    void this.#drain();
    return item.id;
  }

  /** Cut the current utterance short (queue keeps going). */
  interruptCurrent(): boolean {
    if (!this.#speaking) return false;
    this.#engine.stop();
    return true;
  }

  async #drain(): Promise<void> {
    if (this.#speaking) return;
    this.#speaking = true;
    try {
      let item: QueuedSay | undefined;
      while ((item = this.#queue.shift())) {
        this.#currentId = item.id;
        this.#broadcast({ type: "say:start", id: item.id, text: item.text, mood: item.mood });
        const { interrupted } = await this.#engine.speak(item);
        this.#broadcast({ type: "say:end", id: item.id, interrupted });
        this.#currentId = null;
      }
    } finally {
      this.#speaking = false;
      this.#currentId = null;
    }
  }
}
