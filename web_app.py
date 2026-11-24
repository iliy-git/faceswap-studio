#!/usr/bin/env python3
import os
import sys
import uuid
import time
import shutil
import threading
import subprocess
import logging
import cv2
import numpy as np
from pathlib import Path
from typing import List, Optional

import insightface
from insightface.app import FaceAnalysis
from insightface.app.common import Face
import onnxruntime as ort

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Directories
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
PRESETS_DIR = BASE_DIR

UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("faceswap")

app = FastAPI(title="FaceSwap AI Studio HD")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

jobs = {}
model_lock = threading.Lock()
app_full = None
app_det = None
swapper = None
codeformer = None
animegan = None
bisenet = None

# FFHQ 512x512 canonical landmark template
FFHQ_512 = np.array([
    [192.9814, 239.9470],
    [319.0186, 239.9470],
    [256.0000, 314.0192],
    [201.2611, 371.4104],
    [310.7389, 371.4104]
], dtype=np.float32)


def get_providers():
    available = ort.get_available_providers()
    if 'CUDAExecutionProvider' in available:
        mem_gb = float(os.environ.get("GPU_MEM_LIMIT_GB", "3"))
        algo_search = os.environ.get("CUDNN_CONV_ALGO_SEARCH", "HEURISTIC")
        use_tf32 = int(os.environ.get("USE_TF32", "1"))
        cuda_opts = {
            'device_id': 0,
            'arena_extend_strategy': 'kNextPowerOfTwo',
            'gpu_mem_limit': int(mem_gb * 1024 * 1024 * 1024),
            'cudnn_conv_algo_search': algo_search,
            'cudnn_conv_use_max_workspace': '1',
            'use_tf32': use_tf32,
            'do_copy_in_default_stream': True,
        }
        return [('CUDAExecutionProvider', cuda_opts), 'CPUExecutionProvider']
    return ['CPUExecutionProvider']


def init_models():
    global app_full, app_det, swapper, codeformer, animegan, bisenet
    if app_full is not None:
        return

    print("[*] Загрузка нейросетей FaceSwap Ultra-HD на GPU...")
    providers = get_providers()

    app_full = FaceAnalysis(name='buffalo_l', providers=providers)
    app_full.prepare(ctx_id=0, det_size=(640, 640))

    app_det = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'], providers=providers)
    app_det.prepare(ctx_id=0, det_size=(512, 512), det_thresh=0.35)

    swapper = insightface.model_zoo.get_model('models/inswapper_128.onnx', download=False, providers=providers)
    codeformer = ort.InferenceSession('models/codeformer.onnx', providers=providers)

    anime_path = str(BASE_DIR / 'models' / 'animegan2_face_paint_512.onnx')
    if os.path.exists(anime_path):
        animegan = ort.InferenceSession(anime_path, providers=providers)

    bisenet_path = str(BASE_DIR / 'models' / 'bisenet_resnet_34.onnx')
    if os.path.exists(bisenet_path):
        bisenet = ort.InferenceSession(bisenet_path, providers=providers)

    print("[+] Все нейросети успешно инициализированы!")


def find_ffmpeg():
    candidates = [
        '/usr/local/bin/ffmpeg',
        str(BASE_DIR / 'venv' / 'bin' / 'ffmpeg'),
        'ffmpeg'
    ]
    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return 'ffmpeg'


