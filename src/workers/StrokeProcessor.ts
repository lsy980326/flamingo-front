/**
 * Web Worker를 사용한 스트로크 데이터 백그라운드 처리
 * 메인 스레드를 블로킹하지 않고 대용량 데이터 처리
 */

export interface StrokeProcessingMessage {
  type: "PROCESS_STROKES" | "PROCESS_COMPLETE" | "ERROR" | "PROGRESS";
  data?: {
    strokes?: StrokeData[];
    config?: StrokeProcessingConfig;
  };
  strokes?: StrokeData[];
  id?: string;
  progress?: number;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface StrokeData {
  points: { x: number; y: number; pressure?: number }[];
  color: string;
  size: number;
  layerId?: string;
  [key: string]: unknown;
}

export interface StrokeProcessingConfig {
  chunkSize: number;
  quality: "high" | "medium" | "low";
  viewport: { x: number; y: number; width: number; height: number };
  scale: number;
}

// 스트로크 데이터 처리 함수 (청크 기반)
function processStrokesChunked(
  strokes: StrokeData[],
  config: StrokeProcessingConfig,
  onProgress?: (progress: number) => void
): StrokeData[] {
  const { chunkSize, quality, viewport, scale } = config;
  const results: StrokeData[] = [];

  // 청크 단위로 처리
  for (let i = 0; i < strokes.length; i += chunkSize) {
    const chunk = strokes.slice(i, i + chunkSize);
    const processedChunk = processStrokes(chunk, quality, viewport, scale);
    results.push(...processedChunk);

    // 진행률 업데이트
    const progress = ((i + chunkSize) / strokes.length) * 100;
    onProgress?.(Math.min(progress, 100));
  }

  return results;
}

// 스트로크 데이터 처리 함수
function processStrokes(
  strokes: StrokeData[],
  quality: "high" | "medium" | "low" = "high",
  viewport?: { x: number; y: number; width: number; height: number },
  scale: number = 1
): StrokeData[] {
  return strokes
    .map((stroke) => {
      // 뷰포트 컬링: 화면에 보이는 스트로크만 처리
      if (viewport && !isStrokeInViewport(stroke, viewport)) {
        return null; // 필터링
      }

      // 품질에 따른 최적화
      const optimizationLevel = getOptimizationLevel(quality);

      const optimizedStroke: StrokeData = {
        ...stroke,
        points: optimizePoints(stroke.points || [], optimizationLevel, scale),
      };

      return optimizedStroke;
    })
    .filter((stroke): stroke is StrokeData => stroke !== null); // null 값 제거
}

// 뷰포트 내 스트로크 확인
function isStrokeInViewport(
  stroke: StrokeData,
  viewport: { x: number; y: number; width: number; height: number }
): boolean {
  if (!stroke.points || stroke.points.length === 0) return false;

  const points = stroke.points;
  const margin = 50; // 여유 공간

  // 스트로크의 바운딩 박스 계산
  let minX = points[0].x,
    maxX = points[0].x;
  let minY = points[0].y,
    maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  // 뷰포트와 교차하는지 확인
  return !(
    maxX < viewport.x - margin ||
    minX > viewport.x + viewport.width + margin ||
    maxY < viewport.y - margin ||
    minY > viewport.y + viewport.height + margin
  );
}

// 품질에 따른 최적화 레벨 설정
function getOptimizationLevel(quality: "high" | "medium" | "low") {
  switch (quality) {
    case "high":
      return { tolerance: 0.5, maxPoints: 1000 };
    case "medium":
      return { tolerance: 1.0, maxPoints: 500 };
    case "low":
      return { tolerance: 2.0, maxPoints: 200 };
    default:
      return { tolerance: 1.0, maxPoints: 500 };
  }
}

// 포인트 데이터 최적화 (개선된 버전)
function optimizePoints(
  points: { x: number; y: number; pressure?: number }[],
  optimizationLevel: { tolerance: number; maxPoints: number },
  scale: number = 1
): { x: number; y: number; pressure?: number }[] {
  if (points.length <= 2) return points;

  // 스케일에 따른 톨러런스 조정
  const adjustedTolerance = optimizationLevel.tolerance / scale;

  // 최대 포인트 수 제한
  if (points.length <= optimizationLevel.maxPoints) {
    return douglasPeucker(points, adjustedTolerance);
  }

  // 포인트 수가 많으면 먼저 간단히 줄이기
  const step = Math.ceil(points.length / optimizationLevel.maxPoints);
  const sampledPoints = points.filter((_, index) => index % step === 0);

  return douglasPeucker(sampledPoints, adjustedTolerance);
}

// Douglas-Peucker 알고리즘 구현
function douglasPeucker(
  points: { x: number; y: number; pressure?: number }[],
  tolerance: number
): { x: number; y: number; pressure?: number }[] {
  if (points.length <= 2) return points;

  const start = points[0];
  const end = points[points.length - 1];

  let maxDistance = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
}

function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) return Math.sqrt(A * A + B * B);

  const param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

// Web Worker 메시지 처리 (개선된 버전)
self.onmessage = function (e: MessageEvent<StrokeProcessingMessage>) {
  try {
    if (e.data.type === "PROCESS_STROKES") {
      const { strokes, config } = e.data.data || {};

      if (!strokes || !config) {
        throw new Error("Invalid processing data");
      }

      // 청크 기반 처리
      const processedStrokes = processStrokesChunked(
        strokes,
        config,
        (progress) => {
          // 진행률 업데이트
          self.postMessage({
            type: "PROGRESS",
            progress,
            id: e.data.id,
          });
        }
      );

      self.postMessage({
        type: "PROCESS_COMPLETE",
        data: processedStrokes,
        id: e.data.id,
      });
    }
  } catch (error) {
    console.error("Worker processing error:", error);
    self.postMessage({
      type: "ERROR",
      data: error instanceof Error ? error.message : "Unknown error",
      id: e.data.id,
    });
  }
};
