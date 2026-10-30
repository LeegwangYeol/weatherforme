"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../lib/logger";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode;
  name?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const boundaryName = this.props.name || "ErrorBoundary";
    logger.error(`Boundary:${boundaryName}`, `Component crash in ${boundaryName}`, error, {
      componentStack: errorInfo.componentStack,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }

      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const boundaryName = this.props.name || "컴포넌트";

      return (
        <div className="w-full rounded-2xl border border-red-200/60 bg-red-50/70 p-4 text-center backdrop-blur-md transition-all shadow-sm">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-xs font-semibold text-red-800">
            {boundaryName} 영역을 불러오는 중 문제가 발생했습니다
          </p>
          <p className="mt-1 text-[11px] text-red-600/80">
            일시적인 오류일 수 있습니다. 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={this.resetErrorBoundary}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-red-500 px-3 py-1.5 text-xs font-medium text-white shadow transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
