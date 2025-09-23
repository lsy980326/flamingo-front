import { create } from "zustand";
import { mainSocket } from "../socket";
import type { Page, Canvas, Layer, LayerPersistentData } from "../types";
import { useYjsStore } from "./useYjsStore";

interface AllData {
  pages: Page[];
  canvases: Canvas[];
  layers: Layer[];
}

// 새로운 계층구조 타입
interface ProjectData {
  project: {
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    created_at: Date;
    updated_at: Date;
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
        type: string;
        visible: boolean;
        locked: boolean;
        opacity: number;
        blend_mode: string;
        order: number;
        layer_data?: any;
      }>;
    }>;
  }>;
}

interface SocketState {
  isConnected: boolean;
  token: string | null;
  allData: AllData; // 기존 플랫 구조 (호환성)
  projectData: ProjectData | null; // 새로운 계층구조
  projectId: string | null;
  selectedPageId: string | null;
  selectedCanvasId: string | null;
  selectedLayerId: string | null;

  connect: (token: string) => void;
  disconnect: () => void;
  setupEventListeners: () => void;
  joinProject: (projectId: string, options?: { useJsonData?: boolean }) => void;
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

  // 계층구조 데이터 접근 헬퍼
  getPages: () => any[];
  getCanvasesForPage: (pageId: string) => any[];
  getLayersForCanvas: (canvasId: string) => any[];
  getSelectedPage: () => any | null;
  getSelectedCanvas: () => any | null;
  getSelectedLayer: () => any | null;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  isConnected: false,
  token: null,
  allData: { pages: [], canvases: [], layers: [] },
  projectData: null,
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
        projectData: null,
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

    // 기존 initial-data 이벤트 (호환성을 위해 유지)
    mainSocket.on("initial-data", (data: AllData) => set({ allData: data }));

    // 새로운 initial-project-data 이벤트 (JSON 데이터 포함)
    mainSocket.on("initial-project-data", (data: ProjectData) => {
      // 서버로부터 받은 데이터 로그
      console.log(`📥 [Frontend] Received project data from server:`, {
        project: {
          id: data.project?.id,
          name: data.project?.name,
          pagesCount: data.pages?.length || 0,
          totalCanvases:
            data.pages?.reduce(
              (sum, page) => sum + (page.canvases?.length || 0),
              0
            ) || 0,
          totalLayers:
            data.pages?.reduce(
              (sum, page) =>
                sum +
                page.canvases?.reduce(
                  (canvasSum, canvas) =>
                    canvasSum + (canvas.layers?.length || 0),
                  0
                ),
              0
            ) || 0,
        },
        fullStructure: data,
      });

      // 계층구조 데이터를 그대로 저장
      set({ projectData: data });

      // data.json 형태의 구조화된 데이터 처리
      const allPages: any[] = [];
      const allCanvases: any[] = [];
      const allLayers: any[] = [];
      let storedLayersCount = 0;

      // 중첩된 구조를 평면화
      data.pages?.forEach((page: any) => {
        // 페이지 메타데이터 추가
        allPages.push({
          _id: page.id,
          projectId: data.project?.id,
          name: page.name,
          order: page.order,
        });

        // 페이지 내 캔버스들 처리
        page.canvases?.forEach((canvas: any) => {
          // 캔버스 메타데이터 추가
          allCanvases.push({
            _id: canvas.id,
            pageId: page.id,
            name: canvas.name,
            width: canvas.width,
            height: canvas.height,
            x: canvas.x,
            y: canvas.y,
            scale: canvas.scale,
            order: canvas.order,
          });

          // 캔버스 내 레이어들 처리
          canvas.layers?.forEach((layer: any) => {
            // 레이어 메타데이터 추가 (layer_data 제외)
            allLayers.push({
              _id: layer.id,
              canvasId: canvas.id,
              name: layer.name,
              type: layer.type,
              visible: layer.visible,
              locked: layer.locked,
              opacity: layer.opacity,
              blendMode: layer.blend_mode,
              order: layer.order,
            });

            // 레이어 데이터가 있으면 임시 저장
            if (layer.layer_data && layer.layer_data.brushStrokes?.length > 0) {
              const { storeLayerDataForLater } = useYjsStore.getState();
              storeLayerDataForLater(layer.id, layer.layer_data);
              storedLayersCount++;
            }
          });
        });
      });

      // 평면화된 데이터 저장
      set({
        allData: {
          pages: allPages,
          canvases: allCanvases,
          layers: allLayers,
        },
      });

      // 자동 선택: 첫 번째 페이지/캔버스/레이어 선택 (사용자 편의성)
      if (allPages.length > 0 && !get().selectedPageId) {
        const firstPage = allPages[0];
        get().selectPage(firstPage._id);

        const firstPageCanvases = allCanvases.filter(
          (c) => c.pageId === firstPage._id
        );
        if (firstPageCanvases.length > 0) {
          const firstCanvas = firstPageCanvases[0];
          get().selectCanvas(firstCanvas._id);

          const firstCanvasLayers = allLayers.filter(
            (l) => l.canvasId === firstCanvas._id
          );
          if (firstCanvasLayers.length > 0) {
            const firstLayer = firstCanvasLayers[0];
            get().selectLayer(firstLayer._id);
            console.log(`\n🎯 [Auto-Select] Automatically selected:`, {
              page: firstPage.name,
              canvas: firstCanvas.name,
              layer: firstLayer.name,
            });
          }
        }
      }

      console.log(
        `\n✅ [Frontend] Project setup complete: ${storedLayersCount} layers with drawing data ready for loading`
      );
      console.log(
        `    💾 Layer data stored in pendingLayerData for Yjs connection`
      );
    });

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
    mainSocket.on("layer-created", (newLayer: Layer & { layer_data?: any }) =>
      set((state) => ({
        allData: {
          ...state.allData,
          layers: [...state.allData.layers, newLayer],
        },
      }))
    );

