import { create } from 'zustand';
import { PenStyle } from '../types/scene';

export type DrawMode = 'draw' | 'erase';

export interface DrawSettings {
  style: PenStyle;
  size: number;
  color: string;
  mode: DrawMode;
}

interface DrawStoreState {
  current: DrawSettings;
  setStyle: (style: PenStyle) => void;
  setSize: (size: number) => void;
  setColor: (color: string) => void;
  setMode: (mode: DrawMode) => void;
}

const DEFAULT_SETTINGS: DrawSettings = {
  style: 'pen',
  size: 4,
  color: '#f8fafc',
  mode: 'draw'
};

export const useDrawStore = create<DrawStoreState>((set) => ({
  current: { ...DEFAULT_SETTINGS },
  setStyle: (style) =>
    set((state) => ({
      current: { ...state.current, style }
    })),
  setSize: (size) =>
    set((state) => ({
      current: { ...state.current, size }
    })),
  setColor: (color) =>
    set((state) => ({
      current: { ...state.current, color }
    })),
  setMode: (mode) =>
    set((state) => ({
      current: { ...state.current, mode }
    }))
}));

export const selectDrawSettings = (state: DrawStoreState) => state.current;
