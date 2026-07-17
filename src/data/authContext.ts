/* React context wrapping useAccess so any screen can read the current
   role/scope without prop-drilling. */
import { createContext, useContext } from 'react';
import type { AuthState } from './useAccess';

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthContext.Provider>');
  return ctx;
}
