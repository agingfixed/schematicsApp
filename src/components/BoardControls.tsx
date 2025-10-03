import React, { useEffect, useId, useRef, useState } from 'react';
import { selectScene, useSceneStore } from '../state/sceneStore';
import { SceneContent } from '../types/scene';
import { cloneScene } from '../utils/scene';

export const BoardControls: React.FC = () => {
  const scene = useSceneStore(selectScene);
  const replaceScene = useSceneStore((state) => state.replaceScene);
  const [status, setStatus] = useState<string | null>(null);
  const [lastBoardName, setLastBoardName] = useState('Untitled board');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const noteTitleId = useId();
  const noteDescriptionId = useId();
  const noteDialogId = useId();

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => setStatus(null), 2400);
    return () => clearTimeout(timeout);
  }, [status]);

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
    const exportName = lastBoardName.trim() ? lastBoardName.trim() : 'Untitled board';
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

      const importedName =
        typeof (parsed as { name?: unknown }).name === 'string'
          ? ((parsed as { name?: string }).name as string)
          : file.name.replace(/\.json$/i, '');

      replaceScene(sceneData, { resetHistory: true, resetTransform: true });
      setLastBoardName(importedName || 'Untitled board');
      setStatus(`Loaded "${importedName}" from file.`);
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
        <button type="button" className="board-controls__button" onClick={handleExport}>
          Download
        </button>
        <button type="button" className="board-controls__button" onClick={handleImportClick}>
          Upload
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
