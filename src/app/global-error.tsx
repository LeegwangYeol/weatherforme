"use client";

import React, { useEffect, useState } from "react";
import WeatherBunny from "../components/WeatherBunny";
import { logger } from "../lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    logger.error("GlobalError", "Fatal crash in RootLayout captured", error, {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "linear-gradient(180deg, #c9e4fd 0%, #eef7ff 100%)",
          color: "#3d3652",
          fontFamily:
            'Pretendard Variable, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "440px",
            padding: "24px",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: "24px",
              padding: "32px 24px",
              boxShadow: "0 20px 40px rgba(61, 54, 82, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.8)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
              <WeatherBunny kind="thunder" size={130} />
            </div>

            <span
              style={{
                display: "inline-block",
                backgroundColor: "rgba(254, 226, 226, 0.9)",
                color: "#dc2626",
                fontSize: "12px",
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: "9999px",
                marginBottom: "12px",
              }}
            >
              앱 오류 발생 ⚡
            </span>

            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#3d3652",
                margin: "0 0 8px 0",
              }}
            >
              앱을 실행하는 중 문제가 발생했어요
            </h1>

            <p
              style={{
                fontSize: "14px",
                color: "#526585",
                lineHeight: "1.6",
                margin: "0 0 24px 0",
              }}
            >
              예기치 못한 시스템 오류가 발생했습니다.
              <br />
              앱을 다시 시작하거나 새로고침해 주세요.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "16px",
                  border: "none",
                  background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                }}
              >
                앱 다시 시작
              </button>

              <button
                type="button"
                onClick={() => reset()}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "16px",
                  border: "1px solid #dfe8f2",
                  background: "rgba(255, 255, 255, 0.9)",
                  color: "#526585",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                화면 복원 시도
              </button>
            </div>

            <div
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid #f1f5f9",
                textAlign: "left",
              }}
            >
              <button
                type="button"
                onClick={() => setShowDetails((prev) => !prev)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "11px",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showDetails ? "▼ 세부 진단 접기" : "▶ 세부 진단 확인"}
              </button>

              {showDetails && (
                <pre
                  style={{
                    marginTop: "8px",
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor: "#f8fafc",
                    fontSize: "11px",
                    color: "#475569",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    maxHeight: "120px",
                    overflow: "auto",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  {error.message || "Unknown error"}
                  {error.digest && `\nDigest: ${error.digest}`}
                </pre>
              )}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
