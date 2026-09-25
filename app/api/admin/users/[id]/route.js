import { json, requireAdmin } from "@/lib/authServer";
import { cleanId, deleteUser, getUser, renameUser, resetUser, setStatus } from "@/lib/users";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  if (!(await requireAdmin(req))) return json({ error: "Admins only" }, 403);
  const id = cleanId((await params).id);
  const { action, name } = await req.json().catch(() => ({}));
  try {
    const u = await getUser(id);
    if (!u) return json({ error: "No such ID" }, 404);
    let user;
    if (action === "approve" || action === "enable") user = await setStatus(id, "approved");
    else if (action === "disable" || action === "reject") user = await setStatus(id, "disabled");
    else if (action === "reset") user = await resetUser(id);
    else if (action === "rename") user = await renameUser(id, name);
    else return json({ error: "Unknown action" }, 400);
    return json({ user });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function DELETE(req, { params }) {
  if (!(await requireAdmin(req))) return json({ error: "Admins only" }, 403);
  await deleteUser(cleanId((await params).id));
  return json({ ok: true });
}
