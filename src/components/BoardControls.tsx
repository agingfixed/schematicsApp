import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../state/authStore';
import { selectScene, useSceneStore } from '../state/sceneStore';

export const BoardControls: React.FC = () => {
  const scene = useSceneStore(selectScene);
  const saveBoard = useAuthStore((state) => state.saveBoard);
  const saveBoardAs = useAuthStore((state) => state.saveBoardAs);
  const selectBoard = useAuthStore((state) => state.selectBoard);
  const deleteBoard = useAuthStore((state) => state.deleteBoard);
  const logout = useAuthStore((state) => state.logout);
  const savedBoards = useAuthStore((state) => state.savedBoards);
  const currentBoardId = useAuthStore((state) => state.currentBoardId);

  const [boardName, setBoardName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

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
    selectBoard(null);
    setBoardName('');
    setStatus('Started a new board.');
  };

  const handleDelete = () => {
    if (!currentBoardId) {
      return;
    }
    deleteBoard(currentBoardId);
    setStatus('Board deleted.');
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
        <button type="button" className="board-controls__button board-controls__button--quiet" onClick={logout}>
          Log out
        </button>
      </div>
      {status && <div className="board-controls__status">{status}</div>}
    </div>
  );
};

export default BoardControls;
