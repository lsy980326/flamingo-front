import { create } from "zustand";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { SocketIOProvider } from "y-socket.io";
import { Awareness } from "y-protocols/awareness";
import { io, Socket } from "socket.io-client";
import { debounce } from "lodash-es";

import { useSocketStore } from "./useSocketStore";

const SERVER_URL = "http://localhost:8080";
// const SERVER_URL = "http://3.38.2.73:8080";
// const WEBSOCKET_URL = SERVER_URL.replace("http", "ws");

// --- 타입 정의 ---
type YjsConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UserInfo {
  name: string;
  color: string;
}

interface UserState {
  user?: UserInfo;
  cursor?: { x: number; y: number };
  drawingStroke?: unknown;
}

export type YStroke = Y.Map<unknown>;
export type YPoint = Y.Map<unknown>;

type StrokeJson = {
  points: { x: number; y: number; pressure?: number }[];
  color: string;
  size: number;
};

// --- Zustand 스토어 인터페이스 ---
interface YjsState {
  yjsStatus: YjsConnectionStatus;
  ydoc: Y.Doc | null;
  awareness: Awareness | null;
  awarenessStates: Map<number, UserState>;
  myInfo: UserInfo | null;

  // [신규] Canvas 단위 상태
  currentCanvasId: string | null;
  canvasSocket: Socket | null;
  canvasSocketIOProvider: SocketIOProvider | null;
  canvasWebRTCProvider: WebrtcProvider | null;
  layers: Y.Map<Y.Map<unknown>> | null; // 캔버스 내 모든 레이어 데이터

  // [기존] Layer 단위 상태 (_layer सफिक्स)
  currentLayerId_layer: string | null;
  layerSocket_layer: Socket | null;
  socketioProvider_layer: SocketIOProvider | null;
  webrtcProvider_layer: WebrtcProvider | null;
  strokes_layer: Y.Array<YStroke> | null;

  // 액션
  connectToCanvas: (canvasId: string) => void;
  disconnectFromCanvas: () => void;
  connectToLayer_layer: (layerId: string) => void;
  disconnectFromLayer_layer: () => void;
  setMyInfo: (info: UserInfo) => void;
  updateMyCursor: (cursor: { x: number; y: number } | null) => void;
  startStroke: (
    activeLayerId: string,
    x: number,
    y: number,
    pressure: number,
    color: string,
    size: number
  ) => void;
  addPointToStroke: (
    activeLayerId: string,
    x: number,
    y: number,
    pressure: number
  ) => void;
  endStroke: () => void;
}

// --- 유틸리티 함수 ---
const logWithTime = (message: string, style: string = "") => {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`%c[${time}] ${message}`, style);
};

const toStrokeJson = (map: Y.Map<unknown>): StrokeJson => {
  return map.toJSON() as StrokeJson;
};

const buildCanvasSnapshot = (
  canvasId: string,
  yLayers: Y.Map<Y.Map<unknown>>
) => {
  const socketState = useSocketStore.getState();
  const canvasMeta = socketState.allData.canvases.find(
    (c) => c._id === canvasId
  );
  const layersMeta = socketState.allData.layers
    .filter((l) => l.canvasId === canvasId)
    .sort((a, b) => a.order - b.order);

  const layers = layersMeta.map((meta) => {
    const layerData = yLayers.get(meta._id);
    const strokesArr = (layerData?.get("strokes") as Y.Array<YStroke>) || null;
    const count = strokesArr ? strokesArr.length : 0;
    let sample: StrokeJson | null = null;
    if (strokesArr && count > 0) {
      sample = toStrokeJson(strokesArr.get(0));
    }
    return {
      id: meta._id,
      name: (meta as any).name,
      order: meta.order,
      type: (meta as any).type,
      opacity: (meta as any).opacity ?? 100,
      isVisible: (meta as any).isVisible ?? true,
      strokesCount: count,
      sample,
    };
  });

  return {
    canvas: canvasMeta
      ? {
          id: canvasMeta._id,
          name: canvasMeta.name,
          width: canvasMeta.width,
          height: canvasMeta.height,
          unit: canvasMeta.unit,
          order: canvasMeta.order,
        }
      : { id: canvasId },
    layers,
  };
};

