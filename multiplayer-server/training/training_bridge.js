import { AgarraEnv } from "./env.js";
import readline from "readline";

const env = new AgarraEnv("agent_0", 10);
let state = env.reset();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// Output initial state
console.log(JSON.stringify({ state: Array.from(state) }));

rl.on('line', (line) => {
    const parts = line.split(',');
    const actionIndex = parseInt(parts[0], 10);
    const isSpectator = parts.length > 1 ? parts[1] === '1' : process.argv.includes('--spectator');
    
    if (isNaN(actionIndex)) return;

    const result = env.step(actionIndex);
    
    process.stdout.write(JSON.stringify({
        state: Array.from(result.state),
        reward: result.reward,
        done: result.done,
        mass: result.info.mass
    }) + "\n");

    if (result.done) {
        const resetState = env.reset();
        process.stdout.write(JSON.stringify({
            state: Array.from(resetState)
        }) + "\n");
    }

    const now = Date.now();
    if (isSpectator && (!global.lastDump || now - global.lastDump > 100)) {
        const arena = env.arena;
        const stateObj = {
            players: Array.from(arena.players.values()).map(p => ({
                id: p.id,
                isAgent: p.id === "agent_0",
                cells: p.cells.map(c => ({x: c.x, y: c.y, radius: c.radius}))
            })),
            palas: Array.from(arena.palas.values()).map(p => ({x: p.x, y: p.y}))
        };
        import("fs").then(fs => fs.writeFileSync("training/spectator.json", JSON.stringify(stateObj)));
        global.lastDump = now;
    }
});
