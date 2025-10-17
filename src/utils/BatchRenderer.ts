/**
 * PIXI.js 배칭 렌더링을 위한 유틸리티 클래스
 * 여러 스트로크를 하나의 Graphics 객체로 묶어서 렌더링 성능 최적화
 */

import * as PIXI from "pixi.js";

export interface StrokeData {
  points: { x: number; y: number; pressure?: number }[];
  color: string;
  size: number;
}

export class BatchRenderer {
  private batchSize: number;
  private currentBatch: PIXI.Graphics[] = [];
  private batches: PIXI.Container[] = [];

  constructor(batchSize: number = 100) {
    this.batchSize = batchSize;
  }

  addStroke(strokeData: StrokeData): void {
    // 현재 배치가 가득 찼으면 새 배치 생성
    if (this.currentBatch.length >= this.batchSize) {
      this.finalizeBatch();
    }

    // Graphics 객체 생성 및 스트로크 그리기
    const graphics = new PIXI.Graphics();
    this.drawStroke(graphics, strokeData);
    this.currentBatch.push(graphics);
  }

  private drawStroke(graphics: PIXI.Graphics, strokeData: StrokeData): void {
    const { points, color, size } = strokeData;

    if (points.length < 2) return;

    graphics.lineStyle(size, PIXI.utils.string2hex(color), 1);
    graphics.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      graphics.lineTo(point.x, point.y);
    }
  }

  private finalizeBatch(): void {
    if (this.currentBatch.length === 0) return;

    // 배치 컨테이너 생성
    const batchContainer = new PIXI.Container();
    this.currentBatch.forEach((graphics) => {
      batchContainer.addChild(graphics);
    });

    this.batches.push(batchContainer);
    this.currentBatch = [];
  }

  getBatches(): PIXI.Container[] {
    // 마지막 배치도 완료
    this.finalizeBatch();
    return this.batches;
  }

  // 배치 렌더링 실행
  renderBatch(graphics: PIXI.Graphics, strokes: any[]): void {
    // console.log(`[BatchRenderer] Rendering ${strokes.length} strokes`);

    if (strokes.length === 0) {
      console.log(`[BatchRenderer] No strokes to render`);
      return;
    }

    // 스트로크를 색상별로 그룹화
    const strokeGroups = new Map<string, any[]>();

    strokes.forEach((stroke) => {
      const color = stroke.strokeColor || stroke.color || "#000000";
      if (!strokeGroups.has(color)) {
        strokeGroups.set(color, []);
      }
      strokeGroups.get(color)!.push(stroke);
    });

    // console.log(`[BatchRenderer] Created ${strokeGroups.size} color groups`);

    // 각 그룹별로 배치 렌더링
    strokeGroups.forEach((groupStrokes, color) => {
      // console.log(
      //   `[BatchRenderer] Rendering ${groupStrokes.length} strokes with color ${color}`
      // );

      graphics.lineStyle(0); // 기본 라인 스타일 리셋

      groupStrokes.forEach((stroke, index) => {
        if (stroke.points && stroke.points.length > 0) {
          const strokeWidth = stroke.strokeWidth || stroke.size || 2;
          const strokeColor = stroke.strokeColor || stroke.color || "#000000";
          const opacity = stroke.opacity || 1;

          // 기존 PixiCanvas와 동일한 방식 사용
          const color = parseInt(strokeColor.replace("#", ""), 16);
          graphics.setStrokeStyle({
            width: strokeWidth,
            color,
            alpha: opacity,
          });
          graphics.beginPath();
          graphics.moveTo(stroke.points[0].x, stroke.points[0].y);

          for (let i = 1; i < stroke.points.length; i++) {
            graphics.lineTo(stroke.points[i].x, stroke.points[i].y);
          }

          graphics.stroke();

          // if (index < 3) {
          //   // 처음 3개 스트로크만 로깅
          //   console.log(
          //     `[BatchRenderer] Stroke ${index}: ${stroke.points.length} points, color: ${strokeColor}, width: ${strokeWidth}`
          //   );
          // }
        }
      });
    });

    // console.log(`[BatchRenderer] Batch rendering completed`);
  }

  clear(): void {
    this.batches.forEach((batch) => batch.destroy());
    this.batches = [];
    this.currentBatch = [];
  }

  destroy(): void {
    this.clear();
  }
}
