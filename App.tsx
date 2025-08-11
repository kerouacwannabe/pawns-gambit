

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GameState, PieceType, PlayerColor, BoardInfo, BoardRules } from './types';
import type { Board, Position, Square, PawnPower, Piece } from './types';
import { createInitialBoard, getValidMoves, PIECE_VALUES, findKing, isCheck, findBestMove } from './services/chessLogic';
import { generatePawnAbilities } from './services/geminiService';
import { playMove, playCapture, playSummon } from './services/soundService';

// --- SPECIAL PAWNS ---
const RELENTLESS_PAWN: PawnPower = { id: 'relentless-pawn', name: 'Relentless Pawn', description: 'After capturing a piece, this pawn can move again immediately.', cost: 0 };
const STURDY_PAWN: PawnPower = { id: 'sturdy-pawn', name: 'Sturdy Pawn', description: 'Survives the first attack against it, negating the capture and losing this ability.', cost: 0 };
const ALL_SPECIAL_PAWNS: PawnPower[] = [RELENTLESS_PAWN, STURDY_PAWN];

// --- NEW BOARDS ---
const AVAILABLE_BOARDS: BoardInfo[] = [
    { id: 'classic', name: 'Classic Kingdom', description: 'The standard rules of the gambit.', rules: {}, isLocked: false },
    { id: 'pawn_march', name: 'The Long March', description: 'Pawns can only move one square forward, even on their first turn.', rules: { pawnHasLimitedFirstMove: true }, isLocked: false },
    { id: 'fortress', name: 'The Fortress', description: 'Survive 10 levels to unlock this board.', rules: {}, isLocked: true, unlockLevel: 10 },
];


// --- 16-BIT Styled Components ---

const PixelatedPanel: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-slate-800 p-4 sm:p-6 pixel-border ${className}`}>
        {children}
    </div>
);

const PixelatedButton: React.FC<{ onClick: () => void, children: React.ReactNode, className?: string, disabled?: boolean }> = ({ onClick, children, className = '', disabled = false }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`px-4 py-2 text-sm sm:text-base text-white uppercase tracking-wider bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed pixel-border ${className}`}
    >
        {children}
    </button>
);

const PieceComponent: React.FC<{ piece: Piece, isSelected: boolean }> = React.memo(({ piece, isSelected }) => {
    if (piece.isVisible === false) {
        return null;
    }
    
    const color = piece.color === PlayerColor.WHITE ? '#F9FAFB' : '#52525B';
    const stroke = piece.color === PlayerColor.WHITE ? '#374151' : '#E4E4E7';
    const isEnemyKing = piece.type === PieceType.KING && piece.color === PlayerColor.BLACK;

    const styles: React.CSSProperties = {
        width: '80%',
        height: '80%',
        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform 0.2s',
        filter: piece.powerId ? 'drop-shadow(0 0 6px #22d3ee) drop-shadow(0 0 3px #22d3ee)' : 'none',
    };
    
    const className = isEnemyKing ? 'rainbow-king-glow' : '';

    const paths: Record<PieceType, React.ReactNode> = {
        [PieceType.PAWN]: <path d="M12 8a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M10 13h4v3h-4z M9 16h6v2h-6z" />,
        [PieceType.ROOK]: <path d="M7 7h2v3h-2z M15 7h2v3h-2z M11 7h2v3h-2z M7 10h10v2h-10z M8 12h8v6h-8z M7 18h10v2h-10z" />,
        [PieceType.BISHOP]: <path d="M12 6l3 4v3h-6v-3z M11 13h2l-1 2z M9 15h6v3h-6z M8 18h8v2h-8z" />,
        [PieceType.KNIGHT]: <path d="M9 20v-6l-2-2V8h2l3-3h3v2l-1 1 1 1v2l1 1v2h2v4h2v2H9z" />,
        [PieceType.QUEEN]: <path d="M6 7l2-3h8l2 3-3 3 3 3-2 3h-8l-2-3 3-3z M8 16h8v2h-8z M7 18h10v2h-10z" />,
        [PieceType.KING]: isEnemyKing ?
            <path d="M11 5h2v3h3v2h-3v3h-2v-3h-3v-2h3z M5 13h14v2h-14z M8 15h8v4h-8z M6 19h12v2h-12z" /> :
            <path d="M11 5h2v3h3v2h-3v3h-2v-3h-3v-2h3z M9 13h6v5h-6z M8 18h8v2h-8z" />,
    };

    const pieceSvgContent = paths[piece.type];

    return (
        <svg viewBox="0 0 24 24" style={{...styles, shapeRendering: 'crispEdges'}} className={className} xmlns="http://www.w3.org/2000/svg">
            <g fill={color} stroke={stroke} strokeWidth="1">
                {pieceSvgContent}
            </g>
        </svg>
    );
});


// --- Child Components ---

interface GameBoardProps {
    board: Board;
    onSquareClick: (pos: Position) => void;
    selectedPiece: Position | null;
    validMoves: Position[];
    playerColor: PlayerColor;
}

const GameBoard: React.FC<GameBoardProps> = ({ board, onSquareClick, selectedPiece, validMoves, playerColor }) => {
    const boardToRender = playerColor === PlayerColor.WHITE ? board : [...board].reverse().map(row => [...row].reverse());
    const isMoveValid = (r: number, c: number) => validMoves.some(move => move.row === r && move.col === c);
    
    return (
        <div className="flex flex-col border-4 border-black bg-slate-600 shadow-2xl pixel-border">
            {boardToRender.map((row, rIdx) => (
                <div key={rIdx} className="flex">
                    {row.map((square, cIdx) => {
                        const originalR = playerColor === PlayerColor.WHITE ? rIdx : 7 - rIdx;
                        const originalC = playerColor === PlayerColor.WHITE ? cIdx : 7 - cIdx;
                        const isSelected = selectedPiece && selectedPiece.row === originalR && selectedPiece.col === originalC;
                        const isValidMove = isMoveValid(originalR, originalC);
                        const bgColor = (originalR + originalC) % 2 === 0 ? 'bg-[#c2b280]' : 'bg-[#6b4226]';
                        
                        return (
                            <div
                                key={`${originalR}-${originalC}`}
                                className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 flex items-center justify-center cursor-pointer transition-colors duration-200 ${bgColor} relative`}
                                onClick={() => onSquareClick({ row: originalR, col: originalC })}
                            >
                                {square && <PieceComponent piece={square} isSelected={!!isSelected} />}
                                {isValidMove && <div className="absolute inset-0 bg-green-500/50 rounded-full w-6 h-6 m-auto"></div>}
                                {isSelected && <div className="absolute inset-0 border-4 border-yellow-400"></div>}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

