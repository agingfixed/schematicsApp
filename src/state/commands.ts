import { useCallback } from 'react';
import { NodeKind } from '../types/scene';
import { NodeStylePatch, useSceneStore } from './sceneStore';

interface Commands {
  applyStyles: (nodeIds: string[], patch: NodeStylePatch) => void;
  setText: (nodeId: string, text: string) => void;
  setShape: (nodeIds: string[], shape: NodeKind) => void;
}

export const useCommands = (): Commands => {
  const applyNodeStyles = useSceneStore((state) => state.applyNodeStyles);
  const setNodeText = useSceneStore((state) => state.setNodeText);
  const setNodeShape = useSceneStore((state) => state.setNodeShape);

  const applyStyles = useCallback(
    (nodeIds: string[], patch: NodeStylePatch) => {
      applyNodeStyles(nodeIds, patch);
    },
    [applyNodeStyles]
  );

  const setText = useCallback(
    (nodeId: string, text: string) => {
      setNodeText(nodeId, text);
    },
    [setNodeText]
  );

  const setShape = useCallback(
    (nodeIds: string[], shape: NodeKind) => {
      setNodeShape(nodeIds, shape);
    },
    [setNodeShape]
  );

  return {
    applyStyles,
    setText,
    setShape
  };
};
