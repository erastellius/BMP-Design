import { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function AdminUsersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<Array<{ id: number; email: string; role: string; is_active: number }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/admin/users`, { credentials: "include" })
      .then(async response => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Admin access required");
        setUsers(data);
      })
      .catch(error => setError(error.message));
  }, [open]);

  if (!open) return null;
  const revoke = async (id: number, suspend: boolean) => {
    const response = await fetch(`${API}/api/admin/users/${id}/revoke`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suspend })
    });
    if (response.ok) setUsers(list => list.map(user => user.id === id ? { ...user, is_active: suspend ? 0 : user.is_active } : user));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="panel w-full max-w-2xl rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2"><Shield size={18} className="text-amber-400" /><h2 className="font-semibold">Admin User Control</h2></div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {error ? <p className="mt-5 text-red-300">{error}</p> : (
          <div className="mt-4 space-y-2">
            {users.map(user => (
              <div key={user.id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between">
                <div><p className="text-sm">{user.email}</p><p className="text-xs text-white/40">{user.role} · {user.is_active ? "Active" : "Suspended"}</p></div>
                <div className="flex gap-2">
                  <button onClick={() => revoke(user.id, false)} className="text-xs rounded-md border border-white/10 px-2 py-1">Revoke sessions</button>
                  {user.role !== "admin" && <button onClick={() => revoke(user.id, true)} className="text-xs rounded-md border border-red-400/30 text-red-300 px-2 py-1">Suspend</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
