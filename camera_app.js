(function () {
  const GAME_DURATION = 30; // seconds
  const STORAGE_KEYS = {
    muted: "rvst_sound_muted",
    bestScore: "rvst_best_score_camera" // 使用独立的排行榜
  };

  const PRAISE_TEXTS = [
    "识别成功！真棒！",
    "这也能认出来？强！",
    "太精准了，猫猫惊呆！",
    "就是这个！",
    "AI 都觉得你选对了！",
    "稳！再来一个？"
  ];

  const WRONG_TEXTS = [
    "好像不是这个哦...",
    "再靠近一点试试？",
    "猫猫看不清，换个角度？",
    "这是啥？不是我要的呀",
    "别灰心，再试一次"
  ];

  const state = {
    gameState: "loading", // loading | start | playing | ended
    score: 0,
    combo: 0,
    maxCombo: 0,
    praiseCount: 0,
    remainingTime: GAME_DURATION,
    lastFrameTs: null,
    rafId: null,
    currentCorrectType: null, // "carrot" | "tissue"
    muted: false,
    lastResult: {
      finalScore: 0,
      timeBonus: 0,
      remainingSeconds: 0,
      praiseCount: 0,
      maxCombo: 0
    },
    // AI 相关状态
    classifier: null,
    video: null,
    lastLabel: "",
    lastConfidence: 0,
    isDetecting: false,
    lockDetection: false // 识别成功后锁定一小段时间防止重复触发
  };

  // Elements
  const screenStart = document.getElementById("screen-start");
  const screenPlay = document.getElementById("screen-play");
  const screenEnd = document.getElementById("screen-end");

  const btnStart = document.getElementById("btn-start");
  const btnRestart = document.getElementById("btn-restart");
  const btnShare = document.getElementById("btn-share");
  
  // Debug buttons
  const btnSimCarrot = document.getElementById("sim-carrot");
  const btnSimPaper = document.getElementById("sim-paper");

  const muteToggle = document.getElementById("mute-toggle");
  const muteIcon = document.getElementById("mute-icon");

  const timeValueEl = document.getElementById("time-value");
  const scoreValueEl = document.getElementById("score-value");
  const comboValueEl = document.getElementById("combo-value");
  const hudItems = document.querySelectorAll(".hud-item");

  const questionTextEl = document.getElementById("question-text");
  const hintTextEl = document.getElementById("hint-text");
  
  const videoEl = document.getElementById("webcam");
  const resultLabelEl = document.getElementById("result-label");
  const modelStatusEl = document.getElementById("model-status");

  const overlayPraise = document.getElementById("overlay-praise");
  const comboFireText = document.getElementById("combo-fire-text");

  const toastEl = document.getElementById("toast");

  const finalScoreEl = document.getElementById("final-score");
  const bestComboEl = document.getElementById("best-combo");
  const praiseCountEl = document.getElementById("praise-count");
  const timeBonusEl = document.getElementById("time-bonus");
  const remainSecEl = document.getElementById("remain-sec");
  const bestScoreOverallEl = document.getElementById("best-score-overall");

  let audioCtx = null;
  const audioCache = {}; // 预加载音频缓存

  const AUDIO_FILES = {
    paper: ["data/audio/paper/paper_1.mp3", "data/audio/paper/paper_2.mp3"],
    carrot: ["data/audio/carrot/carrot_1.mp3", "data/audio/carrot/carrot_2.mp3"],
    good: ["data/audio/good/good_1.mp3", "data/audio/good/good_2.mp3"],
    wrong: ["data/audio/wrong/wrong.mp3"]
  };

  // 预加载所有音频
  function preloadAudios() {
    Object.keys(AUDIO_FILES).forEach(key => {
        AUDIO_FILES[key].forEach(src => {
            const audio = new Audio();
            audio.src = src;
            audio.preload = "auto";
            if (!audioCache[key]) audioCache[key] = [];
            audioCache[key].push(audio);
        });
    });
  }

  // --- AI & Camera Functions ---

  async function initAI() {
    try {
      console.log("Loading MobileNet...");
      // 加载 MobileNet 模型
      state.classifier = await ml5.imageClassifier('MobileNet');
      console.log("Model Loaded!");
      
      if (modelStatusEl) {
        modelStatusEl.textContent = "AI 模型加载完成！";
        modelStatusEl.style.color = "green";
      }
      
      if (btnStart) {
        btnStart.disabled = false;
        const span = btnStart.querySelector("span:last-child");
        if (span) span.textContent = "开始挑战";
      }
      
      state.gameState = "start";
    } catch (err) {
      console.error("AI Init Error:", err);
      if (modelStatusEl) {
        modelStatusEl.textContent = "模型加载失败，请刷新重试";
        modelStatusEl.style.color = "red";
      }
    }
  }

  async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment', // 优先使用后置摄像头
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        videoEl.srcObject = stream;
        await new Promise((resolve) => {
            videoEl.onloadedmetadata = () => {
                videoEl.play();
                resolve();
            };
        });
        state.video = videoEl;
        startClassifying();
    } catch (err) {
        console.error("Camera Error:", err);
        questionTextEl.textContent = "无法访问摄像头，请检查权限";
        showToast("无法访问摄像头");
    }
  }

  function startClassifying() {
    if (!state.classifier || !state.video) return;
    state.isDetecting = true;
    classify();
  }

  function classify() {
    if (!state.isDetecting || state.gameState !== "playing") return;
    
    state.classifier.classify(state.video, (error, results) => {
      if (error) {
        console.error(error);
        return;
      }
      
      // 处理结果
      if (results && results.length > 0) {
        const best = results[0];
        state.lastLabel = best.label.toLowerCase();
        state.lastConfidence = best.confidence;
        
        // 更新 UI 显示当前识别到的物体
        if (resultLabelEl) {
            resultLabelEl.textContent = `识别中: ${best.label} (${Math.round(best.confidence * 100)}%)`;
        }

        // 检查是否匹配当前目标
        checkMatch(state.lastLabel);
      }
      
      // 继续下一帧识别
      requestAnimationFrame(classify); // 或者使用 setTimeout 控制频率
    });
  }

  function checkMatch(label) {
    if (state.lockDetection || state.gameState !== "playing") return;

    // 简单的关键词匹配逻辑
    let detectedType = null;
    
    // 萝卜关键词
    const carrotKeywords = ['carrot', 'orange', 'vegetable', 'fruit', 'food']; 
    // 纸巾关键词
    const tissueKeywords = ['paper', 'tissue', 'towel', 'envelope', 'carton', 'napkin', 'sheet', 'packet'];

    if (carrotKeywords.some(k => label.includes(k))) {
        detectedType = 'carrot';
    } else if (tissueKeywords.some(k => label.includes(k))) {
        detectedType = 'tissue';
    }

    if (detectedType && detectedType === state.currentCorrectType) {
        handleSuccess();
    }
  }

  function handleSuccess() {
    if (state.lockDetection) return;
    state.lockDetection = true; // 锁定，避免连续触发

    state.combo += 1;
    state.praiseCount += 1;
    if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
    }
    const multiplier = 1 + Math.floor(state.combo / 3);
    const gained = 100 * multiplier;
    state.score += gained;
    
    updateScoreUI();
    updateComboUI();
    
    hintTextEl.textContent = randomFrom(PRAISE_TEXTS);
    playRandomAudio("good");
    showPraiseOverlay();

    // 延迟后进入下一轮
    setTimeout(() => {
        state.lockDetection = false;
        spawnRound();
    }, 1500); // 给用户一点时间撤回物品
  }

  // --- Game Logic ---

  function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function playTone(type) {
    if (state.muted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "ok") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(260, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    }

    osc.start(now);
    osc.stop(now + 0.22);
  }

  function playRandomAudio(dir) {
    if (state.muted) return;
    
    const audios = audioCache[dir];
    if (!audios || audios.length === 0) return;

    const originalAudio = audios[Math.floor(Math.random() * audios.length)];
    const audio = originalAudio.cloneNode();
    audio.volume = 0.7;
    
    audio.addEventListener('error', function(e) {
      if (dir === "good") playTone("ok");
      else if (dir === "wrong") playTone("ng");
    });
    
    audio.play().catch(() => {
      if (dir === "good") playTone("ok");
      else if (dir === "wrong") playTone("ng");
    });
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1800);
  }

  function switchScreen(name) {
    state.gameState = name;
    [screenStart, screenPlay, screenEnd].forEach((el) => {
      if (!el) return;
      el.classList.remove("active");
    });
    if (name === "start") screenStart.classList.add("active");
    if (name === "playing") screenPlay.classList.add("active");
    if (name === "ended") screenEnd.classList.add("active");
  }

  function resetState() {
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.praiseCount = 0;
    state.remainingTime = GAME_DURATION;
    state.lastFrameTs = null;
    state.currentCorrectType = null;
    state.lockDetection = false;

    updateScoreUI();
    updateTimeUI();
    updateComboUI();
    hintTextEl.textContent = "请出示物品...";
  }

  function updateScoreUI() {
    if (scoreValueEl) scoreValueEl.textContent = String(state.score);
  }

  function updateTimeUI() {
    if (timeValueEl) {
      const t = Math.max(0, state.remainingTime);
      timeValueEl.textContent = t.toFixed(1);
    }
  }

  function updateComboUI() {
    if (comboValueEl) comboValueEl.textContent = String(state.combo);
    hudItems.forEach((item) => {
      item.classList.remove("combo-active");
    });
    if (state.combo >= 2 && hudItems[2]) {
      hudItems[2].classList.add("combo-active");
    }
  }

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function spawnRound() {
    if (state.gameState !== "playing") return;

    const correct = Math.random() < 0.5 ? "carrot" : "tissue";
    state.currentCorrectType = correct;
    state.lockDetection = false;

    if (correct === "carrot") {
      questionTextEl.textContent = "主人：给我看看萝卜！";
      playRandomAudio("carrot");
    } else {
      questionTextEl.textContent = "主人：纸巾在哪里？";
      playRandomAudio("paper");
    }
    
    hintTextEl.textContent = "正在等待摄像头识别...";
  }

  function showPraiseOverlay() {
    if (!overlayPraise) return;
    overlayPraise.classList.add("show");
    if (state.combo >= 2 && comboFireText) {
      comboFireText.textContent = ` ${state.combo} 连击`;
    } else if (comboFireText) {
      comboFireText.textContent = "继续保持～";
    }
    setTimeout(() => {
      overlayPraise.classList.remove("show");
    }, 420);
  }

  function gameLoop(timestamp) {
    if (state.gameState !== "playing") return;
    if (state.lastFrameTs == null) {
      state.lastFrameTs = timestamp;
    }
    let delta = (timestamp - state.lastFrameTs) / 1000;
    if (delta > 0.3) delta = 0.3;
    state.lastFrameTs = timestamp;

    state.remainingTime -= delta;
    if (state.remainingTime <= 0) {
      state.remainingTime = 0;
      updateTimeUI();
      endGame();
      return;
    }

    updateTimeUI();
    state.rafId = window.requestAnimationFrame(gameLoop);
  }

  function startGame() {
    resetState();
    switchScreen("playing");
    startCamera(); // 确保摄像头开启
    spawnRound();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.lastFrameTs = null;
    state.rafId = window.requestAnimationFrame(gameLoop);
  }

  function endGame() {
    state.isDetecting = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    // 停止摄像头流以节省资源（可选，这里暂不停止以便重开）
    
    const remainingWhole = Math.max(0, Math.round(state.remainingTime));
    const timeBonus = remainingWhole * 10;
    const finalScore = Math.max(0, state.score + timeBonus);

    state.lastResult = {
      finalScore,
      timeBonus,
      remainingSeconds: remainingWhole,
      praiseCount: state.praiseCount,
      maxCombo: state.maxCombo
    };

    const bestPreviousRaw = localStorage.getItem(STORAGE_KEYS.bestScore);
    const bestPrevious = bestPreviousRaw ? parseInt(bestPreviousRaw, 10) || 0 : 0;
    const bestNow = Math.max(bestPrevious, finalScore);
    localStorage.setItem(STORAGE_KEYS.bestScore, String(bestNow));

    finalScoreEl.textContent = String(finalScore);
    bestComboEl.textContent = String(state.maxCombo);
    praiseCountEl.textContent = String(state.praiseCount);
    timeBonusEl.textContent = String(timeBonus);
    remainSecEl.textContent = String(remainingWhole);
    if (bestScoreOverallEl) {
      bestScoreOverallEl.textContent = String(bestNow);
    }

    switchScreen("ended");
  }

  function toggleMute() {
    state.muted = !state.muted;
    try {
      localStorage.setItem(STORAGE_KEYS.muted, state.muted ? "1" : "0");
    } catch (e) {
      // ignore storage errors
    }
    if (muteToggle) {
      muteToggle.dataset.muted = state.muted ? "true" : "false";
    }
    if (muteIcon) {
      muteIcon.textContent = state.muted ? "volume_off" : "volume_up";
    }
    showToast(state.muted ? "已静音" : "音效已开启");
  }

  function restoreSettings() {
    try {
      const muted = localStorage.getItem(STORAGE_KEYS.muted);
      state.muted = muted === "1";
    } catch (e) {
      state.muted = false;
    }
    if (muteToggle) {
      muteToggle.dataset.muted = state.muted ? "true" : "false";
    }
    if (muteIcon) {
      muteIcon.textContent = state.muted ? "volume_off" : "volume_up";
    }

    try {
      const bestRaw = localStorage.getItem(STORAGE_KEYS.bestScore);
      const best = bestRaw ? parseInt(bestRaw, 10) || 0 : 0;
      if (bestScoreOverallEl) {
        bestScoreOverallEl.textContent = String(best);
      }
    } catch (e) {
      if (bestScoreOverallEl) bestScoreOverallEl.textContent = "0";
    }
  }

  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        ensureAudioCtx();
        startGame();
      });
    }
    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        ensureAudioCtx();
        startGame();
      });
    }
    if (btnShare) {
      btnShare.addEventListener("click", () => {
        // Share logic (simplified)
        showToast("结果已复制，快去分享吧！");
      });
    }
    if (muteToggle) {
      muteToggle.addEventListener("click", () => {
        ensureAudioCtx();
        toggleMute();
      });
    }
    
    // Debug 按钮事件
    if (btnSimCarrot) {
        btnSimCarrot.addEventListener("click", () => {
            if (state.gameState === "playing") {
                checkMatch("carrot");
            }
        });
    }
    if (btnSimPaper) {
        btnSimPaper.addEventListener("click", () => {
            if (state.gameState === "playing") {
                checkMatch("paper");
            }
        });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.gameState === "playing") {
        if (state.rafId) {
          cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }
      } else if (!document.hidden && state.gameState === "playing" && !state.rafId) {
        state.lastFrameTs = performance.now();
        state.rafId = window.requestAnimationFrame(gameLoop);
      }
    });
  }

  function init() {
    restoreSettings();
    switchScreen("start");
    resetState();
    bindEvents();
    // 初始化 AI
    initAI();
    // 预加载音频
    preloadAudios();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