// --- Zustand 스토어 구현 ---
export const useYjsStore = create<YjsState>((set, get) => ({
  // 초기 상태
  yjsStatus: "disconnected",
  ydoc: null,
  awareness: null,
  awarenessStates: new Map(),
  myInfo: null,
  currentCanvasId: null,
  canvasSocket: null,
  canvasSocketIOProvider: null,
  canvasWebRTCProvider: null,
  layers: null,
  currentLayerId_layer: null,
  layerSocket_layer: null,
  socketioProvider_layer: null,
  webrtcProvider_layer: null,
  strokes_layer: null,

  // ========================================
  // [신규] Canvas 단위 로직
  // ========================================
  connectToCanvas: (canvasId) => {
    get().disconnectFromCanvas(); // 이전 캔버스 연결 정리
    set({ yjsStatus: "connecting", currentCanvasId: canvasId });

    const token = useSocketStore.getState().token;
    if (!token) return set({ yjsStatus: "error" });

    const doc = new Y.Doc();
    const namespace = `/canvas-${canvasId}`;
    const newCanvasSocket = io(`${SERVER_URL}${namespace}`, {
      auth: { token },
      transports: ["websocket"],
    });

    const debouncedSave = debounce(() => {
      if (newCanvasSocket.connected) {
        const update = Y.encodeStateAsUpdate(doc);
        console.log("[Yjs] save-canvas-data", {
          canvasId,
          bytes: update.byteLength,
        });
        newCanvasSocket.emit("save-canvas-data", update);
      }
    }, 2000);

    newCanvasSocket.on("connect", () => {
      logWithTime(`[Canvas] ✅ Connected to namespace: ${namespace}`);
      newCanvasSocket.emit(
        "request-canvas-data",
        (docUpdate: ArrayBuffer | null) => {
          console.log("[Yjs] request-canvas-data:received", {
            canvasId,
            hasData: !!docUpdate,
            bytes: docUpdate ? docUpdate.byteLength : 0,
          });
          if (get().currentCanvasId !== canvasId)
            return newCanvasSocket.disconnect();
          if (docUpdate) Y.applyUpdate(doc, new Uint8Array(docUpdate));

          // 스냅샷 로그
          const layersMap = doc.getMap<Y.Map<unknown>>("layers");
          const snapshot = buildCanvasSnapshot(canvasId, layersMap);
          console.log("[Snapshot] Canvas Loaded", snapshot);

          const roomName = `flamingo-canvas-room-${canvasId}`;
          const socketioProvider = new SocketIOProvider(
            SERVER_URL,
            roomName,
            doc,
            { auth: { token } }
          );
          const webrtcProvider = new WebrtcProvider(roomName, doc, {
            awareness: socketioProvider.awareness,
            // signaling: [`${WEBSOCKET_URL}/webrtc`],
          });

          const awareness = socketioProvider.awareness;
          awareness.on("change", () =>
            set({ awarenessStates: new Map(awareness.getStates()) })
          );
          doc.on("update", debouncedSave);

          set({
            ydoc: doc,
            canvasSocket: newCanvasSocket,
            canvasSocketIOProvider: socketioProvider,
            canvasWebRTCProvider: webrtcProvider,
            awareness,
            awarenessStates: new Map(awareness.getStates()),
            layers: layersMap,
            yjsStatus: "connected",
          });
        }
      );
    });

    newCanvasSocket.on("connect_error", (err) => {
      console.error(
        `[Canvas] ❌ Connection error on ${namespace}:`,
        err.message
      );
      set({ yjsStatus: "error" });
    });
  },

  disconnectFromCanvas: () => {
    const { canvasWebRTCProvider, canvasSocketIOProvider, canvasSocket, ydoc } =
      get();
    // debouncedSave.cancel(); // 각 연결마다 debounced 함수가 다르므로 직접 취소 불가
    canvasWebRTCProvider?.destroy();
    canvasSocketIOProvider?.destroy();
    ydoc?.destroy();
    canvasSocket?.disconnect();
    set({
      yjsStatus: "disconnected",
      currentCanvasId: null,
      ydoc: null,
      awareness: null,
      awarenessStates: new Map(),
      layers: null,
      canvasSocket: null,
      canvasSocketIOProvider: null,
      canvasWebRTCProvider: null,
    });
  },

  // ========================================
  // [기존] Layer 단위 로직 (_layer सफिक्स 추가)
  // ========================================
  connectToLayer_layer: (layerId) => {
    get().disconnectFromLayer_layer();
    set({ yjsStatus: "connecting", currentLayerId_layer: layerId });
    const token = useSocketStore.getState().token;
    if (!token) return set({ yjsStatus: "error" });
    const doc = new Y.Doc();
    const namespace = `/layer-${layerId}`;
    const newLayerSocket = io(`${SERVER_URL}${namespace}`, {
      auth: { token },
      transports: ["websocket"],
    });
    const debouncedSave_layer = debounce(
      (socket: Socket, update: Uint8Array) => {
        if (socket.connected) socket.emit("save-layer-data", update);
      },
      2000
    );
    newLayerSocket.on("connect", () => {
      newLayerSocket.emit(
        "request-layer-data",
        { layerId },
        (docUpdate: ArrayBuffer | null) => {
          console.log("[Yjs] request-layer-data:received", {
            layerId,
            hasData: !!docUpdate,
            bytes: docUpdate ? docUpdate.byteLength : 0,
          });
          if (docUpdate) Y.applyUpdate(doc, new Uint8Array(docUpdate));
          const roomName = `flamingo-webrtc-room-${layerId}`;
          const socketioProvider = new SocketIOProvider(
            SERVER_URL,
            roomName,
            doc,
            { auth: { token } }
          );
          const webrtcProvider = new WebrtcProvider(roomName, doc, {
            awareness: socketioProvider.awareness,
            // signaling: [`${WEBSOCKET_URL}/webrtc`],
          });
          const awareness = socketioProvider.awareness;
          awareness.on("change", () =>
            set({ awarenessStates: new Map(awareness.getStates()) })
          );
          doc.on("update", () => {
            const update = Y.encodeStateAsUpdate(doc);
            console.log("[Yjs] save-layer-data", {
              layerId,
              bytes: update.byteLength,
            });
            debouncedSave_layer(newLayerSocket, update);
          });
          set({
            ydoc: doc,
            layerSocket_layer: newLayerSocket,
            socketioProvider_layer: socketioProvider,
            webrtcProvider_layer: webrtcProvider,
            awareness: awareness,
            awarenessStates: new Map(awareness.getStates()),
            strokes_layer: doc.getArray<YStroke>("strokes"),
            yjsStatus: "connected",
          });
        }
      );
    });
    newLayerSocket.on("connect_error", () => set({ yjsStatus: "error" }));
  },
  disconnectFromLayer_layer: () => {
    const {
      webrtcProvider_layer,
      socketioProvider_layer,
      layerSocket_layer,
      ydoc,
    } = get();
    webrtcProvider_layer?.destroy();
    socketioProvider_layer?.destroy();
    ydoc?.destroy();
    layerSocket_layer?.disconnect();
    set({
      yjsStatus: "disconnected",
      currentLayerId_layer: null,
      ydoc: null,
      awareness: null,
      strokes_layer: null,
      layerSocket_layer: null,
      socketioProvider_layer: null,
      webrtcProvider_layer: null,
    });
  },

  // ========================================
  // 공통 액션 (Awareness, Y.Doc 수정)
  // ========================================
  setMyInfo: (info) => {
    set({ myInfo: info });
    const { awareness } = get();
    if (awareness) {
      awareness.setLocalState({ ...awareness.getLocalState(), user: info });
    }
  },
  updateMyCursor: (cursor) => {
    const { awareness, myInfo } = get();
    if (awareness) {
      awareness.setLocalState({
        ...awareness.getLocalState(),
        user: myInfo,
        cursor,
      });
    }
  },
  startStroke: (activeLayerId, x, y, pressure, color, size) => {
    const { ydoc, layers, awareness } = get();
    if (!ydoc || !layers || !activeLayerId) return;
    ydoc.transact(() => {
      let targetLayer = layers.get(activeLayerId);
      if (!targetLayer) {
        targetLayer = new Y.Map<unknown>();
        layers.set(activeLayerId, targetLayer as Y.Map<unknown>);
      }
      let strokes = targetLayer.get("strokes") as Y.Array<YStroke>;
      if (!strokes) {
        strokes = new Y.Array<YStroke>();
        targetLayer.set("strokes", strokes as unknown as Y.Array<unknown>);
      }
      const newStroke = new Y.Map<unknown>();
      const points = new Y.Array<YPoint>();
      const firstPoint = new Y.Map<unknown>();
      firstPoint.set("x", x);
      firstPoint.set("y", y);
      firstPoint.set("pressure", pressure);
      points.push([firstPoint]);
      newStroke.set("points", points);
      newStroke.set("color", color);
      newStroke.set("size", size);
      strokes.push([newStroke as YStroke]);
      const json = toStrokeJson(newStroke);
      console.log("[Draw] startStroke", {
        layerId: activeLayerId,
        stroke: json,
      });
      awareness?.setLocalStateField("drawingStroke", {
        ...json,
        layerId: activeLayerId,
      });
    });
  },
  addPointToStroke: (activeLayerId, x, y, pressure) => {
    const { layers, awareness } = get();
    if (!layers || !activeLayerId) return;
    const targetLayer = layers.get(activeLayerId);
    if (!targetLayer) return;
    const strokes = targetLayer.get("strokes") as Y.Array<YStroke>;
    if (!strokes || strokes.length === 0) return;
    const currentStroke = strokes.get(strokes.length - 1);
    const points = currentStroke.get("points") as Y.Array<YPoint>;
    const newPoint = new Y.Map<unknown>();
    newPoint.set("x", x);
    newPoint.set("y", y);
    newPoint.set("pressure", pressure);
    points.push([newPoint]);
    const json = toStrokeJson(currentStroke);
    console.log("[Draw] addPoint", {
      layerId: activeLayerId,
      point: { x, y, pressure },
      totalPoints: points.length,
    });
    awareness?.setLocalStateField("drawingStroke", {
      ...json,
      layerId: activeLayerId,
    });
  },
  endStroke: () => {
    console.log("[Draw] endStroke");
    get().awareness?.setLocalStateField("drawingStroke", null);
  },
}));
