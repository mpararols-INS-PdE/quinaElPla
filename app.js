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
  const themeToggle = document.getElementById('theme-toggle');

  const cells = new Map();

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
  resetBtn.addEventListener('click', resetGame);
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      drawNumber();
    }
  });

  initTheme();
  updateStats();

  // Extreu un número aleatori i actualitza estat/UI
  function drawNumber() {
    if (remaining.length === 0) {
      drawBtn.disabled = true;
      drawBtn.textContent = 'Tots els numeros trets';
      current.textContent = 'Fi';
      return;
    }

    const idx = Math.floor(Math.random() * remaining.length);
    const num = remaining.splice(idx, 1)[0];
    drawn.push(num);

    current.textContent = num;
    const cell = cells.get(num);
    if (cell) {
      cell.classList.add('drawn');
    }

    updateStats();

    if (remaining.length === 0) {
      drawBtn.textContent = 'Tots els numeros trets';
    }
  }

  // Reinicia la partida
  function resetGame() {
    remaining = [...numbers];
    drawn = [];
    current.textContent = '--';
    drawBtn.disabled = false;
    drawBtn.textContent = 'Treure numero';

    cells.forEach((cell) => cell.classList.remove('drawn'));
    updateStats();
  }

  function updateStats() {
    remainingLabel.textContent = `Restants: ${remaining.length}`;
    drawnLabel.textContent = `Trets: ${drawn.length}`;
  }

  // Inicialitza i commuta el tema (clar/fosc)
  function initTheme() {
    if (!themeToggle) return;
    const THEME_KEY = 'quina-theme';
    const saved = getStoredTheme(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(initial);
    setStoredTheme(THEME_KEY, initial);

    themeToggle.addEventListener('click', () => {
      const next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
      applyTheme(next);
      setStoredTheme(THEME_KEY, next);
    });
  }

  function applyTheme(mode) {
    const isLight = mode === 'light';
    document.body.classList.toggle('theme-light', isLight);
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    }
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
