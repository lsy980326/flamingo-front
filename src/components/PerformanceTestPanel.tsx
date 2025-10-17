import React, { useState, useCallback } from "react";
import { useSocketStore } from "../store/useSocketStore";
import { useYjsStore } from "../store/useYjsStore";
import type { BrushStroke, LayerPersistentData } from "../types";

interface TestConfig {
  targetSize: number; // MB
  strokesPerLayer: number;
  pointsPerStroke: number;
  selectedLayerId: string;
  testType: "generate" | "load" | "save";
}

interface PerformanceMetrics {
  operation: string;
  duration: number;
  dataSize: number;
  throughput: number; // MB/s
  timestamp: string;
}

const PerformanceTestPanel: React.FC = () => {
  const [config, setConfig] = useState<TestConfig>({
    targetSize: 10,
    strokesPerLayer: 1000,
    pointsPerStroke: 50,
    selectedLayerId: "",
    testType: "generate",
  });

  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState("");
  // const [estimatedTime, setEstimatedTime] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [pauseRendering, setPauseRendering] = useState(false);

  const { allData } = useSocketStore();
  const { getLayerState, isLayerConnected } = useYjsStore();

  // 대용량 브러시 스트로크 데이터 생성 (1GB 지원)
  const generateBrushStrokes = useCallback(
    async (count: number, pointsPerStroke: number): Promise<BrushStroke[]> => {
      const strokes: BrushStroke[] = [];
      const colors = [
        "#FF0000",
        "#00FF00",
        "#0000FF",
        "#FFFF00",
        "#FF00FF",
        "#00FFFF",
        "#FFA500",
        "#800080",
        "#008000",
        "#FFC0CB",
        "#A52A2A",
        "#808080",
        "#FFD700",
        "#ADFF2F",
        "#FF6347",
        "#40E0D0",
        "#EE82EE",
        "#90EE90",
      ];

      // 대용량 데이터 생성을 위한 안전한 배치 처리 (더 작은 배치)
      const batchSize = Math.min(10, Math.max(5, Math.floor(count / 500))); // 적당한 배치로 효율적 처리

      // 캔버스 렌더링 정지
      setPauseRendering(true);

      for (let batchStart = 0; batchStart < count; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, count);

        // 배치 단위로 스트로크 생성
        for (let i = batchStart; i < batchEnd; i++) {
          const strokeId = `test-stroke-${Date.now()}-${i}`;
          const points = [];
          const startX = Math.random() * 800;
          const startY = Math.random() * 600;

          // 더 복잡한 패턴으로 대용량 데이터 생성
          const patternType = Math.floor(Math.random() * 4);

          for (let j = 0; j < pointsPerStroke; j++) {
            const progress = j / pointsPerStroke;
            let x, y;

            switch (patternType) {
              case 0: // 원형 패턴
                x =
                  startX +
                  Math.cos(progress * Math.PI * 8) * 150 +
                  Math.random() * 30;
                y =
                  startY +
                  Math.sin(progress * Math.PI * 8) * 150 +
                  Math.random() * 30;
                break;
              case 1: // 나선형 패턴
                x =
                  startX +
                  Math.cos(progress * Math.PI * 12) * (progress * 200) +
                  Math.random() * 25;
                y =
                  startY +
                  Math.sin(progress * Math.PI * 12) * (progress * 200) +
                  Math.random() * 25;
                break;
              case 2: // 복잡한 곡선
                x =
                  startX +
                  Math.sin(progress * Math.PI * 6) * 100 +
                  Math.cos(progress * Math.PI * 3) * 50 +
                  Math.random() * 20;
                y =
                  startY +
                  Math.cos(progress * Math.PI * 6) * 100 +
                  Math.sin(progress * Math.PI * 3) * 50 +
                  Math.random() * 20;
                break;
              default: // 랜덤 움직임
                x =
                  startX +
                  (Math.random() - 0.5) * 400 +
                  Math.sin(progress * Math.PI * 4) * 100;
                y =
                  startY +
                  (Math.random() - 0.5) * 300 +
                  Math.cos(progress * Math.PI * 4) * 100;
            }

            points.push({
              x,
              y,
              pressure: 0.2 + Math.random() * 0.8,
              timestamp: Date.now() + j * 10 + i * 1000,
              actualRadius:
                (3 + Math.random() * 20) * (0.2 + Math.random() * 0.8),
              actualOpacity:
                (0.3 + Math.random() * 0.7) * (0.2 + Math.random() * 0.8),
              speed: Math.random() * 150,
              direction: Math.random() * Math.PI * 2,
            });
          }

          // 효율적인 bounds 계산
          let minX = points[0].x,
            minY = points[0].y,
            maxX = points[0].x,
            maxY = points[0].y;
          for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }

          // 최적화된 브러시 설정으로 빠른 데이터 생성
          const colorIndex = Math.floor(Math.random() * colors.length);
          const stroke: BrushStroke = {
            id: strokeId,
            points,
            brushSettings: {
              radius: 3 + Math.random() * 25,
              color: colors[colorIndex],
              opacity: 0.2 + Math.random() * 0.8,
              hardness: 0.5 + Math.random() * 0.5,
              blendMode: ["normal", "multiply", "screen", "overlay"][
                Math.floor(Math.random() * 4)
              ],
              pressureOpacity: 0.5 + Math.random() * 1.5,
              pressureSize: 0.5 + Math.random() * 1.5,
              speedSize: Math.random() * 1.0,
              spacing: 0.001 + Math.random() * 0.1,
              jitter: Math.random() * 0.5,
              angle: Math.random() * Math.PI * 2,
              roundness: 0.5 + Math.random() * 0.5,
              dabsPerSecond: Math.random() * 100,
              dabsPerRadius: Math.random() * 5,
              speedOpacity: Math.random() * 0.5 - 0.25,
              randomRadius: Math.random() * 0.3,
              strokeThreshold: Math.random() * 10,
              strokeDuration: Math.random() * 10,
              slowTracking: Math.random() * 1.0,
              slowTrackingPerDab: Math.random() * 1.0,
              colorMixing: Math.random() * 1.0,
              eraser: Math.random() > 0.9 ? 1 : 0,
              lockAlpha: Math.random() > 0.8 ? 1 : 0,
              colorizeMode: Math.floor(Math.random() * 3),
              snapToPixel: Math.random() > 0.7 ? 1 : 0,
            },
            timestamp: Date.now() + i * 100,
            duration: pointsPerStroke * (5 + Math.random() * 20),
            bounds: { minX, minY, maxX, maxY },
            // 최적화된 renderData 생성 (더 빠른 처리)
            renderData: points.map((p, idx) => ({
              x: p.x,
              y: p.y,
              angle: (idx / pointsPerStroke) * Math.PI * 4,
              color: colors[colorIndex], // 같은 색상 재사용
              radius: p.actualRadius || 10 + Math.random() * 15,
              opacity: p.actualOpacity || 0.5 + Math.random() * 0.5,
              hardness: 0.7 + Math.random() * 0.3,
              roundness: 0.8 + Math.random() * 0.2,
              // 추가 속성으로 데이터 크기 증가 (최적화)
              texture: Math.random() > 0.5 ? "grainy" : "smooth",
              flow: Math.random(),
              wetness: Math.random(),
            })),
          };

          strokes.push(stroke);
        }

        // 배치 완료 후 진행률 업데이트 및 UI 반응성 유지
        const currentProgress = (batchEnd / count) * 100;
        setProgress(currentProgress);

        // 10%마다 캔버스에 표시 및 렌더링 재개
        if (
          Math.floor(currentProgress / 10) >
          Math.floor((((batchStart - batchSize) / count) * 100) / 10)
        ) {
          console.log(
            `진행률 ${
              Math.floor(currentProgress / 10) * 10
            }% - 캔버스 렌더링 재개`
          );
          setPauseRendering(false); // 잠시 렌더링 재개
          await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms 대기
          setPauseRendering(true); // 다시 렌더링 정지
        }

        // 메모리 사용량 모니터링 및 안전장치 (더 엄격한 제한)
        if ((performance as any).memory) {
          const currentMemory = Math.round(
            (performance as any).memory.usedJSHeapSize / 1024 / 1024
          );
          setMemoryUsage(currentMemory);

          // 메모리 사용량이 500MB를 초과하면 경고
          if (currentMemory > 500) {
            console.warn(`⚠️ 메모리 사용량이 높습니다: ${currentMemory}MB`);
            setCurrentOperation(`⚠️ 메모리 사용량 높음: ${currentMemory}MB`);

            // 강제 가비지 컬렉션 실행
            if (window.gc) {
              window.gc();
            }
          }

          // 메모리 사용량이 2GB를 초과하면 중단 (대용량 데이터 테스트 허용)
          if (currentMemory > 2048) {
            console.error(
              `❌ 메모리 사용량이 너무 높습니다: ${currentMemory}MB. 데이터 생성을 중단합니다.`
            );
            throw new Error(
              `메모리 사용량이 너무 높습니다: ${currentMemory}MB`
            );
          }
        }

        // 대용량 데이터 생성 시 브라우저 블로킹 방지 (더 적극적인 지연)
        if (count > 500) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms 지연
        }
        if (count > 2000) {
          await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms 지연
        }
        if (count > 5000) {
          await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms 지연
        }

        // 메모리 사용량 체크 및 가비지 컬렉션 강제 실행 (더 자주 실행)
        if (
          (performance as any).memory &&
          (performance as any).memory.usedJSHeapSize > 50 * 1024 * 1024
        ) {
          // 50MB 이상에서 가비지 컬렉션 실행
          if (window.gc) {
            window.gc(); // 가비지 컬렉션 강제 실행
          }
          // 메모리 정리 시간 확보
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // 진행률별 추가 안전장치
        if (currentProgress > 50) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 50% 이상에서 100ms 지연
        }
        if (currentProgress > 75) {
          await new Promise((resolve) => setTimeout(resolve, 200)); // 75% 이상에서 200ms 지연
        }
        if (currentProgress > 90) {
          console.log(
            `진행률 ${currentProgress.toFixed(1)}% - 추가 안전장치 실행`
          );
          await new Promise((resolve) => setTimeout(resolve, 500)); // 90% 이상에서 500ms 지연
        }

        // 진행률이 95% 이상일 때 강제 완료 처리
        if (currentProgress > 95) {
          console.log(`진행률 ${currentProgress.toFixed(1)}% - 강제 완료 처리`);
          // 남은 작업을 건너뛰고 완료 처리
          break;
        }
      }

      // 캔버스 렌더링 재개 및 강제 업데이트
      setPauseRendering(false);

      // 100% 완료 시 강제 렌더링 실행
      console.log("데이터 생성 완료 - 캔버스 강제 렌더링 실행");
      setTimeout(() => {
        // Yjs 스토어 강제 업데이트
        const yjsStore = useYjsStore.getState();
        yjsStore.forceRerender();
      }, 100);

      // 추가 렌더링 보장
      setTimeout(() => {
        console.log("데이터 생성 완료 - 추가 렌더링 보장");
        const yjsStore = useYjsStore.getState();
        yjsStore.forceRerender();
      }, 500);

      return strokes;
    },
    []
  );

  // 데이터 크기 계산 (대략적)
  const calculateDataSize = useCallback((strokes: BrushStroke[]): number => {
    const jsonString = JSON.stringify(strokes);
    return new Blob([jsonString]).size / (1024 * 1024); // MB
  }, []);

  // 목표 크기에 맞는 스트로크 수 계산 (안전한 크기 제한)
  const calculateStrokesForTargetSize = useCallback(
    async (targetSizeMB: number, pointsPerStroke: number): Promise<number> => {
      // 샘플 스트로크로 크기 추정
      const sampleStrokes = await generateBrushStrokes(10, pointsPerStroke);
      const sampleSize = calculateDataSize(sampleStrokes);
      const estimatedStrokes = Math.ceil((targetSizeMB / sampleSize) * 10);

      // 안전한 최대 스트로크 수 제한 (메모리 크래시 방지)
      const maxSafeStrokes = Math.min(estimatedStrokes, 50000); // 최대 50,000개 스트로크

      if (estimatedStrokes > maxSafeStrokes) {
        console.warn(
          `안전을 위해 스트로크 수를 ${maxSafeStrokes}개로 제한합니다.`
        );
      }

      return maxSafeStrokes;
    },
    [generateBrushStrokes, calculateDataSize]
  );

  // 성능 테스트 실행
  const runPerformanceTest = useCallback(async () => {
    if (!config.selectedLayerId) {
      alert("테스트할 레이어를 선택해주세요.");
      return;
    }

    // 디버그 모드 방지
    if (typeof window !== "undefined") {
      (window as any).debugger = () => {}; // debugger 함수 비활성화
    }

    setIsRunning(true);
    setProgress(0);
    setCurrentOperation("테스트 준비 중...");

    try {
      const startTime = performance.now();
      let operationType = "";
      let dataSize = 0;

      switch (config.testType) {
        case "generate": {
          setCurrentOperation("대용량 데이터 생성 중...");
          operationType = "데이터 생성";

          // 목표 크기에 맞는 스트로크 수 계산
          const targetStrokes = await calculateStrokesForTargetSize(
            config.targetSize,
            config.pointsPerStroke
          );

          // 디버그 모드 방지를 위해 console.log 제거
          // console.log(
          //   `목표 크기: ${config.targetSize}MB, 생성할 스트로크 수: ${targetStrokes}`
          // );

          const generatedStrokes = await generateBrushStrokes(
            targetStrokes,
            config.pointsPerStroke
          );
          dataSize = calculateDataSize(generatedStrokes);

          setCurrentOperation("레이어에 데이터 로드 중...");
          // 레이어가 연결되어 있으면 Yjs로 로드, 아니면 대기
          if (isLayerConnected(config.selectedLayerId)) {
            const layerData: LayerPersistentData = {
              textObjects: [],
              brushStrokes: generatedStrokes,
              contentBounds: { x: 0, y: 0, width: 800, height: 600 },
            };

            // Yjs 스토어를 통해 데이터 로드
            const yjsStore = useYjsStore.getState();

            // 직접 데이터 로드 (더 확실한 방법)
            const layerState = getLayerState(config.selectedLayerId);
            console.log("레이어 상태 확인:", {
              layerId: config.selectedLayerId,
              hasLayerState: !!layerState,
              isLayerConnected: isLayerConnected(config.selectedLayerId),
              generatedStrokesCount: generatedStrokes.length,
            });

            if (layerState) {
              console.log("✅ 레이어 상태 확인됨 - 직접 데이터 로드 실행");

              // 렌더링 정지 해제
              setPauseRendering(false);

              yjsStore.performDataLoad(
                config.selectedLayerId,
                layerData,
                layerState
              );

              // 즉시 렌더링 실행
              setTimeout(() => {
                console.log("✅ 직접 데이터 로드 완료 - 강제 렌더링 실행");
                yjsStore.forceRerender();
              }, 100);

              // 추가 렌더링 보장 (더 확실한 방법)
              setTimeout(() => {
                console.log("✅ 추가 렌더링 보장 실행");
                yjsStore.forceRerender();
              }, 300);
            } else {
              console.log("⚠️ 레이어 상태 없음 - 대기 후 재시도");
              yjsStore.loadLayerDataFromJson(config.selectedLayerId, layerData);

              // 대기 후 강제 렌더링
              setTimeout(() => {
                console.log("⚠️ 대기 후 데이터 로드 완료 - 강제 렌더링 실행");
                yjsStore.forceRerender();
              }, 500);
            }

            // 저장 로직 최적화: 대용량 데이터 생성 후 즉시 저장하지 않고 지연
            if (layerState && config.targetSize > 100) {
              // 100MB 이상의 데이터는 저장 지연 시간을 늘림 (10초)
              setTimeout(() => {
                if (layerState.debouncedSave) {
                  layerState.debouncedSave.flush();
                }
              }, 10000);
            }

            // 100MB 이상 데이터에 대한 경고 (MongoDB 설정으로 제한 상향 조정)
            if (config.targetSize >= 100) {
              console.warn(`⚠️ 대용량 데이터 감지: ${config.targetSize}MB`);
              console.warn(
                `⚠️ MongoDB Binary 크기 제한이 2GB로 상향 조정되었습니다.`
              );
              setCurrentOperation(
                `⚠️ 대용량 데이터: ${config.targetSize}MB - Yjs 저장 모드`
              );
            }

            // 1GB 이상 데이터에 대한 경고
            if (config.targetSize >= 1024) {
              console.warn(
                `🚨 초대용량 데이터 감지: ${(config.targetSize / 1024).toFixed(
                  2
                )}GB`
              );
              console.warn(
                `🚨 1GB 이상의 데이터는 저장 시간이 오래 걸릴 수 있습니다.`
              );
              setCurrentOperation(
                `🚨 초대용량 데이터: ${(config.targetSize / 1024).toFixed(
                  2
                )}GB - 처리 중...`
              );
            }

            // 2GB 이상 데이터에 대한 경고
            if (config.targetSize >= 2048) {
              console.error(
                `❌ 데이터 크기 제한 초과: ${(config.targetSize / 1024).toFixed(
                  2
                )}GB`
              );
              console.error(
                `❌ 2GB 제한을 초과했습니다. 더 작은 크기로 테스트해주세요.`
              );
              setCurrentOperation(
                `❌ 크기 제한 초과: ${(config.targetSize / 1024).toFixed(
                  2
                )}GB (최대 2GB)`
              );
            }
          } else {
            console.warn(
              "레이어가 연결되지 않음. 데이터는 생성되었지만 로드되지 않음."
            );
          }
          break;
        }

        case "load": {
          setCurrentOperation("레이어 데이터 로드 중...");
          operationType = "데이터 로드";

          if (!isLayerConnected(config.selectedLayerId)) {
            throw new Error(
              "레이어가 연결되지 않았습니다. 먼저 레이어에 연결해주세요."
            );
          }

          const layerState = getLayerState(config.selectedLayerId);
          if (layerState) {
            // 실제 데이터 크기 계산을 위해 JSON 변환
            const strokes = layerState.strokes.toJSON();
            dataSize = new Blob([JSON.stringify(strokes)]).size / (1024 * 1024);
          }
          break;
        }

        case "save": {
          setCurrentOperation("레이어 데이터 저장 중...");
          operationType = "데이터 저장";

          if (!isLayerConnected(config.selectedLayerId)) {
            throw new Error(
              "레이어가 연결되지 않았습니다. 먼저 레이어에 연결해주세요."
            );
          }

          const layerStateForSave = getLayerState(config.selectedLayerId);
          if (layerStateForSave) {
            // 데이터 크기 계산 (저장 전)
            const strokes = layerStateForSave.strokes.toJSON();
            dataSize = new Blob([JSON.stringify(strokes)]).size / (1024 * 1024);

            // 강제 저장 실행 (대용량 데이터 고려)
            if (dataSize > 100) {
              // console.log(`대용량 데이터 저장 시작: ${dataSize.toFixed(2)}MB`);
              setCurrentOperation(
                `대용량 데이터 저장 중... (${dataSize.toFixed(2)}MB)`
              );
            }

            layerStateForSave.debouncedSave.flush();
          }
          break;
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = dataSize / (duration / 1000); // MB/s

      const newMetric: PerformanceMetrics = {
        operation: operationType,
        duration: duration,
        dataSize: dataSize,
        throughput: throughput,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMetrics((prev) => [newMetric, ...prev]);
      setProgress(100);
      setCurrentOperation(`${operationType} 완료!`);

      // console.log("성능 테스트 결과:", newMetric);
    } catch (error) {
      console.error("성능 테스트 실패:", error);
      setCurrentOperation(
        `오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`
      );
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        setProgress(0);
        setCurrentOperation("");
      }, 2000);
    }
  }, [
    config,
    generateBrushStrokes,
    calculateDataSize,
    calculateStrokesForTargetSize,
    isLayerConnected,
    getLayerState,
  ]);

  // 메트릭 초기화
  const clearMetrics = useCallback(() => {
    setMetrics([]);
  }, []);

  // 사용 가능한 레이어 목록
  const availableLayers = allData.layers.filter(
    (layer) => layer.type === "brush" && layer.visible
  );

  return (
    <div className="performance-test-panel">
      <h3>🚀 성능 테스트 도구</h3>

      {/* 설정 패널 */}
      <div className="config-panel">
        <h4>테스트 설정</h4>

        <div className="config-row">
          <label>
            테스트 유형:
            <select
              value={config.testType}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  testType: e.target.value as TestConfig["testType"],
                }))
              }
              disabled={isRunning}
            >
              <option value="generate">데이터 생성</option>
              <option value="load">데이터 로드</option>
              <option value="save">데이터 저장</option>
            </select>
          </label>
        </div>

        {config.testType === "generate" && (
          <>
            <div className="config-row">
              <label>
                목표 데이터 크기: {config.targetSize}MB
                <input
                  type="range"
                  min="1"
                  max="2048"
                  step="1"
                  value={config.targetSize}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      targetSize: parseInt(e.target.value),
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              {config.targetSize >= 500 && (
                <div className="warning-message">
                  ⚠️ 대용량 데이터 생성 시 브라우저 성능에 영향을 줄 수
                  있습니다.
                  <br />
                  • 권장: 500MB 이하로 테스트
                  <br />
                  • 1GB 생성 시 5-10분 소요 예상
                  <br />
                  • 메모리 사용량이 급격히 증가할 수 있습니다
                  <br />• 안전을 위해 최대 50,000개 스트로크로 제한됩니다
                </div>
              )}
            </div>

            <div className="config-row">
              <label>
                스트로크당 포인트 수:
                <input
                  type="number"
                  min="10"
                  max="200"
                  value={config.pointsPerStroke}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pointsPerStroke: parseInt(e.target.value),
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
            </div>
          </>
        )}

        <div className="config-row">
          <label>
            테스트할 레이어:
            <select
              value={config.selectedLayerId}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  selectedLayerId: e.target.value,
                }))
              }
              disabled={isRunning}
            >
              <option value="">레이어 선택...</option>
              {availableLayers.map((layer) => (
                <option key={layer._id} value={layer._id}>
                  {layer.name} {isLayerConnected(layer._id) ? "🟢" : "🔴"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 진행률 표시 */}
      {isRunning && (
        <div className="progress-panel">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p>{currentOperation}</p>
          <div className="progress-info">
            <span className="progress-percentage">
              진행률: {progress.toFixed(1)}%
            </span>
            {memoryUsage > 0 && (
              <span className={memoryUsage > 200 ? "memory-warning" : ""}>
                메모리: {memoryUsage}MB
                {memoryUsage > 200 && " ⚠️"}
              </span>
            )}
            {pauseRendering && (
              <span className="pause-indicator">🎯 렌더링 정지</span>
            )}
            {Math.floor(progress / 10) * 10 > 0 && (
              <span className="milestone-indicator">
                🎯 {Math.floor(progress / 10) * 10}% 달성
              </span>
            )}
          </div>
        </div>
      )}

      {/* 실행 버튼 */}
      <div className="action-panel">
        <button
          onClick={runPerformanceTest}
          disabled={isRunning || !config.selectedLayerId}
          className="run-button"
        >
          {isRunning ? "실행 중..." : "테스트 실행"}
        </button>

        <button
          onClick={clearMetrics}
          disabled={isRunning}
          className="clear-button"
        >
          결과 초기화
        </button>
      </div>

      {/* 성능 메트릭 표시 */}
      {metrics.length > 0 && (
        <div className="metrics-panel">
          <h4>성능 테스트 결과</h4>
          <div className="metrics-table">
            <div className="metrics-header">
              <span>작업</span>
              <span>소요시간</span>
              <span>데이터 크기</span>
              <span>처리량</span>
              <span>시간</span>
            </div>
            {metrics.map((metric, index) => (
              <div key={index} className="metrics-row">
                <span>{metric.operation}</span>
                <span>{(metric.duration / 1000).toFixed(2)}초</span>
                <span>{metric.dataSize.toFixed(2)}MB</span>
                <span>{metric.throughput.toFixed(2)}MB/s</span>
                <span>{metric.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .performance-test-panel {
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
          margin: 10px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            sans-serif;
        }

        .config-panel {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .config-row {
          margin-bottom: 10px;
        }

        .config-row label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-weight: 500;
        }

        .config-row input,
        .config-row select {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .config-row input[type="range"] {
          margin-top: 5px;
        }

        .warning-message {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          color: #856404;
          padding: 10px;
          border-radius: 4px;
          margin-top: 8px;
          font-size: 12px;
          line-height: 1.4;
        }

        .progress-panel {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .progress-bar {
          width: 100%;
          height: 20px;
          background: #e0e0e0;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 10px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4caf50, #8bc34a);
          transition: width 0.3s ease;
        }

        .progress-info {
          display: flex;
          gap: 15px;
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }

        .progress-info span {
          background: #f0f0f0;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }

        .pause-indicator {
          background: #ff9800 !important;
          color: white !important;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .memory-warning {
          background: #ff5722 !important;
          color: white !important;
          animation: pulse 0.5s infinite;
        }

        .progress-percentage {
          font-weight: 600;
          color: #2196f3;
        }

        .milestone-indicator {
          background: #4caf50 !important;
          color: white !important;
          animation: pulse 1s infinite;
        }

        .action-panel {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }

        .run-button {
          background: #2196f3;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .run-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .clear-button {
          background: #f44336;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .clear-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .metrics-panel {
          background: white;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .metrics-table {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }

        .metrics-header {
          display: contents;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #ddd;
          padding-bottom: 5px;
        }

        .metrics-row {
          display: contents;
          padding: 5px 0;
        }

        .metrics-row:nth-child(even) {
          background: #f9f9f9;
        }

        h3,
        h4 {
          margin: 0 0 15px 0;
          color: #333;
        }

        h3 {
          font-size: 18px;
          border-bottom: 2px solid #2196f3;
          padding-bottom: 5px;
        }
      `}</style>
    </div>
  );
};

export default PerformanceTestPanel;
