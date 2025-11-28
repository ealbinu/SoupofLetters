import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Grid } from './components/Grid';
import { generateLevel } from './utils/gameLogic';
import { CellData, Coordinate, GameState, WordLocation, WordTelemetry } from './types';
import { GAME_DURATION_SECONDS, THEME_COLORS, PRIMARY_ORANGE } from './constants';

// Import images to be bundled
// @ts-ignore
import imgScreen1Central from './images/screen1-centralimage.png';
// @ts-ignore
import imgScreen2Timer from './images/screen2-tienesunminuto.png';
// @ts-ignore
import imgScreen2Regen from './images/screen2-alterminar.png';
// @ts-ignore
import imgScreen2Slide from './images/screen2-desliza.png';
// @ts-ignore
import imgScreen3Tool1 from './images/screen3-tool1.png';
// @ts-ignore
import imgScreen3Tool2 from './images/screen3-tool2.png';
// @ts-ignore
import imgEndScreenTools from './images/endScreen-tools.png';

// --- Sound Utilities (Web Audio API) ---
let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      sharedAudioCtx = new AudioContext();
    }
  }
  return sharedAudioCtx;
};

const playTone = (freqStart: number, freqEnd: number | null, duration: number, type: OscillatorType = 'sine', startTime: number = 0) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime + startTime);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + startTime + duration);
    }

    gain.gain.setValueAtTime(0.1, ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const playSuccessSound = (isBonus: boolean = false) => {
  if (isBonus) {
    const now = 0;
    playTone(523.25, 1046.50, 0.4, 'sawtooth', now);     // C5
    playTone(659.25, 1318.51, 0.4, 'sawtooth', now + 0.05); // E5
    playTone(783.99, 1567.98, 0.4, 'sawtooth', now + 0.1);  // G5
  } else {
    playTone(800, 1200, 0.2, 'sine');
  }
};

const playGameOverSound = () => {
  playTone(300, 100, 0.6, 'triangle');
};

interface FloatingScore {
  id: number;
  score: number;
  x: number;
  y: number;
  isBonus: boolean;
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  // 0: Instructions 1 (Grid), 1: Instructions 2 (Timer), 2: Start Screen (Title)
  const [menuStep, setMenuStep] = useState(0); 

  const [grid, setGrid] = useState<CellData[][]>([]);
  const [words, setWords] = useState<WordLocation[]>([]);
  const [score, setScore] = useState(0);
  const [foundWordsCount, setFoundWordsCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  
  const [isRegenerating, setIsRegenerating] = useState(false);

  const timerRef = useRef<number | null>(null);
  const sessionStatsRef = useRef<WordTelemetry[][]>([]);
  const currentLevelIndexRef = useRef<number>(-1);

  useEffect(() => {
    window.parent.postMessage({ state: "start" }, "*");
  }, []);

  const startLevel = useCallback(() => {
    const { grid: newGrid, locations } = generateLevel();
    setGrid(newGrid);
    setWords(locations);
    setFoundWordsCount(0);
    
    sessionStatsRef.current.push([]);
    currentLevelIndexRef.current = sessionStatsRef.current.length - 1;
  }, []);

  const startGame = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(e => console.error("Audio resume failed", e));
    }

    setScore(0);
    setTimeLeft(GAME_DURATION_SECONDS);
    setGameState(GameState.PLAYING);
    setIsRegenerating(false);
    setFloatingScores([]);
    
    sessionStatsRef.current = [];
    currentLevelIndexRef.current = -1;

    window.parent.postMessage({ state: "gamestart" }, "*");

    startLevel();
  };

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setGameState(GameState.GAME_OVER);
            playGameOverSound();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === GameState.GAME_OVER) {
       window.parent.postMessage({
        state: "gameover",
        score: score,
        points: sessionStatsRef.current
      }, "*");
    }
  }, [gameState, score]);

  const handleSelectionEnd = (
    selectedCoords: Coordinate[], 
    durationMs: number, 
    pointerType: string, 
    startTime: number,
    clientEndPos: {x: number, y: number} | null
  ) => {
    if (selectedCoords.length === 0) return;

    const selectedWord = selectedCoords.map(c => grid[c.row][c.col].char).join('');
    const reverseWord = selectedWord.split('').reverse().join('');

    const targetWordIndex = words.findIndex(
      w => !w.found && (w.word === selectedWord || w.word === reverseWord)
    );

    if (targetWordIndex !== -1) {
      const wordData = words[targetWordIndex];
      const newWords = [...words];
      newWords[targetWordIndex].found = true;
      
      const basePoints = wordData.word.length * 10;
      let timeMultiplier = timeLeft;
      let isBonus = false;

      let finalPoints = basePoints * timeMultiplier;
      
      if (timeLeft <= 5) {
        finalPoints = finalPoints * 10;
        isBonus = true;
      }
      
      const colorClass = THEME_COLORS[targetWordIndex % THEME_COLORS.length];
      newWords[targetWordIndex].color = colorClass;

      setWords(newWords);
      setScore(s => s + finalPoints);
      setFoundWordsCount(c => c + 1);

      playSuccessSound(isBonus);

      if (clientEndPos) {
        const id = Date.now();
        setFloatingScores(prev => [...prev, {
          id,
          score: finalPoints,
          x: clientEndPos.x,
          y: clientEndPos.y,
          isBonus
        }]);

        setTimeout(() => {
          setFloatingScores(prev => prev.filter(p => p.id !== id));
        }, 1000);
      }

      if (currentLevelIndexRef.current >= 0) {
        sessionStatsRef.current[currentLevelIndexRef.current].push({
          palabra: wordData.word,
          puntos: finalPoints,
          timestamp: Date.now(),
          duracion_ms: durationMs,
          inicio_arrastre_ts: startTime,
          tipo_entrada: pointerType
        });
      }

      setGrid(prevGrid => {
        const nextGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));
        wordData.coords.forEach(c => {
          nextGrid[c.row][c.col].found = true;
          nextGrid[c.row][c.col].selectedColor = colorClass;
        });
        return nextGrid;
      });

      if (navigator.vibrate) navigator.vibrate(isBonus ? [50, 50, 50] : 50);
    }
  };

  useEffect(() => {
    if (
        gameState === GameState.PLAYING && 
        words.length > 0 && 
        foundWordsCount === words.length && 
        !isRegenerating 
    ) {
        setScore(s => s + (timeLeft * 10)); 
        setIsRegenerating(true);
        playSuccessSound(); 

        setTimeout(() => {
           startLevel();
           setTimeout(() => {
             setIsRegenerating(false);
           }, 50);
        }, 600);
    }
  }, [foundWordsCount, words.length, gameState, startLevel, timeLeft, isRegenerating]);

  const renderIntroSequence = () => {
    switch(menuStep) {
      case 0: // Instructions 1: ¿Cómo jugar?
        return (
          <div className={`flex flex-col h-full w-full bg-[${PRIMARY_ORANGE}] text-white overflow-hidden`}>
            {/* Orange Body */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                <h2 className="text-4xl font-black uppercase mb-6 drop-shadow-sm text-center">¿CÓMO JUGAR?</h2>
                
                <p className="text-lg font-medium text-center max-w-md mb-8 leading-relaxed">
                  Pon a prueba tu habilidad y encuentra la mayor cantidad de palabras en los tableros dinámicos.
                </p>

                {/* Central Grid Image */}
                <div className="relative flex items-center justify-center mb-4 w-full">
                    <img src={imgScreen1Central} alt="Tutorial Grid" className="w-full max-w-xs h-auto object-contain drop-shadow-lg" />
                </div>
            </div>

            {/* White Footer */}
            <div className="p-6 bg-white flex gap-4 justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                <button 
                  disabled
                  className="bg-[#4A4A4A] text-white font-black py-3 px-6 rounded-lg uppercase tracking-wider text-sm shadow opacity-50 cursor-not-allowed"
                >
                  REGRESAR
                </button>
                <button 
                  onClick={() => setMenuStep(1)}
                  className={`bg-[${PRIMARY_ORANGE}] text-white font-black py-3 px-8 rounded-lg uppercase tracking-wider text-sm shadow-lg hover:brightness-110 transition-colors`}
                >
                  SIGUIENTE
                </button>
            </div>
          </div>
        );

      case 1: // Instructions 2: Tienes sólo un minuto
        return (
          <div className={`flex flex-col h-full w-full bg-[${PRIMARY_ORANGE}] text-white overflow-hidden`}>
             {/* Orange Body */}
             <div className="flex-1 flex flex-col items-center justify-start pt-10 px-8 text-center relative overflow-y-auto">
                <h2 className="text-3xl font-black uppercase mb-4 drop-shadow-sm">Tienes sólo un minuto.</h2>
                
                {/* Timer Graphic */}
                <div className="w-full max-w-xs mb-6 flex items-center justify-center">
                    <img src={imgScreen2Timer} alt="Timer" className="w-full h-auto object-contain drop-shadow-lg" />
                </div>

                <p className="text-base font-medium max-w-md mb-4 leading-relaxed">
                  Al terminar cada tablero aparecerá uno nuevo para que sigas jugando y desafíes tu agilidad.
                </p>

                {/* Regeneration Visual */}
                <div className="w-full max-w-xs mb-6 flex items-center justify-center">
                   <img src={imgScreen2Regen} alt="Regeneration Flow" className="w-full h-auto object-contain" />
                </div>

                {/* Slide Instruction */}
                <p className="text-sm font-medium max-w-md mb-2 leading-relaxed opacity-90">
                  Desliza tu dedo o cursor por las letras para formar las palabras en horizontal, vertical y diagonal.
                </p>

                {/* Swipe/Slide Visual */}
                <div className="w-full max-w-xs mb-4 flex items-center justify-center">
                   <img src={imgScreen2Slide} alt="Swipe Gesture" className="w-full h-auto object-contain" />
                </div>
            </div>

            {/* White Footer */}
            <div className="p-6 bg-white flex gap-4 justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                <button 
                  onClick={() => setMenuStep(0)}
                  className="bg-[#4A4A4A] text-white font-black py-3 px-6 rounded-lg uppercase tracking-wider text-sm shadow hover:bg-gray-700 transition-colors"
                >
                  REGRESAR
                </button>
                <button 
                  onClick={() => setMenuStep(2)}
                  className={`bg-[${PRIMARY_ORANGE}] text-white font-black py-3 px-8 rounded-lg uppercase tracking-wider text-sm shadow-lg hover:brightness-110 transition-colors`}
                >
                  SIGUIENTE
                </button>
            </div>
          </div>
        );

      case 2: // Screen 3: Title / Start
          return (
            <div className={`flex flex-col items-center justify-between h-full w-full py-12 px-6 text-center animate-fade-in bg-[${PRIMARY_ORANGE}] text-white relative overflow-hidden`}>
              {/* Header / Logo Area */}
              <div className="flex-grow flex flex-col items-center justify-center relative w-full max-w-lg">
                 {/* Decorative Tools */}
                 <img src={imgScreen3Tool1} alt="" className="w-48 h-auto absolute -top-10 -left-10 md:left-0 opacity-90" />
                 <img src={imgScreen3Tool2} alt="" className="w-48 h-auto absolute bottom-0 -right-10 md:right-0 opacity-90" />
                 
                 <h1 className="text-5xl sm:text-6xl font-black uppercase tracking-tight mb-4 drop-shadow-md z-10 leading-tight">
                   ENCUENTRA<br/>LAS PALABRAS
                 </h1>
              </div>
  
              <div className="flex flex-col w-full max-w-xs z-10 gap-4">
                  <button 
                    onClick={startGame}
                    className="w-full bg-white text-[#F5750D] hover:bg-gray-100 active:scale-95 text-2xl font-black py-4 px-8 rounded-xl shadow-xl uppercase tracking-wider transition-all"
                  >
                    INICIAR
                  </button>
                  
                  <button 
                    onClick={() => setMenuStep(1)}
                    className="w-full text-white/80 hover:text-white font-bold uppercase tracking-wider text-sm py-2"
                  >
                    Regresar
                  </button>
              </div>
            </div>
          );
      
      default:
        return null;
    }
  }

  const renderGameOver = () => (
    <div className={`flex flex-col items-center justify-center h-full w-full text-center animate-fade-in bg-[${PRIMARY_ORANGE}] text-white relative overflow-hidden`}>
      
      {/* Main Content */}
      <div className="z-10 flex flex-col items-center p-6 max-w-sm w-full">
        
        <h2 className="text-4xl sm:text-5xl font-black uppercase mb-2 tracking-wide drop-shadow-md">FELICIDADES</h2>
        
        <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] opacity-90 mb-4">
          OBTUVISTE
        </p>
        
        <div className="mb-2 scale-110 transform transition-transform">
            <span className="text-7xl sm:text-8xl font-black drop-shadow-xl leading-none">
              {score}
            </span>
        </div>
        
        <p className="text-2xl sm:text-3xl font-black uppercase mb-12 tracking-wide">
          PUNTOS
        </p>

        {/* Center Graphic */}
        <div className="flex justify-center w-full mb-8 px-4 gap-8">
            <img src={imgEndScreenTools} alt="Tools" className="w-full h-auto opacity-90" />
        </div>

        <div className="text-center px-4 mb-8">
           <p className="text-sm leading-relaxed opacity-90 font-medium">
             ¡Gracias por participar! <br/>
             Si eres uno de los ganadores te contactaremos al correo electrónico o teléfono registrado.
           </p>
        </div>

        <button 
          onClick={() => {
            setMenuStep(0);
            setGameState(GameState.MENU);
          }}
          className="mt-4 px-8 py-3 bg-white text-[#F5750D] font-black rounded-full shadow-lg text-sm uppercase tracking-wider hover:bg-gray-50 transition-colors active:scale-95"
        >
          Volver a jugar
        </button>
      </div>
    </div>
  );

  const renderGame = () => {
    const isBonusTime = timeLeft <= 5;
    const timerColor = isBonusTime ? 'bg-red-600 animate-pulse' : `bg-[${PRIMARY_ORANGE}]`;
    const timerShadow = isBonusTime ? 'shadow-[0_0_12px_rgba(220,38,38,0.9)]' : 'shadow-[0_0_6px_rgba(245,117,13,0.6)]';
    
    const flashStyle = isBonusTime ? {
        animation: 'bg-flash 0.5s infinite alternate'
    } : {};

    return (
    <div 
        className="flex flex-col h-full max-w-md mx-auto relative bg-white overflow-hidden"
        style={flashStyle}
    >
      <style>{`
        @keyframes bg-flash {
            from { background-color: #fff; }
            to { background-color: #fee2e2; }
        }
      `}</style>

      {floatingScores.map((fs) => (
        <div
            key={fs.id}
            className={`pointer-events-none fixed z-50 font-black text-2xl animate-float-score ${fs.isBonus ? 'text-red-600 text-4xl' : `text-[${PRIMARY_ORANGE}]`}`}
            style={{ 
              left: fs.x, 
              top: fs.y,
              textShadow: '0px 2px 4px rgba(255,255,255,1)'
            }}
        >
            +{fs.score}
        </div>
      ))}

      <style>{`
        @keyframes floatScore {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-100px) translateX(20px) scale(1.2); }
        }
        .animate-float-score {
          animation: floatScore 0.8s ease-out forwards;
        }
      `}</style>

      {/* Header */}
      <div className="bg-white pt-4 pb-2 px-6 shadow-sm z-10 border-b-2 border-gray-100 relative transition-colors duration-300">
        <div className="flex justify-between items-end mb-2">
           <div className="flex flex-col">
             <span className={`text-[${PRIMARY_ORANGE}] font-bold text-xs uppercase tracking-wide mb-1 opacity-80`}>Palabras:</span>
             <span className={`text-3xl font-black text-[${PRIMARY_ORANGE}] leading-none`}>{foundWordsCount}</span>
           </div>
           
           <div className="flex flex-col items-center justify-end pb-1 relative">
             <div className={`
                absolute -top-5 text-center font-black italic uppercase tracking-tighter text-red-600
                transition-opacity duration-200
                ${isBonusTime ? 'opacity-100 animate-bounce' : 'opacity-0'}
             `}>
                Bonus 10x
             </div>

             <div className="flex bg-gray-700 p-1 rounded gap-1 shadow-inner">
               {[...Array(6)].map((_, i) => {
                 const active = i < Math.ceil(timeLeft / 10);
                 const barClass = active ? `${timerColor} ${timerShadow}` : 'bg-gray-600 opacity-30';
                 return (
                   <div 
                     key={i}
                     className={`w-3 h-6 sm:w-4 sm:h-7 rounded-sm transition-all duration-300 ${barClass}`}
                   />
                 );
               })}
             </div>
           </div>

           <div className="flex flex-col items-end">
             <span className={`text-[${PRIMARY_ORANGE}] font-bold text-xs uppercase tracking-wide mb-1 opacity-80`}>Puntos:</span>
             <span className={`text-3xl font-black text-[${PRIMARY_ORANGE}] leading-none transition-transform duration-100 key={score}`}>{score}</span>
           </div>
        </div>
      </div>

      <div className="flex-grow flex flex-col items-center p-4">
        <div 
          className={`
            w-full max-w-sm mt-2 transition-all duration-500 transform
            ${isRegenerating ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}
          `}
        >
           <Grid grid={grid} onSelectionEnd={handleSelectionEnd} isBonusMode={isBonusTime} />
        </div>

        <div 
          className={`
            mt-8 w-full max-w-sm flex-grow transition-opacity duration-300 delay-100
            ${isRegenerating ? 'opacity-0' : 'opacity-100'}
          `}
        >
            <div className="grid grid-cols-2 gap-y-3 gap-x-8 px-4">
                {words.map((w, idx) => (
                <div 
                    key={`${w.word}-${idx}`}
                    className={`
                    text-center font-bold text-lg uppercase transition-all duration-300 tracking-wider
                    ${w.found 
                        ? 'text-gray-300 scale-95' 
                        : `text-[${PRIMARY_ORANGE}]`}
                    `}
                >
                    {w.word}
                </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="h-screen w-full bg-white text-gray-800 font-sans overflow-hidden select-none">
      {gameState === GameState.MENU && renderIntroSequence()}
      {gameState === GameState.PLAYING && renderGame()}
      {gameState === GameState.GAME_OVER && renderGameOver()}
    </div>
  );
};

export default App;