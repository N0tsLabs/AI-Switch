import { create } from 'zustand';
import { getGithubUser, type GithubUser } from '../lib/tauri';

interface AuthState {
  user: GithubUser | null;
  loading: boolean;
  loaded: boolean;
  loadUser: () => Promise<void>;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  loaded: false,

  loadUser: async () => {
    if (getAuthState().loaded) return;
    set({ loading: true });
    try {
      const user = await getGithubUser();
      set({ user, loaded: true, loading: false });
    } catch {
      set({ user: null, loaded: true, loading: false });
    }
  },

  clearUser: () => set({ user: null, loaded: false }),
}));

// 避免 zustand selector 问题
function getAuthState() {
  return useAuthStore.getState();
}