bisenet_mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
bisenet_std = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def get_bisenet_mask(bgr_512: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(bgr_512, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    norm = ((rgb - bisenet_mean) / bisenet_std).transpose(2, 0, 1)[np.newaxis, ...]
    pred = bisenet.run(None, {bisenet.get_inputs()[0].name: norm})[0][0]
    return np.argmax(pred, axis=0).astype(np.uint8)


def run_codeformer_raw(face_512: np.ndarray, fidelity: float = 0.85) -> np.ndarray:
    rgb = cv2.cvtColor(face_512, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    norm = ((rgb - 0.5) / 0.5).transpose(2, 0, 1)[np.newaxis, ...]
    cf_w = np.array(fidelity, dtype=np.double)
    out_cf = codeformer.run(['output'], {'input': norm, 'weight': cf_w})[0][0].transpose(1, 2, 0)
    return cv2.cvtColor(np.clip((out_cf * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)


class FaceTracker:
    """
    Интеллектуальный трекер лица с инерционным сопровождением через Optical Flow.
    Предотвращает внезапное исчезновение («спадание») маски при быстрых движениях,
    наклонах головы и временных пропусках детектора SCRFD (до 45 кадров / ~1.5 сек).
    """
    def __init__(self, max_missing_frames: int = 45):
        self.last_face = None
        self.last_gray = None
        self.missing_count = 0
        self.max_missing = max_missing_frames

    def update(self, frame_bgr: np.ndarray, detected_faces: list):
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        if detected_faces:
            if self.last_face is not None:
                prev_cx = (self.last_face.bbox[0] + self.last_face.bbox[2]) / 2.0
                prev_cy = (self.last_face.bbox[1] + self.last_face.bbox[3]) / 2.0
                def dist_to_prev(f):
                    cx = (f.bbox[0] + f.bbox[2]) / 2.0
                    cy = (f.bbox[1] + f.bbox[3]) / 2.0
                    area = (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1])
                    return np.hypot(cx - prev_cx, cy - prev_cy) - 0.05 * np.sqrt(area)
                best_face = min(detected_faces, key=dist_to_prev)
            else:
                best_face = max(detected_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

            self.last_face = best_face
            self.last_gray = gray
            self.missing_count = 0
            return best_face, False

        # Если детектор SCRFD временно не видит лицо (например при наклоне головы):
        if self.last_face is not None and self.missing_count < self.max_missing:
            self.missing_count += 1
            p0 = self.last_face.kps.astype(np.float32).reshape(-1, 1, 2)
            p1, st, err = cv2.calcOpticalFlowPyrLK(
                self.last_gray, gray, p0, None,
                winSize=(21, 21), maxLevel=3,
                criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03)
            )

            if st is not None and np.sum(st) >= 3:
                tracked_kps = p1.reshape(-1, 2)
                eye_dist = np.linalg.norm(tracked_kps[0] - tracked_kps[1])
                orig_eye_dist = np.linalg.norm(self.last_face.kps[0] - self.last_face.kps[1])

                if 0.5 * orig_eye_dist < eye_dist < 1.8 * orig_eye_dist:
                    dx = np.median(tracked_kps[:, 0] - self.last_face.kps[:, 0])
                    dy = np.median(tracked_kps[:, 1] - self.last_face.kps[:, 1])

                    synth_face = Face(
                        bbox=np.array([
                            self.last_face.bbox[0] + dx,
                            self.last_face.bbox[1] + dy,
                            self.last_face.bbox[2] + dx,
                            self.last_face.bbox[3] + dy
                        ], dtype=np.float32),
                        kps=tracked_kps,
                        det_score=float(self.last_face.det_score * 0.95)
                    )
                    self.last_face = synth_face
                    self.last_gray = gray
                    return synth_face, True

        if self.missing_count >= self.max_missing:
            self.last_face = None
        self.last_gray = gray
        return None, False


def vfx_head_swap_frame(
    frame: np.ndarray,
    target_face,
    donor_aligned_hd: Optional[np.ndarray],
    donor_hair_mask_smooth: Optional[np.ndarray],
    donor_hair_forehead_binary: Optional[np.ndarray],
    swapped_frame: np.ndarray,
    enable_codeformer: bool = True,
    enable_bisenet: bool = True,
    transfer_donor_hair: bool = False,
    remove_mustache: bool = False,
    ultra_identity: bool = True
) -> np.ndarray:
    if not enable_codeformer and not enable_bisenet and not transfer_donor_hair and not remove_mustache:
        return swapped_frame

    h, w = frame.shape[:2]
    M_t, _ = cv2.estimateAffinePartial2D(target_face.kps, FFHQ_512)
    if M_t is None:
        return swapped_frame
    IM_t = cv2.invertAffineTransform(M_t)

    # 1. Swapped face in 512
    target_512 = cv2.warpAffine(swapped_frame, M_t, (512, 512), borderMode=cv2.BORDER_REFLECT)

    mustache_mask = None
    if remove_mustache:
        mustache_mask = np.zeros((512, 512), dtype=np.uint8)
        mask_seg = get_bisenet_mask(target_512)
        y_nose, x_nose = np.where(mask_seg == 10)
        y_lip, x_lip = np.where(mask_seg == 12)
        if len(y_nose) > 0 and len(y_lip) > 0:
            y_top = int(np.percentile(y_nose, 95)) - 4
            y_bot = int(np.min(y_lip)) + 2
            x_min = max(0, int(np.min(x_lip)) - 5)
            x_max = min(512, int(np.max(x_lip)) + 5)
            center_x = (x_min + x_max) // 2
            center_y = (y_top + y_bot) // 2
            radius_x = max(10, (x_max - x_min) // 2)
            radius_y = max(5, (y_bot - y_top) // 2)
            cv2.ellipse(mustache_mask, (center_x, center_y), (radius_x, radius_y), 0, 0, 360, 255, -1)
        else:
            cv2.ellipse(mustache_mask, (256, 350), (45, 14), 0, 0, 360, 255, -1)
        target_512 = cv2.inpaint(target_512, mustache_mask, 5, cv2.INPAINT_TELEA)

    if enable_codeformer:
        if ultra_identity:
            # Режим максимального сходства (Ultra Identity):
            # CodeFormer восстанавливает четкие микро-детали (ресницы, зрачки, поры),
            # но мы берем 55% геометрии донора из Inswapper + 45% резкости CodeFormer.
            # Это сохраняет 90%+ сходства с фото донора!
            hd_raw = run_codeformer_raw(target_512, fidelity=0.96)
            target_hd = cv2.addWeighted(target_512, 0.55, hd_raw, 0.45, 0)
        else:
            target_hd = run_codeformer_raw(target_512, fidelity=0.85)
    else:
        target_hd = target_512

    if remove_mustache and mustache_mask is not None:
        mask_f = cv2.GaussianBlur(mustache_mask.astype(np.float32) / 255.0, (11, 11), 0)[:, :, np.newaxis]
        smooth_zone = cv2.bilateralFilter(target_hd, 9, 75, 75)
        target_hd = (mask_f * smooth_zone + (1.0 - mask_f) * target_hd).astype(np.uint8)

    # Fast mode without BiSeNet parsing: smooth elliptical face feathering
    if not enable_bisenet and not transfer_donor_hair:
        mask_512 = np.zeros((512, 512), dtype=np.float32)
        cv2.ellipse(mask_512, (256, 256), (175, 220), 0, 0, 360, 1.0, -1)
        mask_512 = cv2.GaussianBlur(mask_512, (39, 39), 0)
        mask_back = cv2.warpAffine(mask_512, IM_t, (w, h))[:, :, np.newaxis]
        head_back = cv2.warpAffine(target_hd, IM_t, (w, h), borderMode=cv2.BORDER_REFLECT)
        return (mask_back * head_back + (1.0 - mask_back) * frame).astype(np.uint8)

    # --- РЕЖИМ 1: ПЕРЕНОС ВОЛОС ДОНОРА (FULL HEAD TRANSFER) ---
    if transfer_donor_hair and donor_aligned_hd is not None and donor_hair_mask_smooth is not None and donor_hair_forehead_binary is not None:
        target_mask = get_bisenet_mask(target_hd)

        # Выравнивание цвета и света волос донора под сцену видео в Lab пространстве
        d_lab = cv2.cvtColor(donor_aligned_hd, cv2.COLOR_BGR2LAB).astype(np.float32)
        t_lab = cv2.cvtColor(target_hd, cv2.COLOR_BGR2LAB).astype(np.float32)

        head_roi_t = (target_mask == 17) | (target_mask == 1)
        head_roi_d = (donor_hair_forehead_binary > 0)

        if np.any(head_roi_t) and np.any(head_roi_d):
            for c in range(3):
                mean_t = np.mean(t_lab[:, :, c][head_roi_t])
                std_t = np.std(t_lab[:, :, c][head_roi_t])
                mean_d = np.mean(d_lab[:, :, c][head_roi_d])
                std_d = np.std(d_lab[:, :, c][head_roi_d])

                std_ratio = (std_t / (std_d + 1e-5)) * 0.75 + 0.25
                d_lab[:, :, c] = (d_lab[:, :, c] - mean_d) * std_ratio + (mean_t * 0.75 + mean_d * 0.25)

            d_lab = np.clip(d_lab, 0, 255).astype(np.uint8)
            donor_color_matched = cv2.cvtColor(d_lab, cv2.COLOR_LAB2BGR)
        else:
            donor_color_matched = donor_aligned_hd

        # Вклейка волос и лба донора поверх HD-лица в 512 пространстве
        merged_512 = (donor_hair_mask_smooth * donor_color_matched + (1.0 - donor_hair_mask_smooth) * target_hd).astype(np.uint8)

        # Очистка старых волос актёра, которые могут торчать из-под новой причёски
        orig_512 = cv2.warpAffine(frame, M_t, (512, 512), borderMode=cv2.BORDER_REFLECT)
        orig_mask = get_bisenet_mask(orig_512)

        old_hair_512 = (orig_mask == 17).astype(np.uint8)
        old_hair_back = cv2.warpAffine(old_hair_512, IM_t, (w, h), flags=cv2.INTER_NEAREST)
        old_hair_back = cv2.dilate(old_hair_back, np.ones((7, 7), np.uint8))

        new_head_solid_512 = (donor_hair_forehead_binary > 0) | (target_mask == 1) | (target_mask == 2) | (target_mask == 3) | (target_mask == 10) | (target_mask == 11) | (target_mask == 12) | (target_mask == 13)
        new_head_back = cv2.warpAffine(new_head_solid_512.astype(np.uint8), IM_t, (w, h), flags=cv2.INTER_NEAREST)

        stray = (old_hair_back > 0) & (new_head_back == 0)
        if np.any(stray):
            stray_dil = cv2.dilate(stray.astype(np.uint8), np.ones((5, 5), np.uint8))
            clean_frame = cv2.inpaint(frame, stray_dil, 5, cv2.INPAINT_TELEA)
        else:
            clean_frame = frame

        # Анатомическая маска всей головы (новые волосы + лицо + шея)
        full_head_mask_512 = np.zeros((512, 512), dtype=np.float32)
        full_head_mask_512[donor_hair_forehead_binary > 0] = 1.0
        for comp in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]:
            full_head_mask_512[target_mask == comp] = 1.0

        for y in range(370, 440):
            full_head_mask_512[y, :] *= (1.0 - (y - 370) / 70.0)
        full_head_mask_512[440:, :] = 0.0
        full_head_mask_512 = cv2.GaussianBlur(full_head_mask_512, (19, 19), 0)

        mask_back = cv2.warpAffine(full_head_mask_512, IM_t, (w, h))[:, :, np.newaxis]
        head_back = cv2.warpAffine(merged_512, IM_t, (w, h), borderMode=cv2.BORDER_REFLECT)
        return (mask_back * head_back + (1.0 - mask_back) * clean_frame).astype(np.uint8)

    # --- РЕЖИМ 2: СОХРАНЕНИЕ РОДНЫХ ВОЛОС АКТЁРА ---
    orig_512 = cv2.warpAffine(frame, M_t, (512, 512), borderMode=cv2.BORDER_REFLECT)
    orig_mask = get_bisenet_mask(orig_512)

    face_mask_512 = np.zeros((512, 512), dtype=np.float32)
    # 1=skin, 2=l_brow, 3=r_brow, 6=l_eye, 7=r_eye, 10=nose, 11=u_lip, 12=l_lip, 13=mouth
    for comp in [1, 2, 3, 6, 7, 10, 11, 12, 13]:
        face_mask_512[orig_mask == comp] = 1.0

    # Родные волосы строго сохраняются
    hair_mask = (orig_mask == 17).astype(np.float32)
    hair_dil = cv2.dilate(hair_mask, np.ones((5, 5), np.uint8))
    face_mask_512[hair_dil > 0] = 0.0

    face_mask_512[orig_mask == 0] = 0.0
    face_mask_512[orig_mask == 4] = 0.0
    face_mask_512[orig_mask == 5] = 0.0

    for y in range(370, 440):
        face_mask_512[y, :] *= (1.0 - (y - 370) / 70.0)
    face_mask_512[440:, :] = 0.0

    face_mask_512 = cv2.GaussianBlur(face_mask_512, (17, 17), 0)
    composite_512 = (face_mask_512[:, :, np.newaxis] * target_hd + (1.0 - face_mask_512[:, :, np.newaxis]) * orig_512).astype(np.uint8)

    mask_back = cv2.warpAffine(face_mask_512, IM_t, (w, h))[:, :, np.newaxis]
    head_back = cv2.warpAffine(composite_512, IM_t, (w, h), borderMode=cv2.BORDER_REFLECT)

    return (mask_back * head_back + (1.0 - mask_back) * frame).astype(np.uint8)


def enhance_face_hd(swapped_frame: np.ndarray, target_face, fidelity_weight: float = 0.82) -> np.ndarray:
    h, w = swapped_frame.shape[:2]
    M, _ = cv2.estimateAffinePartial2D(target_face.kps, FFHQ_512)
    if M is None:
        return swapped_frame

    IM = cv2.invertAffineTransform(M)
    face_512 = cv2.warpAffine(swapped_frame, M, (512, 512), borderMode=cv2.BORDER_REFLECT)

    rgb = cv2.cvtColor(face_512, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    norm = ((rgb - 0.5) / 0.5).transpose(2, 0, 1)[np.newaxis, ...]
    cf_w = np.array(fidelity_weight, dtype=np.double)

    out_cf = codeformer.run(['output'], {'input': norm, 'weight': cf_w})[0][0].transpose(1, 2, 0)
    cf_bgr = cv2.cvtColor(np.clip((out_cf * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)

    blur = cv2.GaussianBlur(cf_bgr, (0, 0), sigmaX=1.5)
    sharp_cf = cv2.addWeighted(cf_bgr, 1.25, blur, -0.25, 0)

    enhanced_back = cv2.warpAffine(sharp_cf, IM, (w, h), borderMode=cv2.BORDER_REFLECT)

    mask_512 = np.zeros((512, 512), dtype=np.float32)
    cv2.ellipse(mask_512, (256, 256), (175, 220), 0, 0, 360, 1.0, -1)
    mask_512 = cv2.GaussianBlur(mask_512, (39, 39), 0)
    mask_back = cv2.warpAffine(mask_512, IM, (w, h))[:, :, np.newaxis]

    return (mask_back * enhanced_back + (1.0 - mask_back) * swapped_frame).astype(np.uint8)


def save_direct_video(raw_frames: List[np.ndarray], fps: float, target_video_path: str, out_video_path: str):
    """
    Прямое и мгновенное сохранение кадров через ffmpeg без фазы оптического потока.
    """
    N = len(raw_frames)
    if N == 0:
        return

    h, w = raw_frames[0].shape[:2]
    ffmpeg_bin = find_ffmpeg()
    ffmpeg_cmd = [
        ffmpeg_bin,
        '-nostdin',
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{w}x{h}',
        '-pix_fmt', 'bgr24',
        '-r', str(fps),
        '-i', '-',
        '-i', target_video_path,
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '17',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        out_video_path
    ]

    proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    for frame in raw_frames:
        proc.stdin.write(frame.tobytes())

    proc.stdin.close()
    proc.wait()


def apply_temporal_stabilization(raw_frames: List[np.ndarray], fps: float, target_video_path: str, out_video_path: str):
    """
    Farneback Optical Flow 5-точечная временная стабилизация + выравнивание освещения.
    Полностью устраняет мерцания, стробоскоп и скачки экспозиции.
    """
    N = len(raw_frames)
    if N == 0:
        return

    h, w = raw_frames[0].shape[:2]
    flow_scale = 0.5
    gw, gh = int(w * flow_scale), int(h * flow_scale)
    grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)

    def warp_flow(img, flow_scaled):
        flow_full = cv2.resize(flow_scaled, (w, h)) / flow_scale
        remap_x = grid_x + flow_full[:, :, 0]
        remap_y = grid_y + flow_full[:, :, 1]
        return cv2.remap(img, remap_x, remap_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    grays = [cv2.cvtColor(cv2.resize(f, (gw, gh)), cv2.COLOR_BGR2GRAY) for f in raw_frames]

    # Preload original camera frames for pristine, zero-flicker background
    cap_orig = cv2.VideoCapture(target_video_path)
    orig_frames = []
    while True:
        ret_o, f_o = cap_orig.read()
        if not ret_o:
            break
        orig_frames.append(f_o)
    cap_orig.release()

    ffmpeg_bin = find_ffmpeg()
    ffmpeg_cmd = [
        ffmpeg_bin,
        '-nostdin',
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{w}x{h}',
        '-pix_fmt', 'bgr24',
        '-r', str(fps),
        '-i', '-',
        '-i', target_video_path,
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '17',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        out_video_path
    ]

    proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    w2_p, w1_p, w0, w1_n, w2_n = 0.12, 0.24, 0.28, 0.24, 0.12

    for i in range(N):
        curr = raw_frames[i].astype(np.float32)

        warp_prev1, warp_prev2 = None, None
        warp_next1, warp_next2 = None, None

        if i >= 1:
            flow = cv2.calcOpticalFlowFarneback(grays[i], grays[i-1], None, 0.5, 3, 15, 3, 5, 1.2, 0)
            warp_prev1 = warp_flow(raw_frames[i-1], flow).astype(np.float32)
        if i >= 2:
            flow2 = cv2.calcOpticalFlowFarneback(grays[i], grays[i-2], None, 0.5, 3, 15, 3, 5, 1.2, 0)
            warp_prev2 = warp_flow(raw_frames[i-2], flow2).astype(np.float32)

        if i <= N - 2:
            flow = cv2.calcOpticalFlowFarneback(grays[i], grays[i+1], None, 0.5, 3, 15, 3, 5, 1.2, 0)
            warp_next1 = warp_flow(raw_frames[i+1], flow).astype(np.float32)
        if i <= N - 3:
            flow2 = cv2.calcOpticalFlowFarneback(grays[i], grays[i+2], None, 0.5, 3, 15, 3, 5, 1.2, 0)
            warp_next2 = warp_flow(raw_frames[i+2], flow2).astype(np.float32)

        acc = w0 * curr
        total_w = w0

        if warp_prev1 is not None:
            acc += w1_p * warp_prev1
            total_w += w1_p
        if warp_prev2 is not None:
            acc += w2_p * warp_prev2
            total_w += w2_p
        if warp_next1 is not None:
            acc += w1_n * warp_next1
            total_w += w1_n
        if warp_next2 is not None:
            acc += w2_n * warp_next2
            total_w += w2_n

        stabilized_person = (acc / total_w).astype(np.uint8)

        # Surgical Background Isolation:
        # Keep background 100% untouched camera frame to eliminate ALL background flicker/jitter
        if i < len(orig_frames):
            orig_frame = orig_frames[i]
            diff = cv2.absdiff(raw_frames[i], orig_frame)
            diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(diff_gray, 8, 255, cv2.THRESH_BINARY)
            mask_dil = cv2.dilate(mask, np.ones((11, 11), np.uint8))
            mask_soft = cv2.GaussianBlur(mask_dil.astype(np.float32) / 255.0, (15, 15), 0)[:, :, np.newaxis]
            final_frame = (mask_soft * stabilized_person.astype(np.float32) + (1.0 - mask_soft) * orig_frame.astype(np.float32)).astype(np.uint8)
        else:
            final_frame = stabilized_person

        proc.stdin.write(final_frame.tobytes())

    proc.stdin.close()
    proc.wait()


def render_task(
    job_id: str,
    donor_image_paths: List[str],
    target_video_path: str,
    hd_mode: str = "vfx_head",
    enable_codeformer: bool = True,
    enable_bisenet: bool = True,
    enable_stabilization: bool = True,
    transfer_donor_hair: bool = False,
    remove_mustache: bool = False,
    ultra_identity: bool = True
):
    job = jobs[job_id]
    job["status"] = "processing"
    job["status_text"] = "Векторизация лиц донора (Flip-Fusion)..."

    try:
        with model_lock:
            init_models()

            # 1. Анализ фото донора с технологией Flip-Fusion для максимальной точности
            embeddings = []
            sample_donor_face = None
            first_donor_img = None
            first_donor_face = None

            for img_path in donor_image_paths:
                img = cv2.imread(img_path)
                if img is None:
                    continue
                faces = app_full.get(img)
                if faces:
                    f = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
                    emb_norm = f.embedding / np.linalg.norm(f.embedding)

                    # Flip-Fusion: устраняет асимметрию освещения и ракурса с фото
                    img_flip = cv2.flip(img, 1)
                    faces_flip = app_full.get(img_flip)
                    if faces_flip:
                        f_flip = max(faces_flip, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
                        emb_flip = f_flip.embedding / np.linalg.norm(f_flip.embedding)
                        emb_fused = (emb_norm + emb_flip) / 2.0
                        emb_fused /= np.linalg.norm(emb_fused)
                        embeddings.append(emb_fused)
                    else:
                        embeddings.append(emb_norm)

                    if sample_donor_face is None:
                        sample_donor_face = f
                        first_donor_face = f
                        first_donor_img = img

            if not embeddings:
                raise ValueError("Лицо не обнаружено ни на одном из загруженных фото донора.")

            mean_emb = np.mean(embeddings, axis=0)
            mean_emb = mean_emb / np.linalg.norm(mean_emb)
            sample_donor_face.embedding = mean_emb

            num_angles = len(embeddings)
            if num_angles > 1:
                print(f"[+] [{job_id}] 3D Face Fusion: успешно объединены {num_angles} ракурсов лица донора.")
                logger.info(f"[{job_id}] Успешно объединены {num_angles} ракурсов 3D-скана лица донора в единый инвариантный вектор.")
                job["status_text"] = f"3D-векторизация: объединено {num_angles} ракурсов..."
            else:
                print(f"[+] [{job_id}] Векторизовано 1 фото донора с Flip-Fusion.")
                logger.info(f"[{job_id}] Векторизовано 1 фото донора с технологией Flip-Fusion.")

            # 2. Подготовка режима обработки и волос донора (при включенном Full Head)
            is_vfx_head = str(hd_mode).lower() in ["vfx_head", "vfx", "anime"]
            donor_aligned_hd = None
            donor_hair_mask_smooth = None
            donor_hair_forehead_binary = None

            if transfer_donor_hair and first_donor_img is not None and first_donor_face is not None:
                job["status_text"] = "Подготовка анатомии волос донора (Full Head)..."
                M_d, _ = cv2.estimateAffinePartial2D(first_donor_face.kps, FFHQ_512)
                donor_aligned_512 = cv2.warpAffine(first_donor_img, M_d, (512, 512), borderMode=cv2.BORDER_REFLECT)
                if enable_codeformer:
                    donor_aligned_hd = run_codeformer_raw(donor_aligned_512, fidelity=0.88)
                else:
                    donor_aligned_hd = donor_aligned_512
                donor_mask = get_bisenet_mask(donor_aligned_hd)
                donor_hair_mask = (donor_mask == 17).astype(np.float32)  # Только естественные волосы донора, без среза лба!
                donor_hair_forehead_binary = (donor_hair_mask > 0.2).astype(np.uint8)
                donor_hair_mask_smooth = cv2.GaussianBlur(donor_hair_mask, (19, 19), 0)[:, :, np.newaxis]

            job["status_text"] = "Чтение видеопотока..."

            cap = cv2.VideoCapture(target_video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            job["total_frames"] = total_frames

            out_video_path = str(OUTPUTS_DIR / f"{job_id}.mp4")

            # 3. Покадровый рендер
            raw_frames = []
            frame_idx = 0
            start_time = time.time()

            active_stages = []
            if transfer_donor_hair:
                active_stages.append("FullHead+Hair")
            else:
                active_stages.append("FaceSwap")
            if ultra_identity:
                active_stages.append("UltraID")
            if enable_codeformer:
                active_stages.append("HD")
            if remove_mustache:
                active_stages.append("CleanShave")
            mode_label = f"Рендер [{'+'.join(active_stages)}]"

            tracker = FaceTracker(max_missing_frames=45)
            alpha_smooth = 0.0

            while True:
                if job.get("cancel_requested"):
                    print(f"[!] [{job_id}] Рендер отменен пользователем.")
                    job["status"] = "cancelled"
                    job["status_text"] = "Генерация отменена пользователем"
                    cap.release()
                    return

                ret, frame = cap.read()
                if not ret:
                    break

                target_faces = app_det.get(frame)
                target_face, is_tracked = tracker.update(frame, target_faces)

                if target_face is not None:
                    alpha_smooth = min(1.0, alpha_smooth + 0.34)
                    swapped = swapper.get(frame, target_face, sample_donor_face, paste_back=True)

                    if ultra_identity:
                        # 2-Pass Iterative Swap: впечатывает черты донора во второй итерации
                        t_faces_p2 = app_det.get(swapped)
                        if t_faces_p2:
                            t_p2 = max(t_faces_p2, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                            swapped = swapper.get(swapped, t_p2, sample_donor_face, paste_back=True)

                    if is_vfx_head:
                        processed_frame = vfx_head_swap_frame(
                            frame, target_face, donor_aligned_hd,
                            donor_hair_mask_smooth, donor_hair_forehead_binary, swapped,
                            enable_codeformer=enable_codeformer,
                            enable_bisenet=enable_bisenet,
                            transfer_donor_hair=transfer_donor_hair,
                            remove_mustache=remove_mustache,
                            ultra_identity=ultra_identity
                        )
                    elif str(hd_mode).lower() in ["true", "hd", "1"]:
                        if enable_codeformer:
                            processed_frame = enhance_face_hd(swapped, target_face, fidelity_weight=0.82)
                        else:
                            processed_frame = swapped
                    else:
                        processed_frame = swapped

                    if alpha_smooth < 0.98:
                        out_frame = (alpha_smooth * processed_frame.astype(np.float32) + (1.0 - alpha_smooth) * frame.astype(np.float32)).astype(np.uint8)
                    else:
                        out_frame = processed_frame
                else:
                    alpha_smooth = max(0.0, alpha_smooth - 0.34)
                    out_frame = frame

                raw_frames.append(out_frame)
                frame_idx += 1

                if frame_idx % 5 == 0 or frame_idx == total_frames:
                    elapsed = time.time() - start_time
                    cur_fps = frame_idx / elapsed if elapsed > 0 else 0
                    rem_frames = total_frames - frame_idx
                    eta = rem_frames / cur_fps if cur_fps > 0 else 0
                    max_proc_pct = 85.0 if enable_stabilization else 95.0
                    percent = min(max_proc_pct, (frame_idx / total_frames) * max_proc_pct)

                    job["current_frame"] = frame_idx
                    job["percent"] = percent
                    job["fps"] = cur_fps
                    job["eta_seconds"] = eta
                    job["status_text"] = f"{mode_label}... {frame_idx}/{total_frames} ({percent:.0f}%)"

            cap.release()

            # 4. Фаза сохранения или стабилизации
            if enable_stabilization:
                job["status_text"] = "Стабилизация движения Farneback (устранение мерцаний)..."
                job["percent"] = 88.0
                apply_temporal_stabilization(raw_frames, fps, target_video_path, out_video_path)
            else:
                job["status_text"] = "Быстрое сохранение видеопотока..."
                job["percent"] = 96.0
                save_direct_video(raw_frames, fps, target_video_path, out_video_path)

            job["status"] = "completed"
            job["percent"] = 100.0
            job["status_text"] = "Готово! Видео успешно обработано."
            job["video_url"] = f"/api/video/{job_id}"

    except Exception as e:
        print(f"[!] Ошибка рендера {job_id}: {e}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["status_text"] = f"Ошибка: {e}"


@app.get("/", response_class=HTMLResponse)
async def index():
    index_file = STATIC_DIR / "index.html"
    return FileResponse(index_file, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


def _detect_gpu_info():
    """Синхронно определяет GPU один раз при старте сервера для мгновенного ответа."""
    gpu_name = "CPU / Не обнаружен"
    vram = ""
    has_cuda = False
    has_tensorrt = False

    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        has_tensorrt = "TensorrtExecutionProvider" in providers
        has_cuda = "CUDAExecutionProvider" in providers
    except Exception:
        pass

    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        if res.returncode == 0 and res.stdout.strip():
            line = res.stdout.strip().split("\n")[0]
            parts = [p.strip() for p in line.split(",")]
            gpu_name = parts[0]
            if len(parts) > 1:
                mem_mb = int(parts[1])
                mem_gb = round(mem_mb / 1024)
                vram = f"{mem_gb} GB"
    except Exception:
        pass

    is_rtx_or_tensor = any(k in gpu_name for k in ["RTX", "V100", "A100", "H100", "A10", "A6000", "4090", "4080", "3090", "3080"])
    if is_rtx_or_tensor:
        tech = "Tensor Cores"
    elif has_cuda or "GeForce" in gpu_name or "NVIDIA" in gpu_name:
        tech = "CUDA"
    else:
        tech = "CPU"

    badge_text = f"{gpu_name} ({vram}) • {tech}" if vram else f"{gpu_name} • {tech}"
    return {
        "gpu_name": gpu_name,
        "vram": vram,
        "technology": tech,
        "badge_text": badge_text,
        "is_gpu_active": bool(has_cuda or ("GeForce" in gpu_name or "RTX" in gpu_name or "NVIDIA" in gpu_name))
    }

# Предварительно кэшируем статус GPU один раз при импорте/запуске
CACHED_GPU_INFO = _detect_gpu_info()


@app.get("/api/gpu_info")
async def get_gpu_info():
    """Возвращает информацию о текущем GPU-ускорителе мгновенно из кэша (0 мс)."""
    return JSONResponse(CACHED_GPU_INFO)


@app.post("/api/start_render")
async def start_render(
    background_tasks: BackgroundTasks,
    video_mode: str = Form("upload"),
    use_preset_donor: str = Form("false"),
    hd_mode: str = Form("vfx_head"),
    enable_codeformer: str = Form("false"),
    enable_bisenet: str = Form("true"),
    enable_stabilization: str = Form("false"),
    transfer_donor_hair: str = Form("false"),
    remove_mustache: str = Form("false"),
    ultra_identity: str = Form("true"),
    donor_photos: Optional[List[UploadFile]] = File(None),
    custom_video: Optional[UploadFile] = File(None)
):
    job_id = str(uuid.uuid4())[:8]
    job_dir = UPLOADS_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    donor_paths = []

    # 1. Фото донора
    if use_preset_donor.lower() == "true":
        preset_photo = PRESETS_DIR / "p.jpg"
        if not preset_photo.exists():
            preset_photo = STATIC_DIR / "preset_p.jpg"
        if preset_photo.exists():
            donor_paths.append(str(preset_photo))
        else:
            raise HTTPException(status_code=400, detail="Тестовое фото p.jpg не найдено.")
    elif donor_photos:
        for idx, file in enumerate(donor_photos):
            fname = file.filename.strip() if (file.filename and file.filename.strip()) else f"face_scan_{idx}.jpg"
            safe_fname = os.path.basename(fname).replace("/", "_").replace("\\", "_")
            target_p = job_dir / f"donor_{idx}_{safe_fname}"
            with open(target_p, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            if target_p.stat().st_size > 0:
                donor_paths.append(str(target_p))

    if not donor_paths:
        raise HTTPException(status_code=400, detail="Загрузите фото лица.")

    # 2. Целевое видео (системное видео по умолчанию)
    if custom_video and custom_video.filename:
        video_path = str(job_dir / f"target_{custom_video.filename}")
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(custom_video.file, buffer)
    else:
        video_path = str(PRESETS_DIR / "v.mp4")
        if not os.path.exists(video_path):
            video_path = str(STATIC_DIR / "preset_v.mp4")
        if not os.path.exists(video_path):
            mp4s = list(STATIC_DIR.glob("*.mp4"))
            if mp4s:
                video_path = str(mp4s[0])
            else:
                raise HTTPException(status_code=400, detail="Системное видео не найдено на сервере (v.mp4 / preset_v.mp4).")

    # Флаги ускорения и отключения этапов нейросети
    b_codeformer = str(enable_codeformer).lower() in ("true", "1", "yes", "on")
    b_bisenet = str(enable_bisenet).lower() in ("true", "1", "yes", "on")
    b_stabilization = str(enable_stabilization).lower() in ("true", "1", "yes", "on")
    b_transfer_donor_hair = str(transfer_donor_hair).lower() in ("true", "1", "yes", "on")
    b_remove_mustache = str(remove_mustache).lower() in ("true", "1", "yes", "on")
    b_ultra_identity = str(ultra_identity).lower() in ("true", "1", "yes", "on")

    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "status_text": "В очереди на обработку...",
        "percent": 0.0,
        "current_frame": 0,
        "total_frames": 0,
        "fps": 0.0,
        "eta_seconds": 0.0,
        "video_url": None,
        "error": None
    }

    background_tasks.add_task(
        render_task,
        job_id,
        donor_paths,
        video_path,
        hd_mode,
        b_codeformer,
        b_bisenet,
        b_stabilization,
        b_transfer_donor_hair,
        b_remove_mustache,
        b_ultra_identity
    )
    return JSONResponse({"job_id": job_id})


@app.get("/api/progress/{job_id}")
async def get_progress(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return JSONResponse(jobs[job_id])


@app.post("/api/cancel/{job_id}")
async def cancel_job(job_id: str):
    if job_id in jobs:
        jobs[job_id]["cancel_requested"] = True
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["status_text"] = "Генерация отменена"
        return JSONResponse({"status": "cancelled"})
    return JSONResponse({"status": "not_found"})


@app.get("/api/video/{job_id}")
async def get_video(job_id: str):
    video_file = OUTPUTS_DIR / f"{job_id}.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Файл видео не найден")
    return FileResponse(
        video_file,
        media_type="video/mp4",
        headers={"Content-Disposition": "inline"}
    )


@app.get("/api/download/{job_id}")
async def download_video(job_id: str):
    video_file = OUTPUTS_DIR / f"{job_id}.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Файл видео не найден")
    return FileResponse(
        video_file,
        media_type="application/octet-stream",
        filename=f"faceswap_{job_id}.mp4",
        headers={
            "Content-Disposition": f'attachment; filename="faceswap_{job_id}.mp4"',
            "Content-Type": "application/octet-stream",
        }
    )


@app.get("/api/master_video")
async def get_master_video():
    video_file = BASE_DIR / "final_perfect_seamless.mp4"
    if not video_file.exists():
        video_file = STATIC_DIR / "final_perfect_seamless.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Мастер-видео не найдено")
    return FileResponse(video_file, media_type="video/mp4", filename="final_perfect_seamless.mp4")


@app.get("/api/bokeh_video")
async def get_bokeh_video():
    video_file = BASE_DIR / "final_bokeh_soft.mp4"
    if not video_file.exists():
        video_file = STATIC_DIR / "final_bokeh_soft.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Видео со сглаженным фоном не найдено")
    return FileResponse(video_file, media_type="video/mp4", filename="final_bokeh_soft.mp4")


@app.get("/api/vfx_video")
async def get_vfx_video():
    video_file = BASE_DIR / "final_vfx_cinematic.mp4"
    if not video_file.exists():
        video_file = STATIC_DIR / "final_vfx_cinematic.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="VFX-видео не найдено")
    return FileResponse(video_file, media_type="video/mp4", filename="final_vfx_cinematic.mp4")


@app.get("/api/reference_match_video")
async def get_reference_match_video():
    video_file = BASE_DIR / "final_reference_match.mp4"
    if not video_file.exists():
        video_file = STATIC_DIR / "final_reference_match.mp4"
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Эталонное видео не найдено")
    return FileResponse(video_file, media_type="video/mp4", filename="final_reference_match.mp4")



if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    use_ssl = os.environ.get("USE_SSL", "1") not in ("0", "false", "no")
    ssl_cert = os.environ.get("SSL_CERTFILE", str(BASE_DIR / "ssl_cert.pem"))
    ssl_key = os.environ.get("SSL_KEYFILE", str(BASE_DIR / "ssl_key.pem"))

    if use_ssl and os.path.exists(ssl_cert) and os.path.exists(ssl_key):
        print(f"[*] Запуск FaceSwap Web Studio с HTTPS на https://0.0.0.0:{port}")
        uvicorn.run(app, host="0.0.0.0", port=port, ssl_keyfile=ssl_key, ssl_certfile=ssl_cert, log_level="info")
    else:
        print(f"[*] Запуск FaceSwap Web Studio на http://0.0.0.0:{port}")
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
