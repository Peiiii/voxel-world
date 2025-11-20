
import React from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePresenter } from '../context/GameContext';

export const UIOverlay: React.FC = () => {
  // Select state individually to optimize re-renders and ensure accuracy
  const isLocked = useGameStore(state => state.isLocked);
  const miningProgress = useGameStore(state => state.miningProgress);
  const presenter = usePresenter();

  // Key Listener for toggles that belong to UI interaction or shortcuts
  React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
          if (e.code === 'KeyF') presenter.toggleFly();
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
  }, [presenter]);

  const handleEnterWorld = () => {
      presenter.requestPointerLock();
  };

  return (
    <div id="ui-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <div id="info-panel" style={{ opacity: isLocked ? 0.3 : 1 }}>
        <h1>Voxel Engine (MVP)</h1>
        <div className="key-row"><span className="key">WASD</span> Move</div>
        <div className="key-row"><span className="key">SPACE</span> Jump</div>
        <div className="key-row"><span className="key">F</span> Toggle Fly</div>
        <div className="key-row"><span className="key">L-Click</span> Mine</div>
      </div>

      <div id="center-hud">
        <div id="crosshair"></div>
        <div id="mining-ring" style={{ 
            transform: `scale(${miningProgress})`,
            borderColor: miningProgress > 0.8 ? '#ff4444' : 'rgba(255, 255, 255, 0.8)'
        }}></div>
      </div>

      {!isLocked && (
        <div id="start-screen">
          <h1>VOXEL WORLD</h1>
          <button id="start-btn" className="btn" onClick={handleEnterWorld}>ENTER WORLD</button>
        </div>
      )}
    </div>
  );
};
