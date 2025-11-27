export interface Coordinate {
  row: number;
  col: number;
}

export interface CellData {
  char: string;
  id: string; // row-col
  highlighted: boolean;
  found: boolean;
  selectedColor?: string; // used for found words to keep them colored
  // Anti-bot visual properties
  rotation: number;
  offsetX: number;
  offsetY: number;
  decoyChar: string; // The fake character placed in the DOM
}

export interface WordLocation {
  word: string;
  coords: Coordinate[];
  found: boolean;
  color: string;
}

export interface WordTelemetry {
  palabra: string;
  puntos: number;
  timestamp: number; // When the word was found
  duracion_ms: number; // How long the drag took
  inicio_arrastre_ts: number; // Exact timestamp when drag started
  tipo_entrada: string; // 'mouse', 'touch', 'pen'
}

export type Direction = 'HORIZONTAL' | 'VERTICAL' | 'DIAGONAL_TL_BR' | 'DIAGONAL_BL_TR';

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}
