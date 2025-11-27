import { GRID_SIZE, SPANISH_WORDS, WORD_COUNT_PER_LEVEL } from '../constants';
import { CellData, Coordinate, Direction, WordLocation } from '../types';

const ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

const getRandomChar = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];

const isValidPosition = (
  grid: string[][],
  word: string,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number
): boolean => {
  for (let i = 0; i < word.length; i++) {
    const r = startRow + i * dr;
    const c = startCol + i * dc;

    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    
    // Check collision: needs to be empty or same letter
    if (grid[r][c] !== '' && grid[r][c] !== word[i]) return false;
  }
  return true;
};

const placeWord = (
  grid: string[][],
  word: string,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number
): Coordinate[] => {
  const coords: Coordinate[] = [];
  for (let i = 0; i < word.length; i++) {
    const r = startRow + i * dr;
    const c = startCol + i * dc;
    grid[r][c] = word[i];
    coords.push({ row: r, col: c });
  }
  return coords;
};

export const generateLevel = () => {
  // 1. Pick random words
  const availableWords = [...SPANISH_WORDS];
  const selectedWords: string[] = [];
  
  while (selectedWords.length < WORD_COUNT_PER_LEVEL && availableWords.length > 0) {
    const index = Math.floor(Math.random() * availableWords.length);
    const word = availableWords[index];
    // Filter words that are too long for the grid just in case
    if (word.length <= GRID_SIZE) {
        selectedWords.push(word);
    }
    availableWords.splice(index, 1);
  }

  // 2. Initialize Grid
  const tempGrid: string[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
  const locations: WordLocation[] = [];

  // 3. Place words
  // Sort by length desc to place larger words first
  selectedWords.sort((a, b) => b.length - a.length);

  for (const word of selectedWords) {
    let placed = false;
    let attempts = 0;
    
    while (!placed && attempts < 100) {
      attempts++;
      const dirIndex = Math.floor(Math.random() * 4); // 0: H, 1: V, 2: D1, 3: D2
      let dr = 0, dc = 0;
      
      // Determine direction vector
      switch (dirIndex) {
        case 0: dr = 0; dc = 1; break; // Horizontal
        case 1: dr = 1; dc = 0; break; // Vertical
        case 2: dr = 1; dc = 1; break; // Diagonal TL to BR
        case 3: dr = 1; dc = -1; break; // Diagonal TR to BL (modified from BL-TR for simplicity in parsing)
      }

      const startRow = Math.floor(Math.random() * GRID_SIZE);
      const startCol = Math.floor(Math.random() * GRID_SIZE);

      if (isValidPosition(tempGrid, word, startRow, startCol, dr, dc)) {
        const coords = placeWord(tempGrid, word, startRow, startCol, dr, dc);
        locations.push({
          word,
          coords,
          found: false,
          color: '' // Assigned later
        });
        placed = true;
      }
    }
  }

  // 4. Fill empty spots and add obfuscation data
  const finalGrid: CellData[][] = tempGrid.map((row, rIndex) => 
    row.map((char, cIndex) => ({
      char: char === '' ? getRandomChar() : char,
      id: `${rIndex}-${cIndex}`,
      highlighted: false,
      found: false,
      // Jitter removed for better UX
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      // A fake character to put in the DOM to confuse scrapers (kept for anti-bot)
      decoyChar: getRandomChar(), 
    }))
  );

  return { grid: finalGrid, locations: locations.filter(l => l.coords.length > 0) };
};

// Bresenham's line algorithm approximation for grid selection
export const getCellsBetween = (start: Coordinate, end: Coordinate): Coordinate[] => {
  const points: Coordinate[] = [];
  let x0 = start.col;
  let y0 = start.row;
  const x1 = end.col;
  const y1 = end.row;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;

  // Enforce straight lines or exact diagonals
  // Tolerance allows for "snap" feel
  const isHorizontal = dy === 0;
  const isVertical = dx === 0;
  const isDiagonal = Math.abs(dx - dy) < 2; // Allow small jitter for diagonal detection

  if (!isHorizontal && !isVertical && !isDiagonal) {
    // If invalid angle, just return start to avoid weird zigzags
    // Or return nothing to indicate invalid selection
    return [{row: y0, col: x0}];
  }

  // Simplified logic: If we know it's valid direction, simple steps
  if (isHorizontal) {
    for (let c = Math.min(x0, x1); c <= Math.max(x0, x1); c++) {
      points.push({ row: y0, col: c });
    }
  } else if (isVertical) {
    for (let r = Math.min(y0, y1); r <= Math.max(y0, y1); r++) {
      points.push({ row: r, col: x0 });
    }
  } else {
    // Diagonal
    // Re-calculate strictly for diagonal walking
    let currX = x0;
    let currY = y0;
    const steps = Math.max(dx, dy);
    
    // Determine strict direction signs
    const stepX = x1 > x0 ? 1 : -1;
    const stepY = y1 > y0 ? 1 : -1;

    for(let i=0; i<=steps; i++) {
         points.push({ row: currY, col: currX });
         currX += stepX;
         currY += stepY;
    }
  }
  
  return points;
};