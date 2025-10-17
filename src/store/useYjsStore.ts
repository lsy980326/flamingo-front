import { create } from "zustand";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { SocketIOProvider } from "y-socket.io";
import { Awareness } from "y-protocols/awareness";
import { io, Socket } from "socket.io-client";
import { debounce } from "lodash-es";

import { useSocketStore } from "./useSocketStore";
import type { LayerPersistentData, BrushStroke } from "../types";

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

// 레이어별 Yjs 문서 상태
interface LayerYjsState {
  ydoc: Y.Doc;
  awareness: Awareness;
  strokes: Y.Array<YStroke>;
  socket: Socket;
  socketIOProvider: SocketIOProvider;
  webRTCProvider: WebrtcProvider;
  debouncedSave: ReturnType<typeof debounce>;
  isHidden?: boolean; // 성능상 숨김 처리된 레이어
  dataSize?: number; // 데이터 크기 (MB)
}

// 성능 경고 상태
interface PerformanceWarning {
  layerId: string;
  dataSizeMB: string;
  message: string;
  timestamp: number;
}

// --- Zustand 스토어 인터페이스 ---
interface YjsState {
  yjsStatus: YjsConnectionStatus;
  awarenessStates: Map<number, UserState>;
  myInfo: UserInfo | null;

  // 레이어별 Yjs 문서 상태 관리
  currentCanvasId: string | null;
  layerStates: Map<string, LayerYjsState>; // layerId -> LayerYjsState
  forceUpdate: number;

  // 연결 진행 중인 레이어 추적
  connectingLayers: Set<string>;

  // 레이어 데이터 임시 저장 (레이어 연결 전에 받은 JSON 데이터)
  pendingLayerData: Map<string, LayerPersistentData>;

  // 성능 관련 상태
  performanceWarnings: PerformanceWarning[];
  hiddenLayers: Set<string>; // 성능상 숨김 처리된 레이어들

  // 성능 최적화 설정
  performanceSettings: {
    maxStrokeLimit: number;
    strokeReduction: number;
    enabled: boolean;
  };

  // 액션
  connectToCanvas: (canvasId: string) => void;
  disconnectFromCanvas: () => void;
  connectToLayer: (layerId: string) => Promise<void>;
  disconnectFromLayer: (layerId: string) => void;
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
  refreshLayerData: (layerId: string) => Promise<void>;
  forceRerender: () => void;
  loadLayerDataFromJson: (
    layerId: string,
    layerData: LayerPersistentData
  ) => void;
  performDataLoad: (
    layerId: string,
    layerData: LayerPersistentData,
    layerState: LayerYjsState
  ) => void;
  storeLayerDataForLater: (
    layerId: string,
    layerData: LayerPersistentData
  ) => void;

  // 레이어 상태 조회 헬퍼
  getLayerState: (layerId: string) => LayerYjsState | null;
  isLayerConnected: (layerId: string) => boolean;

  // 성능 관련 액션
  handlePerformanceWarning: (warning: PerformanceWarning) => void;
  hideLayerForPerformance: (layerId: string) => void;
  showLayerForPerformance: (layerId: string) => void;
  clearPerformanceWarnings: () => void;
  isLayerHidden: (layerId: string) => boolean;

  // 성능 최적화 설정 액션
  updatePerformanceSettings: (
    settings: Partial<{
      maxStrokeLimit: number;
      strokeReduction: number;
      enabled: boolean;
    }>
  ) => void;
  getPerformanceSettings: () => {
    maxStrokeLimit: number;
    strokeReduction: number;
    enabled: boolean;
  };
}

// --- 유틸리티 함수 ---
// const logWithTime = (message: string, style: string = "") => {
//   const time = new Date().toLocaleTimeString("en-US", { hour12: false });
//   console.log(`%c[${time}] ${message}`, style);
// };

const toStrokeJson = (map: Y.Map<unknown>): StrokeJson => {
  return map.toJSON() as StrokeJson;
};

