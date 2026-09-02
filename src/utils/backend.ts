import { callable } from "@decky/api";

export interface DlcInfo {
  id: string;
  name: string;
}

export interface UnlockerInfo {
  key: string;
  label: string;
  supports_dlc_list: boolean;
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
  koaloader_autoload?: string[];
  integrity_error?: string | null;
}

export interface OperationResult {
  success: boolean;
  error?: string;
}

export const getGamePage = callable<[app_id: string], GamePage>("get_game_page");

export const installDlcUnlocker = callable<
  [
    app_id: string,
    unlocker: string,
    enabled_dlc_ids: string[],
    proxy: boolean,
    proxy_dll: string,
    koaloader_autoload: string[],
  ],
  OperationResult
>("install_dlc_unlocker");

export const uninstallDlcUnlocker = callable<[app_id: string], OperationResult>(
  "uninstall_dlc_unlocker",
);

export const forceCleanup = callable<[app_id: string], OperationResult>("force_cleanup");
