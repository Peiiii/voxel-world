
import React, { useEffect, useRef } from 'react';
import { usePresenter } from '../context/GameContext';

export const GameCanvas: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const presenter = usePresenter();

    useEffect(() => {
        if (containerRef.current) {
            presenter.init(containerRef.current);
        }
        return () => presenter.dispose();
    }, [presenter]);

    return <div ref={containerRef} id="game-container" style={{ width: '100vw', height: '100vh', zIndex: 0 }} />;
};
