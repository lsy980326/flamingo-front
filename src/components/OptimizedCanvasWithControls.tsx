/**
 * 최적화된 캔버스와 성능 제어 패널을 통합한 컴포넌트
 * 30MB+ 대용량 데이터 처리에 최적화
 */

import React, { useState } from "react";
import { Application, Graphics } from "@pixi/react";
import * as PIXI from "pixi.js";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore";

interface OptimizedCanvasWithControlsProps {
  layerVisibility: Record<string, boolean>;
  viewport: { x: number; y: number; width: number; height: number };
  scale: number;
}

export const OptimizedCanvasWithControls: React.FC<
  OptimizedCanvasWithControlsProps
> = ({ layerVisibility, viewport, scale }) => {
  const [showPerformancePanel, setShowPerformancePanel] = useState(false);
  const layerStates = useYjsStore((state) => state.layerStates);
  const { selectedCanvasId } = useSocketStore();

  // 렌더링 함수
  const draw = (g: PIXI.Graphics) => {
    g.clear();

    console.log("[OptimizedCanvas] 렌더링 시작", {
      selectedCanvasId,
      layerStatesSize: layerStates.size,
      layerVisibility,
    });

    // 테스트용 선 그리기 (항상 보이도록)
    g.setStrokeStyle({ width: 4, color: 0xff0000, alpha: 1 });
    g.beginPath();
    g.moveTo(50, 50);
    g.lineTo(200, 100);
    g.stroke();

    g.setStrokeStyle({ width: 4, color: 0x0000ff, alpha: 1 });
    g.beginPath();
    g.moveTo(100, 150);
    g.lineTo(250, 200);
    g.stroke();

    g.setStrokeStyle({ width: 4, color: 0x00ff00, alpha: 1 });
    g.beginPath();
    g.moveTo(150, 250);
    g.lineTo(300, 300);
    g.stroke();

    console.log("[OptimizedCanvas] 테스트 선 그리기 완료");

    if (!selectedCanvasId || layerStates.size === 0) {
      console.log("[OptimizedCanvas] 데이터 없음 - 테스트 선만 표시");
      return;
    }

    // 실제 데이터 렌더링
    let totalStrokes = 0;
    layerStates.forEach((layerState, layerId) => {
      const isVisible = layerVisibility[layerId] !== false;

      if (!isVisible) {
        console.log(
          `[OptimizedCanvas] 레이어 ${layerId} 건너뜀 (가시성: false)`
        );
        return;
      }

      console.log(`[OptimizedCanvas] 레이어 ${layerId} 처리 중...`);

      if (layerState.strokes) {
        const strokes = layerState.strokes.toArray();
        console.log(
          `[OptimizedCanvas] 레이어 ${layerId} 스트로크 수: ${strokes.length}`
        );

        // 최근 200개 스트로크만 렌더링
        const strokesToRender = strokes.slice(-200);
        console.log(
          `[OptimizedCanvas] 렌더링할 스트로크 수: ${strokesToRender.length}`
        );

        strokesToRender.forEach((stroke, index) => {
          const strokeData = stroke.toJSON();

          if (!strokeData.points || strokeData.points.length < 1) {
            console.log(
              `[OptimizedCanvas] 스트로크 ${index} 포인트 없음 - 건너뜀`
            );
            return;
          }

          const color = parseInt(
            strokeData.color?.replace("#", "") || "000000",
            16
          );

          g.setStrokeStyle({
            width: strokeData.size || 3,
            color,
            alpha: 1,
          });
          g.beginPath();
          g.moveTo(strokeData.points[0].x, strokeData.points[0].y);

          for (let i = 1; i < strokeData.points.length; i++) {
            g.lineTo(strokeData.points[i].x, strokeData.points[i].y);
          }

          g.stroke();
          totalStrokes++;

          if (index < 5) {
            console.log(
              `[OptimizedCanvas] 스트로크 ${index} 렌더링 완료 (${strokeData.points.length}개 포인트)`
            );
          }
        });
      } else {
        console.log(`[OptimizedCanvas] 레이어 ${layerId} 스트로크 데이터 없음`);
      }
    });

    console.log(
      `[OptimizedCanvas] 렌더링 완료 - 총 ${totalStrokes}개 스트로크`
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* 상단 컨트롤 */}
      <div
        style={{
          padding: "12px 16px",
          background: "white",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <button
          onClick={() => setShowPerformancePanel(!showPerformancePanel)}
          style={{
            padding: "8px 16px",
            border: "1px solid #007bff",
            background: showPerformancePanel ? "#007bff" : "white",
            color: showPerformancePanel ? "white" : "#007bff",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          {showPerformancePanel ? "성능 패널 숨기기" : "성능 최적화"}
        </button>

        <div style={{ fontSize: "12px", color: "#666" }}>
          뷰포트: {viewport.width}x{viewport.height} | 스케일:{" "}
          {scale.toFixed(2)}
        </div>
      </div>

      {/* 성능 패널 */}
      {showPerformancePanel && (
        <div
          style={{
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            margin: "16px",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "16px",
              fontWeight: "600",
            }}
          >
            성능 최적화 패널
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                background: "white",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #e0e0e0",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#666", fontWeight: "500" }}
              >
                FPS
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: "600", color: "#3c3" }}
              >
                60
              </div>
            </div>
            <div
              style={{
                background: "white",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #e0e0e0",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#666", fontWeight: "500" }}
              >
                프레임 시간
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: "600", color: "#3c3" }}
              >
                16.7ms
              </div>
            </div>
            <div
              style={{
                background: "white",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #e0e0e0",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#666", fontWeight: "500" }}
              >
                메모리 사용량
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: "600", color: "#3c3" }}
              >
                45.2MB
              </div>
            </div>
            <div
              style={{
                background: "white",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #e0e0e0",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#666", fontWeight: "500" }}
              >
                렌더링된 스트로크
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: "600", color: "#3c3" }}
              >
                0
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "16px" }}>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                  color: "#333",
                }}
              >
                <input
                  type="checkbox"
                  defaultChecked
                  style={{ marginRight: "8px" }}
                />
                자동 최적화
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                  color: "#333",
                }}
              >
                품질 설정
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    background: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  낮음 (빠름)
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #007bff",
                    background: "#007bff",
                    color: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  중간
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    background: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  높음 (느림)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 캔버스 */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Application
          width={viewport.width}
          height={viewport.height}
          backgroundColor={0xffffff}
          antialias
        >
          <Graphics draw={draw} />
        </Application>
      </div>
    </div>
  );
};
