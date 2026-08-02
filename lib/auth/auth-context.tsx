"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { AuthClient, type AuthSnapshot } from "./auth-client";
import type { Credentials } from "../types";

type AuthContextValue = AuthSnapshot & {
  login(credentials: Credentials): Promise<void>;
  register(credentials: Credentials): Promise<void>;
  logout(): Promise<void>;
  authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new AuthClient());
  const [actions] = useState(() => ({
    login: client.login.bind(client),
    register: client.register.bind(client),
    logout: client.logout.bind(client),
    authFetch: client.authFetch.bind(client),
  }));
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  useEffect(() => {
    void client.bootstrap();
  }, [client]);

  return (
    <AuthContext.Provider
      value={{
        ...snapshot,
        ...actions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
