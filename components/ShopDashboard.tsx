"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ThemeSwitch from "./ThemeSwitch";
import { PICKUP_MINUTES, REASONS, type Category, type ShopOrder, type Status } from "@/lib/types";

type Board = { open: boolean; orders: ShopOrder[]; sales: number; count: number; stuck: number };
const HI: Record<string, string> = {
  "Orders": "ऑर्डर", "Menu": "मेन्यू", "Today": "आज", "Open": "खुला", "Closed": "बंद", "Open shop": "दुकान खोलें", "Close shop": "दुकान बंद करें", "Sign out": "साइन आउट",
  "To make": "बनाने हैं", "Ready": "तैयार", "Nothing to make": "कुछ बनाना नहीं", "Nothing waiting": "कुछ बाकी नहीं",
  "min": "मिनट", "Mark ready": "तैयार है", "Can't make it": "नहीं बना सकते", "Not collected": "लेने नहीं आए",
  "Pickup code": "पिकअप कोड", "Hand over": "ऑर्डर दें", "Handed over to": "ऑर्डर दिया:", "Turn on sound": "आवाज़ चालू करें", "Sound is on": "आवाज़ चालू है", "late": "देर", "Wants it at": "चाहिए:", "Wants it now": "अभी चाहिए", "Appearance": "रंग", "Light": "लाइट", "Dark": "डार्क", "System": "सिस्टम", "Ready at": "तैयार हुआ:", "Back": "वापस",
  "Item not available": "सामान नहीं है", "Too busy right now": "अभी बहुत भीड़ है", "Closing soon": "बंद होने वाला है", "Sold out": "ख़त्म", "Available": "उपलब्ध", "Search the menu": "मेन्यू में खोजें",
  "Orders sold": "ऑर्डर बिके", "Sales": "बिक्री", "No connection. Orders may be out of date.": "इंटरनेट नहीं है। ऑर्डर पुराने हो सकते हैं।", "Collected": "ले लिया", "Rejected": "मना किया", "Missed": "छूट गया", "Nothing yet today": "आज अभी कुछ नहीं", "Saved": "सेव हुआ", "refund(s) not going through. Add money to your Razorpay balance.": "रिफंड नहीं हो रहे। Razorpay बैलेंस में पैसे डालें।",
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function ShopDashboard({ initial, menu: startMenu }: { initial: Board; menu: Category[] }) {
  const [board, setBoard] = useState(initial), [menu, setMenu] = useState(startMenu);
  const [tab, setTab] = useState("Orders"), [hindi, setHindi] = useState(false), [sound, setSound] = useState(false);
  const [now, setNow] = useState(0), [offline, setOffline] = useState(false), [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [rejecting, setRejecting] = useState(""), [code, setCode] = useState(""), [q, setQ] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const t = (s: string) => (hindi && HI[s]) || s;

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/shop/orders");
      if (r.status === 401) { location.href = "/shop/login"; return; }
      if (!r.ok) throw new Error();
      setBoard(await r.json()); setOffline(false);
    } catch { setOffline(true); }
  }, []);
  useEffect(() => { const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);
  useEffect(() => { setNow(Date.now()); setHindi(localStorage.getItem("shop-hindi") === "1"); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const by = (...s: Status[]) => board.orders.filter((o) => s.includes(o.status));
  // Orders to make, soonest pickup first. "As soon as possible" orders count from when they were paid.
  const target = (o: ShopOrder) => o.pickup_at ?? o.placed_at ?? o.created_at;
  const toMake = by("placed").sort((a, b) => target(a).localeCompare(target(b))), ready = by("ready");
  useEffect(() => { document.title = toMake.length ? `(${toMake.length}) To make` : "Safal dashboard"; }, [toMake.length]);
  // Chime a few times when a new order arrives, not on every refresh.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = toMake.map((o) => o.id), arrived = known.current ? ids.some((id) => !known.current!.has(id)) : false;
    known.current = new Set(ids);
    const c = audio.current;
    if (!arrived || !sound || !c) return;
    // Three chimes, 2.5 seconds apart, scheduled on the audio clock so the next refresh can't cut them short.
    for (const start of [0, 2.5, 5]) [0, 0.2, 0.4].forEach((d, i) => {
      const o = c.createOscillator(), g = c.createGain(), at = c.currentTime + start + d;
      o.frequency.value = [880, 1100, 1320][i]; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      o.start(at); o.stop(at + 0.2);
    });
  }, [board, sound]);

  async function send(url: string, body: object, done?: (d: { student?: string }) => void) {
    if (busy) return;
    setBusy(url); setMessage(null);
    try {
      const r = await fetch(url, { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (r.status === 401) location.href = "/shop/login";
      else if (!r.ok) setMessage({ text: d.error, bad: true });
      else done?.(d);
    } catch { setMessage({ text: t("No connection. Orders may be out of date."), bad: true }); }
    setBusy(""); setRejecting(""); await load();
  }
  const act = (o: ShopOrder, body: object) => send(`/api/shop/orders/${o.id}`, body);

  const card = (o: ShopOrder) => {
    const due = Math.round((Date.parse(target(o)) - now) / 60000); // minutes until the student wants it
    const waited = o.ready_at && now - Date.parse(o.ready_at) > PICKUP_MINUTES * 60000;
    return <li key={o.id} className="ticket"><div className="ticket-head"><b>{o.student}</b>
      {now > 0 && (o.status === "ready" ? <span>{t("Ready at")} {clock(o.ready_at!)}</span>
        : !o.pickup_at ? <span className="late">{t("Wants it now")}</span>
        : <span className={due < 0 ? "late" : ""}>{clock(o.pickup_at)} · {due < 0 ? `${-due} ${t("min")} ${t("late")}` : `${due} ${t("min")}`}</span>)}</div>
      <ul className="ticket-lines">{o.lines.map((l, i) => <li key={i}><strong>{l.qty} ×</strong> {l.name}{l.size !== "Regular" && <em> {l.size}</em>}</li>)}</ul>
      {o.note && <p className="note">{o.note}</p>}
      {rejecting === o.id ? <div className="actions stack">{REASONS.map((r) => <button key={r} className="warn" disabled={!!busy} onClick={() => act(o, { action: "reject", reason: r })}>{t(r)}</button>)}<button className="plain" onClick={() => setRejecting("")}>{t("Back")}</button></div>
        : o.status === "ready" ? <>{waited && <button className="warn" disabled={!!busy} onClick={() => act(o, { action: "not_collected" })}>{t("Not collected")}</button>}</>
        : <><div className="actions"><button className="go" disabled={!!busy} onClick={() => act(o, { action: "ready" })}>{t("Mark ready")}</button></div>
          <button className="plain danger" onClick={() => setRejecting(o.id)}>{t("Can't make it")}</button></>}
    </li>;
  };
  const column = (title: string, list: ShopOrder[], empty: string, extra?: React.ReactNode) => <section className="col"><h2>{t(title)} <span>{list.length}</span></h2>{extra}
    {list.length ? <ul>{list.map(card)}</ul> : <p className="muted">{t(empty)}</p>}</section>;
  const past = by("collected", "rejected", "not_collected", "expired").reverse();

  return <div className="shop">
    <header className={board.open ? "shop-top" : "shop-top shut-bar"}><h1>Safal</h1><b>{t(board.open ? "Open" : "Closed")}</b>
      <button onClick={() => send("/api/shop/settings", { open: !board.open })} disabled={!!busy}>{t(board.open ? "Close shop" : "Open shop")}</button>
      <button aria-pressed={sound} onClick={() => { audio.current ??= new AudioContext(); void audio.current.resume(); setSound(!sound); }}>{t(sound ? "Sound is on" : "Turn on sound")}</button>
      <span className="grow" /><ThemeSwitch t={t} /><button lang={hindi ? "en" : "hi"} onClick={() => { localStorage.setItem("shop-hindi", hindi ? "0" : "1"); setHindi(!hindi); }}>{hindi ? "English" : "हिंदी"}</button>
      <button onClick={async () => { await fetch("/api/shop/logout", { method: "POST" }); location.href = "/shop/login"; }}>{t("Sign out")}</button></header>
    <nav className="tabs">{["Orders", "Menu", "Today"].map((x) => <button key={x} aria-current={tab === x ? "page" : undefined} onClick={() => setTab(x)}>{t(x)}{x === "Orders" && toMake.length > 0 && <i>{toMake.length}</i>}</button>)}</nav>
    {offline && <p className="alert bad" role="alert">{t("No connection. Orders may be out of date.")}</p>}
    {board.stuck > 0 && <p className="alert bad" role="alert">{board.stuck} {t("refund(s) not going through. Add money to your Razorpay balance.")}</p>}
    {message && <p className={message.bad ? "alert bad" : "alert"} role="status">{message.text}</p>}
    {tab === "Orders" && <>
      {/* Handing over works for any paid order, so the code box sits above both lists. */}
      <form className="handover" onSubmit={(e) => { e.preventDefault(); void send("/api/shop/collect", { code }, (d) => { setCode(""); setMessage({ text: `${t("Handed over to")} ${d.student}`, bad: false }); }); }}>
        <input aria-label={t("Pickup code")} placeholder={t("Pickup code")} inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /><button className="go" disabled={code.length !== 4 || !!busy}>{t("Hand over")}</button></form>
      <div className="cols">{column("To make", toMake, "Nothing to make")}{column("Ready", ready, "Nothing waiting")}</div></>}
    {tab === "Menu" && <div className="manage"><input type="search" aria-label={t("Search the menu")} placeholder={t("Search the menu")} value={q} onChange={(e) => setQ(e.target.value)} />
      {menu.map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase())) })).filter((c) => c.items.length).map((c) => <section key={c.name}><h2>{c.name}</h2><ul>{c.items.map((i) => <li key={i.id}><b>{i.name}</b>
        <div className="prices">{i.variants.map((v) => <label key={v.id}>{v.size !== "Regular" && v.size} ₹<input key={v.price} aria-label={`${i.name} ${v.size} price`} inputMode="numeric" defaultValue={v.price} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={(e) => {
          const el = e.currentTarget, price = Number(el.value); if (price === v.price) return;
          let ok = false;
          void send("/api/shop/menu", { variantId: v.id, price }, () => { ok = true; v.price = price; setMenu([...menu]); setMessage({ text: `${t("Saved")}: ${i.name} ₹${price}`, bad: false }); }).then(() => { if (!ok) el.value = String(v.price); });
        }} /></label>)}</div>
        <button className={i.available ? "soft" : "warn"} aria-pressed={!i.available} aria-label={`${i.name}: ${i.available ? "available" : "sold out"}`} disabled={!!busy} onClick={() => send("/api/shop/menu", { itemId: i.id, available: !i.available }, () => { i.available = !i.available; setMenu([...menu]); })}>{t(i.available ? "Available" : "Sold out")}</button></li>)}</ul></section>)}</div>}
    {tab === "Today" && <div className="manage"><div className="totals"><p><strong>{board.count}</strong>{t("Orders sold")}</p><p><strong>₹{board.sales}</strong>{t("Sales")}</p></div>
      {!past.length && <p className="muted">{t("Nothing yet today")}</p>}
      <ul>{past.map((o) => <li key={o.id}><b>{o.student}</b><span className="muted">{o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</span><span>₹{o.total}, {t(o.status === "collected" ? "Collected" : o.status === "rejected" ? "Rejected" : o.status === "expired" ? "Missed" : "Not collected")}</span></li>)}</ul></div>}
  </div>;
}
