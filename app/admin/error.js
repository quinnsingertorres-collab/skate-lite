"use client";
// Shown instead of a blank page if the admin panel hits an error.
export default function AdminError({ error, reset }) {
  return (
    <main className="admin-page">
      <div className="ad-card">
        <h2>The admin panel hit a problem</h2>
        <p className="muted">{String(error?.message || error || "Unknown error")}</p>
        <p style={{ display: "flex", gap: 8 }}>
          <button className="ad-btn ad-btn--primary" onClick={() => reset()}>Try again</button>
          <a className="ad-btn" href="/admin/signin">Sign in again</a>
        </p>
      </div>
    </main>
  );
}
