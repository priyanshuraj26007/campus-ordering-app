"use client";
import { useState } from "react";
export default function LoginForm() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <form onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    const email = new FormData(e.currentTarget).get("email");
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) { location.href = "/"; return; }
      setError((await r.json()).error);
    } catch { setError("Couldn't connect. Try again."); }
    setBusy(false);
  }}>
    <label htmlFor="email">NSUT email</label>
    <input id="email" name="email" type="email" required autoComplete="email" placeholder="first.last.ug23@nsut.ac.in" />
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
    <p className="muted">Doesn&apos;t check the email. Turned off in production.</p>
  </form>;
}
