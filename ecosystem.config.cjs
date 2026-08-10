module.exports = {
  apps: [
    {
      name: "slai",
      cwd: process.env.SLAI_APP_DIR || process.cwd(),
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3000",
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
