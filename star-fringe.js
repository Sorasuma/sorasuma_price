/*
  Звёздная бахрома для блока с текстом.
  Независимый скрипт — сам находит все .star-fringe на странице и
  инициализирует внутри каждой отдельный canvas с нитями звёзд.

  Настройки ниже (FRINGE_CFG) — на весь сайт сразу; если где-то нужна
  другая плотность/сила звука, можно клонировать блок init() с новым
  конфигом и вызвать его для конкретного элемента.
*/
(() => {
  const FRINGE_CFG = {
    columnGap: 62,          // расстояние между нитями, px — заметно реже, для более разреженной бахромы
    starsPerColumn: 5,       // длинные нити — полноценная бахрома, свисающая заметно ниже блока
    segmentLength: 30,
    gravity: 0.05,
    damping: 0.992,
    solverIterations: 3,
    mouseRadius: 46,
    mouseForce: 1.1,
    grabRadiusBase: 14,
    chimeCooldown: 420,      // реже "звенит" — спокойнее, без суеты
    velocityTrigger: 1.6,    // звук только от заметного движения, не от любого дрожания
    minStar: 5,
    maxStar: 8,
    soundPeak: 0.022,        // ощутимо тише — фон для релакса, а не акцент
    soundRelease: [0.7, 1.3] // чуть длиннее хвост — мягче тает, а не обрывается
  };

  const GLYPHS_MAIN = ['☆', '✧', '✦', '✩', '✯', '✮'];
  const GLYPHS_ACCENT = ['⋆', '˚', '｡', '・', '°', '𖦹'];
  function pickGlyph() {
    return Math.random() < 0.2
      ? GLYPHS_ACCENT[(Math.random() * GLYPHS_ACCENT.length) | 0]
      : GLYPHS_MAIN[(Math.random() * GLYPHS_MAIN.length) | 0];
  }

  // японская лестница "ин" — тёплый, сдержанный мелодический характер
  const SCALE = [0, 1, 5, 7, 8];
  const ROOT = 392.0; // G4 — светлее и деликатнее, чем в полноэкранной версии

  // ---------- общий звуковой движок (один на страницу) ----------
  let audioCtx = null;
  let reverbSend = null;
  let soundOn = true;
  let unlocked = false;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      buildReverb();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    unlocked = true;
  }
  // тихая разблокировка звука по первому клику где угодно на странице —
  // без баннеров и оверлеев, раз бахрома встроена в обычный контент
  ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, ensureAudio, { once: true, passive: true });
  });

  function buildReverb() {
    const delayA = audioCtx.createDelay(2.0);
    delayA.delayTime.value = 0.24;
    const delayB = audioCtx.createDelay(2.0);
    delayB.delayTime.value = 0.15;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.22;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.28;
    const input = audioCtx.createGain();
    input.connect(delayA);
    input.connect(delayB);
    delayA.connect(feedback);
    delayB.connect(feedback);
    feedback.connect(filter);
    filter.connect(delayA);
    filter.connect(wet);
    wet.connect(audioCtx.destination);
    reverbSend = input;
  }

  function playChime(freq, panX, strength, kind, cfg) {
    if (!soundOn || !unlocked) return;
    const now = audioCtx.currentTime;
    const pan = Math.max(-1, Math.min(1, panX));
    const isPluck = kind === 'pluck';
    const peak = (isPluck ? cfg.soundPeak * 1.8 : cfg.soundPeak) + cfg.soundPeak * strength;
    const attack = isPluck ? 0.01 : 0.025;
    const [relMin, relMax] = cfg.soundRelease;
    const release = (isPluck ? relMax : relMin) + Math.random() * (relMax - relMin) * 0.4;

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);

    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(peak, now + attack);
    masterGain.gain.exponentialRampToValueAtTime(0.0002, now + attack + release);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 6000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.4, 400), now + attack + release);
    filter.Q.value = 0.25;

    const vibrato = audioCtx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 5 + Math.random() * 1.5;
    const vibratoGain = audioCtx.createGain();
    vibratoGain.gain.value = freq * 0.004;
    vibrato.connect(vibratoGain);

    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    vibratoGain.connect(osc1.frequency);

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.01, now);
    const gain2 = audioCtx.createGain();
    gain2.gain.value = 0.18;

    osc1.connect(filter);
    osc2.connect(gain2); gain2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(panner);
    panner.connect(audioCtx.destination);

    const sendGain = audioCtx.createGain();
    sendGain.gain.value = peak * 0.8;
    masterGain.connect(sendGain);
    sendGain.connect(reverbSend);

    const stopAt = now + attack + release + 0.1;
    vibrato.start(now); vibrato.stop(stopAt);
    osc1.start(now); osc1.stop(stopAt);
    osc2.start(now); osc2.stop(stopAt);
  }

  // ---------- частица нити (Verlet) ----------
  class Star {
    constructor(x, y, pinned, size, freq) {
      this.x = x; this.y = y;
      this.ox = x; this.oy = y;
      this.pinned = pinned;
      this.size = size;
      this.glyph = pickGlyph();
      this.rotOffset = (Math.random() - 0.5) * 0.4;
      this.phase = Math.random() * Math.PI * 2;
      this.twinkleSpeed = 0.5 + Math.random() * 0.7;
      this.freq = freq;
      this.lastChime = -9999;
      this.prevInStrand = null;
    }
    velocity() { return Math.hypot(this.x - this.ox, this.y - this.oy); }
    update(cfg) {
      if (this.pinned) return;
      const vx = (this.x - this.ox) * cfg.damping;
      const vy = (this.y - this.oy) * cfg.damping;
      this.ox = this.x; this.oy = this.y;
      this.x += vx;
      this.y += vy + cfg.gravity;
    }
  }

  function initFringe(container) {
    const cfg = Object.assign({}, FRINGE_CFG, container.dataset.cfg ? JSON.parse(container.dataset.cfg) : {});

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const muteBtn = document.createElement('button');
    muteBtn.className = 'fringe-mute';
    muteBtn.type = 'button';
    muteBtn.title = 'Звук';
    muteBtn.textContent = '✦';
    container.appendChild(muteBtn);
    muteBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      muteBtn.style.opacity = soundOn ? '' : '0.2';
      if (soundOn) ensureAudio();
    });

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W, H, columns = [];
    let mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0 };
    let grabbedStar = null;

    function buildColumns() {
      columns = [];
      const cols = Math.max(3, Math.floor(W / cfg.columnGap));
      const offsetX = (W - (cols - 1) * cfg.columnGap) / 2;
      for (let i = 0; i < cols; i++) {
        const x = offsetX + i * cfg.columnGap + (Math.random() - 0.5) * 5;
        const stars = [];
        const degreeIndex = i % SCALE.length;
        for (let j = 0; j < cfg.starsPerColumn; j++) {
          const y = j * cfg.segmentLength + (j === 0 ? 0 : (Math.random() - 0.5) * 5);
          const size = cfg.minStar + Math.random() * (cfg.maxStar - cfg.minStar);
          const octaveShift = -Math.floor(j / 2);
          const freq = ROOT * Math.pow(2, (SCALE[degreeIndex] + 12 * octaveShift) / 12);
          const star = new Star(x, y, j === 0, size, freq);
          star.prevInStrand = j > 0 ? stars[j - 1] : null;
          stars.push(star);
        }
        columns.push(stars);
      }
    }

    function resize() {
      W = container.clientWidth;
      H = container.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildColumns();
    }

    function solveConstraints() {
      for (const stars of columns) {
        for (let iter = 0; iter < cfg.solverIterations; iter++) {
          for (let i = 0; i < stars.length - 1; i++) {
            const a = stars[i], b = stars[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const diff = (dist - cfg.segmentLength) / dist / 2;
            const offX = dx * diff, offY = dy * diff;
            if (!a.pinned) { a.x += offX; a.y += offY; }
            if (!b.pinned) { b.x -= offX; b.y -= offY; }
          }
        }
      }
    }

    function applyMouseForce() {
      const speed = Math.min(1, Math.hypot(mouse.vx, mouse.vy) / 30);
      for (const stars of columns) {
        for (const s of stars) {
          if (s.pinned || s === grabbedStar) continue;
          const dx = s.x - mouse.x, dy = s.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          const r = cfg.mouseRadius;
          if (distSq < r * r) {
            const dist = Math.sqrt(distSq) || 0.001;
            const falloff = 1 - dist / r;
            const push = falloff * falloff * cfg.mouseForce;
            s.x += (dx / dist) * push;
            s.y += (dy / dist) * push * 0.4;
            const now = performance.now();
            if (now - s.lastChime > cfg.chimeCooldown && speed > 0.04) {
              s.lastChime = now;
              const panX = (s.x / W) * 2 - 1;
              playChime(s.freq, panX, falloff * (0.4 + speed), 'hover', cfg);
            }
          }
        }
      }
    }

    function applyVelocityChimes() {
      const now = performance.now();
      for (const stars of columns) {
        for (const s of stars) {
          if (s.pinned || s === grabbedStar) continue;
          const v = s.velocity();
          if (v > cfg.velocityTrigger && now - s.lastChime > cfg.chimeCooldown) {
            s.lastChime = now;
            const panX = (s.x / W) * 2 - 1;
            playChime(s.freq, panX, Math.min(1, v / 6), 'hover', cfg);
          }
        }
      }
    }

    function findNearestStar(x, y) {
      let closest = null, closestDist = Infinity;
      for (const stars of columns) {
        for (const s of stars) {
          if (s.pinned) continue;
          const d = Math.hypot(s.x - x, s.y - y);
          const grabR = Math.max(cfg.grabRadiusBase, s.size * 1.8);
          if (d < grabR && d < closestDist) { closest = s; closestDist = d; }
        }
      }
      return closest;
    }

    function localCoords(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e) {
      ensureAudio();
      const p = localCoords(e);
      mouse.px = mouse.x = p.x; mouse.py = mouse.y = p.y;
      const hit = findNearestStar(p.x, p.y);
      if (hit) {
        grabbedStar = hit;
        grabbedStar.originalPinned = grabbedStar.pinned;
        grabbedStar.pinned = true;
        grabbedStar.ox = grabbedStar.x;
        grabbedStar.oy = grabbedStar.y;
        canvas.classList.add('grabbing');
        playChime(grabbedStar.freq, (grabbedStar.x / W) * 2 - 1, 1, 'pluck', cfg);
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragUp, { once: true });
      }
    }

    function onDragMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (grabbedStar) {
        grabbedStar.ox = grabbedStar.x; grabbedStar.oy = grabbedStar.y;
        grabbedStar.x = x; grabbedStar.y = y;
      }
    }

    function onDragUp() {
      if (grabbedStar) {
        grabbedStar.pinned = grabbedStar.originalPinned;
        canvas.classList.remove('grabbing');
        grabbedStar = null;
      }
      window.removeEventListener('pointermove', onDragMove);
    }

    function onMove(e) {
      const p = localCoords(e);
      mouse.vx = p.x - mouse.px; mouse.vy = p.y - mouse.py;
      mouse.px = p.x; mouse.py = p.y;
      mouse.x = p.x; mouse.y = p.y;
    }

    function onLeave() { mouse.x = -9999; mouse.y = -9999; }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);

    function drawGlyph(s) {
      const twinkle = 0.7 + 0.3 * Math.sin(performance.now() * 0.002 * s.twinkleSpeed + s.phase);
      let angle = s.rotOffset;
      if (s.prevInStrand) {
        angle = Math.atan2(s.y - s.prevInStrand.y, s.x - s.prevInStrand.x) - Math.PI / 2 + s.rotOffset * 0.4;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(angle);
      ctx.font = `${(s.size * 2.3).toFixed(1)}px "Segoe UI Symbol", "Noto Sans Symbols2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = getComputedStyle(container).getPropertyValue('--fringe-glow').trim() || '#f6cfcf';
      ctx.shadowBlur = s.size * 1.1;
      ctx.globalAlpha = 0.55 + 0.35 * twinkle;
      ctx.fillStyle = getComputedStyle(container).getPropertyValue('--fringe-glyph').trim() || '#f3e3c8';
      ctx.fillText(s.glyph, 0, 0);
      ctx.restore();
    }

    function frame() {
      requestAnimationFrame(frame);
      for (const stars of columns) for (const s of stars) s.update(cfg);
      solveConstraints();
      applyMouseForce();
      applyVelocityChimes();
      mouse.vx *= 0.85; mouse.vy *= 0.85;

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = getComputedStyle(container).getPropertyValue('--fringe-thread').trim() || 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (const stars of columns) {
        ctx.beginPath();
        ctx.moveTo(stars[0].x, stars[0].y);
        for (let i = 1; i < stars.length; i++) ctx.lineTo(stars[i].x, stars[i].y);
        ctx.stroke();
      }
      for (const stars of columns) for (const s of stars) drawGlyph(s);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }

  function init() {
    document.querySelectorAll('.star-fringe').forEach(initFringe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