interface GameUIProps {
    level: number;
    bank: number;
    captureProgress: number;
    kingSpawnThreshold: number;
    isKingSpawned: boolean;
    onSummonKing: () => void;
    turn: PlayerColor;
    message: string;
    selectedPower: PawnPower | null;
}

const GameUI: React.FC<GameUIProps> = ({ level, bank, captureProgress, kingSpawnThreshold, isKingSpawned, onSummonKing, turn, message, selectedPower }) => {
    const progressPercent = Math.min((captureProgress / kingSpawnThreshold) * 100, 100);
    const canSummon = !isKingSpawned && progressPercent >= 100;

    return (
        <PixelatedPanel className="w-full max-w-lg md:max-w-xl lg:max-w-2xl text-sm">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-base sm:text-lg text-yellow-300">LEVEL: {level}</h2>
                <h2 className="text-base sm:text-lg text-green-300">BANK: ${bank}</h2>
            </div>
            <div className="mb-3">
                <p className="text-xs text-slate-300 mb-1">CAPTURE VALUE:</p>
                <div className="w-full bg-slate-600 h-4 border-2 border-black">
                    <div className="bg-red-500 h-full" style={{ width: `${progressPercent}%` }}></div>
                </div>
            </div>
             {canSummon && (
                <PixelatedButton onClick={onSummonKing} className="bg-red-600 hover:bg-red-500 w-full my-2 animate-pulse">
                    Summon King!
                </PixelatedButton>
            )}
            <div className="text-center h-6 mt-2">
                <p>{message}</p>
            </div>
            {selectedPower && (
                <div className="lg:hidden mt-4 p-2 bg-slate-900/50 pixel-border">
                    <h4 className="text-cyan-300">{selectedPower.name}</h4>
                    <p className="text-xs text-slate-300 mt-1">{selectedPower.description}</p>
                </div>
            )}
        </PixelatedPanel>
    );
};

interface PawnCardProps {
    pawn: PawnPower;
    onBuy: (pawn: PawnPower) => void;
    canAfford: boolean;
}

