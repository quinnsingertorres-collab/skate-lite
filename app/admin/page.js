"use client";
import { useCallback, useEffect, useState } from "react";

const when = (ms) => (ms ? new Date(Number(ms)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

const SECTIONS = [
  { status: "pending", title: "Waiting for approval", empty: "No one is waiting." },
  { status: "approved", title: "Active", empty: "No active accounts yet." },
  { status: "invited", title: "IDs not set up yet", empty: "No unused IDs." },
  { status: "disabled", title: "Disabled", empty: "None." },
];

function Row({ u, act, busyId }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const busy = busyId === u.id;
  return (
    <tr>
      <td className="acct-id">{u.id}</td>
      <td>
        {editing ? (
          <input
            className="acct-name-input"
            defaultValue={u.name}
            autoFocus
            maxLength={60}
            onBlur={(e) => { setEditing(false); if (e.target.value !== u.name) act(u.id, "rename", e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }}
          />
        ) : (
          <button className="acct-name" onClick={() => setEditing(true)} title="Click to rename">{u.name || <span className="muted">Add name</span>}</button>
        )}
      </td>
      <td className="acct-date hide-sm">
        {u.status === "pending" ? `Requested ${when(u.requestedAt)}` : u.status === "approved" ? (u.lastLogin ? `Last sign-in ${when(u.lastLogin)}` : `Approved ${when(u.approvedAt)}`) : `Created ${when(u.createdAt)}`}
      </td>
      <td className="acct-actions">
        {u.status === "pending" && (
          <>
            <button className="acct-btn acct-btn--primary" disabled={busy} onClick={() => act(u.id, "approve")}>Approve</button>
            <button className="acct-btn" disabled={busy} onClick={() => act(u.id, "reject")}>Reject</button>
          </>
        )}
        {u.status === "approved" && (
          <>
            <button className="acct-btn" disabled={busy} onClick={() => act(u.id, "reset")} title="Clears the password so they can set a new one (needs approval again)">Reset password</button>
            <button className="acct-btn" disabled={busy} onClick={() => act(u.id, "disable")}>Disable</button>
          </>
        )}
        {u.status === "disabled" && (
          <button className="acct-btn" disabled={busy} onClick={() => act(u.id, "enable")}>Enable</button>
        )}
        {u.status === "invited" && (
          <button className="acct-btn" onClick={() => navigator.clipboard?.writeText(u.id)}>Copy ID</button>
        )}
        {confirmDelete ? (
          <>
            <button className="acct-btn acct-btn--danger" disabled={busy} onClick={() => act(u.id, "delete")}>Confirm delete</button>
            <button className="acct-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button className="acct-btn acct-btn--ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </td>
    </tr>
  );
}

async function signOut() {
  await fetch("/api/admin/signout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/signin";
}

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [created, setCreated] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/admin/signin"; return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `Couldn't load accounts (error ${r.status}).`); setUsers((u) => u || []); }
      else { setError(""); setUsers(Array.isArray(d.users) ? d.users : []); }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setUsers((u) => u || []);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setError(""); setCreated(null);
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newId, name: newName }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || "Couldn't create ID."); return; }
    setCreated(d.user); setNewId(""); setNewName("");
    load();
  }

  async function act(id, action, name) {
    setBusyId(id); setError("");
    const r = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action, name }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "That didn't work.");
    setBusyId(null);
    load();
  }

  const pendingCount = users?.filter((u) => u.status === "pending").length || 0;

  return (
    <main className="admin-page">
      <header className="admin-top">
        <div className="admin-top-row">
          <a href="/" className="admin-back">← Open skate</a>
          <button className="acct-btn" onClick={signOut}>Sign out of admin</button>
        </div>
        <h1>Accounts{pendingCount ? <span className="acct-badge">{pendingCount} waiting</span> : null}</h1>
      </header>

      <section className="acct-card">
        <h2>Create an ID number</h2>
        <p className="muted">Give the ID to the person. They choose their own password on the sign-in page (“Set up your account”), then you approve them here.</p>
        <form className="acct-create" onSubmit={create}>
          <label>
            <span>Name (optional)</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Who is this for?" />
          </label>
          <label>
            <span>ID number (optional)</span>
            <input value={newId} onChange={(e) => setNewId(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Leave blank for a random 6-digit ID" />
          </label>
          <button className="acct-btn acct-btn--primary">Create ID</button>
        </form>
        {created && (
          <div className="acct-created" role="status">
            New ID <b>{created.id}</b>{created.name ? ` for ${created.name}` : ""}.
            <button className="acct-btn" onClick={() => navigator.clipboard?.writeText(created.id)}>Copy</button>
          </div>
        )}
      </section>

      {error && <div className="auth-error" role="alert">{error}</div>}

      {SECTIONS.map((s) => {
        const list = (users || []).filter((u) => u.status === s.status);
        return (
          <section key={s.status} className={`acct-card${s.status === "pending" && list.length ? " acct-card--attention" : ""}`}>
            <h2>{s.title} <span className="acct-count">{users ? list.length : ""}</span></h2>
            {!users ? (
              <p className="muted">Loading…</p>
            ) : list.length === 0 ? (
              <p className="muted">{s.empty}</p>
            ) : (
              <div className="acct-table-wrap">
                <table className="acct-table">
                  <tbody>
                    {list.map((u) => <Row key={u.id} u={u} act={act} busyId={busyId} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
