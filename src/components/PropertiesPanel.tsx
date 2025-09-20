import React, { useMemo } from 'react';
import {
  selectConnectors,
  selectNodes,
  selectSelection,
  useSceneStore
} from '../state/sceneStore';

export const PropertiesPanel: React.FC = () => {
  const selection = useSceneStore(selectSelection);
  const nodes = useSceneStore(selectNodes);
  const connectors = useSceneStore(selectConnectors);
  const updateNode = useSceneStore((state) => state.updateNode);
  const setNodeText = useSceneStore((state) => state.setNodeText);
  const applyNodeStyles = useSceneStore((state) => state.applyNodeStyles);
  const setNodeLink = useSceneStore((state) => state.setNodeLink);
  const updateConnector = useSceneStore((state) => state.updateConnector);
  const removeNode = useSceneStore((state) => state.removeNode);
  const removeConnector = useSceneStore((state) => state.removeConnector);
  const clearSelection = useSceneStore((state) => state.clearSelection);

  const selectedNode = useMemo(() => {
    if (!selection.nodeIds.length) {
      return null;
    }
    const [first] = selection.nodeIds;
    return nodes.find((node) => node.id === first) ?? null;
  }, [selection.nodeIds, nodes]);

  const selectedConnector = useMemo(() => {
    if (!selection.connectorIds.length) {
      return null;
    }
    const [first] = selection.connectorIds;
    return connectors.find((connector) => connector.id === first) ?? null;
  }, [selection.connectorIds, connectors]);

  if (!selectedNode && !selectedConnector) {
    return (
      <aside className="properties">
        <div className="properties__empty">
          <h3>Properties</h3>
          <p>Select a node or connector to edit its properties.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="properties">
      <div className="properties__header">
        <h3>Properties</h3>
        <button type="button" onClick={clearSelection} className="properties__clear">
          Clear
        </button>
      </div>
      {selectedNode && (
        <section className="properties__section">
          <h4>{selectedNode.shape.replace('-', ' ')}</h4>
          <label className="properties__field">
            <span>Text</span>
            <input
              type="text"
              value={selectedNode.text}
              onChange={(event) => setNodeText(selectedNode.id, event.target.value)}
            />
          </label>
          <div className="properties__grid">
            <label className="properties__field">
              <span>Width</span>
              <input
                type="number"
                value={Math.round(selectedNode.size.width)}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    size: {
                      width: Math.max(40, Number(event.target.value)),
                      height: selectedNode.size.height
                    }
                  })
                }
              />
            </label>
            <label className="properties__field">
              <span>Height</span>
              <input
                type="number"
                value={Math.round(selectedNode.size.height)}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    size: {
                      width: selectedNode.size.width,
                      height: Math.max(40, Number(event.target.value))
                    }
                  })
                }
              />
            </label>
          </div>
          <div className="properties__grid">
            <label className="properties__field">
              <span>Fill</span>
              <input
                type="color"
                value={selectedNode.fill}
                onChange={(event) =>
                  applyNodeStyles([selectedNode.id], { fill: event.target.value })
                }
              />
            </label>
            <label className="properties__field">
              <span>Stroke</span>
              <input
                type="color"
                value={selectedNode.stroke.color}
                onChange={(event) =>
                  applyNodeStyles([selectedNode.id], { strokeColor: event.target.value })
                }
              />
            </label>
          </div>
          <label className="properties__field">
            <span>Fill Opacity</span>
            <div className="properties__slider-control">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((selectedNode.fillOpacity ?? 1) * 100)}
                onChange={(event) =>
                  applyNodeStyles([selectedNode.id], {
                    fillOpacity: Number(event.target.value) / 100
                  })
                }
              />
              <span className="properties__slider-value">
                {Math.round((selectedNode.fillOpacity ?? 1) * 100)}%
              </span>
            </div>
          </label>
          <label className="properties__field">
            <span>Stroke Width</span>
            <input
              type="number"
              min={1}
              max={12}
              value={selectedNode.stroke.width}
              onChange={(event) =>
                applyNodeStyles([selectedNode.id], { strokeWidth: Number(event.target.value) })
              }
            />
          </label>
          <label className="properties__field">
            <span>Link</span>
            <input
              type="url"
              placeholder="https://example.com"
              value={selectedNode.link?.url ?? ''}
              onChange={(event) => setNodeLink(selectedNode.id, event.target.value)}
            />
          </label>
          <button
            type="button"
            className="properties__danger"
            onClick={() => removeNode(selectedNode.id)}
          >
            Delete Node
          </button>
        </section>
      )}
      {selectedConnector && (
        <section className="properties__section">
          <h4>Connector</h4>
          <label className="properties__field">
            <span>Label</span>
            <input
              type="text"
              value={selectedConnector.label ?? ''}
              onChange={(event) => updateConnector(selectedConnector.id, { label: event.target.value })}
            />
          </label>
          <label className="properties__field">
            <span>Stroke</span>
            <input
              type="color"
              value={selectedConnector.style.stroke}
              onChange={(event) =>
                updateConnector(selectedConnector.id, { style: { stroke: event.target.value } })
              }
            />
          </label>
          <label className="properties__field">
            <span>Thickness</span>
            <input
              type="number"
              min={1}
              max={12}
              value={selectedConnector.style.strokeWidth}
              onChange={(event) =>
                updateConnector(selectedConnector.id, {
                  style: { strokeWidth: Number(event.target.value) }
                })
              }
            />
          </label>
          <button
            type="button"
            className="properties__danger"
            onClick={() => removeConnector(selectedConnector.id)}
          >
            Delete Connector
          </button>
        </section>
      )}
    </aside>
  );
};