// --- Zustand 스토어 구현 ---
export const useYjsStore = create<YjsState>((set, get) => ({
  // 초기 상태
  yjsStatus: "disconnected",
  awarenessStates: new Map(),
  myInfo: null,
  currentCanvasId: null,
  layerStates: new Map(),
  forceUpdate: 0,

  // 연결 진행 중인 레이어 추적
  connectingLayers: new Set<string>(),

  // 레이어 데이터 임시 저장
  pendingLayerData: new Map<string, LayerPersistentData>(),

  // 성능 관련 상태
  performanceWarnings: [],
  hiddenLayers: new Set<string>(),

  // 성능 최적화 설정 초기값
  performanceSettings: {
    maxStrokeLimit: 1000,
    strokeReduction: 0,
    enabled: false,
  },

  // ========================================
  // Canvas 단위 연결 관리 (레이어 메타데이터만 로드)
  // ========================================
  connectToCanvas: async (canvasId) => {
    get().disconnectFromCanvas();
    set({ yjsStatus: "connecting", currentCanvasId: canvasId });

    try {
      // 캔버스 연결 시 해당 캔버스의 모든 레이어를 자동으로 연결
      const socketState = useSocketStore.getState();
      const canvasLayers = socketState.allData.layers.filter(
        (l) => l.canvasId === canvasId
      );

      // 펜딩 데이터가 있는 레이어 확인 (필요시 사용)
      // const { pendingLayerData } = get();
      // const layersWithPendingData = canvasLayers.filter((layer) =>
      //   pendingLayerData.has(layer._id)
      // );

      // 모든 레이어에 연결 (즉시 그림 표시를 위해)
      console.log(
        `[Yjs] Connecting to ${canvasLayers.length} layers for canvas ${canvasId}`
      );
      for (const layer of canvasLayers) {
        console.log(`[Yjs] Connecting to layer ${layer._id} (${layer.name})`);
        await get().connectToLayer(layer._id);
      }

      set({ yjsStatus: "connected" });

      // 강제로 리렌더링하여 즉시 그림 표시
      setTimeout(() => get().forceRerender(), 50);
    } catch (error) {
      console.error(
        `❌ [Canvas] Failed to connect to canvas ${canvasId}:`,
        error
      );
      set({ yjsStatus: "error" });
    }
  },

  disconnectFromCanvas: () => {
    const { layerStates } = get();

    // 모든 레이어 연결 해제
    layerStates.forEach((_, layerId) => {
      get().disconnectFromLayer(layerId);
    });

    set({
      yjsStatus: "disconnected",
      currentCanvasId: null,
      layerStates: new Map(),
    });
  },

  // ========================================
  // Layer 단위 Yjs 연결 관리
  // ========================================
  connectToLayer: async (layerId) => {
    const { currentCanvasId, layerStates } = get();
    console.log(`[Yjs] Attempting to connect to layer ${layerId}`);

    if (!currentCanvasId) {
      console.error("❌ [Yjs] Canvas not connected");
      return;
    }

    // 이미 연결된 레이어인지 확인 (더 강력한 체크)
    if (layerStates.has(layerId)) {
      console.log(`[Yjs] Layer ${layerId} already connected`);
      return;
    }

    // 연결 진행 중인 레이어인지 확인
    if (get().connectingLayers?.has(layerId)) {
      return;
    }

    // 연결 시작 표시
    set({ connectingLayers: new Set([...get().connectingLayers, layerId]) });

    const token = useSocketStore.getState().token;
    if (!token) {
      console.error("[Yjs] No token available");
      return;
    }

    try {
      const doc = new Y.Doc();
      const namespace = `/layer-${layerId}`;
      const socket = io(`${SERVER_URL}${namespace}`, {
        auth: { token },
        transports: ["websocket"],
      });

      // 레이어 데이터 요청 및 로드
      await new Promise<void>((resolve, reject) => {
        socket.on("connect", () => {
          // 성능 경고 이벤트 리스너 추가
          socket.on("performance-warning", (warning: PerformanceWarning) => {
            get().handlePerformanceWarning(warning);
          });

          // 레이어 데이터 복원 이벤트 리스너 추가
          socket.on(
            "layer-data-restored",
            (payload: {
              layerId: string;
              version: number;
              data: ArrayBuffer;
            }) => {
              try {
                const layerState = get().layerStates.get(layerId);
                if (layerState && payload.data) {
                  // 기존 strokes를 모두 지우고 복원된 데이터로 교체
                  const currentStrokes = layerState.strokes;
                  currentStrokes.delete(0, currentStrokes.length);

                  const tempDoc = new Y.Doc();
                  Y.applyUpdate(tempDoc, new Uint8Array(payload.data));
                  const restoredStrokes = tempDoc.getArray<YStroke>("strokes");

                  // 복원된 strokes를 기존 배열에 복사
                  restoredStrokes.forEach((stroke) => {
                    if (stroke instanceof Y.Map) {
                      const newStroke = new Y.Map();
                      stroke.forEach((value, key) => {
                        if (value instanceof Y.Array) {
                          const newArray = new Y.Array();
                          value.forEach((item) => {
                            if (item instanceof Y.Map) {
                              const newItem = new Y.Map();
                              item.forEach((v, k) => newItem.set(k, v));
                              newArray.push([newItem]);
                            } else {
                              newArray.push([item]);
                            }
                          });
                          newStroke.set(key, newArray);
                        } else {
                          newStroke.set(key, value);
                        }
                      });
                      currentStrokes.push([newStroke]);
                    }
                  });

                  // 저장 차단 및 UI 업데이트
                  layerState.debouncedSave.cancel();
                  set({ layerStates: new Map(get().layerStates) });
                  setTimeout(() => get().forceRerender(), 100);
                  tempDoc.destroy();
                }
              } catch (error) {
                console.error(
                  `[Version] Failed to restore layer ${layerId}:`,
                  error
                );
              }
            }
          );

          socket.emit(
            "request-layer-data",
            { layerId },
            (docUpdate: ArrayBuffer | null) => {
              try {
                if (docUpdate && docUpdate.byteLength > 0) {
                  try {
                    // 데이터 유효성 검사
                    const uint8Array = new Uint8Array(docUpdate);
                    Y.applyUpdate(doc, uint8Array);
                  } catch (yjsError) {
                    console.error(
                      `[Yjs] Failed to apply update to Y.Doc for ${layerId}:`,
                      yjsError
                    );
                  }
                }

                // Yjs 문서 구조 설정
                const strokes = doc.getArray<YStroke>("strokes");

                // SocketIO 및 WebRTC 프로바이더 설정
                const roomName = `flamingo-layer-room-${layerId}`;
                const socketIOProvider = new SocketIOProvider(
                  SERVER_URL,
                  roomName,
                  doc,
                  { auth: { token } }
                );

                let webRTCProvider: WebrtcProvider;
                try {
                  webRTCProvider = new WebrtcProvider(roomName, doc, {
                    awareness: socketIOProvider.awareness,
                    signaling: [
                      `wss://signaling.greatwave.co.kr?token=${token}`,
                    ],
                    peerOpts: {
                      config: {
                        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
                      },
                    },
                  });
                } catch (webrtcError) {
                  console.warn(
                    `[Yjs] WebRTC provider creation failed for ${layerId}:`,
                    webrtcError
                  );
                  // WebRTC 실패 시 SocketIO만 사용
                  webRTCProvider = new WebrtcProvider(roomName, doc, {
                    awareness: socketIOProvider.awareness,
                    signaling: [], // 빈 시그널링 배열로 설정
                    peerOpts: {
                      config: {
                        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
                      },
                    },
                  });
                }

                const awareness = socketIOProvider.awareness;

                // Awareness 변경 감지
                awareness.on("change", () => {
                  set({ awarenessStates: new Map(awareness.getStates()) });
                });

                // 문서 변경 시 저장
                const debouncedSave = debounce(() => {
                  if (socket.connected) {
                    const update = Y.encodeStateAsUpdate(doc);
                    socket.emit("save-layer-data", update);
                  }
                }, 2000);

                doc.on("update", debouncedSave);

                // 레이어 상태 저장
                const layerState: LayerYjsState = {
                  ydoc: doc,
                  awareness,
                  strokes,
                  socket,
                  socketIOProvider,
                  webRTCProvider,
                  debouncedSave,
                };

                const newLayerStates = new Map(layerStates);
                newLayerStates.set(layerId, layerState);

                set({
                  layerStates: newLayerStates,
                });

                console.log(
                  `[Yjs] Layer ${layerId} connected successfully. Strokes count: ${strokes.length}`
                );

                // 연결 완료 시 connectingLayers에서 제거
                set({
                  connectingLayers: new Set(
                    [...get().connectingLayers].filter((id) => id !== layerId)
                  ),
                });

                // 대기 중인 레이어 데이터가 있으면 로드
                const { pendingLayerData } = get();
                const pendingData = pendingLayerData.get(layerId);
                if (pendingData) {
                  get().performDataLoad(layerId, pendingData, layerState);

                  // 로드 완료 후 pending 데이터 제거
                  const newPendingData = new Map(pendingLayerData);
                  newPendingData.delete(layerId);
                  set({ pendingLayerData: newPendingData });
                }

                resolve();
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        socket.on("connect_error", (err) => {
          reject(err);
        });

        // 타임아웃 설정
        setTimeout(() => reject(new Error("Connection timeout")), 10000);
      });
    } catch (error) {
      console.error(`[Yjs] Connection error for layer ${layerId}:`, error);
      // 에러 발생 시에도 connectingLayers에서 제거
      set({
        connectingLayers: new Set(
          [...get().connectingLayers].filter((id) => id !== layerId)
        ),
      });
    }
  },

  // JSON 데이터를 Yjs 문서로 복원하는 새로운 함수
  // 기존 바이너리 방식과 새로운 JSON 방식을 모두 지원
  loadLayerDataFromJson: (layerId: string, layerData: LayerPersistentData) => {
    // 레이어가 연결될 때까지 기다리는 로직 추가
    const tryLoadData = () => {
      const { layerStates } = get();
      const layerState = layerStates.get(layerId);

      if (!layerState) {
        setTimeout(tryLoadData, 500);
        return;
      }

      // 실제 데이터 로드 로직
      get().performDataLoad(layerId, layerData, layerState);
    };

    tryLoadData();
  },

  // 실제 데이터 로드를 수행하는 내부 함수
  performDataLoad: (
    layerId: string,
    layerData: LayerPersistentData,
    layerState: LayerYjsState
  ) => {
    console.log(`[Yjs] performDataLoad 시작 - 레이어: ${layerId}`, {
      hasLayerData: !!layerData,
      brushStrokesCount: layerData?.brushStrokes?.length || 0,
      hasLayerState: !!layerState,
      hasStrokes: !!layerState?.strokes,
    });

    if (!layerData?.brushStrokes || layerData.brushStrokes.length === 0) {
      console.warn(`[Yjs] 브러시 스트로크 데이터가 없습니다: ${layerId}`);
      return;
    }

    try {
      // 기존 strokes를 모두 지우기
      const strokes = layerState.strokes;
      console.log(`[Yjs] 기존 스트로크 개수: ${strokes.length}`);
      strokes.delete(0, strokes.length);
      console.log(`[Yjs] 기존 스트로크 삭제 완료`);

      layerData.brushStrokes.forEach((brushStroke: BrushStroke) => {
        // 개별 스트로크 로그 제거 (성능 향상)
        const newStroke = new Y.Map<unknown>();
        const points = new Y.Array<YPoint>();

        // 포인트들을 Yjs 구조로 변환 (향상된 속성 포함)
        brushStroke.points.forEach((point) => {
          const yPoint = new Y.Map<unknown>();
          yPoint.set("x", point.x);
          yPoint.set("y", point.y);
          yPoint.set("pressure", point.pressure || 0.5);
          yPoint.set("timestamp", point.timestamp || Date.now());
          if (point.actualRadius !== undefined)
            yPoint.set("actualRadius", point.actualRadius);
          if (point.actualOpacity !== undefined)
            yPoint.set("actualOpacity", point.actualOpacity);
          if (point.speed !== undefined) yPoint.set("speed", point.speed);
          if (point.direction !== undefined)
            yPoint.set("direction", point.direction);
          points.push([yPoint]);
        });

        // 스트로크 속성 설정 (향상된 브러시 설정 포함)
        newStroke.set("points", points);
        newStroke.set("color", brushStroke.brushSettings?.color || "#000000");
        newStroke.set("size", brushStroke.brushSettings?.radius || 5);
        newStroke.set("timestamp", brushStroke.timestamp || Date.now());

        // 향상된 브러시 설정들
        if (brushStroke.brushSettings) {
          const settings = brushStroke.brushSettings;
          if (settings.opacity !== undefined)
            newStroke.set("opacity", settings.opacity);
          if (settings.hardness !== undefined)
            newStroke.set("hardness", settings.hardness);
          if (settings.blendMode !== undefined)
            newStroke.set("blendMode", settings.blendMode);
          if (settings.pressureOpacity !== undefined)
            newStroke.set("pressureOpacity", settings.pressureOpacity);
          if (settings.pressureSize !== undefined)
            newStroke.set("pressureSize", settings.pressureSize);
          if (settings.speedSize !== undefined)
            newStroke.set("speedSize", settings.speedSize);
          if (settings.smudgeLength !== undefined)
            newStroke.set("smudgeLength", settings.smudgeLength);
          if (settings.smudgeRadius !== undefined)
            newStroke.set("smudgeRadius", settings.smudgeRadius);
          if (settings.spacing !== undefined)
            newStroke.set("spacing", settings.spacing);
          if (settings.jitter !== undefined)
            newStroke.set("jitter", settings.jitter);
          if (settings.angle !== undefined)
            newStroke.set("angle", settings.angle);
          if (settings.roundness !== undefined)
            newStroke.set("roundness", settings.roundness);
          if (settings.dabsPerSecond !== undefined)
            newStroke.set("dabsPerSecond", settings.dabsPerSecond);
          if (settings.dabsPerRadius !== undefined)
            newStroke.set("dabsPerRadius", settings.dabsPerRadius);
          if (settings.speedOpacity !== undefined)
            newStroke.set("speedOpacity", settings.speedOpacity);
          if (settings.randomRadius !== undefined)
            newStroke.set("randomRadius", settings.randomRadius);
          if (settings.strokeThreshold !== undefined)
            newStroke.set("strokeThreshold", settings.strokeThreshold);
          if (settings.strokeDuration !== undefined)
            newStroke.set("strokeDuration", settings.strokeDuration);
          if (settings.slowTracking !== undefined)
            newStroke.set("slowTracking", settings.slowTracking);
          if (settings.slowTrackingPerDab !== undefined)
            newStroke.set("slowTrackingPerDab", settings.slowTrackingPerDab);
          if (settings.colorMixing !== undefined)
            newStroke.set("colorMixing", settings.colorMixing);
          if (settings.eraser !== undefined)
            newStroke.set("eraser", settings.eraser);
          if (settings.lockAlpha !== undefined)
            newStroke.set("lockAlpha", settings.lockAlpha);
          if (settings.colorizeMode !== undefined)
            newStroke.set("colorizeMode", settings.colorizeMode);
          if (settings.snapToPixel !== undefined)
            newStroke.set("snapToPixel", settings.snapToPixel);
        }

        if (brushStroke.duration !== undefined)
          newStroke.set("duration", brushStroke.duration);
        if (brushStroke.bounds) newStroke.set("bounds", brushStroke.bounds);
        if (brushStroke.renderData)
          newStroke.set("renderData", brushStroke.renderData);

        strokes.push([newStroke as YStroke]);
      });

      console.log(
        `[Yjs] 스트로크 로드 완료 - 총 ${strokes.length}개 스트로크 추가됨`
      );

      // UI 업데이트를 위한 상태 변경
      set({ layerStates: new Map(get().layerStates) });
      console.log(`[Yjs] 상태 업데이트 완료 - 강제 렌더링 실행`);

      // 즉시 렌더링 실행 (지연 없이)
      get().forceRerender();
      console.log(`[Yjs] 강제 렌더링 완료`);

      // 추가 렌더링 보장
      setTimeout(() => {
        get().forceRerender();
        console.log(`[Yjs] 추가 렌더링 보장 완료`);
      }, 50);
    } catch (error) {
      console.error(
        `[Yjs] Failed to load JSON data for layer ${layerId}:`,
        error
      );
    }
  },

  // 레이어 데이터 새로고침 (버전 복구 후 사용)
  refreshLayerData: async (layerId: string) => {
    const { layerStates } = get();
    const layerState = layerStates.get(layerId);

    if (!layerState) {
      console.error(`[Yjs] Layer ${layerId} not connected`);
      return;
    }

    try {
      // 기존 연결 해제
      get().disconnectFromLayer(layerId);

      // 잠시 대기 후 재연결
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 레이어 재연결
      await get().connectToLayer(layerId);
    } catch (error) {
      console.error(`[Yjs] Failed to refresh layer ${layerId}:`, error);
    }
  },

  disconnectFromLayer: (layerId) => {
    const { layerStates } = get();
    const layerState = layerStates.get(layerId);

    if (layerState) {
      // pending save 작업 취소
      layerState.debouncedSave.cancel();

      // 리소스 정리
      layerState.webRTCProvider.destroy();
      layerState.socketIOProvider.destroy();
      layerState.ydoc.destroy();
      layerState.socket.disconnect();

      // 상태에서 제거
      const newLayerStates = new Map(layerStates);
      newLayerStates.delete(layerId);

      set({ layerStates: newLayerStates });
    }
  },

  // ========================================
  // [기존] Canvas 단위 로직 (주석처리)
  // ========================================
  /*
  connectToCanvas_OLD: (canvasId) => {
    get().disconnectFromCanvas_OLD(); // 이전 캔버스 연결 정리
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
            signaling: [`wss://signaling.greatwave.co.kr?token=${token}`],
            peerOpts: {
              config: {
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
              },
            },
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

  disconnectFromCanvas_OLD: () => {
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
  */

  // ========================================
  // 공통 액션 (Awareness, Y.Doc 수정)
  // ========================================
  setMyInfo: (info) => {
    set({ myInfo: info });
    // 모든 연결된 레이어의 awareness에 정보 설정
    const { layerStates } = get();
    layerStates.forEach((layerState) => {
      layerState.awareness.setLocalState({
        ...layerState.awareness.getLocalState(),
        user: info,
      });
    });
  },

  updateMyCursor: (cursor) => {
    const { layerStates, myInfo } = get();
    // 모든 연결된 레이어의 awareness에 커서 정보 설정
    layerStates.forEach((layerState) => {
      layerState.awareness.setLocalState({
        ...layerState.awareness.getLocalState(),
        user: myInfo,
        cursor,
      });
    });
  },

  startStroke: (activeLayerId, x, y, pressure, color, size) => {
    const layerState = get().layerStates.get(activeLayerId);
    if (!layerState) return;

    layerState.ydoc.transact(() => {
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
      layerState.strokes.push([newStroke as YStroke]);

      const json = toStrokeJson(newStroke);
      console.log("[Draw] startStroke", {
        layerId: activeLayerId,
        stroke: json,
      });

      layerState.awareness.setLocalStateField("drawingStroke", {
        ...json,
        layerId: activeLayerId,
      });
    });
  },

  addPointToStroke: (activeLayerId, x, y, pressure) => {
    const layerState = get().layerStates.get(activeLayerId);
    if (!layerState || layerState.strokes.length === 0) return;

    const currentStroke = layerState.strokes.get(layerState.strokes.length - 1);
    const points = currentStroke.get("points") as Y.Array<YPoint>;
    const newPoint = new Y.Map<unknown>();
    newPoint.set("x", x);
    newPoint.set("y", y);
    newPoint.set("pressure", pressure);
    points.push([newPoint]);

    const json = toStrokeJson(currentStroke);
    // console.log("[Draw] addPoint", {
    //   layerId: activeLayerId,
    //   point: { x, y, pressure },
    //   totalPoints: points.length,
    // });

    layerState.awareness.setLocalStateField("drawingStroke", {
      ...json,
      layerId: activeLayerId,
    });
  },

  endStroke: () => {
    console.log("[Draw] endStroke");
    // 모든 레이어의 drawingStroke 상태 초기화
    const { layerStates } = get();
    layerStates.forEach((layerState) => {
      layerState.awareness.setLocalStateField("drawingStroke", null);
    });
  },

  // ========================================
  // 헬퍼 함수들
  // ========================================
  getLayerState: (layerId) => {
    return get().layerStates.get(layerId) || null;
  },

  isLayerConnected: (layerId) => {
    return get().layerStates.has(layerId);
  },

  // 레이어 데이터를 임시 저장하는 함수
  storeLayerDataForLater: (layerId: string, layerData: LayerPersistentData) => {
    const { pendingLayerData } = get();
    const newPendingData = new Map(pendingLayerData);
    newPendingData.set(layerId, layerData);
    set({ pendingLayerData: newPendingData });
  },

  forceRerender: () => {
    set({ forceUpdate: get().forceUpdate + 1 });
  },

  // ========================================
  // 성능 관련 액션들
  // ========================================
  handlePerformanceWarning: (warning: PerformanceWarning) => {
    const { performanceWarnings, hiddenLayers } = get();
    const newWarnings = [
      ...performanceWarnings,
      { ...warning, timestamp: Date.now() },
    ];

    // 100MB 이상이면 자동으로 레이어 숨김
    const dataSize = parseFloat(warning.dataSizeMB);
    if (dataSize > 100) {
      const newHiddenLayers = new Set(hiddenLayers);
      newHiddenLayers.add(warning.layerId);
      set({
        performanceWarnings: newWarnings,
        hiddenLayers: newHiddenLayers,
      });

      // 해당 레이어 연결 해제
      get().disconnectFromLayer(warning.layerId);

      console.warn(
        `[Performance] Auto-hiding layer ${warning.layerId} due to large data size: ${warning.dataSizeMB}MB`
      );
    } else {
      set({ performanceWarnings: newWarnings });
      console.warn(
        `[Performance] Warning for layer ${warning.layerId}: ${warning.dataSizeMB}MB`
      );
    }
  },

  hideLayerForPerformance: (layerId: string) => {
    const { hiddenLayers } = get();
    const newHiddenLayers = new Set(hiddenLayers);
    newHiddenLayers.add(layerId);

    set({ hiddenLayers: newHiddenLayers });

    // 해당 레이어 연결 해제
    get().disconnectFromLayer(layerId);

    console.log(
      `[Performance] Manually hiding layer ${layerId} for performance`
    );
  },

  showLayerForPerformance: (layerId: string) => {
    const { hiddenLayers } = get();
    const newHiddenLayers = new Set(hiddenLayers);
    newHiddenLayers.delete(layerId);

    set({ hiddenLayers: newHiddenLayers });

    console.log(`[Performance] Showing layer ${layerId}`);
  },

  clearPerformanceWarnings: () => {
    set({ performanceWarnings: [] });
  },

  isLayerHidden: (layerId: string) => {
    return get().hiddenLayers.has(layerId);
  },

  // ========================================
  // 성능 최적화 설정 액션들
  // ========================================
  updatePerformanceSettings: (settings) => {
    const currentSettings = get().performanceSettings;
    const newSettings = { ...currentSettings, ...settings };

    console.log("🎯 성능 설정 업데이트:", newSettings);

    set({ performanceSettings: newSettings });

    // 설정 변경 시 강제 렌더링
    get().forceRerender();
  },

  getPerformanceSettings: () => {
    return get().performanceSettings;
  },
}));
