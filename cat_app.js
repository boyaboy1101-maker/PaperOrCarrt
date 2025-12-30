(function () {
  const GAME_DURATION = 30; // seconds
  const STORAGE_KEYS = {
    muted: "rvst_sound_muted",
    bestScore: "rvst_best_score_cart" // 独立排行榜
  };

  const PRAISE_TEXTS = [
    "真棒！继续！",
    "这车技有点东西～",
    "太会选了，猫猫都惊呆了！",
    "这一下，主人直接夸疯了～",
    "完了，被你帅到，只能夸夸了",
    "稳！再来一拍？"
  ];

  const WRONG_TEXTS = [
    "这次没对，再试试~",
    "差一点点！猫猫表示可以原谅",
    "不要紧，下次一定拍对！",
    "主人：我就当你在卖萌了～",
    "谁还没个瞎蒙滑掉的时候呢"
  ];

  const state = {
    gameState: "start", // start | playing | ended
    score: 0,
    combo: 0,
    maxCombo: 0,
    praiseCount: 0,
    remainingTime: GAME_DURATION,
    lastFrameTs: null,
    rafId: null,
    currentCorrectType: null, // "carrot" | "tissue"
    inputLocked: false,
    muted: false,
    lastResult: {
      finalScore: 0,
      timeBonus: 0,
      remainingSeconds: 0,
      praiseCount: 0,
      maxCombo: 0
    }
  };

  // Elements
  const screenStart = document.getElementById("screen-start");
  const screenPlay = document.getElementById("screen-play");
  const screenEnd = document.getElementById("screen-end");

  const btnStart = document.getElementById("btn-start");
  const btnRestart = document.getElementById("btn-restart");
  const btnShare = document.getElementById("btn-share");

  const muteToggle = document.getElementById("mute-toggle");
  const muteIcon = document.getElementById("mute-icon");

  const timeValueEl = document.getElementById("time-value");
  const scoreValueEl = document.getElementById("score-value");
  const comboValueEl = document.getElementById("combo-value");
  const hudItems = document.querySelectorAll(".hud-item");

  const questionTextEl = document.getElementById("question-text");
  const hintTextEl = document.getElementById("hint-text");

  const cardLeft = document.getElementById("card-left");
  const cardRight = document.getElementById("card-right");
  
  // 购物车元素
  const cartPlayer = document.getElementById("cart-player");
  const cartPlayerLeft = document.getElementById("cart-player-left");
  const cartPlayerRight = document.getElementById("cart-player-right");
  const cardRow = document.querySelector(".card-row");

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
  const audioCache = {};

  const AUDIO_FILES = {
    paper: ["data/audio/paper/paper_1.mp3", "data/audio/paper/paper_2.mp3"],
    carrot: ["data/audio/carrot/carrot_1.mp3", "data/audio/carrot/carrot_2.mp3"],
    good: ["data/audio/good/good_1.mp3", "data/audio/good/good_2.mp3"],
    wrong: ["data/audio/wrong/wrong.mp3"]
  };

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
  
  // 计算并设置购物车位置
  // position: 'center' | 'left' | 'right'
  function moveCart(position) {
    // 确保所有元素都存在
    if (!cartPlayer || !cartPlayerLeft || !cartPlayerRight || !cardRow || !cardLeft || !cardRight) return;
    
    // 获取卡片容器的位置信息
    const rowRect = cardRow.getBoundingClientRect();
    const containerRect = screenPlay.getBoundingClientRect();
    
    // 计算相对于 screenPlay 的偏移
    const rowTop = rowRect.top - containerRect.top;
    const rowLeft = rowRect.left - containerRect.left;
    const rowWidth = rowRect.width;
    
    // 购物车大小 (所有图片大小应该一致)
    const cartWidth = cartPlayer.offsetWidth || 140;
    
    // 基础 Y 轴位置：在卡片上方
    // rowTop 是 cardRow 相对于 screenPlay 的 top
    // 我们希望购物车在 cardRow 上方
    
    // 修正：我们不应该让它跑出屏幕。
    // 假设用户希望它离卡片远一点，但还在屏幕内。
    // 之前的 4.5 倍身位确实太大了，可能导致图片消失（看不见=没移动？或者以为没生效）
    // 让我们改回一个合理值，比如距离卡片上方 150px
    // 用户反馈：太往上了，向下一点
    // 之前是 rowTop - 250，现在减少偏移量，让它离卡片近一点（也就是向下一点）
    // 尝试改为 rowTop - 180
    const finalY = rowTop - 180; 
    
    let targetX;
    
    if (position === 'center') {
        // 居中：cardRow 的中心
        targetX = rowLeft + rowWidth / 2 - cartWidth / 2;
    } else if (position === 'left') {
        // 左边卡片中心
        // 简单起见，我们假设卡片在 row 的左侧区域
        // 更精确的做法是获取 cardLeft 的 rect
        const leftRect = cardLeft.getBoundingClientRect();
        targetX = (leftRect.left - containerRect.left) + leftRect.width / 2 - cartWidth / 2;
    } else if (position === 'right') {
        // 右边卡片中心
        const rightRect = cardRight.getBoundingClientRect();
        targetX = (rightRect.left - containerRect.left) + rightRect.width / 2 - cartWidth / 2;
    }
    
    // 更新所有图片的位置，确保切换时位置一致
    [cartPlayer, cartPlayerLeft, cartPlayerRight].forEach(el => {
        el.style.left = `${targetX}px`;
        el.style.top = `${finalY}px`;
    });
  }

  function resetState() {
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.praiseCount = 0;
    state.remainingTime = GAME_DURATION;
    state.lastFrameTs = null;
    state.currentCorrectType = null;
    state.inputLocked = false;

    updateScoreUI();
    updateTimeUI();
    updateComboUI();
    hintTextEl.textContent = "帮猫猫选出主人心里的那个答案～";
    
    // 延迟一帧以确保布局完成
    requestAnimationFrame(() => {
        moveCart('center');
    });
  }

  function updateScoreUI() {
    if (scoreValueEl) {
      scoreValueEl.textContent = String(state.score);
    }
  }

  function updateTimeUI() {
    if (timeValueEl) {
      const t = Math.max(0, state.remainingTime);
      timeValueEl.textContent = t.toFixed(1);
    }
  }

  function updateComboUI() {
    if (comboValueEl) {
      comboValueEl.textContent = String(state.combo);
    }
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

  function setupCard(cardEl, type) {
    if (!cardEl) return;
    cardEl.dataset.type = type;
    cardEl.classList.remove("correct", "wrong", "choice-card--carrot", "choice-card--tissue");
    if (type === "carrot") {
      cardEl.classList.add("choice-card--carrot");
    } else {
      cardEl.classList.add("choice-card--tissue");
    }
    const labelEl = cardEl.querySelector(".card-label");
    if (!labelEl) return;

    if (type === "carrot") {
      labelEl.innerHTML = "萝卜<span class=\"en\">carrot</span>";
      cardEl.setAttribute("aria-label", "选择萝卜");
    } else {
      labelEl.innerHTML = "纸巾<span class=\"en\">tissue</span>";
      cardEl.setAttribute("aria-label", "选择纸巾");
    }
  }

  // 辅助函数：控制图片显示
  function showCartImage(type) {
      // type: 'center' | 'left' | 'right'
      if (!cartPlayer || !cartPlayerLeft || !cartPlayerRight) return;
      
      // 先全部隐藏
      cartPlayer.classList.add('hidden');
      cartPlayerLeft.classList.remove('active');
      cartPlayerRight.classList.remove('active');
      
      // 显示指定的图片
      if (type === 'left') {
          cartPlayerLeft.classList.add('active');
      } else if (type === 'right') {
          cartPlayerRight.classList.add('active');
      } else {
          // center 或其他情况显示默认图
          cartPlayer.classList.remove('hidden');
      }
  }

  function spawnRound() {
    if (state.gameState !== "playing") return;
    
    // 每一轮开始时，确保购物车在中间
    moveCart('center');
    showCartImage('center'); // 确保显示默认图

    const correct = Math.random() < 0.5 ? "carrot" : "tissue";
    state.currentCorrectType = correct;

    if (correct === "carrot") {
      questionTextEl.textContent = "主人：帮我拍一拍萝卜～";
      playRandomAudio("carrot");
    } else {
      questionTextEl.textContent = "主人：纸巾在哪儿？帮我选出来！";
      playRandomAudio("paper");
    }

    const firstType = Math.random() < 0.5 ? correct : (correct === "carrot" ? "tissue" : "carrot");
    const secondType = firstType === "carrot" ? "tissue" : "carrot";

    setupCard(cardLeft, firstType);
    setupCard(cardRight, secondType);
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

  function handleCardSelect(cardEl) {
    if (!cardEl || state.gameState !== "playing" || state.inputLocked) return;
    const type = cardEl.dataset.type;
    if (!type) return;
    state.inputLocked = true;
    
    // 1. 移动购物车
    // 判断点击的是左边还是右边
    if (cardEl === cardLeft) {
        showCartImage('left'); // 切换为向左的图片
        moveCart('left');
    } else {
        showCartImage('right'); // 切换为向右的图片
        moveCart('right');
    }

    const isCorrect = type === state.currentCorrectType;

    if (isCorrect) {
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
      cardEl.classList.add("correct");
      playRandomAudio("good");
      showPraiseOverlay();
    } else {
      state.combo = 0;
      updateComboUI();
      hintTextEl.textContent = randomFrom(WRONG_TEXTS);
      cardEl.classList.add("wrong");
      playRandomAudio("wrong");
    }

    setTimeout(() => {
      cardEl.classList.remove("correct", "wrong");
      state.inputLocked = false;
      
      // 每一轮开始时，确保购物车在中间并恢复默认图片
      showCartImage('center');
      spawnRound(); // 这会重置位置到中间
    }, isCorrect ? 420 : 300);
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
    spawnRound();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.lastFrameTs = null;
    state.rafId = window.requestAnimationFrame(gameLoop);
    
    // 监听窗口大小变化以重新计算位置
    window.addEventListener('resize', handleResize);
  }
  
  function handleResize() {
      if (state.gameState === 'playing') {
          // 简单重置到中间，或者根据当前状态保持位置（略复杂，这里简单重置）
          moveCart('center');
      }
  }

  function endGame() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    window.removeEventListener('resize', handleResize);
    
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
    showToast(state.muted ? "已静音，猫猫小声夸你~" : "音效已开启，选对就大声夸！");
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

  function shareResult() {
    const r = state.lastResult;
    const text = `我在「萝卜 vs 纸巾：真棒挑战」里被夸了 ${r.praiseCount} 次，拿到 ${r.finalScore} 分，最高 ${r.maxCombo} 连击，你也来瞎蒙一把？`;

    if (navigator.share) {
      navigator
        .share({
          title: "萝卜 vs 纸巾：真棒挑战",
          text,
          url: window.location.href
        })
        .catch(() => {
          // 用户取消分享无需提示
        });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showToast("分享文案已复制，去粘贴给好友吧～");
        })
        .catch(() => {
          showToast("可以手动截图或复制当前页面链接分享给朋友哦～");
        });
    } else {
      showToast("可以截图或用浏览器菜单把这页分享给朋友～");
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
        shareResult();
      });
    }
    if (muteToggle) {
      muteToggle.addEventListener("click", () => {
        ensureAudioCtx();
        toggleMute();
      });
    }

    const cardHandler = (ev) => {
      ev.preventDefault();
      const target = ev.currentTarget;
      handleCardSelect(target);
    };

    [cardLeft, cardRight].forEach((card) => {
      if (!card) return;
      card.addEventListener("click", cardHandler);
    });

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
    preloadAudios();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
