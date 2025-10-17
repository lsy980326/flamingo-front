import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#f8f9fa",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
              margin: "10px",
              textAlign: "center",
            }}
          >
            <h3 style={{ color: "#dc3545", marginBottom: "10px" }}>
              렌더링 오류가 발생했습니다
            </h3>
            <p style={{ color: "#6c757d", marginBottom: "15px" }}>
              캔버스 렌더링 중 문제가 발생했습니다. 페이지를 새로고침해주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              페이지 새로고침
            </button>
            {process.env.NODE_ENV === "development" && (
              <details style={{ marginTop: "15px", textAlign: "left" }}>
                <summary style={{ cursor: "pointer", color: "#6c757d" }}>
                  개발자 정보
                </summary>
                <pre
                  style={{
                    backgroundColor: "#f8f9fa",
                    padding: "10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                    marginTop: "10px",
                  }}
                >
                  {this.state.error?.stack}
                </pre>
              </details>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}
