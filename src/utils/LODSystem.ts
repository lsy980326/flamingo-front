/**
 * LOD (Level of Detail) 시스템
 * 줌 레벨에 따라 다른 해상도로 렌더링하여 성능 최적화
 */

import * as PIXI from "pixi.js";

export interface LODLevel {
  minScale: number;
  maxScale: number;
  strokeReduction: number; // 스트로크 포인트 감소 비율 (0-1)
  detailLevel: "high" | "medium" | "low";
}

export class LODSystem {
  private lodLevels: LODLevel[] = [
    { minScale: 0, maxScale: 0.5, strokeReduction: 0.8, detailLevel: "low" },
    {
      minScale: 0.5,
      maxScale: 1.5,
      strokeReduction: 0.5,
      detailLevel: "medium",
    },
    {
      minScale: 1.5,
      maxScale: Infinity,
      strokeReduction: 0,
      detailLevel: "high",
    },
  ];

  getCurrentLODLevel(scale: number): LODLevel {
    return (
      this.lodLevels.find(
        (level) => scale >= level.minScale && scale < level.maxScale
      ) || this.lodLevels[this.lodLevels.length - 1]
    );
  }

  reduceStrokePoints(
    points: { x: number; y: number; pressure?: number }[],
    scale: number
  ): { x: number; y: number; pressure?: number }[] {
    const lodLevel = this.getCurrentLODLevel(scale);

    if (lodLevel.strokeReduction === 0) {
      return points; // 감소 없음
    }

    const reductionFactor = Math.floor(
      points.length * lodLevel.strokeReduction
    );
    const step = Math.max(
      1,
      Math.floor(points.length / (points.length - reductionFactor))
    );

    return points.filter((_, index) => index % step === 0);
  }

  shouldRenderStroke(
    strokeData: any,
    scale: number,
    _viewport: PIXI.Rectangle
  ): boolean {
    const lodLevel = this.getCurrentLODLevel(scale);

    // 낮은 해상도에서는 작은 스트로크는 렌더링하지 않음
    if (lodLevel.detailLevel === "low") {
      const strokeSize = this.calculateStrokeSize(strokeData);
      return strokeSize > 2; // 2px 이상인 스트로크만 렌더링
    }

    return true;
  }

  private calculateStrokeSize(strokeData: any): number {
    // 스트로크의 크기를 계산하는 로직
    if (strokeData.points && strokeData.points.length > 0) {
      const bounds = this.getStrokeBounds(strokeData.points);
      return Math.max(bounds.width, bounds.height);
    }
    return strokeData.size || 1;
  }

  private getStrokeBounds(points: { x: number; y: number }[]): {
    width: number;
    height: number;
  } {
    if (points.length === 0) return { width: 0, height: 0 };

    let minX = points[0].x,
      maxX = points[0].x;
    let minY = points[0].y,
      maxY = points[0].y;

    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });

    return {
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  destroy() {
    // 정리 작업
  }
}
