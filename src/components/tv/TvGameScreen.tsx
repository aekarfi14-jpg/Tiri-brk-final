import React, { useRef, useEffect, useState } from 'react';
import { GameEngine } from '../../game/gameEngine.ts';
import { MatchState, MatchSummary, TEAMS, WeaponType, PlayerEntity } from '../../types.ts';
import { WEAPONS } from '../../game/constants.ts';
import { Trophy, RotateCcw, Home, Volume2, VolumeX, Shield, Zap, Flame } from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';

interface TvGameScreenProps {
  engine: GameEngine;
  matchState: MatchState;
  summary: MatchSummary | null;
  onRematch: () => void;
  onReturnToLobby: () => void;
  onOpenPhoneSim: (slot: number) => void;
}

export const TvGameScreen: React.FC<TvGameScreenProps> = ({
  engine,
  matchState,
  summary,
  onRematch,
  onReturnToLobby,
  onOpenPhoneSim,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  
  // Throttle HUD updates to 4Hz instead of 60Hz to prevent React performance degradation
  const [hudTick, setHudTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setHudTick((t) => (t + 1) % 1000);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // Responsive Canvas Resize Observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Main 60 FPS Render Loop (pure canvas, zero React rerenders)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      // Update engine
      engine.update(dt);

      // Render canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          ctx.save();
          ctx.scale(dpr, dpr);
          engine.render(ctx, canvas.width / dpr, canvas.height / dpr);
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [engine]);

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const playersList: PlayerEntity[] = Array.from(engine.players.values());
  const countdownVal = Math.ceil(engine.countdownTimer);

  // Scalable team statistics calculation
  const redPlayers = playersList.filter((p) => p.team === 'RED');
  const bluePlayers = playersList.filter((p) => p.team === 'BLUE');
  const greenPlayers = playersList.filter((p) => p.team === 'GREEN');

  const redAlive = redPlayers.filter((p) => p.isAlive).length;
  const blueAlive = bluePlayers.filter((p) => p.isAlive).length;
  const greenAlive = greenPlayers.filter((p) => p.isAlive).length;

  return (
    <div
      id="tv-game-container"
      ref={containerRef}
      className="fixed inset-0 bg-[#090d16] select-none overflow-hidden flex flex-col"
    >
      {/* 60FPS Game Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Top TV HUD Overlay (Scalable for 2 to 32 players) */}
      <div className="relative z-20 flex items-center justify-between p-4 md:p-6 pointer-events-none">
        {/* RED Team Scoreboard */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center gap-2.5">
            <div className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
            <div>
              <span className="text-[10px] uppercase font-bold text-red-300 block">فريق الأحمر • RED</span>
              <span className="text-base font-black font-['Chakra_Petch'] text-white">
                {redAlive} / {redPlayers.length} أحياء
              </span>
            </div>
          </div>
        </div>

        {/* Center Match Banner / Countdown */}
        <div className="pointer-events-auto flex flex-col items-center">
          {matchState === 'COUNTDOWN' && (
            <div className="px-8 py-3 rounded-3xl bg-slate-900/95 border-2 border-cyan-400 shadow-[0_0_40px_rgba(56,189,248,0.5)] text-center animate-bounce">
              <span className="text-[10px] font-black tracking-widest text-cyan-400 uppercase block">
                GET READY • استعد
              </span>
              <span className="text-5xl md:text-6xl font-black font-['Chakra_Petch'] text-white">
                {countdownVal > 0 ? countdownVal : 'FIGHT!'}
              </span>
            </div>
          )}

          {matchState === 'PLAYING' && (
            <div className="px-5 py-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 text-xs font-bold font-mono text-slate-300 flex items-center gap-2 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>مباراة مباشرة • LIVE BATTLE</span>
            </div>
          )}
        </div>

        {/* BLUE Team Scoreboard */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center gap-2.5 text-right flex-row-reverse">
            <div className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-pulse" />
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-300 block">فريق الأزرق • BLUE</span>
              <span className="text-base font-black font-['Chakra_Petch'] text-white">
                {blueAlive} / {bluePlayers.length} أحياء
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Host Audio & Quick Controls */}
      <div className="relative z-20 mt-auto p-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            id="btn-game-toggle-sound"
            onClick={toggleSound}
            className="p-2.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white transition-all cursor-pointer shadow-lg"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>
          <button
            id="btn-return-lobby-early"
            onClick={onReturnToLobby}
            className="px-3 py-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700 hover:border-slate-500 text-xs text-slate-300 hover:text-white transition-all cursor-pointer shadow-lg flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            Lobby
          </button>
        </div>

        {/* Quick Simulated Gamepad open for testing in preview */}
        <div className="pointer-events-auto flex gap-2">
          {playersList.map((p) => (
            <button
              key={p.slot}
              id={`btn-hud-sim-${p.slot}`}
              onClick={() => onOpenPhoneSim(p.slot)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700 hover:border-cyan-400 text-[11px] font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
              title={`Open P${p.slot} Gamepad`}
            >
              🎮 P{p.slot} Pad
            </button>
          ))}
        </div>
      </div>

      {/* Match Victory / Defeat Overlay */}
      {matchState === 'ENDED' && summary && (
        <div
          id="victory-screen-overlay"
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300"
        >
          <div
            className="max-w-md w-full bg-slate-900 border-2 rounded-3xl p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-center space-y-6"
            style={{
              borderColor: summary.winnerTeam ? TEAMS[summary.winnerTeam]?.color : '#38bdf8',
            }}
          >
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
              <Trophy className="w-10 h-10 text-amber-400" />
            </div>

            <div className="space-y-2">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                MATCH CONCLUDED
              </span>
              <h2 className="text-3xl md:text-4xl font-black font-['Chakra_Petch'] text-white">
                {summary.winnerTeam
                  ? `${TEAMS[summary.winnerTeam]?.name} VICTORY!`
                  : 'MATCH DRAW!'}
              </h2>
              {summary.winnerPlayers.length > 0 && (
                <p className="text-sm font-semibold text-emerald-400">
                  Champions: {summary.winnerPlayers.join(', ')}
                </p>
              )}
              <p className="text-xs text-slate-400">Match Duration: {summary.durationSec}s</p>
            </div>

            {/* Fast Rematch Action */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                id="btn-fast-rematch"
                onClick={onRematch}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-cyan-400 text-white font-black text-lg font-['Chakra_Petch'] tracking-wider shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <RotateCcw className="w-5 h-5" />
                FAST REMATCH
              </button>

              <button
                id="btn-victory-return-lobby"
                onClick={onReturnToLobby}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
