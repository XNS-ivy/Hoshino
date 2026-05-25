module.exports = {
  apps: [
    {
      name: "hoshino",
      script: "bun",
      args: "run index.ts",
      exec_mode: "fork",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      max_memory_restart: "500M",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production"
      },
    }
  ]
}