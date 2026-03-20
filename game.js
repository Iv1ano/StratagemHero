// persisting thigns
let highScore = localStorage.getItem("highScore") || 0;
const inputScheme = localStorage.getItem("inputScheme") || "arrows";

// vars declarations
const keyMaps = {
  arrows: {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  },
  wasd: { w: "up", s: "down", a: "left", d: "right" },
};

const stratCats = [
  "orbital",
  "eagle",
  "support",
  "sentry",
  "emplacement",
  "backpack",
];

const catText = {
  orbital: "Orbital bombardment incoming!",
  eagle: "Eagle drive by incoming!",
  support: "Support weapons incoming!",
  sentry: "Sentries deployed.",
  emplacement: "Fortifications incoming!",
  backpack: "Get ready to carry some equipment!",
};

const sounds = {
  coin2: new Audio("assets/sounds/coin2.wav"),
  start: new Audio("assets/sounds/start.wav"),
  correct1: new Audio("assets/sounds/correct1.wav"),
  error1: new Audio("assets/sounds/error1.wav"),
  hit1: new Audio("assets/sounds/hit4.wav"),
  failure: new Audio("assets/sounds/failure.wav"),
  failurefull: new Audio("assets/sounds/failurefull.wav"),
  ready: new Audio("assets/sounds/ready.wav"),
  success1: new Audio("assets/sounds/success1.wav"),
  success2: new Audio("assets/sounds/success2.wav"),
  success3: new Audio("assets/sounds/success3.wav"),
  playing: new Audio("assets/sounds/playing.wav"),
  strathero: new Audio("assets/sounds/stratagem_hero.wav"),
};
Object.values(sounds).forEach((sound) => {
  sound.volume = 0.35;
});
sounds.playing.loop = true;

//audio
function playSound(sound) {
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function playMusic(sound) {
  sound.play().catch(() => {});
}

function stopMusic(sound) {
  sound.pause();
  sound.currentTime = 0;
}

// --- STATE ---
let stratList = [];
let levelQueue = [];
let currentStrat = null;
let inputIndex = 0;
let timeLeft = 0;
let timerInterval = null;
let transitionTimeout = null;
let isRunning = false;
let currentKeyMap = keyMaps[inputScheme];

let currentLevel = 1;
let currentLevelConfig = null;
let stratsDoneThisLevel = 0;

let totalScore = 0;
let levelScore = 0;
let levelPerfect = true;

// screen-game
const stratNameEl = document.getElementById("strat-name");
const seqEl = document.getElementById("sequence");
const timerBarEl = document.getElementById("timer-bar");
const gameTotalEl = document.getElementById("game-total-score");
const roundNumEl = document.getElementById("round-num");
const stratIconEl = document.getElementById("strat-icon");

// screen-levelintro
const levelNumEl = document.getElementById("level-num");
const catEl = document.getElementById("cat");

// screen-levelcomplete
const lcRoundEl = document.getElementById("lc-round-bonus");
const lcTimeEl = document.getElementById("lc-time-bonus");
const lcPerfectEl = document.getElementById("lc-perfect-bonus");
const lcTotalScoreEl = document.getElementById("lc-total-score");

// screen-gameover
const goTotalEl = document.getElementById("go-total-score");
const goHighScoreEl = document.getElementById("go-high-score");

// screen-start
const startHighScoreEl = document.getElementById("start-high-score");

// --- INIT ---
async function init() {
  stratList = await (await fetch("assets/stratagems.json")).json();
  for (let i = 0; i < stratList.length; i++) {
    const img = new Image();
    img.src = `assets/icons/${stratList[i].icon}`;
  }
  startHighScoreEl.textContent = highScore;
  showScreen("start");
}

// --- SCREEN MANAGEMENT ---
function showScreen(name) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
}

// --- LEVEL CONFIG ---
function levelConfig(levelNumber) {
  const count = Math.min(5 + Math.floor(levelNumber / 2), 15);
  const timeLimit = Math.max(10 - Math.floor(levelNumber / 3), 3);
  const hasCat = Math.random() < 0.2 || levelNumber % 5 === 0;
  const cat = hasCat
    ? stratCats[Math.floor(Math.random() * stratCats.length)]
    : null;
  return { level: levelNumber, count, timeLimit, cat };
}

