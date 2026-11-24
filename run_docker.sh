#!/usr/bin/env bash
# ==============================================================================
# run_docker.sh – Скрипт быстрого запуска и управления FaceSwap Studio в Docker
# ==============================================================================
set -e

ACTION="${1:-up}"

case "$ACTION" in
    up|start)
        echo "[*] Сборка и запуск контейнера FaceSwap Studio на GPU..."
        docker compose up -d --build
        echo ""
        echo "[✓] Контейнер успешно запущен!"
        echo "    Панель управления доступна по адресу: http://localhost:7860"
        echo "    Для просмотра логов в реальном времени выполните: ./run_docker.sh logs"
        ;;
    logs)
        docker compose logs -f faceswap-studio
        ;;
    down|stop)
        echo "[*] Остановка контейнера FaceSwap Studio..."
        docker compose down
        echo "[✓] Контейнер остановлен."
        ;;
    restart)
        echo "[*] Перезапуск контейнера FaceSwap Studio..."
        docker compose restart
        ;;
    status|ps)
        docker compose ps
        ;;
    exec|bash)
        docker compose exec faceswap-studio /bin/bash
        ;;
    *)
        echo "Использование: $0 [up|down|restart|logs|status|bash]"
        exit 1
        ;;
esac
