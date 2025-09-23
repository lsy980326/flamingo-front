import React, { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";
import { mainSocket } from "../socket";

export const TextInputPanel = () => {
  const { selectedLayerId } = useSocketStore();
  const [isVisible, setIsVisible] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [textColor, setTextColor] = useState("#000000");
  const [position, setPosition] = useState({ x: 100, y: 100 });

  const handleAddText = () => {
    if (!selectedLayerId || !textContent.trim()) {
      alert("레이어를 선택하고 텍스트를 입력해주세요.");
      return;
    }

    const textData = {
      content: textContent,
      position: position,
      font: "Arial",
      size: fontSize,
      color: textColor,
      bounds: {
        x: position.x,
        y: position.y,
        width: textContent.length * 10,
        height: fontSize,
      },
    };

    console.log("텍스트 추가 요청:", {
      layerId: selectedLayerId,
      textData: textData,
    });

    mainSocket.emit(
      "add-text-to-layer",
      { layerId: selectedLayerId, textData },
      (response: any) => {
        console.log("서버 응답:", response);
        if (response.success) {
          console.log(
            "텍스트가 성공적으로 추가되었습니다:",
            response.textObject
          );
          // 성공 시 입력 필드 초기화
          setTextContent("");
          setPosition({ x: 100, y: 100 });
        } else {
          alert("텍스트 추가 실패: " + response.error);
        }
      }
    );
  };

  const togglePanel = () => {
    setIsVisible(!isVisible);
  };

  if (!selectedLayerId) {
    return null;
  }

  return (
    <div className="text-input-panel">
      <button
        className="toggle-text-panel-btn"
        onClick={togglePanel}
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: 1000,
          padding: "10px 15px",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        {isVisible ? "텍스트 패널 숨기기" : "텍스트 추가"}
      </button>

      {isVisible && (
        <div
          className="text-input-form"
          style={{
            position: "fixed",
            top: "50px",
            right: "10px",
            zIndex: 1000,
            backgroundColor: "white",
            border: "1px solid #ccc",
            borderRadius: "5px",
            padding: "20px",
            minWidth: "300px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h3 style={{ margin: "0 0 15px 0", fontSize: "16px" }}>
            텍스트 추가
          </h3>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "14px",
              }}
            >
              텍스트 내용:
            </label>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="텍스트를 입력하세요..."
              style={{
                width: "100%",
                height: "60px",
                padding: "8px",
                border: "1px solid #ddd",
                borderRadius: "3px",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "14px",
              }}
            >
              폰트 크기:
            </label>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value) || 16)}
              min="8"
              max="72"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ddd",
                borderRadius: "3px",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "14px",
              }}
            >
              텍스트 색상:
            </label>
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              style={{
                width: "100%",
                height: "40px",
                border: "1px solid #ddd",
                borderRadius: "3px",
                cursor: "pointer",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "14px",
              }}
            >
              위치:
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "12px", color: "#666" }}>X:</label>
                <input
                  type="number"
                  value={position.x}
                  onChange={(e) =>
                    setPosition({
                      ...position,
                      x: parseInt(e.target.value) || 0,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "5px",
                    border: "1px solid #ddd",
                    borderRadius: "3px",
                    fontSize: "12px",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "12px", color: "#666" }}>Y:</label>
                <input
                  type="number"
                  value={position.y}
                  onChange={(e) =>
                    setPosition({
                      ...position,
                      y: parseInt(e.target.value) || 0,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "5px",
                    border: "1px solid #ddd",
                    borderRadius: "3px",
                    fontSize: "12px",
                  }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleAddText}
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "3px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            텍스트 추가
          </button>

          <div style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
            선택된 레이어: {selectedLayerId.slice(-8)}
          </div>
        </div>
      )}
    </div>
  );
};
