/**
 * 뷰포트 컬링을 위한 유틸리티 클래스
 * 화면에 보이는 객체만 렌더링하여 성능 최적화
 */

import * as PIXI from "pixi.js";

export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ViewportCulling {
  private viewport: ViewportBounds;
  private margin: number; // 뷰포트 경계에서 여유 공간

  constructor(margin: number = 100) {
    this.margin = margin;
    this.viewport = { x: 0, y: 0, width: 0, height: 0 };
  }

  updateViewport(x: number, y: number, width: number, height: number): void {
    this.viewport = {
      x: x - this.margin,
      y: y - this.margin,
      width: width + this.margin * 2,
      height: height + this.margin * 2,
    };
  }

  isInViewport(bounds: PIXI.Rectangle): boolean {
    return !(
      bounds.x > this.viewport.x + this.viewport.width ||
      bounds.x + bounds.width < this.viewport.x ||
      bounds.y > this.viewport.y + this.viewport.height ||
      bounds.y + bounds.height < this.viewport.y
    );
  }

  getVisibleObjects<T extends PIXI.Container>(
    objects: T[],
    getBounds: (obj: T) => PIXI.Rectangle
  ): T[] {
    return objects.filter((obj) => {
      const bounds = getBounds(obj);
      return this.isInViewport(bounds);
    });
  }

  // 스트로크 포인트 기반 뷰포트 컬링
  isInViewport(
    points: { x: number; y: number }[],
    viewport: { x: number; y: number; width: number; height: number }
  ): boolean {
    if (points.length === 0) return false;

    // 스트로크의 바운딩 박스 계산
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // 뷰포트와 교차하는지 확인 (여유 공간 추가)
    const margin = 50; // 화면 가장자리에서 50px 여유
    return !(
      maxX < viewport.x - margin ||
      minX > viewport.x + viewport.width + margin ||
      maxY < viewport.y - margin ||
      minY > viewport.y + viewport.height + margin
    );
  }

  destroy() {
    // 정리 작업
  }
}
