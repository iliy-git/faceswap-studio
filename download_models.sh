#!/usr/bin/env bash
# ==============================================================================
# download_models.sh – Автоматическая загрузка моделей для FaceSwap AI Studio
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/models"
mkdir -p "$MODELS_DIR"

echo "=== Проверка и загрузка нейросетевых моделей FaceSwap ==="

# 1. inswapper_128.onnx (основная модель замены лица)
if [ ! -f "${MODELS_DIR}/inswapper_128.onnx" ]; then
    echo "[*] Загрузка inswapper_128.onnx (530 MB)..."
    curl -L -C - -o "${MODELS_DIR}/inswapper_128.onnx" \
        https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128.onnx
else
    echo "[✓] inswapper_128.onnx уже присутствует."
fi

# 2. codeformer.onnx (восстановление деталей и Ultra-HD резкости)
if [ ! -f "${MODELS_DIR}/codeformer.onnx" ]; then
    echo "[*] Загрузка codeformer.onnx (360 MB)..."
    curl -L -C - -o "${MODELS_DIR}/codeformer.onnx" \
        https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/codeformer.onnx
else
    echo "[✓] codeformer.onnx уже присутствует."
fi

# 3. bisenet_resnet_34.onnx (маска сегментации лица)
if [ ! -f "${MODELS_DIR}/bisenet_resnet_34.onnx" ]; then
    echo "[*] Загрузка bisenet_resnet_34.onnx (90 MB)..."
    curl -L -C - -o "${MODELS_DIR}/bisenet_resnet_34.onnx" \
        https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/bisenet_resnet_34.onnx
else
    echo "[✓] bisenet_resnet_34.onnx уже присутствует."
fi

# 4. buffalo_l (набор InsightFace для детекции и landmark)
BUFFALO_DIR="${MODELS_DIR}/buffalo_l"
if [ ! -f "${BUFFALO_DIR}/w600k_r50.onnx" ] || [ ! -f "${BUFFALO_DIR}/det_10g.onnx" ]; then
    echo "[*] Загрузка набора buffalo_l (326 MB)..."
    mkdir -p "$BUFFALO_DIR"
    curl -L -o "${MODELS_DIR}/buffalo_l.zip" \
        https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
    unzip -q -o "${MODELS_DIR}/buffalo_l.zip" -d "$BUFFALO_DIR"
    rm -f "${MODELS_DIR}/buffalo_l.zip"
    echo "[✓] buffalo_l успешно распакован."
else
    echo "[✓] buffalo_l уже присутствует."
fi

echo "=== [✓] Все модели готовы к работе! ==="
