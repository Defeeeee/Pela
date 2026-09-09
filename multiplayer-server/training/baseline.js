import fs from "fs";
import { AgarraEnv } from "./env.js";
import { NUM_ACTIONS } from "./actions.js";

const METRICS_FILE = new URL("metrics.jsonl", import.meta.url).pathname;

fs.writeFileSync(METRICS_FILE, "");

function randomAction() {
    return Math.floor(Math.random() * NUM_ACTIONS);
}

function runBaseline() {
    console.log("Starting baseline evaluation...");
    const env = new AgarraEnv("agent_0", 10);
    
    let totalGames = 0;
    let totalTicks = 0;
    let startTime = Date.now();
    
    let currentEpisodeReward = 0;
    let maxMass = 0;
    let currentMass = 0;
    
    env.reset();

    const TICK_BATCH = 1000;
    let generation = 0;

    setInterval(() => {
        let batchReward = 0;
        const batchStart = Date.now();

        for (let i = 0; i < TICK_BATCH; i++) {
            // For now, heuristic is just random actions
            const action = randomAction();
            const { reward, done, info } = env.step(action);
            
            currentEpisodeReward += reward;
            totalTicks++;
            currentMass = info.mass;
            if (currentMass > maxMass) maxMass = currentMass;

            if (done) {
                totalGames++;
                env.reset();
                currentEpisodeReward = 0;
            }
        }

        const batchTime = Math.max(1, Date.now() - batchStart);
        generation++;
        
        const metrics = {
            generation,
            elapsedSeconds: (Date.now() - startTime) / 1000,
            gamesPlayed: totalGames,
            decisionsMade: totalTicks,
            ticksPerSecond: TICK_BATCH / (batchTime / 1000),
            avgReward: currentEpisodeReward / (totalGames || 1),
            maxMass,
            currentMass
        };

        fs.appendFileSync(METRICS_FILE, JSON.stringify(metrics) + "\n");
        console.log(`Gen ${generation} | Games: ${totalGames} | Mass: ${Math.round(currentMass)} (Max: ${Math.round(maxMass)}) | TPS: ${Math.round(metrics.ticksPerSecond)}`);
        
    }, 1000);
}

runBaseline();
