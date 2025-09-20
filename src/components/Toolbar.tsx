import React from 'react';
import { CanvasHandle } from './Canvas';
import {
  selectCanRedo,
  selectCanUndo,
  selectGridVisible,
  selectSnapSettings,
  selectShowMiniMap,
  selectTool,
  selectTransform,
  useSceneStore
} from '../state/sceneStore';
import { Tool } from '../types/scene';

interface ToolbarProps {
  canvasRef: React.RefObject<CanvasHandle>;
}

const toolButtons: Array<{ id: Tool; label: string; icon: string; shortcut?: string }> = [
  { id: 'select', label: 'Select', icon: '🖱️', shortcut: 'V' },
  { id: 'pan', label: 'Pan', icon: '✋', shortcut: 'Space' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭', shortcut: 'R' },
  { id: 'rounded-rectangle', label: 'Terminator', icon: '⬒', shortcut: 'T' },
  { id: 'ellipse', label: 'Ellipse', icon: '⬭', shortcut: 'O' },
  { id: 'diamond', label: 'Decision', icon: '◇', shortcut: 'D' },
  { id: 'connector', label: 'Connector', icon: '↦', shortcut: 'L' }
];

export const Toolbar: React.FC<ToolbarProps> = ({ canvasRef }) => {
  const tool = useSceneStore(selectTool);
  const setTool = useSceneStore((state) => state.setTool);
  const undo = useSceneStore((state) => state.undo);
  const redo = useSceneStore((state) => state.redo);
  const canUndo = useSceneStore(selectCanUndo);
  const canRedo = useSceneStore(selectCanRedo);
  const gridVisible = useSceneStore(selectGridVisible);
  const toggleGrid = useSceneStore((state) => state.toggleGrid);
  const snapSettings = useSceneStore(selectSnapSettings);
  const toggleSnap = useSceneStore((state) => state.toggleSnap);
  const showMiniMap = useSceneStore(selectShowMiniMap);
  const setShowMiniMap = useSceneStore((state) => state.setShowMiniMap);
  const transform = useSceneStore(selectTransform);

  const handleZoom = (type: 'in' | 'out' | 'fit' | 'selection' | 'hundred') => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    switch (type) {
      case 'in':
        canvas.zoomIn();
        break;
      case 'out':
        canvas.zoomOut();
        break;
      case 'fit':
        canvas.zoomToFit();
        break;
      case 'selection':
        canvas.zoomToSelection();
        break;
      case 'hundred':
        canvas.zoomToHundred();
        break;
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {toolButtons.map((button) => (
          <button
            key={button.id}
            type="button"
            className={`toolbar__button ${tool === button.id ? 'is-active' : ''}`}
            aria-pressed={tool === button.id}
            onClick={() => setTool(button.id)}
            title={`${button.label}${button.shortcut ? ` (${button.shortcut})` : ''}`}
          >
            <span className="toolbar__icon" aria-hidden>
              {button.icon}
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar__group">
        <button type="button" className="toolbar__button" onClick={() => undo()} disabled={!canUndo} title="Undo (⌘Z)">
          ⎌
        </button>
        <button type="button" className="toolbar__button" onClick={() => redo()} disabled={!canRedo} title="Redo (⇧⌘Z)">
          ↻
        </button>
      </div>
      <div className="toolbar__group">
        <button type="button" className="toolbar__button" onClick={() => handleZoom('fit')} title="Zoom to Fit">
          Fit
        </button>
        <button type="button" className="toolbar__button" onClick={() => handleZoom('selection')} title="Zoom to Selection">
          Sel
        </button>
        <button type="button" className="toolbar__button" onClick={() => handleZoom('hundred')} title="100%">
          100%
        </button>
        <button type="button" className="toolbar__button" onClick={() => handleZoom('out')} title="Zoom Out">
          −
        </button>
        <button type="button" className="toolbar__button" onClick={() => handleZoom('in')} title="Zoom In">
          +
        </button>
        <div className="toolbar__status">{Math.round(transform.scale * 100)}%</div>
      </div>
      <div className="toolbar__group">
        <button
          type="button"
          className={`toolbar__button ${gridVisible ? 'is-active' : ''}`}
          onClick={toggleGrid}
          title="Toggle Grid"
        >
          Grid
        </button>
        <button
          type="button"
          className={`toolbar__button ${snapSettings.enabled ? 'is-active' : ''}`}
          onClick={toggleSnap}
          title="Toggle Smart Snap"
        >
          Snap
        </button>
        <button
          type="button"
          className={`toolbar__button ${showMiniMap ? 'is-active' : ''}`}
          onClick={() => setShowMiniMap(!showMiniMap)}
          title="Toggle Mini Map"
        >
          Map
        </button>
      </div>
    </div>
  );
};
