module.exports = {
  apps: [
    {
      name: "pela",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 9314,
        HOSTNAME: "0.0.0.0"
      }
    },
    {
      // Proceso aparte del sitio, sin clusterizar: el multijugador de
      // /escapecv necesita estado en memoria compartido entre todos los
      // jugadores de una sala, y "pela" corre en cluster mode (varios
      // procesos Node independientes) donde cada worker tiene la suya.
      name: "pela-multiplayer",
      script: "server.js",
      cwd: "./multiplayer-server",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        MP_PORT: 9315
      }
    }
  ]
};
