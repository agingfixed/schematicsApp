import { create } from 'zustand';
import { PenStyle } from '../types/scene';

export interface DrawSettings {
  style: PenStyle;
  size: number;
  color: string;
}

interface DrawStoreState {
  current: DrawSettings;
  setStyle: (style: PenStyle) => void;
  setSize: (size: number) => void;
  setColor: (color: string) => void;
}

const DEFAULT_SETTINGS: DrawSettings = {
  style: 'pen',
  size: 4,
  color: '#f8fafc'
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
    }))
}));

export const selectDrawSettings = (state: DrawStoreState) => state.current;
