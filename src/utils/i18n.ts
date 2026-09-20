import { useEffect, useState } from "react";

// SteamClient is declared globally by @decky/ui (see globals/SteamClient.d.ts).
// GetCurrentLanguage() returns Steam's own short language names ("english",
// "schinese", "tchinese", ...) — the same setting the user picked in Steam's
// own Interface settings, which is what "based on user's language setting"
// means here (there's no separate CreamDeck-specific language picker).
type Lang = "en" | "zh";

async function detectLanguage(): Promise<Lang> {
  try {
    const current = await SteamClient?.Settings?.GetCurrentLanguage?.();
    if (current && /chinese/i.test(current)) return "zh";
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

interface Translations {
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
  koaloaderAutoloadTitle: string;
  detectedInGame: string;
  dlcTitle: (enabled: number, total: number) => string;
  selectAll: string;
  deselectAll: string;
  noDlcFound: string;
  needsDepotFiles: string;
  depotWarningNote: string;
  dlcPanelFallbackTitle: string;
  noDlcListNote: (label: string) => string;
  proxyModeTitle: string;
  useProxyDll: string;
  useProxyDllDescription: string;
  protonOverrideNote: (dll: string) => string;
  setLaunchOption: (dll: string) => string;
  launchOptionApplied: string;
  launchOptionAlready: string;
  launchOptionError: (token: string) => string;
  install: string;
  updateInstall: string;
  uninstall: string;
}

const EN: Translations = {
  quickAccessContent:
    'Right-click any installed Steam game in your library and choose "CreamDeck" to select which of its DLC to unlock.',
  noAppId: "No appid in URL",
  gameNotInstalled: "This game isn't installed (or its Steam library couldn't be read).",
  loadFailed: "Failed to load this game's info.",
  integrityTitle: "Integrity check failed",
  integrityHint:
    "Already verified and it's still showing this? Steam's verify only restores the game's own files — it won't remove an unlocker's leftover config/proxy files, which is usually what's actually causing this. Use the button below to remove them directly.",
  removeUnlockerFiles: "Remove all unlocker files",
  working: "Working...",
  unlockerTitle: "Unlocker",
  detectedSuffix: "(detected)",
  noTargetFile: (label) =>
    `This game doesn't seem to have ${label}'s target file — installing it anyway probably won't do anything.`,
  koaloaderAutoloadTitle: "Koaloader: auto-load",
  detectedInGame: "detected in this game",
  dlcTitle: (enabled, total) => `DLC (${enabled}/${total} enabled)`,
  selectAll: "Select all",
  deselectAll: "Deselect all",
  noDlcFound: "No DLC found for this game.",
  needsDepotFiles: "needs depot files",
  depotWarningNote:
    "DLC marked ⚠ ships its own content files (a depot) on Steam — see this game's depot list on SteamDB. An unlocker only spoofs ownership, it doesn't download those files, so if your account never owned that DLC, its content may still fail to load even after unlocking.",
  dlcPanelFallbackTitle: "DLC",
  noDlcListNote: (label) =>
    `${label} unlocks everything by default — there's no per-DLC list for it in this plugin (it needs a catalog this plugin doesn't have, since it only scans Steam).`,
  proxyModeTitle: "Proxy mode",
  useProxyDll: "Use a proxy DLL",
  useProxyDllDescription:
    "Instead of replacing the unlocker's target file directly — use this if the game doesn't get along with a direct replacement.",
  protonOverrideNote: (dll) =>
    `On Steam Deck, Proton's own built-in ${dll}.dll is normally preferred over the one CreamDeck drops into the game folder — so the unlocker never actually loads unless this game's launch options tell Proton to prefer it instead. Without this, the game will launch fine but DLC will stay locked.`,
  setLaunchOption: (dll) => `Set launch option for ${dll}.dll`,
  launchOptionApplied:
    "Done — launch options updated. Fully close and relaunch the game for it to take effect.",
  launchOptionAlready: "This game's launch options already have it set.",
  launchOptionError: (token) =>
    `Couldn't read this game's launch options. Set it manually instead: add ${token} to this game's Launch Options in Steam (Properties → General).`,
  install: "Install",
  updateInstall: "Update install",
  uninstall: "Uninstall",
};

const ZH: Translations = {
  quickAccessContent:
    '在游戏库中右键点击任意已安装的 Steam 游戏，选择 "CreamDeck" 来选择要解锁的 DLC。',
  noAppId: "URL 中缺少 appid",
  gameNotInstalled: "这个游戏尚未安装（或无法读取 Steam 游戏库）。",
  loadFailed: "加载该游戏信息失败。",
  integrityTitle: "完整性校验失败",
  integrityHint:
    "已经校验过还是出现这个提示？Steam 的校验只会恢复游戏本身的文件，不会清除解锁工具残留的配置/代理文件，而这通常才是问题所在。请使用下面的按钮直接移除这些残留文件。",
  removeUnlockerFiles: "移除所有解锁工具文件",
  working: "处理中…",
  unlockerTitle: "解锁工具",
  detectedSuffix: "(已检测到)",
  noTargetFile: (label) => `这个游戏似乎没有 ${label} 所需的目标文件——即使安装了可能也不会有效果。`,
  koaloaderAutoloadTitle: "Koaloader：自动加载",
  detectedInGame: "已在此游戏中检测到",
  dlcTitle: (enabled, total) => `DLC（已启用 ${enabled}/${total}）`,
  selectAll: "全选",
  deselectAll: "取消全选",
  noDlcFound: "未找到此游戏的 DLC。",
  needsDepotFiles: "需要 depot 文件",
  depotWarningNote:
    "标有 ⚠ 的 DLC 在 Steam 上有自己的内容文件（depot），可在 SteamDB 的该游戏 Depots 页面查看。解锁工具只能让游戏认为你拥有它，并不会下载这些文件——如果你的账号本来就没有这个 DLC，即使解锁后其内容也可能仍然无法正常加载。",
  dlcPanelFallbackTitle: "DLC",
  noDlcListNote: (label) =>
    `${label} 默认解锁所有内容——本插件没有它的 DLC 列表（因为需要一个本插件没有的目录数据，它只扫描 Steam 本身的数据）。`,
  proxyModeTitle: "代理模式",
  useProxyDll: "使用代理 DLL",
  useProxyDllDescription:
    "不直接替换解锁工具的目标文件——如果游戏与直接替换方式不兼容，请使用此选项。",
  protonOverrideNote: (dll) =>
    `在 Steam Deck 上，Proton 自带的 ${dll}.dll 通常会优先于 CreamDeck 放入游戏目录中的文件——因此除非在此游戏的启动选项中让 Proton 优先使用后者，否则解锁工具实际上永远不会被加载。如果不设置，游戏会正常启动，但 DLC 仍会保持锁定状态。`,
  setLaunchOption: (dll) => `为 ${dll}.dll 设置启动选项`,
  launchOptionApplied: "完成——启动选项已更新。请完全关闭并重新启动游戏以使其生效。",
  launchOptionAlready: "此游戏的启动选项中已经设置过了。",
  launchOptionError: (token) =>
    `无法读取此游戏的启动选项。请手动设置：在 Steam 中该游戏的属性 → 常规 → 启动选项里添加 ${token}。`,
  install: "安装",
  updateInstall: "更新安装",
  uninstall: "卸载",
};

const TRANSLATIONS: Record<Lang, Translations> = { en: EN, zh: ZH };

export function useTranslations(): Translations {
  const lang = useLanguage();
  return TRANSLATIONS[lang];
}
