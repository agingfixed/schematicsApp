import React, { type ReactNode } from 'react';
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

const SelectCursorIcon: React.FC = () => (
  <svg className="toolbar__cursor-icon" viewBox="0 0 24 24" aria-hidden>
    <polygon
      points="6 3 6 18 10.6 13.4 13.6 21 15.6 20.1 12.5 13.1 18 13.1"
      fill="#1d4ed8"
      stroke="#f8fafc"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
  </svg>
);

const nodeToolOptions = [
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' }
] as const;

type NodeTool = (typeof nodeToolOptions)[number]['value'];

const isNodeTool = (value: Tool): value is NodeTool =>
  nodeToolOptions.some((option) => option.value === value);

const toolButtons: Array<{
  id: Exclude<Tool, NodeTool>;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip: string;
}> = [
  { id: 'select', label: 'Select', icon: <SelectCursorIcon />, shortcut: 'V', tooltip: 'Select' },
  { id: 'pan', label: 'Pan', icon: '✋', shortcut: 'Space', tooltip: 'Pan' },
  { id: 'connector', label: 'Connector', icon: '↦', shortcut: 'L', tooltip: 'Connector' }
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

  const handleNodeToolChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value as NodeTool | '';
    if (!nextValue) {
      return;
    }
    setTool(nextValue);
  };

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
        {toolButtons.map((button) => {
          if (button.id === 'connector') {
            const nodeToolValue = isNodeTool(tool) ? tool : '';
            return (
              <React.Fragment key={button.id}>
                <div className={`toolbar__select ${nodeToolValue ? 'is-active' : ''}`}>
                  <label className="sr-only" htmlFor="toolbar-node-select">
                    Add node
                  </label>
                  <select
                    id="toolbar-node-select"
                    value={nodeToolValue}
                    onChange={handleNodeToolChange}
                    aria-label="Add node"
                  >
                    <option value="">Add node…</option>
                    {nodeToolOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className={`toolbar__button ${tool === button.id ? 'is-active' : ''}`}
                  aria-pressed={tool === button.id}
                  onClick={() => setTool(button.id)}
                  aria-label={`${button.label} tool${button.shortcut ? ` (${button.shortcut})` : ''}`}
                  data-tooltip={button.tooltip}
                >
                  <span className="toolbar__icon" aria-hidden>
                    {button.icon}
                  </span>
                </button>
              </React.Fragment>
            );
          }

          return (
            <button
              key={button.id}
              type="button"
              className={`toolbar__button ${tool === button.id ? 'is-active' : ''}`}
              aria-pressed={tool === button.id}
              onClick={() => setTool(button.id)}
              aria-label={`${button.label} tool${button.shortcut ? ` (${button.shortcut})` : ''}`}
              data-tooltip={button.tooltip}
            >
              <span className="toolbar__icon" aria-hidden>
                {button.icon}
              </span>
            </button>
          );
        })}
      </div>
      <div className="toolbar__group">
        <button
          type="button"
          className="toolbar__button"
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label="Undo"
          data-tooltip="Undo"
        >
          ⎌
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label="Redo"
          data-tooltip="Redo"
        >
          ↻
        </button>
      </div>
      <div className="toolbar__group">
        <button
          type="button"
          className="toolbar__button"
          onClick={() => handleZoom('fit')}
          aria-label="Zoom to fit"
          data-tooltip="Fit view"
        >
          Fit
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={() => handleZoom('selection')}
          aria-label="Zoom to selection"
          data-tooltip="Fit selection"
        >
          Sel
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={() => handleZoom('hundred')}
          aria-label="Reset zoom"
          data-tooltip="100% zoom"
        >
          100%
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={() => handleZoom('out')}
          aria-label="Zoom out"
          data-tooltip="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={() => handleZoom('in')}
          aria-label="Zoom in"
          data-tooltip="Zoom in"
        >
          +
        </button>
        <div className="toolbar__status">{Math.round(transform.scale * 100)}%</div>
      </div>
      <div className="toolbar__group">
        <button
          type="button"
          className={`toolbar__button ${gridVisible ? 'is-active' : ''}`}
          onClick={toggleGrid}
          aria-pressed={gridVisible}
          aria-label="Toggle grid"
          data-tooltip="Grid on/off"
        >
          Grid
        </button>
        <button
          type="button"
          className={`toolbar__button ${snapSettings.enabled ? 'is-active' : ''}`}
          onClick={toggleSnap}
          aria-pressed={snapSettings.enabled}
          aria-label="Toggle smart snap"
          data-tooltip="Smart snap"
        >
          Snap
        </button>
        <button
          type="button"
          className={`toolbar__button ${showMiniMap ? 'is-active' : ''}`}
          onClick={() => setShowMiniMap(!showMiniMap)}
          aria-pressed={showMiniMap}
          aria-label="Toggle mini map"
          data-tooltip="Mini map"
        >
          Map
        </button>
      </div>
    </div>
  );
};
