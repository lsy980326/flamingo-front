import { useCallback, useEffect, useState } from "react";
import { Application, extend } from "@pixi/react";
import * as PIXI from "pixi.js";
import * as Y from "yjs";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore"; // 메타데이터를 위한 스토어
// import type { Layer } from "../types"; // 사용하지 않음

// Pixi 객체들을 React 컴포넌트로 사용할 수 있도록 확장
extend({ Container: PIXI.Container, Graphics: PIXI.Graphics, Text: PIXI.Text });

// Y.Map을 일반 스트로크 객체로 변환하는 헬퍼 함수
const yStrokeToObj = (stroke: Y.Map<unknown>) => {
  return stroke.toJSON() as StrokeShape;
};

type StrokePoint = { x: number; y: number; pressure?: number };
type StrokeShape = {
  points: StrokePoint[];
  color: string;
  size: number;
  layerId?: string; // 레이어 ID 추가
};
// interface ExtendedLayerMeta extends Layer {
//   opacity?: number;
//   isVisible?: boolean;
// }

// 모든 레이어의 그림 데이터를 렌더링하는 컴포넌트
const DrawingLayer = ({
  layerVisibility,
}: {
  layerVisibility: Record<string, boolean>;
}) => {
  // 1. Yjs로부터 레이어별 그림 데이터를 가져옴
  const layerStates = useYjsStore((state) => state.layerStates);
  const awarenessStates = useYjsStore((state) => state.awarenessStates);
  const performanceSettings = useYjsStore((state) => state.performanceSettings);
  const myClientId = useYjsStore((state) =>
    state.awarenessStates.size > 0
      ? Array.from(state.awarenessStates.keys())[0]
      : null
  );

  // 2. 메인 소켓으로부터 구조/속성 데이터(메타데이터)를 가져옴
  const { selectedCanvasId, projectData } = useSocketStore();

  // 계층구조 데이터에서 레이어 메타데이터 추출
  const layerMetadatas =
    projectData?.pages?.flatMap(
      (page) =>
        page.canvases?.flatMap(
          (canvas) =>
            canvas.layers?.map((layer) => ({
              ...layer,
              canvasId: canvas.id,
              _id: layer.id,
              isVisible: layer.visible,
              opacity: layer.opacity,
            })) || []
        ) || []
    ) || [];

  // 3. Yjs 데이터가 변경될 때 리렌더링을 트리거하기 위한 상태
  const [renderVersion, setRenderVersion] = useState(0);
  const forceUpdate = useYjsStore((state) => state.forceUpdate);

  useEffect(() => {
    if (!layerStates || layerStates.size === 0) return;

    const observers: (() => void)[] = [];

    // 각 레이어의 Yjs 문서 변경을 감지
    layerStates.forEach((layerState) => {
      const observer = () => setRenderVersion((v) => v + 1);
      layerState.ydoc.on("update", observer);
      observers.push(() => layerState.ydoc.off("update", observer));
    });

    return () => {
      observers.forEach((cleanup) => cleanup());
    };
  }, [layerStates, forceUpdate, performanceSettings]); // performanceSettings 의존성 추가

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();

      // console.log("[PixiCanvas] Drawing debug:", {
      //   selectedCanvasId,
      //   layerStatesSize: layerStates.size,
      //   layerMetadatasLength: layerMetadatas.length,
      //   layerVisibility,
      // });

      if (!selectedCanvasId || layerStates.size === 0) {
        console.log("[PixiCanvas] No canvas or layer states");
        return;
      }

      // 현재 캔버스에 속한 레이어 메타데이터만 필터링하고 순서대로 정렬
      const targetLayersMeta = layerMetadatas
        .filter((meta) => meta.canvasId === selectedCanvasId)
        .sort((a, b) => a.order - b.order);

      // 4. 모든 레이어를 순서대로 렌더링
      targetLayersMeta.forEach((meta) => {
        const isVisible = meta.isVisible ?? true;
        const isUserVisible = layerVisibility[meta._id] ?? true;

        // 레이어가 숨겨져 있으면 건너뛰기
        if (!isVisible || !isUserVisible) return;

        // 레이어 속성 적용
        const opacity = meta.opacity ?? 100;
        g.alpha = opacity / 100;

        // 텍스트 레이어인 경우 텍스트 렌더링
        if (meta.type === "text" && meta.layer_data?.textObjects) {
          // 텍스트는 별도의 Text 컴포넌트로 렌더링하므로 여기서는 스킵
          // 실제 텍스트 렌더링은 TextLayer 컴포넌트에서 처리
        }

        // 브러시 레이어인 경우 스트로크 렌더링
        if (meta.type === "brush") {
          // Yjs 데이터가 있으면 Yjs에서 가져오기
          const layerState = layerStates.get(meta._id);
          // console.log(`[PixiCanvas] Layer ${meta._id} (${meta.name}):`, {
          //   hasLayerState: !!layerState,
          //   layerType: meta.type,
          //   isVisible,
          //   isUserVisible,
          // });

          if (layerState) {
            const strokesArray = layerState.strokes;
            let allStrokes = strokesArray
              ? strokesArray.toArray().map(yStrokeToObj)
              : [];

            // 성능 설정이 활성화된 경우 스트로크 제한 적용
            if (performanceSettings.enabled) {
              const maxStrokes = performanceSettings.maxStrokeLimit;
              const strokeReduction = performanceSettings.strokeReduction;

              // 스트로크 수 제한
              if (allStrokes.length > maxStrokes) {
                console.log(
                  `🎯 레이어 ${meta._id}: 스트로크 수 제한 적용 (${allStrokes.length} → ${maxStrokes})`
                );
                allStrokes = allStrokes.slice(-maxStrokes); // 최신 스트로크만 유지
              }

              // 스트로크 단순화 적용
              if (strokeReduction > 0) {
                const reductionFactor = Math.floor(
                  allStrokes.length * strokeReduction
                );
                if (reductionFactor > 0) {
                  console.log(
                    `🎯 레이어 ${meta._id}: 스트로크 단순화 적용 (${
                      allStrokes.length
                    } → ${allStrokes.length - reductionFactor})`
                  );
                  allStrokes = allStrokes.filter(
                    (_, index) =>
                      index % Math.ceil(1 / (1 - strokeReduction)) === 0
                  );
                }
              }
            }

            // console.log(`[PixiCanvas] Layer ${meta._id} strokes:`, {
            //   strokesArrayLength: strokesArray?.length || 0,
            //   allStrokesLength: allStrokes.length,
            // });

            // 이 레이어의 모든 스트로크 그리기
            allStrokes.forEach((stroke) => {
              if (!stroke.points || stroke.points.length < 1) return;
              const color = parseInt(stroke.color.replace("#", ""), 16);

              g.setStrokeStyle({ width: stroke.size, color, alpha: g.alpha });
              g.beginPath();
              g.moveTo(stroke.points[0].x, stroke.points[0].y);

              for (let i = 1; i < stroke.points.length; i++) {
                g.lineTo(stroke.points[i].x, stroke.points[i].y);
              }

              g.stroke();
            });
          } else if (meta.layer_data?.brushStrokes) {
            // Yjs 데이터가 없으면 JSON 데이터에서 가져오기
            meta.layer_data.brushStrokes.forEach((stroke: any) => {
              if (!stroke.points || stroke.points.length < 1) return;
              const color = parseInt(
                stroke.brushSettings?.color?.replace("#", "") || "000000",
                16
              );

              g.setStrokeStyle({
                width: stroke.brushSettings?.radius || 5,
                color,
                alpha: g.alpha,
              });
              g.beginPath();
              g.moveTo(stroke.points[0].x, stroke.points[0].y);

              for (let i = 1; i < stroke.points.length; i++) {
                g.lineTo(stroke.points[i].x, stroke.points[i].y);
              }

              g.stroke();
            });
          }
        }
      });

      // 5. 다른 사용자들이 현재 그리고 있는 스트로크 그리기 (Awareness)
      awarenessStates.forEach((state, clientId) => {
        if (clientId !== myClientId && state.user && state.drawingStroke) {
          const stroke = state.drawingStroke as StrokeShape;
          if (!stroke.points || stroke.points.length < 1) return;

          // 현재 활성 레이어가 숨겨져 있으면 건너뛰기
          if (stroke.layerId && !layerVisibility[stroke.layerId]) return;

          const color = parseInt(state.user!.color.replace("#", ""), 16);
          g.setStrokeStyle({ width: stroke.size, color, alpha: 0.7 });
          g.beginPath();
          g.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            g.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          g.stroke();
        }
      });
    },
    [
      layerStates,
      layerMetadatas,
      selectedCanvasId,
      awarenessStates,
      myClientId,
      renderVersion,
      layerVisibility,
    ]
  );

  return <pixiGraphics draw={draw} />;
};

