"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SceneBoundary } from "./SceneBoundary";
import { forceSafe, type Tier } from "@/engine/quality";
import { demoLayout } from "@/pipeline";
import type { StoreLayout } from "@/pipeline/types";
import { useGame } from "@/game/state";
import { useCart } from "@/cart/cartStore";
import { debug } from "@/engine/debug";
import { StartScreen } from "./StartScreen";
import { HUD } from "./HUD";
import { ProductCard } from "./ProductCard";
import { CartPanel } from "./CartPanel";

// three.js / WASM only on the client; the start screen renders immediately while the engine chunk streams.
const GameCanvas = dynamic(() => import("@/engine/GameCanvas"), { ssr: false, loading: () => <div className="boot">يجهّز المتجر…</div> });

export default function App() {
  const demo = useMemo(() => demoLayout(), []);
  const [layout, setLayout] = useState<StoreLayout>(demo);
  const screen = useGame((s) => s.screen);
  const [sceneKey, setSceneKey] = useState(0);
  const [tier, setTier] = useState<Tier | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const restartSafe = useCallback((why: string) => {
    forceSafe();
    setTier("safe");
    setNotice(why);
    setSceneKey((k) => k + 1);
  }, []);
  const onContextLost = useCallback(() => restartSafe("ذاكرة الرسوميات امتلأت، فأعدنا تشغيل المشهد بالوضع الخفيف."), [restartSafe]);

  useEffect(() => { useCart.getState().bindStore(layout.store.sourceUrl); }, [layout]);
  useEffect(() => {
    (window as unknown as { __cj: unknown }).__cj = { debug, game: useGame, cart: useCart };
  }, []);

  return (
    <main className="app">
      <SceneBoundary onRetry={() => restartSafe("يعمل المشهد الآن بالوضع الخفيف.")}>
        <GameCanvas key={sceneKey} layout={layout} tier={tier} onContextLost={onContextLost} />
      </SceneBoundary>
      {notice && <div className="notice" role="status" onClick={() => setNotice(null)}>{notice}</div>}
      {screen === "start" ? <StartScreen demo={demo} onLayout={setLayout} /> : (
        <>
          <HUD />
          <ProductCard />
          <CartPanel />
        </>
      )}
    </main>
  );
}