const PawnCard: React.FC<PawnCardProps> = ({ pawn, onBuy, canAfford }) => (
    <PixelatedPanel className="flex flex-col justify-between transform hover:scale-105 transition-transform duration-200">
        <div>
            <h3 className="text-base text-cyan-300">{pawn.name}</h3>
            <p className="text-slate-300 mt-2 text-xs h-16">{pawn.description}</p>
        </div>
        <PixelatedButton
            onClick={() => onBuy(pawn)}
            disabled={!canAfford}
            className={`mt-4 w-full ${canAfford ? 'bg-green-600 hover:bg-green-500' : ''}`}
        >
            Buy ${pawn.cost}
        </PixelatedButton>
    </PixelatedPanel>
);

interface ShopProps {
    bank: number;
    shopPawns: PawnPower[];
    onBuyPawn: (pawn: PawnPower) => void;
    onContinue: () => void;
    isLoading: boolean;
}

const Shop: React.FC<ShopProps> = ({ bank, shopPawns, onBuyPawn, onContinue, isLoading }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
             <PixelatedPanel className="w-full max-w-4xl">
                <h1 className="text-2xl sm:text-3xl text-center text-yellow-300 mb-2">PAWN SHOP</h1>
                <p className="text-center text-slate-300 mb-6 text-xs">Purchase powerful pawns.</p>
                <p className="text-center text-xl text-green-300 mb-8">Bank: ${bank}</p>
                
                {isLoading ? (
                    <div className="text-center text-lg text-cyan-300 animate-pulse">Generating wares...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {shopPawns.map(pawn => (
                            <PawnCard key={pawn.id} pawn={pawn} onBuy={onBuyPawn} canAfford={bank >= pawn.cost} />
                        ))}
                    </div>
                )}
                
                <div className="text-center mt-8">
                    <PixelatedButton onClick={onContinue} className="bg-blue-600 hover:bg-blue-500 py-3 px-6 text-lg">
                        Next Level
                    </PixelatedButton>
                </div>
            </PixelatedPanel>
        </div>
    );
};

const SpecialPawnInfoPanel: React.FC<{ power: PawnPower | null }> = ({ power }) => {
    if (!power) {
      return <div className="hidden lg:block w-72 h-48" />;
    }
  
    return (
      <div className="hidden lg:block w-72">
        <PixelatedPanel className="h-48">
          <h3 className="text-lg text-cyan-400">{power.name}</h3>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed">{power.description}</p>
        </PixelatedPanel>
      </div>
    );
};


// --- Main App Component ---