// 텍스트 렌더링을 위한 별도 컴포넌트
const TextLayer = ({
  layerVisibility,
}: {
  layerVisibility: Record<string, boolean>;
}) => {
  const { selectedCanvasId, projectData } = useSocketStore();
  const [textVersion, setTextVersion] = useState(0);

  // 텍스트 데이터 변경 감지
  useEffect(() => {
    setTextVersion((v) => v + 1);
  }, [projectData]);

  // 계층구조 데이터에서 레이어 메타데이터 추출
  const layerMetadatas =
    projectData?.pages?.flatMap(
      (page) =>
        page.canvases?.flatMap(
          (canvas) =>
            canvas.layers?.map((layer) => ({
              ...layer,
              canvasId: canvas.id,
              _id: layer.id,
              isVisible: layer.visible,
              opacity: layer.opacity,
            })) || []
        ) || []
    ) || [];

  if (!selectedCanvasId) return null;

  // 현재 캔버스에 속한 텍스트 레이어만 필터링
  const textLayers = layerMetadatas.filter(
    (meta) =>
      meta.canvasId === selectedCanvasId &&
      meta.type === "text" &&
      meta.isVisible &&
      layerVisibility[meta._id] !== false
  );

  // 디버깅 로그 제거 (성능 최적화)

  return (
    <>
      {textLayers.map((meta) => {
        if (!meta.layer_data?.textObjects) return null;

        return meta.layer_data.textObjects.map(
          (textObj: any, index: number) => (
            <pixiText
              key={`${meta._id}-${textObj.id || index}-${textVersion}`}
              text={textObj.content || "새 텍스트"}
              x={textObj.position?.x || 100}
              y={textObj.position?.y || 100}
              style={{
                fontSize: textObj.style?.size || 16,
                fill: textObj.style?.color || "#000000",
                fontFamily: textObj.style?.font || "Arial",
                // alpha: (meta.opacity || 100) / 100,
              }}
            />
          )
        );
      })}
    </>
  );
};

