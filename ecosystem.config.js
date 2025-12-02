module.exports = {
  apps: [
    {
      name: "gemelo-prod",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      cwd: "/var/www/gemelo-app",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://gemelo_user:%23Ingero5@localhost:5432/gemelo_db2",
        INFLUX_URL: "http://localhost:8086/",
        INFLUX_TOKEN: "D9SG9FTwYrBQD8j8y1IrdtHoZ4UFK636oqCdxeouCWUd_cKUCASTIp1rBNnB7qEOOIc0n3mILtVFZc8TWFPvaA==",
        INFLUX_ORG: "gemelo_landes",
        INFLUX_BUCKET: "data_gemelo",
        PORT: "3002",

        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "587",
        SMTP_USER: "ingerospa@gmail.com",
        SMTP_PASS: "zhflewjcgvgiajau",
        SMTP_FROM: "Notificaciones INGERO <ingerospa@gmail.com>"
      }
    }
  ]
};
