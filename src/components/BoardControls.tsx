import React, { useEffect, useRef, useState } from 'react';
import { selectScene, useSceneStore } from '../state/sceneStore';
import { SceneContent } from '../types/scene';
import { cloneScene } from '../utils/scene';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export const BoardControls: React.FC = () => {
  const scene = useSceneStore(selectScene);
  const replaceScene = useSceneStore((state) => state.replaceScene);
  const [status, setStatus] = useState<string | null>(null);
  const [lastBoardName, setLastBoardName] = useState('Untitled board');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { canInstall, promptInstall, isInstalled } = useInstallPrompt();

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

  const handleInstallClick = async () => {
    try {
      const accepted = await promptInstall();
      if (accepted) {
        setStatus('Desktop app installed. You can now launch it from your device.');
      } else {
        setStatus('Install was dismissed. You can try again later.');
      }
    } catch (error) {
      console.warn('Failed to trigger install prompt', error);
      setStatus('Could not start the install prompt. Please try again.');
    }
  };

  return (
    <div className="board-controls">
      <div className="board-controls__group board-controls__group--install">
        <button
          type="button"
          className="board-controls__button board-controls__button--primary"
          onClick={handleInstallClick}
          disabled={!canInstall}
        >
          {isInstalled ? 'Installed for Offline Use' : 'Install Desktop App'}
        </button>
        <div className="board-controls__hint">
          {isInstalled
            ? 'Open the installed app from your applications menu to work offline.'
            : canInstall
              ? 'Install once to add the app to your desktop and enable offline boards.'
              : 'Use your browser menu to install or add the app to your desktop when the button is disabled.'}
        </div>
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
    </div>
  );
};

export default BoardControls;
