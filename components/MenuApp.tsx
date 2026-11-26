"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FoodArt from "./FoodArt";
import Sheet, { type SheetHandle } from "./Sheet";
import { ThemeMenu } from "./ThemeSwitch";
import { ORDER_LIMIT, type Category, type Item } from "@/lib/types";

type Props = { menu: Category[]; open: boolean; activeId: string | null; email: string };
const anchor = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, "-");

export default function MenuApp({ menu, open, activeId, email }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(""), [current, setCurrent] = useState(menu[0]?.name);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [picking, setPicking] = useState<Item | null>(null);
  const [note, setNote] = useState(""), [pickupIn, setPickupIn] = useState(0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const loaded = useRef(false), rail = useRef<HTMLElement>(null);
  const sizeBox = useRef<SheetHandle>(null), cartBox = useRef<SheetHandle>(null);
  const key = `cart:${email}`;

  const variants = useMemo(() => new Map(menu.flatMap((c) => c.items.flatMap((i) =>
    i.variants.map((v) => [v.id, { ...v, item: i }] as const)))), [menu]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      setCart(Object.fromEntries(Object.entries(saved).filter(([id, n]) => variants.has(+id) && Number.isInteger(n) && (n as number) > 0)) as Record<number, number>);
    } catch { /* ignore a damaged saved cart */ }
  }, [key, variants]);
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; return; }
    localStorage.setItem(key, JSON.stringify(cart));
  }, [cart, key]);
  useEffect(() => {
    const seen = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setCurrent((e.target as HTMLElement).dataset.name!)), { rootMargin: "-25% 0px -70% 0px" });
    document.querySelectorAll("section[data-name]").forEach((s) => seen.observe(s));
    const top = () => scrollY < 120 && setCurrent(menu[0]?.name);
    addEventListener("scroll", top, { passive: true });
    return () => { seen.disconnect(); removeEventListener("scroll", top); };
  }, [q, menu]);
  useEffect(() => {
    const r = rail.current, a = r?.querySelector<HTMLElement>("[aria-current]");
    if (r && a) r.scrollTo({ left: a.offsetLeft - r.clientWidth / 2 + a.clientWidth / 2 });
  }, [current]);

  const change = (id: number, d: number) => setCart((c) => {
    const n = Math.min(20, (c[id] ?? 0) + d), next = { ...c };
    if (n <= 0) delete next[id]; else next[id] = n;
    return next;
  });
  const lines = Object.entries(cart).map(([id, qty]) => ({ v: variants.get(+id)!, qty })).filter((l) => l.v);
  const total = lines.reduce((s, l) => s + l.v.price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const shown = menu.map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase())) })).filter((c) => c.items.length);

  const add = (i: Item) => {
    if (i.variants.length === 1) change(i.variants[0].id, 1);
    else { setPicking(i); sizeBox.current?.open(); }
  };
  const stepper = (id: number, name: string) => <span className="stepper">
    <button aria-label={`Remove one ${name}`} onClick={() => change(id, -1)}>−</button><b>{cart[id]}</b>
    <button aria-label={`Add one ${name}`} onClick={() => change(id, 1)}>+</button></span>;

  async function place() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines.map((l) => ({ variantId: l.v.id, qty: l.qty })), note, pickupIn }) });
      const d = await r.json();
      if (r.ok) { localStorage.removeItem(key); router.push(`/orders/${d.id}?pay=1`); router.refresh(); return; }
      setError(d.error);
    } catch { setError("Couldn't connect. Check My orders before trying again."); }
    setBusy(false);
  }

  const cartView = <div className="cart"><h2>Your order</h2>
    {!count ? <div className="empty"><FoodArt name="Mango Shake" /><p className="muted">Nothing here yet. Add something from the menu.</p></div> : <>
      <ul className="lines">{lines.map(({ v, qty }) => <li key={v.id}><div><b>{v.item.name}</b>
        <span className="muted">{v.size !== "Regular" && `${v.size}, `}₹{v.price * qty}{!v.item.available && ", sold out"}</span></div>{stepper(v.id, v.item.name)}</li>)}</ul>
      <div role="group" aria-label="Pickup time"><span className="label">Pick up</span><div className="times">{[0, 15, 30, 45, 60].map((m) =>
        <button key={m} aria-pressed={pickupIn === m} onClick={() => setPickupIn(m)}>{m ? `${m} min` : "ASAP"}</button>)}</div></div>
      <label className="label">Note for Safal<input maxLength={200} placeholder="No sugar, less spicy…" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="total"><span>Total</span><b>₹{total}</b></p>
      {total > ORDER_LIMIT && <p className="error">Orders are limited to ₹{ORDER_LIMIT}. Remove ₹{total - ORDER_LIMIT} or more.</p>}
      {activeId && <p className="error">You already have an active order.</p>}
      {!open && <p className="error">Safal isn&apos;t taking orders right now.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted">Once paid, your order goes straight to Safal and can&apos;t be cancelled. Orders that aren&apos;t collected aren&apos;t refunded.</p>
      <button className="primary" disabled={busy || total > ORDER_LIMIT || !open || !!activeId} onClick={place}>{busy ? "One moment…" : `Continue to pay ₹${total}`}</button></>}
  </div>;

  return <>
    <header className="top"><div className="wrap bar"><Link href="/" className="brand">Campus Order</Link>
      <nav><ThemeMenu /><Link href="/orders">My orders</Link>
        <button onClick={async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/login"; }}>Sign out</button></nav></div></header>
    <div className="hero"><div className="wrap"><div><span className={open ? "status" : "status shut"}>{open ? "Taking orders" : "Closed"}</span>
      <h1>Safal</h1><p>Order now, skip the line, pick up with a code.</p></div>
      <div className="hero-art" aria-hidden>{["Kiwi Mint Mojito", "Mango Shake", "Pomegranate Mojito", "Cheese Burger"].map((n) => <FoodArt key={n} name={n} />)}</div></div></div>
    <div className="find"><div className="wrap"><input type="search" aria-label="Search the menu" placeholder="Search momos, juice, Maggi…" value={q} onChange={(e) => setQ(e.target.value)} />
      <nav className="rail" ref={rail} aria-label="Menu categories">{shown.map((c) => <a key={c.name} href={`#${anchor(c.name)}`} aria-current={c.name === current ? "true" : undefined}>{c.name}</a>)}</nav></div></div>
    <div className="wrap layout"><main className="menu">
      {activeId && <Link className="banner" href={`/orders/${activeId}`}><span>You have an active order</span><span>View →</span></Link>}
      {!shown.length && <p className="muted">Nothing matches “{q}”. Try a shorter word.</p>}
      {shown.map((c) => <section key={c.name} id={anchor(c.name)} data-name={c.name}><h2>{c.name}</h2><ul className="grid">
        {c.items.map((i) => {
          const single = i.variants.length === 1 ? i.variants[0] : null;
          const n = i.variants.reduce((s, v) => s + (cart[v.id] ?? 0), 0);
          return <li key={i.id} className={i.available ? "item" : "item sold"}><FoodArt name={i.name} /><div><b>{i.name}</b>
            {i.portion && <span className="muted">{i.portion}</span>}<span className="price">{single ? `₹${single.price}` : `₹${i.variants[0].price} – ₹${i.variants.at(-1)!.price}`}</span></div>
            {!i.available ? <span className="muted">Sold out</span> : single && n ? stepper(single.id, i.name)
              : <button className={n ? "add has" : "add"} aria-label={`Add ${i.name}`} onClick={() => add(i)}>{n ? `${n} added` : "Add"}</button>}</li>;
        })}</ul></section>)}
    </main><aside>{cartView}</aside></div>
    {count > 0 && <button className="cartbar" onClick={() => { setError(""); cartBox.current?.open(); }}><span>{count} item{count > 1 && "s"} · ₹{total}</span><span>View order</span></button>}

    <Sheet ref={sizeBox} label="Choose a size">
      {picking && <div className="sheet-head"><FoodArt name={picking.name} /><h2>{picking.name}</h2></div>}
      <ul className="lines">{picking?.variants.map((v) => <li key={v.id}><div><b>{v.size}</b><span className="muted">₹{v.price}</span></div>
        {cart[v.id] ? stepper(v.id, `${v.size} ${picking.name}`) : <button className="add" aria-label={`Add ${v.size} ${picking.name}`} onClick={() => change(v.id, 1)}>Add</button>}</li>)}</ul>
      <button className="primary" onClick={() => sizeBox.current?.close()}>Done</button></Sheet>
    <Sheet ref={cartBox} label="Your order">{cartView}
      <button className="plain" onClick={() => cartBox.current?.close()}>Keep browsing</button></Sheet>
  </>;
}
