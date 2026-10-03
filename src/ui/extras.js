/* Дополнения интерфейса: слоты сохранений (3 игры), экран «Достижения», тост о достижении, итоговый экран игры.
   Логика достижений и итогов — src/data/achievements.js (BK.Ach). Здесь — только HTML и обработчики.
   Связь с ядром — через BK.App (openModal, closeModal, toast, newGame, toStart, state) и data-act в app.js. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, H = () => BK.UIH, A = () => BK.Ach, APP = () => BK.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fm = (v) => BK.fmtMoney(v);
  const qn = (n) => (/[«»"„“]/.test(n) ? esc(n) : `«${esc(n)}»`);
  const DIFF = { easy: 'Лёгкий', normal: 'Нормальный', hard: 'Хардкор', hardcore: 'Хардкор' };

  /* =================== СЛОТЫ СОХРАНЕНИЙ ===================
     Слот 1 — прежний ключ 'bk-ufa-save-v1' (старое сохранение игрока автоматически становится слотом 1),
     слоты 2–3 — 'bk-ufa-save-v1-slot2/3'. Активный слот (куда идёт автосохранение) — 'bk-ufa-slot'. */
  const N_SLOTS = 3, ACTIVE_KEY = 'bk-ufa-slot';
  const keyOf = (n) => (n === 1 ? 'bk-ufa-save-v1' : 'bk-ufa-save-v1-slot' + n);
  let active = 1;
  try { const a = +localStorage.getItem(ACTIVE_KEY); if (a >= 1 && a <= N_SLOTS) active = a; } catch (e) { /* без хранилища — слот 1 */ }
  const ui = { ask: null }; // ask: { n, kind: 'new'|'del' } — открытое подтверждение на стартовом экране

  function available() { try { const k = '__bk_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } }
  function key(n) { return keyOf(n || active); }
  function setActive(n) { active = n; try { localStorage.setItem(ACTIVE_KEY, String(n)); } catch (e) {} }
  function raw(n) { try { return localStorage.getItem(keyOf(n)); } catch (e) { return null; } }
  function read(n) { const r = raw(n); if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }
  function remove(n) { try { localStorage.removeItem(keyOf(n)); } catch (e) {} }
  function info(n) {
    const r = raw(n); if (!r) return null;
    let st; try { st = JSON.parse(r); } catch (e) { return { broken: true }; }
    if (!st || !Array.isArray(st.stores) || st.day == null) return { broken: true };
    let rev12 = 0; for (const h of (st.history || []).slice(-12)) rev12 += h.rev || 0;
    let ach = 0; if (st.achievements && A()) for (const a of A().LIST) if (st.achievements[a.id] != null) ach++;
    const pr = st.prologue && ['run', 'won', 'life'].includes(st.prologue.status) ? st.prologue : null; // игра ещё в прологе «Бариста»
    return { company: st.company || 'Без названия', day: st.day, stores: st.stores.length, rev12, won: !!st.won, lost: !!st.lost, difficulty: st.difficulty, ach, kb: Math.round(r.length / 1024),
      pro: pr ? { m: pr.m | 0, sav: Math.round((pr.cash || 0) + (pr.box || 0) + (pr.dep || 0) + (pr.depInt || 0)), age: (BK.CFG.PROLOGUE ? BK.CFG.PROLOGUE.AGE0 : 21) + Math.floor((pr.m | 0) / 12), st: pr.status } : null,
      s1: st.stage1 && ['pick', 'run', 'ready', 'failed'].includes(st.stage1.status) ? { st: st.stage1.status, ms: Object.keys(st.stage1.ms || {}).length } : null }; // игра в стадии 1 «Своя кофейня»
  }
  // куда пойдёт новая игра: активный слот, если он пуст или там банкротство, иначе первый свободный
  function target() {
    const cur = info(active);
    if (!cur || cur.broken || cur.lost) return active;
    for (let n = 1; n <= N_SLOTS; n++) if (!raw(n)) return n;
    return null;
  }
  function beforeNew() {
    if (!available()) return true; // без хранилища игра идёт без сохранений
    const t = target();
    if (!t) { APP().toast('Все слоты заняты', 'Нажмите «Новая игра в этот слот» у игры, которую не жалко, или удалите её.', 'warn'); return false; }
    setActive(t); return true;
  }
  const plural = (n, a, b, c) => (H() ? H().plural(n, a, b, c) : c);
  function slotRow(n) {
    const s = info(n), ask = ui.ask && ui.ask.n === n ? ui.ask.kind : null;
    const head = `<span class="slot-n" aria-hidden="true">${n}</span>`;
    if (!s) {
      return `<div class="slot empty">${head}<div class="slot-i"><b>Свободный слот</b><span class="slot-m">Здесь может быть ещё одна сеть</span></div>
        <div class="slot-b"><button class="btn" type="button" data-sa="new" data-n="${n}">Новая игра в этот слот</button></div></div>`;
    }
    if (s.broken) {
      return `<div class="slot">${head}<div class="slot-i"><b>Сохранение повреждено</b><span class="slot-m">Его не получится загрузить</span></div>
        <div class="slot-b">${ask === 'del' ? confirmDel(n, 'повреждённое сохранение') : `<button class="btn" type="button" data-sa="new" data-n="${n}">Новая игра в этот слот</button><button class="btn danger" type="button" data-sa="askDel" data-n="${n}">Удалить</button>`}</div></div>`;
    }
    const chips = [];
    if (n === active) chips.push('<span class="chip">последняя</span>');
    if (s.won) chips.push('<span class="chip good">победа</span>');
    if (s.lost) chips.push('<span class="chip bad">банкротство</span>');
    if (s.difficulty) chips.push(`<span class="chip crust">${esc(DIFF[s.difficulty] || s.difficulty)}</span>`);
    const meta = s.pro ? ['пролог «Бариста»', `${s.pro.age} ${plural(s.pro.age, 'год', 'года', 'лет')}`, `накоплено ${fm(s.pro.sav)}`] : [E().fmtDate(s.day), `${s.stores} ${plural(s.stores, 'точка', 'точки', 'точек')}`, `оборот 12 мес ${fm(s.rev12)}`];
    if (s.s1 && !s.pro) { meta[1] = 'своя кофейня'; meta[2] = `вех главы ${s.s1.ms} из 7`; chips.push(`<span class="chip river">${s.s1.st === 'failed' ? 'кофейня закрылась' : s.s1.st === 'pick' ? 'выбор места' : 'глава 1'}</span>`); }
    if (s.pro) chips.push(`<span class="chip river">${s.pro.st === 'won' ? 'своя точка!' : s.pro.st === 'life' ? 'жизнь в найме' : 'бариста'}</span>`);
    if (s.ach) meta.push(`🏆 ${s.ach}`);
    let btns;
    if (ask === 'del') btns = confirmDel(n, qn(s.company));
    else if (ask === 'new') btns = `<div class="confirm">Игра ${qn(s.company)} будет заменена новой. <button class="btn sm danger" type="button" data-sa="new" data-n="${n}" data-sure="1">Заменить</button><button class="btn sm" type="button" data-sa="cancel">Отмена</button></div>`;
    else btns = `<button class="btn dark" type="button" data-act="continue" data-arg="${n}">${s.lost ? 'Открыть итог' : 'Продолжить'}</button><button class="btn" type="button" data-sa="askNew" data-n="${n}">Новая игра в этот слот</button><button class="btn danger" type="button" data-sa="askDel" data-n="${n}">Удалить</button>`;
    return `<div class="slot${n === active ? ' cur' : ''}">${head}<div class="slot-i"><b>${esc(s.company)}</b><span class="slot-m">${meta.join(' · ')}</span>${chips.length ? `<span class="slot-c">${chips.join('')}</span>` : ''}</div><div class="slot-b">${btns}</div></div>`;
  }
  const confirmDel = (n, what) => `<div class="confirm">Удалить ${what}? Это нельзя отменить. <button class="btn sm danger" type="button" data-sa="del" data-n="${n}">Удалить</button><button class="btn sm" type="button" data-sa="cancel">Отмена</button></div>`;
  function startHtml() {
    if (!available()) return `<div class="slots" id="slots"><p class="hint">Браузер не даёт сохранять данные (приватный режим или запрет хранилища) — играть можно, но прогресс не сохранится после закрытия вкладки.</p></div>`;
    let s = `<div class="slots" id="slots"><h2 class="slots-h">Ваши игры <small>${N_SLOTS} слота, автосохранение раз в месяц</small></h2>`;
    for (let n = 1; n <= N_SLOTS; n++) s += slotRow(n);
    return s + '</div>';
  }
  function bind(el) {
    el.onclick = (e) => {
      const b = e.target.closest('[data-sa]'); if (!b) return;
      e.preventDefault();
      const n = +b.dataset.n, k = b.dataset.sa;
      if (k === 'askDel') ui.ask = { n, kind: 'del' };
      else if (k === 'askNew') ui.ask = { n, kind: 'new' };
      else if (k === 'cancel') ui.ask = null;
      else if (k === 'del') { remove(n); ui.ask = null; APP().toast('Игра удалена', `Слот ${n} свободен.`, 'good'); }
      else if (k === 'new') {
        ui.ask = null; setActive(n);
        const inp = $('#companyName'), nm = (inp && inp.value.trim()) || 'Пекарня «Каравай»'; if (APP().startNew) APP().startNew(nm); else APP().newGame(nm);
        return;
      }
      const box = $('#slots', el); if (box) box.outerHTML = startHtml();
    };
  }
  BK.Slots = { N: N_SLOTS, key, keyOf, setActive, get active() { return active; }, read, info, remove, target, beforeNew, startHtml, bind, available };

  /* =================== ДОСТИЖЕНИЯ =================== */
  const RARN = { c: 'обычное', r: 'редкое', e: 'эпическое' };
  function achToast(n) {
    const a = A() && A().BY_ID[n.id]; if (!a) return;
    const box = $('#toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = `toast achtoast rar-${a.rar}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ai" aria-hidden="true">${a.icon}</span><span class="at"><span class="ey">Достижение · ${RARN[a.rar]}</span><b>${esc(a.name)}</b><span class="ad">${esc(a.desc)}</span></span>`;
    el.title = 'Открыть достижения';
    el.addEventListener('click', () => { el.remove(); if (APP().state) openAchievements(); });
    box.appendChild(el);
    if (BK.Sound) BK.Sound.play('sparkle'); // живость: звук достижения
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 7000);
  }
  let achFilter = 'all';
  function achCard(S, a) {
    const on = A().isOn(S, a.id), hide = a.secret && !on;
    const p = !on && !hide ? A().progress(S, a) : null;
    let meta;
    if (on) meta = `<span class="am"><span class="rar">${RARN[a.rar]}</span> · получено ${E().fmtDate(S.achievements[a.id])}</span>`;
    else if (a.missed && a.missed(S)) meta = `<span class="am"><span class="rar">${RARN[a.rar]}</span> · срок прошёл — в этой игре уже не получить</span>`;
    else if (p && p[1] > 1) {
      const v = Math.min(1, p[0] / p[1]);
      const f = (x) => (p[1] >= 1e6 ? fm(x) : Math.floor(x).toLocaleString('ru-RU') + (a.unit ? ' ' + a.unit : ''));
      meta = `<span class="am"><span class="rar">${RARN[a.rar]}</span> · ${f(Math.min(p[0], p[1]))} из ${f(p[1])}</span><span class="abar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}" aria-label="Прогресс"><i style="width:${(v * 100).toFixed(0)}%"></i></span>`;
    } else meta = `<span class="am"><span class="rar">${hide ? 'секретное' : RARN[a.rar]}</span>${hide ? '' : ' · ещё не получено'}</span>`;
    return `<div class="ach ${on ? 'on' : 'off'} rar-${a.rar}"><span class="ai" aria-hidden="true">${hide ? '?' : a.icon}</span><span class="at"><b>${hide ? '???' : esc(a.name)}</b><span class="ad">${hide ? 'Секретное достижение — откроется, когда выполните условие' : esc(a.desc)}</span>${meta}</span></div>`;
  }
  function achHtml(S) {
    const L = A().LIST, got = A().count(S);
    let s = `<div class="modal-h"><span class="eyebrow">Достижения</span><h2>Получено ${got} из ${L.length}</h2><div class="abar big" aria-hidden="true"><i style="width:${(got / L.length * 100).toFixed(0)}%"></i></div></div><div class="modal-b">`;
    s += `<div class="seg achseg" role="group" aria-label="Какие показать">${[['all', 'Все'], ['on', 'Полученные'], ['off', 'Впереди']].map(([k, l]) => `<button type="button" data-achf="${k}" aria-pressed="${achFilter === k}">${l}</button>`).join('')}</div>`;
    for (const [cat, name] of A().CATS) {
      const items = L.filter((a) => a.cat === cat && (achFilter === 'all' || (achFilter === 'on') === A().isOn(S, a.id)));
      if (!items.length) continue;
      const n = L.filter((a) => a.cat === cat && A().isOn(S, a.id)).length, t = L.filter((a) => a.cat === cat).length;
      s += `<div class="sec"><h3>${name} <small>${n} из ${t}</small></h3><div class="achgrid">${items.map((a) => achCard(S, a)).join('')}</div></div>`;
    }
    if (achFilter !== 'all' && !L.some((a) => (achFilter === 'on') === A().isOn(S, a.id))) s += `<div class="empty">${achFilter === 'on' ? 'Пока ничего — первые достижения придут в первые же дни.' : 'Получено всё!'}</div>`;
    return s + `</div><div class="modal-f">${S.lost ? '<button class="btn primary block" data-act="summary">К итогам игры</button>' : '<button class="btn primary block" data-act="closeModal">Вернуться в игру</button>'}</div>`;
  }
  function openAchievements() {
    const S = APP().state; if (!S || !A()) return;
    A().ensure(S);
    const draw = (keep) => {
      APP().openModal(achHtml(S), { closable: !S.lost, keepScroll: keep });
      const m = $('#modal .modal'); m.classList.add('wide');
      m.querySelectorAll('[data-achf]').forEach((b) => b.addEventListener('click', () => { achFilter = b.dataset.achf; draw(false); }));
    };
    draw(false);
  }

  /* =================== ИТОГОВЫЙ ЭКРАН =================== */
  // линейный график по всей истории: series = [{ v: (h) => число, cls, label, area?, step? }]
  function lineChart(hist, series, label) {
    const n = hist.length;
    if (n < 2) return `<div class="empty">Мало данных — график появится после двух месяцев работы.</div>`;
    const W = 400, Hh = 130, pl = 60, pr = 6, pt = 8, pb = 18;
    const vals = series.map((s) => hist.map((h) => +s.v(h) || 0));
    let max = Math.max(1, ...vals.map((a) => Math.max(...a))), min = Math.min(0, ...vals.map((a) => Math.min(...a)));
    const raw = (max - min) / 3, pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const money = series[0].money !== false;
    let step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((v) => v >= raw) || raw;
    if (!money) step = Math.max(1, Math.round(step)); // штуки (точки, люди) — только целые деления
    max = Math.ceil(max / step - 1e-9) * step; min = Math.floor(min / step + 1e-9) * step;
    const y = (v) => pt + (Hh - pt - pb) * (1 - (v - min) / (max - min || 1));
    const x = (i) => pl + (W - pl - pr) * i / (n - 1);
    const tl = (v) => (Math.abs(v) < 1e-6 ? '0' : money ? fm(v).replace(/\s₽/, '').replace(/,0(?=\s)/, '') : Math.round(v).toLocaleString('ru-RU'));
    let s = `<svg class="chart schart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(label)}">`;
    for (let v = min; v <= max + 1e-6; v += step) s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${tl(v)}</text>`;
    if (min < 0) s += `<line class="zero" x1="${pl}" x2="${W - pr}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
    series.forEach((se, k) => {
      const pts = [];
      vals[k].forEach((v, i) => { if (se.step && i) pts.push(`${x(i).toFixed(1)},${y(vals[k][i - 1]).toFixed(1)}`); pts.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); });
      if (se.area) s += `<polygon class="${se.cls} area" points="${x(0).toFixed(1)},${y(Math.max(0, min)).toFixed(1)} ${pts.join(' ')} ${x(n - 1).toFixed(1)},${y(Math.max(0, min)).toFixed(1)}"/>`;
      s += `<polyline class="${se.cls} ln" points="${pts.join(' ')}"/>`;
    });
    // подписи лет: не больше 5, крайние — к краям
    const years = [...new Set(hist.map((h) => h.y))];
    const every = Math.max(1, Math.ceil(years.length / 5));
    const marks = years.filter((yy, i) => i % every === 0);
    marks.forEach((yy, k) => {
      const i = hist.findIndex((h) => h.y === yy);
      const anchor = i === 0 ? 'start' : k === marks.length - 1 && x(i) > W - 30 ? 'end' : 'middle';
      s += `<text x="${x(i).toFixed(1)}" y="${Hh - 4}" text-anchor="${anchor}">${yy}</text>`;
    });
    s += `</svg><div class="legend">${series.map((se) => `<span><i class="${se.cls}"></i>${se.label}</span>`).join('')}</div>`;
    return s;
  }
  const qt = (t) => (/[«»]/.test(t) ? t : `«${t}»`); // без «двойных» кавычек
  const DEC = {
    prod: (c) => ({ ic: '🏭', t: `Открыт ${c.n}-й цех: ${c.addr}` }),
    open: (c) => ({ ic: '🥐', t: c.num === 1 ? `Первая точка: ${c.addr}` : `Открыта ${c.num}-я точка: ${c.addr}` }),
    close: (c) => ({ ic: '✂️', t: `Закрыта точка №${c.num} (${c.addr}) — прибыль за время работы ${fm(c.pAll)}` }),
    loan: (c) => ({ ic: '🏦', t: `Кредит ${fm(c.v)} — долг вырос до ${fm(c.loan)}` }),
    repay: (c) => ({ ic: '✅', t: `Кредит погашен полностью (${fm(c.v)})` }),
    crisis: (c) => ({ ic: '🌪', t: `Кризис ${qt(c.title)}${c.label ? `: ${qt(c.label)}` : ''}${c.cost ? ` за ${fm(c.cost)}` : ''}` }),
    choice: (c) => ({ ic: c.risky ? '🎲' : '⚖️', t: `${qt(c.title)}: выбрано ${qt(c.label)}${c.cost ? ` за ${fm(c.cost)}` : ''}${c.risky ? ' — с отложенными последствиями' : ''}` }),
    rewind: (c) => ({ ic: '↩️', t: `Переиграли: вернулись сюда с ${E().fmtDate(c.from)}${c.lost ? ' после банкротства' : ''}` }), // «Переиграть» (rewind.js)
    // второй акт (Россия): вход в город, штаб, контроль
    city: (c) => ({ ic: '🗺', t: `${c.bought ? 'Куплена местная сеть' : 'Вход'} ${cityIn(c.id)}${c.cost ? ` за ${fm(c.cost)}` : ''}${c.over ? ' — штаб перегружен' : ''}` }),
    hq: (c) => ({ ic: '🏛', t: `Штаб: отдел «${((BK.CORP_HQ || {})[c.key] || {}).name || c.key}»${c.lvl > 1 ? ', уровень ' + c.lvl : ''}${c.cost ? ` за ${fm(c.cost)}` : ''}` }),
    campaign: (c) => ({ ic: '📣', t: `«Федеральная реклама» за ${fm(c.cost)}` }),
    audit: (c) => ({ ic: '🔎', t: `Аудит ${cityIn(c.city)}${c.found ? ' — нашёл нарушения' : ' — чисто'}` }),
    option: (c) => ({ ic: '📜', t: `Опцион директору ${c.dir}` }),
    caught: (c) => ({ ic: '⚖️', t: `Пойман директор ${c.dir}` }),
  };
  const cityIn = (id) => { const d = (BK.CITY_BY_ID || {})[id]; return d ? d.in || 'в ' + d.name : id; };
  /* итоги второго акта по городам (Р4 ч. 2): сколько открыто, лучший и худший город, директора, таблица */
  function citiesHtml(S) {
    const cr = S.corp; if (!cr || !cr.cities || Object.keys(cr.cities).length < 2 || !BK.Corp) return '';
    const h = H(), rows = Object.keys(cr.cities).map((id) => {
      const c = cr.cities[id], st = BK.Corp.cityStats(S, id), hs = c.hist || [];
      const rev = hs.reduce((a, x) => a + (x[2] || 0), 0), prof = hs.reduce((a, x) => a + (x[3] || 0), 0);
      const d = BK.Dir ? BK.Dir.dirOf(S, c) : null;
      let lossMax = 0, run = 0; for (const x of hs) { if (x[3] < 0) { run++; lossMax = Math.max(lossMax, run); } else run = 0; }
      return { id, name: (BK.CITY_BY_ID[id] || {}).name || id, st, rev, prof, m: hs.length, d, day: c.enteredDay, bought: !!c.bought, lossMax };
    });
    const withHist = rows.filter((r) => r.m >= 6), byP = withHist.slice().sort((a, b) => b.prof - a.prof);
    const best = byP[0], worst = byP.length > 1 ? byP[byP.length - 1] : null;
    const stores = rows.reduce((a, r) => a + r.st.stores, 0), dirs = (cr.directors || []).length, st = cr.stat || {};
    const f = BK.Dir && BK.Dir.fedStatus ? BK.Dir.fedStatus(S) : null, yrs = (S.day - cr.unlockedDay) / 365;
    const hl = BK.HQ && BK.HQ.load ? BK.HQ.load(S) : null;
    let s = `<div class="sec sumcities"><h3>Россия: города <small>второй акт · ${String(Math.round(yrs * 10) / 10).replace('.', ',')} ${plural(Math.round(yrs), 'год', 'года', 'лет')} после выхода</small></h3>`;
    s += `<div class="kpis sumk"><div class="kpi"><span class="k">Городов открыто</span><span class="v">${rows.length - 1}${rows.some((r) => r.bought) ? ` <small>(${rows.filter((r) => r.bought).length} купл.)</small>` : ''}</span></div>
      <div class="kpi"><span class="k">Точек во всех городах</span><span class="v">${stores}</span></div>
      <div class="kpi"><span class="k">Директоров сейчас</span><span class="v">${dirs}</span><span class="d">${st.left ? `ушли ${st.left}${st.poached ? `, переманили ${st.poached}` : ''}` : 'никто не ушёл'}${st.caught ? ` · поймано ${st.caught}` : ''}</span></div>
      <div class="kpi"><span class="k">«Федеральная сеть»</span><span class="v">${cr.fed && cr.fed.goalDay != null ? E().fmtDate(cr.fed.goalDay) : f ? `${f.cities}/${f.need}` : '—'}</span><span class="d">${cr.fed && cr.fed.goalDay != null ? 'цель акта взята' : 'городов с 10+ точками'}</span></div>
      ${hl ? `<div class="kpi"><span class="k">Штаб: нагрузка / мощность</span><span class="v${hl.over > 0 ? ' negc' : ''}">${String(hl.load).replace('.', ',')} / ${String(hl.cap).replace('.', ',')}</span><span class="d">${hl.over > 0 ? 'перегружен' : 'справляется'}</span></div>` : ''}
      ${st.stolen ? `<div class="kpi"><span class="k">Украли директора</span><span class="v negc">${fm(st.stolen)}</span></div>` : ''}</div>`;
    const card = (r, kind) => `<div class="card sumstore ${kind}"><div class="card-h"><div><div class="card-t">${kind === 'best' ? 'Лучший город' : 'Худший город'} · ${esc(r.name)}</div><div class="card-s">${r.id === 'ufa' ? 'родной город' : `${r.bought ? 'куплен' : 'вход'} ${E().fmtDate(r.day)}`} · ${r.d ? 'директор ' + esc(r.d.name) : r.st.active ? 'ведёте сами' : 'без директора'}</div></div><span class="chip ${r.prof >= 0 ? 'good' : 'bad'}">${fm(r.prof)}</span></div>
      <div class="grid2">${h.kv('Прибыль за всё время', fm(r.prof))}${h.kv('Выручка за всё время', fm(r.rev))}${h.kv('Точек', r.st.stores)}${h.kv('Худшая серия', r.lossMax ? r.lossMax + ' мес. в минусе' : 'без убыточных месяцев')}</div></div>`;
    if (best) s += `<div class="sumstores">${card(best, 'best')}${worst ? card(worst, 'worst') : ''}</div>`;
    const list = rows.slice().sort((a, b) => b.rev - a.rev);
    s += `<div class="sumctwrap"><table class="sumctbl"><thead><tr><th>Город</th><th class="n">Точки</th><th class="n">Выручка</th><th class="n">Прибыль</th><th class="c-dir">Директор</th></tr></thead><tbody>${list.map((r) => `<tr><td class="cn">${esc(r.name)}<small>${r.id === 'ufa' ? 'с начала игры' : E().fmtDate(r.day)}</small></td><td class="n">${r.st.stores}</td><td class="n">${fm(r.rev)}</td><td class="n ${r.prof < 0 ? 'negc' : ''}">${fm(r.prof)}</td><td class="c-dir">${r.d ? esc(r.d.name) : r.st.active ? '<span class="muted">вы</span>' : '<span class="negc">нет</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    return s + `</div>`;
  }
  function storeCard(r, kind) {
    const h = H();
    return `<div class="card sumstore ${kind}"><div class="card-h"><div><div class="card-t">${kind === 'best' ? 'Лучшая точка' : 'Худшая точка'} · №${r.num}</div><div class="card-s">${esc(r.addr)} · ${h.dname(r.d)}${r.open ? '' : ' · закрыта'}</div></div><span class="chip ${r.pAll >= 0 ? 'good' : 'bad'}">${fm(r.pAll)}</span></div>
      <div class="grid2">${h.kv('Прибыль за всё время', fm(r.pAll))}${h.kv('За последний год', fm(r.p12))}${h.kv('Месяцев работы', r.pN)}${h.kv('Худшая серия', r.lossMax ? r.lossMax + ' мес. в минусе' : 'без убыточных месяцев')}</div></div>`;
  }
  function summaryHtml(S) {
    const R = A().review(S), h = S.history || [], cfg = C();
    const years = S.day / 365, yt = (Math.round(years * 10) / 10).toString().replace('.', ',');
    const got = A().count(S), L = A().LIST;
    const title = S.won ? `Победа: ${qn(S.company)} — хлебная карта Уфы` : S.lost ? `${qn(S.company)}: банкротство на ${Math.max(1, Math.ceil(years))}-м году` : `${qn(S.company)}: ${yt} года в деле`;
    const byYear = {}; for (const x of h) byYear[x.y] = (byYear[x.y] || 0) + x.rev;
    const bestYear = Object.keys(byYear).sort((a, b) => byYear[b] - byYear[a])[0];
    let s = `<div class="modal-h"><span class="eyebrow ${S.lost ? 'neg' : S.won ? 'pos' : ''}">Итоги игры · ${E().fmtDate(S.day)}</span><h2>${title}</h2></div><div class="modal-b">`;
    s += `<div class="kpis sumk">
      <div class="kpi"><span class="k">Выручка за всё время</span><span class="v">${fm(S.cumRevenue || R.revAll)}</span></div>
      <div class="kpi"><span class="k">Оборот 12 мес</span><span class="v">${fm(R.rev12)}</span></div>
      <div class="kpi"><span class="k">Лучший год${bestYear ? ' · ' + bestYear : ''}</span><span class="v">${bestYear ? fm(byYear[bestYear]) : '—'}</span></div>
      <div class="kpi"><span class="k">Точек (максимум)</span><span class="v">${Math.max(S.stats.peakStores || 0, S.stores.length)}</span></div>
      <div class="kpi"><span class="k">Нанято / ушло</span><span class="v">${S.stats.hires} / ${S.stats.quits}</span></div>
      <div class="kpi"><span class="k">Достижения</span><span class="v">${got} из ${L.length}</span></div>${S.miles && (S.miles.n || S.miles.fail) ? `<div class="kpi"><span class="k">Вехи</span><span class="v">${S.miles.n || 0}${S.miles.fail ? ` <small class="muted">· ${S.miles.fail} не вышло</small>` : ''}</span></div>` : ''}</div>`;
    if (S.rewind && S.rewind.n) s += `<p class="hint sumrw">↩️ Переигровок в этой игре: ${S.rewind.n} (отменено ${S.rewind.days} ${plural(S.rewind.days, 'день', 'дня', 'дней')} игры). Итоги и достижения — по той версии событий, что осталась.</p>`;
    s += `<div class="sec"><h3>Вся игра по месяцам</h3><div class="sumcharts">
      <figure><figcaption>Выручка и прибыль за месяц</figcaption>${lineChart(h, [{ v: (x) => x.rev, cls: 's-rev', label: 'Выручка', area: true }, { v: (x) => x.profit, cls: 's-prof', label: 'Прибыль' }], 'Выручка и прибыль по месяцам')}</figure>
      <figure><figcaption>Точки в сети</figcaption>${lineChart(h, [{ v: (x) => x.stores, cls: 's-stores', label: 'Работающие точки', step: true, area: true, money: false }], 'Число точек по месяцам')}</figure>
      <figure><figcaption>Деньги на конец месяца</figcaption>${lineChart(h, [{ v: (x) => x.cash, cls: 's-cash', label: 'Счёт' }, { v: (x) => x.reserve, cls: 's-res', label: 'Резерв' }], 'Счёт и резерв по месяцам')}</figure>
      <figure><figcaption>Команда</figcaption>${lineChart(h, [{ v: (x) => x.staff, cls: 's-staff', label: 'Сотрудники в точках', area: true, money: false }], 'Сотрудники по месяцам')}</figure>
    </div></div>`;
    s += citiesHtml(S); // второй акт: итоги по городам
    if (R.best) s += `<div class="sec"><h3>Лучшая и худшая точка <small>по прибыли за всё время</small></h3><div class="sumstores">${storeCard(R.best, 'best')}${R.worst ? storeCard(R.worst, 'worst') : ''}</div></div>`;
    s += `<div class="sumcols"><div class="sec okcol"><h3>Что сделано верно</h3><ul class="sumlist ok">${R.good.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="sec badcol"><h3>Что можно было лучше</h3><ul class="sumlist bad">${R.bad.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`;
    if (R.decisions.length) s += `<div class="sec"><h3>Главные решения</h3><ol class="timeline">${R.decisions.map((c) => { const d = (DEC[c.t] || (() => ({ ic: '•', t: c.t })))(c); return `<li><span class="ti" aria-hidden="true">${d.ic}</span><span class="td">${E().fmtDate(c.day)}</span><span class="tt">${esc(d.t)}</span></li>`; }).join('')}</ol></div>`;
    const on = L.filter((a) => A().isOn(S, a.id)).sort((a, b) => S.achievements[a.id] - S.achievements[b.id]);
    s += `<div class="sec"><h3>Достижения <small>${got} из ${L.length}</small></h3>${on.length ? `<div class="achchips">${on.map((a) => `<span class="achchip rar-${a.rar}" title="${esc(a.desc)}"><span aria-hidden="true">${a.icon}</span>${esc(a.name)}</span>`).join('')}</div>` : '<div class="empty">Пока ни одного.</div>'}<button class="btn" type="button" data-act="achievements">Все достижения</button></div>`;
    const rw = S.lost && BK.Rewind && BK.Rewind.can(S); // банкротство: можно вернуться к окну «Переиграть»
    s += (BK.StoryHistory ? BK.StoryHistory.summarySection(S) : '');
    s += `</div><div class="modal-f">${S.lost ? (rw ? '<button class="btn primary block" type="button" data-act="rewindLost">Переиграть…</button>' : '') : `<button class="btn primary block" data-act="closeModal">Продолжить игру</button>`}<button class="btn block${S.lost && !rw ? ' primary' : ''}" type="button" id="sumNew">Новая игра</button></div>`;
    return s;
  }
  function openSummary() {
    const S = APP().state; if (!S || !A()) return;
    A().ensure(S);
    APP().openModal(summaryHtml(S), { closable: !S.lost });
    $('#modal .modal').classList.add('wide');
    $('#sumNew').addEventListener('click', () => APP().toStart());
    if (BK.StoryHistory) BK.StoryHistory.bind($('#modal')); // летопись: портреты и «Сохранить картинкой»
  }

  // блок для «Меню игры»: достижения, итоги, слот
  function settingsHtml(S) {
    const got = A() ? A().count(S) : 0, n = A() ? A().LIST.length : 0;
    return `<div class="row setx"><button class="btn" type="button" data-act="achievements">🏆 Достижения · ${got} из ${n}</button><button class="btn" type="button" data-act="summary">📊 Итоги игры</button></div>
      ${BK.Sound ? BK.Sound.settingsHtml(S) : ''}
      ${BK.StratUI ? BK.StratUI.settingsHtml(S) : ''}
      ${BK.Slots.available() ? `<p class="hint" style="margin:0">Игра сохраняется в слот ${BK.Slots.active} из ${N_SLOTS}. Другие игры — на стартовом экране.</p>` : ''}`;
  }

  BK.Extras = { achToast, openAchievements, openSummary, settingsHtml, lineChart, citiesHtml };
})();
