import { useEffect, useState } from "react";
import EN from "../locales/en";
import ZH from "../locales/zh-CN";
import TW from "../locales/zh-TW";
import type { Translations } from "../locales/en";

// SteamClient is declared globally by @decky/ui (see globals/SteamClient.d.ts).
// GetCurrentLanguage() returns Steam's own short language names ("english",
// "schinese", "tchinese", ...) — the same setting the user picked in Steam's
// own Interface settings, which is what "based on user's language setting"
// means here (there's no separate CreamDeck-specific language picker).
type Lang = "en" | "zh-CN" | "zh-TW";

async function detectLanguage(): Promise<Lang> {
  try {
    const current = await SteamClient?.Settings?.GetCurrentLanguage?.();
    if (current === "tchinese") return "zh-TW";
    if (current === "schinese") return "zh-CN";
  } catch {
    // SteamClient isn't guaranteed to be available in every environment
    // (e.g. outside Big Picture/Deck UI) — default to English instead of throwing.
  }
  return "en";
}

// Remember the detected language so later views render it immediately.
let detected: Lang | undefined;

export function useLanguage(): Lang {
  const [lang, setLang] = useState<Lang>(detected ?? "en");
  useEffect(() => {
    let cancelled = false;
    detectLanguage().then((value) => {
      detected = value;
      if (!cancelled) setLang(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return lang;
}

export type { Translations } from "../locales/en";

const TRANSLATIONS: Record<Lang, Translations> = { en: EN, "zh-CN": ZH, "zh-TW": TW };

export function useTranslations(): Translations {
  return TRANSLATIONS[useLanguage()];
}
