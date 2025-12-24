import { createClient } from 'redis';

// Redis URL must be provided via environment variable
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

// Redis keys
const STATS_KEY = 'worldtalk:stats';
const ALL_TIME_USERS_KEY = 'worldtalk:allTimeUsers'; // Separate key that never expires
const MESSAGES_MINUTE_KEY = 'worldtalk:messagesMinute'; // Separate key with TTL
const USERS_KEY = 'worldtalk:users';
const LEADERBOARD_KEY = 'worldtalk:leaderboard';
const MESSAGE_CHANNEL = 'worldtalk:messages';
const STATS_CHANNEL = 'worldtalk:stats_update';
const USERS_CHANNEL = 'worldtalk:users_update';
const LEADERBOARD_CHANNEL = 'worldtalk:leaderboard_update';

// User type for Redis storage
export interface RedisUser {
  id: string;
  visitorId: string; // Stable fingerprint for identification
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  instanceId: string;
}

// Create Redis clients
export const pubClient = createClient({
  url: REDIS_URL,
  socket: { tls: true, rejectUnauthorized: false }
});

export const subClient = pubClient.duplicate();

// Connect to Redis
export async function connectRedis() {
  await pubClient.connect();
  await subClient.connect();

  // Clean up old hash-based user storage (migrating to individual keys with TTL)
  await pubClient.del(`${USERS_KEY}:list`);
  await pubClient.del(`${USERS_KEY}:online`);

  console.log('[Redis] Connected to Redis');
}

// Stats management
export async function incrementAllTimeUsers(fingerprint: string): Promise<boolean> {
  // Check if user already counted
  const exists = await pubClient.sIsMember(`${USERS_KEY}:seen`, fingerprint);
  if (!exists) {
    await pubClient.sAdd(`${USERS_KEY}:seen`, fingerprint);
    // Use separate key that never expires
    await pubClient.incr(ALL_TIME_USERS_KEY);
    return true;
  }
  return false;
}

export async function updateOnlineCount(count: number, instanceId: string) {
  await pubClient.hSet(`${USERS_KEY}:online`, instanceId, count.toString());
  await pubClient.expire(`${USERS_KEY}:online`, 60);
}

export async function getTotalOnlineCount(): Promise<number> {
  const counts = await pubClient.hGetAll(`${USERS_KEY}:online`);
  return Object.values(counts).reduce((sum, c) => sum + parseInt(c || '0'), 0);
}

export async function getStats() {
  const allTimeUsers = await pubClient.get(ALL_TIME_USERS_KEY);
  const messagesThisMinute = await pubClient.get(MESSAGES_MINUTE_KEY);
  const onlineCount = await getTotalOnlineCount();
  return {
    allTimeUsers: parseInt(allTimeUsers || '0'),
    usersOnline: onlineCount,
    messagesThisMinute: parseInt(messagesThisMinute || '0')
  };
}

export async function incrementMessages() {
  // Use separate key with TTL for messages per minute
  await pubClient.incr(MESSAGES_MINUTE_KEY);
  await pubClient.expire(MESSAGES_MINUTE_KEY, 60);
}

// Message publishing
export interface BroadcastMessage {
  id: string;
  text: string;
  lat: number;
  lng: number;
  timestamp: number;
  encrypted: boolean;
  encryptedFor?: string; // recipient user ID
  senderId: string; // sender user ID
  senderFingerprint: string;
  instanceId: string;
}

export async function publishMessage(message: BroadcastMessage) {
  await pubClient.publish(MESSAGE_CHANNEL, JSON.stringify(message));
  await incrementMessages();
}

export async function publishStatsUpdate() {
  const stats = await getStats();
  await pubClient.publish(STATS_CHANNEL, JSON.stringify(stats));
}

// Subscribe to messages
export function subscribeToMessages(callback: (message: BroadcastMessage) => void) {
  subClient.subscribe(MESSAGE_CHANNEL, (data) => {
    try {
      const message = JSON.parse(data) as BroadcastMessage;
      callback(message);
    } catch (e) {
      console.error('[Redis] Failed to parse message:', e);
    }
  });
}

export function subscribeToStats(callback: (stats: any) => void) {
  subClient.subscribe(STATS_CHANNEL, (data) => {
    try {
      callback(JSON.parse(data));
    } catch (e) {
      console.error('[Redis] Failed to parse stats:', e);
    }
  });
}

// User management via Redis - using individual keys with TTL
const USER_TTL = 30; // 30 seconds TTL per user

export async function addUser(user: RedisUser) {
  // Use individual key per user with TTL - auto-expires if not refreshed
  await pubClient.setEx(`${USERS_KEY}:user:${user.id}`, USER_TTL, JSON.stringify(user));
  await publishUsersUpdate();
}

export async function refreshUser(userId: string) {
  // Refresh the TTL without re-publishing (called periodically)
  const key = `${USERS_KEY}:user:${userId}`;
  await pubClient.expire(key, USER_TTL);
}

export async function removeUser(userId: string) {
  await pubClient.del(`${USERS_KEY}:user:${userId}`);
  await publishUsersUpdate();
}

export async function getAllUsers(): Promise<RedisUser[]> {
  // Scan for all user keys
  const keys: string[] = [];
  let cursor = 0;
  do {
    const result = await pubClient.scan(cursor, { MATCH: `${USERS_KEY}:user:*`, COUNT: 100 });
    cursor = result.cursor;
    keys.push(...result.keys);
  } while (cursor !== 0);

  if (keys.length === 0) return [];

  const values = await pubClient.mGet(keys);
  return values
    .filter((v): v is string => v !== null)
    .map(data => JSON.parse(data) as RedisUser);
}

export async function publishUsersUpdate() {
  const users = await getAllUsers();
  await pubClient.publish(USERS_CHANNEL, JSON.stringify(users));
}

export function subscribeToUsers(callback: (users: RedisUser[]) => void) {
  subClient.subscribe(USERS_CHANNEL, (data) => {
    try {
      callback(JSON.parse(data));
    } catch (e) {
      console.error('[Redis] Failed to parse users:', e);
    }
  });
}

// Leaderboard - track messages by city
export interface LeaderboardEntry {
  city: string;
  country: string;
  messageCount: number;
}

export async function incrementCityMessages(city: string, country: string) {
  const key = `${city}|${country}`;
  await pubClient.zIncrBy(LEADERBOARD_KEY, 1, key);
}

export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const results = await pubClient.zRangeWithScores(LEADERBOARD_KEY, 0, limit - 1, { REV: true });
  return results.map(({ value, score }) => {
    const [city, country] = value.split('|');
    return { city: city || 'Unknown', country: country || '', messageCount: score };
  });
}

export async function publishLeaderboardUpdate() {
  const leaderboard = await getLeaderboard();
  await pubClient.publish(LEADERBOARD_CHANNEL, JSON.stringify(leaderboard));
}

export function subscribeToLeaderboard(callback: (leaderboard: LeaderboardEntry[]) => void) {
  subClient.subscribe(LEADERBOARD_CHANNEL, (data) => {
    try {
      callback(JSON.parse(data));
    } catch (e) {
      console.error('[Redis] Failed to parse leaderboard:', e);
    }
  });
}
