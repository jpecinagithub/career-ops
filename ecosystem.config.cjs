module.exports = {
  apps: [{
    name: 'career-ops-api',
    script: './server/src/index.js',
    interpreter: 'node',
    cwd: '/var/www/career-ops',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    watch: false,
    max_memory_restart: '500M',
    error_file: '/var/log/career-ops/error.log',
    out_file: '/var/log/career-ops/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
