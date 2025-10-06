import React, { useMemo, useRef, useState } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { MiniMap } from './components/MiniMap';
import { DrawMenu } from './components/DrawMenu';
import {
  selectScene,
  selectShowMiniMap,
  selectTransform,
  useSceneStore
} from './state/sceneStore';
import { BoardControls } from './components/BoardControls';
import './App.css';

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const showMiniMap = useSceneStore(selectShowMiniMap);
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
        <div className="workspace__sidebar">
          <DrawMenu />
        </div>
        <div className="workspace__main">
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
