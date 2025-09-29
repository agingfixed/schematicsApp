import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { MiniMap } from './components/MiniMap';
import {
  selectScene,
  selectShowMiniMap,
  selectTransform,
  useSceneStore
} from './state/sceneStore';
import { useAuthStore } from './state/authStore';
import { LoginScreen } from './components/LoginScreen';
import { BoardControls } from './components/BoardControls';
import './App.css';

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const showMiniMap = useSceneStore(selectShowMiniMap);
  const transform = useSceneStore(selectTransform);
  const scene = useSceneStore(selectScene);
  const replaceScene = useSceneStore((state) => state.replaceScene);
  const resetScene = useSceneStore((state) => state.resetScene);
  const user = useAuthStore((state) => state.user);
  const currentBoardId = useAuthStore((state) => state.currentBoardId);
  const savedBoards = useAuthStore((state) => state.savedBoards);

  const lastLoadedBoard = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastLoadedBoard.current = null;
      resetScene();
      return;
    }

    if (!currentBoardId) {
      lastLoadedBoard.current = null;
      return;
    }

    if (lastLoadedBoard.current === currentBoardId) {
      return;
    }

    const board = savedBoards.find((item) => item.id === currentBoardId);
    if (board) {
      replaceScene(board.scene);
      lastLoadedBoard.current = currentBoardId;
    }
  }, [user, currentBoardId, savedBoards, replaceScene, resetScene]);

  const nodeCount = scene.nodes.length;
  const connectorCount = scene.connectors.length;

  const statusText = useMemo(
    () => `${nodeCount} nodes · ${connectorCount} connectors`,
    [nodeCount, connectorCount]
  );

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <BoardControls />
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
