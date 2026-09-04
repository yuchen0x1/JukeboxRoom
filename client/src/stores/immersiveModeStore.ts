import { create } from 'zustand';
import { readRoomImmersiveMode, writeRoomImmersiveMode } from '../lib/roomImmersiveMode';

interface ImmersiveModeStore {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const useImmersiveModeStore = create<ImmersiveModeStore>((set, get) => ({
  enabled: readRoomImmersiveMode(),
  setEnabled: (enabled) => {
    writeRoomImmersiveMode(enabled);
    set({ enabled });
  },
  toggle: () => {
    const next = !get().enabled;
    writeRoomImmersiveMode(next);
    set({ enabled: next });
  },
}));
