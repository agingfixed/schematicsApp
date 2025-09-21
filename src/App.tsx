import React, { useMemo, useRef, useState } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { MiniMap } from './components/MiniMap';
import {
  selectScene,
  selectShowMiniMap,
  selectTransform,
  useSceneStore
} from './state/sceneStore';
import './App.css';

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const showMiniMap = useSceneStore(selectShowMiniMap);
  const transform = useSceneStore(selectTransform);
  const scene = useSceneStore(selectScene);

  const nodeCount = scene.nodes.length;
  const connectorCount = scene.connectors.length;

  const statusText = useMemo(
    () => `${nodeCount} nodes · ${connectorCount} connectors`,
    [nodeCount, connectorCount]
  );

  return (
    <div className="app-shell">
      <Toolbar canvasRef={canvasRef} />
      <div className="workspace">
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
