# FaceSwap AI Studio HD (Docker + NVIDIA RTX 4090)

Высокопроизводительная веб-студия замены лиц (Face Swap) на базе нейросетей нового поколения с аппаратным ускорением на **NVIDIA GeForce RTX 4090 (24GB VRAM)** с приоритетом **тензорных ядер (Tensor Cores)** и оптимизацией под **Fedora Linux / Ubuntu**.

---

## Возможности

* 🚀 **Ускорение на тензорных ядрах 4-го поколения:** Использование TensorFloat-32 (`TF32`) и cuDNN Heuristic Search для максимального FPS (45–70+ кадров/сек на RTX 4090).
* 🎯 **Двойной проход UltraID:** Замена лиц без артефактов и дрожания контуров.
* ✨ **CodeFormer HD:** Восстановление четкости глаз, кожи и мелких деталей.
* 🛡️ **SELinux & Fedora Ready:** Контейнер полностью совместим с режимом `Enforcing` в Fedora.
* 📦 **Автозагрузка моделей:** При первом запуске все необходимые ONNX-модели скачиваются автоматически.

---

## Быстрый старт на Fedora Linux (RTX 4090)

### 1. Клонирование репозитория
```bash
git clone https://github.com/iliy-git/faceswap-studio.git
cd faceswap-studio
```

### 2. Установка в 1 команду
```bash
chmod +x *.sh
sudo ./install_online.sh
```

Этот скрипт автоматически:
1. Проверит и установит Docker CE (через get.docker.com).
2. Настроит NVIDIA Container Toolkit для проброса RTX 4090 в Docker.
3. Откроет порт 7860 в Firewalld.
4. Скачает нейросетевые модели и запустит веб-интерфейс в Docker-контейнере.

---

## Ручной запуск через Docker Compose

Если Docker и NVIDIA Container Toolkit уже установлены:

```bash
# 1. Скачать модели нейросетей
./download_models.sh

# 2. Собрать и запустить контейнер
sudo docker compose up -d --build
```

---

## Доступ к веб-интерфейсу

После запуска откройте в браузере:
* На локальной машине: **http://localhost:7860**
* Из локальной сети: **http://<IP_КОМПЬЮТЕРА>:7860**

---

## Управление

* Просмотр логов обработки в реальном времени:
  ```bash
  ./run_docker.sh logs
  ```
* Остановка контейнера:
  ```bash
  ./run_docker.sh stop
  ```
* Запуск:
  ```bash
  ./run_docker.sh start
  ```
* Перезапуск:
  ```bash
  ./run_docker.sh restart
  ```

---

## Структура проекта

```
faceswap-studio/
├── web_app.py              # FastAPI сервер и пайплайн обработки нейросетей
├── static/                 # Веб-интерфейс (HTML, CSS, JS)
├── Dockerfile              # Сборка на CUDA 12.4 + cuDNN 9
├── docker-compose.yml      # Конфигурация запуска с резервированием GPU и 16GB SHM
├── download_models.sh      # Загрузчик ONNX моделей
├── install_online.sh       # Скрипт быстрой автоматической установки
├── entrypoint.sh           # Скрипт инициализации контейнера
└── run_docker.sh           # Утилита управления контейнером
```
