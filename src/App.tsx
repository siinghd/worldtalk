import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Globe, type OnlineUser } from './components/Globe';
import { ChatInput } from './components/ChatInput';
import { LiveStats } from './components/LiveStats';
import { useWebSocket, type ChatMessage, type LeaderboardEntry } from './hooks/useWebSocket';
import { useFingerprint } from './hooks/useFingerprint';
import { playMessageSound, playDMSound, playReactionSound, getDistance } from './utils/sounds';

// Notification Toast Component
function DMNotification({
  message,
  sender,
  onOpen,
  onDismiss
}: {
  message: ChatMessage;
  sender: OnlineUser | undefined;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const nickname = sender ? getNickname(sender.id) : 'Someone';

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-slide-down cursor-pointer"
      onClick={onOpen}
    >
      <div className="bg-[#FFD700] px-4 py-3 rounded-xl shadow-2xl border-2 border-black flex items-center gap-3 max-w-[90vw] sm:max-w-md">
        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center shrink-0">
          <span className="text-[#FFD700] text-lg">💬</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-black font-bold text-sm truncate">
            {nickname}
          </p>
          <p className="text-black/70 text-xs truncate">{message.text}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="text-black/60 hover:text-black shrink-0 text-xl font-bold"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Generate fun nickname from user ID
const ADJECTIVES = [
  'Swift', 'Cosmic', 'Neon', 'Silent', 'Wild', 'Chill', 'Zen', 'Bold',
  'Lunar', 'Solar', 'Mystic', 'Pixel', 'Turbo', 'Mega', 'Ultra', 'Hyper',
  'Crimson', 'Azure', 'Golden', 'Silver', 'Shadow', 'Storm', 'Thunder', 'Frost',
  'Blaze', 'Spark', 'Drift', 'Sonic', 'Quantum', 'Retro', 'Cyber', 'Astro'
];

const ANIMALS = [
  'Fox', 'Wolf', 'Bear', 'Hawk', 'Tiger', 'Lion', 'Panda', 'Koala',
  'Eagle', 'Falcon', 'Raven', 'Owl', 'Phoenix', 'Dragon', 'Shark', 'Whale',
  'Panther', 'Jaguar', 'Lynx', 'Cobra', 'Viper', 'Mantis', 'Beetle', 'Hornet',
  'Penguin', 'Otter', 'Raccoon', 'Badger', 'Mongoose', 'Leopard', 'Cheetah', 'Gazelle'
];

function getNickname(id: string): string {
  // Generate consistent index from ID
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  const adjIndex = Math.abs(hash) % ADJECTIVES.length;
  const animalIndex = Math.abs(hash >> 8) % ANIMALS.length;
  const shortId = id.slice(0, 4).toUpperCase();
  return `${ADJECTIVES[adjIndex]} ${ANIMALS[animalIndex]} #${shortId}`;
}

// Conversations List Component
function ConversationsList({
  conversations,
  users,
  onSelect,
  selectedUserId,
  onClose,
  isMobile
}: {
  conversations: { oderId: string; lastMessage: ChatMessage; unread: number }[];
  users: OnlineUser[];
  onSelect: (user: OnlineUser) => void;
  selectedUserId?: string;
  onClose?: () => void;
  isMobile?: boolean;
}) {
  return (
    <div className={`${isMobile ? 'fixed inset-0 z-50 bg-black/90' : 'fixed left-0 top-[72px] bottom-20 w-[260px] z-30 hidden lg:flex border-r border-[#FFD700]/20'} backdrop-blur-xl bg-black/40 flex flex-col`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#FFD700]/20 flex items-center justify-between bg-black/30">
        <h2 className="text-[#FFD700] font-bold text-sm flex items-center gap-2">
          💬 CHATS
        </h2>
        {isMobile && onClose && (
          <button onClick={onClose} className="text-white text-2xl font-bold">×</button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-6 text-white/50 text-sm text-center">
            <p className="text-base mb-2">No chats yet</p>
            <p className="text-xs">Click on a user on the globe to start a private conversation</p>
          </div>
        ) : (
          conversations.map(({ oderId, lastMessage, unread }) => {
            // Find user by visitorId (stable fingerprint)
            const otherUser = users.find(u => u.visitorId === oderId);
            if (!otherUser) return null;
            const isSelected = selectedUserId === oderId;
            const nickname = getNickname(oderId);
            return (
              <div
                key={oderId}
                onClick={() => { onSelect(otherUser); onClose?.(); }}
                className={`px-4 py-3 border-b border-white/5 cursor-pointer transition-all ${
                  isSelected ? 'bg-[#FFD700]/20 border-l-2 border-l-[#FFD700]' : 'hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FFD700]/90 flex items-center justify-center shrink-0 shadow-lg shadow-[#FFD700]/20">
                    <span className="text-black text-[10px] font-bold leading-tight text-center">{nickname.split(' ')[1]?.slice(0,3) || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white font-medium text-sm truncate">
                        {nickname}
                      </p>
                      {unread > 0 && (
                        <span className="bg-[#FFD700] text-black text-[10px] w-5 h-5 rounded-full font-bold flex items-center justify-center shadow-lg shadow-[#FFD700]/30">
                          {unread}
                        </span>
                      )}
                    </div>
                    <p className="text-white/50 text-xs truncate">
                      {otherUser.city && <span>{otherUser.city} · </span>}
                      {lastMessage.text}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Leaderboard Component
function Leaderboard({ entries, isOpen, onToggle, isMobile }: { entries: LeaderboardEntry[]; isOpen: boolean; onToggle: () => void; isMobile?: boolean }) {
  if (!isOpen) {
    // Desktop toggle button only - positioned in corner
    return (
      <button
        onClick={onToggle}
        className="fixed right-20 top-20 z-20 bg-black/80 border border-[#FFD700]/50 px-2 py-1.5 rounded text-xs items-center gap-1.5 hover:bg-[#FFD700] hover:text-black hover:border-[#FFD700] transition-colors group hidden lg:flex"
      >
        <span>🏆</span>
        <span className="text-[#FFD700] font-medium group-hover:text-black">Top 10</span>
      </button>
    );
  }

  // Mobile: full screen overlay, Desktop: side panel
  return (
    <div className={`fixed z-50 bg-black flex flex-col ${
      isMobile
        ? 'inset-0'
        : 'right-20 top-28 w-64 rounded-lg border border-[#FFD700] shadow-xl max-h-[50vh]'
    }`}>
      <div className="bg-[#FFD700] px-3 py-2 flex items-center justify-between shrink-0">
        <h3 className="text-black font-bold text-sm">🏆 TOP CITIES</h3>
        <button onClick={onToggle} className="text-black text-lg font-bold leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-white/40 text-sm p-4 text-center">No messages yet. Be the first!</p>
        ) : (
          entries.map((entry, i) => (
            <div
              key={`${entry.city}-${entry.country}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 border-b border-white/5"
            >
              <span className={`text-lg w-7 text-center ${i < 3 ? '' : 'text-white/40 text-sm'}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate text-sm">{entry.city}</p>
                <p className="text-white/40 text-xs truncate">{entry.country}</p>
              </div>
              <span className="text-[#FFD700] font-bold text-sm">{entry.messageCount}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// DM Sidebar Component
function DMSidebar({
  user,
  messages,
  myId,
  onClose,
  onSend
}: {
  user: OnlineUser;
  messages: ChatMessage[];
  myId: string | null;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dmMessages = messages.filter(m => {
    if (!m.encrypted || !m.encryptedFor || !m.senderId) return false;
    // Messages I sent to this user OR messages this user sent to me (using visitorId)
    const sentByMeToUser = m.senderId === myId && m.encryptedFor === user.visitorId;
    const sentByUserToMe = m.senderId === user.visitorId && m.encryptedFor === myId;
    return sentByMeToUser || sentByUserToMe;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages.length]);

  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const nickname = getNickname(user.id);

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[380px] bg-black sm:border-l-2 border-[#FFD700] z-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#FFD700] px-4 py-3 flex justify-between items-center shrink-0 safe-area-top">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
            <span className="text-[#FFD700] text-[10px] font-bold">{nickname.split(' ')[1]?.slice(0,3) || '?'}</span>
          </div>
          <div>
            <h3 className="text-black font-bold text-base">
              {nickname}
            </h3>
            <p className="text-black/70 text-xs">{user.city}{user.country && `, ${user.country}`}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-black hover:text-black/70 text-2xl leading-none font-bold w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10"
        >
          ×
        </button>
      </div>

      {/* Private indicator */}
      <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2 text-white/50 text-xs shrink-0">
        <span>🔒</span>
        <span>Private · End-to-end</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {dmMessages.length === 0 ? (
          <div className="text-center text-white/40 py-8">
            <p className="text-lg mb-2">No messages yet</p>
            <p className="text-sm">Say hello!</p>
          </div>
        ) : (
          dmMessages.map((msg) => {
            const isMine = msg.senderId === myId;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2 rounded-2xl border-2 ${
                  isMine
                    ? 'bg-[#FFD700] text-black border-black rounded-br-sm'
                    : 'bg-white/10 text-white border-white/20 rounded-bl-sm'
                }`}>
                  <p className="text-sm break-words">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? 'text-black/60' : 'text-white/40'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 sm:p-4 border-t border-white/10 shrink-0 safe-area-bottom bg-black">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-white/10 border-2 border-white/20 rounded-full px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#FFD700] text-base"
            maxLength={280}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="bg-[#FFD700] text-black w-12 h-12 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#FFE44D] transition-colors flex items-center justify-center border-2 border-black"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [notification, setNotification] = useState<{ message: ChatMessage; sender: OnlineUser | undefined } | null>(null);
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const [showChats, setShowChats] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const lastMessageIdRef = useRef<string | null>(null);

  // Get unique browser fingerprint
  const { visitorId } = useFingerprint();

  // Track mobile state
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    connected,
    stats,
    location,
    myVisitorId,
    users,
    messages,
    leaderboard,
    typingUsers,
    newReaction,
    sendMessage,
    sendTyping
  } = useWebSocket(visitorId);

  // Build conversations list from messages (using visitorId for stable matching)
  const conversations = useMemo(() => {
    const convMap = new Map<string, { oderId: string; lastMessage: ChatMessage; unread: number }>();

    messages.forEach(msg => {
      if (!msg.encrypted || !msg.encryptedFor || !msg.senderId) return;

      // Determine the "other" user in this conversation (using visitorId/fingerprint)
      let oderId: string;
      if (msg.encryptedFor === myVisitorId) {
        // Message sent TO me - sender is the other user
        oderId = msg.senderId;
      } else if (msg.senderId === myVisitorId) {
        // Message sent BY me - recipient is the other user
        oderId = msg.encryptedFor;
      } else {
        // Message not involving me
        return;
      }

      const existing = convMap.get(oderId);
      const isUnread = msg.encryptedFor === myVisitorId && !readMessages.has(msg.id);

      if (!existing || msg.timestamp > existing.lastMessage.timestamp) {
        convMap.set(oderId, {
          oderId,
          lastMessage: msg,
          unread: (existing?.unread || 0) + (isUnread ? 1 : 0)
        });
      } else if (isUnread) {
        existing.unread++;
      }
    });

    return Array.from(convMap.values()).sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
  }, [messages, myVisitorId, readMessages]);

  // Watch for new messages and play sounds
  useEffect(() => {
    if (messages.length === 0 || !location) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.id === lastMessageIdRef.current) return;
    lastMessageIdRef.current = latestMessage.id;

    // Calculate distance from sender
    const distance = getDistance(location.lat, location.lng, latestMessage.lat, latestMessage.lng);

    if (latestMessage.encrypted && latestMessage.encryptedFor === myVisitorId) {
      // DM notification - use senderId (visitorId) to find sender
      const sender = users.find(u => u.visitorId === latestMessage.senderId);

      const sidebarOpenForSender = selectedUser && selectedUser.visitorId === latestMessage.senderId;

      if (!sidebarOpenForSender) {
        setNotification({ message: latestMessage, sender });
        playDMSound();
      } else {
        setReadMessages(prev => new Set(prev).add(latestMessage.id));
      }
    } else if (!latestMessage.encrypted) {
      // Broadcast message - play distance-based sound
      playMessageSound(distance);
    }
  }, [messages, myVisitorId, selectedUser, users, location]);

  // Play sound on new reaction
  useEffect(() => {
    if (newReaction) {
      playReactionSound();
    }
  }, [newReaction]);

  // Mark messages as read when opening sidebar
  useEffect(() => {
    if (selectedUser) {
      const newRead = new Set(readMessages);
      messages.forEach(msg => {
        // Mark as read if this is a DM from the selected user to me (using visitorId)
        if (msg.encrypted && msg.encryptedFor === myVisitorId && msg.senderId === selectedUser.visitorId) {
          newRead.add(msg.id);
        }
      });
      setReadMessages(newRead);
    }
  }, [selectedUser, messages, myVisitorId]);

  const handleSend = useCallback((text: string) => {
    sendMessage(text, false);
  }, [sendMessage]);

  const handleUserClick = useCallback((user: OnlineUser) => {
    if (user.visitorId !== myVisitorId) {
      setSelectedUser(user);
      setShowChats(false);
    }
  }, [myVisitorId]);

  const handleDMSend = useCallback((text: string) => {
    if (selectedUser) {
      // Use visitorId for stable DM addressing
      sendMessage(text, true, selectedUser.visitorId);
    }
  }, [sendMessage, selectedUser]);

  const handleNotificationOpen = useCallback(() => {
    if (notification?.sender) {
      setSelectedUser(notification.sender);
    }
    setNotification(null);
  }, [notification]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <Globe
        messages={messages}
        users={users}
        myId={myVisitorId}
        onUserClick={handleUserClick}
        typingUsers={typingUsers}
        newReaction={newReaction}
      />

      {notification && (
        <DMNotification
          message={notification.message}
          sender={notification.sender}
          onOpen={handleNotificationOpen}
          onDismiss={() => setNotification(null)}
        />
      )}

      <div className="ui-overlay">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 p-3 sm:p-4 flex justify-between items-start safe-area-top z-30">
          <div className="flex flex-col">
            <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-wider" style={{ fontFamily: 'Impact, sans-serif' }}>
              WORLD<span className="text-[#FFD700]">TALK</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-white/50 uppercase tracking-widest hidden sm:block">
              Watch the world speak
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LiveStats stats={stats} connected={connected} />
            <a
              href="https://github.com/siinghd/worldtalk"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-black/50 backdrop-blur-sm border border-white/20 hover:border-[#FFD700] hover:bg-black/70 transition-all"
              title="View on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-white hover:fill-[#FFD700] transition-colors"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Mobile Bottom Bar */}
        {!selectedUser && (
          <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-black border-t border-[#FFD700]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex">
              <button
                onClick={() => setShowChats(true)}
                className="flex-1 py-2 flex items-center justify-center gap-2 text-white active:bg-white/10 relative"
              >
                <span className="text-lg">💬</span>
                <span className="text-xs font-medium">Chats</span>
                {totalUnread > 0 && (
                  <span className="absolute top-1 right-1/4 bg-[#FFD700] text-black text-[10px] w-4 h-4 rounded-full font-bold flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
              </button>
              <div className="w-px bg-[#FFD700]/30" />
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                className="flex-1 py-2 flex items-center justify-center gap-2 text-white active:bg-white/10"
              >
                <span className="text-lg">🏆</span>
                <span className="text-xs font-medium">Top 10</span>
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <Leaderboard
          entries={leaderboard}
          isOpen={showLeaderboard}
          onToggle={() => setShowLeaderboard(!showLeaderboard)}
          isMobile={isMobile}
        />

        {/* Desktop Conversations List */}
        <ConversationsList
          conversations={conversations}
          users={users}
          onSelect={handleUserClick}
          selectedUserId={selectedUser?.visitorId}
        />

        {/* Mobile Conversations List */}
        {showChats && (
          <ConversationsList
            conversations={conversations}
            users={users}
            onSelect={handleUserClick}
            selectedUserId={selectedUser?.visitorId}
            onClose={() => setShowChats(false)}
            isMobile
          />
        )}

        {/* DM Sidebar */}
        {selectedUser && (
          <DMSidebar
            user={selectedUser}
            messages={messages}
            myId={myVisitorId}
            onClose={() => setSelectedUser(null)}
            onSend={handleDMSend}
          />
        )}

        {/* Chat Input - Show on both mobile and desktop */}
        {!selectedUser && (
          <div className="fixed left-0 right-0 lg:left-[260px] p-2 sm:p-4 z-30" style={{ bottom: isMobile ? 'calc(44px + env(safe-area-inset-bottom, 0px))' : '0' }}>
            <div className="max-w-2xl mx-auto">
              <ChatInput onSend={handleSend} onTyping={sendTyping} disabled={!connected} maxLength={280} />
            </div>
          </div>
        )}

        {/* Desktop: Location + Users count */}
        {!selectedUser && (
          <>
            {location && (
              <div className="fixed bottom-24 left-[276px] bg-black/80 border border-[#FFD700]/30 px-2 py-1 rounded text-[10px] hidden lg:block">
                <span className="text-[#FFD700]">YOU: </span>
                <span className="text-white/70">{location.lat.toFixed(1)}°, {location.lng.toFixed(1)}°</span>
              </div>
            )}
            <div className="fixed bottom-24 right-4 bg-black/80 border border-[#FFD700]/30 px-2 py-1 rounded text-[10px] hidden lg:block">
              <span className="text-[#FFD700] font-bold">{users.length}</span>
              <span className="text-white/50 ml-1">online</span>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
        .safe-area-top { padding-top: max(0.75rem, env(safe-area-inset-top)); }
        .safe-area-bottom { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }
        @media (max-width: 640px) {
          .maplibregl-ctrl-top-right { top: 60px !important; right: 8px !important; }
          .maplibregl-ctrl-group { transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}

export default App;
