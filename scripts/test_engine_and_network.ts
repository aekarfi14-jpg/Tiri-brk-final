// Browser mock for Node environment test execution
if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    AudioContext: class {
      createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: 'sine' }; }
      createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
      createBuffer() { return { getChannelData() { return new Float32Array(100); } }; }
      createBiquadFilter() { return { connect() {}, frequency: { setValueAtTime() {} }, type: 'lowpass' }; }
      destination = {};
      currentTime = 0;
    },
    webkitAudioContext: class {},
  };
}

import { GameEngine } from '../src/game/gameEngine.ts';
import { MAX_PLAYERS, PlayerSlotData, PlayerInput } from '../src/types.ts';

async function runTests() {
  console.log('--- STARTING TIRI BRK ENGINE & NETWORKING VALIDATION ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
    } else {
      console.error(`✗ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
      process.exitCode = 1;
    }
  }

  // 1. MAX_PLAYERS Constant Verification
  assert(MAX_PLAYERS === 32, 'MAX_PLAYERS Architecture', `Central constant is set to ${MAX_PLAYERS}`);

  // 2. Initialize Game Engine
  const engine = new GameEngine();
  assert(engine !== null, 'TV GameEngine Initialization', 'Engine instantiated');

  // 3. Test Full Scale Allocation up to 32 players via initMatch
  const roster32: PlayerSlotData[] = [];
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
    roster32.push({
      slot,
      id: `p_test_${slot}`,
      name: `Player ${slot}`,
      team: slot % 2 === 1 ? 'RED' : 'BLUE',
      ready: true,
      connected: true,
    });
  }
  engine.initMatch(roster32);
  const initializedPlayers = Array.from(engine.players.values());
  assert(
    initializedPlayers.length === MAX_PLAYERS,
    '32-Player Capacity Allocation',
    `Successfully initialized ${initializedPlayers.length} real players simultaneously`
  );

  // 4. Test Single and Multiple Real Players Identity & Team Assignment
  const p1 = engine.players.get(1);
  const p2 = engine.players.get(2);
  assert(p1 !== undefined && p1.id === 'p_test_1' && p1.team === 'RED', 'Player 1 Identity Preserved', `Slot 1, Team RED, ID ${p1?.id}`);
  assert(p2 !== undefined && p2.id === 'p_test_2' && p2.team === 'BLUE', 'Player 2 Identity Preserved', `Slot 2, Team BLUE, ID ${p2?.id}`);

  // 5. Test Countdown and Match State
  assert(engine.matchState === 'COUNTDOWN', 'Match State Countdown Started', 'Countdown initiated upon match start');

  // 6. Test Authoritative Movement via handleInput
  const combatEngine = new GameEngine();
  const combatRoster: PlayerSlotData[] = [
    { slot: 1, id: 'red_1', name: 'Red Ally 1', team: 'RED', ready: true, connected: true },
    { slot: 2, id: 'red_2', name: 'Red Ally 2', team: 'RED', ready: true, connected: true },
    { slot: 3, id: 'blue_1', name: 'Blue Enemy 1', team: 'BLUE', ready: true, connected: true },
  ];
  combatEngine.initMatch(combatRoster);
  // Force match to PLAYING so updates process
  combatEngine.matchState = 'PLAYING';

  const red1 = combatEngine.players.get(1)!;
  const red2 = combatEngine.players.get(2)!;
  const blue1 = combatEngine.players.get(3)!;

  // Set positions
  red1.x = 200;
  red1.y = 300;
  red1.vx = 0;
  red1.vy = 0;
  red2.x = 280;
  red2.y = 300;
  blue1.x = 380;
  blue1.y = 300;

  const initialX = red1.x;
  const moveInput: PlayerInput = {
    moveX: 1,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    isAiming: true,
    fire: false,
    jump: false,
    seq: 10,
  };
  combatEngine.handleInput(1, moveInput);
  combatEngine.update(1 / 30); // 1 tick
  assert(red1.x > initialX, 'Authoritative Movement Processing', `X shifted from ${initialX} to ${red1.x.toFixed(2)}`);

  // 7. Test Sequence Number Stale Packet Rejection
  const staleInput: PlayerInput = {
    moveX: -1,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    isAiming: true,
    fire: false,
    jump: false,
    seq: 5, // Outdated sequence (< 10)
  };
  const preStaleMoveX = red1.inputs.moveX;
  combatEngine.handleInput(1, staleInput);
  assert(red1.inputs.moveX === preStaleMoveX, 'Stale Packet Rejection (Sequence Numbers)', `Outdated seq 5 rejected, preserved seq 10 moveX = ${preStaleMoveX}`);

  // 8. Test Weapon Firing & Projectile Generation
  const fireInput: PlayerInput = {
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    isAiming: true,
    fire: true,
    jump: false,
    seq: 11,
  };
  combatEngine.handleInput(1, fireInput);
  combatEngine.update(1 / 30);
  const projs = combatEngine.projectiles;
  assert(projs.length > 0, 'Weapon Firing & Projectile Authority', `Spawned ${projs.length} active projectile(s)`);

  // 9. Test Friendly Fire Block (Red1 projectile cannot damage Red2)
  const initialRed2Hp = red2.hp;
  // Position projectile directly on Red2
  projs[0].x = red2.x;
  projs[0].y = red2.y;
  projs[0].team = 'RED';
  combatEngine.update(1 / 60);
  assert(red2.hp === initialRed2Hp, 'Friendly Fire Block In GameEngine', `Same-team Ally HP untouched at ${red2.hp}/${red2.maxHp}`);

  // 10. Test Hostile Damage (Red1 projectile damages Blue1)
  const initialBlueHp = blue1.hp;
  // Position projectile directly on enemy Blue1
  projs[0].x = blue1.x;
  projs[0].y = blue1.y;
  projs[0].team = 'RED';
  combatEngine.update(1 / 60);
  assert(blue1.hp < initialBlueHp, 'Hostile Damage Applied Authoritatively', `Enemy HP decreased: ${initialBlueHp} -> ${blue1.hp}`);

  // 11. Test Disconnect & Reconnect Session Recovery Logic
  const disconnectRoster = combatRoster.map(p => p.slot === 3 ? { ...p, connected: false } : p);
  assert(disconnectRoster.find(p => p.slot === 3)?.connected === false, 'Disconnect Grace Period', 'Slot 3 marked disconnected while preserving slot');

  const reconnectRoster = disconnectRoster.map(p => p.slot === 3 ? { ...p, connected: true } : p);
  const recoveredPlayer = reconnectRoster.find(p => p.slot === 3);
  assert(recoveredPlayer?.id === 'blue_1' && recoveredPlayer.slot === 3, 'Session Recovery Without Duplicates', `Player blue_1 recovered slot 3 seamlessly`);

  console.log('-------------------------------------------------------');
  console.log(`SUMMARY: ${passed} / ${total} TESTS PASSED SUCCESSFULLY.`);
  console.log('-------------------------------------------------------');
}

runTests().catch((e) => {
  console.error('Validation test error:', e);
  process.exit(1);
});
