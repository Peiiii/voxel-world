
import React, { createContext, useContext, useRef } from 'react';
import { GamePresenter } from '../presenter/GamePresenter';

const GameContext = createContext<GamePresenter | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const presenter = useRef(new GamePresenter());
    return (
        <GameContext.Provider value={presenter.current}>
            {children}
        </GameContext.Provider>
    );
};

export const usePresenter = () => {
    const context = useContext(GameContext);
    if (!context) throw new Error("usePresenter must be used within GameProvider");
    return context;
};
