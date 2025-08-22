import { create } from "zustand";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { Awareness } from "y-protocols/awareness";
import { io, Socket } from "socket.io-client";
import { debounce } from "lodash-es";
import { SocketIOProvider } from "y-socket.io";

import { useSocketStore } from "./useSocketStore";

const SERVER_URL = "http://localhost:8080";
// const SERVER_URL = "http://3.38.2.73:8080";

// 연결 상태 타입
type YjsConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

const logWithTime = (message: string, style: string = "") => {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`%c[${time}] ${message}`, style);
};

// 디바운스를 적용한 저장 함수
const debouncedSave = debounce((socket: Socket | null, update: Uint8Array) => {
  if (socket && socket.connected) {
    socket.emit("save-layer-data", update);
    logWithTime(`[Yjs] 💾 Document update sent for persistence.`);
  }
}, 2000);

interface UserInfo {
  name: string;
  color: string;
}

interface UserState {
  user?: UserInfo;
  cursor?: { x: number; y: number };
  drawingStroke?: {
    points: { x: number; y: number; pressure?: number }[];
    color: string;
    size: number;
  } | null;
}

// Yjs 데이터 타입을 명확하게 정의
// Y.Map<unknown>를 사용하여 any를 제거
export type YStroke = Y.Map<unknown>;
export type YPoint = Y.Map<unknown>;

interface YjsState {
  yjsStatus: YjsConnectionStatus;
  currentLayerId: string | null;
  ydoc: Y.Doc | null;
  webrtcProvider: WebrtcProvider | null;
  layerSocket: Socket | null;
  awareness: Awareness | null;
  // points: Y.Array<Y.Map<any>> | null;
  strokes: Y.Array<YStroke> | null;
  socketioProvider: SocketIOProvider | null;
  awarenessStates: Map<number, UserState>;
  myInfo: UserInfo | null; // ✨ 3. myInfo 상태를 YjsState에 추가합니다.
  renderVersion: number;

  connectToLayer: (layerId: string) => void;
  disconnectFromLayer: () => void;
  // addPoint: (x: number, y: number) => void;
  startStroke: (
    x: number,
    y: number,
    pressure: number,
    color: string,
    size: number
  ) => void;
  addPointToStroke: (x: number, y: number, pressure: number) => void;
  endStroke: () => void;
  setLocalUserName: (name: string) => void;
  updateMyCursor: (cursor: { x: number; y: number } | null) => void; // ✨ null 허용
  setMyInfo: (info: UserInfo) => void;
}

