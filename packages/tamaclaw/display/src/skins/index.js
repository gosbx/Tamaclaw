// Skin registry. Keep names in sync with SKINS in packages/shared.
import { NebulaSkin } from "./nebula.js";
import { PixaSkin } from "./pixa.js";
import { MochiSkin } from "./mochi.js";
import { HoloSkin } from "./holo.js";
import { ClawSkin } from "./claw.js";

export const SKIN_REGISTRY = {
  nebula: { label: "Nebula", emoji: "🪐", Skin: NebulaSkin, tag: "orbe IA luminoso" },
  pixa: { label: "Pixa", emoji: "👾", Skin: PixaSkin, tag: "pixel retro CRT" },
  mochi: { label: "Mochi", emoji: "🍡", Skin: MochiSkin, tag: "kawaii squishy" },
  holo: { label: "Holo", emoji: "👻", Skin: HoloSkin, tag: "Y2K iridiscente" },
  claw: { label: "Claw", emoji: "🦞", Skin: ClawSkin, tag: "el clásico v1" },
};

export const DEFAULT_SKIN = "nebula";
