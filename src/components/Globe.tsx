import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ChatMessage, TypingUser, Reaction } from '../hooks/useWebSocket';

export interface OnlineUser {
  id: string;
  visitorId: string; // Stable fingerprint for identification
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}

interface GlobeProps {
  messages: ChatMessage[];
  users: OnlineUser[];
  myId: string | null;
  onUserClick?: (user: OnlineUser) => void;
  typingUsers?: TypingUser[];
  newReaction?: Reaction | null;
}

// Helper to create straight line points between two coordinates
function createLine(start: [number, number], end: [number, number], numPoints = 30): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lng = start[0] + (end[0] - start[0]) * t;
    const lat = start[1] + (end[1] - start[1]) * t;
    points.push([lng, lat]);
  }
  return points;
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

export function Globe({ messages, users, myId, onUserClick, typingUsers = [], newReaction }: GlobeProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const messageMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; timestamp: number }>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const hasFlownToUser = useRef(false);
  const arcCounterRef = useRef(0);
  const typingMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const reactionMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Refs to avoid stale closures in event handlers
  const usersRef = useRef<OnlineUser[]>(users);
  const onUserClickRef = useRef(onUserClick);

  // Keep refs in sync
  useEffect(() => {
    usersRef.current = users;
    onUserClickRef.current = onUserClick;
  }, [users, onUserClick]);

  // Function to animate a line between two points
  const animateMessageLine = (
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number
  ) => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    const lineId = `line-${arcCounterRef.current++}`;
    const linePoints = createLine([fromLng, fromLat], [toLng, toLat], 30);

    // Add source for the line
    m.addSource(lineId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: []
        }
      }
    });

    // Add the line layer
    m.addLayer({
      id: `${lineId}-line`,
      type: 'line',
      source: lineId,
      paint: {
        'line-color': '#FFD700',
        'line-width': 2,
        'line-opacity': 0.9
      }
    });

    // Add glow effect
    m.addLayer({
      id: `${lineId}-glow`,
      type: 'line',
      source: lineId,
      paint: {
        'line-color': '#FFD700',
        'line-width': 6,
        'line-opacity': 0.4,
        'line-blur': 2
      }
    }, `${lineId}-line`);

    // Animate the line
    let currentPoint = 0;
    const animationInterval = setInterval(() => {
      currentPoint += 2;

      if (currentPoint >= linePoints.length) {
        clearInterval(animationInterval);

        // Fade out and remove after animation
        setTimeout(() => {
          if (m.getLayer(`${lineId}-line`)) m.removeLayer(`${lineId}-line`);
          if (m.getLayer(`${lineId}-glow`)) m.removeLayer(`${lineId}-glow`);
          if (m.getSource(lineId)) m.removeSource(lineId);
        }, 1500);

        return;
      }

      const source = m.getSource(lineId) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: linePoints.slice(0, currentPoint)
          }
        });
      }
    }, 20);
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: 'WorldTalk Globe',
        sources: {
          'carto-tiles': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'
            ],
            tileSize: 256,
            attribution: '© CARTO © OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'carto-layer',
            type: 'raster',
            source: 'carto-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
      },
      center: [0, 20],
      zoom: 1.5,
      maxPitch: 85
    } as maplibregl.MapOptions);

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Enable globe projection after style is loaded
      (map.current as any).setProjection({ type: 'globe' });

      // Add atmosphere/sky effect - golden glow around globe
      map.current.setSky({
        'sky-color': '#0a0a15',
        'horizon-color': '#FFD700',
        'fog-color': '#0a0a15',
        'fog-ground-blend': 0.8,
        'horizon-fog-blend': 0.3
      });

      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update user markers using GeoJSON layers (works better with globe projection)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    // Create GeoJSON data for users
    const userFeatures = users.map(user => ({
      type: 'Feature' as const,
      properties: {
        id: user.visitorId, // Use visitorId for stable identification
        isMe: user.visitorId === myId,
        nickname: getNickname(user.visitorId),
        city: user.city || 'Unknown',
        country: user.country || ''
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [user.lng, user.lat]
      }
    }));

    const geojsonData = {
      type: 'FeatureCollection' as const,
      features: userFeatures
    };


    // Add or update the source
    const source = m.getSource('users') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData);
    } else {
      m.addSource('users', {
        type: 'geojson',
        data: geojsonData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Cluster glow (add first, behind main circle)
      m.addLayer({
        id: 'users-clusters-glow',
        type: 'circle',
        source: 'users',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 32, 5, 42, 10, 52],
          'circle-color': '#FFD700',
          'circle-opacity': 0.4,
          'circle-blur': 0.8
        }
      });

      // Cluster circles - show count
      m.addLayer({
        id: 'users-clusters',
        type: 'circle',
        source: 'users',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 10, 30],
          'circle-color': '#000000',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFD700'
        }
      });

      // Cluster count text with "users" label
      m.addLayer({
        id: 'users-cluster-count',
        type: 'symbol',
        source: 'users',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['concat', ['get', 'point_count_abbreviated'], '\n👥'],
          'text-size': 12,
          'text-line-height': 1.1,
          'text-anchor': 'center',
          'text-justify': 'center'
        },
        paint: {
          'text-color': '#FFD700',
          'text-halo-color': '#000000',
          'text-halo-width': 1
        }
      });

      // Add glow layer for individual users (larger, transparent)
      m.addLayer({
        id: 'users-glow',
        type: 'circle',
        source: 'users',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 30,
          'circle-color': ['case',
            ['any', ['==', ['get', 'isMe'], true], ['==', ['get', 'isMe'], 'true']],
            '#00ff00',
            '#FFD700'
          ],
          'circle-opacity': 0.4,
          'circle-blur': 1
        }
      });

      // Add main dot layer for individual users
      m.addLayer({
        id: 'users-dots',
        type: 'circle',
        source: 'users',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 12,
          'circle-color': ['case',
            ['any', ['==', ['get', 'isMe'], true], ['==', ['get', 'isMe'], 'true']],
            '#00ff00',
            '#FFD700'
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#000000'
        }
      });

      // Click on clusters to zoom in
      m.on('click', 'users-clusters', async (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['users-clusters'] });
        if (!features.length) return;

        const clusterId = features[0].properties?.cluster_id;
        const source = m.getSource('users') as maplibregl.GeoJSONSource;

        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          const coords = (features[0].geometry as any).coordinates;
          m.easeTo({
            center: coords,
            zoom: zoom
          });
        } catch (err) {
          console.error('[Globe] Error getting cluster zoom:', err);
        }
      });


      // Add click handler for other users (use refs to avoid stale closures)
      m.on('click', 'users-dots', (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          // GeoJSON properties are serialized, so isMe becomes string
          const isMe = props.isMe === true || props.isMe === 'true';
          if (!isMe && onUserClickRef.current) {
            const user = usersRef.current.find(u => u.visitorId === props.id);
            if (user) onUserClickRef.current(user);
          }
        }
      });

      // Show popup on hover
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'user-popup'
      });

      m.on('mouseenter', 'users-dots', (e) => {
        if (e.features && e.features[0]) {
          const coords = (e.features[0].geometry as any).coordinates.slice();
          const props = e.features[0].properties;
          const isMe = props.isMe === true || props.isMe === 'true';

          popup.setLngLat(coords)
            .setHTML(`
              <strong>${props.nickname}</strong><br/>
              <span>${props.city}${props.country ? ', ' + props.country : ''}</span><br/>
              <em>${isMe ? 'You are here' : 'Click to chat'}</em>
            `)
            .addTo(m);
        }
        m.getCanvas().style.cursor = 'pointer';
      });

      m.on('mouseleave', 'users-dots', () => {
        popup.remove();
        m.getCanvas().style.cursor = '';
      });

      // Cursor change for clusters
      m.on('mouseenter', 'users-clusters', () => {
        m.getCanvas().style.cursor = 'pointer';
      });

      m.on('mouseleave', 'users-clusters', () => {
        m.getCanvas().style.cursor = '';
      });
    }

    // Fly to user's location on first load
    const myUser = users.find(u => u.visitorId === myId);
    if (myUser && !hasFlownToUser.current) {
      hasFlownToUser.current = true;
      m.flyTo({
        center: [myUser.lng, myUser.lat],
        zoom: 3,
        duration: 2000
      });
    }
  }, [users, myId, mapLoaded, onUserClick]);

  // Handle messages
  useEffect(() => {
    if (!map.current || !mapLoaded || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];

    // Check if already displayed
    if (messageMarkersRef.current.has(latestMessage.id)) return;

    // Find my location from users array (myId is now visitorId/fingerprint)
    const myUser = users.find(u => u.visitorId === myId);

    // For encrypted (direct) messages, check if I'm the sender or recipient
    if (latestMessage.encrypted && latestMessage.encryptedFor) {
      const isRecipient = latestMessage.encryptedFor === myId;
      const isSender = latestMessage.senderId === myId;

      // Skip if this DM is not for me and not from me
      if (!isRecipient && !isSender) {
        return;
      }

      // Animate arc for DMs
      if (isRecipient && myUser) {
        // Message coming to me
        animateMessageLine(
          latestMessage.lng,
          latestMessage.lat,
          myUser.lng,
          myUser.lat
        );
      } else if (isSender) {
        // I sent this DM - animate to recipient
        const recipient = users.find(u => u.visitorId === latestMessage.encryptedFor);
        if (recipient && myUser) {
          animateMessageLine(
            myUser.lng,
            myUser.lat,
            recipient.lng,
            recipient.lat
          );
        }
      }

      // Create DM bubble (show as private message)
      const el = document.createElement('div');
      el.className = 'message-bubble dm-bubble';
      const indicator = document.createElement('span');
      indicator.className = 'dm-indicator';
      indicator.textContent = '🔒 PRIVATE';
      const textSpan = document.createElement('span');
      textSpan.textContent = latestMessage.text; // Safe: textContent escapes HTML
      el.appendChild(indicator);
      el.appendChild(textSpan);

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([latestMessage.lng, latestMessage.lat])
        .addTo(map.current!);

      messageMarkersRef.current.set(latestMessage.id, {
        marker,
        timestamp: Date.now()
      });

      // DMs fade faster
      setTimeout(() => el.classList.add('fade-out'), 15000);
      setTimeout(() => {
        marker.remove();
        messageMarkersRef.current.delete(latestMessage.id);
      }, 20000);

      return;
    }

    // For broadcast messages, animate arc from sender to me
    if (myUser && (latestMessage.lat !== myUser.lat || latestMessage.lng !== myUser.lng)) {
      animateMessageLine(
        latestMessage.lng,
        latestMessage.lat,
        myUser.lng,
        myUser.lat
      );
    }

    // Create broadcast message bubble
    const el = document.createElement('div');
    el.className = 'message-bubble';
    const textSpan = document.createElement('span');
    textSpan.textContent = latestMessage.text; // Safe: textContent escapes HTML
    el.appendChild(textSpan);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([latestMessage.lng, latestMessage.lat])
      .addTo(map.current);

    messageMarkersRef.current.set(latestMessage.id, {
      marker,
      timestamp: Date.now()
    });

    // Fade out and remove after 30 seconds
    setTimeout(() => {
      el.classList.add('fade-out');
    }, 25000);

    setTimeout(() => {
      marker.remove();
      messageMarkersRef.current.delete(latestMessage.id);
    }, 30000);

  }, [messages, mapLoaded, users, myId]);

  // Cleanup old messages periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      messageMarkersRef.current.forEach(({ marker, timestamp }, id) => {
        if (now - timestamp > 30000) {
          marker.remove();
          messageMarkersRef.current.delete(id);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Render typing indicators
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove markers for users who stopped typing
    typingMarkersRef.current.forEach((marker, id) => {
      if (!typingUsers.find(u => u.id === id)) {
        marker.remove();
        typingMarkersRef.current.delete(id);
      }
    });

    // Add/update markers for typing users
    typingUsers.forEach(user => {
      // Don't show typing indicator for myself
      if (user.id === myId) return;

      if (!typingMarkersRef.current.has(user.id)) {
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = `
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([user.lng, user.lat])
          .addTo(map.current!);

        typingMarkersRef.current.set(user.id, marker);
      }
    });
  }, [typingUsers, mapLoaded, myId]);

  // Render reaction animations
  useEffect(() => {
    if (!map.current || !mapLoaded || !newReaction) return;

    // Remove previous reaction marker
    if (reactionMarkerRef.current) {
      reactionMarkerRef.current.remove();
      reactionMarkerRef.current = null;
    }

    // Create animated emoji marker
    const el = document.createElement('div');
    el.className = 'reaction-animation';
    el.innerHTML = `<span class="reaction-emoji">${newReaction.emoji}</span>`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([newReaction.lng, newReaction.lat])
      .addTo(map.current);

    reactionMarkerRef.current = marker;

    // Remove after animation
    setTimeout(() => {
      marker.remove();
      if (reactionMarkerRef.current === marker) {
        reactionMarkerRef.current = null;
      }
    }, 1500);
  }, [newReaction, mapLoaded]);

  return (
    <div id="globe-container">
      {/* Background layer */}
      <div className="globe-bg" />
      {/* Glow effect layer */}
      <div className="globe-glow" />
      {/* Map */}
      <div ref={mapContainer} className="globe-map" />
      <style>{`
        #globe-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 0;
          overflow: hidden;
        }

        .globe-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(ellipse at center, #0d1033 0%, #050510 40%, #000000 100%);
          z-index: 0;
          overflow: hidden;
        }

        .globe-bg::before,
        .globe-bg::after {
          content: '';
          position: absolute;
          width: 200%;
          height: 200%;
          top: -50%;
          left: -50%;
        }

        .globe-bg::before {
          background-image:
            radial-gradient(2px 2px at 20px 30px, #fff 100%, transparent),
            radial-gradient(2px 2px at 60px 100px, #fff 100%, transparent),
            radial-gradient(1px 1px at 100px 50px, #fff 100%, transparent),
            radial-gradient(2px 2px at 150px 180px, #fff 100%, transparent),
            radial-gradient(1px 1px at 200px 90px, #fff 100%, transparent),
            radial-gradient(2px 2px at 280px 220px, #fff 100%, transparent),
            radial-gradient(1px 1px at 320px 40px, #fff 100%, transparent),
            radial-gradient(2px 2px at 380px 150px, #fff 100%, transparent),
            radial-gradient(1px 1px at 450px 200px, #fff 100%, transparent),
            radial-gradient(2px 2px at 500px 80px, #fff 100%, transparent),
            radial-gradient(1px 1px at 50px 250px, #fff 100%, transparent),
            radial-gradient(2px 2px at 120px 320px, #fff 100%, transparent),
            radial-gradient(1px 1px at 180px 280px, #fff 100%, transparent),
            radial-gradient(2px 2px at 250px 350px, #fff 100%, transparent),
            radial-gradient(1px 1px at 300px 300px, #fff 100%, transparent),
            radial-gradient(2px 2px at 400px 280px, #fff 100%, transparent),
            radial-gradient(1px 1px at 480px 340px, #fff 100%, transparent),
            radial-gradient(2px 2px at 520px 250px, #fff 100%, transparent);
          background-size: 550px 400px;
          animation: stars-move 100s linear infinite;
          opacity: 0.8;
        }

        .globe-bg::after {
          background-image:
            radial-gradient(1px 1px at 40px 60px, rgba(255,215,0,0.8) 100%, transparent),
            radial-gradient(1px 1px at 120px 140px, rgba(255,215,0,0.6) 100%, transparent),
            radial-gradient(2px 2px at 200px 80px, rgba(255,215,0,0.9) 100%, transparent),
            radial-gradient(1px 1px at 300px 200px, rgba(255,215,0,0.7) 100%, transparent),
            radial-gradient(2px 2px at 400px 120px, rgba(255,215,0,0.8) 100%, transparent),
            radial-gradient(1px 1px at 480px 300px, rgba(255,215,0,0.6) 100%, transparent);
          background-size: 600px 350px;
          animation: stars-move 150s linear infinite reverse;
          opacity: 0.6;
        }

        @keyframes stars-move {
          from { transform: translateY(0) translateX(0); }
          to { transform: translateY(-50%) translateX(-25%); }
        }

        .globe-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120vmin;
          height: 120vmin;
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(255, 215, 0, 0.15) 0%,
            rgba(255, 215, 0, 0.08) 30%,
            rgba(255, 215, 0, 0.03) 50%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 1;
        }

        .globe-map {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 2;
        }

        .maplibregl-canvas {
          outline: none;
        }

        .maplibregl-map {
          background: transparent !important;
        }

        .maplibregl-canvas-container {
          background: transparent !important;
        }

        .maplibregl-ctrl-attrib {
          display: none;
        }

        .maplibregl-ctrl-top-right {
          top: 80px !important;
        }

        .maplibregl-marker {
          z-index: 10 !important;
        }

        .maplibregl-popup-content {
          background: #000 !important;
          border: 2px solid #FFD700 !important;
          border-radius: 8px !important;
          padding: 10px 14px !important;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3) !important;
        }

        .maplibregl-popup-content strong {
          color: #FFD700;
          font-family: Impact, sans-serif;
          font-size: 14px;
        }

        .maplibregl-popup-content span {
          color: #fff;
          font-size: 12px;
        }

        .maplibregl-popup-content em {
          color: #888;
          font-size: 10px;
        }

        .maplibregl-popup-tip {
          border-top-color: #FFD700 !important;
        }

        .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
          border-top-color: #FFD700 !important;
        }

        .user-marker {
          position: relative;
        }

        .marker-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid #000;
          position: relative;
        }

        .marker-me {
          background: #00ff00;
          box-shadow: 0 0 10px #00ff00;
        }

        .marker-other {
          background: #FFD700;
          box-shadow: 0 0 10px #FFD700;
        }

        .marker-pulse {
          position: absolute;
          top: -4px;
          left: -4px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid currentColor;
          animation: pulse 2s infinite;
        }

        .marker-me .marker-pulse {
          border-color: #00ff00;
        }

        .marker-other .marker-pulse {
          border-color: #FFD700;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }

        .marker-tooltip {
          display: none;
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: #000;
          border: 2px solid #FFD700;
          padding: 8px 12px;
          border-radius: 8px;
          white-space: nowrap;
          margin-bottom: 8px;
          z-index: 100;
        }

        .marker-tooltip strong {
          color: #FFD700;
          display: block;
          font-family: Impact, sans-serif;
          font-size: 14px;
        }

        .marker-tooltip span {
          color: #fff;
          font-size: 12px;
        }

        .marker-tooltip em {
          color: #888;
          font-size: 10px;
          display: block;
          margin-top: 4px;
        }

        .user-marker:hover .marker-tooltip {
          display: block;
        }

        .message-bubble {
          background: #FFD700;
          color: #000;
          padding: 8px 16px;
          border-radius: 20px;
          border: 3px solid #000;
          font-family: Impact, sans-serif;
          font-size: 14px;
          text-transform: uppercase;
          max-width: 200px;
          box-shadow: 4px 4px 0 #000;
          animation: pop-in 0.3s ease-out;
          transition: opacity 0.5s ease-out;
        }

        .message-bubble.fade-out {
          opacity: 0;
        }

        .message-bubble.dm-bubble {
          background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
          border-color: #fff;
          color: #fff;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dm-indicator {
          font-size: 10px;
          opacity: 0.8;
          display: block;
        }

        .message-bubble .encrypted {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        @keyframes pop-in {
          0% { transform: scale(0); }
          80% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        /* Typing indicator styles */
        .typing-indicator {
          background: rgba(0, 0, 0, 0.8);
          border: 2px solid #FFD700;
          border-radius: 20px;
          padding: 6px 12px;
          animation: typing-pulse 1.5s ease-in-out infinite;
        }

        .typing-dots {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .typing-dots span {
          width: 6px;
          height: 6px;
          background: #FFD700;
          border-radius: 50%;
          animation: typing-bounce 1.4s ease-in-out infinite;
        }

        .typing-dots span:nth-child(1) { animation-delay: 0s; }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }

        @keyframes typing-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        /* Reaction animation styles */
        .reaction-animation {
          pointer-events: none;
          animation: reaction-float 1.5s ease-out forwards;
        }

        .reaction-emoji {
          font-size: 32px;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
          animation: reaction-pop 0.3s ease-out;
        }

        @keyframes reaction-float {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-60px) scale(1.5);
          }
        }

        @keyframes reaction-pop {
          0% { transform: scale(0); }
          70% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default Globe;
