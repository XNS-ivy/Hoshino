module.exports = {
  apps: [
    {
      name: "hoshino-frontend",
      script: "bun",
      args: "run dev -- --host 0.0.0.0 --port 3041",
      cwd: __dirname,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      max_memory_restart: "400M",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
