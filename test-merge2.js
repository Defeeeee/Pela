import { Arena } from "./multiplayer-server/agarra.js";
const arena = new Arena();
arena.addPlayer("p1", "p1");
arena.tick(100);
arena.players.get("p1").cells[0].mass = 100;
arena.splitPlayer("p1");
const p = arena.players.get("p1");
// Make one cell eat something to have different mass
p.cells[0].mass += 50; 
console.log("After split (different masses):", p.cells.map(c => c.mass).join(", "), "Dist:", Math.hypot(p.cells[0].x-p.cells[1].x, p.cells[0].y-p.cells[1].y));
for(let i=0; i<360; i++) {
  arena.setInput("p1", 1, 0);
  arena.tick(1000/30);
}
console.log("After 12s moving:", p.cells.map(c => c.mass).join(", "), "Dist:", Math.hypot(p.cells[0].x-p.cells[1].x, p.cells[0].y-p.cells[1].y));
for(let i=0; i<300; i++) {
  arena.setInput("p1", 1, 0);
  arena.tick(1000/30);
}
console.log("After 10s more:", p.cells.length, p.cells.map(c => c.mass).join(", "));
