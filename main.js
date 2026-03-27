const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Port 9314 -> PELA
const PORT = 9314;

const IMGS_DIR = path.join(__dirname, 'imgs');

app.use('/imgs', express.static(IMGS_DIR));

app.get('/', (req, res) => {
    const files = fs.readdirSync(IMGS_DIR).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f));
    if (!files.length) return res.status(404).send('No images found in imgs folder.');

    const fileName = files[Math.floor(Math.random() * files.length)];
    const delay = Math.floor(Math.random() * 2001) + 2000; // 2000-4000ms
    const title = fileName.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase());

    console.log(`Sent: ${fileName}`);
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cargando pelada...</title>
  <style>
    body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
    #loader { color: #fff; font-family: sans-serif; font-size: 2rem; text-align: center; }
    #bar-bg { margin-top: 1rem; width: 300px; height: 12px; background: #333; border-radius: 6px; overflow: hidden; }
    #bar { height: 100%; width: 0%; background: #fff; border-radius: 6px; transition: width 0.1s linear; }
    #img-container { display: none; position: fixed; inset: 0; }
    #img-container img { width: 100vw; height: 100vh; object-fit: fill; }
  </style>
</head>
<body>
  <div id="loader">Cargando al pelado...<div id="bar-bg"><div id="bar"></div></div></div>
  <div id="img-container"><img src="/imgs/${fileName}" alt="${fileName}"></div>
  <script>
    const delay = ${delay};
    const bar = document.getElementById('bar');
    const start = Date.now();
    const interval = setInterval(() => {
      bar.style.width = Math.min((Date.now() - start) / delay * 100, 100) + '%';
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      bar.style.width = '100%';
      document.getElementById('loader').style.display = 'none';
      document.getElementById('img-container').style.display = 'block';
      document.title = '${title}';
    }, delay);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🚀 Server active at http://localhost:${PORT}`);
});