export const useYjsStore = create<YjsState>((set, get) => ({
  yjsStatus: "disconnected",
  currentLayerId: null,
  ydoc: null,
  webrtcProvider: null,
  layerSocket: null,
  awareness: null,
  // points: null,
  socketioProvider: null,
  awarenessStates: new Map(),
  myInfo: null, // ✨ 4. myInfo 상태를 초기화합니다.
  strokes: null,
  renderVersion: 0,

  connectToLayer: (layerId) => {
    const { yjsStatus, currentLayerId } = get();

    if (
      layerId === currentLayerId &&
      (yjsStatus === "connecting" || yjsStatus === "connected")
    ) {
      return;
    }
    if (yjsStatus === "connected" || yjsStatus === "connecting") {
      get().disconnectFromLayer();
    }

    logWithTime(
      `%c[LIFECYCLE] connectToLayer CALLED for layer: ${layerId}`,
      "color: blue; font-weight: bold;"
    );
    set({ yjsStatus: "connecting", currentLayerId: layerId });

    const token = useSocketStore.getState().token;
    if (!token) {
      set({ yjsStatus: "error" });
      return console.error("Yjs Connection Failed: No JWT token provided.");
    }

    const doc = new Y.Doc();
    const namespace = `/layer-${layerId}`;
    // const signalingUrl = `${WEBSOCKET_URL}/webrtc?token=${token}`;

    const newLayerSocket = io(`${SERVER_URL}${namespace}`, {
      auth: { token },
      transports: ["websocket", "polling"], // polling으로 테스트 중
    });

    set({ ydoc: doc, layerSocket: newLayerSocket });

    // 서버로부터 업데이트를 받았을 때 처리하는 리스너
    newLayerSocket.on("layer-update", (update: ArrayBuffer) => {
      Y.applyUpdate(doc, new Uint8Array(update));
      const strokes = doc.getArray<YStroke>("strokes");
      // eslint-disable-next-line no-console
      console.log("[Yjs] Strokes updated from server:", strokes.toJSON());
      // logWithTime(`[Yjs] Received and applied update from server.`);
    });

    // 내 문서가 변경될 때마다 서버로 업데이트를 보내고, 디바운스로 저장 요청도 보냄
    doc.on("update", (update: Uint8Array) => {
      newLayerSocket.emit("layer-update", update);
      debouncedSave(newLayerSocket, Y.encodeStateAsUpdate(doc));
      set((state) => ({ renderVersion: state.renderVersion + 1 }));
    });

    newLayerSocket.on("connect", () => {
      logWithTime(`[Socket.IO] ✅ Connected to data namespace: ${namespace}`);

      // --- Ping-Pong 테스트 코드 ---
      logWithTime(`[Ping-Pong] Sending PING to server.`);
      newLayerSocket.emit("ping-test");

      newLayerSocket.on("pong-test", () => {
        logWithTime(
          `[Ping-Pong] ✅ Received PONG from server! Event bus is working.`
        );
      });
      // --- Ping-Pong 테스트 코드 끝 ---

      newLayerSocket.emit(
        "request-layer-data",
        { layerId: layerId },
        (docUpdate: ArrayBuffer | null) => {
          if (get().currentLayerId !== layerId) {
            logWithTime("[Yjs] Stale connection response received. Ignoring.");
            newLayerSocket.disconnect();
            return;
          }

          if (docUpdate) {
            Y.applyUpdate(doc, new Uint8Array(docUpdate));
            logWithTime(`[Yjs] 📄 Doc initialized from server data.`);
            const strokes = doc.getArray<YStroke>("strokes");
            // eslint-disable-next-line no-console
            console.log("[Yjs] Initial strokes loaded:", strokes.toJSON());
          } else {
            logWithTime(`[Yjs] 📄 No existing data on server. Starting fresh.`);
          }

          const roomName = `flamingo-webrtc-room-${layerId}`;
          const socketioRoomName = `flamingo-socketio-room-${layerId}`;

          const socketioProvider = new SocketIOProvider(
            SERVER_URL,
            socketioRoomName,
            doc,
            {
              auth: { token },
              autoConnect: true,
            }
          );

          const webrtcProvider = new WebrtcProvider(roomName, doc, {
            // signaling: [signalingUrl],
            awareness: socketioProvider.awareness,
            peerOpts: {
              config: {
                iceServers: [
                  { urls: "stun:stun.l.google.com:19302" },
                  { urls: "stun:stun1.l.google.com:19302" },
                  { urls: "stun:stun2.l.google.com:19302" },
                  { urls: "stun:stun3.l.google.com:19302" },
                  { urls: "stun:stun4.l.google.com:19302" },
                ],
              },
            },
          });

          // ✨ Awareness 객체는 y-socket.io Provider의 것을 사용합니다.
          const awareness = socketioProvider.awareness;

          awareness.on("change", () => {
            set({ awarenessStates: new Map(awareness.getStates()) });
          });

          const strokes = doc.getArray<YStroke>("strokes");
          set({
            webrtcProvider,
            socketioProvider,
            awareness: awareness,
            awarenessStates: new Map(awareness.getStates()),
            // points: doc.getArray<Y.Map<any>>("points"),
            strokes,
            yjsStatus: "connected",
          });
        }
      );
    });

    newLayerSocket.on("connect_error", (err) => {
      console.error(
        `[Socket.IO] ❌ Connection error on ${namespace}:`,
        err.message
      );
      set({ yjsStatus: "error" });
    });
  },

  disconnectFromLayer: () => {
    const { yjsStatus, layerSocket } = get();
    if (yjsStatus === "disconnected") return;

    logWithTime(
      `%c[LIFECYCLE] disconnectFromLayer CALLED`,
      "color: red; font-weight: bold;"
    );

    debouncedSave.cancel();
    get().webrtcProvider?.destroy();
    get().socketioProvider?.destroy();
    get().ydoc?.destroy();
    layerSocket?.disconnect();

    set({
      yjsStatus: "disconnected",
      currentLayerId: null,
      ydoc: null,
      webrtcProvider: null,
      layerSocket: null,
      awareness: null,
      // points: null,
      socketioProvider: null,
    });
    logWithTime("[Yjs] Disconnected from layer and cleaned up resources.");
  },

  // addPoint: (x: number, y: number) => {
  //   const { points } = get();
  //   if (points) {
  //     const point = new Y.Map<any>();
  //     point.set("x", x);
  //     point.set("y", y);
  //     points.push([point]);
  //   }
  // },

  startStroke: (x, y, pressure, color, size) => {
    const { ydoc, strokes, awareness } = get();
    if (!ydoc || !strokes) return;

    ydoc.transact(() => {
      // 1. 스트로크 전체를 나타낼 Y.Map 생성
      const newStroke = new Y.Map<unknown>();

      // 2. 점들을 담을 Y.Array 생성
      const points = new Y.Array<YPoint>();

      // 3. 첫 번째 점을 나타낼 Y.Map 생성
      const firstPoint = new Y.Map<unknown>();
      firstPoint.set("x", x);
      firstPoint.set("y", y);
      firstPoint.set("pressure", pressure);

      // 4. 점 배열에 첫 번째 점 추가
      points.push([firstPoint]);

      // 5. 스트로크 맵에 속성 및 점 배열 설정
      newStroke.set("points", points);
      newStroke.set("color", color);
      newStroke.set("size", size);

      // 6. 전체 스트로크 배열에 새로운 스트로크 추가
      strokes.push([newStroke]);

      // // --- ▼▼▼ 로그 추가 ▼▼▼ ---
      // console.log("--- startStroke ---");
      // // 1. strokes는 Y.Array 객체입니다.
      // console.log("Strokes (Y.Array):", strokes);
      // // 2. toJSON()으로 일반 JS 객체/배열로 변환하여 내용을 확인합니다.
      // console.log("Strokes (as JSON):", strokes.toJSON());
      // // 3. 현재 생성된 스트로크의 내용
      // console.log("Current Stroke (as JSON):", newStroke.toJSON());
      // // --- ▲▲▲ 로그 추가 끝 ▲▲▲ ---

      // 7. Awareness 업데이트 (toJSON() 사용 가능)
      awareness?.setLocalStateField("drawingStroke", newStroke.toJSON());
    });
  },

  addPointToStroke: (x, y, pressure) => {
    const { strokes, awareness } = get();
    // strokes 배열이 비어있으면 아무것도 하지 않음 (startStroke가 먼저 호출되어야 함)
    if (!strokes || strokes.length === 0) return;

    // 1. 현재 그리고 있는 마지막 스트로크(Y.Map)를 가져옴
    const currentStroke = strokes.get(strokes.length - 1);
    // 2. 스트로크 안의 점 배열(Y.Array)을 가져옴
    const points = currentStroke.get("points") as Y.Array<YPoint>;

    // 3. 새로 추가할 점(Y.Map) 생성
    const newPoint = new Y.Map<unknown>();
    newPoint.set("x", x);
    newPoint.set("y", y);
    newPoint.set("pressure", pressure);

    // 4. 점 배열에 새로운 점 추가
    points.push([newPoint]);

    //  // --- ▼▼▼ 로그 추가 ▼▼▼ ---
    //  console.log("--- addPointToStroke ---");
    //  // 1. 현재 스트로크의 `points`는 Y.Array 객체입니다.
    //  console.log("Current Points (Y.Array):", points);
    //  // 2. toJSON()으로 변환하여 실제 점들이 어떻게 쌓이는지 확인합니다.
    //  console.log("Current Points (as JSON):", points.toJSON());
    //  // --- ▲▲▲ 로그 추가 끝 ▲▲▲ ---

    // 5. Awareness 업데이트
    awareness?.setLocalStateField("drawingStroke", currentStroke.toJSON());
  },

  endStroke: () => {
    const { strokes, awareness } = get();
    if (strokes && strokes.length > 0) {
      const lastStroke = strokes.get(strokes.length - 1);
      // eslint-disable-next-line no-console
      console.log("[Yjs] Stroke ended:", lastStroke.toJSON());
    }
    awareness?.setLocalStateField("drawingStroke", null);
  },

  setLocalUserName: (name) => {
    const { awareness } = get();
    if (awareness) {
      // 랜덤 색상 지정 (실제로는 사용자별 고유 색상을 DB에서 가져오는 것이 좋음)
      const colors = ["#ff0000", "#0000ff", "#00ff00", "#ffa500", "#800080"];
      const color = colors[Math.floor(Math.random() * colors.length)];

      awareness.setLocalStateField("user", { name, color });
    }
  },
  // ✨ 5. setMyInfo 액션을 보다 직관적으로 수정합니다.
  // set을 호출한 후 get을 다시 호출할 필요 없이, 인자로 받은 info를 직접 사용합니다.
  setMyInfo: (info) => {
    set({ myInfo: info });
    const { awareness } = get();
    if (awareness) {
      awareness.setLocalState({
        ...awareness.getLocalState(),
        user: info,
      });
    }
  },
  updateMyCursor: (cursor) => {
    const { awareness, myInfo } = get();
    if (awareness) {
      const currentState = awareness.getLocalState() || {};
      awareness.setLocalState({
        ...currentState,
        user: myInfo, // user 정보를 항상 포함시킵니다.
        cursor: cursor,
      });
    }
  },
}));
