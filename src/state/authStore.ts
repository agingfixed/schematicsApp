import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { SceneContent } from '../types/scene';
import { cloneScene } from '../utils/scene';

interface SavedBoard {
  id: string;
  name: string;
  scene: SceneContent;
  updatedAt: string;
}

interface StoredUserData {
  boards: SavedBoard[];
  currentBoardId?: string | null;
}

interface StorageShape {
  [username: string]: StoredUserData | undefined;
}

interface AuthStoreState {
  user: string | null;
  error: string | null;
  savedBoards: SavedBoard[];
  currentBoardId: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  clearError: () => void;
  saveBoard: (scene: SceneContent, name?: string) => SavedBoard | null;
  saveBoardAs: (name: string, scene: SceneContent) => SavedBoard | null;
  selectBoard: (boardId: string | null) => SavedBoard | null;
  deleteBoard: (boardId: string) => void;
}

const STORAGE_KEY = 'schematicsApp.boards';
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'password';

const isStorageAvailable = () => typeof window !== 'undefined' && !!window.localStorage;

const readStorage = (): StorageShape => {
  if (!isStorageAvailable()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as StorageShape;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const writeStorage = (data: StorageShape) => {
  if (!isStorageAvailable()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore write failures
  }
};

const hydrateBoards = (boards: SavedBoard[] | undefined): SavedBoard[] => {
  if (!boards?.length) {
    return [];
  }
  return boards.map((board) => ({
    ...board,
    scene: cloneScene(board.scene)
  }));
};

const persistUserData = (username: string, boards: SavedBoard[], currentBoardId: string | null) => {
  if (!isStorageAvailable()) {
    return;
  }
  const storage = readStorage();
  storage[username] = {
    boards: boards.map((board) => ({
      ...board,
      scene: cloneScene(board.scene)
    })),
    currentBoardId
  };
  writeStorage(storage);
};

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: null,
  error: null,
  savedBoards: [],
  currentBoardId: null,
  login: (username, password) => {
    const normalized = username.trim();
    if (normalized !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      set({ error: 'Invalid username or password.' });
      return false;
    }

    const storage = readStorage();
    const userData: StoredUserData | undefined = storage[normalized];
    const boards = hydrateBoards(userData?.boards);
    const currentBoardId = userData?.currentBoardId ?? null;

    set({
      user: normalized,
      error: null,
      savedBoards: boards,
      currentBoardId: currentBoardId && boards.some((board) => board.id === currentBoardId)
        ? currentBoardId
        : null
    });

    return true;
  },
  logout: () => {
    set({ user: null, savedBoards: [], currentBoardId: null, error: null });
  },
  clearError: () => set({ error: null }),
  saveBoard: (scene, name) => {
    const state = get();
    if (!state.user || !state.currentBoardId) {
      return null;
    }

    let updatedBoard: SavedBoard | null = null;
    const boards = state.savedBoards.map((board) => {
      if (board.id !== state.currentBoardId) {
        return board;
      }
      const nextName = name?.trim() ? name.trim() : board.name;
      updatedBoard = {
        ...board,
        name: nextName,
        scene: cloneScene(scene),
        updatedAt: new Date().toISOString()
      };
      return updatedBoard;
    });

    if (!updatedBoard) {
      return null;
    }

    persistUserData(state.user, boards, state.currentBoardId);
    set({ savedBoards: boards });
    return updatedBoard;
  },
  saveBoardAs: (name, scene) => {
    const state = get();
    if (!state.user) {
      return null;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const newBoard: SavedBoard = {
      id: nanoid(),
      name: trimmedName,
      scene: cloneScene(scene),
      updatedAt: new Date().toISOString()
    };

    const boards = [...state.savedBoards, newBoard];
    persistUserData(state.user, boards, newBoard.id);

    set({ savedBoards: boards, currentBoardId: newBoard.id });
    return newBoard;
  },
  selectBoard: (boardId) => {
    const state = get();
    if (!state.user) {
      return null;
    }

    if (!boardId) {
      persistUserData(state.user, state.savedBoards, null);
      set({ currentBoardId: null });
      return null;
    }

    const board = state.savedBoards.find((item) => item.id === boardId) ?? null;
    if (!board) {
      return null;
    }

    persistUserData(state.user, state.savedBoards, boardId);
    set({ currentBoardId: boardId });
    return board;
  },
  deleteBoard: (boardId) => {
    const state = get();
    if (!state.user) {
      return;
    }

    const boards = state.savedBoards.filter((board) => board.id !== boardId);
    const nextBoardId = state.currentBoardId === boardId ? boards[0]?.id ?? null : state.currentBoardId;
    persistUserData(state.user, boards, nextBoardId);
    set({ savedBoards: boards, currentBoardId: nextBoardId ?? null });
  }
}));

export type { SavedBoard };
