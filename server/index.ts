import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import maxmind, { CityResponse, Reader } from 'maxmind';
import { join } from 'path';
import {
  connectRedis,
  publishMessage,
  subscribeToMessages,
  subscribeToStats,
  subscribeToUsers,
  subscribeToLeaderboard,
  incrementAllTimeUsers,
  updateOnlineCount,
  getStats,
  publishStatsUpdate,
  addUser,
  removeUser,
  refreshUser,
  getAllUsers,
  incrementCityMessages,
  getLeaderboard,
  publishLeaderboardUpdate,
  type BroadcastMessage,
  type RedisUser
} from './redis';

const PORT = parseInt(process.env.PORT || '3030');
const INSTANCE_ID = `worldtalk-${PORT}`;
const MAX_MESSAGE_LENGTH = 280;

// Rate limiting
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_MINUTE = 120; // 2 messages per second
const MAX_TYPING_PER_MINUTE = 120;
const rateLimits = new Map<string, { messages: number[]; typing: number[] }>();

function checkRateLimit(clientId: string, type: 'messages' | 'typing'): boolean {
  const now = Date.now();
  let limits = rateLimits.get(clientId);
  if (!limits) {
    limits = { messages: [], typing: [] };
    rateLimits.set(clientId, limits);
  }

  // Clean old entries
  limits[type] = limits[type].filter(t => now - t < RATE_LIMIT_WINDOW);

  const max = type === 'messages' ? MAX_MESSAGES_PER_MINUTE : MAX_TYPING_PER_MINUTE;
  if (limits[type].length >= max) {
    return false; // Rate limited
  }

  limits[type].push(now);
  return true;
}

// Input validation
const VALID_EMOJI_REGEX = /^[\p{Emoji}]{1,2}$/u;
const VALID_VISITOR_ID_REGEX = /^[a-zA-Z0-9]{10,32}$/;

function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim();
}

function isValidLatLng(lat: number, lng: number): boolean {
  return typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    isFinite(lat) && isFinite(lng);
}

// Throttle leaderboard updates
let lastLeaderboardUpdate = 0;
const LEADERBOARD_UPDATE_INTERVAL = 10000; // 10 seconds

async function throttledLeaderboardUpdate() {
  const now = Date.now();
  if (now - lastLeaderboardUpdate > LEADERBOARD_UPDATE_INTERVAL) {
    lastLeaderboardUpdate = now;
    await publishLeaderboardUpdate();
  }
}

// GeoLite2 database - loaded async
let geoReader: Reader<CityResponse> | null = null;
const geoDbPath = join(import.meta.dir, 'GeoLite2-City.mmdb');

async function loadGeoDatabase() {
  try {
    geoReader = await maxmind.open<CityResponse>(geoDbPath);
    console.log('[GeoIP] Database loaded successfully');
  } catch (e) {
    console.error('[GeoIP] Failed to load database:', e);
  }
}

function getLocationFromIP(ip: string): { lat: number; lng: number; city?: string; country?: string } | null {
  if (!geoReader) return null;

  try {
    // Skip private/local IPs
    if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return null;
    }

    const result = geoReader.get(ip);
    if (result?.location?.latitude && result?.location?.longitude) {
      return {
        lat: result.location.latitude,
        lng: result.location.longitude,
        city: result.city?.names?.en,
        country: result.country?.names?.en
      };
    }
  } catch (e) {
    console.error('[GeoIP] Error looking up IP:', ip, e);
  }
  return null;
}

interface GeoLocation {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}

interface Client {
  ws: any;
  id: string;
  fingerprint: string;
  visitorId?: string; // Client-provided fingerprint from FingerprintJS
  location: GeoLocation;
  publicKey?: string;
  connectedAt: number;
}

const clients = new Map<string, Client>();

// Cache of recent messages for reply lookups (30 second TTL matches bubble lifetime)
const recentMessages = new Map<string, { text: string; lat: number; lng: number; timestamp: number }>();
const MESSAGE_TTL = 35000; // 35 seconds (slightly longer than bubble fade)

function cacheMessage(id: string, text: string, lat: number, lng: number) {
  recentMessages.set(id, { text, lat, lng, timestamp: Date.now() });
}

function cleanupOldMessages() {
  const now = Date.now();
  for (const [id, msg] of recentMessages) {
    if (now - msg.timestamp > MESSAGE_TTL) {
      recentMessages.delete(id);
    }
  }
}

// Hono app for HTTP routes
const app = new Hono();
app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok', instance: INSTANCE_ID, clients: clients.size }));

app.get('/api/stats', async (c) => {
  const stats = await getStats();
  return c.json(stats);
});

