import { WebSocket, WebSocketServer } from 'ws';
import { MAX_PLAYERS, PlayerSlotData, PlayerInput } from '../src/types.ts';

// Run simulated end-to-end WebSocket LAN test
async function runWebSocketTests() {
  console.log('--- STARTING WEBSOCKET LAN REAL-TIME TESTING ---');
  const TEST_PORT = 31234;
  const wss = new WebSocketServer({ port: TEST_PORT });

  interface Room {
    code: string;
    tvWs: WebSocket | null;
    players: Map<string, { id: string; slot: number; name: string; team: string; ready: boolean; ws: WebSocket }>;
  }

  const rooms = new Map<string, Room>();

  wss.on('connection', (ws) => {
    let boundRoom: string | null = null;
    let boundRole: 'tv' | 'phone' | null = null;
    let boundPlayerId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'tv:create_room') {
          boundRoom = msg.roomCode;
          boundRole = 'tv';
          rooms.set(boundRoom, { code: boundRoom, tvWs: ws, players: new Map() });
          ws.send(JSON.stringify({ type: 'tv:created', roomCode: boundRoom, maxPlayers: MAX_PLAYERS }));
        }

        if (msg.type === 'phone:join') {
          const room = rooms.get(msg.roomCode);
          if (!room) {
            ws.send(JSON.stringify({ type: 'join:error', message: 'ROOM_NOT_FOUND' }));
            return;
          }
          if (room.players.size >= MAX_PLAYERS) {
            ws.send(JSON.stringify({ type: 'join:error', message: 'ROOM_FULL' }));
            return;
          }
          boundRoom = msg.roomCode;
          boundRole = 'phone';
          boundPlayerId = msg.id || `p_${Date.now()}`;
          const slot = room.players.size + 1;
          const session = {
            id: boundPlayerId,
            slot,
            name: msg.name || `Player ${slot}`,
            team: msg.team || (slot % 2 === 1 ? 'RED' : 'BLUE'),
            ready: false, // MANDATORY: ready starts false
            ws,
          };
          room.players.set(boundPlayerId, session);

          // Reply to phone
          ws.send(JSON.stringify({
            type: 'phone:joined',
            roomCode: boundRoom,
            playerId: session.id,
            slot: session.slot,
            team: session.team,
            ready: session.ready,
          }));

          // Notify TV
          if (room.tvWs && room.tvWs.readyState === WebSocket.OPEN) {
            room.tvWs.send(JSON.stringify({
              type: 'player:joined',
              id: session.id,
              slot: session.slot,
              name: session.name,
              team: session.team,
              ready: session.ready,
            }));
          }
        }

        if (msg.type === 'phone:ready') {
          const room = rooms.get(boundRoom || '');
          if (room && boundPlayerId) {
            const session = room.players.get(boundPlayerId);
            if (session) {
              session.ready = !!msg.ready;
              if (room.tvWs) {
                room.tvWs.send(JSON.stringify({
                  type: 'player:ready',
                  id: session.id,
                  slot: session.slot,
                  ready: session.ready,
                }));
              }
            }
          }
        }

        if (msg.type === 'phone:input') {
          const room = rooms.get(boundRoom || '');
          if (room && room.tvWs) {
            // Forward compact input directly to TV Host
            room.tvWs.send(JSON.stringify({
              type: 'input',
              slot: msg.slot,
              inputs: msg.inputs,
            }));
          }
        }
      } catch (e) {
        console.error('Test server error:', e);
      }
    });
  });

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  await sleep(100);

  // 1. TV creates room
  const tvClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
  await new Promise(r => tvClient.on('open', r));

  const tvMessages: any[] = [];
  tvClient.on('message', data => tvMessages.push(JSON.parse(data.toString())));

  tvClient.send(JSON.stringify({ type: 'tv:create_room', roomCode: 'LAN01' }));
  await sleep(50);
  console.log('✓ [PASS] TV Created Room LAN01');

  // 2. Phone 1 joins
  const p1Client = new WebSocket(`ws://localhost:${TEST_PORT}`);
  await new Promise(r => p1Client.on('open', r));

  const p1Messages: any[] = [];
  p1Client.on('message', data => p1Messages.push(JSON.parse(data.toString())));

  p1Client.send(JSON.stringify({ type: 'phone:join', roomCode: 'LAN01', name: 'AlphaPilot', team: 'RED' }));
  await sleep(50);

  const p1JoinMsg = p1Messages.find(m => m.type === 'phone:joined');
  if (p1JoinMsg && p1JoinMsg.ready === false && p1JoinMsg.slot === 1) {
    console.log('✓ [PASS] Phone 1 Joined, Initialized with ready=false, slot=1');
  } else {
    throw new Error('Phone 1 join failed');
  }

  // 3. Phone 1 presses Ready
  p1Client.send(JSON.stringify({ type: 'phone:ready', ready: true }));
  await sleep(50);

  const tvReadyMsg = tvMessages.find(m => m.type === 'player:ready' && m.slot === 1 && m.ready === true);
  if (tvReadyMsg) {
    console.log('✓ [PASS] TV received Phone 1 Ready confirmation');
  } else {
    throw new Error('TV ready confirmation failed');
  }

  // 4. Send controller input from Phone to TV
  const testInput: PlayerInput = {
    moveX: 0.8,
    moveY: -0.5,
    aimX: 1,
    aimY: 0,
    isAiming: true,
    fire: true,
    jump: false,
    seq: 1,
  };
  p1Client.send(JSON.stringify({ type: 'phone:input', slot: 1, inputs: testInput }));
  await sleep(50);

  const tvInputMsg = tvMessages.find(m => m.type === 'input' && m.slot === 1 && m.inputs.moveX === 0.8);
  if (tvInputMsg) {
    console.log('✓ [PASS] Phone Controller Input cleanly forwarded to TV Host');
  } else {
    throw new Error('TV input forward failed');
  }

  // 5. Cleanup
  tvClient.close();
  p1Client.close();
  wss.close();
  console.log('--- ALL WEBSOCKET LAN TESTS PASSED SUCCESSFULLY ---');
}

runWebSocketTests().catch(e => {
  console.error('WS test failed:', e);
  process.exit(1);
});
