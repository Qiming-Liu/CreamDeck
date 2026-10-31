import { useEffect, useState } from "react";
import EN from "../locales/en";
import ZH from "../locales/zh-CN";
import TW from "../locales/zh-TW";

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

export function useLanguage(): Lang {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    let cancelled = false;
    detectLanguage().then((detected) => {
      if (!cancelled) setLang(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return lang;
}

export interface Translations {
  errors: Record<string, string>;
  operationError: (code?: string) => string;
  targetDirectory: string;
  targetDirectoryHint: string;
  diagnose: string;
  diagnosisReady: (bits: number) => string;
  filesHealthy: string;
  filesModified: string;
  filesLegacy: string;
  filesExternal: string;
  launchReady: string;
  launchRequired: string;
  launchChecking: string;
  refreshDlc: string;
  refreshingDlc: string;
  cachedAt: (date: string) => string;
  catalogMissing: string;
  preservedFiles: string;
  resourceVersion: string;

  launchOptionReading: string;
  launchOptionChanged: string;
  launchOptionFailed: string;
  launchOptionSwitchError: string;
  launchOptionUnsupported: string;
  defaultSetupHint: string;
  dlcManagement: string;
  installSettings: string;
  maintenance: string;
  installed: string;
  notInstalled: string;
  unsaved: string;
  applyChanges: string;
  applied: string;
  retry: string;
  cancel: string;
  installSuccess: string;
  uninstallSuccess: string;
  cleanupSuccess: string;
  refreshFailed: string;
  integritySummary: string;
  openMaintenance: string;
  uninstallConfirm: string;
  cleanupConfirm: string;
  searchDlc: string;
  results: (count: number) => string;
  showAll: string;
  showSelected: string;
  selectResults: string;
  clearResults: string;
  noResults: string;
  separateContent: string;
  depotHelp: string;
  settingsLocked: string;
  targetDetected: string;
  targetNotDetected: string;
  installMode: string;
  installModeHint: string;
  directMode: string;
  proxyFile: string;
  protonLaunchOption: string;
  launchOptionHint: string;
  proxyHelp: string;
  currentInstall: string;
  uninstallHint: string;
  cleanupTitle: string;
  cleanupHint: string;
  details: string;
  maintenanceHint: string;
  quickAccessContent: string;
  noAppId: string;
  gameNotInstalled: string;
  loadFailed: string;
  integrityTitle: string;
  integrityHint: string;
  removeUnlockerFiles: string;
  working: string;
  unlockerTitle: string;
  detectedSuffix: string;
  noTargetFile: (label: string) => string;
  dlcTitle: (enabled: number, total: number) => string;
  selectAll: string;
  deselectAll: string;
  noDlcFound: string;
  needsDepotFiles: string;
  depotWarningNote: string;
  proxyModeTitle: string;
  useProxyDll: string;
  useProxyDllDescription: string;
  protonOverrideNote: (dll: string) => string;
  install: string;
  updateInstall: string;
  uninstall: string;
}

const TRANSLATIONS: Record<Lang, Translations> = { en: EN, "zh-CN": ZH, "zh-TW": TW };

export function useTranslations(): Translations {
  return TRANSLATIONS[useLanguage()];
}
