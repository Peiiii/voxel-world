
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './context/GameContext';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';

function App() {
  return (
    <GameProvider>
        <GameCanvas />
        <UIOverlay />
    </GameProvider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