// --- STRATAGEM PICKING ---
function pickStratagem() {
  if (currentLevelConfig.cat !== null) {
    const useCat = Math.random() < 0.7;
    const pool = useCat
      ? stratList.filter((s) => s.category === currentLevelConfig.cat)
      : stratList;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return stratList[Math.floor(Math.random() * stratList.length)];
}

// --- TIMER ---
function startTimer() {
  clearInterval(timerInterval);
  timeLeft = currentLevelConfig.timeLimit * 1000;
  timerInterval = setInterval(() => {
    timeLeft -= 50;
    renderHUD();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      endGame();
    }
  }, 50);
}

// --- RENDER ---
function renderHUD() {
  const pct = (timeLeft / (currentLevelConfig.timeLimit * 1000)) * 100;
  timerBarEl.style.width = pct + "%";
  timerBarEl.style.background =
    pct > 50 ? "yellow" : pct > 25 ? "orange" : "red";
  gameTotalEl.textContent = totalScore;
}

function renderSequence(sequence) {
  const arrowMap = {
    up: `<svg viewBox="0 0 24 24"><polygon points="12,1 23,13 17,13 17,23 7,23 7,13 1,13"/></svg>`,
    down: `<svg viewBox="0 0 24 24"><polygon points="12,23 1,11 7,11 7,1 17,1 17,11 23,11"/></svg>`,
    left: `<svg viewBox="0 0 24 24"><polygon points="1,12 13,1 13,7 23,7 23,17 13,17 13,23"/></svg>`,
    right: `<svg viewBox="0 0 24 24"><polygon points="23,12 11,1 11,7 1,7 1,17 11,17 11,23"/></svg>`,
  };

  const html = sequence
    .map((direction, index) => {
      let state = "";
      if (index < inputIndex) state = "done";
      if (index === inputIndex) state = "current";
      if (index > inputIndex) state = "upcoming";
      return `<span class="arrow ${state}">${arrowMap[direction]}</span>`;
    })
    .join("");

  seqEl.innerHTML = html;
}

// --- GAME FLOW ---
function startGame() {
  playSound(sounds.coin2);
  setTimeout(() => playSound(sounds.start), 500);
  totalScore = 0;
  currentLevel = 1;
  levelScore = 0;
  stratsDoneThisLevel = 0;
  levelPerfect = true;
  currentLevelConfig = levelConfig(currentLevel);

  showLevelIntro();
}

function showLevelIntro() {
  levelNumEl.textContent = `Level ${currentLevel}`;
  catEl.textContent = currentLevelConfig.cat
    ? catText[currentLevelConfig.cat]
    : "";
  showScreen("levelintro");
  transitionTimeout = setTimeout(() => startLevel(), 3000);
}

function startLevel() {
  playMusic(sounds.playing);
  levelScore = 0;
  stratsDoneThisLevel = 0;
  levelPerfect = true;
  isRunning = true;
  levelQueue = [];
  for (let i = 0; i < currentLevelConfig.count; i++) {
    levelQueue.push(pickStratagem());
  }

  showScreen("game");
  startTimer();
  startRound();
}

function startRound() {
  inputIndex = 0;
  currentStrat = levelQueue[stratsDoneThisLevel];
  stratNameEl.textContent = currentStrat.name;
  roundNumEl.textContent = currentLevel;
  stratIconEl.src = `assets/icons/${currentStrat.icon}`;
  renderUpcomingIcons();
  renderSequence(currentStrat.sequence);
  isRunning = true;
}

function renderUpcomingIcons() {
  const queueEl = document.getElementById("strat-icon-queue");
  queueEl.querySelectorAll(".upcoming-icon").forEach((el) => el.remove());
  const upcoming = levelQueue.slice(
    stratsDoneThisLevel + 1,
    stratsDoneThisLevel + 6,
  );
  upcoming.forEach((strat) => {
    const div = document.createElement("div");
    div.className = "upcoming-icon";
    div.innerHTML = `<img src="assets/icons/${strat.icon}" alt="${strat.name}">`;
    queueEl.appendChild(div);
  });
}

