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
const WEBSOCKET_URL = SERVER_URL.replace("http", "ws");

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

// ✨ 1. UserInfo 타입을 명확하게 정의합니다.
interface UserInfo {
  name: string;
  color: string;
}

// ✨ 2. Awareness에 저장되는 상태의 실제 구조를 반영하도록 UserState를 수정합니다.
// user 객체 안에 name과 color가 있고, cursor가 별도로 존재합니다.
interface UserState {
  user?: UserInfo;
  cursor?: { x: number; y: number };
}

interface YjsState {
  yjsStatus: YjsConnectionStatus;
  currentLayerId: string | null;
  ydoc: Y.Doc | null;
  webrtcProvider: WebrtcProvider | null;
  layerSocket: Socket | null;
  awareness: Awareness | null;
  points: Y.Array<Y.Map<any>> | null;
  socketioProvider: SocketIOProvider | null;
  awarenessStates: Map<number, UserState>;
  myInfo: UserInfo | null; // ✨ 3. myInfo 상태를 YjsState에 추가합니다.

  connectToLayer: (layerId: string) => void;
  disconnectFromLayer: () => void;
  addPoint: (x: number, y: number) => void;
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
  points: null,
  socketioProvider: null,
  awarenessStates: new Map(),
  myInfo: null, // ✨ 4. myInfo 상태를 초기화합니다.

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
    const signalingUrl = `${WEBSOCKET_URL}/webrtc?token=${token}`;

    const newLayerSocket = io(`${SERVER_URL}${namespace}`, {
      auth: { token },
      transports: ["websocket", "polling"], // polling으로 테스트 중
    });

    set({ ydoc: doc, layerSocket: newLayerSocket });

    // 서버로부터 업데이트를 받았을 때 처리하는 리스너
    newLayerSocket.on("layer-update", (update: ArrayBuffer) => {
      Y.applyUpdate(doc, new Uint8Array(update));
      // logWithTime(`[Yjs] Received and applied update from server.`);
    });

    // 내 문서가 변경될 때마다 서버로 업데이트를 보내고, 디바운스로 저장 요청도 보냄
    doc.on("update", (update: Uint8Array) => {
      newLayerSocket.emit("layer-update", update);
      debouncedSave(newLayerSocket, Y.encodeStateAsUpdate(doc));
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

          set({
            webrtcProvider,
            socketioProvider,
            awareness: awareness,
            awarenessStates: new Map(awareness.getStates()),
            points: doc.getArray<Y.Map<any>>("points"),
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
      points: null,
      socketioProvider: null,
    });
    logWithTime("[Yjs] Disconnected from layer and cleaned up resources.");
  },

  addPoint: (x: number, y: number) => {
    const { points } = get();
    if (points) {
      const point = new Y.Map<any>();
      point.set("x", x);
      point.set("y", y);
      points.push([point]);
    }
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
