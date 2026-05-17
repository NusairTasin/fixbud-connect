import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "worker";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      setRole(null);
      return;
    }
    setRole((data?.role as AppRole) ?? null);
  };

  useEffect(() => {
    let initialSessionHandled = false;

    // onAuthStateChange fires synchronously with INITIAL_SESSION on mount,
    // so we use it as the single source of truth and skip the getSession role fetch
    // if it already ran — preventing the double fetchRole on startup.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setLoading(true);
        // Defer Supabase calls to avoid deadlocks inside the auth callback
        setTimeout(() => {
          fetchRole(newSession.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRole(null);
        setLoading(false);
      }
      initialSessionHandled = true;
    });

    // Fallback: if onAuthStateChange didn't fire synchronously (edge case),
    // getSession ensures we still resolve the initial state.
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (initialSessionHandled) return; // already handled above
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        fetchRole(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};