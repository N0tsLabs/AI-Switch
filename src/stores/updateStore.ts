import { create } from 'zustand';
import { checkUpdate, type UpdateInfo } from '../lib/tauri';

interface UpdateState {
  info: UpdateInfo | null;
  checked: boolean;
  checking: boolean;
  check: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  info: null,
  checked: false,
  checking: false,

  check: async () => {
    if (get().checked || get().checking) return;
    set({ checking: true });
    try {
      const info = await checkUpdate();
      set({ info, checked: true, checking: false });
    } catch {
      set({ checked: true, checking: false });
    }
  },
}));

function get() {
  return useUpdateStore.getState();
}