function handleInput(key) {
  if (!isRunning) return;
  if (key === currentStrat.sequence[inputIndex]) {
    playSound(sounds.hit1);
    inputIndex++;
    renderSequence(currentStrat.sequence);
    if (inputIndex === currentStrat.sequence.length) {
      isRunning = false;
      const stratScore = currentStrat.sequence.length * 10;
      levelScore += stratScore;
      totalScore += stratScore;
      stratsDoneThisLevel++;

      const boost = 800;
      const maxTime = currentLevelConfig.timeLimit * 1000;
      timeLeft = Math.min(timeLeft + boost, maxTime);

      renderHUD();
      setTimeout(() => {
        stratsDoneThisLevel >= currentLevelConfig.count
          ? endLevel()
          : startRound();
      }, 400);
    }
  } else {
    playSound(error1);
    isRunning = false;
    perfectRound = false;
    inputIndex = 0;
    levelPerfect = false;
    seqEl.classList.add("wrong");
    setTimeout(() => {
      seqEl.classList.remove("wrong");
      renderSequence(currentStrat.sequence);
    }, 400);
    setTimeout(() => {
      isRunning = true;
    }, 500);
  }
}

function endLevel() {
  console.log("endLevel called");
  clearInterval(timerInterval);
  clearTimeout(transitionTimeout);
  stopMusic(sounds.playing);
  isRunning = false;

  const roundBonus = 75 + 25 * (currentLevel - 1);
  const timeBonus = Math.floor(timeLeft / 1000) * 10;
  const perfectBonus = levelPerfect ? 100 : 0;

  totalScore += roundBonus + timeBonus + perfectBonus;

  lcTimeEl.textContent = timeBonus;
  lcRoundEl.textContent = roundBonus;
  lcPerfectEl.textContent = perfectBonus;
  lcTotalScoreEl.textContent = totalScore;
  showScreen("levelcomplete");
  playSound(sounds.success1);

  transitionTimeout = setTimeout(() => {
    currentLevel++;
    currentLevelConfig = levelConfig(currentLevel);
    showLevelIntro();
  }, 4000);
}

function endGame() {
  clearInterval(timerInterval);
  clearTimeout(transitionTimeout);
  stopMusic(sounds.playing);
  isRunning = false;

  if (totalScore > highScore) {
    highScore = totalScore;
    localStorage.setItem("highScore", totalScore);
  }

  goTotalEl.textContent = totalScore;
  goHighScoreEl.textContent = highScore;
  showScreen("gameover");
  sounds.failurefull.play();
  sounds.failurefull.currentTime = 0;

  transitionTimeout = setTimeout(() => {
    startHighScoreEl.textContent = highScore;
    showScreen("start");
    sounds.ready.play();
    sounds.ready.currentTime = 0;
  }, 5000);
}

//options page event handling
const controlOpts = ["arrows", "wasd"];
let controlIndex = controlOpts.indexOf(inputScheme);

document.getElementById("options-btn").addEventListener("click", () => {
  showScreen("options");
});

document.getElementById("controls-prev").addEventListener("click", () => {
  controlIndex = cycleIndex(controlIndex, -1, controlOpts.length);
  updateControlDisplay();
});

document.getElementById("controls-next").addEventListener("click", () => {
  controlIndex = cycleIndex(controlIndex, +1, controlOpts.length);
  updateControlDisplay();
});

document.getElementById("back-btn").addEventListener("click", () => {
  showScreen("start");
});

function cycleIndex(current, direction, total) {
  return (current + direction + total) % total;
}

function updateControlDisplay() {
  const scheme = controlOpts[controlIndex];
  document.getElementById("controls-value").textContent =
    scheme === "arrows" ? "ARROW KEYS" : "WASD";
  currentKeyMap = keyMaps[scheme];
  localStorage.setItem("inputScheme", scheme);
}

// --- EVENT LISTENERS ---
document.addEventListener("keydown", (e) => {
  const direction = currentKeyMap[e.key];
  if (!direction) return;

  const activeScreen = document.querySelector(".screen.active")?.id;

  if (activeScreen === "screen-start") {
    startGame();
  } else if (activeScreen === "screen-game") {
    handleInput(direction);
  }
});

init();
