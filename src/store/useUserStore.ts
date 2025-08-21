import { create } from "zustand";

interface UserState {
  id: number | null;
  name: string | null;
  email: string | null;
  setUser: (user: { id: number; name: string; email: string } | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  id: null,
  name: null,
  email: null,
  setUser: (user) =>
    set({ id: user?.id, name: user?.name, email: user?.email }),
}));
