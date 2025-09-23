// 레이어 타입
export type LayerType = "brush" | "text" | "shape" | "image" | "speechBubble";

// 브러쉬 스트로크 데이터
export interface BrushStroke {
  id: string;
  points: Array<{
    x: number;
    y: number;
    pressure: number;
    timestamp: number;
    actualRadius?: number;
    actualOpacity?: number;
    speed?: number;
    direction?: number;
  }>;
  brushSettings: {
    radius?: number;
    color?: string;
    opacity?: number;
    hardness?: number;
    blendMode?: string;
    pressureOpacity?: number;
    pressureSize?: number;
    speedSize?: number;
    smudgeLength?: number;
    smudgeRadius?: number;
    spacing?: number;
    jitter?: number;
    angle?: number;
    roundness?: number;
    dabsPerSecond?: number;
    dabsPerRadius?: number;
    speedOpacity?: number;
    randomRadius?: number;
    strokeThreshold?: number;
    strokeDuration?: number;
    slowTracking?: number;
    slowTrackingPerDab?: number;
    colorMixing?: number;
    eraser?: number;
    lockAlpha?: number;
    colorizeMode?: number;
    snapToPixel?: number;
  };
  timestamp: number;
  duration?: number;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  renderData?: any[];
}

// 텍스트 데이터
export interface TextData {
  content: string;
  font: string;
  size: number;
  color: string;
  position: { x: number; y: number };
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// 말풍선 데이터
export interface SpeechBubbleData {
  text: string;
  position: { x: number; y: number };
  style: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// 레이어 영속 데이터 (data.json 형태와 일치)
export interface LayerPersistentData {
  textObjects: any[]; // 텍스트 객체 배열
  brushStrokes: BrushStroke[];
  contentBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Page {
  _id: string;
  projectId: string;
  name: string;
  order: number;
}

export interface Canvas {
  _id: string;
  pageId: string;
  projectId: string;
  name: string;
  order: number;
  width: number;
  height: number;
  unit: string;
}

export interface Layer {
  _id: string;
  canvasId: string;
  projectId: string;
  name: string;
  order: number;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend_mode: string;
  layer_data?: LayerPersistentData;
}

// 워크스페이스 데이터 조회
export interface WorkspaceData {
  project: {
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    created_at: string;
    updated_at: string;
  };
  pages: Array<{
    id: string;
    name: string;
    order: number;
    canvases: Array<{
      id: string;
      name: string;
      width: number;
      height: number;
      x: number;
      y: number;
      scale: number;
      order: number;
      layers: Array<{
        id: string;
        name: string;
        visible: boolean;
        locked: boolean;
        opacity: number;
        blend_mode: string;
        order: number;
        layer_data: LayerPersistentData;
      }>;
    }>;
  }>;
}
