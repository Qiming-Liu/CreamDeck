import { routerHook } from "@decky/api";
import { definePlugin } from "@decky/ui";

import contextMenuPatch, { LibraryContextMenu } from "./patch";
import CreamDeckPage from "./views/CreamDeckPage";
import LogsPage from "./views/LogsPage";
import { refreshUpdate } from "./hooks/useUpdateInfo";
import QuickAccessPanel, { LOGS_ROUTE, PanelTitle, PluginIcon } from "./views/QuickAccessPanel";

const ROUTE = "/creamdeck/:appid";

function GameRoute() {
  // Keep edits across tabs, but never carry them into another game.
  const appId = window.location.pathname.match(/\/creamdeck\/(\d+)/)?.[1];
  return <CreamDeckPage key={appId} />;
}

export default definePlugin(() => {
  const menuPatch = contextMenuPatch(LibraryContextMenu);
  void refreshUpdate();

  routerHook.addRoute(ROUTE, GameRoute, { exact: false });
  routerHook.addRoute(LOGS_ROUTE, LogsPage, { exact: true });

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