// Get all online users (for globe markers) - from Redis for cross-instance
app.get('/api/users', async (c) => {
  const users = await getAllUsers();
  return c.json(users);
});

// Get leaderboard
app.get('/api/leaderboard', async (c) => {
  const leaderboard = await getLeaderboard(10);
  return c.json(leaderboard);
});

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

function broadcastToClients(message: any) {
  const data = JSON.stringify(message);
  for (const [_, client] of clients) {
    try {
      client.ws.send(data);
    } catch (e) {
      // Client disconnected
    }
  }
}

async function broadcastUserList() {
  const users = await getAllUsers();
  broadcastToClients({ type: 'users', payload: users });
}

async function start() {
  await loadGeoDatabase();
  await connectRedis();

  subscribeToMessages((message) => {
    if (message.instanceId === INSTANCE_ID) return;
    broadcastToClients({ type: 'message', payload: message });
  });

  subscribeToStats((stats) => {
    broadcastToClients({ type: 'stats', payload: stats });
  });

  // Subscribe to user updates from all instances
  subscribeToUsers((users) => {
    broadcastToClients({ type: 'users', payload: users });
  });

  // Subscribe to leaderboard updates
  subscribeToLeaderboard((leaderboard) => {
    broadcastToClients({ type: 'leaderboard', payload: leaderboard });
  });

  // Periodic stats update and user TTL refresh
  setInterval(async () => {
    await updateOnlineCount(clients.size, INSTANCE_ID);
    await publishStatsUpdate();
    cleanupOldMessages(); // Clean expired message cache

    // Refresh TTL for all connected users (keeps them alive in Redis)
    for (const [clientId] of clients) {
      await refreshUser(clientId);
    }
  }, 10000); // Every 10 seconds (TTL is 30s, so plenty of buffer)

  const server = Bun.serve({
    port: PORT,
    fetch(req, server) {
      const url = new URL(req.url);

      // Handle WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: {
            clientId: crypto.randomUUID(),
            headers: {
              cfLat: req.headers.get('cf-iplatitude'),
              cfLng: req.headers.get('cf-iplongitude'),
              cfCity: req.headers.get('cf-ipcity'),
              cfCountry: req.headers.get('cf-ipcountry'),
              ip: req.headers.get('cf-connecting-ip') ||
                  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  req.headers.get('x-real-ip') || '127.0.0.1'
            }
          }
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // Handle HTTP with Hono
      return app.fetch(req, { ip: server.requestIP(req) });
    },
    websocket: {
      open(ws) {
        const { clientId, headers } = ws.data as any;

        // Get location from GeoLite2 database
        let location: GeoLocation;
        const geoLocation = getLocationFromIP(headers.ip);

        if (geoLocation) {
          location = geoLocation;
        } else {
          // Fallback: random location for development/private IPs
          location = {
            lat: (Math.random() - 0.5) * 140,
            lng: (Math.random() - 0.5) * 360,
            city: 'Unknown',
            country: 'Unknown'
          };
        }

        const fingerprint = Math.abs(
          (headers.ip + (headers.cfCountry || '')).split('').reduce(
            (h: number, c: string) => ((h << 5) - h) + c.charCodeAt(0), 0
          )
        ).toString(36);

        clients.set(clientId, {
          ws,
          id: clientId,
          fingerprint,
          location,
          connectedAt: Date.now()
        });

        // Send welcome immediately with cached/estimated stats
        ws.send(JSON.stringify({
          type: 'welcome',
          payload: { clientId, visitorId: fingerprint, stats: { usersOnline: clients.size, messagesThisMinute: 0, allTimeUsers: 0 }, location }
        }));

        // Track and sync in background (non-blocking)
        incrementAllTimeUsers(fingerprint);
        updateOnlineCount(clients.size, INSTANCE_ID);

        // Add user to Redis for cross-instance sync
        const redisUser: RedisUser = {
          id: clientId,
          visitorId: fingerprint, // Initial fingerprint, updated when client identifies
          lat: location.lat,
          lng: location.lng,
          city: location.city,
          country: location.country,
          instanceId: INSTANCE_ID
        };
        addUser(redisUser);

        // Send updated data async
        (async () => {
          try {
            // Send real stats
            const stats = await getStats();
            ws.send(JSON.stringify({ type: 'stats', payload: stats }));

            // Send current user list from Redis
            const allUsers = await getAllUsers();
            ws.send(JSON.stringify({ type: 'users', payload: allUsers }));

            // Send current leaderboard
            const leaderboard = await getLeaderboard(10);
            ws.send(JSON.stringify({ type: 'leaderboard', payload: leaderboard }));

            publishStatsUpdate();
          } catch (e) {
            // Client might have disconnected
          }
        })();
      },

      async message(ws, message) {
        const { clientId } = ws.data as any;
        const client = clients.get(clientId);
        if (!client) return;

        try {
          const data = JSON.parse(message.toString());

          switch (data.type) {
            case 'message': {
              // Rate limit check
              if (!checkRateLimit(clientId, 'messages')) {
                ws.send(JSON.stringify({ type: 'error', message: 'Rate limited' }));
                return;
              }

              let text = (data.text || '').trim();
              if (!text || text.length > MAX_MESSAGE_LENGTH) return;

              // Sanitize text for non-encrypted messages
              const safeText = data.encrypted ? data.text : sanitizeText(text);

              const broadcastMsg: BroadcastMessage = {
                id: crypto.randomUUID(),
                text: safeText,
                lat: client.location.lat,
                lng: client.location.lng,
                timestamp: Date.now(),
                encrypted: !!data.encrypted,
                encryptedFor: data.encryptedFor, // Recipient's visitorId (fingerprint)
                senderId: client.fingerprint, // Sender's stable fingerprint
                senderFingerprint: client.fingerprint,
                instanceId: INSTANCE_ID
              };

              // Handle reply context
              if (data.replyTo && typeof data.replyTo === 'string') {
                const parentMsg = recentMessages.get(data.replyTo);
                if (parentMsg) {
                  (broadcastMsg as any).replyTo = data.replyTo;
                  (broadcastMsg as any).replyToText = parentMsg.text.slice(0, 50);
                  (broadcastMsg as any).replyToLat = parentMsg.lat;
                  (broadcastMsg as any).replyToLng = parentMsg.lng;
                }
              }

              // Cache this message for future replies
              cacheMessage(broadcastMsg.id, safeText, client.location.lat, client.location.lng);

              await publishMessage(broadcastMsg);
              broadcastToClients({ type: 'message', payload: broadcastMsg });

              // Track city in leaderboard
              if (client.location.city) {
                await incrementCityMessages(client.location.city, client.location.country || '');
                await throttledLeaderboardUpdate(); // Only broadcasts every 10 seconds
              }
              break;
            }

            case 'ping': {
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
            }

            case 'identify': {
              // Validate visitorId format
              if (data.visitorId && typeof data.visitorId === 'string' &&
                  VALID_VISITOR_ID_REGEX.test(data.visitorId)) {
                const oldFingerprint = client.fingerprint;
                client.visitorId = data.visitorId;
                // Use visitorId as the fingerprint (first 12 chars for shorter display)
                client.fingerprint = data.visitorId.slice(0, 12);

                // Re-track with new fingerprint if different
                if (oldFingerprint !== client.fingerprint) {
                  await incrementAllTimeUsers(client.fingerprint);
                }

                // Update Redis user with real visitorId
                const redisUser: RedisUser = {
                  id: clientId,
                  visitorId: client.fingerprint, // Use the stable fingerprint
                  lat: client.location.lat,
                  lng: client.location.lng,
                  city: client.location.city,
                  country: client.location.country,
                  instanceId: INSTANCE_ID
                };
                await addUser(redisUser);
              }
              break;
            }

            case 'update_location': {
              // Validate lat/lng values
              if (isValidLatLng(data.lat, data.lng)) {
                client.location.lat = data.lat;
                client.location.lng = data.lng;
                broadcastUserList();
              }
              break;
            }

            case 'typing': {
              // Rate limit typing events
              if (!checkRateLimit(clientId, 'typing')) return;

              // Broadcast typing indicator to all other clients
              broadcastToClients({
                type: 'typing',
                payload: {
                  id: client.fingerprint, // Use stable fingerprint for consistency
                  lat: client.location.lat,
                  lng: client.location.lng
                }
              });
              break;
            }

            case 'reaction': {
              // Validate emoji format
              if (data.messageId && typeof data.messageId === 'string' &&
                  data.emoji && VALID_EMOJI_REGEX.test(data.emoji)) {
                broadcastToClients({
                  type: 'reaction',
                  payload: {
                    messageId: data.messageId,
                    emoji: data.emoji,
                    lat: client.location.lat,
                    lng: client.location.lng
                  }
                });
              }
              break;
            }
          }
        } catch (e) {
          console.error('[WS] Message error:', e);
        }
      },

      close(ws) {
        const { clientId } = ws.data as any;
        if (clientId) {
          clients.delete(clientId);
          rateLimits.delete(clientId); // Cleanup rate limits
          updateOnlineCount(clients.size, INSTANCE_ID);
          publishStatsUpdate();
          // Remove user from Redis
          removeUser(clientId);
        }
      }
    }
  });

  console.log(`[Server] World Talk running on port ${PORT} (instance: ${INSTANCE_ID})`);
}

start().catch(console.error);
