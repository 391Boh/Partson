/**
 * PM2 Ecosystem Configuration for Partson
 * Оптимізовано для мінімізації використання пам'яті
 */
module.exports = {
  apps: [
    {
      name: 'partson-web',
      script: 'npm',
      args: 'run start:web',
      instances: 1,
      exec_mode: 'fork',
      
      // Обмеження пам'яті - автоматичний рестарт при перевищенні
      max_memory_restart: '800M',
      
      // Автоматичний рестарт при падінні
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '30s',
      
      // Логи
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      
      // Змінні оточення
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        // Оптимізація пам'яті Node.js
        NODE_OPTIONS: '--max-old-space-size=1024 --max-semi-space-size=128'
      }
    },
    {
      name: 'partson-auth',
      script: 'npm',
      args: 'run start:auth',
      instances: 1,
      exec_mode: 'fork',
      
      // Обмеження пам'яті - автоматичний рестарт при перевищенні
      max_memory_restart: '200M',
      
      // Автоматичний рестарт при падінні
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '30s',
      
      // Логи
      error_file: './logs/auth-error.log',
      out_file: './logs/auth-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      
      // Змінні оточення
      env: {
        NODE_ENV: 'production',
        // Оптимізація пам'яті Node.js
        NODE_OPTIONS: '--max-old-space-size=256 --max-semi-space-size=64'
      }
    }
  ]
};