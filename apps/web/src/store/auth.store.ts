import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface OrgContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  org: OrgContext | null;
  setAuth: (token: string, refreshToken: string, user: User, org: OrgContext) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      org: null,

      setAuth: (token, refreshToken, user, org) => {
        // 🔴 Fix 1: Double storage hatao — persist middleware khud handle karta hai
        // localStorage.setItem("mpc_token", token) ← remove kiya
        // Lekin api.ts "mpc_token" padhta hai, isliye sync rakhna zaroori hai
        if (typeof window !== "undefined") {
          localStorage.setItem("mpc_token", token); // api.ts ke liye
        }
        set({ token, refreshToken, user, org });
      },

      clearAuth: () => {
        if (typeof window !== "undefined") {
          // 🔴 Fix 2: Dono keys remove karo — mpc_token aur mpc-auth
          localStorage.removeItem("mpc_token");
          localStorage.removeItem("mpc-auth");
        }
        set({ token: null, refreshToken: null, user: null, org: null });
      },

      // 🔴 Fix 3: Token ke saath user bhi check karo
      isAuthenticated: () => {
        const { token, user } = get();
        return Boolean(token) && Boolean(user);
      },
    }),
    {
      name: "mpc-auth",
      // 🟡 Fix 4: Comment sahi kiya — org bhi persist ho raha hai by design
      // Persist: token, refreshToken, user, org (sidebar ke liye chahiye)
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        org: state.org,
      }),
    }
  )
);