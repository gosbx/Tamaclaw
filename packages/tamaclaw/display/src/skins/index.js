// Skin registry. Keep names in sync with SKINS in packages/shared.
import { NebulaSkin } from "./nebula.js";
import { PixaSkin } from "./pixa.js";
import { MochiSkin } from "./mochi.js";
import { HoloSkin } from "./holo.js";
import { ClawSkin } from "./claw.js";

export const SKIN_REGISTRY = {
  nebula: { label: "Nebula", emoji: "🪐", Skin: NebulaSkin, tag: "luminous AI orb" },
  pixa: { label: "Pixa", emoji: "👾", Skin: PixaSkin, tag: "retro pixel CRT" },
  mochi: { label: "Mochi", emoji: "🍡", Skin: MochiSkin, tag: "kawaii squishy" },
  holo: { label: "Holo", emoji: "👻", Skin: HoloSkin, tag: "Y2K iridescent" },
  claw: { label: "Claw", emoji: "🦞", Skin: ClawSkin, tag: "the classic v1" },
};

export const DEFAULT_SKIN = "nebula";
