import { useState, useEffect, useRef } from 'react';

export interface SpinGame {
  id: string;
  hostId: string;
  hostName: string;
  participants: { id: string; name: string }[];
  status: 'waiting' | 'spinning' | 'result';
  result?: { oderId: string; winnerName: string; prize: string };
  startedAt: number;
}

interface SpinWheelProps {
  game: SpinGame | null;
  myId: string | null;
  onJoin: () => void;
  onStart: () => void;
  onClose: () => void;
}

const PRIZES = [
  { label: 'TRUTH', color: '#FFD700', icon: '🎯' },
  { label: 'DARE', color: '#FF6B6B', icon: '🔥' },
  { label: 'SKIP', color: '#4ECDC4', icon: '⏭️' },
  { label: 'DRINK', color: '#9B59B6', icon: '🍺' },
  { label: 'DANCE', color: '#E74C3C', icon: '💃' },
  { label: 'SING', color: '#3498DB', icon: '🎤' },
  { label: 'JOKE', color: '#2ECC71', icon: '😂' },
  { label: 'SECRET', color: '#E91E63', icon: '🤫' },
];

export function SpinWheel({ game, myId, onJoin, onStart, onClose }: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState(10);

  // Countdown for joining phase
  useEffect(() => {
    if (!game || game.status !== 'waiting') return;

    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    const remaining = Math.max(0, 10 - elapsed);
    setCountdown(remaining);

    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [game]);

  // Handle spinning animation
  useEffect(() => {
    if (game?.status === 'spinning' && !isSpinning) {
      setIsSpinning(true);
      // Spin 5-8 full rotations + land on result
      const prizeIndex = game.result ? PRIZES.findIndex(p => p.label === game.result?.prize) : 0;
      const segmentAngle = 360 / PRIZES.length;
      const targetAngle = 360 * (5 + Math.random() * 3) + (prizeIndex * segmentAngle) + segmentAngle / 2;
      setRotation(targetAngle);
    }
  }, [game?.status, isSpinning]);

  if (!game) return null;

  const isHost = game.hostId === myId;
  const hasJoined = game.participants.some(p => p.id === myId);
  const segmentAngle = 360 / PRIZES.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative bg-black border-4 border-[#FFD700] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white/50 hover:text-white text-2xl"
        >
          ×
        </button>

        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-[#FFD700]" style={{ fontFamily: 'Impact, sans-serif' }}>
            🎰 SPIN THE WHEEL
          </h2>
          <p className="text-white/70 text-sm">
            {game.status === 'waiting' && `Started by ${game.hostName}`}
            {game.status === 'spinning' && 'Spinning...'}
            {game.status === 'result' && 'Result!'}
          </p>
        </div>

        {/* Wheel */}
        <div className="relative w-64 h-64 mx-auto mb-4">
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 text-3xl">
            ▼
          </div>

          {/* Wheel container */}
          <div
            ref={wheelRef}
            className="w-full h-full rounded-full border-4 border-white relative overflow-hidden"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
            }}
          >
            {PRIZES.map((prize, i) => (
              <div
                key={prize.label}
                className="absolute w-full h-full"
                style={{
                  transform: `rotate(${i * segmentAngle}deg)`,
                  clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.tan(Math.PI / PRIZES.length)}% 0%)`,
                }}
              >
                <div
                  className="w-full h-full flex items-start justify-center pt-4"
                  style={{ backgroundColor: prize.color }}
                >
                  <span className="text-black font-bold text-xs rotate-90 origin-center whitespace-nowrap">
                    {prize.icon} {prize.label}
                  </span>
                </div>
              </div>
            ))}
            {/* Center circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black border-4 border-[#FFD700] flex items-center justify-center">
              <span className="text-[#FFD700] text-2xl">🎲</span>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-sm">
              Players ({game.participants.length})
            </span>
            {game.status === 'waiting' && (
              <span className="text-[#FFD700] font-bold">
                {countdown}s left to join
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {game.participants.map(p => (
              <span
                key={p.id}
                className={`px-2 py-1 rounded text-xs ${
                  p.id === myId ? 'bg-[#FFD700] text-black' : 'bg-white/20 text-white'
                }`}
              >
                {p.name} {p.id === game.hostId && '👑'}
              </span>
            ))}
          </div>
        </div>

        {/* Result */}
        {game.status === 'result' && game.result && (
          <div className="bg-[#FFD700]/20 border border-[#FFD700] rounded-lg p-4 mb-4 text-center">
            <p className="text-white text-lg">
              <span className="font-bold text-[#FFD700]">{game.result.winnerName}</span> got:
            </p>
            <p className="text-3xl font-bold text-[#FFD700] mt-2">
              {PRIZES.find(p => p.label === game.result?.prize)?.icon} {game.result.prize}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {game.status === 'waiting' && !hasJoined && !isHost && (
            <button
              onClick={onJoin}
              className="flex-1 py-3 bg-[#FFD700] text-black font-bold rounded-lg hover:bg-[#FFD700]/80 transition"
            >
              JOIN GAME
            </button>
          )}
          {game.status === 'waiting' && hasJoined && !isHost && (
            <div className="flex-1 py-3 bg-green-500/20 text-green-400 font-bold rounded-lg text-center">
              ✓ Joined! Waiting for spin...
            </div>
          )}
          {game.status === 'waiting' && isHost && (
            <button
              onClick={onStart}
              disabled={game.participants.length < 1}
              className="flex-1 py-3 bg-[#FFD700] text-black font-bold rounded-lg hover:bg-[#FFD700]/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SPIN NOW ({game.participants.length} players)
            </button>
          )}
          {(game.status === 'spinning' || game.status === 'result') && (
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/20 text-white font-bold rounded-lg hover:bg-white/30 transition"
            >
              {game.status === 'spinning' ? 'SPINNING...' : 'CLOSE'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { PRIZES };
