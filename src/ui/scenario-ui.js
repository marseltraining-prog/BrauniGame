/* Сценарии — интерфейс (логика — src/scenario.js, BK.Scenario).
   Где видно:
     1) стартовый экран — блок «Истории»: карточки пяти историй (значок, название, замысел,
        цель), у пройденных заметная отметка «пройдено ✓» и приглушённый вид, у остальных —
        «ещё не пройдена»; прогресс строкой «Пройдено N из 5 · следующая история выпадет из
        оставшихся», мелкая ссылка «Сбросить пройденные» с подтверждением;
     2) начало партии — карточка-объявление «Новая история» внизу экрана (значок, название,
        одна строка замысла, «Что делать» и что с самого начала не как обычно). Не окно:
        игровой цикл не останавливается, обучение новичка не перекрывается (BK.Tutorial);
     3) экран конца партии — блок «Пройдено N из 5» крупно, сыгранная история, что осталось
        и кнопка «Начать заново — пройти другую историю» (forSummary зовёт src/ui/extras.js);
     4) срок истории вышел, а цель не выполнена — отдельное окно «История не сложилась»
        (notify → app.js.handleNotify), плюс строка в «Требует внимания» до конца партии:
        игра продолжается, но история не засчитана и «Пройдено N из 5» не растёт.
   В app.js / extras.js — только хуки: startOpt() в форме старта, ACT.scenAgain, forSummary(S).
   Своя разметка — только через data-scen-act: ничего чужого не связываем. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const SC = () => BK.Scenario, APP = () => BK.App;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(n) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const NUMW = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть'];   // «ещё три истории», а не «ещё 3 истории»
  const moreTxt = (n) => `${NUMW[n] || n} ${plural(n, 'история', 'истории', 'историй')}`;
  const allTxt = (n) => `все ${NUMW[n] ? NUMW[n].replace(/одна$/, 'одну') : n} ${plural(n, 'историю', 'истории', 'историй')}`;
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 7h8M8 11h5"/></svg>';
  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  // «Выжить полгода и выйти в плюс» → «выжить полгода и выйти в плюс»: цель читается как продолжение строки
  const low1 = (s) => { s = String(s == null ? '' : s); return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; };
  const nm = (d, id) => esc((d && d.name) || id || 'история');
  const goal = (d) => (d && d.goal ? low1(d.goal) : '');
  const ic = (d) => esc((d && d.icon) || '📖');

  /* прогресс четырьмя точками: пройденные — с галочкой; на узком экране остаётся только счёт */
  function pips(p, big) {
    return `<span class="scen-pips${big ? ' big' : ''}" aria-hidden="true">${SC().all().map((id) => {
      const d = SC().info(id) || {}, on = p.played.indexOf(id) >= 0;
      return `<i class="scen-pip${on ? ' on' : ''}" title="${esc((on ? 'пройдено: ' : 'ещё не пройдена: ') + (d.name || id))}">${on ? '✓' : ''}</i>`;
    }).join('')}</span>`;
  }

  /* ---------------- 1. стартовый экран: карточки историй ---------------- */
  function card(id, p) {
    const d = SC().info(id) || {}, was = p.played.indexOf(id) >= 0, gl = goal(d);
    const radio = document.querySelector('#startForm input[name="startCity"]:checked');
    const city = radio ? radio.value : 'ufa';
    const localCity = d.start && d.start.city;
    const cityHint = localCity && localCity !== city ? (BK.StartCity && !BK.StartCity.available(localCity)
      ? 'Откроется после первой завершённой партии, при выборе Москвы.'
      : 'Выпадает при выборе Москвы.') : '';
    return `<li class="scen-card${was ? ' done' : ''}">
      <span class="scen-ic" aria-hidden="true">${ic(d)}</span>
      <span class="scen-b">
        <span class="scen-n">${nm(d, id)}</span>
        <span class="scen-d">${esc(d.text || '')}</span>
        ${gl ? `<span class="scen-g">Цель: ${esc(gl)}</span>` : ''}
        <span class="scen-s${was ? ' on' : ''}">${was ? 'пройдено ✓' : 'ещё не пройдена'}</span>
        ${!was && cityHint ? `<span class="scen-g">${cityHint}</span>` : ''}
        ${!was && d.start && d.start.strat ? '<span class="scen-g">Не выпадает, если на старте выбран другой путь.</span>' : ''}
      </span></li>`;
  }
  function startOpt() {
    const p = SC().progress();
    if (!p.total) return '';
    const n = p.played.length, all = n >= p.total;
    const num = `<b>Пройдено <span class="scen-num">${n}</span> из <span class="scen-num">${p.total}</span></b>`;
    const sum = all
      ? `${num} · все истории пройдены — сбросьте прогресс, чтобы сыграть заново`
      : n === 0
        ? `${num} · история выпадет для выбранного города`
        : `${num} · следующая история выпадет из оставшихся`;
    return `<fieldset class="scenpick"><legend>Истории</legend>
      <div class="scen-head">${pips(p)}<span class="scen-sum">${sum}</span></div>
      <ul class="scen-cards">${SC().all().map((id) => card(id, p)).join('')}</ul>
      <div class="scen-foot">
        <span class="hint">История выпадает из непройденных для выбранного города. «Старт в Москве» — только в Москве, «Только кофейни» — если путь не выбран или выбраны «Кофейни». Если подходящих историй нет, начнётся обычная партия.</span>
        ${n ? `<span class="scen-reset"><button type="button" class="linkbtn" data-scen-act="ask">Сбросить пройденные</button></span>` : ''}
      </div></fieldset>`;
  }
  // подтверждение сброса — на месте ссылки, без системных окон браузера
  const askHtml = () => '<span class="scen-conf"><span>Сбросить прогресс всех историй?</span>'
    + '<button type="button" class="btn sm danger" data-scen-act="yes">Да, сбросить</button>'
    + '<button type="button" class="btn sm" data-scen-act="no">Отмена</button></span>';
  // перерисовать только блок «Истории» на стартовом экране
  function redraw() {
    const f = document.querySelector('#startForm .scenpick');
    if (f) f.outerHTML = startOpt();
  }

  /* ---------------- 2. экран конца партии: «Пройдено N из 5» ---------------- */
  function miniCard(id) {
    const d = SC().info(id) || {}, gl = goal(d);
    return `<li><span class="scen-ic sm" aria-hidden="true">${ic(d)}</span><span class="scen-b">
      <span class="scen-n sm">${nm(d, id)}</span>
      <span class="scen-d">${esc(d.text || '')}</span>
      ${gl ? `<span class="scen-g">Цель: ${esc(gl)}</span>` : ''}</span></li>`;
  }
  function endingHtml(S) {
    const p = SC().progress();
    if (!p.total) return '';
    const cur = SC().current(S), d = cur ? SC().info(cur) : null;
    const n = p.played.length, left = p.left, counted = !!(cur && p.played.indexOf(cur) >= 0);
    let s = `<div class="sec scen-end" id="scenEnd"><div class="scen-end-box">`;
    s += `<div class="scen-end-top"><span class="scen-end-ey">Истории</span>
      <b class="scen-end-h">Пройдено <span class="scen-end-num">${n}</span> из ${p.total}</b>
      ${pips(p, true)}</div>`;
    if (d) s += `<div class="scen-end-cur">
      <span class="scen-ic" aria-hidden="true">${ic(d)}</span>
      <span class="scen-b">
        <span class="scen-end-lb">Эта партия — история</span>
        <span class="scen-n">${nm(d, cur)}</span>
        <span class="scen-s${counted ? ' on' : ''}">${counted ? 'пройдено ✓ — засчитана' : 'не засчитана: цель истории не выполнена'}</span>
        ${!counted && goal(d) ? `<span class="scen-g">Что было нужно: ${esc(goal(d))}</span>` : ''}
      </span></div>`;
    s += `<p class="scen-end-lead">${left.length
      ? `Это не конец, а начало новой партии: <b>впереди ещё ${moreTxt(left.length)}</b> — и каждая идёт по своим правилам с самого первого дня.`
      : `Вы прошли ${allTxt(p.total)} — это уже легенда. Прогресс можно сбросить на стартовом экране и пройти любую из них заново.`}</p>`;
    if (left.length) s += `<div class="scen-end-left"><span class="scen-end-lb">Осталось пройти</span>
      <ul class="scen-mini">${left.map(miniCard).join('')}</ul></div>`;
    s += `<button type="button" class="btn primary scen-again" data-act="scenAgain">${left.length
      ? 'Начать заново — пройти другую историю'
      : 'Начать заново — обычную Уфу'}</button>`;
    s += `<p class="hint scen-end-hint">${left.length
      ? 'Новая партия начнётся сразу, с другой непройденной историей. Название сети, сложность и соперник останутся как в этой игре.'
      : 'Все истории пройдены: новая партия будет обычной Уфой. Прогресс историй можно сбросить на стартовом экране.'}</p>`;
    return s + '</div></div>';
  }
  const forSummary = (S) => (SC().current(S) ? endingHtml(S) : '');

  /* ---------------- 2б. провал истории: «срок вышел, цель не выполнена» ----------------
     Срок считает src/scenario.js (BK.Scenario.day) — он же кладёт в S.notify уведомление
     { type:'scen', phase:'expired' | 'saved' }. До правки его никто не читал, поэтому
     провал («Наследство»: полгода прошли, пекарня не спасена) игрок не видел — партия
     просто продолжалась. Теперь app.js зовёт notify(n) и ставит вернувшееся окно в очередь,
     а пока история провалена, в «Требует внимания» висит строка со ссылкой на это окно.
     Прогресс «Пройдено N из 5» не трогаем: засчитывается по-прежнему только выполненная
     цель (BK.Scenario.finish → markDone), провал ничего не отмечает. */
  const dnw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  function failHtml(S, n) {
    const Sc = SC(), cur = Sc.current(S), d = cur ? Sc.info(cur) : null;
    if (!d) return '';
    const p = Sc.progress(), st = Sc.state(S) || {};
    const was = d.days ? dnw(d.days, 'день', 'дня', 'дней') : '';
    const held = (st.at != null && S.day > st.at) ? S.day - st.at : null;
    return `<div class="modal-h"><span class="eyebrow neg">История не сложилась</span><h2>«${nm(d, cur)}»: срок вышел</h2></div>
      <div class="modal-b">
        <p style="margin:0">Прошло ${held != null ? dnw(held, 'день', 'дня', 'дней') : was || 'отведённое время'}, а цель истории так и не выполнена. <b>История проиграна</b> — в зачёт она не идёт.</p>
        ${goal(d) ? `<div class="kpis"><div class="kpi wide"><span class="k">Что было нужно</span><span class="v scen-goal-v">${esc(goal(d))}</span></div></div>` : ''}
        <p style="margin:0">Что дальше: <b>игра продолжается</b> обычным ходом — цель сети 5 млрд ₽ и второй акт «Россия» никуда не делись. Просто эта история останется непройденной: при новой игре она снова выпадет из оставшихся, а на экране итогов будет видно «Пройдено ${p.played.length} из ${p.total}».</p>
        <p class="hint" style="margin:0">${esc(d.failNote || 'Правила истории (спрос, мука, срок) закончились вместе с её сроком — штрафов «за провал» в игре нет.')}</p>
      </div>
      <div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button></div>`;
  }
  // цель истории выполнена раньше срока: засчитана сразу (scenario.js, d.reached → markDone)
  function reachedHtml(S, d, n) {
    const p = SC().progress(), st = SC().state(S) || {};
    const held = (n && n.day != null && st.at != null) ? n.day - st.at : null;
    const yrs = held != null ? Math.max(1, Math.round(held / 36.5) / 10) : null;
    return `<div class="modal-h"><span class="eyebrow pos">История сложилась</span><h2>«${nm(d, n.id)}»: цель выполнена</h2></div>
      <div class="modal-b">
        ${goal(d) ? `<div class="kpis"><div class="kpi wide"><span class="k">Цель</span><span class="v scen-goal-v">${esc(goal(d))}</span>${yrs ? `<span class="d">выполнено за ${String(yrs).replace('.', ',')} ${plural(Math.floor(yrs), 'год', 'года', 'лет')}</span>` : ''}</div></div>` : ''}
        <p style="margin:0">История засчитана: <b>пройдено ${p.played.length} из ${p.total}</b>. Игра продолжается — цель сети 5 млрд ₽ и второй акт «Россия» впереди, правила истории остаются до конца партии.</p>
      </div>
      <div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button></div>`;
  }
  // app.js (handleNotify) зовёт это на уведомление сценария и, если вернулась функция,
  // ставит её в очередь модальных окон — тогда «победа» / «банкротство» того же дня
  // показываются раньше (они кладутся в начало очереди).
  function notify(n) {
    if (!n || !n.id) return null;
    const S = APP() && APP().state, d = SC().info(n.id);
    if (!S || !d) return null;
    if (n.phase === 'expired') {
      if (BK.Sound) BK.Sound.play('warn');
      return () => APP().openModal(failHtml(S, n), { closable: true });
    }
    if (n.phase === 'reached') {                       // цель выполнена раньше срока («Только кофейни»)
      if (BK.Sound) BK.Sound.play('fanfare');
      return () => APP().openModal(reachedHtml(S, d, n), { closable: true });
    }
    if (n.phase === 'saved') {
      if (BK.Sound) BK.Sound.play('fanfare');
      APP().toast('История сложилась', `«${d.name}»: ${goal(d) || 'цель выполнена'} — зачтено (${SC().progressHtml()}).`, 'good');
    }
    return null;
  }
  // строка в «Требует внимания» (panels.js), пока история провалена и партия идёт дальше
  function attItems(S) {
    if (!S || S.lost || !SC() || !SC().failed || !SC().failed(S)) return [];
    const cur = SC().current(S), d = cur ? SC().info(cur) : null;
    if (!d) return [];
    return [{ lvl: 'warn', ic: 'alert', t: `История «${d.name}» не сложилась`,
      d: `Срок вышел, цель не выполнена${goal(d) ? ': ' + esc(goal(d)) : ''}. Игра идёт дальше, история не засчитана.`,
      b: { act: 'scenFail', label: 'Подробнее' } }];
  }
  function openFail() {
    const S = APP() && APP().state;
    if (!S) return;
    const html = failHtml(S);
    if (html) APP().openModal(html, { closable: true });
  }

  /* ---------------- 3. начало партии: «выпала история» ---------------- */
  /* Уведомление { type:'scen', phase:'start' } движок кладёт в S.notify, но обработчика под него
     в app.js нет — свою карточку рисуем сами: перехватываем BK.Scenario.set / applyStart, забираем
     уведомления из очереди и показываем карточку, когда игрок уже увидел игру (не пролог и не кофейню). */
  let pend = null, watchT = null, autoT = null, tries = 0;
  function takeNotify(S) {
    const q = S && S.notify; if (!q || !q.length) return { id: null, what: '' };
    let id = null, what = '';
    for (let i = q.length - 1; i >= 0; i--) {
      const t = q[i];
      if (!t || t.type !== 'scen' || (t.phase !== 'start' && t.phase !== 'applied')) continue;
      if (t.phase === 'start') id = t.id || id;
      else if (t.what) what = t.what;
      q.splice(i, 1);
    }
    return { id, what };
  }
  function hook() {
    const Sc = BK.Scenario; if (!Sc || Sc.__uiHook) return;
    Sc.__uiHook = true;
    const oSet = Sc.set, oApply = Sc.applyStart;
    Sc.set = function (S, id) {
      const r = oSet.apply(this, arguments);
      takeNotify(S);                                  // свою карточку показываем сами, очередь чистим
      if (r) { pend = { S: S, id: r, what: '' }; watch(); }
      return r;
    };
    Sc.applyStart = function (S) {
      const r = oApply.apply(this, arguments);
      const got = takeNotify(S);
      if (pend && pend.S === S) { if (got.what) pend.what = got.what; }
      return r;
    };
  }
  // ждём начала самой игры: пролог «Бариста» и стадия 1 «Своя кофейня» — свои слои поверх игры
  function watch() {
    if (watchT) return;
    tries = 0;
    watchT = setInterval(() => {
      tries++;
      if (!pend || tries > 3000) return stop();
      const A = APP(), S = A && A.state;
      if (!S || S !== pend.S) return stop();          // игра сменилась или вышли к списку игр
      const startEl = document.getElementById('start');
      if (startEl && !startEl.hidden) return;         // ещё стартовый экран
      if ((BK.PrologueUI && BK.PrologueUI.active && BK.PrologueUI.active())
        || (BK.Stage1UI && BK.Stage1UI.active && BK.Stage1UI.active())) return; // ждём свою сеть
      const p = pend; stop(); show(p);
    }, 700);
  }
  function stop() { if (watchT) { clearInterval(watchT); watchT = null; } }
  const cardEl = () => document.getElementById('scenStart');
  function measure() {
    const b = cardEl(); if (!b || b.hidden) return;
    const h = Math.round(b.getBoundingClientRect().height);
    if (h) document.documentElement.style.setProperty('--scs-h', h + 'px');
    document.documentElement.classList.add('scs-on');
  }
  function show(p) {
    const Sc = SC(), d = Sc && Sc.info(p.id); if (!d) return;
    const startEl = document.getElementById('start');
    if (startEl && !startEl.hidden) return;
    // карточку рисуют два механизма (перехват старта и опрос) — если она уже показана для этой же
    // истории, второй раз разметку не трогаем: иначе клик по крестику «отваливается» вместе с DOM
    const already = cardEl();
    if (already && already.__scenId === p.id && already.offsetParent !== null) return;
    let b = cardEl();
    if (b) b.__scenId = p.id;
    if (!b) { b = document.createElement('div'); b.id = 'scenStart'; b.className = 'scen-start'; b.setAttribute('role', 'status'); b.__scenId = p.id; document.body.appendChild(b); }
    const pr = Sc.progress(), gl = goal(d);
    b.innerHTML = `<div class="scs-card" data-scen-act="closeStart">
      <span class="scs-ic" aria-hidden="true">${ic(d)}</span>
      <div class="scs-b">
        <span class="scs-ey">Новая история · пройдено ${pr.played.length} из ${pr.total}</span>
        <b class="scs-n">${nm(d, p.id)}</b>
        <p class="scs-t">${esc(d.text || '')}</p>
        ${gl ? `<p class="scs-g"><b>Что делать:</b> ${esc(gl)}</p>` : ''}
        ${p.what ? `<p class="scs-w">С самого начала не как обычно: ${esc(p.what)}.</p>` : ''}
      </div>
      <button type="button" class="scs-x" data-scen-act="closeStart" aria-label="Понятно — закрыть">${X}</button>
    </div>`;
    b.hidden = false;
    b.classList.toggle('tut-safe', !!(BK.Tutorial && BK.Tutorial.active && BK.Tutorial.active(APP().state))); // не спорим с обучением новичка
    requestAnimationFrame(() => { b.classList.add('on'); measure(); });
    setTimeout(measure, 80);
    if (autoT) clearTimeout(autoT);
    autoT = setTimeout(hideCard, 16000);
    if (BK.Sound) BK.Sound.play('fanfare');
  }
  function hideCard() {
    if (autoT) { clearTimeout(autoT); autoT = null; }
    const b = cardEl();
    if (b) { b.classList.remove('on'); b.hidden = true; b.innerHTML = ''; }
    document.documentElement.classList.remove('scs-on');
    document.documentElement.style.removeProperty('--scs-h');
    pend = null;
  }

  /* ---------------- 4. действия ---------------- */
  function again() {                                  // «Начать заново — пройти другую историю»
    const A = APP(), S = A && A.state;
    if (!S) { if (A && A.toStart) A.toStart(); return; }
    const name = S.company || 'Пекарня «Каравай»', diff = S.difficulty || 'normal';
    const rival = !!(S.rival && S.rival.enabled);
    const st = BK.Strat && BK.Strat.info ? BK.Strat.info(S) : null;
    const strat = (st && st.chosen && st.id) || '';   // выбранный путь сохраняем, «сложился сам» — оставляем как есть
    if (BK.Slots && BK.Slots.beforeNew && !BK.Slots.beforeNew()) return; // все слоты заняты — тост уже показан, окно итогов не закрываем
    A.closeModal();
    A.newGame(name, diff, { scen: 'random', strat: strat, rival: rival });
    if (BK.Scenario && !BK.Scenario.current(A.state)) A.toast('Истории', 'Все истории пройдены — играем обычную Уфу. Сбросить прогресс можно на стартовом экране.', 'warn');
  }
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-scen-act]') : null; if (!t) return;
    const a = t.getAttribute('data-scen-act');
    if (a === 'closeStart') { hideCard(); return; }
    if (a === 'ask') { const box = t.closest('.scen-reset'); if (box) box.innerHTML = askHtml(); return; }
    if (a === 'no') { redraw(); return; }
    if (a === 'yes') {
      SC().resetDone(); redraw();
      APP().toast('Истории', `Прогресс историй сброшен — снова выпадают ${allTxt(SC().all().length)}.`, 'warn');
    }
  }
  function bindStart() {                              // одна привязка на документ: блок перерисовывается — обработчик остаётся
    if (document.__scenUI) return; document.__scenUI = true;
    document.addEventListener('click', onClick);
    window.addEventListener('resize', measure);
  }
  function boot() {
    bindStart();
    hook();
    const A = APP() && APP().ACT; if (!A || A.__scenUI) return; A.__scenUI = true;
    A.scenAgain = again;
    A.scenFail = openFail; // «Подробнее» в «Требует внимания»: окно «История не сложилась»
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.ScenarioUI = { reachedHtml, startOpt, bindStart, redrawStart: redraw, endingHtml, forSummary, pips, ICON, notify, attItems, failHtml, openFail };
})();
