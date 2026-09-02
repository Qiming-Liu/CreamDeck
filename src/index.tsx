import { routerHook } from "@decky/api";
import { definePlugin, staticClasses } from "@decky/ui";
import { FaUnlock as PluginIcon } from "react-icons/fa";

import contextMenuPatch, { LibraryContextMenu } from "./patch";
import CreamDeckPage from "./views/CreamDeckPage";

const ROUTE = "/creamdeck/:appid";

export default definePlugin(() => {
  const menuPatch = contextMenuPatch(LibraryContextMenu);

  routerHook.addRoute(ROUTE, CreamDeckPage, { exact: true });

  return {
    name: "CreamDeck",
    title: <div className={staticClasses.Title}>CreamDeck</div>,
    content: (
      <div style={{ padding: "1em" }}>
        Right-click any installed Steam game in your library and choose "CreamDeck" to
        select which of its DLC to unlock.
      </div>
    ),
    icon: <PluginIcon />,
    onDismount() {
      routerHook.removeRoute(ROUTE);
      menuPatch?.unpatch();
    },
  };
});
