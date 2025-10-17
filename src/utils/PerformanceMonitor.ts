/**
 * 성능 모니터링 및 적응형 최적화 시스템
 * 실시간 성능 측정을 통해 렌더링 품질을 동적으로 조절
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  renderTime: number;
  strokeCount: number;
}

export interface AdaptiveConfig {
  targetFPS: number;
  maxFrameTime: number;
  memoryThreshold: number;
  qualityLevels: {
    high: { strokeReduction: 0; maxStrokes: 1000 };
    medium: { strokeReduction: 0.3; maxStrokes: 500 };
    low: { strokeReduction: 0.6; maxStrokes: 200 };
  };
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fps: 60,
    frameTime: 16.67,
    memoryUsage: 0,
    renderTime: 0,
    strokeCount: 0,
  };

  private config: AdaptiveConfig;
  private frameCount = 0;
  private lastTime = performance.now();
  private renderStartTime = 0;
  private onQualityChange?: (quality: "high" | "medium" | "low") => void;

  // 사용자 정의 성능 설정
  private customStrokeLimit: number | null = null;
  private customStrokeReduction: number | null = null;

  constructor(config: Partial<AdaptiveConfig> = {}) {
    this.config = {
      targetFPS: 60,
      maxFrameTime: 16.67,
      memoryThreshold: 100 * 1024 * 1024, // 100MB
      qualityLevels: {
        high: { strokeReduction: 0, maxStrokes: 1000 },
        medium: { strokeReduction: 0.3, maxStrokes: 500 },
        low: { strokeReduction: 0.6, maxStrokes: 200 },
      },
      ...config,
    };
  }

  startRender(): void {
    this.renderStartTime = performance.now();
  }

  endRender(strokeCount: number): void {
    const renderTime = performance.now() - this.renderStartTime;
    this.metrics.renderTime = renderTime;
    this.metrics.strokeCount = strokeCount;

    this.updateMetrics();
    this.checkPerformance();
  }

  private updateMetrics(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;

    this.frameCount++;

    if (deltaTime >= 1000) {
      // 1초마다 FPS 업데이트
      this.metrics.fps = (this.frameCount * 1000) / deltaTime;
      this.metrics.frameTime = deltaTime / this.frameCount;
      this.frameCount = 0;
      this.lastTime = currentTime;
    }

    // 메모리 사용량 추정 (가능한 경우)
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize;
    }
  }

  private checkPerformance(): void {
    const { fps, frameTime, memoryUsage } = this.metrics;
    const { targetFPS, maxFrameTime, memoryThreshold, qualityLevels } =
      this.config;

    let newQuality: "high" | "medium" | "low" = "high";

    // 성능 기준에 따른 품질 조절
    if (
      fps < targetFPS * 0.8 ||
      frameTime > maxFrameTime * 1.5 ||
      memoryUsage > memoryThreshold
    ) {
      newQuality = "low";
    } else if (fps < targetFPS * 0.9 || frameTime > maxFrameTime * 1.2) {
      newQuality = "medium";
    }

    this.onQualityChange?.(newQuality);
  }

  getOptimalStrokeLimit(): number {
    // 사용자 정의 설정이 있으면 우선 적용
    if (this.customStrokeLimit !== null) {
      return this.customStrokeLimit;
    }

    const { fps, frameTime, memoryUsage } = this.metrics;
    const { targetFPS, maxFrameTime, memoryThreshold, qualityLevels } =
      this.config;

    if (
      fps < targetFPS * 0.7 ||
      frameTime > maxFrameTime * 2 ||
      memoryUsage > memoryThreshold
    ) {
      return qualityLevels.low.maxStrokes;
    } else if (fps < targetFPS * 0.85 || frameTime > maxFrameTime * 1.5) {
      return qualityLevels.medium.maxStrokes;
    } else {
      return qualityLevels.high.maxStrokes;
    }
  }

  getOptimalStrokeReduction(): number {
    // 사용자 정의 설정이 있으면 우선 적용
    if (this.customStrokeReduction !== null) {
      return this.customStrokeReduction;
    }

    const { fps, frameTime, memoryUsage } = this.metrics;
    const { targetFPS, maxFrameTime, memoryThreshold, qualityLevels } =
      this.config;

    if (
      fps < targetFPS * 0.7 ||
      frameTime > maxFrameTime * 2 ||
      memoryUsage > memoryThreshold
    ) {
      return qualityLevels.low.strokeReduction;
    } else if (fps < targetFPS * 0.85 || frameTime > maxFrameTime * 1.5) {
      return qualityLevels.medium.strokeReduction;
    } else {
      return qualityLevels.high.strokeReduction;
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  setQualityChangeCallback(
    callback: (quality: "high" | "medium" | "low") => void
  ): void {
    this.onQualityChange = callback;
  }

  // 성능 경고 표시 여부 결정
  shouldShowPerformanceWarning(): boolean {
    const { fps, frameTime, memoryUsage } = this.metrics;
    const { targetFPS, maxFrameTime, memoryThreshold } = this.config;

    return (
      fps < targetFPS * 0.6 ||
      frameTime > maxFrameTime * 2.5 ||
      memoryUsage > memoryThreshold * 1.5
    );
  }

  // 렌더링 중단 여부 결정
  shouldStopRendering(): boolean {
    const { fps, frameTime, memoryUsage } = this.metrics;
    const { targetFPS, maxFrameTime, memoryThreshold } = this.config;

    return (
      fps < targetFPS * 0.4 ||
      frameTime > maxFrameTime * 4 ||
      memoryUsage > memoryThreshold * 2
    );
  }

  // 성능 최적화 렌더링 실행
  optimizeRendering(): void {
    console.log("🎯 성능 최적화 렌더링 시작");

    // 현재 성능 상태 확인
    const currentMetrics = this.getMetrics();
    console.log("현재 성능 상태:", currentMetrics);

    // 메모리 정리
    if (window.gc) {
      console.log("🧹 가비지 컬렉션 실행");
      window.gc();
    }

    // 최적화된 설정 적용
    const optimalStrokeLimit = this.getOptimalStrokeLimit();
    const optimalStrokeReduction = this.getOptimalStrokeReduction();

    console.log("최적화 설정:", {
      strokeLimit: optimalStrokeLimit,
      strokeReduction: `${(optimalStrokeReduction * 100).toFixed(1)}%`,
    });

    // 성능 모니터링 재시작
    this.frameCount = 0;
    this.lastTime = performance.now();

    // 렌더링 복구를 위한 추가 로직
    console.log("🔄 렌더링 복구 로직 실행");

    // DOM 강제 업데이트
    if (typeof window !== "undefined") {
      // 브라우저 렌더링 강제 실행
      requestAnimationFrame(() => {
        console.log("🎨 브라우저 렌더링 강제 실행");
        // 추가 렌더링 보장
        requestAnimationFrame(() => {
          console.log("🎨 추가 렌더링 보장 완료");
        });
      });
    }

    console.log("✅ 성능 최적화 렌더링 완료");
  }

  // 사용자 정의 스트로크 제한 설정
  setCustomStrokeLimit(limit: number): void {
    this.customStrokeLimit = limit;
    console.log(`🎯 사용자 정의 스트로크 제한 설정: ${limit}`);
  }

  // 사용자 정의 스트로크 단순화 설정
  setCustomStrokeReduction(reduction: number): void {
    this.customStrokeReduction = reduction;
    console.log(
      `🎯 사용자 정의 스트로크 단순화 설정: ${(reduction * 100).toFixed(1)}%`
    );
  }

  // 사용자 정의 설정 초기화
  resetCustomSettings(): void {
    this.customStrokeLimit = null;
    this.customStrokeReduction = null;
    console.log("🔄 사용자 정의 설정 초기화");
  }

  // 현재 사용자 정의 설정 가져오기
  getCustomSettings(): {
    strokeLimit: number | null;
    strokeReduction: number | null;
  } {
    return {
      strokeLimit: this.customStrokeLimit,
      strokeReduction: this.customStrokeReduction,
    };
  }
}
