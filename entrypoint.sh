#!/usr/bin/env bash
set -e

echo "============================================================"
echo "   FaceSwap AI Studio: Контейнер инициализирован"
echo "============================================================"

# 1. Привязка buffalo_l моделей для InsightFace
mkdir -p /root/.insightface/models
if [ -d "/app/models/buffalo_l" ]; then
    if [ ! -e "/root/.insightface/models/buffalo_l" ]; then
        echo "[*] Привязка buffalo_l из /app/models/buffalo_l в /root/.insightface/models/buffalo_l..."
        ln -s /app/models/buffalo_l /root/.insightface/models/buffalo_l
    fi
    echo "[✓] InsightFace buffalo_l готов."
else
    echo "[!] ПРЕДУПРЕЖДЕНИЕ: Папка /app/models/buffalo_l не найдена в томах!"
fi

# 2. Проверка ключевых моделей (скачивание если отсутствуют)
if [ ! -f "/app/models/inswapper_128.onnx" ] && [ -f "/app/download_models.sh" ]; then
    echo "[*] Модели не найдены, запуск автоматической загрузки..."
    bash /app/download_models.sh
fi

for model in inswapper_128.onnx codeformer.onnx bisenet_resnet_34.onnx; do
    if [ -f "/app/models/$model" ]; then
        echo "[✓] Модель $model обнаружена."
    else
        echo "[!] ПРЕДУПРЕЖДЕНИЕ: /app/models/$model не найдена!"
    fi
done

# 3. Настройка путей динамических библиотек для CUDA/cuDNN
SITE_PACKAGES=$(python3 -c "import site; print(site.getsitepackages()[0])" 2>/dev/null || echo "/usr/local/lib/python3.10/dist-packages")
if [ -d "${SITE_PACKAGES}/nvidia" ]; then
    export LD_LIBRARY_PATH="${SITE_PACKAGES}/nvidia/cublas/lib:${SITE_PACKAGES}/nvidia/cudnn/lib:${SITE_PACKAGES}/nvidia/cuda_runtime/lib:${SITE_PACKAGES}/nvidia/cuda_nvrtc/lib:${SITE_PACKAGES}/nvidia/curand/lib:${SITE_PACKAGES}/nvidia/cufft/lib:${SITE_PACKAGES}/nvidia/nvjitlink/lib:/usr/local/cuda/lib64:${LD_LIBRARY_PATH}"
fi

# 4. Проверка GPU и провайдеров ONNX Runtime
echo "[*] Проверка GPU и Execution Providers..."
python3 -c "
import onnxruntime as ort
providers = ort.get_available_providers()
print('Доступные провайдеры ONNX Runtime:', providers)
if 'CUDAExecutionProvider' in providers:
    print('[✓] CUDAExecutionProvider активен и готов к работе с RTX 4090!')
else:
    print('[!] ВНИМАНИЕ: CUDAExecutionProvider не найден, вычисления пойдут на CPU!')
" || true

# 5. Обработка SSL
USE_SSL="${USE_SSL:-0}"
export USE_SSL
if [ "$USE_SSL" = "1" ]; then
    SSL_CERT="${SSL_CERTFILE:-/app/ssl_cert.pem}"
    SSL_KEY="${SSL_KEYFILE:-/app/ssl_key.pem}"
    if [ ! -f "$SSL_CERT" ] || [ ! -f "$SSL_KEY" ]; then
        echo "[*] Создание локального самоподписанного SSL сертификата..."
        openssl req -x509 -nodes -days 730 -newkey rsa:2048 \
            -keyout "$SSL_KEY" \
            -out "$SSL_CERT" \
            -subj "/C=RU/ST=Moscow/L=Moscow/O=FaceSwap/CN=localhost" 2>/dev/null
        chmod 600 "$SSL_KEY"
    fi
    export SSL_CERTFILE="$SSL_CERT"
    export SSL_KEYFILE="$SSL_KEY"
    echo "[*] Web Studio запускается по протоколу HTTPS на порту ${PORT:-7860}"
else
    echo "[*] Web Studio запускается по протоколу HTTP на порту ${PORT:-7860}"
fi

cd /app
exec python3 -u /app/web_app.py
