"use client";
import { useGame } from "@/game/state";
import { useCart, cartCount, cartTotal, formatPrice } from "@/cart/cartStore";
import { planCheckout } from "@/cart/checkout";
import { sfx } from "@/audio/audio";

export function CartPanel() {
  const overlay = useGame((s) => s.overlay);
  const layout = useGame((s) => s.layout);
  const { lines, setQty, remove } = useCart();
  if ((overlay !== "cart" && overlay !== "checkout") || !layout) return null;
  const currency = lines[0]?.currency ?? layout.store.currency;
  const close = () => { sfx.close(); useGame.getState().closeOverlay(); };
  const plan = overlay === "checkout" ? planCheckout(layout.store.platform, lines, layout.store.platform === "shopify" ? { shopifyDomain: new URL(layout.store.sourceUrl).host } : undefined) : null;

  return (
    <div className="scrim" onClick={close}>
      <aside id="cart-panel" className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2 id="cart-title">سلتك <small>{cartCount(lines)} منتج</small></h2>
          <button className="icon-btn" onClick={close} aria-label="إغلاق السلة">✕</button>
        </header>
        {lines.length === 0 ? (
          <div className="empty">
            <p>السلة فارغة.</p>
            <p className="fine">اقترب من أي منتج على الرف واضغط عليه لإضافته.</p>
          </div>
        ) : (
          <ul className="lines">
            {lines.map((l) => (
              <li key={l.id} className="line" data-id={l.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.image} alt="" width={56} height={56} />
                <div className="line-info">
                  <b>{l.name}</b>
                  <span>{formatPrice(l.price * l.qty, l.currency)}</span>
                </div>
                <div className="stepper small">
                  <button onClick={() => setQty(l.id, l.qty + 1)} aria-label={`زيادة ${l.name}`}>+</button>
                  <output className="qty">{l.qty}</output>
                  <button onClick={() => setQty(l.id, l.qty - 1)} aria-label={`إنقاص ${l.name}`}>−</button>
                </div>
                <button className="link-btn danger" onClick={() => remove(l.id)} aria-label={`حذف ${l.name}`}>حذف</button>
              </li>
            ))}
          </ul>
        )}
        <footer className="drawer-foot">
          <div className="total"><span>الإجمالي</span><b id="cart-total">{formatPrice(cartTotal(lines), currency)}</b></div>
          {plan ? (
            <div className={`checkout-note ${plan.kind}`} id="checkout-note">
              <p>{plan.message}</p>
              {plan.kind === "redirect" && <a className="btn btn-primary" href={plan.url} target="_blank" rel="noopener noreferrer">المتابعة إلى دفع المتجر</a>}
              <button className="link-btn" onClick={() => useGame.getState().openCart()}>رجوع للسلة</button>
            </div>
          ) : (
            <button id="checkout" className="btn btn-primary" disabled={lines.length === 0} onClick={() => useGame.getState().openCheckout()}>إتمام الشراء</button>
          )}
        </footer>
      </aside>
    </div>
  );
}
