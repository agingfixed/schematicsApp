import React, { useMemo } from 'react';
import { CanvasHandle } from './Canvas';
import { CanvasTransform, SceneContent, Vec2 } from '../types/scene';
import { boundsToSize, expandBounds, getSceneBounds } from '../utils/scene';

interface MiniMapProps {
  scene: SceneContent;
  transform: CanvasTransform;
  viewport: { width: number; height: number };
  canvasRef: React.RefObject<CanvasHandle>;
}

const MINI_WIDTH = 240;
const MINI_HEIGHT = 180;
const MINI_PADDING = 24;

export const MiniMap: React.FC<MiniMapProps> = ({ scene, transform, viewport, canvasRef }) => {
  const bounds = useMemo(() => {
    const computed = getSceneBounds(scene);
    if (!computed) {
      return {
        minX: -400,
        minY: -320,
        maxX: 400,
        maxY: 320
      };
    }
    return expandBounds(computed, 160);
  }, [scene]);

  const size = boundsToSize(bounds);
  const scale = Math.min(
    (MINI_WIDTH - MINI_PADDING * 2) / Math.max(size.width, 1),
    (MINI_HEIGHT - MINI_PADDING * 2) / Math.max(size.height, 1)
  );
  const offset = {
    x: (MINI_WIDTH - size.width * scale) / 2 - bounds.minX * scale,
    y: (MINI_HEIGHT - size.height * scale) / 2 - bounds.minY * scale
  };

  const projectPoint = (point: Vec2) => ({
    x: point.x * scale + offset.x,
    y: point.y * scale + offset.y
  });

  const projectSize = (value: number) => value * scale;

  const viewportRect = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return null;
    }
    const worldWidth = viewport.width / transform.scale;
    const worldHeight = viewport.height / transform.scale;
    const worldX = -transform.x / transform.scale;
    const worldY = -transform.y / transform.scale;
    const topLeft = projectPoint({ x: worldX, y: worldY });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: projectSize(worldWidth),
      height: projectSize(worldHeight)
    };
  }, [viewport, transform]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldPoint = {
      x: (x - offset.x) / scale,
      y: (y - offset.y) / scale
    };
    canvasRef.current?.focusOn(worldPoint);
  };

  return (
    <div className="minimap" onPointerDown={handlePointerDown}>
      <svg width={MINI_WIDTH} height={MINI_HEIGHT}>
        <rect
          x={0.5}
          y={0.5}
          width={MINI_WIDTH - 1}
          height={MINI_HEIGHT - 1}
          rx={14}
          ry={14}
          fill="rgba(15, 23, 42, 0.85)"
          stroke="rgba(148, 163, 184, 0.2)"
        />
        {scene.nodes.map((node) => {
          const topLeft = projectPoint(node.position);
          return (
            <rect
              key={node.id}
              x={topLeft.x}
              y={topLeft.y}
              width={projectSize(node.size.width)}
              height={projectSize(node.size.height)}
              rx={node.shape === 'ellipse' ? projectSize(node.size.width / 2) : 6}
              ry={node.shape === 'ellipse' ? projectSize(node.size.height / 2) : 6}
              fill="rgba(59, 130, 246, 0.25)"
              stroke="rgba(59, 130, 246, 0.6)"
            />
          );
        })}
        {scene.drawings.map((stroke) => {
          if (!stroke.points.length) {
            return null;
          }
          const path = stroke.points
            .map((point, index) => {
              const projected = projectPoint(point);
              return `${index === 0 ? 'M' : 'L'}${projected.x} ${projected.y}`;
            })
            .join(' ');
          if (!path) {
            return null;
          }
          const opacity =
            stroke.style === 'highlighter' ? 0.4 : stroke.style === 'marker' ? 0.7 : 1;
          return (
            <path
              key={stroke.id}
              d={path}
              stroke={stroke.color}
              strokeWidth={Math.max(projectSize(stroke.size), 0.75)}
              strokeOpacity={opacity}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {viewportRect && (
          <rect
            className="minimap__viewport"
            x={viewportRect.x}
            y={viewportRect.y}
            width={viewportRect.width}
            height={viewportRect.height}
          />
        )}
      </svg>
    </div>
  );
};
