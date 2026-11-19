document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();

  const params = new URLSearchParams(window.location.search);
  let currentLessonId = parseInt(params.get("lesson"), 10) || 1;
  if (!LESSONS_SLIDES[currentLessonId]) currentLessonId = 1;

  const progressState = loadProgressState();
  if (!progressState.lessons[currentLessonId]) {
    progressState.lessons[currentLessonId] = { currentSlide: 0, completed: false };
  }

  const playerState = {
    lessonId: currentLessonId,
    slideIndex: progressState.lessons[currentLessonId].currentSlide || 0,
    zoom: 1,
    scores: progressState.scores || {},
    mistakes: progressState.mistakes || {}
  };

  // Populate Lesson Switcher Dropdown
  const lessonSelect = document.getElementById("lessonSelect");
  lessonSelect.innerHTML = LESSONS_DATA.map(
    (l) => `<option value="${l.id}" ${l.id === playerState.lessonId ? "selected" : ""}>${l.code}: ${l.title}</option>`
  ).join("");

  lessonSelect.addEventListener("change", (e) => {
    switchLesson(parseInt(e.target.value, 10));
  });

  function switchLesson(newLessonId) {
    playerState.lessonId = newLessonId;
    const saved = loadProgressState();
    const lessonSaved = (saved.lessons && saved.lessons[newLessonId]) || {};
    playerState.slideIndex = lessonSaved.currentSlide || 0;

    const url = new URL(window.location.href);
    url.searchParams.set("lesson", newLessonId);
    window.history.replaceState({}, "", url);

    renderPlayer();
  }

  function persistProgress(markCompleted = false) {
    const saved = loadProgressState();
    if (!saved.lessons) saved.lessons = {};
    const prev = saved.lessons[playerState.lessonId] || {};
    saved.lessons[playerState.lessonId] = {
      currentSlide: playerState.slideIndex,
      completed: markCompleted || Boolean(prev.completed)
    };
    saved.scores = playerState.scores;
    saved.mistakes = playerState.mistakes;
    saveProgressState(saved);
  }

  function renderSidebar(lesson, slides) {
    document.getElementById("headerLessonBadge").textContent = `${lesson.code} • ${lesson.title}`;
    document.getElementById("sidebarLessonCode").textContent = lesson.code;
    document.getElementById("sidebarLessonTitle").textContent = lesson.title;
    lessonSelect.value = lesson.id;

    const list = document.getElementById("slidesList");
    list.innerHTML = slides
      .map((s, idx) => {
        const isActive = idx === playerState.slideIndex;
        const isVisited = idx < playerState.slideIndex;
        return `
          <li>
            <button type="button" class="slide-nav-item ${isActive ? "active" : ""}" data-slide-idx="${idx}">
              <span class="slide-num-pill">${s.number}</span>
              <span class="slide-nav-title">${s.title}</span>
              ${isVisited ? `<span class="slide-done-check">✓</span>` : ""}
            </button>
          </li>`;
      })
      .join("");

    list.querySelectorAll(".slide-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        playerState.slideIndex = parseInt(btn.dataset.slideIdx, 10);
        document.getElementById("slidesSidebar").classList.remove("open");
        renderPlayer();
      });
    });
  }

  function renderControls(slides) {
    const total = slides.length;
    const current = playerState.slideIndex + 1;
    const pct = Math.round((current / total) * 100);

    document.getElementById("slideCounterText").textContent = `Slide ${current} / ${total}`;
    document.getElementById("progressPercentText").textContent = `${pct}%`;
    document.getElementById("progressFill").style.width = `${pct}%`;

    const prevBtn = document.getElementById("prevSlideBtn");
    const nextBtnText = document.getElementById("nextSlideBtnText");
    prevBtn.disabled = playerState.slideIndex === 0;
    nextBtnText.textContent = playerState.slideIndex === total - 1 ? "Finish Lesson" : "Next Slide";
  }

  function renderPlayer() {
    const lesson = LESSONS_DATA.find((l) => l.id === playerState.lessonId) || LESSONS_DATA[0];
    const slides = LESSONS_SLIDES[lesson.id];
    if (playerState.slideIndex >= slides.length) playerState.slideIndex = 0;

    const currentSlide = slides[playerState.slideIndex];
    const isFinalSlide = playerState.slideIndex === slides.length - 1;
    persistProgress(isFinalSlide);

    renderSidebar(lesson, slides);
    renderControls(slides);

    const canvas = document.getElementById("slideCanvas");
    canvas.innerHTML = renderSlideHTML(currentSlide, lesson, playerState);

    mountSlideInteractions(currentSlide, lesson, {
      goNext: () => {
        if (playerState.slideIndex < slides.length - 1) {
          playerState.slideIndex++;
          renderPlayer();
        }
      },
      recordQuizScore: (lessonId, correct, total, mistakes) => {
        playerState.scores[lessonId] = { correct, total };
        playerState.mistakes[lessonId] = mistakes;
        persistProgress(false);
      },
      openMistakesModal: () => {
        const modal = document.getElementById("reviewModal");
        const body = document.getElementById("reviewModalBody");
        const list = playerState.mistakes[playerState.lessonId] || [];
        if (list.length === 0) {
          body.innerHTML = `<p style="font-weight:700;color:var(--green-success);">🎉 No mistakes recorded in this lesson! Great job!</p>`;
        } else {
          body.innerHTML = list
            .map(
              (m) => `
              <div class="mistake-item">
                <strong>${m.question}</strong>
                <div style="font-size:0.86rem;color:var(--red-accent);margin-top:4px;">Your answer: ${m.yourAnswer}</div>
                <div style="font-size:0.86rem;color:var(--green-success);">Correct answer: ${m.correctAnswer}</div>
                ${m.explanation ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">${m.explanation}</div>` : ""}
              </div>`
            )
            .join("");
        }
        modal.classList.remove("hidden");
      }
    });
  }

  // Navigation Buttons
  document.getElementById("prevSlideBtn").addEventListener("click", () => {
    if (playerState.slideIndex > 0) {
      playerState.slideIndex--;
      renderPlayer();
    }
  });

  document.getElementById("nextSlideBtn").addEventListener("click", () => {
    const slides = LESSONS_SLIDES[playerState.lessonId];
    if (playerState.slideIndex < slides.length - 1) {
      playerState.slideIndex++;
      renderPlayer();
    } else {
      persistProgress(true);
      window.location.href = "../index.html";
    }
  });

  // Keyboard Arrows
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") document.getElementById("nextSlideBtn").click();
    if (e.key === "ArrowLeft") document.getElementById("prevSlideBtn").click();
  });

  // Zoom Controls
  const viewport = document.getElementById("slideViewport");
  const zoomLabel = document.getElementById("zoomLevelText");
  function applyZoom() {
    viewport.style.transform = `scale(${playerState.zoom})`;
    zoomLabel.textContent = `${Math.round(playerState.zoom * 100)}%`;
  }
  document.getElementById("zoomInBtn").addEventListener("click", () => {
    playerState.zoom = Math.min(1.25, +(playerState.zoom + 0.1).toFixed(2));
    applyZoom();
  });
  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    playerState.zoom = Math.max(0.8, +(playerState.zoom - 0.1).toFixed(2));
    applyZoom();
  });
  document.getElementById("zoomResetBtn").addEventListener("click", () => {
    playerState.zoom = 1;
    applyZoom();
  });

  // Fullscreen Toggle
  document.getElementById("fullscreenBtn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Mobile Sidebar Toggle & Modal Close
  document.getElementById("toggleSidebarBtn").addEventListener("click", () => {
    document.getElementById("slidesSidebar").classList.toggle("open");
  });
  document.getElementById("closeSidebarBtn").addEventListener("click", () => {
    document.getElementById("slidesSidebar").classList.remove("open");
  });
  document.getElementById("closeReviewModal").addEventListener("click", () => {
    document.getElementById("reviewModal").classList.add("hidden");
  });

  renderPlayer();
});
let currentLessonId = 1;
let currentSlideIndex = 0;
let zoomLevel = 100;

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initFullscreenToggle();

  const params = new URLSearchParams(window.location.search);
  const requestedLesson = parseInt(params.get("lesson"), 10);
  if (requestedLesson && SLIDES_BY_LESSON[requestedLesson]) {
    currentLessonId = requestedLesson;
  }

  const state = loadProgressState();
  const savedLesson = state.lessons[currentLessonId];
  if (savedLesson && typeof savedLesson.currentSlide === "number") {
    const maxIdx = SLIDES_BY_LESSON[currentLessonId].length - 1;
    currentSlideIndex = Math.min(Math.max(0, savedLesson.currentSlide), maxIdx);
  }

  populateLessonDropdown();
  bindPlayerEvents();
  updatePlayerHUD();
  loadLessonUI(currentLessonId, currentSlideIndex, false);
});

function updatePlayerHUD() {
  const state = loadProgressState();
  const stats = calculateGamificationStats(state);
  const xpEl = document.getElementById("playerXpText");
  const lvlEl = document.getElementById("playerLevelText");
  if (xpEl) xpEl.textContent = `${stats.totalXp} XP`;
  if (lvlEl) lvlEl.textContent = `Lvl ${stats.level} • A1`;
}

function awardXP(amount, reasonText) {
  const state = loadProgressState();
  state.xp = (state.xp || 0) + amount;
  saveProgressState(state);
  updatePlayerHUD();

  const toast = document.getElementById("xpToast");
  if (toast) {
    toast.textContent = `+${amount} XP${reasonText ? " • " + reasonText : ""} ⚡`;
    toast.classList.remove("hidden");
    clearTimeout(window._xpToastTimer);
    window._xpToastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 2200);
  }
}

function populateLessonDropdown() {
  const select = document.getElementById("lessonSelect");
  if (!select) return;
  select.innerHTML = LESSONS_DATA.map(
    (l) => `<option value="${l.id}" ${l.id === currentLessonId ? "selected" : ""}>${l.code}: ${l.title}</option>`
  ).join("");

  select.addEventListener("change", (e) => {
    const newId = parseInt(e.target.value, 10);
    switchLesson(newId);
  });
}

function switchLesson(newLessonId) {
  currentLessonId = newLessonId;
  const state = loadProgressState();
  const saved = state.lessons[newLessonId];
  currentSlideIndex = saved && !saved.completed ? (saved.currentSlide || 0) : 0;

  const url = new URL(window.location);
  url.searchParams.set("lesson", newLessonId);
  window.history.replaceState({}, "", url);

  loadLessonUI(currentLessonId, currentSlideIndex, false);
}

function loadLessonUI(lessonId, slideIdx, grantSlideXP = false) {
  const lessonMeta = LESSONS_DATA.find((l) => l.id === lessonId) || LESSONS_DATA[0];
  const slides = SLIDES_BY_LESSON[lessonId] || [];

  document.getElementById("headerLessonBadge").textContent = lessonMeta.code;
  document.getElementById("sidebarLessonCode").textContent = lessonMeta.code;
  document.getElementById("sidebarLessonTitle").textContent = lessonMeta.title;

  const select = document.getElementById("lessonSelect");
  if (select) select.value = lessonId;

  currentSlideIndex = slideIdx;
  saveSlideProgress(lessonId, slideIdx, slides.length, grantSlideXP);
  renderSidebarSlides(slides, slideIdx);
  renderCurrentSlide(slides[slideIdx], lessonMeta, slides.length);
  updateBottomControls(slideIdx, slides.length);
}

function saveSlideProgress(lessonId, slideIdx, totalSlides, grantSlideXP) {
  const state = loadProgressState();
  if (!state.lessons[lessonId]) {
    state.lessons[lessonId] = { currentSlide: 0, visited: [], completed: false };
  }
  const entry = state.lessons[lessonId];
  entry.currentSlide = slideIdx;

  const isFirstVisit = !entry.visited.includes(slideIdx);
  if (isFirstVisit) {
    entry.visited.push(slideIdx);
  }

  let xpAdded = 0;
  let toastMsg = "";

  if (grantSlideXP && isFirstVisit) {
    xpAdded += 5;
    toastMsg = "Slide Completed";
  }

  if (slideIdx === totalSlides - 1 && !entry.completed) {
    entry.completed = true;
    const lessonMeta = LESSONS_DATA.find((l) => l.id === lessonId);
    xpAdded += lessonMeta ? lessonMeta.xpReward : 50;
    toastMsg = "Lesson Complete!";
  }

  saveProgressState(state);

  if (xpAdded > 0) {
    awardXP(xpAdded, toastMsg);
  } else {
    updatePlayerHUD();
  }
}

function renderSidebarSlides(slides, activeIdx) {
  const list = document.getElementById("slidesList");
  const state = loadProgressState();
  const visited = (state.lessons[currentLessonId] && state.lessons[currentLessonId].visited) || [];

  list.innerHTML = slides
    .map((slide, idx) => {
      const isActive = idx === activeIdx;
      const isVisited = visited.includes(idx);
      return `
        <li>
          <button class="slide-nav-item ${isActive ? "active" : ""} ${isVisited ? "visited" : ""}" data-slide-idx="${idx}">
            <span class="slide-num-dot">${idx + 1}</span>
            <span class="slide-nav-title">${slide.title}</span>
          </button>
        </li>
      `;
    })
    .join("");

  list.querySelectorAll(".slide-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-slide-idx"), 10);
      loadLessonUI(currentLessonId, idx, true);
      document.getElementById("slidesSidebar").classList.remove("open");
    });
  });
}

function updateBottomControls(slideIdx, totalSlides) {
  const prevBtn = document.getElementById("prevSlideBtn");
  const nextBtn = document.getElementById("nextSlideBtn");
  const nextBtnText = document.getElementById("nextSlideBtnText");
  const counterText = document.getElementById("slideCounterText");
  const percentText = document.getElementById("progressPercentText");
  const progressFill = document.getElementById("progressFill");

  prevBtn.disabled = slideIdx === 0;

  if (slideIdx === totalSlides - 1) {
    nextBtnText.textContent = currentLessonId < LESSONS_DATA.length ? "Next Lesson" : "Finish Course";
  } else {
    nextBtnText.textContent = "Next Slide";
  }

  const pct = Math.round(((slideIdx + 1) / totalSlides) * 100);
  counterText.textContent = `Slide ${slideIdx + 1} / ${totalSlides}`;
  percentText.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

function bindPlayerEvents() {
  document.getElementById("prevSlideBtn").addEventListener("click", () => {
    if (currentSlideIndex > 0) {
      loadLessonUI(currentLessonId, currentSlideIndex - 1, false);
    }
  });

  document.getElementById("nextSlideBtn").addEventListener("click", () => {
    const slides = SLIDES_BY_LESSON[currentLessonId] || [];
    if (currentSlideIndex < slides.length - 1) {
      loadLessonUI(currentLessonId, currentSlideIndex + 1, true);
    } else if (currentLessonId < LESSONS_DATA.length) {
      switchLesson(currentLessonId + 1);
    } else {
      window.location.href = "../index.html";
    }
  });

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight") {
      document.getElementById("nextSlideBtn").click();
    } else if (e.key === "ArrowLeft") {
      document.getElementById("prevSlideBtn").click();
    }
  });

  // Zoom Controls
  const viewport = document.getElementById("slideViewport");
  const zoomLabel = document.getElementById("zoomLevelText");
  const applyZoom = () => {
    viewport.style.transform = `scale(${zoomLevel / 100})`;
    zoomLabel.textContent = `${zoomLevel}%`;
  };

  document.getElementById("zoomInBtn").addEventListener("click", () => {
    zoomLevel = Math.min(130, zoomLevel + 10);
    applyZoom();
  });

  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    zoomLevel = Math.max(70, zoomLevel - 10);
    applyZoom();
  });

  document.getElementById("zoomResetBtn").addEventListener("click", () => {
    zoomLevel = 100;
    applyZoom();
  });

  // Mobile sidebar drawer
  const sidebar = document.getElementById("slidesSidebar");
  document.getElementById("toggleSidebarBtn").addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
  document.getElementById("closeSidebarBtn").addEventListener("click", () => {
    sidebar.classList.remove("open");
  });

  // Review mistakes modal
  document.getElementById("closeReviewModal").addEventListener("click", () => {
    document.getElementById("reviewModal").classList.add("hidden");
  });
}

function speakText(text, btnEl) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.92;

  if (btnEl) {
    btnEl.classList.add("playing");
    utterance.onend = () => btnEl.classList.remove("playing");
    utterance.onerror = () => btnEl.classList.remove("playing");
  }
  window.speechSynthesis.speak(utterance);
}

function renderCurrentSlide(slide, lessonMeta, totalSlides) {
  const canvas = document.getElementById("slideCanvas");
  canvas.style.animation = "none";
  void canvas.offsetWidth;
  canvas.style.animation = "slideEnter 0.25s ease";

  if (slide.type === "intro") {
    canvas.innerHTML = `
      <div class="slide-header-bar">
        <span class="slide-tag">Slide 1 of ${totalSlides} • Lesson Intro</span>
        <button class="audio-btn" data-speak="${escapeAttr(lessonMeta.title + ". " + lessonMeta.intro)}">🔊 Listen</button>
      </div>
      <div class="cover-slide-layout">
        <div>
          <span class="badge-lime">🎮 ${lessonMeta.code} • +${lessonMeta.xpReward} XP</span>
          <h2>${lessonMeta.title}</h2>
          <p class="slide-subtitle">${lessonMeta.intro}</p>
          <ul class="cover-objectives">
            ${lessonMeta.objectives.map((o) => `<li><span class="check-dot">✓</span><span>${o}</span></li>`).join("")}
          </ul>
        </div>
        <div style="text-align:center;">
          ${getLessonIllustrationSVG(lessonMeta.illustrationKey)}
        </div>
      </div>
      <div></div>
    `;
  } else if (slide.type === "vocabulary") {
    canvas.innerHTML = `
      <div>
        <div class="slide-header-bar">
          <span class="slide-tag">Vocabulary</span>
          <span style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">Click 🔊 to hear pronunciation</span>
        </div>
        <h2 class="slide-title">${slide.title}</h2>
        <p class="slide-subtitle">${slide.subtitle}</p>
        <div class="vocab-grid">
          ${slide.items
            .map(
              (item) => `
            <div class="vocab-card">
              <div class="vocab-emoji">${item.emoji}</div>
              <div class="vocab-word">${item.word}</div>
              <div class="vocab-example">"${item.example}"</div>
              <button class="audio-btn" data-speak="${escapeAttr(item.word + ". " + item.example)}">🔊 Listen</button>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div></div>
    `;
  } else if (slide.type === "dialogue") {
    const fullDialogue = slide.lines.map((l) => `${l.speaker}: ${l.text}`).join(" ");
    canvas.innerHTML = `
      <div>
        <div class="slide-header-bar">
          <span class="slide-tag">Conversation Practice</span>
          <button class="audio-btn" data-speak="${escapeAttr(fullDialogue)}">🔊 Play Full Dialogue</button>
        </div>
        <h2 class="slide-title">${slide.title}</h2>
        <p class="slide-subtitle">${slide.subtitle}</p>
        <div class="dialogue-list">
          ${slide.lines
            .map(
              (line, idx) => `
            <div class="dialogue-row ${idx % 2 === 1 ? "right" : ""}">
              <div class="speaker-avatar">${line.speaker[0]}</div>
              <div class="speech-bubble">
                <div class="speech-speaker">${line.speaker}</div>
                <div class="speech-text">${line.text}</div>
                <button class="audio-btn" style="margin-top:8px;" data-speak="${escapeAttr(line.text)}">🔊 Listen</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div></div>
    `;
  } else if (slide.type === "grammar") {
    canvas.innerHTML = `
      <div>
        <div class="slide-header-bar">
          <span class="slide-tag">Grammar Focus</span>
          <span class="badge-accent">A1 Rule</span>
        </div>
        <h2 class="slide-title">${slide.title}</h2>
        <p class="slide-subtitle">${slide.subtitle}</p>
        <table class="grammar-table">
          <thead>
            <tr>
              ${slide.headers.map((h) => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${slide.rows
              .map(
                (row) => `
              <tr>
                ${row.map((cell, cIdx) => `<td>${cIdx === 0 ? `<strong>${cell}</strong>` : cell}</td>`).join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        ${slide.tip ? `<div class="feedback-banner success">💡 Tip: ${slide.tip}</div>` : ""}
      </div>
      <div></div>
    `;
  } else if (slide.type === "activity") {
    renderActivitySlide(canvas, slide, currentLessonId);
  } else if (slide.type === "completion") {
    renderCompletionSlide(canvas, slide, lessonMeta);
  }

  // Bind audio buttons on the rendered slide
  canvas.querySelectorAll("[data-speak]").forEach((btn) => {
    btn.addEventListener("click", () => {
      speakText(btn.getAttribute("data-speak"), btn);
    });
  });
}

function renderCompletionSlide(canvas, slide, lessonMeta) {
  const state = loadProgressState();
  const stats = calculateGamificationStats(state);
  const score = state.scores[lessonMeta.id] || { correct: 0, total: 0 };
  const mistakes = state.mistakes[lessonMeta.id] || [];
  const stars = getLessonStars(lessonMeta.id, state);
  const nextLesson = LESSONS_DATA.find((l) => l.id === lessonMeta.id + 1);

  canvas.innerHTML = `
    <div class="completion-card">
      <div class="trophy-circle">🏆</div>
      <span class="badge-lime">Lesson Completed • +${lessonMeta.xpReward} XP</span>
      <h2 style="font-size:1.95rem;color:var(--deep-purple);">${lessonMeta.title} Complete!</h2>
      <div style="font-size:1.65rem;color:#F59E0B;letter-spacing:4px;">${renderStarsString(stars)}</div>
      <p style="color:var(--text-muted);max-width:520px;">${slide.message}</p>

      <div class="score-summary-pill">
        ⚡ Total XP: ${stats.totalXp} XP (Level ${stats.level}) &nbsp;|&nbsp; Practice Score: ${score.correct} / ${score.total}
      </div>

      <div class="completion-actions">
        ${
          nextLesson
            ? `<button class="btn-primary" id="goNextLessonBtn">Next Lesson: ${nextLesson.title} →</button>`
            : `<a href="../index.html" class="btn-primary">All Lessons Completed! Back to Hub</a>`
        }
        <button class="btn-secondary" id="replayLessonBtn">Replay Lesson</button>
        <button class="btn-secondary" id="openMistakesBtn">Review Mistakes (${mistakes.length})</button>
      </div>
    </div>
  `;

  const nextBtn = document.getElementById("goNextLessonBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => switchLesson(lessonMeta.id + 1));
  }

  document.getElementById("replayLessonBtn").addEventListener("click", () => {
    const st = loadProgressState();
    st.lessons[lessonMeta.id] = { currentSlide: 0, visited: [0], completed: false };
    st.scores[lessonMeta.id] = { correct: 0, total: 0 };
    st.mistakes[lessonMeta.id] = [];
    saveProgressState(st);
    loadLessonUI(lessonMeta.id, 0, false);
  });

  document.getElementById("openMistakesBtn").addEventListener("click", () => {
    const modal = document.getElementById("reviewModal");
    const body = document.getElementById("reviewModalBody");
    if (mistakes.length === 0) {
      body.innerHTML = `<p style="color:var(--green-success);font-weight:800;">🎉 Great job! You have zero mistakes recorded in this lesson.</p>`;
    } else {
      body.innerHTML = mistakes
        .map(
          (m) => `
        <div class="mistake-item">
          <div style="font-weight:800;margin-bottom:4px;">${m.prompt}</div>
          <div style="font-size:0.86rem;color:var(--red-accent);">Your answer: ${m.userAnswer}</div>
          <div style="font-size:0.86rem;color:var(--green-success);font-weight:800;">Correct answer: ${m.correctAnswer}</div>
        </div>
      `
        )
        .join("");
    }
    modal.classList.remove("hidden");
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

