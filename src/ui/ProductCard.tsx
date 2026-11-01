"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, findProduct } from "@/game/state";
import { useCart, formatPrice } from "@/cart/cartStore";
import { sfx } from "@/audio/audio";

export function ProductCard() {
  const cardId = useGame((s) => s.cardId);
  const overlay = useGame((s) => s.overlay);
  const layout = useGame((s) => s.layout);
  const pp = findProduct(cardId);
  const [qty, setQty] = useState(1);
  const addBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setQty(1); addBtn.current?.focus(); }, [cardId]);
  if (overlay !== "card" || !pp) return null;
  const p = pp.product;
  const category = layout?.sections.find((s) => s.categoryId === p.categoryId)?.title;
  const close = () => { sfx.close(); useGame.getState().closeOverlay(); };
  const add = () => {
    useCart.getState().add(p, qty);
    sfx.addToCart();
    useGame.getState().showToast(`أُضيف «${p.name}» إلى السلة`);
    useGame.getState().closeOverlay();
  };
  return (
    <div className="scrim" onClick={close}>
      <article id="product-card" className="card" role="dialog" aria-modal="true" aria-labelledby="pc-title" onClick={(e) => e.stopPropagation()}>
        <div className="card-media" style={{ background: pp.color }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt={p.name} width={256} height={256} />
        </div>
        <div className="card-body">
          {category && <p className="eyebrow">{category}</p>}
          <h2 id="pc-title">{p.name}</h2>
          <p className="price">{formatPrice(p.price, p.currency)}</p>
          {p.description && <p className="desc">{p.description}</p>}
          {!p.available && <p className="stock-out">غير متوفر حاليًا</p>}
          <div className="card-actions">
            <div className="stepper" aria-label="الكمية">
              <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="زيادة">+</button>
              <output>{qty}</output>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="إنقاص">−</button>
            </div>
            <button ref={addBtn} id="add-to-cart" className="btn btn-primary" disabled={!p.available} onClick={add}>أضف إلى السلة</button>
          </div>
          <button className="link-btn" onClick={close}>متابعة التجوّل</button>
        </div>
      </article>
    </div>
  );
}
