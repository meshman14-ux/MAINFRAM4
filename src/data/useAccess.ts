/* ============================================================
   useAccess — the auth + authorization hook.
   ------------------------------------------------------------
   Resolves the current Supabase session and the user's mf_access
   row (role + client/staff scope). Every screen reads this to
   decide what it may show. The RLS policies enforce the same
   rules server-side; this hook is the client-side mirror so the
   UI shows the right thing (and hides what the user can't touch).
   ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { opsData } from './opsData';
import type { Role } from './types';

export interface Access {
  role: Role;
  clientId?: string;   // scope for client / crew
  staffId?: string;    // crew's own staff row
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  email: string | null;
  access: Access | null;      // null = signed in but no mf_access row yet
  error: string | null;
  isOperator: boolean;        // owner | manager
  isRecovery: boolean;        // arrived via a password-reset link
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export function useAccess(): AuthState {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);

  const loadAccess = useCallback(async (uid: string) => {
    // Read the caller's own mf_access row (its RLS policy allows self-read).
    const { data, error } = await supabase
      .from('mf_access')
      .select('role, client_id, staff_id')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) { setError(error.message); setAccess(null); return; }
    if (!data) { setAccess(null); return; }   // signed in, not provisioned
    setAccess({
      role: data.role as Role,
      clientId: data.client_id ?? undefined,
      staffId: data.staff_id ?? undefined,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    // Initial session (from persisted storage).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadAccess(data.session.user.id);
      setLoading(false);
    });

    // React to sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!mounted) return;
      setSession(sess);
      setError(null);
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      if (event === 'SIGNED_OUT') {
        setIsRecovery(false);
        opsData.reset();   // clear the mirror + realtime channel (audit M1)
      }
      if (sess?.user) await loadAccess(sess.user.id);
      else setAccess(null);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return { error: error.message }; }
    return {};
  }, []);

  /** Send a password-reset email. The link returns the user to the app with a
      recovery session, where updatePassword completes the flow. */
  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) { setError(error.message); return { error: error.message }; }
    return {};
  }, []);

  /** Set a new password for the current (recovery) session. */
  const updatePassword = useCallback(async (newPassword: string) => {
    setError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setError(error.message); return { error: error.message }; }
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAccess(null);
  }, []);

  return {
    loading,
    session,
    email: session?.user?.email ?? null,
    access,
    error,
    isOperator: access?.role === 'owner' || access?.role === 'manager',
    isRecovery,
    signIn,
    resetPassword,
    updatePassword,
    signOut,
  };
}
