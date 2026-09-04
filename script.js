(() => {
  "use strict";

  const COLOR_CONFIG = Object.freeze({
    lightness: 0.72,
    chroma: 0.15
  });

  const ROW_COUNT = 4;
  const DRAG_START_DISTANCE = 8;
  const ROW_LABELS = ["第一排", "第二排", "第三排", "第四排"];
  const DIFFICULTIES = Object.freeze({
    easy: { label: "簡單", movableCount: 4, hueRange: 80 },
    medium: { label: "中等", movableCount: 8, hueRange: 55 },
    hard: { label: "困難", movableCount: 16, hueRange: 35 },
    expert: { label: "專家", movableCount: 16, hueRange: 20 }
  });

  const state = {
    difficulty: "easy",
    rows: [],
    colors: [],
    resultErrors: null,
    gameNumber: 0
  };

  const elements = {
    difficultyButtons: [...document.querySelectorAll(".difficulty-button[data-difficulty]")],
    difficultyDetail: document.querySelector("#difficultyDetail"),
    gameView: document.querySelector("#gameView"),
    gameRows: document.querySelector("#gameRows"),
    submitButton: document.querySelector("#submitButton"),
    resultView: document.querySelector("#resultView"),
    resultDifficulty: document.querySelector("#resultDifficulty"),
    scoreOutput: document.querySelector("#scoreOutput"),
    errorChart: document.querySelector("#errorChart"),
    playAgainButton: document.querySelector("#playAgainButton"),
    interactionStatus: document.querySelector("#interactionStatus")
  };

  let pendingDrag = null;
  let dragState = null;
  let chartFrame = 0;

  function normalizeHue(hue) {
    return ((hue % 360) + 360) % 360;
  }

  function formatOklch(hue) {
    const lightness = (COLOR_CONFIG.lightness * 100).toFixed(1);
    return `oklch(${lightness}% ${COLOR_CONFIG.chroma} ${hue.toFixed(2)})`;
  }

  function shuffle(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    const unchanged = shuffled.every((item, index) => item === items[index]);
    if (unchanged && shuffled.length > 1) {
      shuffled.push(shuffled.shift());
    }

    return shuffled;
  }

  function generateRowColors(rowIndex, colorsPerRow, hueOffset, hueRange) {
    const centerHue = normalizeHue(hueOffset + rowIndex * 90);
    const startHue = centerHue - hueRange / 2;
    const hueStep = hueRange / (colorsPerRow - 1);

    return Array.from({ length: colorsPerRow }, (_, globalIndex) => {
      const hue = normalizeHue(startHue + globalIndex * hueStep);

      return {
        id: `game-${state.gameNumber}-row-${rowIndex}-color-${globalIndex}`,
        globalIndex: rowIndex * colorsPerRow + globalIndex,
        hue,
        cssColor: formatOklch(hue)
      };
    });
  }

  function generateGame(difficultyName) {
    const difficulty = DIFFICULTIES[difficultyName];
    const colorsPerRow = difficulty.movableCount + 2;
    const hueOffset = Math.random() * 360;

    state.gameNumber += 1;
    state.difficulty = difficultyName;
    state.rows = Array.from({ length: ROW_COUNT }, (_, rowIndex) => {
      const colors = generateRowColors(rowIndex, colorsPerRow, hueOffset, difficulty.hueRange).map((color, correctPosition) => ({
        ...color,
        correctPosition,
        rowIndex
      }));
      const middleColors = shuffle(colors.slice(1, -1));

      return {
        colors,
        initialOrder: [colors[0], ...middleColors, colors[colors.length - 1]]
      };
    });
    state.colors = state.rows.flatMap((row) => row.colors);
    state.resultErrors = null;
  }

  function createColorTile(color, position, rowLength) {
    const tile = document.createElement("button");
    const isFixedStart = position === 0;
    const isFixedEnd = position === rowLength - 1;
    const isFixed = isFixedStart || isFixedEnd;

    tile.type = "button";
    tile.className = `color-tile ${isFixed ? "color-tile--fixed" : "color-tile--movable"}`;
    tile.dataset.colorId = color.id;
    tile.style.setProperty("--tile-color", color.cssColor);

    if (isFixed) {
      tile.disabled = true;
      tile.dataset.fixed = isFixedStart ? "start" : "end";
      tile.setAttribute("aria-label", isFixedStart ? "左側固定色塊" : "右側固定色塊");
    } else {
      tile.setAttribute("aria-label", "可移動色塊。拖曳以重新排序，或使用左右方向鍵移動。");
    }

    return tile;
  }

  function createRows() {
    const fragment = document.createDocumentFragment();

    state.rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement("section");
      const label = document.createElement("h3");
      const strip = document.createElement("div");

      rowElement.className = "game-row";
      label.className = "row-label";
      label.textContent = ROW_LABELS[rowIndex];
      strip.className = "color-strip";
      strip.dataset.rowIndex = String(rowIndex);
      strip.style.setProperty("--tile-count", String(row.initialOrder.length));
      strip.setAttribute("aria-label", `顏色排序${ROW_LABELS[rowIndex]}`);

      row.initialOrder.forEach((color, position) => {
        strip.appendChild(createColorTile(color, position, row.initialOrder.length));
      });

      rowElement.append(label, strip);
      fragment.appendChild(rowElement);
    });

    elements.gameRows.replaceChildren(fragment);
  }

  function renderDifficulty() {
    const difficulty = DIFFICULTIES[state.difficulty];
    elements.difficultyButtons.forEach((button) => {
      const isActive = button.dataset.difficulty === state.difficulty;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    elements.difficultyDetail.textContent = `每排有 ${difficulty.movableCount} 個可移動色塊，色相範圍約 ${difficulty.hueRange}°`;
    elements.gameView.dataset.difficulty = state.difficulty;
    elements.gameRows.dataset.difficulty = state.difficulty;
  }

  function renderGame() {
    renderDifficulty();
    createRows();
    elements.gameView.hidden = false;
    elements.resultView.hidden = true;
  }

  function startGame(difficultyName = state.difficulty, shouldScroll = false) {
    cancelPendingDrag();
    finishDrag();
    generateGame(difficultyName);
    renderGame();

    if (shouldScroll) {
      elements.gameView.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateGhostPosition(pointerEvent) {
    if (!dragState) return;
    dragState.ghost.style.left = `${pointerEvent.clientX}px`;
    dragState.ghost.style.top = `${pointerEvent.clientY}px`;
  }

  function clearDropMarker() {
    if (!dragState?.marker) return;
    dragState.marker.classList.remove("drop-before");
    dragState.marker = null;
  }

  function markInsertionPoint(element) {
    clearDropMarker();
    if (!element) return;
    element.classList.add("drop-before");
    dragState.marker = element;
  }

  function beginDrag(tile, pointerEvent) {
    const strip = tile.closest(".color-strip");
    const tileRect = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true);

    ghost.disabled = true;
    ghost.classList.remove("is-dragging");
    ghost.classList.add("drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${tileRect.width}px`;
    ghost.style.height = `${tileRect.height}px`;
    document.body.appendChild(ghost);

    dragState = {
      pointerId: pointerEvent.pointerId,
      tile,
      strip,
      ghost,
      marker: null
    };

    tile.classList.add("is-dragging");
    document.body.classList.add("is-sorting");
    updateGhostPosition(pointerEvent);

    if (tile.setPointerCapture) {
      tile.setPointerCapture(pointerEvent.pointerId);
    }
  }

  function moveDraggedTile(pointerEvent) {
    if (!dragState || pointerEvent.pointerId !== dragState.pointerId) return;
    pointerEvent.preventDefault();
    updateGhostPosition(pointerEvent);

    const movableTiles = [...dragState.strip.querySelectorAll(".color-tile--movable:not(.is-dragging)")];
    const insertBefore = movableTiles.find((tile) => {
      const rect = tile.getBoundingClientRect();
      return pointerEvent.clientX < rect.left + rect.width / 2;
    });

    if (insertBefore) {
      dragState.strip.insertBefore(dragState.tile, insertBefore);
      markInsertionPoint(insertBefore);
    } else {
      const endTile = dragState.strip.querySelector('[data-fixed="end"]');
      dragState.strip.insertBefore(dragState.tile, endTile);
      markInsertionPoint(endTile);
    }
  }

  function finishDrag(pointerEvent) {
    if (!dragState) return;
    if (pointerEvent && pointerEvent.pointerId !== dragState.pointerId) return;

    const { tile, ghost, pointerId } = dragState;
    clearDropMarker();
    tile.classList.remove("is-dragging");
    ghost.remove();
    document.body.classList.remove("is-sorting");
    dragState = null;

    if (tile.hasPointerCapture?.(pointerId)) {
      tile.releasePointerCapture(pointerId);
    }

    tile.focus({ preventScroll: true });
  }

  function cancelPendingDrag(pointerEvent) {
    if (!pendingDrag) return;
    if (pointerEvent && pointerEvent.pointerId !== pendingDrag.pointerId) return;

    const { tile, pointerId } = pendingDrag;
    pendingDrag = null;

    if (tile.hasPointerCapture?.(pointerId)) {
      tile.releasePointerCapture(pointerId);
    }
  }

  function handlePointerMove(event) {
    if (dragState) {
      moveDraggedTile(event);
      return;
    }

    if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return;

    const distance = Math.hypot(
      event.clientX - pendingDrag.startX,
      event.clientY - pendingDrag.startY
    );

    if (distance < DRAG_START_DISTANCE) return;

    event.preventDefault();
    const tile = pendingDrag.tile;
    pendingDrag = null;
    beginDrag(tile, event);
    moveDraggedTile(event);
  }

  function finishPointerInteraction(event) {
    if (dragState) {
      finishDrag(event);
      return;
    }

    cancelPendingDrag(event);
  }

  function handlePointerDown(event) {
    const tile = event.target.closest(".color-tile--movable");
    if (!tile || !elements.gameRows.contains(tile)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pendingDrag || dragState) return;

    pendingDrag = {
      pointerId: event.pointerId,
      tile,
      startX: event.clientX,
      startY: event.clientY
    };

    if (tile.setPointerCapture) {
      tile.setPointerCapture(event.pointerId);
    }
  }

  function announceKeyboardMove(tile, direction) {
    const rowIndex = Number(tile.closest(".color-strip").dataset.rowIndex) + 1;
    elements.interactionStatus.textContent = `${ROW_LABELS[rowIndex - 1]}的色塊已${direction}。`;
  }

  function handleKeyboardSort(event) {
    const tile = event.target.closest(".color-tile--movable");
    if (!tile) return;

    const strip = tile.closest(".color-strip");
    const movableTiles = [...strip.querySelectorAll(".color-tile--movable")];
    const index = movableTiles.indexOf(tile);
    let moved = false;
    let direction = "";

    if (event.key === "ArrowLeft" && index > 0) {
      strip.insertBefore(tile, movableTiles[index - 1]);
      moved = true;
      direction = "向左移動";
    } else if (event.key === "ArrowRight" && index < movableTiles.length - 1) {
      strip.insertBefore(movableTiles[index + 1], tile);
      moved = true;
      direction = "向右移動";
    } else if (event.key === "Home" && index > 0) {
      strip.insertBefore(tile, movableTiles[0]);
      moved = true;
      direction = "移到最前方";
    } else if (event.key === "End" && index < movableTiles.length - 1) {
      strip.insertBefore(tile, strip.querySelector('[data-fixed="end"]'));
      moved = true;
      direction = "移到最後方";
    }

    if (moved) {
      event.preventDefault();
      tile.focus({ preventScroll: true });
      announceKeyboardMove(tile, direction);
    }
  }

  function calculateSequenceScore(correctOrder, playerOrder) {
    const playerPositions = new Map(playerOrder.map((id, index) => [id, index]));
    return correctOrder.reduce((score, id, correctPosition) => {
      return score + Math.abs(playerPositions.get(id) - correctPosition);
    }, 0);
  }

  function calculateScore() {
    const errorsById = new Map();
    let totalScore = 0;

    state.rows.forEach((row, rowIndex) => {
      const correctOrder = row.colors.map((color) => color.id);
      const strip = elements.gameRows.querySelector(`[data-row-index="${rowIndex}"]`);
      const playerOrder = [...strip.querySelectorAll("[data-color-id]")].map((tile) => tile.dataset.colorId);
      const playerPositions = new Map(playerOrder.map((id, position) => [id, position]));

      totalScore += calculateSequenceScore(correctOrder, playerOrder);
      row.colors.forEach((color) => {
        const error = Math.abs(playerPositions.get(color.id) - color.correctPosition);
        errorsById.set(color.id, error);
      });
    });

    return {
      totalScore,
      hueErrors: state.colors.map((color) => ({
        hue: color.hue,
        error: errorsById.get(color.id) ?? 0,
        rowIndex: color.rowIndex
      }))
    };
  }

  function drawHueSectors(context, size, outerRadius) {
    const center = size / 2;
    const startOffset = -Math.PI / 2;

    for (let index = 0; index < 360; index += 1) {
      const startAngle = startOffset + (index * Math.PI * 2) / 360;
      const endAngle = startOffset + ((index + 1) * Math.PI * 2) / 360 + 0.002;
      const color = { cssColor: formatOklch(index) };

      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, outerRadius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = color.cssColor;
      context.fill();
    }

    context.beginPath();
    context.arc(center, center, outerRadius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255, 255, 255, 0.45)";
    context.lineWidth = 1;
    context.stroke();
  }

  function drawProfileGrid(context, size, innerRadius, profileRadius) {
    const center = size / 2;

    context.save();
    context.fillStyle = "rgba(5, 9, 14, 0.30)";
    context.beginPath();
    context.arc(center, center, profileRadius + size * 0.025, 0, Math.PI * 2);
    context.fill();

    [0, 0.5, 1].forEach((progress) => {
      const radius = innerRadius + (profileRadius - innerRadius) * progress;
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.strokeStyle = progress === 0 ? "rgba(255, 255, 255, 0.34)" : "rgba(255, 255, 255, 0.18)";
      context.lineWidth = 1;
      context.stroke();
    });
    context.restore();
  }

  function drawErrorProfile(context, size, innerRadius, profileRadius) {
    const center = size / 2;
    const errors = state.resultErrors;
    const maxError = Math.max(1, DIFFICULTIES[state.difficulty].movableCount - 1);
    const rows = Array.from({ length: ROW_COUNT }, (_, rowIndex) => errors.filter((item) => item.rowIndex === rowIndex));

    rows.forEach((rowErrors) => {
      const points = rowErrors.map(({ hue, error }) => {
        const angle = -Math.PI / 2 + (hue * Math.PI * 2) / 360;
        const radius = innerRadius + (error / maxError) * (profileRadius - innerRadius);
        return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
      });
      if (!points.length) return;

      context.save();
      context.beginPath();
      points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(2, size * 0.005);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = "rgba(0, 0, 0, 0.5)";
      context.shadowBlur = 7;
      context.stroke();
      context.restore();

      context.save();
      context.fillStyle = "rgba(255, 255, 255, 0.9)";
      points.forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1.3, size * 0.0035), 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    });
  }

  function renderResultChart() {
    if (!state.resultErrors || elements.resultView.hidden) return;

    const canvas = elements.errorChart;
    const context = canvas.getContext("2d");
    const size = Math.max(220, Math.round(canvas.getBoundingClientRect().width));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size, size);

    const outerRadius = size * 0.47;
    const innerRadius = size * 0.075;
    const profileRadius = size * 0.37;

    drawHueSectors(context, size, outerRadius);
    drawProfileGrid(context, size, innerRadius, profileRadius);
    drawErrorProfile(context, size, innerRadius, profileRadius);
  }

  function scheduleChartRender() {
    window.cancelAnimationFrame(chartFrame);
    chartFrame = window.requestAnimationFrame(renderResultChart);
  }

  function showResult() {
    cancelPendingDrag();
    finishDrag();
    const result = calculateScore();

    state.resultErrors = result.hueErrors;
    elements.scoreOutput.textContent = String(result.totalScore);
    elements.resultDifficulty.textContent = `${DIFFICULTIES[state.difficulty].label}難度結果`;
    elements.gameView.hidden = true;
    elements.resultView.hidden = false;
    scheduleChartRender();
    elements.resultView.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindEvents() {
    elements.difficultyButtons.forEach((button) => {
      button.addEventListener("click", () => startGame(button.dataset.difficulty, true));
    });

    elements.gameRows.addEventListener("pointerdown", handlePointerDown);
    elements.gameRows.addEventListener("keydown", handleKeyboardSort);
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", finishPointerInteraction);
    document.addEventListener("pointercancel", finishPointerInteraction);
    elements.submitButton.addEventListener("click", showResult);
    elements.playAgainButton.addEventListener("click", () => startGame(state.difficulty, true));
    window.addEventListener("resize", scheduleChartRender);
  }

  function verifyScoringExamples() {
    const correct = [1, 2, 3, 4, 5];
    console.assert(calculateSequenceScore(correct, [2, 1, 3, 4, 5]) === 2, "計分範例 1 驗證失敗");
    console.assert(calculateSequenceScore(correct, [2, 5, 1, 3, 4]) === 8, "計分範例 2 驗證失敗");
  }

  function initialize() {
    verifyScoringExamples();
    bindEvents();
    startGame("easy");
  }

  initialize();
})();
