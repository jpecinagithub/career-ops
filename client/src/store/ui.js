import { create } from 'zustand';

export const useUiStore = create((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // Application filters
  filters: { status: '', minScore: '', company: '' },
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: { status: '', minScore: '', company: '' } }),
}));
