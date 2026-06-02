"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 局部错误边界：包住可能因数据形状异常而抛错的 UI（如预测结果渲染）。
 * 一处渲染崩溃只降级为友好提示，不会白屏拖垮整页赛程。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="mt-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            预测结果渲染出错，请刷新后重试。
          </div>
        )
      );
    }
    return this.props.children;
  }
}
