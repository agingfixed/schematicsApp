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
  sharedPlacement: FloatingMenuPlacement;
  setMenuFreePosition: (menu: FloatingMenuType, position: FloatingMenuPosition) => void;
  resetMenu: (menu: FloatingMenuType) => void;
  clearSharedPlacement: () => void;
}

export const useFloatingMenuStore = create<FloatingMenuStoreState>((set) => ({
  menus: {},
  sharedPlacement: { ...DEFAULT_MENU_PLACEMENT },
  setMenuFreePosition: (menu, position) =>
    set((state) => {
      const nextPlacement: FloatingMenuPlacement = { isFree: true, position };
      return {
        menus: {
          ...state.menus,
          [menu]: nextPlacement
        },
        sharedPlacement: nextPlacement
      };
    }),
  resetMenu: (menu) =>
    set((state) => ({
      menus: {
        ...state.menus,
        [menu]: { ...DEFAULT_MENU_PLACEMENT }
      }
    })),
  clearSharedPlacement: () =>
    set(() => ({
      menus: {},
      sharedPlacement: { ...DEFAULT_MENU_PLACEMENT }
    }))
}));
