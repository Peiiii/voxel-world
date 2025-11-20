
import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePresenter } from '../context/GameContext';

export const UIOverlay: React.FC = () => {
  const isLocked = useGameStore(state => state.isLocked);
  const miningProgress = useGameStore(state => state.miningProgress);
  const gameStarted = useGameStore(state => state.gameStarted);
  const setGameStarted = useGameStore(state => state.setGameStarted);
  const presenter = usePresenter();
  const isMobile = presenter.isMobile; // Read once from presenter

  const joystickRef = useRef<HTMLDivElement>(null);
  const [joystickVec, setJoystickVec] = useState({ x: 0, y: 0 });
  const [showHelp, setShowHelp] = useState(false);

  // Desktop Key Listener
  useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
          if (e.code === 'KeyF') presenter.toggleFly();
          if (e.code === 'KeyH') setShowHelp(prev => !prev);
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
  }, [presenter]);

  const handleEnterWorld = () => {
      setGameStarted(true);
      presenter.requestPointerLock();
  };

  // Mobile Joystick Logic
  const handleTouchStart = (e: React.TouchEvent) => { handleTouchMove(e); };
  const handleTouchMove = (e: React.TouchEvent) => {
      if (!joystickRef.current) return;
      const rect = joystickRef.current.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let dx = (touch.clientX - centerX) / (rect.width / 2);
      let dy = (touch.clientY - centerY) / (rect.height / 2);
      
      // Clamp
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 1) { dx /= len; dy /= len; }
      
      setJoystickVec({ x: dx, y: dy });
      presenter.input.setVirtualMove(dx, dy);
  };
  const handleTouchEnd = () => {
      setJoystickVec({ x: 0, y: 0 });
      presenter.input.setVirtualMove(0, 0);
  };

  return (
    <div id="ui-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', touchAction: 'none' }}>
      
      {/* Desktop Info - Collapsible */}
      {!isMobile && (
        <div 
            id="info-panel" 
            style={{ 
                opacity: isLocked ? 0.3 : 1, 
                pointerEvents: 'auto',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            }}
            onClick={() => setShowHelp(!showHelp)}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '120px' }}>
                <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Controls <span style={{fontSize: '0.8rem', opacity: 0.7}}>[H]</span></h1>
                <span style={{ transform: showHelp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s', fontSize: '0.8rem' }}>▼</span>
            </div>
            
            <div style={{ 
                maxHeight: showHelp ? '300px' : '0', 
                opacity: showHelp ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                marginTop: showHelp ? '10px' : '0'
            }}>
                <div className="key-row"><span className="key">WASD</span> Move</div>
                <div className="key-row"><span className="key">SPACE</span> Jump</div>
                <div className="key-row"><span className="key">F</span> Toggle Fly</div>
                <div className="key-row"><span className="key">L-Click</span> Mine</div>
            </div>
        </div>
      )}

      {/* HUD */}
      <div id="center-hud">
        <div id="crosshair"></div>
        <div id="mining-ring" style={{ 
            transform: `scale(${miningProgress})`,
            borderColor: miningProgress > 0.8 ? '#ff4444' : 'rgba(255, 255, 255, 0.8)'
        }}></div>
      </div>

      {/* Mobile Controls */}
      {isMobile && isLocked && (
          <>
            {/* Joystick Zone */}
            <div 
                style={{ 
                    position: 'absolute', bottom: 40, left: 40, width: 120, height: 120, 
                    background: 'rgba(255,255,255,0.2)', borderRadius: '50%', pointerEvents: 'auto',
                    border: '2px solid rgba(255,255,255,0.4)'
                }}
                ref={joystickRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', width: 50, height: 50,
                    background: 'rgba(255,255,255,0.8)', borderRadius: '50%',
                    transform: `translate(-50%, -50%) translate(${joystickVec.x * 40}px, ${joystickVec.y * 40}px)`
                }} />
            </div>

            {/* Buttons Zone */}
            <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 20, pointerEvents: 'auto' }}>
                <div style={{ display: 'flex', gap: 20 }}>
                    <button className="btn" style={{ width: 60, height: 60, padding: 0, fontSize: '12px' }} onTouchStart={() => presenter.toggleFly()}>FLY</button>
                    <button className="btn" style={{ width: 60, height: 60, padding: 0, fontSize: '12px' }} 
                        onTouchStart={() => presenter.startMining()} 
                        onTouchEnd={() => presenter.stopMining()}
                    >MINE</button>
                </div>
                <button className="btn" style={{ width: 80, height: 80, padding: 0, alignSelf: 'flex-end' }} 
                    onTouchStart={() => presenter.input.setButton('jump', true)}
                    onTouchEnd={() => presenter.input.setButton('jump', false)}
                >JUMP</button>
            </div>
          </>
      )}

      {/* Start Screen */}
      {!gameStarted && (
        <div id="start-screen">
          <h1>VOXEL WORLD</h1>
          <button id="start-btn" className="btn" onClick={handleEnterWorld}>
             {isMobile ? "TAP TO START" : "ENTER WORLD"}
          </button>
        </div>
      )}
    </div>
  );
};
