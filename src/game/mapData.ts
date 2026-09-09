import { MapData } from '../types.ts';

export const ARENA_MAP: MapData = {
  width: 2200,
  height: 900,
  spawnPoints: [
    { x: 260, y: 720, team: 'RED' },
    { x: 1940, y: 720, team: 'BLUE' },
    { x: 1100, y: 300, team: 'GREEN' },
    { x: 1100, y: 720 },
  ],
  platforms: [
    // 1. Main Floor Ground
    { x: 0, y: 780, width: 2200, height: 120, type: 'solid', material: 'metal' },

    // 2. Left and Right Boundary Forcefields / Walls
    { x: -30, y: 0, width: 40, height: 900, type: 'solid', material: 'metal' },
    { x: 2190, y: 0, width: 40, height: 900, type: 'solid', material: 'metal' },

    // 3. Central Command Hub (Bunker & Rooftop)
    { x: 880, y: 550, width: 440, height: 28, type: 'solid', material: 'metal' },
    // Bunker support pillars
    { x: 920, y: 578, width: 36, height: 202, type: 'solid', material: 'concrete' },
    { x: 1244, y: 578, width: 36, height: 202, type: 'solid', material: 'concrete' },

    // 4. Central Top Sniper Bridge / High-Elevation Beam
    { x: 920, y: 340, width: 360, height: 20, type: 'solid', material: 'energy' },

    // 5. Left Sector Outpost (Tower & Intermediate steps)
    { x: 120, y: 640, width: 260, height: 24, type: 'solid', material: 'metal' },
    { x: 220, y: 460, width: 260, height: 24, type: 'solid', material: 'metal' },
    // Left outpost column
    { x: 160, y: 484, width: 30, height: 156, type: 'solid', material: 'concrete' },

    // 6. Right Sector Reactor Deck (Symmetrical tactical vantage)
    { x: 1820, y: 640, width: 260, height: 24, type: 'solid', material: 'metal' },
    { x: 1720, y: 460, width: 260, height: 24, type: 'solid', material: 'metal' },
    // Right reactor column
    { x: 2010, y: 484, width: 30, height: 156, type: 'solid', material: 'concrete' },

    // 7. Mid-ground tactical cover barricades (Crouch / jump-over barriers)
    { x: 580, y: 700, width: 32, height: 80, type: 'solid', material: 'concrete' },
    { x: 1588, y: 700, width: 32, height: 80, type: 'solid', material: 'concrete' },

    // 8. Mid-elevation connector steps
    { x: 530, y: 520, width: 190, height: 20, type: 'solid', material: 'metal' },
    { x: 1480, y: 520, width: 190, height: 20, type: 'solid', material: 'metal' },
  ],
};

/**
 * Calculates a non-colliding spawn coordinate for any player slot (up to MAX_PLAYERS)
 * based on team territorial positioning.
 */
export function getSpawnPosition(team: string, slot: number): { x: number; y: number } {
  const isRed = team === 'RED';
  const isBlue = team === 'BLUE';

  if (isRed) {
    const tier = slot % 3;
    if (tier === 0) {
      return { x: 180 + ((slot * 47) % 320), y: 720 };
    } else if (tier === 1) {
      return { x: 150 + ((slot * 43) % 200), y: 600 };
    } else {
      return { x: 240 + ((slot * 37) % 200), y: 420 };
    }
  }

  if (isBlue) {
    const tier = slot % 3;
    if (tier === 0) {
      return { x: 2020 - ((slot * 47) % 320), y: 720 };
    } else if (tier === 1) {
      return { x: 1850 + ((slot * 43) % 200), y: 600 };
    } else {
      return { x: 1750 + ((slot * 37) % 200), y: 420 };
    }
  }

  // Green / Neutral / Upper central hub
  return { x: 940 + ((slot * 53) % 320), y: slot % 2 === 0 ? 510 : 300 };
}
