import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../hooks/useWebSocket';

interface MessagePopupProps {
  message: ChatMessage;
  onClose: () => void;
  onReply: (text: string, replyToId: string) => void;
}

export function MessagePopup({ message, onClose, onReply }: MessagePopupProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showReplyInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showReplyInput]);

  const handleReply = () => {
    if (replyText.trim()) {
      onReply(replyText.trim(), message.id);
      setReplyText('');
      setShowReplyInput(false);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
    if (e.key === 'Escape') {
      if (showReplyInput) {
        setShowReplyInput(false);
        setReplyText('');
      } else {
        onClose();
      }
    }
  };

  const timeAgo = () => {
    const seconds = Math.floor((Date.now() - message.timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-black border-4 border-[#FFD700] rounded-2xl p-5 max-w-sm w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{
          boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/50 hover:text-white text-2xl leading-none transition-colors"
        >
          x
        </button>

        {/* Message content */}
        <div className="mb-4">
          <p
            className="text-white text-lg leading-relaxed break-words"
            style={{ fontFamily: "'Noto Sans', sans-serif" }}
          >
            "{message.text}"
          </p>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-white/50 text-sm mb-4">
          <span className="flex items-center gap-1">
            <span>@{message.senderFingerprint.slice(0, 6)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>{timeAgo()}</span>
          </span>
        </div>

        {/* Reply input (shown when Reply clicked) */}
        {showReplyInput && (
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply..."
                maxLength={280}
                className="flex-1 bg-white/10 border-2 border-[#FFD700]/50 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:border-[#FFD700]"
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim()}
                className="px-4 py-2 bg-[#FFD700] text-black font-bold rounded-lg hover:bg-[#FFD700]/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
            <div className="text-right text-white/40 text-xs mt-1">
              {280 - replyText.length}
            </div>
          </div>
        )}

        {/* Reply button */}
        {!showReplyInput && (
          <button
            onClick={() => setShowReplyInput(true)}
            className="w-full py-3 bg-[#FFD700] text-black font-bold rounded-lg hover:bg-[#FFD700]/80 transition flex items-center justify-center gap-2"
            style={{ fontFamily: 'Impact, sans-serif', letterSpacing: '1px' }}
          >
            <span>REPLY</span>
          </button>
        )}
      </div>
    </div>
  );
}
