"use client";
import { Component, type ReactNode } from "react";

/** Keeps the page alive if the 3D scene fails (WebGL / WASM / asset errors) and shows why. */
export class SceneBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="scene-error" role="alert">
        <b>تعذّر تشغيل المشهد ثلاثي الأبعاد</b>
        <p>جرّب «الوضع الخفيف». إن تكرر الأمر أرسل لنا النص التالي:</p>
        <code dir="ltr">{this.state.error}</code>
        <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); this.props.onRetry(); }}>تشغيل بالوضع الخفيف</button>
      </div>
    );
  }
}
