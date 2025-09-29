import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../state/authStore';
import { selectScene, useSceneStore } from '../state/sceneStore';
import { SceneContent } from '../types/scene';
import { cloneScene } from '../utils/scene';

export const BoardControls: React.FC = () => {
  const scene = useSceneStore(selectScene);
  const replaceScene = useSceneStore((state) => state.replaceScene);
  const resetScene = useSceneStore((state) => state.resetScene);
  const saveBoard = useAuthStore((state) => state.saveBoard);
  const saveBoardAs = useAuthStore((state) => state.saveBoardAs);
  const selectBoard = useAuthStore((state) => state.selectBoard);
  const deleteBoard = useAuthStore((state) => state.deleteBoard);
  const logout = useAuthStore((state) => state.logout);
  const savedBoards = useAuthStore((state) => state.savedBoards);
  const currentBoardId = useAuthStore((state) => state.currentBoardId);

  const [boardName, setBoardName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentBoardId) {
      setBoardName('');
      return;
    }
    const board = savedBoards.find((item) => item.id === currentBoardId);
    if (board) {
      setBoardName(board.name);
    }
  }, [currentBoardId, savedBoards]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => setStatus(null), 2400);
    return () => clearTimeout(timeout);
  }, [status]);

  const handleBoardChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = event.target.value || null;
    const loadedBoard = selectBoard(selectedId);
    if (selectedId && loadedBoard) {
      setStatus(`Loaded "${loadedBoard.name}".`);
    } else {
      resetScene();
      setStatus('Started a new board.');
    }
  };

  const handleSave = () => {
    const result = saveBoard(scene, boardName);
    if (result) {
      setStatus('Board saved.');
    }
  };

  const handleSaveAs = () => {
    if (!boardName.trim()) {
      setStatus('Enter a board name before saving.');
      return;
    }
    const result = saveBoardAs(boardName, scene);
    if (result) {
      setStatus('Board saved as new entry.');
    }
  };

  const handleNewBoard = () => {
    resetScene();
    selectBoard(null);
    setBoardName('');
    setStatus('Started a new board.');
  };

  const handleDelete = () => {
    if (!currentBoardId) {
      return;
    }
    deleteBoard(currentBoardId);
    resetScene();
    setStatus('Board deleted.');
  };

  const sanitizeFileName = (name: string) => {
    const fallback = 'board';
    const trimmed = name.trim().toLowerCase();
    const slug = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
  };

  const isSceneContent = (value: unknown): value is SceneContent => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as SceneContent;
    return Array.isArray(candidate.nodes) && Array.isArray(candidate.connectors);
  };

  const handleExport = () => {
    const exportName = boardName.trim() ? boardName.trim() : 'Untitled board';
    const payload = {
      name: exportName,
      scene: cloneScene(scene),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(exportName)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus('Board downloaded.');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const sceneData = isSceneContent(parsed)
        ? parsed
        : typeof parsed === 'object' && parsed !== null && isSceneContent((parsed as { scene?: unknown }).scene)
          ? (parsed as { scene: SceneContent }).scene
          : null;

      if (!sceneData) {
        throw new Error('Invalid scene');
      }

      const importedName =
        typeof (parsed as { name?: unknown }).name === 'string'
          ? ((parsed as { name?: string }).name as string)
          : file.name.replace(/\.json$/i, '');

      replaceScene(sceneData, { resetHistory: true, resetTransform: true });
      selectBoard(null);
      setBoardName(importedName);
      setStatus(`Loaded "${importedName}" from file.`);
    } catch (error) {
      console.error('Failed to import board', error);
      setStatus('Could not load the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const boardOptions = useMemo(
    () =>
      savedBoards.map((board) => (
        <option key={board.id} value={board.id}>
          {board.name}
        </option>
      )),
    [savedBoards]
  );

  return (
    <div className="board-controls">
      <div className="board-controls__group">
        <label className="board-controls__label" htmlFor="board-select">
          Boards
        </label>
        <select
          id="board-select"
          className="board-controls__select"
          value={currentBoardId ?? ''}
          onChange={handleBoardChange}
        >
          <option value="">New board</option>
          {boardOptions}
        </select>
        <button type="button" className="board-controls__button" onClick={handleNewBoard}>
          New
        </button>
        <button
          type="button"
          className="board-controls__button"
          onClick={handleDelete}
          disabled={!currentBoardId}
        >
          Delete
        </button>
      </div>
      <div className="board-controls__group board-controls__group--grow">
        <label className="board-controls__label" htmlFor="board-name">
          Board name
        </label>
        <input
          id="board-name"
          className="board-controls__input"
          type="text"
          value={boardName}
          onChange={(event) => setBoardName(event.target.value)}
          placeholder="Untitled board"
        />
      </div>
      <div className="board-controls__group">
        <button
          type="button"
          className="board-controls__button board-controls__button--primary"
          onClick={handleSave}
          disabled={!currentBoardId}
        >
          Save
        </button>
        <button
          type="button"
          className="board-controls__button"
          onClick={handleSaveAs}
        >
          Save as
        </button>
        <button type="button" className="board-controls__button" onClick={handleExport}>
          Download
        </button>
        <button type="button" className="board-controls__button" onClick={handleImportClick}>
          Upload
        </button>
        <button type="button" className="board-controls__button board-controls__button--quiet" onClick={logout}>
          Log out
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />
      {status && <div className="board-controls__status">{status}</div>}
    </div>
  );
};

export default BoardControls;
