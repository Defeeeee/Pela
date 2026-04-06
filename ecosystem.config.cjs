module.exports = {
  apps: [
    {
      name: "pela",
      script: "node_modules/.bin/next",
      args: "start -p 9314",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
