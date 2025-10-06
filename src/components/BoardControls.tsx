import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { selectScene, useSceneStore } from '../state/sceneStore';
import { SceneContent } from '../types/scene';
import { cloneScene } from '../utils/scene';

const INVALID_NAME_CHARACTERS = /[\\/:*?"<>|]/;
const DEFAULT_BOARD_NAME = 'Untitled board';
const DEFAULT_FILE_BASENAME = 'board';

const deriveNameParts = (value: string) => {
  const trimmed = value.trim();
  const withoutExtension = trimmed.replace(/\.json$/i, '');
  const normalized = withoutExtension.replace(/\s+/g, ' ').trim();
  return { withoutExtension, normalized };
};

export const BoardControls: React.FC = () => {
  const scene = useSceneStore(selectScene);
  const replaceScene = useSceneStore((state) => state.replaceScene);
  const [status, setStatus] = useState<string | null>(null);
  const [boardName, setBoardName] = useState(DEFAULT_BOARD_NAME);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const noteTitleId = useId();
  const noteDescriptionId = useId();
  const noteDialogId = useId();
  const nameInputId = useId();
  const nameErrorId = useId();

  const { displayName, downloadFileName, isNameValid, nameError } = useMemo(() => {
    const { withoutExtension, normalized } = deriveNameParts(boardName);
    const hasInvalidCharacters = INVALID_NAME_CHARACTERS.test(withoutExtension);
    const isValid = normalized.length > 0 && !hasInvalidCharacters;
    const safeDisplayName = isValid ? normalized : DEFAULT_BOARD_NAME;
    const fileBase = isValid ? normalized : DEFAULT_FILE_BASENAME;
    const errorMessage = !normalized.length
      ? 'Enter a name before downloading.'
      : hasInvalidCharacters
        ? 'Name cannot include \\ / : * ? " < > | characters.'
        : null;

    return {
      displayName: safeDisplayName,
      downloadFileName: `${fileBase}.json`,
      isNameValid: isValid,
      nameError: errorMessage
    };
  }, [boardName]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => setStatus(null), 2400);
    return () => clearTimeout(timeout);
  }, [status]);

  const isSceneContent = (value: unknown): value is SceneContent => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as SceneContent;
    return Array.isArray(candidate.nodes) && Array.isArray(candidate.connectors);
  };

  const handleExport = () => {
    if (!isNameValid) {
      setStatus('Please provide a valid file name before downloading.');
      return;
    }

    const exportName = displayName;
    const payload = {
      name: exportName,
      scene: cloneScene(scene),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded "${exportName}".`);
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

      const uploadedFileNameParts = deriveNameParts(file.name);
      const parsedSceneName =
        typeof (parsed as { name?: unknown }).name === 'string'
          ? ((parsed as { name?: string }).name as string)
          : null;
      const sceneNameParts = parsedSceneName ? deriveNameParts(parsedSceneName) : null;

      const nextBoardName = uploadedFileNameParts.withoutExtension.length > 0
        ? uploadedFileNameParts.withoutExtension
        : sceneNameParts?.withoutExtension.length
          ? sceneNameParts.withoutExtension
          : DEFAULT_BOARD_NAME;

      const nextDisplayName = sceneNameParts?.normalized.length
        ? sceneNameParts.normalized
        : uploadedFileNameParts.normalized.length
          ? uploadedFileNameParts.normalized
          : DEFAULT_BOARD_NAME;

      replaceScene(sceneData, { resetHistory: true, resetTransform: true });
      setBoardName(nextBoardName);
      setStatus(`Loaded "${nextDisplayName}" from file.`);
    } catch (error) {
      console.error('Failed to import board', error);
      setStatus('Could not load the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (!isNoteOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNoteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNoteOpen]);

  useEffect(() => {
    if (isNoteOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isNoteOpen]);

  const handleNoteToggle = () => {
    setIsNoteOpen(true);
  };

  const handleNoteClose = () => {
    setIsNoteOpen(false);
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setIsNoteOpen(false);
    }
  };

  return (
    <div className="board-controls">
      <div className="board-controls__group">
        <button
          type="button"
          className="board-controls__icon-button"
          onClick={handleNoteToggle}
          aria-haspopup="dialog"
          aria-expanded={isNoteOpen}
          aria-controls={isNoteOpen ? noteDialogId : undefined}
          data-tooltip="use on personal device"
        >
          <span aria-hidden>📝</span>
          <span className="sr-only">Open instructions for using Schematics on a personal device</span>
        </button>
      </div>
      <div className="board-controls__group board-controls__group--actions">
        <label className="board-controls__name-field" htmlFor={nameInputId}>
          <span className="board-controls__name-label">File name</span>
          <input
            id={nameInputId}
            className={`board-controls__name-input${nameError ? ' board-controls__name-input--invalid' : ''}`}
            type="text"
            value={boardName}
            onChange={(event) => setBoardName(event.target.value)}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? nameErrorId : undefined}
            placeholder="Untitled board"
          />
        </label>
        <button
          type="button"
          className="board-controls__button"
          onClick={handleExport}
          disabled={!isNameValid}
        >
          Download
        </button>
        <button type="button" className="board-controls__button" onClick={handleImportClick}>
          Upload
        </button>
      </div>
      {nameError && (
        <p id={nameErrorId} className="board-controls__name-error">
          {nameError}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />
      {status && <div className="board-controls__status">{status}</div>}
      {isNoteOpen && (
        <div
          id={noteDialogId}
          className="board-controls__note-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={noteTitleId}
          aria-describedby={noteDescriptionId}
          onClick={handleOverlayClick}
        >
          <div className="board-controls__note-dialog">
            <div className="board-controls__note-header">
              <h2 id={noteTitleId}>Use Schematics on a personal device</h2>
              <button
                type="button"
                className="board-controls__note-close"
                onClick={handleNoteClose}
                aria-label="Close instructions"
                ref={closeButtonRef}
              >
                ×
              </button>
            </div>
            <div className="board-controls__note-body" id={noteDescriptionId}>
              <p>Open a terminal and follow these steps to run the app locally:</p>
              <ol className="board-controls__note-list">
                <li>
                  <span>Install GitHub tools</span>
                  <code>sudo apt install git</code>
                </li>
                <li>
                  <span>Get the latest version of the app</span>
                  <code>
                    git clone https://github.com/agingfixed/schematicsApp.git
                    <br />
                    cd schematicsApp
                    <br />
                    npm install
                    <br />
                    npm run dev
                  </code>
                  <p className="board-controls__note-hint">
                    You will see:
                    <br />
                    ➜ Local: http://localhost:5173/
                    <br />
                    ➜ Network: http://192.168.1.129:5173/
                    <br />
                    Paste the local address into your browser.
                  </p>
                </li>
                <li>
                  <span>Update to the newest version later</span>
                  <code>
                    cd schematicsApp
                    <br />
                    git status
                    <br />
                    git fetch origin
                    <br />
                    git pull --rebase origin main
                  </code>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardControls;
