import React, { useRef, useState, useEffect, useCallback } from 'react';
import { CellData, Coordinate } from '../types';
import { getCellsBetween } from '../utils/gameLogic';

interface GridProps {
  grid: CellData[][];
  onSelectionEnd: (
    coords: Coordinate[], 
    durationMs: number, 
    pointerType: string, 
    startTime: number,
    clientEndPos: { x: number, y: number } | null
  ) => void;
  isBonusMode: boolean;
}

export const Grid: React.FC<GridProps> = ({ grid, onSelectionEnd, isBonusMode }) => {
  const [startCell, setStartCell] = useState<Coordinate | null>(null);
  const [currentCell, setCurrentCell] = useState<Coordinate | null>(null);
  const [selectedCells, setSelectedCells] = useState<Coordinate[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Telemetry refs
  const dragStartTimeRef = useRef<number>(0);
  const pointerTypeRef = useRef<string>('unknown');

  // Helper to get cell coordinates from touch/mouse event
  const getCellFromPoint = useCallback((clientX: number, clientY: number): Coordinate | null => {
    if (!containerRef.current) return null;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Bounds check
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

    const cellSize = rect.width / grid.length; // Assuming square grid
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    // Grid bounds check
    if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
      return { row, col };
    }
    return null;
  }, [grid]);

  // Update visual selection path
  useEffect(() => {
    if (startCell && currentCell) {
      const path = getCellsBetween(startCell, currentCell);
      setSelectedCells(path);
    } else if (startCell) {
      setSelectedCells([startCell]);
    } else {
      setSelectedCells([]);
    }
  }, [startCell, currentCell]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Prevent scrolling
    e.preventDefault(); 
    
    // Start Telemetry
    dragStartTimeRef.current = Date.now();
    pointerTypeRef.current = e.pointerType;

    const coords = getCellFromPoint(e.clientX, e.clientY);
    if (coords) {
      setStartCell(coords);
      setCurrentCell(coords);
      // Capture pointer to track movement outside original target if needed
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startCell) return;
    e.preventDefault();
    const coords = getCellFromPoint(e.clientX, e.clientY);
    if (coords) {
      // Only update if changed to avoid calculation spam
      if (!currentCell || coords.row !== currentCell.row || coords.col !== currentCell.col) {
        setCurrentCell(coords);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (startCell && currentCell) {
      // Calculate duration
      const duration = Date.now() - dragStartTimeRef.current;
      
      const clientEndPos = { x: e.clientX, y: e.clientY };

      // Final selection logic
      onSelectionEnd(selectedCells, duration, pointerTypeRef.current, dragStartTimeRef.current, clientEndPos);
    }
    setStartCell(null);
    setCurrentCell(null);
    setSelectedCells([]);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const isSelected = (r: number, c: number) => {
    return selectedCells.some(cell => cell.row === r && cell.col === c);
  };

  return (
    <div 
      ref={containerRef}
      className="touch-none select-none grid grid-cols-10 p-1 md:p-2 shadow-lg max-w-full aspect-square relative bg-[#F5750D]"
      style={{ gap: '1px' }} // Tiny gap to see grid structure subtly, or remove for solid block
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      // Add touch handlers specifically to prevent default scrolling explicitly on mobile
      onTouchStart={(e) => e.preventDefault()} 
      onTouchMove={(e) => e.preventDefault()}
    >
      <style>{`
        @keyframes jiggle {
          0% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
          100% { transform: rotate(-1deg); }
        }
        .animate-jiggle {
          animation: jiggle 0.1s infinite;
        }
      `}</style>

      {grid.map((row, rIndex) => (
        row.map((cell, cIndex) => {
          const selected = isSelected(rIndex, cIndex);
          
          let bgColor = "bg-transparent"; 
          let textColor = "text-white";
          
          if (cell.found) {
            // Keep found words colored, ensuring text pops
            bgColor = cell.selectedColor || "bg-green-500";
            textColor = "text-white drop-shadow-md";
          } else if (selected) {
            // Darker orange for selection within the custom orange grid
            bgColor = "bg-[#c05600]"; 
            textColor = "text-white";
          }

          // Anti-bot Style Object (Jitter removed, simply injecting the char)
          const visualStyle = {
            '--real-char': `"${cell.char}"`, // CSS Variable holding the real char
          } as React.CSSProperties;

          return (
            <div
              key={cell.id}
              className={`
                w-full h-full flex items-center justify-center 
                text-xl sm:text-2xl md:text-3xl font-bold uppercase
                ${bgColor} ${textColor} select-none transition-colors duration-75
                relative overflow-hidden
                ${isBonusMode && !cell.found ? 'animate-jiggle' : ''}
              `}
              data-row={rIndex}
              data-col={cIndex}
            >
              {/* 
                DOM OBFUSCATION:
                1. The children of this div contain a 'decoyChar' hidden by text-[0px].
                   A scraper reading innerText will get the wrong letter.
                2. The ::after pseudo-element reads var(--real-char) and displays it.
              */}
              <span 
                className="
                  text-[0px] opacity-0 absolute
                "
              >
                {cell.decoyChar}
              </span>
              <span 
                style={visualStyle}
                className="
                  after:content-[var(--real-char)] 
                  block
                  drop-shadow-sm
                "
              ></span>
            </div>
          );
        })
      ))}
    </div>
  );
};