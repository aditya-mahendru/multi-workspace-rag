import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: authError } =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell login-shell">
      <div className="glass login-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-dot" />
          Workspace Assistant
        </div>
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Sign in to access your workspaces</p>
        <form onSubmit={onSubmit} className="login-form">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div className="error-text">{error}</div>}
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ marginTop: 6 }}>
            {busy ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} className="link-btn" style={{ marginTop: 16 }}>
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
