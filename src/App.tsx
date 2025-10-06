import React, { useMemo, useRef, useState } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { MiniMap } from './components/MiniMap';
import {
  selectScene,
  selectShowMiniMap,
  selectTool,
  selectTransform,
  useSceneStore
} from './state/sceneStore';
import { DrawMenu } from './components/DrawMenu';
import { BoardControls } from './components/BoardControls';
import './App.css';

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const showMiniMap = useSceneStore(selectShowMiniMap);
  const tool = useSceneStore(selectTool);
  const transform = useSceneStore(selectTransform);
  const scene = useSceneStore(selectScene);

  const nodeCount = scene.nodes.length;
  const connectorCount = scene.connectors.length;
  const drawingCount = scene.drawings.length;

  const statusText = useMemo(() => {
    const parts = [`${nodeCount} nodes`, `${connectorCount} connectors`];
    if (drawingCount) {
      parts.push(`${drawingCount} drawings`);
    }
    return parts.join(' · ');
  }, [nodeCount, connectorCount, drawingCount]);

  return (
    <div className="app-shell">
      <BoardControls />
      <Toolbar canvasRef={canvasRef} />
      <div className="workspace">
        <div className="workspace__main">
          {tool === 'draw' && (
            <div className="workspace__draw-menu">
              <DrawMenu />
            </div>
          )}
          <Canvas ref={canvasRef} onViewportChange={setViewport} />
          <div className="workspace__status">{statusText}</div>
          {showMiniMap && (
            <MiniMap
              canvasRef={canvasRef}
              viewport={viewport}
              transform={transform}
              scene={scene}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
