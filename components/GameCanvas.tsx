
import React, { useEffect, useRef } from 'react';
import { usePresenter } from '../context/GameContext';
import { useGameStore } from '../stores/gameStore';

export const GameCanvas: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const presenter = usePresenter();
    const gameStarted = useGameStore(state => state.gameStarted);

    useEffect(() => {
        if (containerRef.current) {
            presenter.init(containerRef.current);
        }
        return () => presenter.dispose();
    }, [presenter]);

    const handleCanvasClick = () => {
        if (gameStarted && !useGameStore.getState().isLocked) {
            presenter.requestPointerLock();
        }
    };

    return <div ref={containerRef} id="game-container" onClick={handleCanvasClick} style={{ width: '100vw', height: '100vh', zIndex: 0 }} />;
};
