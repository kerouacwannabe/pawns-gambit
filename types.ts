export enum PieceType {
  PAWN = 'pawn',
  ROOK = 'rook',
  KNIGHT = 'knight',
  BISHOP = 'bishop',
  QUEEN = 'queen',
  KING = 'king',
}

export enum PlayerColor {
  WHITE = 'white',
  BLACK = 'black',
}

export interface PawnPower {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export interface Piece {
  id:string;
  type: PieceType;
  color: PlayerColor;
  powerId?: string; // Link to a PawnPower
  isVisible?: boolean;
}

export type Square = Piece | null;

export type Board = Square[][];

export interface Position {
  row: number;
  col: number;
}

export enum GameState {
  LOADING,
  MENU,
  BOARD_SELECT,
  PLAYING,
  SHOP,
  LEVEL_WON,
  LEVEL_SELECT,
  GAME_OVER,
}

export interface BoardRules {
  pawnHasLimitedFirstMove?: boolean;
}

export interface BoardInfo {
  id: string;
  name: string;
  description: string;
  rules: BoardRules;
  isLocked: boolean;
  unlockLevel?: number;
}