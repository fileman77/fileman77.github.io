(() => {
  const canvas = document.querySelector('#game-board');
  const overlay = document.querySelector('#game-overlay');
  const overlayTitle = document.querySelector('#game-title');
  const overlayMessage = document.querySelector('#game-message');
  const startButton = document.querySelector('#start-button');
  const pauseButton = document.querySelector('#pause-button');
  const status = document.querySelector('#game-status');
  const scoreElement = document.querySelector('#score');
  const timeElement = document.querySelector('#survival-time');
  const highScoreElement = document.querySelector('#high-score');
  const directionButtons = document.querySelectorAll('[data-direction]');

  if (!canvas || !overlay || !startButton) return;

  const context = canvas.getContext('2d');
  const gridSize = 24;
  const cellSize = canvas.width / gridSize;
  const baseTickMs = 150;
  const enemyCount = 3;
  const explosionRadius = 2;
  const minimumSpawnDistance = 5;
  const explosionDurationMs = 2000;
  const explosionMinMs = 5000;
  const explosionMaxMs = 9000;
  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  let state = 'idle';
  let snake = [];
  let food = null;
  let enemies = [];
  let direction = directions.right;
  let queuedDirection = direction;
  let loopId = null;
  let survivalTimerId = null;
  let startedAt = 0;
  let survivalSeconds = 0;
  let score = 0;
  let speedMultiplier = 1;
  let nextExplosionAt = 0;
  let explosionEndsAt = 0;
  let highScore = readHighScore();

  highScoreElement.textContent = String(highScore);
  drawScene();

  function readHighScore() {
    try { return Number(localStorage.getItem('looptest-high-score')) || 0; } catch { return 0; }
  }

  function saveHighScore() {
    if (score <= highScore) return;
    highScore = score;
    highScoreElement.textContent = String(highScore);
    try { localStorage.setItem('looptest-high-score', String(highScore)); } catch { /* storage may be unavailable */ }
  }

  function randomCell() {
    return { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function isOccupied(cell) {
    return snake.some((part) => part.x === cell.x && part.y === cell.y) || enemies.some((enemy) => enemy.x === cell.x && enemy.y === cell.y);
  }

  function placeFood() {
    let candidate = randomCell();
    for (let attempt = 0; attempt < 100 && isOccupied(candidate); attempt += 1) candidate = randomCell();
    food = candidate;
  }

  function spawnEnemy() {
    let candidate = randomCell();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const tooCloseToEnemy = enemies.some((enemy) => distance(candidate, enemy) < minimumSpawnDistance);
      if (!isOccupied(candidate) && distance(candidate, snake[0]) >= minimumSpawnDistance && !tooCloseToEnemy) break;
      candidate = randomCell();
    }
    const options = [directions.up, directions.down, directions.left, directions.right];
    const selected = options[Math.floor(Math.random() * options.length)];
    return { ...candidate, dx: selected.x, dy: selected.y, exploding: false };
  }

  function resetGame() {
    snake = [{ x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) }];
    direction = directions.right;
    queuedDirection = direction;
    score = 0;
    speedMultiplier = 1;
    survivalSeconds = 0;
    startedAt = Date.now();
    enemies = [];
    for (let index = 0; index < enemyCount; index += 1) enemies.push(spawnEnemy());
    placeFood();
    scheduleExplosion();
    updateHud();
    drawScene();
  }

  function startGame() {
    stopTimers();
    resetGame();
    state = 'running';
    overlay.hidden = true;
    pauseButton.disabled = false;
    pauseButton.textContent = '일시정지';
    status.textContent = '게임 진행 중입니다.';
    startTimers();
  }

  function stopTimers() {
    if (loopId !== null) { clearInterval(loopId); loopId = null; }
    if (survivalTimerId !== null) { clearInterval(survivalTimerId); survivalTimerId = null; }
  }

  function startTimers() {
    stopTimers();
    scheduleNextTick();
    survivalTimerId = window.setInterval(updateSurvival, 1000);
  }

  function scheduleNextTick() {
    if (state !== 'running') return;
    loopId = window.setTimeout(() => {
      tick();
      scheduleNextTick();
    }, Math.max(50, baseTickMs / speedMultiplier));
  }

  function updateSurvival() {
    if (state !== 'running') return;
    survivalSeconds = Math.floor((Date.now() - startedAt) / 1000);
    speedMultiplier = 1 + Math.floor(survivalSeconds / 60) * 0.1;
    timeElement.textContent = formatTime(survivalSeconds);
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function scheduleExplosion() { nextExplosionAt = Date.now() + explosionMinMs + Math.random() * (explosionMaxMs - explosionMinMs); }

  function tick() {
    if (state !== 'running') return;
    applyQueuedDirection();
    moveSnake();
    moveEnemies();
    updateExplosionState();
    if (hasCollision()) { endGame('충돌했습니다.'); return; }
    if (food && snake[0].x === food.x && snake[0].y === food.y) { score += 10; placeFood(); updateHud(); }
    drawScene();
  }

  function applyQueuedDirection() { direction = queuedDirection; }

  function moveSnake() {
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    snake.unshift(head);
    if (!food || head.x !== food.x || head.y !== food.y) snake.pop();
  }

  function moveEnemies() {
    enemies.forEach((enemy) => {
      if (enemy.exploding) return;
      let next = { x: enemy.x + enemy.dx, y: enemy.y + enemy.dy };
      if (next.x < 0 || next.x >= gridSize || next.y < 0 || next.y >= gridSize || Math.random() < 0.12) {
        const options = [directions.up, directions.down, directions.left, directions.right];
        const selected = options[Math.floor(Math.random() * options.length)];
        enemy.dx = selected.x;
        enemy.dy = selected.y;
        next = { x: enemy.x + enemy.dx, y: enemy.y + enemy.dy };
      }
      if (next.x >= 0 && next.x < gridSize && next.y >= 0 && next.y < gridSize) { enemy.x = next.x; enemy.y = next.y; }
    });
  }

  function updateExplosionState() {
    const now = Date.now();
    if (now >= nextExplosionAt && explosionEndsAt === 0) {
      enemies.forEach((enemy) => { enemy.exploding = true; });
      explosionEndsAt = now + explosionDurationMs;
      status.textContent = '적들이 동시에 폭발합니다. 가까이 가지 마세요.';
    }
    if (explosionEndsAt !== 0 && now >= explosionEndsAt) {
      enemies = [];
      for (let index = 0; index < enemyCount; index += 1) enemies.push(spawnEnemy());
      explosionEndsAt = 0;
      scheduleExplosion();
    }
  }

  function hasCollision() {
    const head = snake[0];
    if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) return true;
    if (snake.slice(1).some((part) => part.x === head.x && part.y === head.y)) return true;
    return enemies.some((enemy) => distance(head, enemy) <= (enemy.exploding ? explosionRadius : 0.75));
  }

  function endGame(reason) {
    state = 'gameover';
    stopTimers();
    saveHighScore();
    pauseButton.disabled = true;
    overlayTitle.textContent = '게임 오버';
    overlayMessage.textContent = `${reason} 점수 ${score}점 · 생존 시간 ${formatTime(survivalSeconds)}`;
    startButton.textContent = '다시 시작';
    overlay.hidden = false;
    status.textContent = '게임이 종료되었습니다.';
    drawScene();
  }

  function togglePause() {
    if (state === 'running') { stopTimers(); state = 'paused'; pauseButton.textContent = '계속하기'; status.textContent = '일시정지 상태입니다.'; overlayTitle.textContent = '일시정지'; overlayMessage.textContent = '계속하기를 눌러 게임을 이어가세요.'; startButton.textContent = '계속하기'; overlay.hidden = false; }
    else if (state === 'paused') { state = 'running'; overlay.hidden = true; pauseButton.textContent = '일시정지'; status.textContent = '게임 진행 중입니다.'; startTimers(); }
  }

  function setDirection(name) {
    const next = directions[name];
    if (!next || (next.x + direction.x === 0 && next.y + direction.y === 0)) return;
    queuedDirection = next;
  }

  function updateHud() { scoreElement.textContent = String(score); timeElement.textContent = formatTime(survivalSeconds); highScoreElement.textContent = String(highScore); }

  function drawCell(cell, color, radius = 3) { context.fillStyle = color; context.beginPath(); context.roundRect(cell.x * cellSize + 2, cell.y * cellSize + 2, cellSize - 4, cellSize - 4, radius); context.fill(); }

  function drawFood(cell) {
    const centerX = (cell.x + 0.5) * cellSize;
    const centerY = (cell.y + 0.56) * cellSize;
    context.save();
    context.fillStyle = '#f85149';
    context.beginPath();
    context.arc(centerX - 3, centerY, cellSize * 0.24, 0, Math.PI * 2);
    context.arc(centerX + 3, centerY, cellSize * 0.24, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#8b949e';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX, centerY - 5);
    context.lineTo(centerX + 1, centerY - 9);
    context.stroke();
    context.fillStyle = '#2ea043';
    context.beginPath();
    context.ellipse(centerX + 5, centerY - 8, 4, 2, -0.35, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawScene() {
    context.fillStyle = '#0d1117'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(240,246,252,.06)'; context.lineWidth = 1;
    for (let index = 1; index < gridSize; index += 1) { context.beginPath(); context.moveTo(index * cellSize, 0); context.lineTo(index * cellSize, canvas.height); context.stroke(); context.beginPath(); context.moveTo(0, index * cellSize); context.lineTo(canvas.width, index * cellSize); context.stroke(); }
    if (food) drawFood(food);
    enemies.forEach((enemy) => { drawCell(enemy, enemy.exploding ? '#ff7b72' : '#d29922', enemy.exploding ? 10 : 5); if (enemy.exploding) { context.strokeStyle = '#ff7b72'; context.beginPath(); context.arc((enemy.x + .5) * cellSize, (enemy.y + .5) * cellSize, explosionRadius * cellSize, 0, Math.PI * 2); context.stroke(); } });
    snake.forEach((part, index) => drawCell(part, index === 0 ? '#2ea043' : '#56d364', 5));
  }

  document.addEventListener('keydown', (event) => {
    const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    const physicalKeys = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
    const pressedDirection = keys[event.key] || physicalKeys[event.code];
    if (pressedDirection) { event.preventDefault(); setDirection(pressedDirection); }
    if (event.key === ' ' && (state === 'running' || state === 'paused')) { event.preventDefault(); togglePause(); }
  });
  directionButtons.forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.direction)));
  startButton.addEventListener('click', () => { if (state === 'paused') { togglePause(); } else { startGame(); } });
  pauseButton.addEventListener('click', togglePause);
})();
