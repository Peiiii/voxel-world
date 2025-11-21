
import { create } from 'zustand';

interface GameState {
  isLocked: boolean;
  gameStarted: boolean;
  miningProgress: number;
  isFlying: boolean;
  timeOfDay: number; // 0 to 1. 0.5 is Noon.
  
  setLocked: (locked: boolean) => void;
  setGameStarted: (started: boolean) => void;
  setMiningProgress: (progress: number) => void;
  setIsFlying: (isFlying: boolean) => void;
  setTimeOfDay: (time: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  isLocked: false,
  gameStarted: false,
  miningProgress: 0,
  isFlying: false,
  timeOfDay: 0.5, // Default to Noon

  setLocked: (locked) => set({ isLocked: locked }),
  setGameStarted: (started) => set({ gameStarted: started }),
  setMiningProgress: (progress) => set({ miningProgress: progress }),
  setIsFlying: (isFlying) => set({ isFlying }),
  setTimeOfDay: (time) => set({ timeOfDay: time })
}));
