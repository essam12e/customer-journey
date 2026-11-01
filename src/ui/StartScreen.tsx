"use client";
import { useState } from "react";
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

export function StartScreen({ demo, onLayout }: { demo: StoreLayout; onLayout: (l: StoreLayout) => void }) {
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

  const convert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/store/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await r.json();
      if (data.ok) {
        setMsg({ tone: "ok", text: `تم تحويل «${data.layout.store.name}»: ${data.layout.products.length} منتج` });
        enter(data.layout);
      } else {
        setMsg({ tone: "err", text: data.error.kind === "auth_required" ? data.error.message : ERR[data.error.kind] ?? data.error.message });
      }
    } catch {
      setMsg({ tone: "err", text: ERR.network });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="start">
      <div className="start-panel">
        <p className="eyebrow">Customer Journey</p>
        <h1 className="title">رحلة العميل</h1>
        <p className="lede">متجرك الإلكتروني يصير مكانًا يمشي فيه عميلك: يدخل من الباب، يتجوّل بين الأرفف، ويضع ما يعجبه في السلة.</p>

        <button id="enter-demo" className="btn btn-primary btn-big" onClick={() => enter(demo)}>
          ادخل متجر «{demo.store.name}»
        </button>

        {process.env.NEXT_PUBLIC_STATIC === "1" ? (
          <p className="fine import">نسخة تجريبية للعب. تحويل روابط المتاجر يعمل في النسخة الكاملة المشغّلة على خادم.</p>
        ) : (
        <form className="import" onSubmit={convert}>
          <label htmlFor="store-url">أو حوّل رابط متجرك</label>
          <div className="import-row">
            <input id="store-url" dir="ltr" inputMode="url" autoComplete="url" placeholder="https://your-store.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn btn-ghost" disabled={busy || !url.trim()}>{busy ? "جارٍ التحليل…" : "حوّل"}</button>
          </div>
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
