import {
  afterPatch,
  type Export,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  MenuItem,
  Navigation,
  type Patch,
} from "@decky/ui";
import type { FC } from "react";

const MENU_ITEM_KEY = "creamdeck";

// Always add before "Properties..."
const spliceMenuItem = (children: any[], appid: number) => {
  if (!Array.isArray(children)) return;
  // Search recursively to support Steam's grouped/wrapped items.
  // Shared menu components also render submenus, which have no Properties item.
  const propertiesMenuItemIdx = children.findIndex((item) =>
    findInReactTree(item, (x) => x?.onSelected?.toString().includes("AppProperties")),
  );
  if (propertiesMenuItemIdx < 0) return;
  const propertiesMenuItem = children[propertiesMenuItemIdx];
  handleItemDupes(children);
  children.splice(
    children.indexOf(propertiesMenuItem),
    0,
    <MenuItem
      key={MENU_ITEM_KEY}
      onSelected={() => {
        Navigation.Navigate(`/creamdeck/${appid}`);
      }}
    >
      CreamDeck
    </MenuItem>,
  );
};

// Check if correct menu by looking at the code of the onSelected function.
// Should be enough to ignore the screenshots and other menus.
const isOpeningAppContextMenu = (items: any[]) => {
  if (!items?.length) {
    return false;
  }
  return !!findInReactTree(items, (x) => x?.props?.onSelected?.toString().includes("launchSource"));
};

const handleItemDupes = (items: any[]) => {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.key === MENU_ITEM_KEY) items.splice(i, 1);
  }
};

const patchMenuItems = (menuItems: any[], appid: number) => {
  let updatedAppid: number = appid;
  // find the first menu component that has the correct appid, sometimes the one passed is cached from another context menu
  const parentOverview = menuItems.find(
    (x: any) => x?._owner?.pendingProps?.overview?.appid && x._owner.pendingProps.overview.appid !== appid,
  );
  if (parentOverview) {
    updatedAppid = parentOverview._owner.pendingProps.overview.appid;
  }
  if (updatedAppid === appid) {
    const foundApp = findInTree(menuItems, (x) => x?.app?.appid, { walkable: ["props", "children"] });
    if (foundApp) {
      updatedAppid = foundApp.app.appid;
    }
  }
  spliceMenuItem(menuItems, updatedAppid);
};

/**
 * Patches the game library context menu to add a "CreamDeck" entry.
 * @param LibraryContextMenu The game context menu.
 * @returns A patch object; call `.unpatch()` to remove it when the plugin dismounts.
 */
const contextMenuPatch = (LibraryContextMenu: any) => {
  const nested: Patch[] = [];
  const patchedTypes = new Set<any>();
  const patches: {
    outer?: Patch;
    inner?: Patch;
    unpatch: () => void;
  } = {
    unpatch: () => {
      return null;
    },
  };
  patches.outer = afterPatch(LibraryContextMenu.prototype, "render", (_: Record<string, unknown>[], component: any) => {
    let appid: number | undefined;
    if (component._owner) {
      appid = component._owner.pendingProps.overview.appid;
    } else {
      const foundApp = findInTree(component.props.children, (x) => x?.app?.appid, { walkable: ["props", "children"] });
      if (foundApp) {
        appid = foundApp.app.appid;
      }
    }
    if (appid === undefined) {
      return component;
    }

    if (!patches.inner) {
      patches.inner = afterPatch(component, "type", (_: any, ret: any) => {
        // Patch each menu type once, even if Steam renders it repeatedly.
        const prototype = ret.type.prototype;
        if (patchedTypes.has(prototype)) return ret;
        patchedTypes.add(prototype);
        nested.push(afterPatch(prototype, "render", (_: any, ret2: any) => {
          const menuItems = ret2.props.children[0]; // always the first child
          if (!isOpeningAppContextMenu(menuItems)) return ret2;
          try {
            handleItemDupes(menuItems);
          } catch (error) {
            return ret2;
          }
          patchMenuItems(menuItems, appid!);
          return ret2;
        }));

        // when Steam decides to refresh the app overview
        nested.push(afterPatch(prototype, "shouldComponentUpdate", ([nextProps]: any, shouldUpdate: any) => {
          try {
            handleItemDupes(nextProps.children);
          } catch (error) {
            // wrong context menu (probably)
            return shouldUpdate;
          }

          if (shouldUpdate === true) {
            patchMenuItems(nextProps.children, appid!);
          }

          return shouldUpdate;
        }));
        return ret;
      });
    } else {
      spliceMenuItem(component.props.children, appid);
    }
    return component;
  });
  patches.unpatch = () => {
    for (const patch of nested.splice(0).reverse()) patch.unpatch();
    patchedTypes.clear();
    patches.outer?.unpatch();
    patches.inner?.unpatch();
  };
  return patches;
};

/**
 * Game context menu component, located via its module export (there's no
 * documented/stable public API for it, so this relies on locating the render
 * function by looking for known internal identifiers).
 */
export const LibraryContextMenu = fakeRenderComponent(
  Object.values(findModuleByExport((e: Export) => e?.toString?.().includes("().LibraryContextMenu"))).find((sibling) =>
    sibling?.toString().includes("navigator:"),
  ) as FC,
).type;

export default contextMenuPatch;
