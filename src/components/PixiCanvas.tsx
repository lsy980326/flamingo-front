import React, { useCallback, useEffect, useState } from "react";
import { Application, extend } from "@pixi/react";
import * as PIXI from "pixi.js";
import * as Y from "yjs";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore"; // 메타데이터를 위한 스토어
import type { Layer } from "../types";

// Pixi 객체들을 React 컴포넌트로 사용할 수 있도록 확장
extend({ Container: PIXI.Container, Graphics: PIXI.Graphics });

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
interface ExtendedLayerMeta extends Layer {
  opacity?: number;
  isVisible?: boolean;
}

// 모든 레이어의 그림 데이터를 렌더링하는 컴포넌트
const DrawingLayer = ({
  layerVisibility,
}: {
  layerVisibility: Record<string, boolean>;
}) => {
  // 1. Yjs로부터 레이어별 그림 데이터를 가져옴
  const layerStates = useYjsStore((state) => state.layerStates);
  const awarenessStates = useYjsStore((state) => state.awarenessStates);
  const myClientId = useYjsStore((state) =>
    state.awarenessStates.size > 0
      ? Array.from(state.awarenessStates.keys())[0]
      : null
  );

  // 2. 메인 소켓으로부터 구조/속성 데이터(메타데이터)를 가져옴
  const { selectedCanvasId, allData } = useSocketStore();
  const layerMetadatas = allData.layers as unknown as ExtendedLayerMeta[];

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
  }, [layerStates, forceUpdate]); // forceUpdate 추가하여 버전 복구 시 강제 업데이트

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();

      if (!selectedCanvasId || layerStates.size === 0) return;

      // forceUpdate 값이 변경되면 강제로 다시 그리기
      console.log(`[PixiCanvas] Drawing with forceUpdate: ${forceUpdate}`);

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

        // 해당 레이어의 Yjs 상태가 있는지 확인
        const layerState = layerStates.get(meta._id);
        if (!layerState) return; // 아직 연결되지 않은 레이어는 건너뛰기

        const strokesArray = layerState.strokes;
        const allStrokes = strokesArray
          ? strokesArray.toArray().map(yStrokeToObj)
          : [];

        // 레이어 속성 적용
        const opacity = meta.opacity ?? 100;
        g.alpha = opacity / 100;

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
    <Application width={width} height={height} background={0xffffff} antialias>
      <DrawingContainer
        width={width}
        height={height}
        layerVisibility={layerVisibility}
      />
    </Application>
  );
};

export default PixiCanvas;
