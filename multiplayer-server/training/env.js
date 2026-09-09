import { Arena } from "../agarra.js";
import { encodeState, STATE_SIZE } from "./encoder.js";
import { decodeAction, NUM_ACTIONS } from "./actions.js";

const DT = 1000 / 30; // 30 fps

export class AgarraEnv {
  constructor(playerId = "agent_0", numBots = 10) {
    this.playerId = playerId;
    this.numBots = numBots;
    this.arena = null;
    this.lastMass = 0;
  }

  reset() {
    this.arena = new Arena({ random: Math.random });
    
    // Add our agent
    this.arena.addPlayer(this.playerId, "Agent", "bot_account");
    this.arena.players.get(this.playerId).isBot = true;

    // Add random bots for baseline
    for(let i = 0; i < this.numBots; i++) {
        const id = `bot_${i}`;
        this.arena.addPlayer(id, `Bot_${i}`, `bot_account_${i}`);
        this.arena.players.get(id).isBot = true;
    }
    
    // Let everything spawn
    this.arena.tick(DT);
    
    this.lastMass = this._getMass();
    return encodeState(this.arena, this.playerId);
  }

  _getMass() {
    const p = this.arena.players.get(this.playerId);
    if (!p) return 0;
    return p.cells.reduce((sum, c) => sum + c.mass, 0);
  }

  step(actionIndex) {
    const action = decodeAction(actionIndex);
    const p = this.arena.players.get(this.playerId);
    
    let isDead = false;
    let reward = 0;

    if (!p || p.cells.length === 0) {
        isDead = true;
    } else {
        this.arena.setInput(this.playerId, action.dx, action.dy);
        if (action.split) {
            this.arena.splitPlayer(this.playerId);
            reward -= 0.5; // Penalty for splitting to discourage spam
        }
    }

    // Give dummy inputs to other bots
    for (const [id, bot] of this.arena.players.entries()) {
        if (id !== this.playerId) {
            // Simple random walk for dummy bots
            if (Math.random() < 0.05) {
               // change direction 5% of the time
               bot.targetDx = (Math.random() - 0.5) * 2;
               bot.targetDy = (Math.random() - 0.5) * 2;
            }
            this.arena.setInput(id, bot.targetDx || 0, bot.targetDy || 0);
        }
    }

    this.arena.tick(DT);

    const currentMass = this._getMass();
    
    if (currentMass === 0 && this.lastMass > 0) {
        reward = -100; // Death penalty
        isDead = true;
    } else if (!isDead) {
        // Reward is the change in sqrt(mass)
        reward += Math.sqrt(currentMass) - Math.sqrt(this.lastMass);
        
        // Massive penalty for getting eaten (losing more than what decay would cause)
        if (currentMass < this.lastMass - 5) {
            reward -= 20; // Ouch!
        }
    }

    this.lastMass = currentMass;

    const state = encodeState(this.arena, this.playerId);
    
    return {
        state,
        reward,
        done: isDead,
        info: { mass: currentMass }
    };
  }
}
