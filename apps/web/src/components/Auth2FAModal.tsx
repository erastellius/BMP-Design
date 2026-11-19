import { useState } from "react";
import { KeyRound, LogOut, ShieldCheck, X } from "lucide-react";
import { useCanvasStore } from "../store/useCanvasStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Auth2FAModal({ open, onClose, onAuthenticated }: {
  open: boolean;
  onClose: () => void;
  onAuthenticated?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "2fa" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [resetToken, setResetToken] = useState("");
  const [message, setMessage] = useState("");
  const user = useCanvasStore(state => state.currentUser);

  if (!open) return null;

  const call = async (path: string, body: object) => {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const login = async () => {
    try {
      const data = await call("/api/auth/login", { email, password });
      setChallengeToken(data.challengeToken);
      if (data.mfaRequired) setMode("2fa");
      else {
        const setup = await call("/api/auth/2fa/setup", { challengeToken: data.challengeToken });
        setQr(setup.qrDataUrl);
        setBackupCodes(setup.backupCodes);
        setMode("2fa");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Login failed"); }
  };

  const register = async () => {
    try {
      await call("/api/auth/register", { email, password });
      setMessage("Account created. Sign in to continue.");
      setMode("login");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Registration failed"); }
  };

  const verify = async () => {
    try {
      const data = await call("/api/auth/2fa/verify", { challengeToken, code });
      useCanvasStore.getState().setCurrentUser(data.user);
      setMessage("Authenticated");
      onAuthenticated?.();
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed"); }
  };

  const logoutAll = async () => {
    try {
      await call("/api/auth/logout-all", {});
      useCanvasStore.getState().setCurrentUser(null);
      useCanvasStore.getState().setActiveProject(null);
      setMessage("Signed out of all devices");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Logout failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="panel w-full max-w-md rounded-2xl p-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-amber-400" /><h2 className="font-semibold">{mode === "2fa" ? "Two-Factor Verification" : "Account"}</h2></div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {user ? (
          <div className="mt-5">
            <p className="text-sm text-white/70">{user.email} · {user.role}</p>
            <button onClick={logoutAll} className="mt-4 w-full rounded-lg border border-white/10 py-2 flex justify-center gap-2"><LogOut size={16} /> Log out of all devices</button>
          </div>
        ) : mode === "2fa" ? (
          <div className="mt-5">
            {qr && <div className="grid place-items-center"><img src={qr} alt="TOTP QR code" className="w-44 h-44 rounded-lg bg-white p-2" /></div>}
            {backupCodes.length > 0 && (
              <div className="mt-3 rounded-lg bg-black/20 p-3">
                <p className="text-xs text-amber-300 mb-2">Save these one-time backup codes</p>
                <div className="grid grid-cols-2 gap-1 text-xs font-mono">{backupCodes.map(code => <span key={code}>{code}</span>)}</div>
              </div>
            )}
            <label className="mt-4 block text-sm text-white/60">Authenticator or backup code
              <input value={code} onChange={event => setCode(event.target.value)} maxLength={20} className="mt-1 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-3 text-center tracking-[.35em]" />
            </label>
            <button onClick={verify} className="mt-4 w-full rounded-lg bg-amber-500 text-black font-semibold py-2.5">Verify</button>
          </div>
        ) : mode === "forgot" ? (
          <div className="mt-5 space-y-3">
            <input value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
            <button onClick={async () => {
              try { const data = await call("/api/auth/password/forgot", { email }); if (data.resetToken) setResetToken(data.resetToken); setMessage("If the account exists, a reset token is available."); setMode("reset"); } catch (error) { setMessage(String(error)); }
            }} className="w-full rounded-lg bg-amber-500 text-black font-semibold py-2.5">Send reset token</button>
            <button onClick={() => setMode("login")} className="w-full text-sm text-white/50">Back to login</button>
          </div>
        ) : mode === "reset" ? (
          <div className="mt-5 space-y-3">
            <input value={resetToken} onChange={event => setResetToken(event.target.value)} placeholder="Reset token" className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
            <input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="New 12-character password" className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
            <button onClick={async () => {
              try { await call("/api/auth/password/reset", { token: resetToken, password }); setMessage("Password reset. Please sign in."); setMode("login"); } catch (error) { setMessage(error instanceof Error ? error.message : "Reset failed"); }
            }} className="w-full rounded-lg bg-amber-500 text-black font-semibold py-2.5">Reset password</button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <input value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
            <input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="Password" className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
            <button onClick={mode === "login" ? login : register} className="w-full rounded-lg bg-amber-500 text-black font-semibold py-2.5 flex justify-center gap-2"><KeyRound size={17} /> {mode === "login" ? "Log in" : "Register"}</button>
            <div className="flex justify-between text-xs text-white/50">
              <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create account" : "Already registered"}</button>
              {mode === "login" && <button onClick={() => setMode("forgot")}>Forgot password</button>}
            </div>
          </div>
        )}
        {message && <p className="mt-3 text-center text-xs text-amber-300">{message}</p>}
      </div>
    </div>
  );
}
