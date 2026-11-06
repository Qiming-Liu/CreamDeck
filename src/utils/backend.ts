import { callable } from "@decky/api";

export interface DlcInfo {
  id: string;
  name: string;
  // Whether this DLC has its own depot on Steam (ships actual content files,
  // not just an ownership flag) — null when that couldn't be determined.
  has_depot: boolean | null;
}

export interface UnlockerInfo {
  key: string;
  label: string;
  detected: boolean;
  installed: boolean;
}

export interface GamePage {
  found: boolean;
  name?: string;
  dlcs?: DlcInfo[];
  enabled_dlc_ids?: string[];
  unlockers?: UnlockerInfo[];
  selected_unlocker?: string;
  installed?: boolean;
  proxy_dll?: string | null;
  proxy_dll_choices?: string[];
  integrity_error?: string | null;
  error_code?: string;
  file_status?: "clean" | "healthy" | "modified" | "external" | "legacy";
  changed_files?: string[];
  target_directory?: string;
  targets?: { path: string; bitness: number; detected: boolean }[];
  resource_version?: string;
  dlc_updated_at?: number;
  dlc_cached?: boolean;
  has_record?: boolean;
  files?: FileReport[];
  external_files?: string[];
  api_dlls?: string[];
}

export interface FileReport {
  name: string;
  role: "dll" | "backup" | "config" | "proxy" | "record";
  status: "same" | "modified" | "missing" | "foreign";
  action: "delete" | "restore" | "keep" | "none" | "blocked";
}

export interface OperationResult {
  success: boolean;
  error?: string;
  error_code?: string;
  preserved_files?: string[];
  bitness?: number;
}

export const getGamePage = callable<[app_id: string, target_directory?: string], GamePage>("get_game_page");
export interface DlcPage extends OperationResult {
  dlcs?: DlcInfo[];
  updated_at?: number;
  cached?: boolean;
}
export const getDlcPage = callable<[app_id: string, force: boolean], DlcPage>("get_dlc_page");

export const installDlcUnlocker = callable<
  [
    app_id: string,
    unlocker: string,
    enabled_dlc_ids: string[],
    proxy: boolean,
    proxy_dll: string,
    target_directory: string,
  ],
  OperationResult
>("install_dlc_unlocker");

export const uninstallDlcUnlocker = callable<[app_id: string], OperationResult>(
  "uninstall_dlc_unlocker",
);

export const forceCleanup = callable<[app_id: string], OperationResult>("force_cleanup");

export interface InstalledGame {
  app_id: string;
  name: string | null;
  unlocker: string;
  proxy: boolean;
  dlc_count: number;
}

export const listInstalledGames = callable<[], OperationResult & { games?: InstalledGame[] }>("list_installed_games");
export const getActionLog = callable<[limit: number], OperationResult & { lines?: string[] }>("get_action_log");
export const clearActionLog = callable<[], OperationResult>("clear_action_log");

export interface UpdateInfo {
  current: string;
  latest: string | null;
  os: string;
}

export const getUpdateInfo = callable<[force: boolean], UpdateInfo>("get_update_info");
