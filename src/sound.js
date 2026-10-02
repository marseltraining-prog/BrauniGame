/* =====================================================================
   ЗВУК «Хлебной карты» (vision-plan §4 п. 3, этап В2 «Живость»).
   Все звуки синтезируются кодом через WebAudio — файлов нет, сборка не растёт.
   Тихие по умолчанию (громкость ниже обычной), включаются кнопкой в HUD и в «Меню игры»;
   выбор игрока — localStorage['bk-ufa-sound'] ('0' — выключено, '1' — включено; по умолчанию включено, но тихо).

   Что звучит (по §4 п. 3):
     coin    — касса: короткий «дзынь-дзынь» (мелкое поступление, продажа);
     money   — 1-е число: горсть монет и касса (итоги месяца);
     ribbon  — открытие точки/цеха: колокольчик с ленточкой;
     fanfare — веха (короткое задание выполнено);
     sparkle — достижение;
     warn    — предупреждение (негативное событие, проблема);
     bad     — банкротство/провал;
     click   — очень тихий отклик интерфейса (кнопки-действия).

   Требования к надёжности: модуль не должен ломать игру, если WebAudio нет (старый Safari, тесты, Node):
   всё в try/catch, `play` в таком случае просто ничего не делает. Звук не играет в скрытой вкладке.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const KEY = 'bk-ufa-sound';
  const MASTER = 0.16;              // «тихие по умолчанию»: общая громкость невелика
  const RATE = 0.045;               // один и тот же звук не чаще раза в 45 мс (на ×10 иначе трещит)
  let on = null, ctx = null, master = null, last = {};

  function stored() { try { const v = localStorage.getItem(KEY); return v == null ? null : v === '1'; } catch (e) { return null; } }
  function isOn() { if (on == null) on = stored(); return on !== false; } // нет записи — включено (тихо)
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (on) resume(); else stopAll();
    syncBtns();
    return on;
  }
  function toggle() { return set(!isOn()); }

  function ac() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function resume() { const c = ac(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  function stopAll() { if (master) { try { master.gain.value = 0; setTimeout(() => { if (master) master.gain.value = MASTER; }, 60); } catch (e) {} } }

  /* ---------- кирпичики синтеза ---------- */
  // нота: осциллятор с огибающей. o: { f, f2, t (задержка), d (длина), type, vol, sweep }
  function tone(o) {
    const c = ac(); if (!c || !master) return;
    const t0 = c.currentTime + (o.t || 0), d = o.d || 0.1;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(Math.max(20, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + d * (o.sweep || 1));
    const v = (o.vol == null ? 1 : o.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + d + 0.03);
  }
  // шум (касса, «шшш» монет): короткий буфер с полосовым фильтром
  function noise(o) {
    const c = ac(); if (!c || !master) return;
    const t0 = c.currentTime + (o.t || 0), d = o.d || 0.08;
    const n = Math.max(1, Math.floor(c.sampleRate * d));
    const buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.hz || 2600; f.Q.value = o.q || 1.1;
    const g = c.createGain(); g.gain.value = o.vol == null ? 0.5 : o.vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const RECIPES = {
    coin: (c) => { tone({ f: 1046, d: 0.07, vol: 0.5 }); tone({ f: 1568, d: 0.11, t: 0.055, vol: 0.42 }); noise({ hz: 3600, d: 0.05, vol: 0.16, t: 0.01 }); },
    money: (c) => {
      noise({ hz: 2400, d: 0.09, vol: 0.3 });
      const ns = [1568, 1397, 1245, 1046];
      ns.forEach((f, i) => tone({ f, d: 0.09, t: 0.03 + i * 0.055, vol: 0.34 - i * 0.03 }));
      tone({ f: 2093, d: 0.16, t: 0.27, vol: 0.3 });
    },
    ribbon: (c) => { tone({ f: 880, f2: 1420, d: 0.16, type: 'sine', vol: 0.42, sweep: 0.7 }); tone({ f: 1318, d: 0.5, t: 0.1, type: 'sine', vol: 0.34 }); tone({ f: 2637, d: 0.42, t: 0.1, type: 'sine', vol: 0.16 }); },
    fanfare: (c) => { [523, 659, 784, 1046].forEach((f, i) => { tone({ f, d: i === 3 ? 0.34 : 0.13, t: i * 0.1, vol: 0.34 }); tone({ f: f * 2, d: 0.1, t: i * 0.1, vol: 0.1 }); }); },
    sparkle: (c) => { tone({ f: 1318, d: 0.09, vol: 0.3 }); tone({ f: 1976, d: 0.16, t: 0.08, vol: 0.26 }); tone({ f: 2637, d: 0.2, t: 0.16, vol: 0.16 }); },
    warn: (c) => { tone({ f: 392, d: 0.13, type: 'sine', vol: 0.3 }); tone({ f: 311, d: 0.2, t: 0.12, type: 'sine', vol: 0.28 }); },
    bad: (c) => { tone({ f: 196, f2: 130, d: 0.5, type: 'sawtooth', vol: 0.22, sweep: 1 }); tone({ f: 98, d: 0.6, t: 0.04, type: 'sine', vol: 0.24 }); },
    click: (c) => { tone({ f: 1500, d: 0.025, type: 'square', vol: 0.1 }); },
  };

  // Главный вход. Возвращает true, если звук действительно попытались проиграть.
  function play(name, o) {
    if (!name || !RECIPES[name] || !isOn()) return false;
    if (typeof document !== 'undefined' && document.hidden) return false; // в скрытой вкладке молчим
    const now = (globalThis.performance ? performance.now() : Date.now());
    if (last[name] && now - last[name] < RATE) return false;
    last[name] = now;
    try { resume(); RECIPES[name](o || {}); } catch (e) { /* WebAudio недоступен — просто тишина */ }
    return true;
  }

  /* ---------- кнопки в интерфейсе ---------- */
  const IC_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.4L9 3.2v9.6L5.4 10H3z" fill="currentColor"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.9a6 6 0 0 1 0 8.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const IC_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.4L9 3.2v9.6L5.4 10H3z" fill="currentColor"/><path d="M11.2 6.4l3.6 3.6M14.8 6.4l-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function syncBtns() {
    if (typeof document === 'undefined') return;
    const v = isOn();
    document.querySelectorAll('[data-act="sound"]').forEach((b) => {
      b.innerHTML = v ? IC_ON : IC_OFF;
      b.setAttribute('aria-pressed', String(v));
      b.setAttribute('aria-label', v ? 'Звук включён. Выключить' : 'Звук выключен. Включить');
      b.title = v ? 'Звук: включён (тихий). Нажмите, чтобы выключить' : 'Звук: выключен. Нажмите, чтобы включить';
    });
    document.querySelectorAll('[data-snd]').forEach((b) => b.setAttribute('aria-pressed', String(String(v) === b.dataset.snd)));
    document.documentElement.classList.toggle('sound-on', v);
  }

  BK.Sound = {
    get on() { return isOn(); },
    play, toggle, sync: syncBtns,
    set,
    // первый жест игрока — можно включать звук (политика браузеров)
    arm() {
      if (typeof document === 'undefined' || BK.Sound.__armed) return;
      BK.Sound.__armed = true;
      const go = () => { if (isOn()) resume(); };
      document.addEventListener('pointerdown', go, { passive: true });
      document.addEventListener('keydown', go);
    },
    IC_ON, IC_OFF,
  };
  if (typeof document !== 'undefined') {
    const init = () => { syncBtns(); try { const m = matchMedia('(prefers-color-scheme: dark)'); if (m && m.addEventListener) m.addEventListener('change', syncBtns); } catch (e) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init);
  }
})();
