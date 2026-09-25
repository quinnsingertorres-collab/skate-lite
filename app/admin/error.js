"use client";
// Shown instead of a blank page if the admin panel hits an error.
export default function AdminError({ error, reset }) {
  return (
    <main className="admin-page">
      <div className="acct-card">
        <h2>The admin panel hit a problem</h2>
        <p className="muted">{String(error?.message || error || "Unknown error")}</p>
        <p style={{ display: "flex", gap: 8 }}>
          <button className="acct-btn acct-btn--primary" onClick={() => reset()}>Try again</button>
          <a className="acct-btn" href="/admin/signin">Sign in again</a>
        </p>
      </div>
    </main>
  );
}
