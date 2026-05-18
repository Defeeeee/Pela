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
    }
  ]
};
