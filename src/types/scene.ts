export type NodeShape = 'rectangle' | 'circle' | 'ellipse' | 'triangle' | 'diamond';
export interface NodeImageData {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export type NodeKind = NodeShape | 'text' | 'link' | 'image';

export interface Vec2 {
  x: number;
  y: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export type NodeFontWeight = 400 | 600 | 700;

export interface NodeStroke {
  color: string;
  width: number;
}

export interface NodeLink {
  url: string;
}

export interface NodeModel {
  id: string;
  shape: NodeKind;
  position: Vec2;
  size: { width: number; height: number };
  rotation?: number;
  text: string;
  textAlign: TextAlign;
  fontSize: number;
  fontWeight: NodeFontWeight;
  textColor: string;
  textBackground: string | null;
  fill: string;
  fillOpacity: number;
  stroke: NodeStroke;
  cornerRadius?: number;
  link?: NodeLink;
  shadow?: boolean;
  image?: NodeImageData;
}

export type CardinalConnectorPort = 'top' | 'right' | 'bottom' | 'left';

export interface AttachedConnectorEndpoint {
  nodeId: string;
  port: CardinalConnectorPort;
}

export interface FloatingConnectorEndpoint {
  position: Vec2;
}

export type ConnectorEndpoint = AttachedConnectorEndpoint | FloatingConnectorEndpoint;

export const isAttachedConnectorEndpoint = (
  endpoint: ConnectorEndpoint
): endpoint is AttachedConnectorEndpoint => 'nodeId' in endpoint;

export const isFloatingConnectorEndpoint = (
  endpoint: ConnectorEndpoint
): endpoint is FloatingConnectorEndpoint => 'position' in endpoint;

export interface ConnectorLabelStyle {
  fontSize: number;
  fontWeight: NodeFontWeight;
  color: string;
  background: string;
}

export interface ConnectorStyle {
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  cornerRadius?: number;
}

export type ConnectorEndpointShape =
  | 'none'
  | 'circle'
  | 'diamond'
  | 'arrow'
  | 'triangle'
  | 'hollow-arrow';

export interface ConnectorEndpointCap {
  shape: ConnectorEndpointShape;
  size: number;
}

export interface ConnectorEndpointStyles {
  start: ConnectorEndpointCap;
  end: ConnectorEndpointCap;
}

export const DEFAULT_CONNECTOR_ENDPOINT_STYLES: ConnectorEndpointStyles = {
  start: { shape: 'circle', size: 12 },
  end: { shape: 'arrow', size: 12 }
};

export const cloneConnectorEndpointStyles = (
  styles?: ConnectorEndpointStyles
): ConnectorEndpointStyles => ({
  start: { ...(styles?.start ?? DEFAULT_CONNECTOR_ENDPOINT_STYLES.start) },
  end: { ...(styles?.end ?? DEFAULT_CONNECTOR_ENDPOINT_STYLES.end) }
});

export interface ConnectorModel {
  id: string;
  source: ConnectorEndpoint;
  target: ConnectorEndpoint;
  points?: Vec2[];
  label?: string;
  labelPosition?: number;
  labelOffset?: number;
  labelAngle?: number;
  style: ConnectorStyle;
  labelStyle?: ConnectorLabelStyle;
  endpointStyles?: ConnectorEndpointStyles;
}

export interface SceneContent {
  nodes: NodeModel[];
  connectors: ConnectorModel[];
}

export interface SelectionState {
  nodeIds: string[];
  connectorIds: string[];
}

export type Tool =
  | 'select'
  | 'pan'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'connector'
  | 'text'
  | 'link'
  | 'image';

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}
