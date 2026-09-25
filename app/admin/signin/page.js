"use client";
import { useState } from "react";

export default function AdminSignIn() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Something went wrong."); return; }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/admin") ? next : "/admin";
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-page--admin">
      <div className="auth-card">
        <div className="auth-logo" aria-label="skate lite admin">skate<span>admin</span></div>
        <h1>Admin sign-in</h1>
        <p className="auth-sub">For managing ID numbers and approving accounts. This is separate from the app sign-in.</p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Admin ID</span>
            <input value={id} onChange={(e) => setId(e.target.value.trim())} autoComplete="username" required autoFocus />
          </label>
          <label>
            <span>Admin password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : "Sign in to admin"}</button>
        </form>

        <div className="auth-switch"><a href="/signin">Go to the app sign-in</a></div>
      </div>
      <p className="auth-foot">skate lite is an unofficial, independent app. Don&apos;t use your MBTA or work password here.</p>
    </main>
  );
}
