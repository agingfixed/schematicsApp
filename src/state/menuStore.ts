import { create } from 'zustand';

export type FloatingMenuType =
  | 'selection-toolbar'
  | 'connector-toolbar'
  | 'connector-label-toolbar';

export interface FloatingMenuPosition {
  x: number;
  y: number;
}

export interface FloatingMenuPlacement {
  isFree: boolean;
  position: FloatingMenuPosition | null;
}

export const DEFAULT_MENU_PLACEMENT: FloatingMenuPlacement = { isFree: false, position: null };

interface FloatingMenuStoreState {
  menus: Partial<Record<FloatingMenuType, FloatingMenuPlacement>>;
  setMenuFreePosition: (menu: FloatingMenuType, position: FloatingMenuPosition) => void;
  resetMenu: (menu: FloatingMenuType) => void;
}

export const useFloatingMenuStore = create<FloatingMenuStoreState>((set) => ({
  menus: {},
  setMenuFreePosition: (menu, position) =>
    set((state) => ({
      menus: {
        ...state.menus,
        [menu]: { isFree: true, position }
      }
    })),
  resetMenu: (menu) =>
    set((state) => ({
      menus: {
        ...state.menus,
        [menu]: { ...DEFAULT_MENU_PLACEMENT }
      }
    }))
}));
