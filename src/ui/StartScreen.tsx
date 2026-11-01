"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreLayout } from "@/pipeline/types";
import { useGame } from "@/game/state";
import { sfx } from "@/audio/audio";

const ERR: Record<string, string> = {
  invalid_url: "تأكد من الرابط، مثال: https://store.example.com",
  blocked: "هذا المتجر لا يسمح بقراءة بياناته آليًا. يستطيع التاجر ربطه رسميًا لاحقًا.",
  not_found: "لم نجد صفحة المتجر على هذا الرابط.",
  no_products: "لم نجد بيانات منتجات عامة في هذه الصفحة. جرّب صفحة قسم أو منتج.",
  unsupported: "هذه المنصة غير مدعومة بعد.",
  network: "تعذّر الوصول إلى المتجر الآن. حاول بعد قليل.",
};

export function StartScreen({ demo, current, onLayout }: { demo: StoreLayout; current: StoreLayout; onLayout: (l: StoreLayout) => void }) {
  const isTouch = useGame((s) => s.isTouch);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "err" | "ok"; text: string } | null>(null);

  const enter = (layout: StoreLayout) => {
    sfx.start();
    sfx.ambience();
    onLayout(layout);
    useGame.getState().enter(layout);
  };

  const run = useCallback(async (target: string) => {
    if (!target.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/store/import?url=${encodeURIComponent(target.trim())}`);
      const data = await r.json();
      if (data.ok) {
        const n = data.layout.products.length;
        setMsg({ tone: "ok", text: `جاهز: «${data.layout.store.name}» — ${n} منتج على الأرفف${data.stats?.found > n ? ` (من ${data.stats.found})` : ""}` });
        onLayout(data.layout); // the storefront behind the panel switches to the merchant's store
        try { history.replaceState(null, "", `?store=${encodeURIComponent(target.trim())}`); } catch { /* sandboxed */ }
      } else {
        setMsg({ tone: "err", text: data.error.kind === "auth_required" ? data.error.message : ERR[data.error.kind] ?? data.error.message });
      }
    } catch {
      setMsg({ tone: "err", text: ERR.network });
    } finally {
      setBusy(false);
    }
  }, [onLayout]);

  const convert = (e: React.FormEvent) => { e.preventDefault(); void run(url); };

  // Shareable deep link: /?store=https://merchant.example
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || process.env.NEXT_PUBLIC_STATIC === "1") return;
    booted.current = true;
    const s = new URLSearchParams(location.search).get("store");
    if (s) { setUrl(s); void run(s); }
  }, [run]);

  const isImported = current !== demo;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setMsg({ tone: "ok", text: "نُسخ رابط المتجر ثلاثي الأبعاد" }); }
    catch { setMsg({ tone: "ok", text: location.href }); }
  };

  return (
    <div className="start">
      <div className="start-panel">
        <p className="eyebrow">Customer Journey</p>
        <h1 className="title">رحلة العميل</h1>
        <p className="lede">متجرك الإلكتروني يصير مكانًا يمشي فيه عميلك: يدخل من الباب، يتجوّل بين الأرفف، ويضع ما يعجبه في السلة.</p>

        <button id="enter-demo" className="btn btn-primary btn-big" onClick={() => enter(current)} disabled={busy}>
          ادخل متجر «{current.store.name}»
        </button>
        {isImported && (
          <div className="card-links">
            <button className="link-btn" onClick={copyLink}>انسخ رابط هذا المتجر</button>
            <button className="link-btn" onClick={() => { onLayout(demo); setMsg(null); try { history.replaceState(null, "", location.pathname); } catch { /* */ } }}>المتجر التجريبي</button>
          </div>
        )}

        {process.env.NEXT_PUBLIC_STATIC === "1" ? (
          <p className="fine import">نسخة تجريبية للعب. تحويل روابط المتاجر يعمل في النسخة الكاملة المشغّلة على خادم.</p>
        ) : (
        <form className="import" onSubmit={convert}>
          <label htmlFor="store-url">أو حوّل رابط متجرك</label>
          <div className="import-row">
            <input id="store-url" dir="ltr" inputMode="url" autoComplete="url" placeholder="https://your-store.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn btn-ghost" disabled={busy || !url.trim()}>{busy ? "…" : "حوّل"}</button>
          </div>
          {busy && <p className="import-busy" role="status">نقرأ صفحات المتجر العامة ونرتّب الأرفف… قد يستغرق حتى 30 ثانية</p>}
          {msg && <p className={`import-msg ${msg.tone}`} role="status">{msg.text}</p>}
          <p className="fine">نقرأ فقط البيانات العامة المسموح بها أو عبر الواجهات الرسمية. سلة وزد تتطلبان موافقة التاجر.</p>
        </form>
        )}

        <ul className="keys" aria-label="التحكم">
          {isTouch ? (
            <>
              <li><b>العصا</b> للمشي</li>
              <li><b>اسحب</b> للنظر</li>
              <li><b>عرض</b> لتفاصيل المنتج</li>
            </>
          ) : (
            <>
              <li><kbd>W A S D</kbd> للمشي</li>
              <li><kbd>الماوس</kbd> للنظر</li>
              <li><kbd>E</kbd> للمنتج</li>
              <li><kbd>C</kbd> للسلة</li>
              <li><kbd>Shift</kbd> أسرع</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
