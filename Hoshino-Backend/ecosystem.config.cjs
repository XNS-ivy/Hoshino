const path = require("node:path")

module.exports = {
	apps: [
		{
			name: "hoshino-backend",
			script: "bun",
			args: "run src/index.ts",
			cwd: __dirname,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			max_restarts: 10,
			max_memory_restart: "600M",
			restart_delay: 3000,
			env: {
				NODE_ENV: "production",
				PORT: 3040,
			},
		},
		{
			name: "hoshino-frontend",
			script: "bun",
			args: "run dev -- --host 0.0.0.0 --port 3041",
			cwd: path.resolve(__dirname, "../Hoshino-Frontend"),
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
}