    // 텍스트 관련 이벤트 핸들러들
    mainSocket.on("text-added-to-layer", ({ layerId, textObject }) => {
      set((state) => {
        const updatedLayers = state.allData.layers.map((layer) => {
          if (layer._id === layerId) {
            return {
              ...layer,
              layer_data: {
                ...layer.layer_data,
                textObjects: [
                  ...(layer.layer_data?.textObjects || []),
                  textObject,
                ],
              },
            };
          }
          return layer;
        });

        return {
          allData: {
            ...state.allData,
            layers: updatedLayers,
          },
        };
      });
    });

    mainSocket.on("text-updated-in-layer", ({ layerId, textId, updates }) => {
      set((state) => {
        const updatedLayers = state.allData.layers.map((layer) => {
          if (layer._id === layerId && layer.layer_data?.textObjects) {
            const updatedTextObjects = layer.layer_data.textObjects.map(
              (textObj: any) => {
                if (textObj.id === textId) {
                  return { ...textObj, ...updates };
                }
                return textObj;
              }
            );

            return {
              ...layer,
              layer_data: {
                ...layer.layer_data,
                textObjects: updatedTextObjects,
              },
            };
          }
          return layer;
        });

        return {
          allData: {
            ...state.allData,
            layers: updatedLayers,
          },
        };
      });
    });

    mainSocket.on("text-deleted-from-layer", ({ layerId, textId }) => {
      set((state) => {
        const updatedLayers = state.allData.layers.map((layer) => {
          if (layer._id === layerId && layer.layer_data?.textObjects) {
            const updatedTextObjects = layer.layer_data.textObjects.filter(
              (textObj: any) => textObj.id !== textId
            );

            return {
              ...layer,
              layer_data: {
                ...layer.layer_data,
                textObjects: updatedTextObjects,
              },
            };
          }
          return layer;
        });

        return {
          allData: {
            ...state.allData,
            layers: updatedLayers,
          },
        };
      });
    });
  },

  joinProject: (projectId, options) => {
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

    // 옵션에 따라 다른 방식으로 프로젝트 참여
    const useJsonData = options?.useJsonData ?? true;
    console.log(
      `[Socket] Joining project ${projectId} with ${
        useJsonData ? "JSON" : "binary"
      } data mode`
    );

    mainSocket.emit("join-project", projectId, options, (response) => {
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

  // 계층구조 데이터 접근 헬퍼 함수들
  getPages: () => {
    const { projectData } = get();
    return projectData?.pages || [];
  },

  getCanvasesForPage: (pageId: string) => {
    const { projectData } = get();
    const page = projectData?.pages.find((p) => p.id === pageId);
    return page?.canvases || [];
  },

  getLayersForCanvas: (canvasId: string) => {
    const { projectData } = get();
    for (const page of projectData?.pages || []) {
      const canvas = page.canvases.find((c) => c.id === canvasId);
      if (canvas) {
        return canvas.layers || [];
      }
    }
    return [];
  },

  getSelectedPage: () => {
    const { projectData, selectedPageId } = get();
    if (!selectedPageId) return null;
    return projectData?.pages.find((p) => p.id === selectedPageId) || null;
  },

  getSelectedCanvas: () => {
    const { projectData, selectedPageId, selectedCanvasId } = get();
    if (!selectedPageId || !selectedCanvasId) return null;
    const page = projectData?.pages.find((p) => p.id === selectedPageId);
    return page?.canvases.find((c) => c.id === selectedCanvasId) || null;
  },

  getSelectedLayer: () => {
    const { projectData, selectedCanvasId, selectedLayerId } = get();
    if (!selectedCanvasId || !selectedLayerId) return null;
    for (const page of projectData?.pages || []) {
      const canvas = page.canvases.find((c) => c.id === selectedCanvasId);
      if (canvas) {
        return canvas.layers.find((l) => l.id === selectedLayerId) || null;
      }
    }
    return null;
  },
}));
