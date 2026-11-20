/**
 * PM2 Ecosystem Configuration for Partson
 * Оптимізовано для мінімізації використання пам'яті
 */
module.exports = {
  apps: [
    {
      name: 'partson-web',
      // Run Next.js itself, not `npm run start:web`: PM2 measures (and
      // restarts on) the memory of the process it spawns. Through npm that was
      // npm (~12 MB) while next-server (300-700 MB) ran as a grandchild outside
      // max_memory_restart. `next start` does not fork — the process renames
      // itself to next-server — so this pid is the server. Same command as
      // package.json's start:web.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      
      // Restart only as a last resort. RSS = V8 heap + ~200 MB outside it
      // (code, large objects, buffers), so this must stay well above the heap
      // cap below: with 640 MB heap and an 800M limit PM2 killed the server
      // 26 times a day (2026-11-19) before V8 ever had to collect garbage.
      max_memory_restart: '880M',
      
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
        // Heap well below max_memory_restart (heap + ~200 MB overhead must
        // fit) so V8 collects garbage before PM2 has to kill the process.
        // Live heap measured 2026-11-20: ~290 MB idle, ~410 MB under load.
        NODE_OPTIONS: '--max-old-space-size=512 --max-semi-space-size=16'
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
        AUTH_PORT: '3001',
        // Оптимізація пам'яті Node.js
        NODE_OPTIONS: '--max-old-space-size=256 --max-semi-space-size=64'
      }
    }
  ]
};
