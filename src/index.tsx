import { routerHook } from "@decky/api";
import { definePlugin, staticClasses } from "@decky/ui";
import { FaUnlock as PluginIcon } from "react-icons/fa";

import contextMenuPatch, { LibraryContextMenu } from "./patch";
import { useTranslations } from "./utils/i18n";
import CreamDeckPage from "./views/CreamDeckPage";

const ROUTE = "/creamdeck/:appid";

function QuickAccessContent() {
  const t = useTranslations();
  return <div style={{ padding: "1em" }}>{t.quickAccessContent}</div>;
}

function GameRoute() {
  // Keep edits across sidebar routes, but never carry them into another game.
  const appId = window.location.pathname.match(/\/creamdeck\/(\d+)/)?.[1];
  return <CreamDeckPage key={appId} />;
}

export default definePlugin(() => {
  const menuPatch = contextMenuPatch(LibraryContextMenu);

  routerHook.addRoute(ROUTE, GameRoute, { exact: false });

  return {
    name: "CreamDeck",
    title: <div className={staticClasses.Title}>CreamDeck</div>,
    content: <QuickAccessContent />,
    icon: <PluginIcon />,
    onDismount() {
      routerHook.removeRoute(ROUTE);
      menuPatch?.unpatch();
    },
  };
});
