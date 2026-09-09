import express from "express";
import http from "http";
import path from "path";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API to return local network IP for TV QR codes and physical phone controllers
app.get("/api/host-info", (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList) {
        // Skip over internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }

  res.json({
    port: PORT,
    localIps: addresses,
    recommendedIp: addresses[0] || "localhost",
  });
});

import { MAX_PLAYERS } from "./src/types.ts";

interface PlayerSession {
  id: string; // unique playerId (Identity)
  slot: number; // visual index / spawn index (1..MAX_PLAYERS)
  name: string;
  team: string; // 'RED' | 'BLUE' | 'GREEN'
  ready: boolean;
  ws: WebSocket | null;
  lastPing: number;
  connected: boolean;
  disconnectTimer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  tvWs: WebSocket | null;
  players: Map<string, PlayerSession>; // Keyed by playerId
  matchState: "LOBBY" | "COUNTDOWN" | "PLAYING" | "ENDED";
  createdAt: number;
}

const rooms = new Map<string, Room>();

// Helper to broadcast compact roster snapshot to all participants in a room
function broadcastRoster(room: Room) {
  const roster = Array.from(room.players.values()).map((p) => ({
    slot: p.slot,
    id: p.id,
    name: p.name,
    team: p.team,
    ready: p.ready,
    connected: p.connected,
  }));

  const rosterMsg = JSON.stringify({
    type: "room:roster",
    players: roster,
    matchState: room.matchState,
  });

  // Send to TV
  if (room.tvWs && room.tvWs.readyState === WebSocket.OPEN) {
    try {
      room.tvWs.send(rosterMsg);
    } catch {
      // ignore
    }
  }

  // Send to all connected phones
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      try {
        p.ws.send(rosterMsg);
      } catch {
        // ignore
      }
    }
  }
}

// Clean up stale rooms periodically (older than 6 hours)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 6 * 3600 * 1000 && (!room.tvWs || room.players.size === 0)) {
      rooms.delete(code);
    }
  }
}, 60000);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    timestamp: Date.now(),
  });
});

app.get("/api/room/:code", (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const occupiedSlots = Array.from(room.players.values()).map((p) => ({
    slot: p.slot,
    id: p.id,
    name: p.name,
    team: p.team,
    ready: p.ready,
    connected: p.connected,
  }));

  res.json({
    code: room.code,
    active: !!room.tvWs,
    playerCount: room.players.size,
    matchState: room.matchState,
    players: occupiedSlots,
  });
});

// WebSocket Handling
const wss = new WebSocketServer({ server, path: "/ws" });

function generateRoomCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

