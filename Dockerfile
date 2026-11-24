# Базовый образ с CUDA 12.4 и cuDNN 9 на Ubuntu 22.04 (для RTX 4090 и ONNX Runtime GPU 1.19)
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

LABEL maintainer="FaceSwap AI Studio"
LABEL description="FaceSwap AI Studio Ultra-HD Docker Image for NVIDIA RTX 4090"

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=7860

# Установка системных пакетов, Python 3.10 и ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    openssl \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Обновление pip
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Установка Python-зависимостей
COPY requirements-docker.txt /app/requirements-docker.txt
RUN pip3 install --no-cache-dir -r /app/requirements-docker.txt && \
    pip3 uninstall -y onnxruntime onnxruntime-gpu && \
    pip3 install --no-cache-dir onnxruntime-gpu==1.19.2 "numpy==1.26.4"

# Копирование исходного кода приложения и статических файлов
COPY web_app.py /app/web_app.py
COPY static /app/static
COPY entrypoint.sh /app/entrypoint.sh
COPY download_models.sh /app/download_models.sh

RUN chmod +x /app/entrypoint.sh /app/download_models.sh && \
    mkdir -p /app/uploads /app/outputs /app/models /root/.insightface/models

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:7860/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
