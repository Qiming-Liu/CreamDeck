import { routerHook } from "@decky/api";
import { definePlugin, useParams } from "@decky/ui";
import type { ComponentType } from "react";

import contextMenuPatch, { LibraryContextMenu } from "./patch";
import CreamDeckPage from "./views/CreamDeckPage";
import LogsPage from "./views/LogsPage";
import { refreshUpdate } from "./hooks/useUpdateInfo";
import { logFrontend } from "./utils/backend";
import QuickAccessPanel, { LOGS_ROUTE, PanelTitle, PluginIcon } from "./views/QuickAccessPanel";

const ROUTE = "/creamdeck/:appid";

function GameRoute() {
  // The route params subscribe to navigation, so going from one game's page straight to
  // another's re-renders here; the key then remounts the page with fresh state.
  const params = useParams<{ appid?: string }>();
  const appId = params?.appid ?? window.location.pathname.match(/\/creamdeck\/(\d+)/)?.[1];
  return <CreamDeckPage key={appId} appId={appId ?? null} />;
}

function patchContextMenu() {
  try {
    return contextMenuPatch(LibraryContextMenu);
  } catch (error) {
    logFrontend("error", "Patch the game context menu", error);
    return undefined;
  }
}

function addRoute(path: string, component: ComponentType, exact: boolean) {
  try {
    routerHook.addRoute(path, component, { exact });
  } catch (error) {
    logFrontend("error", `Add route ${path}`, error);
  }
}

export default definePlugin(() => {
  const menuPatch = patchContextMenu();
  void refreshUpdate();

  addRoute(ROUTE, GameRoute, false);
  addRoute(LOGS_ROUTE, LogsPage, true);

  return {
    name: "CreamDeck",
    titleView: <PanelTitle />,
    content: <QuickAccessPanel />,
    icon: <PluginIcon />,
    onDismount() {
      routerHook.removeRoute(ROUTE);
      routerHook.removeRoute(LOGS_ROUTE);
      menuPatch?.unpatch();
    },
  };
});
