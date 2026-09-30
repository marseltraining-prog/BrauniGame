/* =====================================================================
   «ЖИВАЯ ТОЧКА» В КАРТОЧКЕ ТОЧКИ (BK.PixelUI), vision-plan §4 п. 1–2 (стадия 2).
   Читает реальное состояние точки (только чтение, случайных чисел движка не тратит) и рисует сцену BK.Px.scenes.store:
   - очередь = загрузка команды (st.today.load) × профиль гостей по часу (E.daypartOf: утро/обед/вечер);
   - продавцы = штат (до 4 в окне), усталость — капля и сонное лицо (fatigue), настроение — лицо;
   - витрина пустеет к вечеру: продано по профилю дня; остаток — «Сколько печь» (BAKE_LEVELS.waste) и доля вечера,
     вечерняя скидка раскупает остаток; «дефицит» — витрина пустеет раньше закрытия;
   - пар над хлебом утром при свежей выпечке, курьер — если точка подключена к доставке и сегодня были заказы;
   - свет по часу (утро/день/вечер/ночь); мысли гостей — 1–2 пузыря (очередь / дорого / нет круассанов / вкусно / свежее).
   Часы сцены: «Сейчас» — типичный день точки идёт сам (полчаса за секунду, пока игра не на паузе), или фиксированно
   утро/обед/вечер/ночь. Анимация — только пока карточка видна (BK.Px.stage).
   Встраивание: panels.js storeDetail → storeSlot(S, st) (пустой контейнер с data-keep — морфинг панели его не трогает),
   app.js renderPanel → afterPanel(S) монтирует и обновляет сцену.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px, E = () => BK.Engine, CFG = () => BK.CFG;
  const view = { stage: null, storeId: null, mode: 'auto', hour: 8, lastT: 0, key: '', base: null, capKey: '' };
  const PRESET = { m: 8.3, d: 13, e: 18.6, n: 22.6 };
  const PNAME = { m: 'Утро', d: 'Обед', e: 'Вечер', n: 'Ночь' };
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  // поток гостей по часу по профилю утро/обед/вечер точки
  function prof(dp, h) { return 0.12 + dp.m * 3 * gauss(h, 8.6, 1.3) + dp.d * 3 * gauss(h, 13, 1.5) + dp.e * 3 * gauss(h, 18.4, 1.6); }
  function soldBy(dp, h) { let a = 0, s = 0; for (let x = 7; x < 22; x += 0.25) { const v = prof(dp, x); s += v; if (x < h) a += v; } return s ? a / s : 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const phaseOf = (h) => (h >= 22 || h < 6.5 ? 'n' : h < 11 ? 'm' : h < 16 ? 'd' : 'e');

  // снимок точки (раз в обновление панели)
  function snapshot(S, st) {
    const e = E(), cfg = CFG(), T = st.today || {}, dp = e.daypartOf(st);
    const W = S.waste || { bake: 0, disc: 0 }, bake = clamp(Math.round(W.bake || 0), -3, 3), BL = cfg.BAKE_LEVELS[bake + 3];
    const di = clamp(W.disc | 0, 0, cfg.EVE_DISCOUNTS.length - 1);
    let peak = 0; for (let h = 7; h < 22; h += 0.5) peak = Math.max(peak, prof(dp, h));
    const staff = st.staff.slice().sort((a, b) => b.lvl - a.lvl).slice(0, 4).map((x) => ({
      emo: x.fatigue > 62 ? 'tired' : x.mood < 35 ? 'sad' : x.mood > 78 ? 'happy' : x.mood > 55 ? 'smile' : 'neutral',
      drop: x.fatigue > 50, fat: x.fatigue,
    }));
    const fat = st.staff.length ? st.staff.reduce((a, x) => a + x.fatigue, 0) / st.staff.length : 0;
    let priceIdx = 1; try { priceIdx = e.menuStats(S).priceIdx; } catch (er) { /* старое сохранение */ }
    const hasCro = (S.menu || []).some((m) => /croissant/.test(m.id));
    const state = st.status === 'opening' ? 'opening' : st.status === 'repair' ? 'repair' : (T.closed || !st.staff.length) ? 'closed' : 'open';
    const left = bake < 0 ? 0 : clamp(cfg.WASTE_BASE * BL.waste * dp.wasteK * (1 - cfg.EVE_SELL[di] * dp.eveK), 0.02, 0.6);
    return {
      id: st.id, num: st.num, dp, peak, load: T.load || 0, staff, fat, n: st.staff.length, target: st.staffTarget,
      bake, left, fresh: BL.fresh, disc: Math.round(cfg.EVE_DISCOUNTS[di] * 100), agg: !!(st.agg && T.agg), state,
      rating: e.storeRating ? e.storeRating(S, st) : 4, priceIdx, hasCro, seed: (st.num || 1) * 13 + String(st.id || '').length,
    };
  }
  // данные сцены на час h
  function sceneAt(B, h) {
    const open = B.state === 'open', night = h >= 22 || h < 6.8;
    const pr = prof(B.dp, h) / (B.peak || 1);
    const queue = open && !night ? Math.round(clamp(B.load, 0, 1.9) * pr * 5.2) : 0;
    const sold = soldBy(B.dp, h);
    let fill = B.bake < 0 ? clamp(1 - sold * (1 + 0.16 * -B.bake), 0, 1) : 1 - sold * (1 - B.left);
    if (night) fill = B.bake < 0 ? 0 : B.left;
    if (!open) fill = B.state === 'closed' ? 0.4 : 0;
    const th = [];
    if (open && !night) {
      if (B.load > 1) th.push({ ic: ['clock'], tone: 'bad', t: 'очередь', w: 3 + B.load });
      if (B.priceIdx > 1.12) th.push({ ic: ['rub', 'angry'], tone: 'bad', t: 'дорого', w: 2 + B.priceIdx });
      if (h >= 15 && fill < 0.14) th.push({ ic: [B.hasCro ? 'no:croissant' : 'no:bun'], tone: 'bad', t: B.hasCro ? 'нет круассанов' : 'пустая витрина', w: 2.6 });
      if (B.rating >= 4.35) th.push({ ic: ['heart'], tone: 'good', t: 'вкусно!', w: 1.5 + B.rating / 5 });
      if (h < 11 && B.fresh >= 4.4) th.push({ ic: ['star'], tone: 'good', t: 'свежее!', w: 1.2 });
      if (B.fat > 60) th.push({ ic: ['zzz'], tone: 'norm', t: 'продавцы сонные', w: 1.4 });
    }
    th.sort((a, b) => b.w - a.w);
    return {
      hour: h, queue, long: B.load > 1.05, staff: B.staff, fill, steam: open && h < 11 && B.fresh >= 4, courier: B.agg && h >= 10 && h < 21.5,
      thoughts: th.slice(0, 2), state: open && night ? 'night' : B.state === 'closed' ? 'closed' : B.state, num: B.num, disc: B.disc, look: B.seed,
    };
  }
  const hhmm = (h) => { const H = Math.floor(h) % 24, M = Math.floor((h - Math.floor(h)) * 60 / 10) * 10; return `${H}:${String(M).padStart(2, '0')}`; };
  function caption(sd) {
    const ph = phaseOf(sd.hour), bits = [];
    if (sd.state === 'opening') bits.push('скоро открытие');
    else if (sd.state === 'repair') bits.push('ремонт');
    else if (sd.state === 'closed') bits.push('сегодня закрыто — некому работать');
    else if (sd.state === 'night') bits.push('закрыто до утра');
    else {
      if (sd.steam) bits.push('пар над хлебом');
      bits.push(sd.fill > 0.8 ? 'витрина полная' : sd.fill > 0.4 ? 'витрина наполовину' : sd.fill > 0.12 ? 'витрина пустеет' : 'витрина пустая');
      if (sd.courier) bits.push('курьер за заказом');
    }
    return `${PNAME[ph].toLowerCase()}, ${hhmm(sd.hour)} · ${bits.join(', ')}`;
  }

  /* ---------------- разметка и монтирование ---------------- */
  function storeSlot(S, st) { return Px && Px.scenes && Px.scenes.store ? `<div class="sec pxlive" data-keep="pxl-${st.id}"></div>` : ''; }
  function build(el) {
    el.innerHTML = `<div class="pxl-h"><h3>Вблизи <small>живая точка</small></h3><div class="seg pxl-seg" role="group" aria-label="Время суток в сцене">
      <button type="button" data-pxl="auto" title="Типичный день точки идёт сам">Сейчас</button>${Object.keys(PNAME).map((k) => `<button type="button" data-pxl="${k}">${PNAME[k]}</button>`).join('')}</div></div>
      <div class="pxl-cap" aria-live="off"></div><div class="pxl-slot"></div>
      <div class="pxl-kpis"></div><div class="pxl-th"></div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pxl]'); if (!b) return;
      e.stopPropagation();
      view.mode = b.dataset.pxl; if (view.mode !== 'auto') view.hour = PRESET[view.mode];
      segs(el); if (view.stage) view.stage.paint(performance.now() / 1000); ui(el, true);
    });
  }
  function segs(el) { el.querySelectorAll('[data-pxl]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pxl === view.mode))); }
  function running() { const A = BK.App; const s = A && A.state; return !!(s && s.phase === 'play' && A.ui && A.ui.speed > 0 && !A.ui.modal && !s.lost); }
  function draw(b, t, W, H, d) {
    const B = view.base; if (!B) return;
    if (view.mode === 'auto') {
      const now = performance.now();
      if (view.lastT && running()) { view.hour += Math.min(0.5, (now - view.lastT) / 1000) * 0.5; if (view.hour >= 23.2) view.hour = 6.9; }
      view.lastT = now;
    }
    const sd = sceneAt(B, view.hour);
    view.sd = sd;
    Px.scenes.store(b, t, W, H, sd);
    const el = view.el; if (el) ui(el);
  }
  // подпись и цифры под сценой (обновляются, только когда меняются)
  function ui(el, force) {
    const sd = view.sd, B = view.base; if (!sd || !B) return;
    const cap = caption(sd);
    const kp = `${sd.queue}|${B.n}|${Math.round(B.fat)}|${Math.round(sd.fill * 100)}|${sd.thoughts.map((x) => x.t).join()}|${cap}`;
    if (!force && kp === view.capKey) return; view.capKey = kp;
    const c = el.querySelector('.pxl-cap'); if (c && c.textContent !== cap) c.textContent = cap;
    const k = el.querySelector('.pxl-kpis');
    if (k) k.innerHTML = `<span><b>${sd.queue}</b> ${sd.queue % 10 === 1 && sd.queue % 100 !== 11 ? 'человек' : 'чел.'} в очереди</span><span>Продавцы <b>${B.n}</b> из ${B.target}</span><span class="${B.fat > 60 ? 'negc' : B.fat > 45 ? 'warnc' : ''}">Усталость <b>${Math.round(B.fat)} %</b></span><span>Витрина <b>${Math.round(sd.fill * 100)} %</b></span>`;
    const th = el.querySelector('.pxl-th');
    if (th) th.innerHTML = sd.thoughts.length ? `<span class="hint">Мысли гостей:</span>${sd.thoughts.map((x) => `<span class="chip ${x.tone === 'bad' ? 'bad' : x.tone === 'good' ? 'good' : ''}">${x.t}</span>`).join('')}` : '';
  }
  function afterPanel(S) {
    if (!Px || !Px.stage) return;
    const el = document.querySelector('#pbody .pxlive[data-keep]');
    if (!el) { if (view.stage) { view.stage.detachObs(); } view.el = null; return; }
    const id = el.dataset.keep.slice(4), st = S && S.stores && E().byId(S.stores, id);
    if (!st) return;
    if (!el.querySelector('.pxl-slot')) { build(el); segs(el); }
    if (view.storeId !== id) { view.storeId = id; view.mode = 'auto'; view.hour = 8; view.lastT = 0; segs(el); }
    // снимок состояния — только если что-то изменилось (на ×10 панель обновляется часто)
    const T = st.today || {};
    const key = [id, st.status, st.staff.length, Math.round((T.load || 0) * 20), st.staff.map((x) => (x.fatigue / 8 | 0) + '' + (x.mood / 10 | 0)).join(''), (S.waste || {}).bake, (S.waste || {}).disc, st.agg ? 1 : 0, T.agg ? 1 : 0, Math.round((st.rating || 0) * 10), T.closed ? 1 : 0].join('|');
    if (key !== view.key || !view.base) { view.key = key; view.base = snapshot(S, st); }
    view.el = el;
    if (!view.stage) view.stage = Px.stage({ cls: 'pxl-cv', fps: 8, label: 'Точка вблизи: очередь, продавцы и витрина', height: (W) => (W < 190 ? 100 : 104), scale: (a) => (a >= 700 ? 3 : 2), minW: 150, maxW: 300, draw });
    const slot = el.querySelector('.pxl-slot');
    if (view.stage.slot !== slot || !view.stage.cv.isConnected) view.stage.attach(slot);
    else if (key !== view.lastPaintKey && !(view.stage.vis && !document.hidden && !Px.reduceMotion())) view.stage.paint(performance.now() / 1000); // видимая сцена обновится в своём кадре
    view.lastPaintKey = key;
  }
  BK.PixelUI = Object.assign(BK.PixelUI || {}, { storeSlot, afterPanel, liveView: view, snapshot, sceneAt, setHour: (h) => { view.mode = PRESETKEY(h); view.hour = h; if (view.stage) view.stage.paint(performance.now() / 1000); if (view.el) { segs(view.el); ui(view.el, true); } } });
  function PRESETKEY(h) { for (const k of Object.keys(PRESET)) if (PRESET[k] === h) return k; return 'fixed'; }
})();
