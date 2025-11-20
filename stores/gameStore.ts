
import { create } from 'zustand';

interface GameState {
  isLocked: boolean;
  gameStarted: boolean;
  miningProgress: number;
  isFlying: boolean;
  
  setLocked: (locked: boolean) => void;
  setGameStarted: (started: boolean) => void;
  setMiningProgress: (progress: number) => void;
  setIsFlying: (isFlying: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  isLocked: false,
  gameStarted: false,
  miningProgress: 0,
  isFlying: false,

  setLocked: (locked) => set({ isLocked: locked }),
  setGameStarted: (started) => set({ gameStarted: started }),
  setMiningProgress: (progress) => set({ miningProgress: progress }),
  setIsFlying: (isFlying) => set({ isFlying })
}));
