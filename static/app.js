document.addEventListener('DOMContentLoaded', () => {
  // Elements: Photo slot
  const photoDropzone = document.getElementById('photo-dropzone');
  const photoInput = document.getElementById('photo-input');
  const photoEmpty = document.getElementById('photo-empty');
  const photoPreviewWrap = document.getElementById('photo-preview-wrap');
  const photoPreviewImg = document.getElementById('photo-preview-img');
  const photoName = document.getElementById('photo-name');
  const photoClearBtn = document.getElementById('photo-clear-btn');

  // Elements: Multi-Photo / 3D-Scan slot
  const photoMultiWrap = document.getElementById('photo-multi-wrap');
  const multiGrid = document.getElementById('multi-grid');
  const multiGridCount = document.getElementById('multi-grid-count');
  const multiPhotoName = document.getElementById('multi-photo-name');
  const multiClearBtn = document.getElementById('multi-clear-btn');
  const btnOpenWebcam = document.getElementById('btn-open-webcam');

  // Elements: Video slot
  const videoDropzone = document.getElementById('video-dropzone');
  const videoInput = document.getElementById('video-input');
  const videoEmpty = document.getElementById('video-empty');
  const videoPreviewWrap = document.getElementById('video-preview-wrap');
  const videoPreviewEl = document.getElementById('video-preview-el');
  const videoName = document.getElementById('video-name');
  const videoClearBtn = document.getElementById('video-clear-btn');

  // Elements: Actions & Sections
  const uploadSection = document.getElementById('upload-section');
  const settingsSection = document.getElementById('settings-section');
  const actionSection = document.getElementById('action-section');
  const btnGenerate = document.getElementById('btn-generate');
  const actionNote = document.getElementById('action-note');

  // Elements: Settings & Toggles
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsBody = document.getElementById('settings-body');
  const settingsChevron = document.getElementById('settings-chevron');
  const settingsActivePill = document.getElementById('settings-active-pill');
  const toggleCodeformer = document.getElementById('toggle-codeformer');
  const toggleBisenet = document.getElementById('toggle-bisenet');
  const toggleStabilization = document.getElementById('toggle-stabilization');
  const toggleDonorHair = document.getElementById('toggle-donor-hair');
  const toggleRemoveMustache = document.getElementById('toggle-remove-mustache');
  const toggleUltraIdentity = document.getElementById('toggle-ultra-identity');
  const presetTurbo = document.getElementById('preset-turbo');
  const presetQuality = document.getElementById('preset-quality');
  const speedHintText = document.getElementById('speed-hint-text');
  const speedIndicatorDot = document.querySelector('.speed-indicator-dot');

  // Elements: Progress
  const progressSection = document.getElementById('progress-section');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const metricFrames = document.getElementById('metric-frames');
  const metricFps = document.getElementById('metric-fps');
  const metricEta = document.getElementById('metric-eta');

  // Elements: Result
  const resultSection = document.getElementById('result-section');
  const resultPlayer = document.getElementById('result-player');
  const btnDownload = document.getElementById('btn-download');
  const btnDownloadText = document.getElementById('btn-download-text');
  const btnOpenTab = document.getElementById('btn-open-tab');
  const btnReset = document.getElementById('btn-reset');
  let activeCompletedJobId = null;

  // Elements: Face ID 3D Biometric Scan Modal
  const webcamModal = document.getElementById('webcam-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const webcamVideo = document.getElementById('webcam-video');
  const webcamCanvas = document.getElementById('webcam-canvas');
  const faceidStage = document.getElementById('faceid-stage');
  const faceidTicksGroup = document.getElementById('faceid-ticks-group');
  const faceidPulseRing = document.getElementById('faceid-pulse-ring');
  const faceidSuccessOverlay = document.getElementById('faceid-success-overlay');
  const faceidMainPrompt = document.getElementById('faceid-main-prompt');
  const faceidSubPrompt = document.getElementById('faceid-sub-prompt');
  const faceidProgressText = document.getElementById('faceid-progress-text');
  const faceidStrip = document.getElementById('faceid-strip');
  const cameraFlash = document.getElementById('camera-flash');
  const cameraErrorOverlay = document.getElementById('camera-error-overlay');
  const cameraErrorTitle = document.getElementById('camera-error-title');
  const cameraErrorDesc = document.getElementById('camera-error-desc');
  const btnRetryCam = document.getElementById('btn-retry-cam');
  const btnStartScan = document.getElementById('btn-start-scan');
  const btnScanCancel = document.getElementById('btn-scan-cancel');
  const btnScanRetake = document.getElementById('btn-scan-retake');
  const btnApplyScan = document.getElementById('btn-apply-scan');
  const faceidCardContent = document.getElementById('faceid-card-content');
  const multiGridWrap = document.getElementById('multi-grid-wrap');
  const btnErrSwitchHttps = document.getElementById('btn-err-switch-https');
  const sensorAnglesPill = document.getElementById('sensor-angles-pill');

  // Mode Tabs & Alternative Selfie Video Elements
  const tabWebcamMode = document.getElementById('tab-webcam-mode');
  const tabVideoMode = document.getElementById('tab-video-mode');
  const videoScanViewport = document.getElementById('video-scan-viewport');
  const selfieVideoInput = document.getElementById('selfie-video-input');
  const btnPickSelfieVideo = document.getElementById('btn-pick-selfie-video');
  const selfieVideoPreview = document.getElementById('selfie-video-preview');
  const videoExtractLoading = document.getElementById('video-extract-loading');
  const btnErrSelfieVideo = document.getElementById('btn-err-selfie-video');
  const scanFallbackPhotosInput = document.getElementById('scan-fallback-photos-input');
  const btnErrPhotos = document.getElementById('btn-err-photos');
  const btnToggleChromeGuide = document.getElementById('btn-toggle-chrome-guide');
  const chromeGuideBox = document.getElementById('chrome-guide-box');
  const codeSiteUrl = document.getElementById('code-site-url');
  const btnCopyFlag = document.getElementById('btn-copy-flag');
  const btnCopyUrl = document.getElementById('btn-copy-url');

  // State
  let selectedPhotoFiles = []; // Array of File objects
  let selectedVideoFile = null;
  let progressInterval = null;
  let currentJobId = null;

  // Webcam & Face ID State
  let webcamStream = null;
  let isScanningActive = false;
  let capturedScanFrames = []; // Array of { blob, dataUrl, label, filename }
  const TOTAL_TICKS = 40;

  // Face ID 8-Sector Circular Sweep
  const FACEID_SECTORS = [
    { id: 'top', ticksEnd: 5, prompt: 'Приподнимите подбородок вверх', sub: 'Смотрите вверх, удерживая лицо в круге', label: 'Вверх', filename: 'faceid_1_up.jpg', waitMs: 900 },
    { id: 'top-right', ticksEnd: 10, prompt: 'Поверните лицо вправо-вверх', sub: 'Плавно описывайте круг головой', label: 'Вправо-Вверх', filename: 'faceid_2_up_right.jpg', waitMs: 900 },
    { id: 'right', ticksEnd: 15, prompt: 'Поверните лицо вправо', sub: 'Продолжайте движение по кругу', label: 'Вправо', filename: 'faceid_3_right.jpg', waitMs: 900 },
    { id: 'bottom-right', ticksEnd: 20, prompt: 'Поверните лицо вправо-вниз', sub: 'Удерживайте плавный поворот', label: 'Вправо-Вниз', filename: 'faceid_4_down_right.jpg', waitMs: 900 },
    { id: 'bottom', ticksEnd: 25, prompt: 'Наклоните лицо вниз', sub: 'Немного опустите подбородок', label: 'Вниз', filename: 'faceid_5_down.jpg', waitMs: 900 },
    { id: 'bottom-left', ticksEnd: 30, prompt: 'Поверните лицо влево-вниз', sub: 'Круг почти завершён!', label: 'Влево-Вниз', filename: 'faceid_6_down_left.jpg', waitMs: 900 },
    { id: 'left', ticksEnd: 35, prompt: 'Поверните лицо влево', sub: 'Завершаем круговой обход', label: 'Влево', filename: 'faceid_7_left.jpg', waitMs: 900 },
    { id: 'center', ticksEnd: 40, prompt: 'Посмотрите прямо в центр круга', sub: 'Фиксация прямого ракурса!', label: 'Центр', filename: 'faceid_0_center.jpg', waitMs: 800 }
  ];

  // HTTPS Banner detection
  const httpsAlertBanner = document.getElementById('https-alert-banner');
  const btnBannerHttps = document.getElementById('btn-banner-https');
  if (window.location.protocol === 'http:') {
    if (httpsAlertBanner) httpsAlertBanner.classList.remove('hidden');
    if (btnBannerHttps) {
      const host = window.location.hostname || '87.232.123.225';
      const port = window.location.port ? `:${window.location.port}` : ':7860';
      btnBannerHttps.href = `https://${host}${port}/`;
    }
  }

  // Settings Collapsible Accordion Logic
  if (settingsToggleBtn && settingsBody && settingsSection) {
    settingsToggleBtn.addEventListener('click', (e) => {
      // Don't toggle when clicking the preset buttons inside the header
      if (e.target.closest('#presets-pill-group') || e.target.closest('.preset-btn')) return;
      const isHidden = settingsBody.classList.contains('hidden');
      if (isHidden) {
        settingsBody.classList.remove('hidden');
        settingsSection.classList.remove('collapsed');
      } else {
        settingsBody.classList.add('hidden');
        settingsSection.classList.add('collapsed');
      }
    });
  }

  // Settings & Speed Presets Logic
  function updateSpeedHint() {
    const cf = toggleCodeformer ? toggleCodeformer.checked : false;
    const bis = toggleBisenet ? toggleBisenet.checked : true;
    const stab = toggleStabilization ? toggleStabilization.checked : false;
    const hair = toggleDonorHair ? toggleDonorHair.checked : false;
    const ultra = toggleUltraIdentity ? toggleUltraIdentity.checked : true;

    if (hair) {
      if (speedHintText) speedHintText.textContent = '💇 Режим Full Head: замена лица + причёски донора • Скорость ~8–10 к/с';
      if (speedIndicatorDot) speedIndicatorDot.className = 'speed-indicator-dot';
      if (settingsActivePill) {
        settingsActivePill.textContent = '💇 Full Head • Волосы (~8–10 к/с)';
        settingsActivePill.style.color = '#34d399';
        settingsActivePill.style.borderColor = 'rgba(52, 211, 153, 0.3)';
      }
    } else if (!cf && !stab && ultra) {
      if (speedHintText) speedHintText.textContent = '⚡ Режим: Турбо + Максимальное сходство (90%+ Sim) • Скорость ~14–16 к/с';
      if (speedIndicatorDot) speedIndicatorDot.className = 'speed-indicator-dot turbo';
      if (settingsActivePill) {
        settingsActivePill.textContent = '⚡ Турбо • Макс. сходство (~15 к/с)';
        settingsActivePill.style.color = '#38bdf8';
        settingsActivePill.style.borderColor = 'rgba(56, 189, 248, 0.3)';
      }
    } else if (!cf && !stab) {
      if (speedHintText) speedHintText.textContent = '⚡ Режим: Турбо • Скорость ~15–18 к/с (мгновенный рендер)';
      if (speedIndicatorDot) speedIndicatorDot.className = 'speed-indicator-dot turbo';
      if (settingsActivePill) {
        settingsActivePill.textContent = '⚡ Турбо • Быстрый рендер (~18 к/с)';
        settingsActivePill.style.color = '#38bdf8';
        settingsActivePill.style.borderColor = 'rgba(56, 189, 248, 0.3)';
      }
    } else {
      if (speedHintText) speedHintText.textContent = '💎 Режим максимального качества • Скорость ~2.5 к/с (детализация пор)';
      if (speedIndicatorDot) speedIndicatorDot.className = 'speed-indicator-dot';
      if (settingsActivePill) {
        settingsActivePill.textContent = '💎 Кино HD • Детализация кожи (~2.5 к/с)';
        settingsActivePill.style.color = '#c084fc';
        settingsActivePill.style.borderColor = 'rgba(192, 132, 252, 0.3)';
      }
    }

    if (presetTurbo && presetQuality) {
      if (!cf && !stab && !hair) {
        presetTurbo.classList.add('active');
        presetQuality.classList.remove('active');
      } else if (cf && bis && stab && !hair) {
        presetQuality.classList.add('active');
        presetTurbo.classList.remove('active');
      } else {
        presetQuality.classList.remove('active');
        presetTurbo.classList.remove('active');
      }
    }
  }

  if (presetTurbo) {
    presetTurbo.addEventListener('click', () => {
      if (toggleCodeformer) toggleCodeformer.checked = false;
      if (toggleStabilization) toggleStabilization.checked = false;
      if (toggleBisenet) toggleBisenet.checked = true;
      if (toggleUltraIdentity) toggleUltraIdentity.checked = true;
      if (toggleDonorHair) toggleDonorHair.checked = false;
      updateSpeedHint();
    });
  }

  if (presetQuality) {
    presetQuality.addEventListener('click', () => {
      if (toggleCodeformer) toggleCodeformer.checked = true;
      if (toggleBisenet) toggleBisenet.checked = true;
      if (toggleStabilization) toggleStabilization.checked = true;
      if (toggleUltraIdentity) toggleUltraIdentity.checked = true;
      updateSpeedHint();
    });
  }

  [toggleCodeformer, toggleBisenet, toggleStabilization, toggleDonorHair].forEach(el => {
    if (el) el.addEventListener('change', updateSpeedHint);
  });
  updateSpeedHint();

  // 1. Photo Slot Logic (Files & Multi-Files)
  photoDropzone.addEventListener('click', (e) => {
    if (e.target.closest('#photo-clear-btn') || e.target.closest('#multi-clear-btn')) return;
    photoInput.click();
  });

  photoInput.addEventListener('change', () => {
    if (photoInput.files && photoInput.files.length > 0) {
      handlePhotosSelected(Array.from(photoInput.files));
    }
  });

  setupDragAndDrop(photoDropzone, (files) => {
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    if (imgFiles.length > 0) {
      handlePhotosSelected(imgFiles);
    } else {
      alert('Пожалуйста, выберите файл изображения (JPG, PNG, WEBP).');
    }
  });

  function handlePhotosSelected(files) {
    selectedPhotoFiles = files;

    if (files.length === 1) {
      // Single Photo Mode
      const file = files[0];
      photoName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        photoPreviewImg.src = e.target.result;
        photoEmpty.classList.add('hidden');
        photoMultiWrap.classList.add('hidden');
        photoPreviewWrap.classList.remove('hidden');
        photoDropzone.classList.add('has-file');
        updateGenerateButtonState();
      };
      reader.readAsDataURL(file);
    } else {
      // Multi-Photo Mode
      renderMultiPhotoPreview(files, `${files.length} фото`);
    }
  }

  function renderMultiPhotoPreview(files, titleText, isFaceId = false) {
    const isFaceIdScan = isFaceId || (titleText && titleText.includes('Face ID'));

    if (isFaceIdScan) {
      if (multiGridWrap) multiGridWrap.classList.add('hidden');
      if (faceidCardContent) faceidCardContent.classList.remove('hidden');
      multiPhotoName.textContent = 'Face ID 3D-слепок';
    } else {
      if (faceidCardContent) faceidCardContent.classList.add('hidden');
      if (multiGridWrap) multiGridWrap.classList.remove('hidden');
      multiGrid.innerHTML = '';
      multiGridCount.textContent = `${files.length} ракурсов`;
      multiPhotoName.textContent = titleText || `Объёмный слепок (${files.length} фото)`;

      files.slice(0, 6).forEach((file, idx) => {
        const cell = document.createElement('div');
        cell.className = 'multi-thumb-cell';
        const img = document.createElement('img');
        const tag = document.createElement('span');
        tag.className = 'multi-thumb-tag';
        tag.textContent = `#${idx + 1}`;

        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        cell.appendChild(img);
        cell.appendChild(tag);
        multiGrid.appendChild(cell);
      });
    }

    photoEmpty.classList.add('hidden');
    photoPreviewWrap.classList.add('hidden');
    photoMultiWrap.classList.remove('hidden');
    photoDropzone.classList.add('has-file');
    updateGenerateButtonState();
  }

  function clearAllPhotos() {
    selectedPhotoFiles = [];
    photoInput.value = '';
    photoPreviewImg.src = '';
    multiGrid.innerHTML = '';
    if (faceidCardContent) faceidCardContent.classList.add('hidden');
    if (multiGridWrap) multiGridWrap.classList.remove('hidden');
    photoPreviewWrap.classList.add('hidden');
    photoMultiWrap.classList.add('hidden');
    photoEmpty.classList.remove('hidden');
    photoDropzone.classList.remove('has-file');
    updateGenerateButtonState();
  }

  photoClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearAllPhotos();
  });

  multiClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearAllPhotos();
  });

  // 2. Video Slot Logic
  videoDropzone.addEventListener('click', (e) => {
    if (e.target.closest('#video-clear-btn')) return;
    videoInput.click();
  });

  videoInput.addEventListener('change', () => {
    if (videoInput.files && videoInput.files[0]) {
      handleVideoSelected(videoInput.files[0]);
    }
  });

  setupDragAndDrop(videoDropzone, (files) => {
    const vid = files.find(f => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(f.name));
    if (vid) {
      handleVideoSelected(vid);
    } else {
      alert('Пожалуйста, выберите видеофайл (MP4, MOV, WEBM).');
    }
  });

  function handleVideoSelected(file) {
    selectedVideoFile = file;
    videoName.textContent = `${file.name} (${formatFileSize(file.size)})`;
    const objectUrl = URL.createObjectURL(file);
    videoPreviewEl.src = objectUrl;
    videoPreviewEl.load();
    videoEmpty.classList.add('hidden');
    videoPreviewWrap.classList.remove('hidden');
    videoDropzone.classList.add('has-file');
    updateGenerateButtonState();
  }

  videoClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedVideoFile = null;
    videoInput.value = '';
    videoPreviewEl.pause();
    videoPreviewEl.removeAttribute('src');
    videoPreviewEl.load();
    videoPreviewWrap.classList.add('hidden');
    videoEmpty.classList.remove('hidden');
    videoDropzone.classList.remove('has-file');
    updateGenerateButtonState();
  });

  // 3. Helper: Drag & Drop setup
  function setupDragAndDrop(dropzoneEl, onFilesDrop) {
    dropzoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneEl.classList.add('dragover');
    });

    dropzoneEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('dragover');
    });

    dropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesDrop(Array.from(e.dataTransfer.files));
      }
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  function updateGenerateButtonState() {
    const hasPhoto = selectedPhotoFiles && selectedPhotoFiles.length > 0;
    const hasVideo = Boolean(selectedVideoFile);
    const ready = hasPhoto && hasVideo;
    btnGenerate.disabled = !ready;

    if (ready) {
      actionNote.textContent = 'Всё готово! Нажмите кнопку выше для запуска генерации';
      actionNote.style.color = '#38bdf8';
    } else if (!hasPhoto && !hasVideo) {
      actionNote.textContent = 'Выберите фото (или сделайте 3D-скан) и видео, чтобы запустить генерацию';
      actionNote.style.color = '';
    } else if (!hasPhoto) {
      actionNote.textContent = 'Осталось предоставить фото лица или сделать 3D-скан';
      actionNote.style.color = '';
    } else {
      actionNote.textContent = 'Осталось загрузить целевое видео';
      actionNote.style.color = '';
    }
  }

  // =========================================================================
  // 4. 3D Face Scan (Webcam) Logic
  // =========================================================================

  btnOpenWebcam.addEventListener('click', (e) => {
    e.stopPropagation();
    openWebcamModal();
  });

  modalCloseBtn.addEventListener('click', closeWebcamModal);
  btnScanCancel.addEventListener('click', closeWebcamModal);

  // Build 40 Radial SVG Ticks for Apple Face ID
  function buildFaceIdTicks() {
    if (!faceidTicksGroup) return;
    faceidTicksGroup.innerHTML = '';
    const numTicks = TOTAL_TICKS;
    const cx = 170, cy = 170;
    const r1 = 135, r2 = 149;

    for (let i = 0; i < numTicks; i++) {
      // 0 degrees starts at the top (12 o'clock)
      const angle = (i / numTicks) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r1 * Math.cos(angle);
      const y1 = cy + r1 * Math.sin(angle);
      const x2 = cx + r2 * Math.cos(angle);
      const y2 = cy + r2 * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('class', 'faceid-tick');
      line.setAttribute('id', `faceid-tick-${i}`);
      faceidTicksGroup.appendChild(line);
    }
  }

  // High-tech Biometric Tick Sound during Face ID rotation sweep (Web Audio API)
  function playFaceIdTickSound(freq = 520) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  // Soft Apple Face ID Success Chime (Web Audio API)
  function playFaceIdChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Tone 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2: A5 (880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.1);
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.55);
    } catch (e) {
      console.warn('Audio chime blocked or unavailable:', e);
    }
  }

  async function openWebcamModal() {
    webcamModal.classList.remove('hidden');
    buildFaceIdTicks();
    resetScanModalState();

    if (codeSiteUrl) {
      codeSiteUrl.textContent = window.location.origin;
    }

    switchScanMode('webcam');
  }

  function closeWebcamModal() {
    stopCamera();
    webcamModal.classList.add('hidden');
  }

  // Switch between live webcam and video-selfie upload
  function switchScanMode(mode) {
    if (mode === 'webcam') {
      tabWebcamMode.classList.add('active');
      tabVideoMode.classList.remove('active');
      videoScanViewport.classList.add('hidden');
      initCamera();
    } else {
      tabVideoMode.classList.add('active');
      tabWebcamMode.classList.remove('active');
      stopCamera();
      cameraErrorOverlay.classList.add('hidden');
      videoScanViewport.classList.remove('hidden');
      btnStartScan.classList.add('hidden');
    }
  }

  if (tabWebcamMode) tabWebcamMode.addEventListener('click', () => switchScanMode('webcam'));
  if (tabVideoMode) tabVideoMode.addEventListener('click', () => switchScanMode('video'));

  // Video Selfie File Trigger
  if (btnPickSelfieVideo) {
    btnPickSelfieVideo.addEventListener('click', () => selfieVideoInput.click());
  }
  if (btnErrSelfieVideo) {
    btnErrSelfieVideo.addEventListener('click', () => {
      switchScanMode('video');
      selfieVideoInput.click();
    });
  }

  if (selfieVideoInput) {
    selfieVideoInput.addEventListener('change', () => {
      if (selfieVideoInput.files && selfieVideoInput.files[0]) {
        processSelfieVideoFile(selfieVideoInput.files[0]);
      }
    });
  }

  // Fallback Photos File Trigger
  if (btnErrPhotos) {
    btnErrPhotos.addEventListener('click', () => scanFallbackPhotosInput.click());
  }
  if (scanFallbackPhotosInput) {
    scanFallbackPhotosInput.addEventListener('change', () => {
      if (scanFallbackPhotosInput.files && scanFallbackPhotosInput.files.length > 0) {
        processFallbackPhotos(Array.from(scanFallbackPhotosInput.files));
      }
    });
  }

  // Toggle Chrome Flags Guide
  if (btnToggleChromeGuide) {
    btnToggleChromeGuide.addEventListener('click', () => {
      chromeGuideBox.classList.toggle('hidden');
    });
  }

  if (btnCopyFlag) {
    btnCopyFlag.addEventListener('click', () => {
      navigator.clipboard.writeText('chrome://flags/#unsafely-treat-insecure-origin-as-secure').then(() => {
        btnCopyFlag.textContent = '✓ Скопировано';
        setTimeout(() => btnCopyFlag.textContent = 'Копировать', 2000);
      });
    });
  }

  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.origin).then(() => {
        btnCopyUrl.textContent = '✓ Скопировано';
        setTimeout(() => btnCopyUrl.textContent = 'Копировать', 2000);
      });
    });
  }

  if (btnErrSwitchHttps) {
    btnErrSwitchHttps.addEventListener('click', () => {
      const host = window.location.hostname || '87.232.123.225';
      const port = window.location.port ? `:${window.location.port}` : ':7860';
      window.location.href = `https://${host}${port}/`;
    });
  }

  async function initCamera() {
    cameraErrorOverlay.classList.add('hidden');
    faceidMainPrompt.textContent = 'Вращайте головой, чтобы заполнить круг';
    faceidSubPrompt.textContent = 'Подключение к веб-камере...';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!window.isSecureContext || window.location.protocol === 'http:') {
          throw new Error('Браузер блокирует доступ к камере по обычному HTTP (WebRTC доступен только по HTTPS или на localhost).');
        } else {
          throw new Error('Веб-камера не обнаружена или заблокирована в настройках браузера.');
        }
      }

      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      webcamVideo.srcObject = webcamStream;
      await webcamVideo.play();

      faceidMainPrompt.textContent = 'Вращайте головой, чтобы заполнить круг';
      faceidSubPrompt.textContent = 'Удерживайте лицо в круге и нажмите «Начать сканирование Face ID»';
      btnStartScan.disabled = false;
      btnStartScan.classList.remove('hidden');
    } catch (err) {
      console.warn('Camera error:', err);
      cameraErrorOverlay.classList.remove('hidden');

      if (!window.isSecureContext || window.location.protocol === 'http:') {
        cameraErrorTitle.textContent = 'Требуется защищенное соединение (HTTPS)';
        cameraErrorDesc.textContent = 'Браузеры блокируют камеру (WebRTC) на внешних IP без HTTPS. Нажмите зеленую кнопку ниже, чтобы перейти на версию HTTPS:';
        if (btnErrSwitchHttps) btnErrSwitchHttps.classList.remove('hidden');
      } else {
        cameraErrorTitle.textContent = 'Веб-камера недоступна';
        cameraErrorDesc.textContent = (err && err.name === 'NotAllowedError')
          ? 'Вы отклонили доступ к веб-камере. Нажмите на значок замочка в адресной строке, разрешите камеру и повторите попытку.'
          : `${(err && err.message) || 'Разрешите доступ к веб-камере в настройках браузера'}.`;
        if (btnErrSwitchHttps) btnErrSwitchHttps.classList.add('hidden');
      }
      btnStartScan.disabled = true;
    }
  }

  function stopCamera() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    isScanningActive = false;
  }

  btnRetryCam.addEventListener('click', () => {
    initCamera();
  });

  function resetScanModalState() {
    isScanningActive = false;
    capturedScanFrames = [];
    if (faceidStage) faceidStage.classList.remove('scanning');
    if (faceidSuccessOverlay) faceidSuccessOverlay.classList.add('hidden');
    if (videoExtractLoading) videoExtractLoading.classList.add('hidden');

    if (faceidMainPrompt) faceidMainPrompt.textContent = 'Вращайте головой, чтобы заполнить круг';
    if (faceidSubPrompt) faceidSubPrompt.textContent = 'Удерживайте лицо в круге и нажмите «Начать сканирование Face ID»';
    if (faceidProgressText) faceidProgressText.textContent = 'Круговой скан: 0%';
    if (sensorAnglesPill) {
      sensorAnglesPill.textContent = 'Слепок: 0 / 8 ракурсов';
      sensorAnglesPill.classList.remove('active');
    }

    // Reset ticks
    for (let i = 0; i < TOTAL_TICKS; i++) {
      const tick = document.getElementById(`faceid-tick-${i}`);
      if (tick) tick.classList.remove('active');
    }

    if (faceidPulseRing) {
      faceidPulseRing.style.strokeDashoffset = '892';
    }

    btnStartScan.classList.remove('hidden');
    btnStartScan.disabled = false;
    btnApplyScan.classList.add('hidden');
    btnScanRetake.classList.add('hidden');
  }

  btnScanRetake.addEventListener('click', () => {
    resetScanModalState();
  });

  // Apple Face ID Continuous Guided Sweep (Pure Biometric Depth Scan, No Camera Flash)
  btnStartScan.addEventListener('click', async () => {
    if (isScanningActive) return;
    isScanningActive = true;
    btnStartScan.disabled = true;
    btnStartScan.classList.add('hidden');

    if (faceidStage) faceidStage.classList.add('scanning');

    let currentTick = 0;

    for (let s = 0; s < FACEID_SECTORS.length; s++) {
      if (!isScanningActive) break;

      const sector = FACEID_SECTORS[s];
      faceidMainPrompt.textContent = sector.prompt;
      faceidSubPrompt.textContent = sector.sub;

      // Animate ticks filling up smoothly for this sector
      const targetTick = sector.ticksEnd;
      const ticksToFill = targetTick - currentTick;
      const tickInterval = Math.max(30, Math.floor(sector.waitMs / ticksToFill));

      for (let t = currentTick; t < targetTick; t++) {
        if (!isScanningActive) break;
        const tickEl = document.getElementById(`faceid-tick-${t}`);
        if (tickEl) tickEl.classList.add('active');

        // Play gentle biometric radar tick sound (harmonic ascending frequency)
        const tickFreq = 480 + (t * 9);
        playFaceIdTickSound(tickFreq);

        const pct = Math.round(((t + 1) / TOTAL_TICKS) * 100);
        faceidProgressText.textContent = `Круговой скан: ${pct}%`;

        // Update pulse ring offset (circumference ~ 892)
        if (faceidPulseRing) {
          const offset = 892 - (892 * pct / 100);
          faceidPulseRing.style.strokeDashoffset = String(offset);
        }

        await sleep(tickInterval);
      }
      currentTick = targetTick;

      // Silently capture frame for ArcFace 3D-Fusion (NO flash, NO camera shutter clicks)
      const frameData = await captureWebcamFrame();
      frameData.label = sector.label;
      frameData.filename = sector.filename;
      capturedScanFrames.push(frameData);

      if (sensorAnglesPill) {
        sensorAnglesPill.textContent = `Слепок: ${capturedScanFrames.length} / 8 ракурсов`;
        sensorAnglesPill.classList.add('active');
      }
    }

    if (isScanningActive) {
      finishFaceIdProcess();
    }
  });

  function finishFaceIdProcess() {
    isScanningActive = false;
    if (faceidStage) faceidStage.classList.remove('scanning');

    // Light up all ticks to 100%
    for (let i = 0; i < TOTAL_TICKS; i++) {
      const tick = document.getElementById(`faceid-tick-${i}`);
      if (tick) tick.classList.add('active');
    }
    if (faceidPulseRing) faceidPulseRing.style.strokeDashoffset = '0';
    faceidProgressText.textContent = 'Круговой скан: 100%';

    if (sensorAnglesPill) {
      sensorAnglesPill.textContent = '✓ 8 ракурсов зафиксировано';
      sensorAnglesPill.classList.add('active');
    }

    // Success Overlay & Iconic Sound
    if (faceidSuccessOverlay) faceidSuccessOverlay.classList.remove('hidden');
    playFaceIdChime();

    faceidMainPrompt.textContent = 'Face ID настроен!';
    faceidSubPrompt.textContent = '3D-слепок внешности готов к генерации с максимальным сходством';

    btnStartScan.classList.add('hidden');
    btnScanRetake.classList.remove('hidden');
    btnApplyScan.classList.remove('hidden');
  }

  function addFaceIdThumbnail(frameData) {
    if (!faceidStrip) return;
    const slot = document.createElement('div');
    slot.className = 'faceid-slot captured';
    slot.title = frameData.label;

    const img = document.createElement('img');
    img.src = frameData.dataUrl;
    img.alt = frameData.label;

    slot.appendChild(img);
    faceidStrip.appendChild(slot);
  }

  function triggerFlash() {
    if (!cameraFlash) return;
    cameraFlash.classList.remove('hidden');
    setTimeout(() => {
      cameraFlash.classList.add('hidden');
    }, 180);
  }

  function captureWebcamFrame() {
    return new Promise((resolve) => {
      const vw = webcamVideo.videoWidth || 1280;
      const vh = webcamVideo.videoHeight || 720;
      webcamCanvas.width = vw;
      webcamCanvas.height = vh;
      const ctx = webcamCanvas.getContext('2d');

      // Video is mirrored for user preview, so mirror canvas to match user perspective
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(webcamVideo, 0, 0, vw, vh);

      webcamCanvas.toBlob((blob) => {
        const dataUrl = webcamCanvas.toDataURL('image/jpeg', 0.95);
        resolve({ blob, dataUrl });
      }, 'image/jpeg', 0.95);
    });
  }

  // Automatic Frame Extraction from Selfie-Video (Face ID Mode)
  async function processSelfieVideoFile(videoFile) {
    if (videoExtractLoading) videoExtractLoading.classList.remove('hidden');
    faceidMainPrompt.textContent = 'Анализ кругового селфи-видео...';
    faceidSubPrompt.textContent = 'Извлечение 8 объёмных ракурсов лица для Face ID';
    capturedScanFrames = [];
    if (faceidStrip) faceidStrip.innerHTML = '';

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'auto';
    tempVideo.muted = true;
    tempVideo.playsInline = true;

    const fileUrl = URL.createObjectURL(videoFile);
    tempVideo.src = fileUrl;

    try {
      await new Promise((resolve, reject) => {
        tempVideo.onloadedmetadata = resolve;
        tempVideo.onerror = reject;
      });

      const duration = tempVideo.duration || 3.0;
      const count = FACEID_SECTORS.length;

      for (let i = 0; i < count; i++) {
        const sector = FACEID_SECTORS[i];
        const t = Math.max(0.1, Math.min(duration - 0.1, (duration * (i + 0.5)) / count));
        tempVideo.currentTime = t;

        await new Promise((resolve) => {
          tempVideo.onseeked = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = tempVideo.videoWidth || 720;
        canvas.height = tempVideo.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

        const frameData = {
          blob,
          dataUrl,
          label: sector.label,
          filename: sector.filename
        };
        capturedScanFrames.push(frameData);
        if (sensorAnglesPill) {
          sensorAnglesPill.textContent = `Слепок: ${capturedScanFrames.length} / 8 ракурсов`;
          sensorAnglesPill.classList.add('active');
        }
      }

      URL.revokeObjectURL(fileUrl);
      if (videoExtractLoading) videoExtractLoading.classList.add('hidden');
      finishFaceIdProcess();
    } catch (e) {
      console.error('Failed to process selfie video:', e);
      alert('Не удалось извлечь кадры из видеофайла. Попробуйте другой формат (MP4, MOV, WEBM).');
      if (videoExtractLoading) videoExtractLoading.classList.add('hidden');
    }
  }

  // Direct Fallback Photos (user selects 2–8 photos)
  function processFallbackPhotos(files) {
    capturedScanFrames = [];
    const count = Math.min(files.length, FACEID_SECTORS.length);

    files.slice(0, count).forEach((file, idx) => {
      const sector = FACEID_SECTORS[idx];
      const reader = new FileReader();
      reader.onload = (e) => {
        const frameData = {
          blob: file,
          dataUrl: e.target.result,
          label: sector.label,
          filename: sector.filename
        };
        capturedScanFrames.push(frameData);
        if (sensorAnglesPill) {
          sensorAnglesPill.textContent = `Слепок: ${capturedScanFrames.length} / 8 ракурсов`;
          sensorAnglesPill.classList.add('active');
        }

        if (capturedScanFrames.length === count) {
          finishFaceIdProcess();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  btnApplyScan.addEventListener('click', () => {
    if (capturedScanFrames.length === 0) return;

    // Convert captured blobs into File objects
    const scanFiles = capturedScanFrames.map((item, idx) => {
      return new File([item.blob], item.filename || `faceid_angle_${idx}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
    });

    selectedPhotoFiles = scanFiles;
    closeWebcamModal();
    renderMultiPhotoPreview(scanFiles, '✓ Face ID активен (объёмный 3D-слепок)', true);
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =========================================================================
  // 5. Generate Action
  // =========================================================================

  btnGenerate.addEventListener('click', async () => {
    if (!selectedPhotoFiles || selectedPhotoFiles.length === 0 || !selectedVideoFile) return;

    btnGenerate.disabled = true;
    actionSection.classList.add('hidden');
    uploadSection.style.opacity = '0.5';
    uploadSection.style.pointerEvents = 'none';
    if (settingsSection) {
      settingsSection.style.opacity = '0.5';
      settingsSection.style.pointerEvents = 'none';
    }

    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    progressStatusText.textContent = 'Загрузка файлов на сервер...';
    progressPercent.textContent = '0%';
    progressBarFill.style.width = '0%';
    metricFrames.textContent = '0 / 0';
    metricFps.textContent = '-- к/с';
    metricEta.textContent = '-- сек';

    try {
      const formData = new FormData();
      formData.append('video_mode', 'upload');
      formData.append('use_preset_donor', 'false');
      formData.append('hd_mode', 'vfx_head');
      formData.append('enable_codeformer', toggleCodeformer ? String(toggleCodeformer.checked) : 'false');
      formData.append('enable_bisenet', toggleBisenet ? String(toggleBisenet.checked) : 'true');
      formData.append('enable_stabilization', toggleStabilization ? String(toggleStabilization.checked) : 'false');
      formData.append('transfer_donor_hair', toggleDonorHair ? String(toggleDonorHair.checked) : 'false');
      formData.append('remove_mustache', toggleRemoveMustache ? String(toggleRemoveMustache.checked) : 'false');
      formData.append('ultra_identity', toggleUltraIdentity ? String(toggleUltraIdentity.checked) : 'true');

      // Append all donor photos (single photo or multi-angle 3D scan)
      selectedPhotoFiles.forEach((file) => {
        formData.append('donor_photos', file, file.name);
      });

      formData.append('custom_video', selectedVideoFile);

      const resp = await fetch('/api/start_render', {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Ошибка запуска генерации');
      }

      const data = await resp.json();
      currentJobId = data.job_id;
      localStorage.setItem('active_faceswap_job', currentJobId);
      startProgressPolling(currentJobId);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
      resetStudioState();
    }
  });

  // Кнопка отмены генерации
  const btnCancelRender = document.getElementById('btn-cancel-render');
  if (btnCancelRender) {
    btnCancelRender.addEventListener('click', () => {
      const activeJob = currentJobId || localStorage.getItem('active_faceswap_job');
      if (activeJob) {
        fetch(`/api/cancel/${activeJob}`, { method: 'POST' }).catch(() => {});
      }
      resetStudioState();
    });
  }

  // Автовосстановление при перезагрузке страницы: проверяем наличие активного задания на сервере
  const savedJob = localStorage.getItem('active_faceswap_job');
  if (savedJob) {
    fetch(`/api/progress/${savedJob}`)
      .then(r => {
        if (!r.ok) {
          localStorage.removeItem('active_faceswap_job');
          resetStudioState();
          return null;
        }
        return r.json();
      })
      .then(job => {
        if (!job) return;
        if (job.status === 'completed') {
          localStorage.removeItem('active_faceswap_job');
          onJobCompleted(savedJob);
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          localStorage.removeItem('active_faceswap_job');
          resetStudioState();
        } else {
          // Задание реально выполняется на сервере
          currentJobId = savedJob;
          btnGenerate.disabled = true;
          actionSection.classList.add('hidden');
          uploadSection.style.opacity = '0.5';
          uploadSection.style.pointerEvents = 'none';
          if (settingsSection) {
            settingsSection.style.opacity = '0.5';
            settingsSection.style.pointerEvents = 'none';
          }
          progressSection.classList.remove('hidden');
          startProgressPolling(savedJob);
        }
      })
      .catch(() => {
        localStorage.removeItem('active_faceswap_job');
        resetStudioState();
      });
  }

  // 6. Polling progress
  function startProgressPolling(jobId) {
    if (progressInterval) clearInterval(progressInterval);

    progressInterval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const resp = await fetch(`/api/progress/${jobId}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          if (resp.status === 404) {
            clearInterval(progressInterval);
            localStorage.removeItem('active_faceswap_job');
            resetStudioState();
          }
          return;
        }

        const job = await resp.json();

        progressStatusText.textContent = job.status_text || 'Обработка нейросетями...';
        progressPercent.textContent = `${Math.round(job.percent || 0)}%`;
        progressBarFill.style.width = `${Math.min(100, job.percent || 0)}%`;

        if (job.total_frames > 0) {
          metricFrames.textContent = `${job.current_frame} / ${job.total_frames}`;
        }
        if (job.fps > 0) {
          metricFps.textContent = `${job.fps.toFixed(1)} к/с`;
        }
        if (job.eta_seconds !== undefined) {
          metricEta.textContent = job.eta_seconds > 0 ? `${Math.ceil(job.eta_seconds)} с` : '0 с';
        }

        if (job.status === 'completed') {
          clearInterval(progressInterval);
          localStorage.removeItem('active_faceswap_job');
          onJobCompleted(jobId);
        } else if (job.status === 'failed') {
          clearInterval(progressInterval);
          localStorage.removeItem('active_faceswap_job');
          alert(`Ошибка генерации: ${job.error || 'Неизвестная ошибка'}`);
          resetStudioState();
        } else if (job.status === 'cancelled') {
          clearInterval(progressInterval);
          localStorage.removeItem('active_faceswap_job');
          resetStudioState();
        }
      } catch (e) {
        console.warn('Сетевой лаг при опросе статуса:', e);
      }
    }, 1000);
  }

  function onJobCompleted(jobId) {
    activeCompletedJobId = jobId;
    progressSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    const videoUrl = `/api/video/${jobId}`;
    resultPlayer.src = videoUrl;

    if (btnOpenTab) {
      btnOpenTab.href = videoUrl;
    }

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Reliable Blob-based download (guaranteed to work across all browsers & self-signed HTTPS)
  if (btnDownload) {
    btnDownload.addEventListener('click', async (e) => {
      e.preventDefault();
      const jobId = activeCompletedJobId || currentJobId || localStorage.getItem('active_faceswap_job') || '5a517235';
      const label = btnDownloadText || btnDownload;
      const prevText = label.textContent;
      label.textContent = '⏳ Подготовка скачивания...';

      try {
        const resp = await fetch(`/api/video/${jobId}`);
        if (!resp.ok) throw new Error('Файл ещё не готов или не найден');
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = `faceswap_${jobId}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          window.URL.revokeObjectURL(blobUrl);
          label.textContent = '✓ Загрузка началась';
          setTimeout(() => { label.textContent = prevText; }, 2500);
        }, 1200);
      } catch (err) {
        console.warn('Blob download error:', err);
        window.location.href = `/api/download/${jobId}`;
        label.textContent = prevText;
      }
    });
  }

  // 7. Reset
  btnReset.addEventListener('click', () => {
    resetStudioState();
  });

  function resetStudioState() {
    if (progressInterval) clearInterval(progressInterval);
    localStorage.removeItem('active_faceswap_job');
    currentJobId = null;

    uploadSection.style.opacity = '1';
    uploadSection.style.pointerEvents = 'auto';
    if (settingsSection) {
      settingsSection.style.opacity = '1';
      settingsSection.style.pointerEvents = 'auto';
    }
    actionSection.classList.remove('hidden');
    progressSection.classList.add('hidden');
    resultSection.classList.add('hidden');

    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatusText.textContent = 'Инициализация нейросетей...';
    metricFrames.textContent = '0 / 0';
    metricFps.textContent = '-- к/с';
    metricEta.textContent = '-- сек';

    resultPlayer.pause();
    resultPlayer.removeAttribute('src');
    resultPlayer.load();
    updateGenerateButtonState();
  }
});
