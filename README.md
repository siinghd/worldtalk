# World Talk

Real-time global chat where messages appear as bubbles on a 3D globe from users' actual locations. Features a manga/anime-inspired aesthetic with a yellow, white, and black color scheme.

## Features

- **3D Interactive Globe** - Messages appear at users' real locations on a beautiful MapLibre globe
- **Real-time Messaging** - WebSocket-powered instant message delivery
- **Private DMs** - Click on any user to start an encrypted private conversation
- **Typing Indicators** - See when others are typing with animated indicators
- **Message Reactions** - React to messages with emojis that float up from the globe
- **City Leaderboard** - Track which cities are most active
- **Live Stats** - See online users, messages per minute, and total visitors
- **Sound Effects** - Audio feedback for messages, DMs, and reactions
- **Ephemeral Messages** - Messages fade after 30 seconds (no server storage)
- **Multi-instance Ready** - Redis Pub/Sub for horizontal scaling

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Bun + Hono (WebSocket server)
- **3D Globe**: MapLibre GL JS with globe projection
- **Real-time**: WebSocket + Redis Pub/Sub
- **GeoIP**: MaxMind GeoLite2 for location detection
- **Fingerprinting**: FingerprintJS for stable user identification

## Quick Start

```bash
# Install dependencies
bun install

# Development (frontend only)
bun run dev

# Run server (requires Redis and GeoLite2 database)
REDIS_URL=redis://localhost:6379 bun run server/index.ts

# Build for production
bun run build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3030) |
| `REDIS_URL` | Redis connection URL (required) |

## GeoIP Setup

Download the GeoLite2-City database from MaxMind and place it in the `server/` directory:

```bash
# Sign up at https://www.maxmind.com/en/geolite2/signup
# Download GeoLite2-City.mmdb and place in server/
```

## Production Deployment

The app supports multi-instance deployment with PM2:

```bash
# Create ecosystem.config.cjs with your settings
# Start multiple instances
pm2 start ecosystem.config.cjs

# Configure nginx for load balancing (see nginx.conf.example)
```

## Architecture

```
                    Nginx (Load Balancer)
                           |
         +-----------------+-----------------+
         |                 |                 |
    Instance 1        Instance 2        Instance 3
    (port 3030)       (port 3031)       (port 3032)
         |                 |                 |
         +-----------------+-----------------+
                           |
                    Redis Pub/Sub
              (message sync across instances)
```

## License

MIT
