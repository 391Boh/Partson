#!/bin/bash
# Скрипт для моніторингу використання пам'яті Partson
# Використання: ./scripts/memory-monitor.sh

echo "========================================"
echo "  Partson Memory Monitor"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# Перевірка PM2 процесів
echo "📊 PM2 Process Status:"
echo "----------------------------------------"
if command -v pm2 &> /dev/null; then
    pm2 status
    echo ""
    echo "📈 Memory Details:"
    pm2 list --mini
else
    echo "⚠️  PM2 not found. Install with: npm install -g pm2"
fi

echo ""
echo "🖥️  System Memory:"
echo "----------------------------------------"
if command -v free &> /dev/null; then
    free -h
else
    # macOS fallback
    sysctl -n hw.memsize | awk '{printf "Total Memory: %.2f GB\n", $1/1024/1024/1024}'
    vm_stat 2>/dev/null | awk '/Pages active/ {printf "Active: %.2f GB\n", $3 * 4096 / 1024 / 1024 / 1024}' || true
fi

echo ""
echo "🔝 Top 10 Memory Consumers:"
echo "----------------------------------------"
if command -v ps &> /dev/null; then
    ps aux --sort=-%mem 2>/dev/null | head -11 || ps -eo pid,ppid,cmd,%mem --sort=-%mem | head -11
fi

echo ""
echo "📝 Recent PM2 Logs (last 20 lines):"
echo "----------------------------------------"
if command -v pm2 &> /dev/null && [ -d "logs" ]; then
    echo "=== Web Error Log ==="
    tail -20 logs/web-error.log 2>/dev/null || echo "No web error log found"
    echo ""
    echo "=== Auth Error Log ==="
    tail -20 logs/auth-error.log 2>/dev/null || echo "No auth error log found"
else
    echo "No logs directory or PM2 not found"
fi

echo ""
echo "⚡ Quick Actions:"
echo "----------------------------------------"
echo "  restart     - Restart all PM2 processes"
echo "  logs        - Show live PM2 logs"
echo "  monit       - Interactive monitoring"
echo "  flush       - Flush PM2 logs"
echo "  help        - Show this help"
echo ""

# Обробка команд
case "$1" in
    restart)
        echo "🔄 Restarting all processes..."
        pm2 restart all
        ;;
    logs)
        echo "📋 Showing live logs..."
        pm2 logs --lines 100
        ;;
    monit)
        echo "📊 Starting interactive monitor..."
        pm2 monit
        ;;
    flush)
        echo "🗑️  Flushing PM2 logs..."
        pm2 flush
        ;;
    help|*)
        # Already shown above
        ;;
esac