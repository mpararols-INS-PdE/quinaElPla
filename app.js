(() => {
  const TOTAL = 90;
  // Prepara llista de números i estat inicial
  const numbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  let remaining = [...numbers];
  let drawn = [];

  const board = document.getElementById('board');
  const current = document.getElementById('current-number');
  const remainingLabel = document.getElementById('remaining');
  const drawnLabel = document.getElementById('drawn-count');
  const drawBtn = document.getElementById('draw-btn');
  const resetBtn = document.getElementById('reset-btn');
  const menuToggle = document.getElementById('menu-toggle');
  const topMenu = document.getElementById('top-menu');
  const themeAutoInput = document.getElementById('theme-opt-auto');
  const themeDarkInput = document.getElementById('theme-opt-dark');
  const themeLightInput = document.getElementById('theme-opt-light');
  const modeAutoInput = document.getElementById('mode-opt-auto');
  const modeWebcamInput = document.getElementById('mode-opt-webcam');
  const randomPanel = document.getElementById('random-panel');
  const cameraPanel = document.getElementById('camera-panel');
  const camPreview = document.getElementById('cam-preview');
  const camCapture = document.getElementById('cam-capture');
  const startCamBtn = document.getElementById('start-cam-btn');
  const stopCamBtn = document.getElementById('stop-cam-btn');
  const ocrReadBtn = document.getElementById('ocr-read-btn');
  const ocrStatus = document.getElementById('ocr-status');
  const ocrConfirmBtn = document.getElementById('ocr-confirm-btn');
  const ocrAutoMark = document.getElementById('ocr-auto-mark');

  const cells = new Map();
  let cameraStream = null;
  let pendingDetectedNumber = null;
  let readingOcr = false;
  let drawingInProgress = false;
  let drawAnimationTimeout = null;
  let drawAnimationRunId = 0;
  let currentMode = 'random';
  const THEME_KEY = 'quina-theme';
  const MODE_KEY = 'quina-play-mode';
  const OCR_AUTO_MARK_MIN_CONFIDENCE = 72;

  numbers.forEach((num) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = num;
    cell.dataset.number = String(num);
    board.appendChild(cell);
    cells.set(num, cell);
  });

  // Events principals
  drawBtn.addEventListener('click', drawNumber);
  resetBtn.addEventListener('click', requestResetGame);
  menuToggle?.addEventListener('click', toggleTopMenu);
  [themeAutoInput, themeDarkInput, themeLightInput].forEach((input) => {
    input?.addEventListener('change', () => {
      if (input.checked) onThemeToggleClick(input.value);
    });
  });
  [modeAutoInput, modeWebcamInput].forEach((input) => {
    input?.addEventListener('change', () => {
      if (input.checked) setMode(input.value);
    });
  });
  startCamBtn?.addEventListener('click', startCamera);
  stopCamBtn?.addEventListener('click', stopCamera);
  ocrReadBtn?.addEventListener('click', detectNumberFromCamera);
  ocrConfirmBtn?.addEventListener('click', confirmSuggestedNumber);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTopMenu();
      return;
    }

    if (!shouldHandleDrawShortcut(event)) {
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      if (currentMode === 'camera') {
        detectNumberFromCamera();
      } else {
        drawNumber();
      }
    }
  });
  document.addEventListener('click', (event) => {
    if (!topMenu || topMenu.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!topMenu.contains(target) && !menuToggle?.contains(target)) {
      closeTopMenu();
    }
  });
  window.addEventListener('beforeunload', stopCamera);

  initTheme();
  initMode();
  updateStats();

  // Extreu un número aleatori i actualitza estat/UI
  async function drawNumber() {
    if (drawingInProgress || currentMode !== 'random') return;
    if (remaining.length === 0) {
      drawBtn.disabled = true;
      setDrawButtonLabel('Tots els numeros trets');
      current.textContent = 'Fi';
      return;
    }

    drawingInProgress = true;
    drawBtn.disabled = true;

    await playDrawAnimation(2200);

    const idx = Math.floor(Math.random() * remaining.length);
    const num = remaining[idx];
    markDrawnNumber(num);
    drawingInProgress = false;
    if (remaining.length > 0 && currentMode === 'random') {
      drawBtn.disabled = false;
    }
  }

  function markDrawnNumber(num) {
    const numeric = Number(num);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > TOTAL) {
      return false;
    }

    const idx = remaining.indexOf(numeric);
    if (idx === -1) {
      return false;
    }

    remaining.splice(idx, 1);
    drawn.push(numeric);

    current?.classList.remove('is-final');
    current.textContent = numeric;
    if (current) {
      void current.offsetWidth;
      current.classList.add('is-final');
      window.setTimeout(() => {
        current.classList.remove('is-final');
      }, 450);
    }
    const cell = cells.get(numeric);
    if (cell) {
      cell.classList.add('drawn');
    }

    updateStats();

    if (remaining.length === 0) {
      drawBtn.disabled = true;
      setDrawButtonLabel('Tots els numeros trets');
    }

    return true;
  }

  // Reinicia la partida
  function requestResetGame() {
    const shouldReset = window.confirm('Si continues, s\'eliminaran tots els numeros entrats fins ara. Vols continuar?');
    if (!shouldReset) return;
    resetGame();
  }

  function resetGame() {
    closeTopMenu();
    stopDrawAnimation();
    remaining = [...numbers];
    drawn = [];
    current.textContent = '--';
    drawBtn.disabled = false;
    setDrawButtonLabel('Treure numero aleatori');
    pendingDetectedNumber = null;
    updateSuggestionButton();
    if (currentMode === 'camera') {
      setOcrStatus('Partida reiniciada. Torna a llegir el numero del bombo.', 'info');
    } else {
      setOcrStatus('Mode aleatori actiu.', 'info');
    }

    cells.forEach((cell) => cell.classList.remove('drawn'));
    updateStats();
  }

  function updateStats() {
    remainingLabel.textContent = `Restants: ${remaining.length}`;
    drawnLabel.textContent = `Trets: ${drawn.length}`;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setOcrStatus('Aquest navegador no suporta camera.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      cameraStream = stream;
      if (camPreview) {
        camPreview.srcObject = stream;
        await camPreview.play();
      }
      if (startCamBtn) startCamBtn.disabled = true;
      if (stopCamBtn) stopCamBtn.disabled = false;
      if (ocrReadBtn) ocrReadBtn.disabled = false;
      setOcrStatus('Camera activa. Apunta al numero i prem "Llegeix numero".', 'success');
    } catch (err) {
      setOcrStatus('No s\'ha pogut activar la camera. Revisa permisos.', 'error');
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    if (camPreview) {
      camPreview.pause();
      camPreview.srcObject = null;
    }
    if (startCamBtn) startCamBtn.disabled = false;
    if (stopCamBtn) stopCamBtn.disabled = true;
    if (ocrReadBtn) ocrReadBtn.disabled = true;
  }

  function initMode() {
    const storedMode = getStoredTheme(MODE_KEY);
    const initialMode = storedMode === 'camera' ? 'camera' : 'random';
    setMode(initialMode);
  }

  function setMode(mode) {
    const normalized = mode === 'camera' ? 'camera' : 'random';
    currentMode = normalized;
    setStoredTheme(MODE_KEY, normalized);

    const isCameraMode = normalized === 'camera';
    randomPanel?.classList.toggle('hidden-panel', isCameraMode);
    cameraPanel?.classList.toggle('hidden-panel', !isCameraMode);
    updateModeToggleUI(normalized);

    if (isCameraMode) {
      stopDrawAnimation();
      setOcrStatus('Mode bombo + OCR actiu. Inicia camera per llegir numeros.', 'info');
    } else {
      stopCamera();
      pendingDetectedNumber = null;
      updateSuggestionButton();
      setOcrStatus('Mode aleatori actiu.', 'info');
    }

    closeTopMenu();
  }

  async function detectNumberFromCamera() {
    if (readingOcr || !camPreview || !camCapture || !cameraStream) {
      return;
    }
    if (typeof window.Tesseract === 'undefined') {
      setOcrStatus('Llibreria OCR no disponible.', 'error');
      return;
    }

    readingOcr = true;
    if (ocrReadBtn) ocrReadBtn.disabled = true;
    setOcrStatus('Llegint numero...', 'info');

    try {
      const ctx = camCapture.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Canvas no disponible');
      }

      camCapture.width = camPreview.videoWidth || 640;
      camCapture.height = camPreview.videoHeight || 480;
      ctx.drawImage(camPreview, 0, 0, camCapture.width, camCapture.height);

      const roi = createCenterRoiCanvas(camCapture);
      const variants = buildOcrVariants(roi);
      const results = await Promise.all(
        variants.map((variant) =>
          window.Tesseract.recognize(variant.canvas, 'eng', {
            tessedit_pageseg_mode: variant.psm,
            tessedit_char_whitelist: '0123456789',
            preserve_interword_spaces: '0',
            user_defined_dpi: '300',
          })
        )
      );
      const candidate = pickBestCandidate(results, variants);

      if (!candidate) {
        pendingDetectedNumber = null;
        updateSuggestionButton();
        setOcrStatus('No s\'ha detectat cap numero valid (1-90). Torna-ho a provar.', 'warn');
        return;
      }

      const alreadyDrawn = !remaining.includes(candidate.value);
      if (alreadyDrawn) {
        pendingDetectedNumber = null;
        updateSuggestionButton();
        setOcrStatus(`Detectat ${candidate.value}, pero ja ha sortit.`, 'warn');
        return;
      }

      const confidenceText = Number.isFinite(candidate.confidence)
        ? ` (confianca ${Math.round(candidate.confidence)}%)`
        : '';

      if (ocrAutoMark?.checked && candidate.confidence >= OCR_AUTO_MARK_MIN_CONFIDENCE) {
        markDrawnNumber(candidate.value);
        pendingDetectedNumber = null;
        updateSuggestionButton();
        setOcrStatus(`Numero ${candidate.value} marcat automaticament${confidenceText}.`, 'success');
      } else {
        pendingDetectedNumber = candidate.value;
        updateSuggestionButton();
        setOcrStatus(`Suggeriment: ${candidate.value}${confidenceText}. Prem "Marcar numero suggerit".`, 'success');
      }
    } catch (err) {
      pendingDetectedNumber = null;
      updateSuggestionButton();
      setOcrStatus('Error en la lectura OCR. Torna-ho a provar.', 'error');
    } finally {
      readingOcr = false;
      if (ocrReadBtn) ocrReadBtn.disabled = !cameraStream;
    }
  }

  function createCenterRoiCanvas(sourceCanvas) {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const roiW = Math.max(120, Math.floor(srcW * 0.52));
    const roiH = Math.max(90, Math.floor(srcH * 0.38));
    const sx = Math.floor((srcW - roiW) / 2);
    const sy = Math.floor((srcH - roiH) / 2);

    const roiCanvas = document.createElement('canvas');
    roiCanvas.width = 640;
    roiCanvas.height = 320;
    const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
    if (!roiCtx) return sourceCanvas;

    roiCtx.imageSmoothingEnabled = false;
    roiCtx.drawImage(sourceCanvas, sx, sy, roiW, roiH, 0, 0, roiCanvas.width, roiCanvas.height);
    return roiCanvas;
  }

  function buildOcrVariants(baseCanvas) {
    return [
      { canvas: baseCanvas, psm: 8, weight: 1.1 },
      { canvas: createPreprocessedCanvas(baseCanvas, { mode: 'gray' }), psm: 8, weight: 1.2 },
      { canvas: createPreprocessedCanvas(baseCanvas, { mode: 'threshold' }), psm: 7, weight: 1.35 },
      { canvas: createPreprocessedCanvas(baseCanvas, { mode: 'invert-threshold' }), psm: 7, weight: 1.25 },
      { canvas: createPreprocessedCanvas(baseCanvas, { mode: 'strong-threshold' }), psm: 10, weight: 1.0 },
    ];
  }

  function createPreprocessedCanvas(baseCanvas, options) {
    const out = document.createElement('canvas');
    out.width = baseCanvas.width;
    out.height = baseCanvas.height;
    const outCtx = out.getContext('2d', { willReadFrequently: true });
    if (!outCtx) return baseCanvas;

    outCtx.drawImage(baseCanvas, 0, 0);
    const img = outCtx.getImageData(0, 0, out.width, out.height);
    const data = img.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      if (options.mode === 'gray') {
        const enhanced = clamp8((lum - 128) * 1.6 + 128);
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      } else if (options.mode === 'threshold') {
        const bw = lum > 145 ? 255 : 0;
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
      } else if (options.mode === 'invert-threshold') {
        const bw = lum > 150 ? 0 : 255;
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
      } else if (options.mode === 'strong-threshold') {
        const bw = lum > 132 ? 255 : 0;
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
      }
    }

    outCtx.putImageData(img, 0, 0);
    return out;
  }

  function pickBestCandidate(results, variants) {
    const scoreMap = new Map();

    results.forEach((result, idx) => {
      const variant = variants[idx];
      const entries = extractCandidatesFromResult(result?.data);
      entries.forEach((entry) => {
        const key = entry.value;
        const prev = scoreMap.get(key) || { score: 0, topConfidence: 0, hits: 0 };
        const weighted = entry.confidence * variant.weight;
        prev.score += weighted;
        prev.hits += 1;
        prev.topConfidence = Math.max(prev.topConfidence, entry.confidence);
        scoreMap.set(key, prev);
      });
    });

    if (!scoreMap.size) return null;

    let bestValue = null;
    let best = null;
    scoreMap.forEach((meta, value) => {
      if (!best || meta.score > best.score || (meta.score === best.score && meta.topConfidence > best.topConfidence)) {
        bestValue = value;
        best = meta;
      }
    });

    if (!best || !Number.isInteger(bestValue)) return null;
    return {
      value: bestValue,
      confidence: Math.min(99, Math.round(best.topConfidence + Math.min(15, (best.hits - 1) * 7))),
    };
  }

  function extractCandidatesFromResult(data) {
    const candidates = [];
    const words = Array.isArray(data?.words) ? data.words : [];
    words.forEach((word) => {
      const pieces = extractBoundedNumbers(String(word.text || ''));
      const confidence = Number(word.confidence || 0);
      pieces.forEach((value) => {
        candidates.push({ value, confidence: clampConfidence(confidence) });
      });
    });

    extractBoundedNumbers(String(data?.text || '')).forEach((value) => {
      candidates.push({ value, confidence: 40 });
    });

    return candidates;
  }

  function extractBoundedNumbers(text) {
    const digitsOnly = text.replace(/\s+/g, '');
    const found = [];

    const direct = digitsOnly.match(/\d{1,2}/g) || [];
    direct.forEach((chunk) => {
      const value = Number.parseInt(chunk, 10);
      if (Number.isInteger(value) && value >= 1 && value <= 90) {
        found.push(value);
      }
    });

    const regex = /\b([1-9][0-9]?)\b/g;
    let match = regex.exec(text);
    while (match) {
      const value = Number.parseInt(match[1], 10);
      if (value >= 1 && value <= 90) {
        found.push(value);
      }
      match = regex.exec(text);
    }

    return found;
  }

  function clamp8(v) {
    return Math.max(0, Math.min(255, v));
  }

  function clampConfidence(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(99, v));
  }

  function confirmSuggestedNumber() {
    if (!Number.isInteger(pendingDetectedNumber)) {
      setOcrStatus('No hi ha cap numero pendent de confirmar.', 'warn');
      return;
    }

    const ok = markDrawnNumber(pendingDetectedNumber);
    if (!ok) {
      setOcrStatus(`No s\'ha pogut marcar el numero ${pendingDetectedNumber}.`, 'warn');
    } else {
      setOcrStatus(`Numero ${pendingDetectedNumber} marcat correctament.`, 'success');
    }
    pendingDetectedNumber = null;
    updateSuggestionButton();
  }

  function updateSuggestionButton() {
    if (!ocrConfirmBtn) return;
    const hasPending = Number.isInteger(pendingDetectedNumber);
    ocrConfirmBtn.hidden = !hasPending;
    ocrConfirmBtn.disabled = !hasPending;
    if (hasPending) {
      ocrConfirmBtn.textContent = `Marcar numero suggerit (${pendingDetectedNumber})`;
    } else {
      ocrConfirmBtn.textContent = 'Marcar numero suggerit';
    }
  }

  function setOcrStatus(message, tone = 'info') {
    if (!ocrStatus) return;
    ocrStatus.textContent = message;
    ocrStatus.dataset.tone = tone;
  }

  async function playDrawAnimation(durationMs) {
    if (!current) return;
    stopDrawAnimation();
    const runId = ++drawAnimationRunId;
    current.classList.remove('is-final');
    current.classList.add('is-drawing');

    const start = performance.now();
    while (performance.now() - start < durationMs && runId === drawAnimationRunId) {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      const delay = Math.round(55 + (progress * progress * 360));
      const fake = 1 + Math.floor(Math.random() * TOTAL);
      current.textContent = String(fake);
      await new Promise((resolve) => {
        drawAnimationTimeout = window.setTimeout(resolve, delay);
      });
    }

    if (runId !== drawAnimationRunId) return;
    stopDrawAnimation();
  }

  function stopDrawAnimation() {
    drawAnimationRunId += 1;
    if (drawAnimationTimeout) {
      clearTimeout(drawAnimationTimeout);
      drawAnimationTimeout = null;
    }
    current?.classList.remove('is-drawing');
    drawingInProgress = false;
  }

  function setDrawButtonLabel(text) {
    if (!drawBtn) return;
    drawBtn.textContent = text;
  }

  function shouldHandleDrawShortcut(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    const tag = target.tagName;
    if (target.isContentEditable) return false;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') {
      return false;
    }
    return true;
  }

  function toggleTopMenu() {
    if (!topMenu || !menuToggle) return;
    const nextHidden = !topMenu.hidden;
    topMenu.hidden = nextHidden;
    menuToggle.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
  }

  function closeTopMenu() {
    if (!topMenu || !menuToggle) return;
    topMenu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  function onThemeToggleClick(value) {
    const finalValue = value === 'light' || value === 'dark' ? value : 'auto';
    setStoredTheme(THEME_KEY, finalValue);
    applyThemePreference(finalValue);
    updateThemeToggleUI(finalValue);
    closeTopMenu();
  }

  function updateThemeToggleUI(pref) {
    if (themeAutoInput) themeAutoInput.checked = pref === 'auto';
    if (themeDarkInput) themeDarkInput.checked = pref === 'dark';
    if (themeLightInput) themeLightInput.checked = pref === 'light';
  }

  function updateModeToggleUI(mode) {
    if (modeAutoInput) modeAutoInput.checked = mode === 'random';
    if (modeWebcamInput) modeWebcamInput.checked = mode === 'camera';
  }

  // Inicialitza i commuta el tema (clar/fosc)
  function initTheme() {
    const saved = getStoredTheme(THEME_KEY);
    const initial = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'light';
    applyThemePreference(initial);
    setStoredTheme(THEME_KEY, initial);
    updateThemeToggleUI(initial);

    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (media?.addEventListener) {
      media.addEventListener('change', () => {
        const currentPref = getStoredTheme(THEME_KEY) || 'auto';
        if (currentPref === 'auto') {
          applyThemePreference('auto');
        }
      });
    }
  }

  function applyThemePreference(pref) {
    if (pref === 'light' || pref === 'dark') {
      applyTheme(pref);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  function applyTheme(mode) {
    const isLight = mode === 'light';
    document.body.classList.toggle('theme-light', isLight);
  }

  function getStoredTheme(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function setStoredTheme(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      // ignore storage errors
    }
  }
})();
