import { useEffect, useRef, useState, useCallback } from 'react';

export type StockfishEval = {
  depth: number;
  score: { type: 'cp' | 'mate'; value: number };
  pv: string;
};

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [maxDepth, setMaxDepth] = useState(18);
  const currentFenRef = useRef('');

  // Initialize worker
  useEffect(() => {
    if (!isEnabled) {
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
        workerRef.current = null;
        setIsReady(false);
        setIsAnalyzing(false);
        setEvaluation(null);
      }
      return;
    }

    const worker = new Worker('/stockfish-18-single.js');
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
        const parsed = parseInfoLine(line);
        if (parsed) {
          setEvaluation(parsed);
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
    setIsAnalyzing(true);
    setEvaluation(null);

    workerRef.current.postMessage('stop');
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go depth ${maxDepth}`);
  }, [isReady, maxDepth]);

  const stopAnalysis = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
    }
    setIsAnalyzing(false);
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  return {
    isEnabled,
    isReady,
    isAnalyzing,
    evaluation,
    maxDepth,
    setMaxDepth,
    startAnalysis,
    stopAnalysis,
    toggle,
  };
}

function parseInfoLine(line: string): StockfishEval | null {
  const depthMatch = line.match(/\bdepth (\d+)/);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)/);

  if (!depthMatch || !scoreMatch || !pvMatch) return null;

  return {
    depth: parseInt(depthMatch[1]),
    score: {
      type: scoreMatch[1] as 'cp' | 'mate',
      value: parseInt(scoreMatch[2]),
    },
    pv: pvMatch[1],
  };
}