export default function App() {
    const [gameState, setGameState] = useState<GameState>(GameState.LOADING);
    const [board, setBoard] = useState<Board>(() => createInitialBoard());
    const [turn, setTurn] = useState<PlayerColor>(PlayerColor.WHITE);
    const [bank, setBank] = useState<number>(0);
    const [level, setLevel] = useState<number>(1);
    const [captureValue, setCaptureValue] = useState<number>(0);
    const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
    const [validMoves, setValidMoves] = useState<Position[]>([]);
    const [isKingSpawned, setIsKingSpawned] = useState<boolean>(false);
    const [ownedPawns, setOwnedPawns] = useState<PawnPower[]>([]);
    const [shopPawns, setShopPawns] = useState<PawnPower[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [message, setMessage] = useState<string>("White's Turn");
    const [selectedBoard, setSelectedBoard] = useState<BoardInfo>(AVAILABLE_BOARDS[0]);

    const kingSpawnThreshold = useMemo(() => 5 + level * 5, [level]);

    const selectedPawnPower = useMemo(() => {
        if (!selectedPiece) return null;
        const piece = board[selectedPiece.row][selectedPiece.col];
        if (!piece || !piece.powerId) return null;
        const allKnownPawns = [...ALL_SPECIAL_PAWNS, ...ownedPawns];
        return allKnownPawns.find(p => p.id === piece.powerId) ?? null;
      }, [selectedPiece, board, ownedPawns]);

    const resetLevel = useCallback((newLevel: number) => {
        const newBoard = createInitialBoard();
        
        // Handle special pawn assignments
        if (newLevel === 1) {
             // Assign Relentless Pawn to a random player pawn
            const playerPawnCol = Math.floor(Math.random() * 8);
            (newBoard[6][playerPawnCol] as Piece).powerId = RELENTLESS_PAWN.id;
            
            // Assign Sturdy Pawn to a random AI pawn
            const aiPawnCol = Math.floor(Math.random() * 8);
            (newBoard[1][aiPawnCol] as Piece).powerId = STURDY_PAWN.id;
        } else {
            // Assign bought pawns for subsequent levels
            const pawnStartRow = 6;
            let pawnsPlaced = 0;
            for (let c = 0; c < 8 && pawnsPlaced < ownedPawns.length; c++) {
                if (newBoard[pawnStartRow][c]?.type === PieceType.PAWN) {
                     const piece = newBoard[pawnStartRow][c] as Piece;
                     piece.powerId = ownedPawns[pawnsPlaced].id;
                     pawnsPlaced++;
                }
            }
        }

        setBoard(newBoard);
        setTurn(PlayerColor.WHITE);
        setCaptureValue(0);
        const kingPos = findKing(newBoard, PlayerColor.BLACK);
        setIsKingSpawned(kingPos ? newBoard[kingPos.row][kingPos.col]?.isVisible ?? false : false);
        setSelectedPiece(null);
        setValidMoves([]);
        setMessage("YOUR TURN");
    }, [ownedPawns]);

    const handleStartGame = useCallback((boardInfo: BoardInfo) => {
        setSelectedBoard(boardInfo);
        setBank(0);
        setLevel(1);
        setOwnedPawns([RELENTLESS_PAWN]); // Player starts with the relentless pawn
        resetLevel(1);
        setGameState(GameState.PLAYING);
    }, [resetLevel]);
    
    const handleNextLevel = useCallback(() => {
        setGameState(GameState.LEVEL_SELECT);
    }, []);

    const proceedToNextLevel = useCallback(() => {
        const nextLevel = level + 1;
        setLevel(nextLevel);
        resetLevel(nextLevel);
        setGameState(GameState.PLAYING);
    }, [level, resetLevel]);
    
    const enterShop = useCallback(async () => {
        setGameState(GameState.SHOP);
        setIsLoading(true);
        try {
            const newPawns = await generatePawnAbilities(3);
            setShopPawns(newPawns);
        } catch (error) {
            console.error("Failed to fetch pawn abilities:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const buyPawn = useCallback((pawn: PawnPower) => {
        if (bank >= pawn.cost) {
            setBank(prev => prev - pawn.cost);
            setOwnedPawns(prev => [...prev, pawn]);
            setShopPawns(prev => prev.filter(sp => sp.id !== pawn.id));
        }
    }, [bank]);

    const makeAIMove = useCallback((currentBoard: Board) => {
        const bestMove = findBestMove(currentBoard, selectedBoard.rules, level);

        if (!bestMove) {
            if (isKingSpawned) {
                 if(isCheck(currentBoard, PlayerColor.BLACK, selectedBoard.rules)) {
                    setMessage("CHECKMATE! YOU WIN!");
                 } else {
                    setMessage("STALEMATE! YOU WIN!");
                 }
                 setGameState(GameState.LEVEL_WON);
            } else {
                setTurn(PlayerColor.WHITE);
                setMessage("ENEMY IMMOBILIZED. YOUR MOVE.");
            }
            return;
        }
        
        const newBoard = JSON.parse(JSON.stringify(currentBoard));
        const capturedPiece = newBoard[bestMove.to.row][bestMove.to.col];

        if (capturedPiece?.powerId === STURDY_PAWN.id) {
            (newBoard[bestMove.to.row][bestMove.to.col] as Piece).powerId = undefined;
            setBoard(newBoard);
            setTurn(PlayerColor.WHITE);
            setMessage("STURDY PAWN BLOCKED AI ATTACK!");
            playCapture();
            return;
        }
        
        newBoard[bestMove.to.row][bestMove.to.col] = newBoard[bestMove.from.row][bestMove.from.col];
        newBoard[bestMove.from.row][bestMove.from.col] = null;
        
        if (capturedPiece) {
            playCapture();
            if (capturedPiece.type === PieceType.KING) {
                setBoard(newBoard);
                setMessage("YOUR KING WAS CAPTURED!");
                setGameState(GameState.GAME_OVER);
                return;
            }
        } else {
            playMove();
        }
        
        setBoard(newBoard);
        setTurn(PlayerColor.WHITE);
        setMessage(isKingSpawned && isCheck(newBoard, PlayerColor.WHITE, selectedBoard.rules) ? "CHECK! YOUR TURN" : "YOUR TURN");

    }, [isKingSpawned, selectedBoard.rules, level]);

    const handleSquareClick = useCallback((pos: Position) => {
        if (turn !== PlayerColor.WHITE || gameState !== GameState.PLAYING) return;

        if (selectedPiece) {
            const isValidMove = validMoves.some(m => m.row === pos.row && m.col === pos.col);
            if (isValidMove) {
                const newBoard = JSON.parse(JSON.stringify(board));
                const movedPiece = newBoard[selectedPiece.row][selectedPiece.col] as Piece;
                const capturedPiece = board[pos.row][pos.col];

                if (capturedPiece?.powerId === STURDY_PAWN.id) {
                    playCapture();
                    (newBoard[pos.row][pos.col] as Piece).powerId = undefined;
                    setMessage("ATTACK BLOCKED BY STURDY PAWN!");
                    setBoard(newBoard);
                    setSelectedPiece(null);
                    setValidMoves([]);
                    setTurn(PlayerColor.BLACK);
                    setTimeout(() => makeAIMove(newBoard), 500);
                    return;
                }
                
                if (capturedPiece) {
                    playCapture();
                    const value = PIECE_VALUES[capturedPiece.type];
                    setBank(prev => prev + value);
                    setCaptureValue(prev => prev + value);

                    if (capturedPiece.type === PieceType.KING) {
                        setMessage("ENEMY KING CAPTURED!");
                        setGameState(GameState.LEVEL_WON);
                        setBoard(newBoard);
                        return;
                    }
                } else {
                    playMove();
                }
                
                newBoard[pos.row][pos.col] = movedPiece;
                newBoard[selectedPiece.row][selectedPiece.col] = null;
                
                if (movedPiece.type === PieceType.PAWN && pos.row === 0) {
                    newBoard[pos.row][pos.col].type = PieceType.QUEEN;
                }

                setBoard(newBoard);
                setSelectedPiece(null);
                setValidMoves([]);

                if (capturedPiece && movedPiece.powerId === RELENTLESS_PAWN.id) {
                    setMessage("RELENTLESS! MOVE AGAIN.");
                    // Don't change turn
                } else {
                    setTurn(PlayerColor.BLACK);
                    setMessage("ENEMY'S TURN...");
                    setTimeout(() => makeAIMove(newBoard), 500);
                }

            } else if (pos.row === selectedPiece.row && pos.col === selectedPiece.col) {
                 setSelectedPiece(null);
                 setValidMoves([]);
            } else {
                const pieceOnNewPos = board[pos.row][pos.col];
                if(pieceOnNewPos && pieceOnNewPos.color === PlayerColor.WHITE) {
                    setSelectedPiece(pos);
                    setValidMoves(getValidMoves(board, pos, selectedBoard.rules));
                } else {
                    setSelectedPiece(null);
                    setValidMoves([]);
                }
            }
        } else {
            const piece = board[pos.row][pos.col];
            if (piece && piece.color === PlayerColor.WHITE) {
                setSelectedPiece(pos);
                setValidMoves(getValidMoves(board, pos, selectedBoard.rules));
            }
        }
    }, [board, selectedPiece, validMoves, turn, gameState, makeAIMove, selectedBoard.rules]);
    
    const handleSummonKing = useCallback(() => {
        if (isKingSpawned) return;
        playSummon();
        setBoard(prevBoard => {
            const newBoard = JSON.parse(JSON.stringify(prevBoard));
            const kingPos = findKing(newBoard, PlayerColor.BLACK);
            if (kingPos) {
                (newBoard[kingPos.row][kingPos.col] as Piece).isVisible = true;
            }
            return newBoard;
        });
        setIsKingSpawned(true);
        setMessage("ENEMY KING HAS APPEARED!");
    }, [isKingSpawned]);
    
    const restartGame = useCallback(() => {
        setGameState(GameState.MENU);
    }, []);

    // Initial load effect
    useEffect(() => {
        if (gameState === GameState.LOADING) {
            const timer = setTimeout(() => {
                setGameState(GameState.MENU);
                setIsLoading(false);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [gameState]);

    const MainContent = () => {
        switch(gameState) {
            case GameState.LOADING:
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                        <h1 className="text-2xl sm:text-4xl text-yellow-300 animate-pulse">LOADING...</h1>
                    </div>
                );
            case GameState.MENU:
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                        <h1 className="text-3xl sm:text-5xl text-yellow-300">PAWN'S GAMBIT</h1>
                        <p className="mt-4 mb-8 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">A roguelike chess adventure. Capture pieces for gold, buy pawns with unique powers, and defeat the king.</p>
                        <PixelatedButton onClick={() => setGameState(GameState.BOARD_SELECT)} className="bg-green-600 hover:bg-green-500 py-3 px-6 text-lg">
                            New Game
                        </PixelatedButton>
                    </div>
                );
            case GameState.BOARD_SELECT:
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-4">
                        <PixelatedPanel className="w-full max-w-2xl">
                            <h1 className="text-xl text-center mb-6">CHOOSE YOUR BATTLEFIELD</h1>
                            <div className="space-y-4">
                                {AVAILABLE_BOARDS.map(b => {
                                    const locked = b.isLocked && level < (b.unlockLevel || 999);
                                    return (
                                        <div key={b.id} className={`p-4 pixel-border ${locked ? 'bg-slate-700' : 'bg-slate-800'}`}>
                                            <h2 className={`text-lg ${locked ? 'text-slate-500' : 'text-yellow-300'}`}>{b.name} {locked ? `(LOCKED)`: ''}</h2>
                                            <p className="text-xs mt-2 text-slate-400">{locked ? `Reach Level ${b.unlockLevel} to unlock.` : b.description}</p>
                                            {!locked && <PixelatedButton onClick={() => handleStartGame(b)} className="mt-4 bg-blue-600 hover:bg-blue-500">SELECT</PixelatedButton>}
                                        </div>
                                    )
                                })}
                            </div>
                        </PixelatedPanel>
                    </div>
                );
            case GameState.LEVEL_SELECT:
                 return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-4">
                        <PixelatedPanel className="text-center">
                             <h1 className="text-xl text-yellow-300">PREPARE FOR BATTLE!</h1>
                             <p className="my-6 text-slate-300">ENTERING LEVEL {level + 1}</p>
                             <PixelatedButton onClick={proceedToNextLevel} className="bg-green-600 hover:bg-green-500">CONTINUE</PixelatedButton>
                        </PixelatedPanel>
                    </div>
                );
            case GameState.SHOP:
                 return <Shop bank={bank} shopPawns={shopPawns} onBuyPawn={buyPawn} onContinue={handleNextLevel} isLoading={isLoading} />;
            case GameState.GAME_OVER:
            case GameState.LEVEL_WON:
                const isWin = gameState === GameState.LEVEL_WON;
                return (
                    <div className="flex flex-col items-center justify-center min-h-screen p-4">
                         <PixelatedPanel className="w-full max-w-md text-center">
                            <h1 className={`text-2xl mb-4 ${isWin ? 'text-green-400' : 'text-red-500'}`}>{isWin ? "LEVEL COMPLETE!" : "GAME OVER"}</h1>
                            <p className="text-slate-300 text-sm mb-6">{isWin ? `You beat level ${level}!` : `You were defeated on level ${level}.`}</p>
                            {isWin ? (
                                 <PixelatedButton onClick={enterShop} className="bg-blue-600 hover:bg-blue-500 mb-4 w-full">
                                    Go to Shop
                                </PixelatedButton>
                            ) : null}
                            <PixelatedButton onClick={restartGame} className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 w-full">
                                {isWin ? "Main Menu" : "Play Again"}
                            </PixelatedButton>
                         </PixelatedPanel>
                    </div>
                );
            case GameState.PLAYING:
                return (
                    <main className="flex flex-col lg:flex-row items-center justify-center min-h-screen p-4 gap-6">
                        <div className="flex flex-col gap-6 items-center">
                            <GameUI 
                                level={level}
                                bank={bank}
                                captureProgress={captureValue}
                                kingSpawnThreshold={kingSpawnThreshold}
                                turn={turn}
                                message={message}
                                isKingSpawned={isKingSpawned}
                                onSummonKing={handleSummonKing}
                                selectedPower={selectedPawnPower}
                            />
                            <GameBoard 
                                board={board} 
                                onSquareClick={handleSquareClick}
                                selectedPiece={selectedPiece}
                                validMoves={validMoves}
                                playerColor={PlayerColor.WHITE}
                            />
                        </div>
                        <SpecialPawnInfoPanel power={selectedPawnPower} />
                    </main>
                );
            default:
                return null;
        }
    }

    return (
        <div className="w-full h-full bg-slate-900 text-white selection:bg-yellow-300 selection:text-black">
            <MainContent />
        </div>
    );
}