// 마우스/포인터 이벤트를 처리하는 컨테이너 컴포넌트
const DrawingContainer = ({
  width,
  height,
  layerVisibility,
}: {
  width: number;
  height: number;
  layerVisibility: Record<string, boolean>;
}) => {
  const {
    yjsStatus,
    startStroke,
    addPointToStroke,
    endStroke,
    updateMyCursor,
    isLayerConnected,
  } = useYjsStore();
  const { selectedLayerId } = useSocketStore(); // 현재 활성화된 레이어 ID
  const [isDrawing, setIsDrawing] = useState(false);

  const handlePointerDown = (e: PIXI.FederatedPointerEvent) => {
    if (
      yjsStatus !== "connected" ||
      !selectedLayerId ||
      !isLayerConnected(selectedLayerId)
    )
      return;
    setIsDrawing(true);
    const { x, y } = e.global;
    // ✨ Yjs 액션 호출 시 selectedLayerId 전달
    startStroke(selectedLayerId, x, y, e.pressure || 0.5, "#000000", 5);
  };

  const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
    if (yjsStatus !== "connected") return;
    const { x, y } = e.global;
    updateMyCursor({ x, y });
    if (isDrawing && selectedLayerId && isLayerConnected(selectedLayerId)) {
      // ✨ Yjs 액션 호출 시 selectedLayerId 전달
      addPointToStroke(selectedLayerId, x, y, e.pressure || 0.5);
    }
  };

  const handlePointerUp = () => {
    if (yjsStatus !== "connected") return;
    setIsDrawing(false);
    endStroke();
  };

  const handlePointerOut = () => {
    updateMyCursor(null);
  };

  return (
    <pixiContainer
      eventMode="static"
      hitArea={new PIXI.Rectangle(0, 0, width, height)}
      cursor={isDrawing ? "crosshair" : "auto"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      onPointerOut={handlePointerOut}
    >
      <DrawingLayer layerVisibility={layerVisibility} />
      <TextLayer layerVisibility={layerVisibility} />
    </pixiContainer>
  );
};

// 최상위 Pixi 애플리케이션 컴포넌트
export const PixiCanvas = ({
  width = 1200,
  height = 1200,
  layerVisibility = {},
}: {
  width?: number;
  height?: number;
  layerVisibility?: Record<string, boolean>;
}) => {
  return (
    <Application
      width={width}
      height={height}
      backgroundColor={0xffffff}
      antialias
    >
      <DrawingContainer
        width={width}
        height={height}
        layerVisibility={layerVisibility}
      />
    </Application>
  );
};

export default PixiCanvas;
