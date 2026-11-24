#!/usr/bin/env bash
# ==============================================================================
# FaceSwap AI Studio - Быстрая онлайн-установка (при наличии Wi-Fi / Интернета)
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}======================================================================${NC}"
echo -e "${GREEN}   FaceSwap AI Studio: Онлайн-установка (Wi-Fi / Интернет доступен)${NC}"
echo -e "${BLUE}======================================================================${NC}"

# 1. Установка Docker Engine
echo -e "\n${BLUE}[1/4] Проверка и установка Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "[*] Загрузка и установка официального Docker CE..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    echo -e "${GREEN}[✓] Docker успешно установлен.${NC}"
else
    echo -e "${GREEN}[✓] Docker уже установлен: $(docker --version)${NC}"
fi

# 2. Установка NVIDIA Container Toolkit (для проброса RTX 4090)
echo -e "\n${BLUE}[2/4] Настройка NVIDIA Container Toolkit для RTX 4090...${NC}"
if ! command -v nvidia-ctk &> /dev/null; then
    echo "[*] Добавление репозитория NVIDIA и установка toolkit..."
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
    sudo dnf install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker --set-as-default || sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    echo -e "${GREEN}[✓] NVIDIA Container Toolkit настроен.${NC}"
else
    echo -e "${GREEN}[✓] NVIDIA Container Toolkit уже активен.${NC}"
fi

# 3. Настройка Firewall (порт 7860)
echo -e "\n${BLUE}[3/4] Проверка фаервола...${NC}"
if systemctl is-active --quiet firewalld 2>/dev/null; then
    sudo firewall-cmd --add-port=7860/tcp --permanent --quiet 2>/dev/null || true
    sudo firewall-cmd --reload --quiet 2>/dev/null || true
    echo -e "${GREEN}[✓] Порт 7860 открыт в firewalld.${NC}"
fi

# 4. Загрузка моделей и запуск
echo -e "\n${BLUE}[4/4] Проверка моделей и запуск FaceSwap AI Studio...${NC}"
mkdir -p uploads outputs models

if [ ! -f "models/inswapper_128.onnx" ]; then
    echo "[*] Запуск автоматической загрузки нейросетевых моделей..."
    ./download_models.sh
fi

sudo docker compose up -d --build

sleep 3
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "IP_ПК")

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}   FaceSwap AI Studio успешно запущена на RTX 4090!                  ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "   -> Локально:          ${BLUE}http://localhost:7860${NC}"
echo -e "   -> Из локальной сети:  ${BLUE}http://${LOCAL_IP}:7860${NC}"
echo -e "   -> Просмотр логов:    ${YELLOW}sudo docker compose logs -f${NC}"
echo -e "${GREEN}======================================================================${NC}\n"
