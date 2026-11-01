"use client";
import { useEffect, useState } from "react";
import { useGame, findProduct } from "@/game/state";
import { useCart, cartCount, formatPrice } from "@/cart/cartStore";
import { input } from "@/input/input";
import { sfx } from "@/audio/audio";
import { Joystick } from "./TouchControls";

export function HUD() {
  const { focusedId, overlay, pointerLocked, isTouch, layout, toast, muted } = useGame();
  const lines = useCart((s) => s.lines);
  const lastAddedAt = useCart((s) => s.lastAddedAt);
  const count = cartCount(lines);
  const focused = findProduct(focusedId);
  const [bump, setBump] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => { if (!lastAddedAt) return; setBump(true); const t = setTimeout(() => setBump(false), 450); return () => clearTimeout(t); }, [lastAddedAt]);
  useEffect(() => { if (!toast) return; setShowToast(true); const t = setTimeout(() => setShowToast(false), 2200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => sfx.setMuted(muted), [muted]);

  const free = overlay === "none";
  return (
    <div className="hud">
      <header className="hud-top">
        <div className="pill store-pill"><span className="dot" />{layout?.store.name}</div>
        <div className="hud-actions">
          <button className="icon-btn" aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"} onClick={() => useGame.getState().toggleMute()}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>{muted ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}</svg>
          </button>
          <button id="open-cart" className={`cart-btn ${bump ? "bump" : ""}`} onClick={() => { sfx.open(); useGame.getState().openCart(); }} aria-label={`السلة، ${count} منتج`}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="20.5" r="1.5" fill="currentColor"/><circle cx="17" cy="20.5" r="1.5" fill="currentColor"/></svg>
            <span>السلة</span>
            <b id="cart-count" className="badge">{count}</b>
          </button>
          <button className="icon-btn" aria-label="الخروج للبداية" onClick={() => { document.exitPointerLock?.(); useGame.getState().exitToStart(); }}>✕</button>
        </div>
      </header>

      {free && !isTouch && <div className={`crosshair ${focused ? "hot" : ""}`} />}

      {free && focused && (
        <div className="prompt" id="prompt">
          <span className="prompt-name">{focused.product.name}</span>
          <span className="prompt-price">{formatPrice(focused.product.price, focused.product.currency)}</span>
          {isTouch ? (
            <button id="touch-interact" className="btn btn-primary" onClick={() => { input.interact = true; }}>عرض المنتج</button>
          ) : (
            <span className="prompt-key"><kbd>E</kbd> أو انقر للعرض</span>
          )}
        </div>
      )}

      {free && !isTouch && !pointerLocked && (
        <div className="click-hint">انقر على المشهد للتحكم بالكاميرا · <kbd>Esc</kbd> لتحرير الماوس</div>
      )}

      {showToast && toast && <div key={toast.id} className="toast" role="status">{toast.text}</div>}
      {free && isTouch && <Joystick />}
    </div>
  );
}
