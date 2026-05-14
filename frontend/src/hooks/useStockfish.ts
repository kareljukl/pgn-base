import { useEffect, useRef, useState, useCallback } from 'react';
import { Chess } from 'chess.js';

export type StockfishEval = {
  multiPvIndex: number;
  depth: number;
  score: { type: 'cp' | 'mate'; value: number };
  pvUci: string;
  pvSan: string[];
};

type EngineSettings = {
  multiPV: number;
  depth: number;
  arrows: boolean;
};

const SETTINGS_KEY = 'pgn-base-engine-settings';
const DEFAULT_SETTINGS: EngineSettings = { multiPV: 3, depth: 18, arrows: false };

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function loadSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      multiPV: clampInt(parsed.multiPV, 1, 5, DEFAULT_SETTINGS.multiPV),
      depth: clampInt(parsed.depth, 1, 30, DEFAULT_SETTINGS.depth),
      arrows: typeof parsed.arrows === 'boolean' ? parsed.arrows : DEFAULT_SETTINGS.arrows,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useStockfish() {
  const [settings, setSettings] = useState<EngineSettings>(loadSettings);
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [evaluations, setEvaluations] = useState<StockfishEval[]>([]);
  const evalMapRef = useRef<Map<number, StockfishEval>>(new Map());
  const currentFenRef = useRef('');

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore quota / disabled storage
    }
  }, [settings]);

  // Initialize / teardown worker
  useEffect(() => {
    if (!isEnabled) {
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
        workerRef.current = null;
        setIsReady(false);
        setIsAnalyzing(false);
        setEvaluations([]);
        evalMapRef.current.clear();
      }
      return;
    }

    let worker: Worker;

    if (import.meta.env.PROD) {
      // Cross-origin workers require blob URL workaround.
      // Stockfish reads WASM path from self.location.hash — pass it via blob URL hash.
      const cdnBase = 'https://unpkg.com/stockfish@18.0.7/bin';
      const blob = new Blob(
        [`importScripts("${cdnBase}/stockfish-18-single.js");`],
        { type: 'application/javascript' }
      );
      const blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl + '#' + encodeURIComponent(`${cdnBase}/stockfish-18-single.wasm`));
    } else {
      worker = new Worker('/stockfish-18-single.js');
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<string>) => {
      const line = typeof e.data === 'string' ? e.data : '';

      if (line === 'uciok') {
        worker.postMessage('isready');
      }

      if (line === 'readyok') {
        setIsReady(true);
      }

      // Parse "info" lines
      if (line.startsWith('info') && line.includes('score') && line.includes(' pv ')) {
        const parsed = parseInfoLine(line, currentFenRef.current);
        if (parsed) {
          evalMapRef.current.set(parsed.multiPvIndex, parsed);
          const sorted = [...evalMapRef.current.values()].sort(
            (a, b) => a.multiPvIndex - b.multiPvIndex
          );
          setEvaluations(sorted);
        }
      }

      // Best move = analysis done
      if (line.startsWith('bestmove')) {
        setIsAnalyzing(false);
      }
    };

    worker.postMessage('uci');

    return () => {
      worker.postMessage('quit');
      worker.terminate();
      workerRef.current = null;
      setIsReady(false);
      setIsAnalyzing(false);
    };
  }, [isEnabled]);

  const startAnalysis = useCallback((fen: string) => {
    if (!workerRef.current || !isReady) return;

    currentFenRef.current = fen;
    evalMapRef.current.clear();
    setEvaluations([]);
    setIsAnalyzing(true);

    workerRef.current.postMessage('stop');
    workerRef.current.postMessage(`setoption name MultiPV value ${settings.multiPV}`);
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go depth ${settings.depth}`);
  }, [isReady, settings.multiPV, settings.depth]);

  const stopAnalysis = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
    }
    setIsAnalyzing(false);
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const setMultiPV = useCallback((n: number) => {
    setSettings((s) => ({ ...s, multiPV: clampInt(n, 1, 5, s.multiPV) }));
  }, []);

  const setDepth = useCallback((n: number) => {
    setSettings((s) => ({ ...s, depth: clampInt(n, 1, 30, s.depth) }));
  }, []);

  const setArrows = useCallback((v: boolean) => {
    setSettings((s) => ({ ...s, arrows: v }));
  }, []);

  const bestPv = evaluations.find((e) => e.multiPvIndex === 1) ?? null;
  const bestMoveUci = bestPv?.pvUci.split(/\s+/)[0] ?? null;
  const currentDepth = bestPv?.depth ?? 0;

  return {
    isEnabled,
    isReady,
    isAnalyzing,
    evaluations,
    bestMoveUci,
    currentDepth,
    multiPV: settings.multiPV,
    depth: settings.depth,
    arrows: settings.arrows,
    setMultiPV,
    setDepth,
    setArrows,
    startAnalysis,
    stopAnalysis,
    toggle,
  };
}

function parseInfoLine(line: string, fen: string): StockfishEval | null {
  const depthMatch = line.match(/\bdepth (\d+)/);
  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);

  if (!depthMatch || !scoreMatch || !pvMatch) return null;

  const pvUci = pvMatch[1].trim();
  const pvSan = uciSequenceToSan(fen, pvUci.split(/\s+/));

  return {
    multiPvIndex: multipvMatch ? parseInt(multipvMatch[1]) : 1,
    depth: parseInt(depthMatch[1]),
    score: {
      type: scoreMatch[1] as 'cp' | 'mate',
      value: parseInt(scoreMatch[2]),
    },
    pvUci,
    pvSan,
  };
}

function uciSequenceToSan(fen: string, uciMoves: string[]): string[] {
  if (!fen) return [];
  try {
    const chess = new Chess(fen);
    const result: string[] = [];
    for (const uci of uciMoves) {
      if (!uci || uci.length < 4) break;
      try {
        const move = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        result.push(move.san);
      } catch {
        break;
      }
    }
    return result;
  } catch {
    return [];
  }
}
