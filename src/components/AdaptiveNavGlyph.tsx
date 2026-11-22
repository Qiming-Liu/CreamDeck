import { createModuleMapping, type Export, fakeRenderComponent, findModuleByExport, type Module } from "@decky/ui";
import type { ComponentType } from "react";

// Steam's own controller-glyph component. It takes Steam's button numbers, not
// @decky/ui's GamepadButton: A=0, B=1, X=2, Y=3, D-pad left/right/up/down=4/5/6/7,
// menu (≡)=11. With a keyboard it shows the matching key's name instead.
export const NAV_BUTTON = { A: 0, B: 1, X: 2, Y: 3, LEFT: 4, RIGHT: 5, UP: 6, DOWN: 7, MENU: 11 } as const;

export type AdaptiveNavGlyphProps = {
  button: number;
  bAllowKeyboard?: boolean;
  bKnockout?: boolean;
  className?: string;
};

function glyphCandidates(): unknown[] {
  const current = findModuleByExport((e) => typeof e === "function" && e.toString().includes("GamepadUI_KeyboardNavGlyphsDisabled"));
  if (current) return Object.values(current);
  // Older clients: modules whose only two exports are memoized components.
  const older = createModuleMapping((mod) => {
    if (!mod || typeof mod !== "object") return false;
    const exports = Object.values(mod);
    return exports.length === 2 && exports.every((e: Export) => e?.$$typeof === Symbol.for("react.memo") && typeof e.type === "function");
  }).values();
  return Array.from(older).flatMap((mod) => Object.values(mod));
}

// Steam's component renders one whose props carry the controller's type and style.
const isAdaptiveNavGlyph = (mod: Module) => {
  if (typeof mod?.type !== "function") return false;
  try {
    return fakeRenderComponent(() => {
      const props = mod.type({ button: NAV_BUTTON.X, bAllowKeyboard: false })?.props;
      return props != null && "controllerType" in props && "controllerStyle" in props
        && "controllerSource" in props && "controllerModeInput" in props;
    }, { useSyncExternalStore: (_: unknown, get: () => unknown) => get?.() });
  } catch {
    return false;
  }
};

let found: ComponentType<AdaptiveNavGlyphProps> | null | undefined;

/** Steam's glyph component, looked up once; null when this Steam build has none we recognise. */
export function adaptiveNavGlyph(): ComponentType<AdaptiveNavGlyphProps> | null {
  if (found === undefined) {
    try {
      found = (glyphCandidates().find((mod) => isAdaptiveNavGlyph(mod as Module)) as ComponentType<AdaptiveNavGlyphProps>) ?? null;
    } catch {
      found = null;
    }
  }
  return found;
}
