import { useState, useCallback, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  maxLength?: number;
}

export function ChatInput({ onSend, onTyping, disabled = false, maxLength = 280 }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value.slice(0, maxLength));
    onTyping?.();
  }, [maxLength, onTyping]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const remaining = maxLength - text.length;

  return (
    <form onSubmit={handleSubmit} className="manga-panel p-2 sm:p-3 rounded-lg">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
          disabled={disabled}
          className="manga-input flex-1 px-3 py-2 sm:py-3 rounded-full text-sm"
          maxLength={maxLength}
        />
        <span className={`text-[10px] font-bold min-w-[24px] text-center ${
          remaining < 20 ? 'text-red-500' : 'text-[#666]'
        }`}>
          {remaining}
        </span>
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="manga-button w-10 h-10 sm:w-auto sm:h-auto sm:px-5 sm:py-2 rounded-full sm:rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          <span className="hidden sm:inline">SEND</span>
          <svg className="w-5 h-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </form>
  );
}

export default ChatInput;
