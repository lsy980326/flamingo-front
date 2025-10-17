/**
 * 성능 최적화 패널 컴포넌트
 * 실시간 성능 모니터링 및 사용자 제어 옵션 제공
 */

import React, { useState, useEffect } from "react";
import { PerformanceMonitor } from "../utils/PerformanceMonitor";
import { useYjsStore } from "../store/useYjsStore";

interface PerformanceOptimizationPanelProps {
  performanceMonitor: PerformanceMonitor;
  onQualityChange?: (quality: "high" | "medium" | "low") => void;
  onOptimizationToggle?: (enabled: boolean) => void;
}

export const PerformanceOptimizationPanel: React.FC<
  PerformanceOptimizationPanelProps
> = ({ performanceMonitor, onQualityChange, onOptimizationToggle }) => {
  const [metrics, setMetrics] = useState(performanceMonitor.getMetrics());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoOptimization, setAutoOptimization] = useState(true);
  const { forceRerender, updatePerformanceSettings, getPerformanceSettings } =
    useYjsStore();

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(performanceMonitor.getMetrics());
    }, 1000); // 1초마다 업데이트

    return () => clearInterval(interval);
  }, [performanceMonitor]);

  // 성능 모니터링 시작
  useEffect(() => {
    console.log("📊 성능 모니터링 시작");

    // 성능 모니터링 초기화
    performanceMonitor.startRender();

    // 실제 스트로크 수 모니터링을 위한 인터벌
    const strokeCountInterval = setInterval(() => {
      const { layerStates } = useYjsStore.getState();
      let totalStrokeCount = 0;

      layerStates.forEach((layerState) => {
        totalStrokeCount += layerState.strokes.length;
      });

      // 성능 모니터에 실제 스트로크 수 업데이트
      if (totalStrokeCount > 0) {
        performanceMonitor.endRender(totalStrokeCount);
      }
    }, 2000); // 2초마다 업데이트

    return () => {
      clearInterval(strokeCountInterval);
      console.log("📊 성능 모니터링 종료");
    };
  }, [performanceMonitor]);

  const handleQualityChange = (quality: "high" | "medium" | "low") => {
    onQualityChange?.(quality);
  };

  const handleOptimizationToggle = (enabled: boolean) => {
    setAutoOptimization(enabled);
    onOptimizationToggle?.(enabled);

    // 자동 최적화가 비활성화되면 사용자 정의 설정 초기화
    if (!enabled) {
      performanceMonitor.resetCustomSettings();
      forceRerender();
    }
  };

  const getPerformanceStatus = () => {
    const { fps, frameTime, memoryUsage } = metrics;

    if (fps < 30 || frameTime > 33 || memoryUsage > 100 * 1024 * 1024) {
      return {
        status: "critical",
        color: "red",
        message: "성능이 매우 낮습니다",
      };
    } else if (fps < 45 || frameTime > 22 || memoryUsage > 50 * 1024 * 1024) {
      return {
        status: "warning",
        color: "orange",
        message: "성능이 저하되었습니다",
      };
    } else {
      return { status: "good", color: "green", message: "성능이 양호합니다" };
    }
  };

  const performanceStatus = getPerformanceStatus();

  return (
    <div className="performance-optimization-panel">
      <div className="performance-header">
        <h3>성능 최적화</h3>
        <div className={`performance-status ${performanceStatus.status}`}>
          <span style={{ color: performanceStatus.color }}>
            {performanceStatus.message}
          </span>
        </div>
      </div>

      <div className="performance-metrics">
        <div className="metric">
          <label>FPS</label>
          <span
            className={
              metrics.fps < 30
                ? "warning"
                : metrics.fps < 45
                ? "caution"
                : "good"
            }
          >
            {Math.round(metrics.fps)}
          </span>
        </div>
        <div className="metric">
          <label>프레임 시간</label>
          <span
            className={
              metrics.frameTime > 33
                ? "warning"
                : metrics.frameTime > 22
                ? "caution"
                : "good"
            }
          >
            {metrics.frameTime.toFixed(1)}ms
          </span>
        </div>
        <div className="metric">
          <label>메모리 사용량</label>
          <span
            className={
              metrics.memoryUsage > 100 * 1024 * 1024 ? "warning" : "good"
            }
          >
            {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
          </span>
        </div>
        <div className="metric">
          <label>렌더링된 스트로크</label>
          <span>{metrics.strokeCount}</span>
        </div>
      </div>

      <div className="optimization-controls">
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={autoOptimization}
              onChange={(e) => handleOptimizationToggle(e.target.checked)}
            />
            자동 최적화
          </label>
        </div>

        <div className="control-group">
          <label>품질 설정</label>
          <div className="quality-buttons">
            <button
              className={metrics.strokeCount > 500 ? "active" : ""}
              onClick={() => handleQualityChange("low")}
            >
              낮음 (빠름)
            </button>
            <button
              className={
                metrics.strokeCount > 200 && metrics.strokeCount <= 500
                  ? "active"
                  : ""
              }
              onClick={() => handleQualityChange("medium")}
            >
              중간
            </button>
            <button
              className={metrics.strokeCount <= 200 ? "active" : ""}
              onClick={() => handleQualityChange("high")}
            >
              높음 (느림)
            </button>
          </div>
        </div>

        <button
          className="optimization-render-button"
          onClick={() => {
            console.log("🎯 성능 최적화 렌더링 시작");

            // 1. 현재 성능 설정 확인
            const currentSettings = performanceMonitor.getCustomSettings();
            console.log("현재 성능 설정:", currentSettings);

            // 2. 성능 모니터링 최적화 실행
            performanceMonitor.optimizeRendering();

            // 3. 실제 렌더링에 성능 설정 적용
            const { layerStates } = useYjsStore.getState();
            const performanceSettings = getPerformanceSettings();

            layerStates.forEach((layerState, layerId) => {
              const strokeLimit = performanceMonitor.getOptimalStrokeLimit();
              const strokeReduction =
                performanceMonitor.getOptimalStrokeReduction();

              console.log(`레이어 ${layerId} 성능 설정 적용:`, {
                strokeLimit,
                strokeReduction: `${(strokeReduction * 100).toFixed(1)}%`,
              });

              // 스트로크 수가 제한을 초과하면 실제로 제한 적용
              if (layerState.strokes.length > strokeLimit) {
                console.warn(
                  `⚠️ 레이어 ${layerId}: 스트로크 수 초과 (${layerState.strokes.length}/${strokeLimit}) - 제한 적용`
                );

                // 성능 설정 활성화
                updatePerformanceSettings({
                  enabled: true,
                  maxStrokeLimit: strokeLimit,
                  strokeReduction: strokeReduction,
                });

                // 스트로크 단순화 적용 (실제로는 렌더링 컴포넌트에서 처리)
                console.log(`🎯 레이어 ${layerId}에 성능 최적화 적용됨`);
              }
            });

            // 4. Yjs 스토어 강제 렌더링 실행
            console.log("🔄 Yjs 스토어 강제 렌더링 실행");
            forceRerender();

            // 5. 추가 렌더링 보장 (지연 실행)
            setTimeout(() => {
              console.log("🔄 추가 렌더링 보장 실행");
              forceRerender();
            }, 100);

            // 6. 최종 렌더링 보장
            setTimeout(() => {
              console.log("✅ 최종 렌더링 보장 완료");
              forceRerender();
            }, 500);

            console.log("✅ 성능 최적화 렌더링 완료");
          }}
        >
          🎯 성능 최적화 렌더링
        </button>

        <button
          className="reset-settings-button"
          onClick={() => {
            console.log("🔄 성능 설정 초기화");
            performanceMonitor.resetCustomSettings();
            forceRerender();
          }}
        >
          🔄 설정 초기화
        </button>

        <button
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "고급 설정 숨기기" : "고급 설정 보기"}
        </button>

        {showAdvanced && (
          <div className="advanced-settings">
            <div className="control-group">
              <label>최대 스트로크 수</label>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={performanceMonitor.getOptimalStrokeLimit()}
                onChange={(e) => {
                  // 동적 스트로크 제한 조정
                  const newLimit = parseInt(e.target.value);
                  performanceMonitor.setCustomStrokeLimit(newLimit);

                  // Yjs 스토어에 성능 설정 업데이트
                  updatePerformanceSettings({ maxStrokeLimit: newLimit });

                  console.log("🎯 스트로크 제한 설정 적용:", newLimit);
                }}
              />
              <span>{performanceMonitor.getOptimalStrokeLimit()}</span>
            </div>

            <div className="control-group">
              <label>스트로크 단순화</label>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.1"
                value={performanceMonitor.getOptimalStrokeReduction()}
                onChange={(e) => {
                  // 동적 스트로크 단순화 조정
                  const newReduction = parseFloat(e.target.value);
                  performanceMonitor.setCustomStrokeReduction(newReduction);

                  // Yjs 스토어에 성능 설정 업데이트
                  updatePerformanceSettings({ strokeReduction: newReduction });

                  console.log(
                    "🎯 스트로크 단순화 설정 적용:",
                    `${(newReduction * 100).toFixed(1)}%`
                  );
                }}
              />
              <span>
                {(performanceMonitor.getOptimalStrokeReduction() * 100).toFixed(
                  0
                )}
                %
              </span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .performance-optimization-panel {
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            sans-serif;
        }

        .performance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .performance-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .performance-status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .performance-status.critical {
          background: #fee;
          color: #c33;
        }

        .performance-status.warning {
          background: #fff3cd;
          color: #856404;
        }

        .performance-status.good {
          background: #d4edda;
          color: #155724;
        }

        .performance-metrics {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background: white;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }

        .metric label {
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }

        .metric span {
          font-size: 14px;
          font-weight: 600;
        }

        .metric span.warning {
          color: #c33;
        }

        .metric span.caution {
          color: #f90;
        }

        .metric span.good {
          color: #3c3;
        }

        .optimization-controls {
          border-top: 1px solid #e0e0e0;
          padding-top: 16px;
        }

        .control-group {
          margin-bottom: 16px;
        }

        .control-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #333;
        }

        .quality-buttons {
          display: flex;
          gap: 8px;
        }

        .quality-buttons button {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .quality-buttons button:hover {
          background: #f0f0f0;
        }

        .quality-buttons button.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .optimization-render-button {
          width: 100%;
          padding: 12px;
          border: 1px solid #4caf50;
          background: #4caf50;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 16px;
          transition: all 0.2s;
        }

        .optimization-render-button:hover {
          background: #45a049;
          border-color: #45a049;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
        }

        .optimization-render-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(76, 175, 80, 0.3);
        }

        .reset-settings-button {
          width: 100%;
          padding: 10px;
          border: 1px solid #ff9800;
          background: #ff9800;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 16px;
          transition: all 0.2s;
        }

        .reset-settings-button:hover {
          background: #f57c00;
          border-color: #f57c00;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(255, 152, 0, 0.3);
        }

        .reset-settings-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(255, 152, 0, 0.3);
        }

        .advanced-toggle {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-bottom: 16px;
        }

        .advanced-settings {
          background: #fafafa;
          padding: 16px;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }

        .advanced-settings input[type="range"] {
          width: 100%;
          margin: 8px 0;
        }

        .advanced-settings span {
          font-size: 12px;
          color: #666;
          margin-left: 8px;
        }
      `}</style>
    </div>
  );
};
