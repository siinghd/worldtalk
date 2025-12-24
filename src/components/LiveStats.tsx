import type { Stats } from '../hooks/useWebSocket';

interface LiveStatsProps {
  stats: Stats;
  connected: boolean;
}

export function LiveStats({ stats, connected }: LiveStatsProps) {
  return (
    <div className="flex items-center gap-3 bg-black/80 px-3 py-2 rounded-lg border border-[#FFD700]/30">
      {/* Connection indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? 'bg-[#FFD700] animate-pulse' : 'bg-red-500'
          }`}
        />
        <span className="text-[10px] text-[#FFD700] font-medium hidden sm:inline">
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Compact stats */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-[#FFD700] font-bold">{formatNumber(stats.usersOnline)}</span>
          <span className="text-white/50 hidden sm:inline">online</span>
        </div>
        <div className="w-px h-3 bg-white/20 hidden sm:block" />
        <div className="flex items-center gap-1 hidden sm:flex">
          <span className="text-[#FFD700] font-bold">{formatNumber(stats.allTimeUsers)}</span>
          <span className="text-white/50">total</span>
        </div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export default LiveStats;
