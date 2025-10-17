/**
 * PIXI.js 객체 풀링을 위한 유틸리티 클래스
 * 대용량 스트로크 데이터의 메모리 할당/해제를 최적화
 */

import * as PIXI from "pixi.js";

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(createFn: () => T, resetFn: (obj: T) => void) {
    this.createFn = createFn;
    this.resetFn = resetFn;
  }

  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }

  clear(): void {
    this.pool.length = 0;
  }
}

// PIXI Graphics 객체 풀링
export const graphicsPool = new ObjectPool(
  () => new PIXI.Graphics(),
  (graphics) => {
    graphics.clear();
    graphics.removeChildren();
  }
);

// PIXI Container 객체 풀링
export const containerPool = new ObjectPool(
  () => new PIXI.Container(),
  (container) => {
    container.removeChildren();
    container.visible = true;
    container.alpha = 1;
  }
);
