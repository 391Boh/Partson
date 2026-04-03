"use client";

import { Component, type ReactNode } from "react";

type SectionBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type SectionBoundaryState = {
  hasError: boolean;
};

class SectionBoundary extends Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page-shell-inline py-4">
        <div className="rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 px-4 py-4 text-slate-800 shadow-[0_12px_28px_rgba(217,119,6,0.14)]">
          <p className="text-sm font-semibold">
            {this.props.title || "Компонент тимчасово недоступний"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Оновіть сторінку або перейдіть назад і відкрийте головну ще раз.
          </p>
        </div>
      </div>
    );
  }
}

export default SectionBoundary;
