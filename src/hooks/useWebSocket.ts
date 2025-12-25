import { useState, useEffect, useRef, useCallback } from 'react';
import type { OnlineUser } from '../components/Globe';

export interface ChatMessage {
  id: string;
  text: string;
  lat: number;
  lng: number;
  timestamp: number;
  encrypted: boolean;
  encryptedFor?: string;
  senderId: string; // sender's user ID
  senderFingerprint: string;
  reactions?: { [emoji: string]: number };
}

export interface Reaction {
  messageId: string;
  emoji: string;
  lat: number;
  lng: number;
}

export interface TypingUser {
  id: string;
  lat: number;
  lng: number;
  expiresAt: number;
}

export interface Stats {
  usersOnline: number;
  messagesThisMinute: number;
  allTimeUsers: number;
}

export interface Location {
  lat: number;
  lng: number;
}

export interface LeaderboardEntry {
  city: string;
  country: string;
  messageCount: number;
}

export function useWebSocket(visitorId: string | null) {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<Stats>({ usersOnline: 0, messagesThisMinute: 0, allTimeUsers: 0 });
  const [location, setLocation] = useState<Location | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [myVisitorId, setMyVisitorId] = useState<string | null>(null); // Stable fingerprint
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [newReaction, setNewReaction] = useState<Reaction | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const visitorIdRef = useRef(visitorId);
  const typingTimeoutRef = useRef<number | null>(null);

  const getWsUrl = useCallback(() => {
    const isDev = window.location.hostname === 'localhost';
    if (isDev) {
      return 'ws://localhost:3030/ws';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        setConnected(true);

        // Send fingerprint to server for unique identification
        if (visitorIdRef.current) {
          ws.send(JSON.stringify({
            type: 'identify',
            visitorId: visitorIdRef.current
          }));
          // Update local visitorId to match what server uses (first 12 chars)
          setMyVisitorId(visitorIdRef.current.slice(0, 12));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'welcome':
              setClientId(data.payload.clientId);
              // Only set visitorId from welcome if we don't have a FingerprintJS ID
              // (onopen already set it from visitorIdRef if available)
              if (!visitorIdRef.current) {
                setMyVisitorId(data.payload.visitorId);
              }
              setStats(data.payload.stats);
              if (data.payload.location) {
                setLocation(data.payload.location);
              }
              break;

            case 'message':
              setMessages(prev => [...prev.slice(-99), data.payload]);
              break;

            case 'stats':
              setStats(data.payload);
              break;

            case 'users':
              setUsers(data.payload);
              break;

            case 'leaderboard':
              setLeaderboard(data.payload);
              break;

            case 'typing':
              // Someone is typing - add to typing users
              setTypingUsers(prev => {
                const filtered = prev.filter(u => u.id !== data.payload.id);
                return [...filtered, {
                  id: data.payload.id,
                  lat: data.payload.lat,
                  lng: data.payload.lng,
                  expiresAt: Date.now() + 3000
                }];
              });
              break;

            case 'reaction':
              // Someone reacted to a message
              setNewReaction({
                messageId: data.payload.messageId,
                emoji: data.payload.emoji,
                lat: data.payload.lat,
                lng: data.payload.lng
              });
              // Update message reactions count
              setMessages(prev => prev.map(msg => {
                if (msg.id === data.payload.messageId) {
                  const reactions = { ...(msg.reactions || {}) };
                  reactions[data.payload.emoji] = (reactions[data.payload.emoji] || 0) + 1;
                  return { ...msg, reactions };
                }
                return msg;
              }));
              // Clear reaction after animation
              setTimeout(() => setNewReaction(null), 1000);
              break;

            case 'pong':
              break;
          }
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onclose = () => {
        isConnectingRef.current = false;
        setConnected(false);
        wsRef.current = null;

        // Only reconnect if we're not already trying
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        isConnectingRef.current = false;
      };
    } catch (e) {
      console.error('[WS] Connection error:', e);
      isConnectingRef.current = false;
    }
  }, [getWsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const sendMessage = useCallback((text: string, encrypted = false, encryptedFor?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'message',
      text,
      encrypted,
      encryptedFor
    }));
  }, []);

  const updateLocation = useCallback((lat: number, lng: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'update_location',
      lat,
      lng
    }));
  }, []);

  const sendTyping = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Debounce typing events
    if (typingTimeoutRef.current) return;

    wsRef.current.send(JSON.stringify({ type: 'typing' }));

    typingTimeoutRef.current = window.setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, []);

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'reaction',
      messageId,
      emoji
    }));
  }, []);

  // Cleanup expired typing users
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => prev.filter(u => u.expiresAt > now));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Connect when visitorId is available
  useEffect(() => {
    if (!visitorId) return;
    // Update ref synchronously before connecting
    visitorIdRef.current = visitorId;
    connect();
    return () => disconnect();
  }, [visitorId]); // Connect when visitorId becomes available

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Location comes from server via GeoLite2 (IP-based, ~100km accuracy)

  return {
    connected,
    stats,
    location,
    clientId,
    myVisitorId, // Stable fingerprint for matching
    users,
    messages,
    leaderboard,
    typingUsers,
    newReaction,
    sendMessage,
    updateLocation,
    sendTyping,
    sendReaction
  };
}