wss.on("connection", (ws: WebSocket) => {
  let boundRoomCode: string | null = null;
  let boundRole: "tv" | "phone" | null = null;
  let boundPlayerId: string | null = null;

  const safeSend = (targetWs: WebSocket | null | undefined, data: any) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      try {
        targetWs.send(JSON.stringify(data));
      } catch (err) {
        console.error("WS send error:", err);
      }
    }
  };

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const type = msg.type;

      // TV: Create or Claim Room
      if (type === "tv:create_room") {
        let code = (msg.code || generateRoomCode()).toUpperCase().trim();
        while (rooms.has(code) && rooms.get(code)?.tvWs && rooms.get(code)?.tvWs !== ws) {
          code = generateRoomCode();
        }

        let room = rooms.get(code);
        if (!room) {
          room = {
            code,
            tvWs: ws,
            players: new Map(),
            matchState: "LOBBY",
            createdAt: Date.now(),
          };
          rooms.set(code, room);
        } else {
          room.tvWs = ws;
        }

        boundRoomCode = code;
        boundRole = "tv";

        safeSend(ws, {
          type: "tv:room_created",
          code,
          players: Array.from(room.players.values()).map((p) => ({
            slot: p.slot,
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready,
            connected: p.connected,
          })),
        });
        return;
      }

      // Phone: Join Room
      if (type === "phone:join_room") {
        const code = (msg.code || "").toUpperCase().trim();
        const room = rooms.get(code);

        if (!room || !room.tvWs || room.tvWs.readyState !== WebSocket.OPEN) {
          safeSend(ws, {
            type: "join:error",
            code: "ROOM_NOT_FOUND",
            message: "الغرفة غير موجودة أو شاشة التلفاز غير متصلة. يرجى التأكد من الرمز.",
          });
          return;
        }

        const incomingId = msg.playerId ? String(msg.playerId).trim() : null;

        // Check if reconnecting existing player identity
        let session: PlayerSession | undefined;
        if (incomingId && room.players.has(incomingId)) {
          session = room.players.get(incomingId);
        }

        const isReconnect = !!session;

        if (isReconnect && session) {
          // Reconnection Scenario: Duplicate protection & session reclamation
          if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            session.disconnectTimer = undefined;
          }
          // If previous websocket is still alive, close it to enforce single connection per playerId
          if (session.ws && session.ws !== ws && session.ws.readyState === WebSocket.OPEN) {
            try {
              session.ws.close();
            } catch {
              // ignore
            }
          }
          session.ws = ws;
          session.connected = true;
          session.lastPing = Date.now();
          if (msg.name) session.name = String(msg.name).slice(0, 16);
          if (msg.team) session.team = msg.team;
        } else {
          // New Player Scenario: Verify Room Capacity
          if (room.players.size >= MAX_PLAYERS) {
            safeSend(ws, {
              type: "join:error",
              code: "ROOM_FULL",
              message: `الغرفة ممتلئة (الحد الأقصى ${MAX_PLAYERS} لاعباً).`,
            });
            return;
          }

          // Assign lowest available slot 1..MAX_PLAYERS
          const usedSlots = new Set(Array.from(room.players.values()).map((p) => p.slot));
          let targetSlot = 1;
          while (usedSlots.has(targetSlot) && targetSlot <= MAX_PLAYERS) {
            targetSlot++;
          }

          const pId = incomingId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const pName = msg.name ? String(msg.name).slice(0, 16) : `Player ${targetSlot}`;
          // Alternate default teams by slot
          const pTeam = msg.team || (targetSlot % 2 === 1 ? "RED" : "BLUE");

          session = {
            id: pId,
            slot: targetSlot,
            name: pName,
            team: pTeam,
            ready: false, // strictly false on entry!
            ws,
            lastPing: Date.now(),
            connected: true,
          };

          room.players.set(pId, session);
        }

        boundRoomCode = code;
        boundRole = "phone";
        boundPlayerId = session.id;

        // Confirm to phone
        safeSend(ws, {
          type: "join:success",
          code,
          slot: session.slot,
          playerId: session.id,
          name: session.name,
          team: session.team,
          ready: session.ready,
          matchState: room.matchState,
          isReconnect,
        });

        // Notify TV
        safeSend(room.tvWs, {
          type: isReconnect ? "player:reconnected" : "player:joined",
          slot: session.slot,
          id: session.id,
          name: session.name,
          team: session.team,
          ready: session.ready,
          connected: true,
        });

        // Broadcast updated roster to all
        broadcastRoster(room);
        return;
      }

      // Route Phone Inputs to TV (Compact & Authoritative)
      if (type === "phone:input" && boundRoomCode && boundPlayerId) {
        const room = rooms.get(boundRoomCode);
        if (room && room.tvWs) {
          const session = room.players.get(boundPlayerId);
          // Drop input if player is disconnected
          if (!session || !session.connected) return;

          safeSend(room.tvWs, {
            type: "player:input",
            playerId: boundPlayerId,
            slot: session.slot,
            inputs: msg.inputs,
            seq: msg.seq,
          });
        }
        return;
      }

      // Phone update profile (name, team, ready)
      if (type === "phone:update_profile" && boundRoomCode && boundPlayerId) {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = room.players.get(boundPlayerId);
          if (player) {
            if (msg.name) player.name = String(msg.name).slice(0, 16);
            if (msg.team) player.team = msg.team;
            if (typeof msg.ready === "boolean") player.ready = msg.ready;

            safeSend(room.tvWs, {
              type: "player:updated",
              id: player.id,
              slot: player.slot,
              name: player.name,
              team: player.team,
              ready: player.ready,
            });

            // Echo back to phone
            safeSend(player.ws, {
              type: "profile:updated",
              name: player.name,
              team: player.team,
              ready: player.ready,
            });

            broadcastRoster(room);
          }
        }
        return;
      }

      // TV Host controls: edit player
      if (type === "tv:update_player" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = msg.id
            ? room.players.get(msg.id)
            : Array.from(room.players.values()).find((p) => p.slot === msg.slot);

          if (player) {
            if (msg.name) player.name = String(msg.name).slice(0, 16);
            if (msg.team) player.team = msg.team;
            safeSend(player.ws, {
              type: "profile:updated",
              name: player.name,
              team: player.team,
              ready: player.ready,
            });
            safeSend(room.tvWs, {
              type: "player:updated",
              id: player.id,
              slot: player.slot,
              name: player.name,
              team: player.team,
              ready: player.ready,
            });
            broadcastRoster(room);
          }
        }
        return;
      }

      // TV Host controls: kick player
      if (type === "tv:kick_player" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = msg.id
            ? room.players.get(msg.id)
            : Array.from(room.players.values()).find((p) => p.slot === msg.slot);

          if (player) {
            safeSend(player.ws, {
              type: "kicked",
              reason: "تم استبعادك من الغرفة بواسطة المضيف.",
            });
            room.players.delete(player.id);
            safeSend(room.tvWs, {
              type: "player:left",
              id: player.id,
              slot: player.slot,
            });
            broadcastRoster(room);
          }
        }
        return;
      }

      // TV sync match state to phones (LOBBY, COUNTDOWN, PLAYING, ENDED)
      // Broadcast snapshot efficiently once
      if (type === "tv:match_state" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          room.matchState = msg.matchState;
          const matchMsg = JSON.stringify({
            type: "match:state",
            matchState: msg.matchState,
            winnerTeam: msg.winnerTeam,
            winnerNames: msg.winnerNames,
            countdown: msg.countdown,
          });

          for (const p of room.players.values()) {
            if (p.ws && p.ws.readyState === WebSocket.OPEN) {
              try {
                p.ws.send(matchMsg);
              } catch {
                // ignore
              }
            }
          }
        }
        return;
      }

      // TV sending haptic / feedback events to specific phone
      if (type === "tv:phone_haptic" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = msg.id
            ? room.players.get(msg.id)
            : Array.from(room.players.values()).find((p) => p.slot === msg.slot);

          if (player) {
            safeSend(player.ws, {
              type: "haptic",
              effect: msg.effect, // 'hit' | 'eliminated' | 'fire' | 'shield'
              hp: msg.hp,
              maxHp: msg.maxHp,
              shieldRemaining: msg.shieldRemaining,
              shieldCooldown: msg.shieldCooldown,
              weapon: msg.weapon,
            });
          }
        }
        return;
      }

      // Ping for real-time latency verification
      if (type === "ping") {
        safeSend(ws, { type: "pong", clientTime: msg.clientTime, serverTime: Date.now() });
      }
    } catch (e) {
      console.error("WS message handling error:", e);
    }
  });

  ws.on("close", () => {
    if (boundRoomCode) {
      const room = rooms.get(boundRoomCode);
      if (room) {
        if (boundRole === "tv" && room.tvWs === ws) {
          room.tvWs = null;
          // Notify connected phones in Arabic
          const disconnectNotice = JSON.stringify({
            type: "tv:disconnected",
            message: "انقطع اتصال شاشة التلفاز. في انتظار عودة المضيف...",
          });
          for (const p of room.players.values()) {
            if (p.ws && p.ws.readyState === WebSocket.OPEN) {
              try {
                p.ws.send(disconnectNotice);
              } catch {
                // ignore
              }
            }
          }
        } else if (boundRole === "phone" && boundPlayerId) {
          const session = room.players.get(boundPlayerId);
          if (session && session.ws === ws) {
            session.connected = false;
            session.ws = null;
            if (room.tvWs) {
              safeSend(room.tvWs, {
                type: "player:disconnected",
                id: session.id,
                slot: session.slot,
                reconnectWindowSec: 15,
              });
            }

            // 15-second grace period for session reconnection
            session.disconnectTimer = setTimeout(() => {
              if (!session.connected) {
                room.players.delete(session.id);
                if (room.tvWs) {
                  safeSend(room.tvWs, {
                    type: "player:left",
                    id: session.id,
                    slot: session.slot,
                  });
                }
                broadcastRoster(room);
              }
            }, 15000);
          }
        }
      }
    }
  });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Tiri BRK LAN server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
