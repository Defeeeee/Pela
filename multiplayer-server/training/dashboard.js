import http from "http";
import fs from "fs";

const PORT = 3333;
const METRICS_FILE = new URL("metrics.jsonl", import.meta.url).pathname;

const HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Training Dashboard</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #111; color: #eee; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: #222; padding: 20px; border-radius: 8px; border: 1px solid #333; }
        .card h3 { margin: 0 0 10px 0; font-size: 14px; color: #888; }
        .card .value { font-size: 24px; font-weight: bold; }
        #chart { width: 100%; height: 300px; background: #222; border: 1px solid #333; border-radius: 8px; margin-top: 20px; }
        #spectator { width: 100%; height: 600px; background: #000; border: 1px solid #333; border-radius: 8px; margin-top: 20px; }
    </style>
</head>
<body>
    <h1>🤖 Training Dashboard</h1>
    <div class="grid" id="stats">
        <!-- populated by js -->
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
            <h3>Max Mass over Time</h3>
            <canvas id="chart"></canvas>
        </div>
        <div>
            <h3>Live Arena Spectator (Agent = Green, Bots = Red)</h3>
            <canvas id="spectator"></canvas>
        </div>
    </div>

    <script>
        async function fetchMetrics() {
            const res = await fetch('/data');
            const text = await res.text();
            const lines = text.trim().split('\\n').filter(l => l);
            if (lines.length === 0) return;
            
            const metrics = lines.map(l => JSON.parse(l));
            const latest = metrics[metrics.length - 1];
            
            document.getElementById('stats').innerHTML = \`
                <div class="card"><h3>Generation</h3><div class="value">\${latest.generation}</div></div>
                <div class="card"><h3>Games Played</h3><div class="value">\${latest.gamesPlayed}</div></div>
                <div class="card"><h3>Decisions</h3><div class="value">\${latest.decisionsMade}</div></div>
                <div class="card"><h3>Current Mass</h3><div class="value">\${Math.round(latest.currentMass)}</div></div>
                <div class="card"><h3>Max Mass</h3><div class="value">\${Math.round(latest.maxMass)}</div></div>
                <div class="card"><h3>Ticks/sec</h3><div class="value">\${Math.round(latest.ticksPerSecond)}</div></div>
            \`;
            
            drawChart(metrics);
        }

        function drawChart(metrics) {
            const canvas = document.getElementById('chart');
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (metrics.length < 2) return;
            
            const maxVal = Math.max(...metrics.map(m => m.maxMass));
            const minVal = 0;
            
            ctx.beginPath();
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            
            metrics.forEach((m, i) => {
                const x = (i / (metrics.length - 1)) * canvas.width;
                const y = canvas.height - ((m.maxMass - minVal) / ((maxVal || 1) - minVal) * canvas.height);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        async function fetchSpectator() {
            try {
                const res = await fetch('/spectator');
                const state = await res.json();
                drawSpectator(state);
            } catch(e) {}
        }

        function drawSpectator(state) {
            const canvas = document.getElementById('spectator');
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Map 4000x4000 world to canvas
            const scale = Math.min(canvas.width, canvas.height) / 4000;
            ctx.save();
            // Center the map if canvas is wider
            ctx.translate((canvas.width - 4000*scale)/2, (canvas.height - 4000*scale)/2);
            ctx.scale(scale, scale);
            
            // Draw grid / borders
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 10;
            ctx.strokeRect(0, 0, 4000, 4000);

            // Draw palas
            ctx.fillStyle = '#fff';
            for (const p of state.palas) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
                ctx.fill();
            }

            // Draw players
            for (const p of state.players) {
                ctx.fillStyle = p.isAgent ? '#4CAF50' : '#E53935';
                for (const c of p.cells) {
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2);
                    ctx.fill();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
            
            ctx.restore();
        }

        setInterval(fetchMetrics, 1000);
        setInterval(fetchSpectator, 100); // 10 FPS spectator refresh
        fetchMetrics();
        fetchSpectator();
    </script>
</body>
</html>
`;

http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HTML);
    } else if (req.url === "/data") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        if (fs.existsSync(METRICS_FILE)) {
            res.end(fs.readFileSync(METRICS_FILE));
        } else {
            res.end("");
        }
    } else if (req.url === "/spectator") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const specFile = new URL("spectator.json", import.meta.url).pathname;
        if (fs.existsSync(specFile)) {
            res.end(fs.readFileSync(specFile));
        } else {
            res.end("{}");
        }
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
