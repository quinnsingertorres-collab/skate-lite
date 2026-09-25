"use client";
import { useState } from "react";

export default function SignIn() {
  const [mode, setMode] = useState("signin"); // signin | setup
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const switchMode = (m) => { setMode(m); setError(""); setNotice(""); setPassword(""); setConfirm(""); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(mode === "signin" ? "/api/auth/signin" : "/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signin" ? { id, password } : { id, password, confirm }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Something went wrong."); return; }
      if (mode === "setup") {
        setNotice("Your account has been created and is waiting for approval. You can sign in once it's approved.");
        setMode("signin"); setPassword(""); setConfirm("");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" aria-label="skate lite">skate<span>lite</span></div>
        <h1>{mode === "signin" ? "Sign in" : "Set up your account"}</h1>
        <p className="auth-sub">
          {mode === "signin"
            ? "Sign in with the ID number you were given for skate lite."
            : "Enter the ID number you were given and choose a password. The admin will approve your account."}
        </p>

        {notice && <div className="auth-notice" role="status">{notice}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>ID number</span>
            <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="username" required autoFocus />
          </label>
          <label>
            <span>{mode === "signin" ? "Password" : "New password"}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "setup" ? 8 : undefined} required />
          </label>
          {mode === "setup" && (
            <label>
              <span>Confirm password</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signin" ? (
            <>First time here? <button onClick={() => switchMode("setup")}>Set up your account</button></>
          ) : (
            <>Already set up? <button onClick={() => switchMode("signin")}>Sign in</button></>
          )}
        </div>
      </div>
      <p className="auth-foot">skate lite is an unofficial, independent app. Don&apos;t use your MBTA or work password here.</p>
    </main>
  );
}
