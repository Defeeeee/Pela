import { WORLD_WIDTH, WORLD_HEIGHT, MAX_CELLS, MERGE_COOLDOWN_MS } from "../agarra.js";

// Egocentric, world-axis-aligned vector combining:
// - normalized mass (1)
// - radius (1)
// - cell count (1)
// - merge cooldown (1)
// - split eligibility (1)
// - wall distances (4)
// - velocity (2)
// Total 11 numbers.
//
// Plus a grid of 8 sectors by 3 rings tracking:
// - pellet density
// - threat mass
// - prey mass
// - nearest threat distance
// - nearest prey distance
// 8 * 3 * 5 = 120 numbers.
// 
// Total state size = 131.
export const STATE_SIZE = 131;

const NUM_SECTORS = 8;
const NUM_RINGS = 3;
const RING_THRESHOLDS = [500, 1000, 2000]; // distances for the 3 rings

export function encodeState(arena, playerId) {
  const state = new Float32Array(STATE_SIZE);
  const player = arena.players.get(playerId);
  
  if (!player || player.cells.length === 0) {
    return state; // All zeros if dead
  }

  // Use the center of mass of the player's cells
  let cx = 0;
  let cy = 0;
  let totalMass = 0;
  let vx = 0;
  let vy = 0;
  
  for (const cell of player.cells) {
    cx += cell.x * cell.mass;
    cy += cell.y * cell.mass;
    totalMass += cell.mass;
    vx += cell.vx * cell.mass;
    vy += cell.vy * cell.mass;
  }
  
  cx /= totalMass;
  cy /= totalMass;
  vx /= totalMass;
  vy /= totalMass;
  
  const radius = Math.sqrt(totalMass);

  // Core 11 values
  const ourMaxCell = Math.max(...player.cells.map(c => c.mass));
  const maxRadius = Math.sqrt(ourMaxCell);

  state[0] = Math.min(ourMaxCell / 10000, 1.0); // was totalMass
  state[1] = Math.min(maxRadius / 100, 1.0);
  state[2] = player.cells.length / MAX_CELLS;
  
  let maxCooldown = 0;
  for (const c of player.cells) {
    if (c.mergeAt) {
      maxCooldown = Math.max(maxCooldown, c.mergeAt - arena.tiempo);
    }
  }
  state[3] = Math.max(0, Math.min(maxCooldown / MERGE_COOLDOWN_MS, 1.0));
  
  state[4] = (player.cells.length < MAX_CELLS && totalMass >= 30) ? 1.0 : 0.0;
  
  // Wall distances (normalized to max distance 2000)
  state[5] = Math.min(cx / 2000, 1.0); // left
  state[6] = Math.min((WORLD_WIDTH - cx) / 2000, 1.0); // right
  state[7] = Math.min(cy / 2000, 1.0); // top
  state[8] = Math.min((WORLD_HEIGHT - cy) / 2000, 1.0); // bottom
  
  // Velocity
  state[9] = Math.max(-1.0, Math.min(vx / 50, 1.0));
  state[10] = Math.max(-1.0, Math.min(vy / 50, 1.0));

  // Vision Grid
  let offset = 11;
  const numGridFeatures = 5; // density, threat mass, prey mass, nearest threat, nearest prey

  // Initialize distances to 1.0 (max)
  for (let s = 0; s < NUM_SECTORS; s++) {
    for (let r = 0; r < NUM_RINGS; r++) {
      const idx = offset + (s * NUM_RINGS + r) * numGridFeatures;
      state[idx + 3] = 1.0; // nearest threat
      state[idx + 4] = 1.0; // nearest prey
    }
  }

  const getGridIndex = (dx, dy, dist) => {
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += 2 * Math.PI;
    const sector = Math.floor((angle / (2 * Math.PI)) * NUM_SECTORS) % NUM_SECTORS;
    
    let ring = -1;
    for (let i = 0; i < NUM_RINGS; i++) {
      if (dist < RING_THRESHOLDS[i]) {
        ring = i;
        break;
      }
    }
    if (ring === -1) return -1;
    
    return offset + (sector * NUM_RINGS + ring) * numGridFeatures;
  };

  // Pellets (palas)
  for (const pala of arena.palas.values()) {
    const dx = pala.x - cx;
    const dy = pala.y - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const idx = getGridIndex(dx, dy, dist);
    if (idx !== -1) {
      state[idx + 0] += 1.0; // increment pellet count
    }
  }

  // Normalize pellet density somewhat arbitrarily (say max 20 pellets per sector/ring)
  for (let s = 0; s < NUM_SECTORS; s++) {
    for (let r = 0; r < NUM_RINGS; r++) {
      const idx = offset + (s * NUM_RINGS + r) * numGridFeatures;
      state[idx + 0] = Math.min(state[idx + 0] / 20, 1.0);
    }
  }

  // Other players
  for (const other of arena.players.values()) {
    if (other.id === playerId) continue;
    
    for (const cell of other.cells) {
      const dx = cell.x - cx;
      const dy = cell.y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const idx = getGridIndex(dx, dy, dist);
      
      if (idx !== -1) {
        // Can they eat our largest cell?
        const ourMaxCell = Math.max(...player.cells.map(c => c.mass));
        const canEatUs = cell.mass > ourMaxCell * 1.25;
        // Can we eat them?
        const weCanEatThem = ourMaxCell > cell.mass * 1.25;
        
        const distNorm = dist / RING_THRESHOLDS[NUM_RINGS - 1];

        if (canEatUs) {
          state[idx + 1] += Math.min(cell.mass / 10000, 1.0); // threat mass
          state[idx + 3] = Math.min(state[idx + 3], distNorm); // nearest threat
        } else if (weCanEatThem) {
          state[idx + 2] += Math.min(cell.mass / 10000, 1.0); // prey mass
          state[idx + 4] = Math.min(state[idx + 4], distNorm); // nearest prey
        }
      }
    }
  }
  
  return state;
}
