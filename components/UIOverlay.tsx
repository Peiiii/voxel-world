
import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePresenter } from '../context/GameContext';

export const UIOverlay: React.FC = () => {
  const isLocked = useGameStore(state => state.isLocked);
  const miningProgress = useGameStore(state => state.miningProgress);
  const gameStarted = useGameStore(state => state.gameStarted);
  const setGameStarted = useGameStore(state => state.setGameStarted);
  const presenter = usePresenter();
  const isMobile = presenter.isMobile;

  const joystickRef = useRef<HTMLDivElement>(null);
  const camZoneRef = useRef<HTMLDivElement>(null);
  const lastCamX = useRef(0);
  const lastCamY = useRef(0);

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

  // --- ROBUST JOYSTICK LOGIC (Pointer Events) ---
  const handlePointerDown = (e: React.PointerEvent) => {
      if (!joystickRef.current) return;
      e.preventDefault(); // Prevent scrolling
      e.stopPropagation();
      
      // Capture pointer to keep tracking even if finger leaves the div
      joystickRef.current.setPointerCapture(e.pointerId);
      handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!joystickRef.current) return;
      if (!e.buttons) return; // Only track if pressed

      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let dx = (e.clientX - centerX) / (rect.width / 2);
      let dy = (e.clientY - centerY) / (rect.height / 2);
      
      // Clamp circular
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 1) { dx /= len; dy /= len; }
      
      setJoystickVec({ x: dx, y: dy });
      presenter.input.setVirtualMove(dx, dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (!joystickRef.current) return;
      joystickRef.current.releasePointerCapture(e.pointerId);
      setJoystickVec({ x: 0, y: 0 });
      presenter.input.setVirtualMove(0, 0);
  };

  // --- ROBUST CAMERA ZONE LOGIC ---
  const handleCameraPointerDown = (e: React.PointerEvent) => {
      if (!camZoneRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      
      camZoneRef.current.setPointerCapture(e.pointerId);
      lastCamX.current = e.clientX;
      lastCamY.current = e.clientY;
  };

  const handleCameraPointerMove = (e: React.PointerEvent) => {
      if (!camZoneRef.current || !e.buttons) return;
      e.preventDefault();

      const dx = e.clientX - lastCamX.current;
      const dy = e.clientY - lastCamY.current;
      
      presenter.rotateCamera(dx, dy);

      lastCamX.current = e.clientX;
      lastCamY.current = e.clientY;
  };

  const handleCameraPointerUp = (e: React.PointerEvent) => {
      if (camZoneRef.current) {
        camZoneRef.current.releasePointerCapture(e.pointerId);
      }
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
            {/* Invisible Camera Touch Zone (Right Side) */}
            <div 
                ref={camZoneRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '60%', // Covers right side
                    height: '100%',
                    zIndex: 5,
                    touchAction: 'none',
                    pointerEvents: 'auto'
                }}
                onPointerDown={handleCameraPointerDown}
                onPointerMove={handleCameraPointerMove}
                onPointerUp={handleCameraPointerUp}
                onPointerCancel={handleCameraPointerUp}
            />

            {/* Joystick Zone */}
            <div 
                style={{ 
                    position: 'absolute', bottom: 40, left: 40, width: 120, height: 120, 
                    background: 'rgba(255,255,255,0.2)', borderRadius: '50%', pointerEvents: 'auto',
                    border: '2px solid rgba(255,255,255,0.4)', touchAction: 'none', zIndex: 10
                }}
                ref={joystickRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', width: 50, height: 50,
                    background: 'rgba(255,255,255,0.8)', borderRadius: '50%', pointerEvents: 'none',
                    transform: `translate(-50%, -50%) translate(${joystickVec.x * 40}px, ${joystickVec.y * 40}px)`
                }} />
            </div>

            {/* Buttons Zone */}
            <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 20, pointerEvents: 'auto', zIndex: 11 }}>
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
