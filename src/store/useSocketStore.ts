import { create } from "zustand";
import { mainSocket } from "../socket";
import type { Page, Canvas, Layer } from "../types";

interface AllData {
  pages: Page[];
  canvases: Canvas[];
  layers: Layer[];
}

interface SocketState {
  isConnected: boolean;
  token: string | null;
  allData: AllData;
  projectId: string | null;
  selectedPageId: string | null;
  selectedCanvasId: string | null;
  selectedLayerId: string | null;

  connect: (token: string) => void;
  disconnect: () => void;
  setupEventListeners: () => void;
  joinProject: (projectId: string) => void;
  selectPage: (pageId: string | null) => void;
  selectCanvas: (canvasId: string | null) => void;
  selectLayer: (layerId: string | null) => void;

  // Emit 액션들
  createPage: (name: string) => void;
  createCanvas: (data: {
    name: string;
    width: number;
    height: number;
    unit: string;
  }) => void;
  createLayer: (data: { name: string; type: string }) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  isConnected: false,
  token: null,
  allData: { pages: [], canvases: [], layers: [] },
  projectId: null,
  selectedPageId: null,
  selectedCanvasId: null,
  selectedLayerId: null,

  connect: (token) => {
    if (mainSocket.connected) return;
    set({ token });
    mainSocket.auth = { token };
    mainSocket.connect();

    mainSocket.on("connect", () => {
      set({ isConnected: true });
      get().setupEventListeners();

      // --- ▼▼▼ 메인 네임스페이스 Ping-Pong 테스트 코드 추가 ▼▼▼ ---
      console.log("[Ping-Pong] Sending MAIN PING to server.");
      mainSocket.emit("main-ping-test");

      mainSocket.on("main-pong-test", () => {
        console.log(
          "[Ping-Pong] ✅ Received MAIN PONG from server! Main namespace is working correctly."
        );
      });
      // --- ▲▲▲ 메인 네임스페이스 Ping-Pong 테스트 코드 추가 ▲▲▲ ---
    });
    mainSocket.on("disconnect", () => {
      set({
        isConnected: false,
        token: null,
        projectId: null,
        selectedPageId: null,
        selectedCanvasId: null,
        selectedLayerId: null,
        allData: { pages: [], canvases: [], layers: [] },
      });
      mainSocket.off();
    });
    mainSocket.on("connect_error", (err) =>
      console.error("Connection Error:", err.message)
    );
  },

  disconnect: () => mainSocket.disconnect(),

  setupEventListeners: () => {
    mainSocket.on("error", (data) => alert(`Server Error: ${data.message}`));
    mainSocket.on("initial-data", (data: AllData) => set({ allData: data }));
    mainSocket.on("page-created", (newPage: Page) =>
      set((state) => ({
        allData: { ...state.allData, pages: [...state.allData.pages, newPage] },
      }))
    );
    mainSocket.on("canvas-created", (newCanvas: Canvas) =>
      set((state) => ({
        allData: {
          ...state.allData,
          canvases: [...state.allData.canvases, newCanvas],
        },
      }))
    );
    mainSocket.on("layer-created", (newLayer: Layer) =>
      set((state) => ({
        allData: {
          ...state.allData,
          layers: [...state.allData.layers, newLayer],
        },
      }))
    );
  },

  joinProject: (projectId) => {
    if (!mainSocket.connected) {
      console.error("Socket not connected. Cannot join project.");
      return;
    }
    set({
      projectId,
      selectedPageId: null,
      selectedCanvasId: null,
      selectedLayerId: null,
      allData: { pages: [], canvases: [], layers: [] },
    });
    mainSocket.emit("join-project", projectId, (response) => {
      if (response && response.success) {
        console.log(`Successfully joined project ${projectId}`, response);
      } else {
        const errorMessage = response?.error || "Unknown error";
        console.error(`Failed to join project ${projectId}:`, errorMessage);
        alert(`프로젝트 참여에 실패했습니다: ${errorMessage}`);
      }
    });
  },

  selectPage: (pageId) =>
    set({
      selectedPageId: pageId,
      selectedCanvasId: null,
      selectedLayerId: null,
    }),
  selectCanvas: (canvasId) =>
    set({ selectedCanvasId: canvasId, selectedLayerId: null }),
  selectLayer: (layerId) => set({ selectedLayerId: layerId }),

  // --- Emit 액션 구현 ---
  createPage: (name) => {
    const { projectId } = get();
    if (projectId) mainSocket.emit("create-page", { projectId, name });
  },
  createCanvas: (data) => {
    const { projectId, selectedPageId } = get();
    if (projectId && selectedPageId) {
      mainSocket.emit("create-canvas", {
        ...data,
        projectId,
        pageId: selectedPageId,
      });
    }
  },
  createLayer: (data) => {
    const { projectId, selectedCanvasId } = get();
    if (projectId && selectedCanvasId) {
      mainSocket.emit("create-layer", {
        ...data,
        projectId,
        canvasId: selectedCanvasId,
      });
    }
  },
}));
