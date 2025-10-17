import { useCallback, useEffect, useRef } from "react";
import { Application, extend } from "@pixi/react";
import * as PIXI from "pixi.js";
import * as Y from "yjs";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore";
import { ChunkedLoader } from "../utils/ChunkedLoader";
import { PerformanceMonitor } from "../utils/PerformanceMonitor";
import { LODSystem } from "../utils/LODSystem";
import { ViewportCulling } from "../utils/ViewportCulling";
import { graphicsPool } from "../utils/ObjectPool";

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
  layerId?: string;
};

// 최적화된 레이어 렌더링 컴포넌트
const OptimizedDrawingLayer = ({
  layerVisibility,
  viewport,
  scale,
}: {
  layerVisibility: Record<string, boolean>;
  viewport: { x: number; y: number; width: number; height: number };
  scale: number;
}) => {
  const layerStates = useYjsStore((state) => state.layerStates);
  const { selectedCanvasId, projectData } = useSocketStore();

  // 성능 최적화 시스템들
  const performanceMonitor = useRef(new PerformanceMonitor());
  const lodSystem = useRef(new LODSystem());
  const viewportCulling = useRef(new ViewportCulling());
  // 청크 로더는 향후 확장을 위해 유지
  // const chunkedLoader = useRef(
  //   new ChunkedLoader({
  //     chunkSize: 30, // 30개씩 처리
  //     delayMs: 8, // 8ms 지연 (120fps 유지)
  //     maxConcurrentChunks: 3,
  //   })
  // );

  // 렌더링 상태 관리 (현재 사용하지 않지만 향후 확장을 위해 유지)
  // const [isLoading, setIsLoading] = useState(false);
  // const [loadingProgress, setLoadingProgress] = useState(0);
  // const [renderedStrokes, setRenderedStrokes] = useState<Map<string, any[]>>(new Map());
  // const [currentQuality, setCurrentQuality] = useState<'high' | 'medium' | 'low'>('high');

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

  // 현재 캔버스에 속한 레이어 메타데이터만 필터링하고 순서대로 정렬
  const targetLayersMeta = layerMetadatas
    .filter((meta) => meta.canvasId === selectedCanvasId)
    .sort((a, b) => a.order - b.order);

  // 뷰포트 업데이트
  useEffect(() => {
    viewportCulling.current.updateViewport(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height
    );
  }, [viewport]);

  // 성능 모니터링 설정
  useEffect(() => {
    // performanceMonitor.current.setQualityChangeCallback(setCurrentQuality);
  }, []);

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      if (!selectedCanvasId || layerStates.size === 0) {
        return;
      }

      // 성능 모니터링 시작
      performanceMonitor.current.startRender();

      let totalRenderedStrokes = 0;
      const maxStrokesPerFrame =
        performanceMonitor.current.getOptimalStrokeLimit();

      // 모든 레이어를 순서대로 처리
      targetLayersMeta.forEach((meta) => {
        const isVisible = layerVisibility[meta._id] !== false;
        const isUserVisible = meta.isVisible !== false;

        if (!isVisible || !isUserVisible) return;

        // 브러시 레이어인 경우 스트로크 렌더링
        if (meta.type === "brush") {
          const layerState = layerStates.get(meta._id);

          if (layerState) {
            const strokesArray = layerState.strokes;
            const allStrokes = strokesArray
              ? strokesArray.toArray().map(yStrokeToObj)
              : [];

            // 성능 기반 스트로크 제한
            const maxStrokes = Math.min(maxStrokesPerFrame, allStrokes.length);
            const strokesToRender = allStrokes.slice(-maxStrokes);

            // 이 레이어의 스트로크 그리기 (최적화된 배치 처리)
            const graphics = graphicsPool.get();

            try {
              strokesToRender.forEach((stroke) => {
                // 성능 모니터링: 렌더링 중단 체크
                if (performanceMonitor.current.shouldStopRendering()) {
                  return;
                }

                if (!stroke.points || stroke.points.length < 1) return;

                // 뷰포트 컬링: 화면에 보이는 스트로크만 렌더링
                if (
                  !viewportCulling.current.isInViewport(stroke.points, viewport)
                ) {
                  return;
                }

                // LOD 시스템 적용
                const optimizedPoints = lodSystem.current.reduceStrokePoints(
                  stroke.points,
                  scale
                );

                // 스트로크 렌더링
                const color = parseInt(stroke.color.replace("#", ""), 16);
                graphics.setStrokeStyle({
                  width: stroke.size,
                  color,
                  alpha: g.alpha,
                });
                graphics.beginPath();
                graphics.moveTo(optimizedPoints[0].x, optimizedPoints[0].y);

                for (let i = 1; i < optimizedPoints.length; i++) {
                  graphics.lineTo(optimizedPoints[i].x, optimizedPoints[i].y);
                }

                graphics.stroke();
                totalRenderedStrokes++;
              });

              // 배치 렌더링: 모든 스트로크를 한 번에 그리기
              g.addChild(graphics);
            } finally {
              graphicsPool.release(graphics);
            }
          } else if (meta.layer_data?.brushStrokes) {
            // JSON 데이터 처리 (기존 로직 유지)
            meta.layer_data.brushStrokes.forEach((stroke: StrokeShape) => {
              if (!stroke.points || stroke.points.length < 1) return;

              // 뷰포트 컬링
              if (
                !viewportCulling.current.isInViewport(stroke.points, viewport)
              ) {
                return;
              }

              const color = parseInt(
                stroke.brushSettings?.color?.replace("#", "") || "000000",
                16
              );

              g.setStrokeStyle({
                width: stroke.brushSettings?.size || 2,
                color,
                alpha: g.alpha,
              });
              g.beginPath();
              g.moveTo(stroke.points[0].x, stroke.points[0].y);

              for (let i = 1; i < stroke.points.length; i++) {
                g.lineTo(stroke.points[i].x, stroke.points[i].y);
              }

              g.stroke();
              totalRenderedStrokes++;
            });
          }
        }
      });

      // 성능 모니터링 종료
      performanceMonitor.current.endRender(totalRenderedStrokes);
    },
    [
      selectedCanvasId,
      layerStates,
      layerVisibility,
      targetLayersMeta,
      viewport,
      scale,
    ]
  );

  return <pixiGraphics draw={draw} />;
};

// 메인 최적화된 PixiCanvas 컴포넌트
export const OptimizedPixiCanvas: React.FC<{
  layerVisibility: Record<string, boolean>;
  viewport: { x: number; y: number; width: number; height: number };
  scale: number;
}> = ({ layerVisibility, viewport, scale }) => {
  return (
    <Application
      width={viewport.width}
      height={viewport.height}
      backgroundColor={0xffffff}
      antialias
    >
      <OptimizedDrawingLayer
        layerVisibility={layerVisibility}
        viewport={viewport}
        scale={scale}
      />
    </Application>
  );
};
