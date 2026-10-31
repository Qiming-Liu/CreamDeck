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
  unlockAll: string;
  unlockAllHint: string;
  noDlcSelection: string;
  koaloaderDlcHint: string;
  settingsLocked: string;
  targetDetected: string;
  targetNotDetected: string;
  loaderHint: string;
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
  install: string;
  updateInstall: string;
  uninstall: string;
}

const EN: Translations = {
  launchOptionReading: "Reading Steam launch options…",
  launchOptionChanged: "Launch options updated. Restart the game for the change to take effect.",
  launchOptionFailed: "Launch option unavailable",
  launchOptionSwitchError: "Could not read or update Steam launch options. Reload to check the current state.",
  launchOptionUnsupported: "These launch options cannot be edited automatically. Adjust them in Steam, then reload.",
  defaultSetupHint: 'Default: SmokeAPI + version.dll proxy. Turn on Proton launch option below. This combination has been tested in Risk of Rain 2.',
  dlcManagement: "DLC",
  installSettings: "Installation",
  maintenance: "Maintenance",
  installed: "Installed",
  notInstalled: "Not installed",
  unsaved: "Unapplied changes",
  applyChanges: "Apply changes",
  applied: "Applied",
  retry: "Reload",
  cancel: "Cancel",
  installSuccess: "Installation applied. Restart the game for changes to take effect.",
  uninstallSuccess: "Unlocker uninstalled.",
  cleanupSuccess: "Unlocker files removed.",
  refreshFailed: "The operation completed, but its status could not be refreshed. Reload before continuing.",
  integritySummary: "The saved installation does not match the game files. Open Maintenance to review and repair it.",
  openMaintenance: "Open Maintenance",
  uninstallConfirm: "Uninstall the current unlocker and restore its backed-up game files? Your Steam launch options will remain in place.",
  cleanupConfirm: "Remove all recognized unlocker files from this game and restore available backups? Your Steam launch options will remain in place.",
  searchDlc: "Search DLC by name or ID",
  results: count => `${count} results`,
  showAll: "Show all",
  showSelected: "Selected only",
  selectResults: "Select results",
  clearResults: "Clear results",
  noResults: "No DLC matches this filter.",
  separateContent: "Separate content",
  depotHelp: "About separate DLC content",
  unlockAll: "Unlocks all content",
  unlockAllHint: "This unlocker has no individual DLC selection. Configure it in Installation, then install.",
  noDlcSelection: "No individual DLC selection",
  koaloaderDlcHint: "Enable SmokeAPI under Installation → Auto-load to choose individual Steam DLC.",
  settingsLocked: "Uninstall in Maintenance to change these settings. DLC selections can still be updated.",
  targetDetected: "Target file detected",
  targetNotDetected: "Target file not detected; this unlocker may have no effect.",
  loaderHint: "Loads selected unlockers through a proxy DLL.",
  installMode: "Install method",
  installModeHint: "Proxy mode keeps the original platform DLL in place.",
  directMode: "Direct replacement",
  proxyFile: "Proxy DLL",
  protonLaunchOption: "Proton launch option",
  launchOptionHint: "On adds this DLL override; off removes it. Other launch options are preserved. Restart the game after changing it.",
  proxyHelp: "Why is a launch option needed?",
  currentInstall: "Current installation",
  uninstallHint: "Restore the backed-up game files and remove this unlocker.",
  cleanupTitle: "Clean up files",
  cleanupHint: "Remove recognized unlocker leftovers and restore available backups.",
  details: "Technical details",
  maintenanceHint: "Steam file verification can undo a direct replacement. If the saved status no longer matches the files, reopen this page to check it.",
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
  install: "Install",
  updateInstall: "Update install",
  uninstall: "Uninstall",
};

const ZH: Translations = {
  launchOptionReading: "正在读取 Steam 启动项…",
  launchOptionChanged: "启动项已更新，重新启动游戏后生效。",
  launchOptionFailed: "启动项暂不可用",
  launchOptionSwitchError: "无法读取或更新 Steam 启动项，请重新加载以确认当前状态。",
  launchOptionUnsupported: "当前启动项格式无法自动编辑。请在 Steam 中调整后重新加载。",
  defaultSetupHint: '默认方案：SmokeAPI + version.dll 代理，并打开下方的 Proton 启动选项开关。这套组合已在《雨中冒险 2》中测试通过。',
  dlcManagement: "DLC 管理",
  installSettings: "安装配置",
  maintenance: "维护",
  installed: "已安装",
  notInstalled: "未安装",
  unsaved: "有未应用的修改",
  applyChanges: "应用更改",
  applied: "已应用",
  retry: "重新加载",
  cancel: "取消",
  installSuccess: "安装配置已应用，重新启动游戏后生效。",
  uninstallSuccess: "解锁工具已卸载。",
  cleanupSuccess: "解锁工具文件已清理。",
  refreshFailed: "操作已完成，但无法刷新安装状态。请重新加载后继续操作。",
  integritySummary: "安装记录与游戏文件不一致，请到维护页查看并处理。",
  openMaintenance: "前往维护",
  uninstallConfirm: "卸载当前解锁工具并恢复其备份的游戏文件？已有的 Steam 启动选项将保留。",
  cleanupConfirm: "移除该游戏中所有可识别的解锁工具文件，并恢复可用备份？已有的 Steam 启动选项将保留。",
  searchDlc: "搜索 DLC 名称或 ID",
  results: count => `${count} 个结果`,
  showAll: "显示全部",
  showSelected: "仅已选择",
  selectResults: "全选结果",
  clearResults: "清空结果",
  noResults: "没有符合当前筛选条件的 DLC。",
  separateContent: "独立内容文件",
  depotHelp: "关于 DLC 独立内容文件",
  unlockAll: "自动解锁全部内容",
  unlockAllHint: "此工具不支持逐项选择 DLC。请在安装配置页配置后安装。",
  noDlcSelection: "当前无需选择 DLC",
  koaloaderDlcHint: "在安装配置的自动加载选项中启用 SmokeAPI，即可逐项选择 Steam DLC。",
  settingsLocked: "如需更改此处设置，请先到维护页卸载。DLC 勾选仍可直接更新。",
  targetDetected: "已检测到目标文件",
  targetNotDetected: "未检测到目标文件，安装后可能不会生效。",
  loaderHint: "通过代理 DLL 加载所选解锁工具。",
  installMode: "安装方式",
  installModeHint: "代理模式保留原有的平台 DLL。",
  directMode: "直接替换",
  proxyFile: "代理 DLL",
  protonLaunchOption: "Proton 启动选项",
  launchOptionHint: "开启添加当前 DLL 的覆盖项，关闭仅移除该项；保留其他启动参数。更改后请重新启动游戏。",
  proxyHelp: "为什么需要设置启动选项？",
  currentInstall: "当前安装",
  uninstallHint: "恢复备份的游戏文件并移除当前解锁工具。",
  cleanupTitle: "清理残留",
  cleanupHint: "移除可识别的解锁工具残留文件，并恢复可用备份。",
  details: "技术详情",
  maintenanceHint: "Steam 文件校验可能撤销直接替换安装。如果记录与文件不符，重新打开此页面可检查状态。",
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
  install: "安装",
  updateInstall: "更新安装",
  uninstall: "卸载",
};

const TRANSLATIONS: Record<Lang, Translations> = { en: EN, zh: ZH };

export function useTranslations(): Translations {
  const lang = useLanguage();
  return TRANSLATIONS[lang];
}
