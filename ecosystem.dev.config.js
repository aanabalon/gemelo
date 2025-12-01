module.exports = {
  apps: [{
    name: 'gemelo-dev',
    script: 'node_modules/next/dist/bin/next',
    args: 'dev -p 3002',
    cwd: '/var/www/gemelo-app',
    env: {
      NODE_ENV: 'development',
    },
    watch: true,             // reinicia cuando cambias archivos
    ignore_watch: [
      'node_modules',
      '.next',
      'logs'
    ]
  }]
};
