"use client";
import { useState } from "react";
export default function ShopLogin() {
  const [error, setError] = useState("");
  return <form className="cart" onSubmit={async (e) => {
    e.preventDefault(); setError("");
    const passcode = new FormData(e.currentTarget).get("passcode");
    try {
      const r = await fetch("/api/shop/login", { method: "POST", body: JSON.stringify({ passcode }) });
      if (r.ok) location.href = "/shop"; else setError((await r.json()).error);
    } catch { setError("Couldn't connect. Try again."); }
  }}><label className="label">Passcode<input name="passcode" type="password" inputMode="numeric" autoComplete="current-password" required /></label>
    {error && <p className="error" role="alert">{error}</p>}<button className="primary">Sign in</button></form>;
}
