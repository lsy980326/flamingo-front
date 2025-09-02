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

// 레이어별 Yjs 문서 상태
interface LayerYjsState {
  ydoc: Y.Doc;
  awareness: Awareness;
  strokes: Y.Array<YStroke>;
  socket: Socket;
  socketIOProvider: SocketIOProvider;
  webRTCProvider: WebrtcProvider;
  debouncedSave: ReturnType<typeof debounce>;
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

  // 레이어 상태 조회 헬퍼
  getLayerState: (layerId: string) => LayerYjsState | null;
  isLayerConnected: (layerId: string) => boolean;
}

// --- 유틸리티 함수 ---
const logWithTime = (message: string, style: string = "") => {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`%c[${time}] ${message}`, style);
};

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

      // 모든 레이어에 연결
      for (const layer of canvasLayers) {
        await get().connectToLayer(layer._id);
      }

      set({ yjsStatus: "connected" });
      logWithTime(
        `[Canvas] ✅ Connected to canvas: ${canvasId} with ${canvasLayers.length} layers`
      );
    } catch (error) {
      console.error(`[Canvas] Failed to connect to canvas ${canvasId}:`, error);
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

    logWithTime("[Canvas] ✅ Disconnected from canvas");
  },

  // ========================================
  // Layer 단위 Yjs 연결 관리
  // ========================================
  connectToLayer: async (layerId) => {
    const { currentCanvasId, layerStates } = get();
    if (!currentCanvasId) {
      console.error("[Yjs] Canvas not connected");
      return;
    }

    // 이미 연결된 레이어인지 확인 (더 강력한 체크)
    if (layerStates.has(layerId)) {
      console.log(
        `[Yjs] Layer ${layerId} already connected, skipping duplicate connection`
      );
      return;
    }

    // 연결 진행 중인 레이어인지 확인
    if (get().connectingLayers?.has(layerId)) {
      console.log(
        `[Yjs] Layer ${layerId} connection in progress, skipping duplicate connection`
      );
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
          logWithTime(`[Layer] ✅ Connected to namespace: ${namespace}`);

          // 레이어 데이터 복원 이벤트 리스너 추가
          // 중복 이벤트 방지를 위해 시간 기반 체크 사용
          socket.on(
            "layer-data-restored",
            (payload: {
              layerId: string;
              version: number;
              data: ArrayBuffer;
            }) => {
              // 더 강력한 중복 이벤트 방지
              const now = Date.now();
              const lastRestoreTime =
                ((globalThis as Record<string, unknown>)[
                  `lastRestore_${layerId}`
                ] as number) || 0;

              if (now - lastRestoreTime < 5000) {
                // 5초 내 중복 이벤트 무시
                console.log(
                  `[Version Debug] Skipping duplicate restore event for layer ${
                    payload.layerId
                  } (last restore: ${now - lastRestoreTime}ms ago)`
                );
                return;
              }

              (globalThis as Record<string, unknown>)[
                `lastRestore_${layerId}`
              ] = now;
              try {
                console.log(`[Version Debug] Received layer-data-restored:`, {
                  layerId: payload.layerId,
                  version: payload.version,
                  dataSize: payload.data?.byteLength || 0,
                  hasData: !!payload.data,
                });

                if (payload.data) {
                  const layerState = get().layerStates.get(layerId);
                  console.log(`[Version Debug] Layer state found:`, {
                    hasLayerState: !!layerState,
                    hasYdoc: !!layerState?.ydoc,
                    hasStrokes: !!layerState?.strokes,
                    currentStrokesLength: layerState?.strokes?.length || 0,
                  });

                  if (layerState) {
                    // IMPORTANT: 기존 Y.Doc을 파괴하지 말고 내용만 교체
                    // 기존 문서 내용을 모두 지우고 복원된 데이터로 교체
                    console.log(`[Version Debug] Before Y.applyUpdate:`, {
                      strokesLength: layerState.strokes.length,
                      ydocId: layerState.ydoc.guid,
                    });

                    // 복원된 데이터로 Y.Doc 업데이트
                    // 더 간단하고 안전한 방법 사용
                    console.log(
                      `[Version Debug] Updating existing document...`
                    );

                    // 기존 strokes 배열을 모두 지우기
                    const currentStrokes = layerState.strokes;
                    currentStrokes.delete(0, currentStrokes.length);

                    // 복원된 데이터를 임시 문서에 적용하여 strokes 추출 (더 안전한 방법)
                    const tempDoc = new Y.Doc();
                    try {
                      Y.applyUpdate(tempDoc, new Uint8Array(payload.data));
                      const restoredStrokes =
                        tempDoc.getArray<YStroke>("strokes");

                      console.log(
                        `[Version Debug] Restored strokes length: ${restoredStrokes.length}`
                      );

                      // 복원된 strokes를 기존 배열에 복사 (더 안전한 방법)
                      if (restoredStrokes.length > 0) {
                        // 기존 strokes를 모두 지우기
                        currentStrokes.delete(0, currentStrokes.length);

                        // 복원된 strokes를 하나씩 복사
                        for (let i = 0; i < restoredStrokes.length; i++) {
                          try {
                            const stroke = restoredStrokes.get(i);
                            if (stroke && stroke instanceof Y.Map) {
                              // 새로운 Y.Map으로 복사
                              const newStroke = new Y.Map();
                              stroke.forEach((value, key) => {
                                if (value instanceof Y.Array) {
                                  // Y.Array인 경우 새로 생성하여 복사
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
                          } catch (strokeError) {
                            console.warn(
                              `[Version Debug] Failed to copy stroke ${i}:`,
                              strokeError
                            );
                          }
                        }
                        console.log(
                          `[Version Debug] Successfully copied ${currentStrokes.length} strokes`
                        );
                      }
                    } catch (updateError) {
                      console.error(
                        `[Version Debug] Failed to apply update:`,
                        updateError
                      );
                      // 에러 발생 시 기존 strokes 유지
                    } finally {
                      // 임시 문서 정리
                      tempDoc.destroy();
                    }

                    // 복원 후 일정 시간 동안 저장 차단
                    if (layerState.debouncedSave) {
                      layerState.debouncedSave.cancel();
                      console.log(
                        `[Version Debug] Cancelled pending save to prevent overwrite`
                      );
                    }

                    console.log(
                      `[Version Debug] Document updated successfully`
                    );

                    console.log(`[Version Debug] After document update:`, {
                      strokesLength: layerState.strokes.length,
                      ydocId: layerState.ydoc.guid,
                    });

                    logWithTime(
                      `[Version] ✅ Layer ${layerId} restored to version ${payload.version}`
                    );

                    // UI 업데이트를 위한 상태 변경 알림
                    set({ layerStates: new Map(get().layerStates) });

                    // 강제로 리렌더링을 위한 추가 상태 변경
                    setTimeout(() => {
                      console.log(`[Version Debug] Forcing re-render...`);
                      get().forceRerender();
                    }, 100);

                    // 캔버스 강제 업데이트를 위한 추가 조치
                    setTimeout(() => {
                      console.log(
                        `[Version Debug] Triggering canvas update...`
                      );
                      // PixiCanvas 컴포넌트가 이 값의 변화를 감지하여 다시 그리도록 함
                      set({ forceUpdate: get().forceUpdate + 1 });
                    }, 200);
                  }
                }
              } catch (error) {
                console.error(
                  `[Version] Failed to restore layer ${layerId}:`,
                  error
                );
              } finally {
                // 처리 완료 후 플래그는 유지 (5초 동안 중복 이벤트 방지)
              }
            }
          );

          socket.emit(
            "request-layer-data",
            { layerId },
            (docUpdate: ArrayBuffer | null) => {
              try {
                if (docUpdate) {
                  Y.applyUpdate(doc, new Uint8Array(docUpdate));
                  console.log(
                    `[Yjs] Layer ${layerId} data loaded: ${docUpdate.byteLength} bytes`
                  );
                } else {
                  console.log(
                    `[Yjs] Layer ${layerId} is new, starting with empty document`
                  );
                }

                // Yjs 문서 구조 설정
                const strokes = doc.getArray<YStroke>("strokes");

                // strokes가 없으면 새로 생성
                if (!strokes || strokes.length === 0) {
                  console.log(
                    `[Yjs Debug] Creating new strokes array for layer ${layerId}`
                  );
                }

                // SocketIO 및 WebRTC 프로바이더 설정
                const roomName = `flamingo-layer-room-${layerId}`;
                const socketIOProvider = new SocketIOProvider(
                  SERVER_URL,
                  roomName,
                  doc,
                  { auth: { token } }
                );

                const webRTCProvider = new WebrtcProvider(roomName, doc, {
                  awareness: socketIOProvider.awareness,
                  signaling: [`wss://signaling.greatwave.co.kr?token=${token}`],
                  peerOpts: {
                    config: {
                      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
                    },
                  },
                });

                const awareness = socketIOProvider.awareness;

                // Awareness 변경 감지
                awareness.on("change", () => {
                  set({ awarenessStates: new Map(awareness.getStates()) });
                });

                // 문서 변경 시 저장
                const debouncedSave = debounce(() => {
                  if (socket.connected) {
                    const update = Y.encodeStateAsUpdate(doc);
                    console.log(
                      `[Yjs] save-layer-data for ${layerId}: ${update.byteLength} bytes`
                    );
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

                // 연결 완료 시 connectingLayers에서 제거
                set({
                  connectingLayers: new Set(
                    [...get().connectingLayers].filter((id) => id !== layerId)
                  ),
                });

                resolve();
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        socket.on("connect_error", (err) => {
          console.error(
            `[Layer] ❌ Connection error on ${namespace}:`,
            err.message
          );
          reject(err);
        });

        // 타임아웃 설정
        setTimeout(() => reject(new Error("Connection timeout")), 10000);
      });
    } catch (error) {
      console.error(`[Yjs] Failed to connect to layer ${layerId}:`, error);

      // 에러 발생 시에도 connectingLayers에서 제거
      set({
        connectingLayers: new Set(
          [...get().connectingLayers].filter((id) => id !== layerId)
        ),
      });
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

      logWithTime(`[Yjs] ✅ Layer ${layerId} data refreshed`);
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

      logWithTime(`[Layer] ✅ Disconnected from layer: ${layerId}`);
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

  forceRerender: () => {
    set({ forceUpdate: get().forceUpdate + 1 });
  },
}));
