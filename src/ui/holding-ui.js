/* Третий акт «Холдинг» — интерфейс (логика — src/holding.js, BK.Holding; тексты — src/data/holding.js).
   Где видно: окно «Третий акт» с тремя карточками путей (открывается само после победы), окно «Биржа»
   (подготовка, роадшоу, торги, квартальные отчёты, цель), окно сцены с портретами, блок в «Сводке»,
   строки в «Требует внимания», тосты и раздел «Холдинг» в итогах игры.
   В app.js / panels.js / extras.js — только хуки (BK.HoldingUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const HD = () => BK.Holding, APP = () => BK.App, E = () => BK.Engine, DATA = () => BK.HOLDING_DATA || {};
  const KI = () => BK.CFG.HOLDING.IPO;
  const fm = (v) => BK.fmtMoney(v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sub = (S, t) => { let x = t; try { if (BK.Story && BK.Story.heroText) x = BK.Story.heroText(S, x); if (BK.StoryUI && BK.StoryUI.sub) x = BK.StoryUI.sub(S, x); } catch (e) { /* как есть */ } return x; };
  const pct = (v) => Math.round(v * 100) + ' %';
  const bn = (v) => (v / 1e9).toFixed(v >= 1e11 ? 0 : 1).replace('.', ',') + ' млрд ₽';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg>';
  const PATH_IC = {
    ipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/></svg>',
    abroad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    franchise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  };
  const STAGES = [['prep', 'Подготовка'], ['roadshow', 'Роадшоу'], ['public', 'Торги'], ['goal', 'Цель']];

  /* ---------------- окно выбора пути ---------------- */
  function chooseHtml(S) {
    const P = DATA().paths || {}, ready = BK.CFG.HOLDING.READY;
    const card = (id) => {
      const p = P[id], on = !!ready[id];
      return `<article class="hd-card${on ? '' : ' soon'}" data-path="${id}">
        <div class="hd-ct"><span class="hd-ic">${PATH_IC[id]}</span><span><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></span>${on ? '' : '<em class="hd-soon">скоро</em>'}</div>
        <div class="hd-goal"><small>Цель</small><b>${esc(p.goal)}</b></div>
        <ul>${p.how.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="hd-risk">${esc(p.risk)}</p>
        <div class="hd-end">${esc(p.end)}</div>
        ${on ? `<button class="btn primary block" data-act="holdPick" data-arg="${id}">Выбрать этот путь</button>` : '<button class="btn block" disabled>Скоро в игре</button>'}
      </article>`;
    };
    return `<div class="modal-h"><span class="eyebrow pos">Третий акт · Холдинг</span><h2>Куда дальше растёт сеть?</h2></div><div class="modal-b hd-m">
      <p style="margin:0">Сеть стала больше, чем можно вести одной рукой. Третий акт — финал игры. Выберите <b>один путь</b>: у каждого своя цель, свои люди и своя концовка. Передумать потом нельзя.</p>
      <div class="hd-cards">${['ipo', 'abroad', 'franchise'].map(card).join('')}</div>
      <p class="hint" style="margin:0">Пока путь не выбран, финал истории ждёт. Можно и не идти в холдинг — тогда история закончится как обычно.</p>
    </div><div class="modal-f"><button class="btn block" data-act="closeModal">Решить позже</button><button class="btn block hd-none" data-act="holdNone">Без холдинга</button></div>`;
  }
  function openChoose() {
    const S = APP().state; if (!S || !HD().state(S)) return;
    APP().openModal(chooseHtml(S), { closable: true });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('hd-modal', 'hd-wide');
  }

  /* ---------------- окно сцены ---------------- */
  function portrait(who, emo) { return BK.StoryUI && BK.StoryUI.portrait ? BK.StoryUI.portrait(who, emo, 'sm') : ''; }
  function heroName(who) { const h = (BK.STORY && BK.STORY.heroes || {})[who] || {}; return h.name || who; }
  function heroRole(who) { const h = (BK.STORY && BK.STORY.heroes || {})[who] || {}; return h.role || ''; }
  function sceneHtml(S, sc) {
    const lines = sc.lines.map((l) => `<div class="hd-line">${portrait(l.who, l.emo)}<div class="hd-say"><b>${esc(sub(S, heroName(l.who)))}</b><small>${esc(sub(S, heroRole(l.who)))}</small><p>${esc(sub(S, l.text))}</p></div></div>`).join('');
    const L = ['А', 'Б', 'В', 'Г', 'Д'];
    const chs = sc.choices.map((c, i) => `<button type="button" class="choice st-choice hd-choice" data-act="holdAns" data-arg="${i}"${c.ok ? '' : ' disabled'}>
      <span class="cl" aria-hidden="true">${L[i]}</span><b>${esc(sub(S, c.label))}</b><span class="cd">${esc(sub(S, c.desc || ''))}</span>${c.ok ? '' : `<span class="cwhy">${esc(c.why)}</span>`}</button>`).join('');
    return `<div class="modal-h st-h${sc.final ? ' climax' : ''}"><span class="eyebrow st-ey">Глава 5 · Холдинг</span><h2>${esc(sub(S, sc.title))}</h2></div>
      <div class="modal-b story-m hd-m hd-scene"><div class="hd-lines">${lines}</div>
      <div class="st-choices"><div class="st-chq"><h4>Что решаем?</h4><span>Выбор останется в летописи</span></div>${chs}</div></div>`;
  }
  function openScene() {
    const S = APP().state; if (!S) return false;
    const sc = HD().pendingScene(S); if (!sc) return false;
    APP().openModal(sceneHtml(S, sc), { closable: false });
    const el = document.querySelector('#modal .modal');
    if (el) { el.classList.add('story-modal', 'hd-modal', 'hd-scm'); if (BK.Px && BK.Px.hydrate) { try { BK.Px.hydrate(el); } catch (e) { /* без портретов */ } } }
    return true;
  }

  /* ---------------- окно «Биржа» ---------------- */
  function stepper(P) {
    const cur = P.goalDay ? 3 : STAGES.findIndex((s) => s[0] === P.stage);
    return `<ol class="hd-steps">${STAGES.map((s, i) => `<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}"><i>${i + 1}</i>${s[1]}</li>`).join('')}</ol>`;
  }
  function dots(n, max) { let s = ''; for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`; return `<span class="hd-dots" aria-label="${n} из ${max}">${s}</span>`; }
  function spark(hist) {
    if (!hist || hist.length < 2) return '';
    const W = 320, H = 70, xs = hist.map((x) => x[1]), mn = Math.min(...xs), mx = Math.max(...xs), r = mx - mn || 1;
    const pts = xs.map((v, i) => `${(i / (xs.length - 1) * W).toFixed(1)},${(H - 4 - (v - mn) / r * (H - 8)).toFixed(1)}`).join(' ');
    return `<svg class="hd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Цена акции по месяцам"><polyline points="${pts}"/></svg>`;
  }
  function track(S, kind, inf) {
    const P = inf.ipo, isA = kind === 'audit';
    const lvl = isA ? P.audit : P.board, max = isA ? KI().AUDIT.length : KI().BOARD.length;
    const job = isA ? P.auditJob : P.boardJob, nx = isA ? inf.auditNext : inf.boardNext;
    const list = isA ? KI().AUDIT : KI().BOARD;
    let act = '';
    if (job) act = `<span class="hd-job">Идёт: «${esc(list[job.lvl - 1].name)}» — до ${E().fmtDate(job.until)}</span>`;
    else if (nx && P.stage !== 'done') act = `<button class="btn sm" data-act="${isA ? 'holdAudit' : 'holdBoard'}"${S.cash < nx.cost ? ' disabled' : ''}>${esc(nx.name)} · ${fm(nx.cost)}, ${nx.days} дн.${!isA ? ` + ${fm(nx.month)}/мес` : ''}</button>`;
    else act = '<span class="hd-job ok">Всё готово</span>';
    return `<div class="hd-track"><div class="hd-th"><b>${isA ? 'Аудит и отчётность' : 'Совет директоров'}</b>${dots(lvl, max)}</div>
      <small>${isA ? `Нужен ${KI().NEED_AUDIT}-й уровень. Каждый уровень: оценка +${Math.round(KI().GOV_AUDIT * 100 * (P.approach === 'big4' ? KI().BIG4_GOV : 1))} %, фонды охотнее.` : `Нужен хотя бы 1-й. Каждый уровень: оценка +${Math.round(KI().GOV_BOARD * 100)} %.${P.boardWho ? ' ' + esc((DATA().boardWho || {})[P.boardWho] || '') + '.' : ''}`}</small>
      ${lvl ? `<span class="hd-have">Есть: ${list.slice(0, lvl).map((x) => esc(x.name)).join(', ')}</span>` : ''}
      <div class="row">${act}</div></div>`;
  }
  function abroadHtml(S, inf) {
    const A = inf.abroad, k = BK.CFG.HOLDING.ABROAD, D = DATA();
    const goalK = Math.min(1, inf.cap / A.goal);
    let s = `<div class="modal-h"><span class="eyebrow pos">Третий акт · Холдинг</span><h2>За рубеж</h2></div><div class="modal-b hd-m">`;
    s += `<div class="hd-goalbox"><div class="hd-gl"><span>Оборот за рубежом за 12 мес.</span><b>${bn(inf.cap)}</b><small>цель — ${bn(A.goal)} и ${k.GOAL_COUNTRIES} страны (открыто ${A.open})</small></div>${BK.UIH ? BK.UIH.goalBar(goalK) : ''}</div>`;
    s += `<div class="inv-nums big">
      <span><small>Стран</small><b>${A.open} из ${k.GOAL_COUNTRIES}</b></span>
      <span><small>Выручка за месяц</small><b>${fm(A.monthRev)}</b></span>
      <span><small>Прибыль за месяц</small><b>${fm(A.monthProf)}</b></span>
      <span><small>Пришло на счёт</small><b>${fm(A.paidIn)}</b></span>
      <span><small>Потрачено на вход</small><b>${fm(A.spent)}</b></span>
      <span><small>Меню</small><b>${A.menu === 'local' ? 'местное' : 'своё'}</b></span>
    </div>`;
    s += `<p class="hint" style="margin:0">Партнёр берёт 51 % прибыли страны, но вход дешевле и быстрее. Свой директор — вся прибыль ваша, вход дороже и дольше. Курс валюты пересчитывается раз в квартал.</p>`;
    s += `<div class="sec"><h3>Страны</h3><div class="hd-countries">`;
    for (const c of A.countries) {
      const name = esc(c.name), city = esc(c.city);
      if (c.open) {
        s += `<article class="hd-country open"><div class="hd-ctryh"><b>${name}</b><small>${city}</small></div>
          <div class="hd-crow"><span>Точек</span><b>${c.stores} из ${c.max}</b></div>
          <div class="hd-crow"><span>Курс</span><b>×${c.rate.toFixed(2).replace('.', ',')}</b></div>
          <div class="hd-crow"><span>Выручка за всё</span><b>${fm(c.rev)}</b></div>
          <div class="hd-crow"><span>Прибыль за всё</span><b class="${c.prof < 0 ? 'negc' : ''}">${fm(c.prof)}</b></div>
          <div class="hd-crow"><span>Вход</span><b>${c.mode === 'local' ? 'с партнёром' : 'свой директор'}</b></div></article>`;
      } else if (c.job) {
        s += `<article class="hd-country job"><div class="hd-ctryh"><b>${name}</b><small>${city}</small></div><p class="hd-job">Вход идёт — открытие ${E().fmtDate(c.job.until)}</p></article>`;
      } else {
        s += `<article class="hd-country"><div class="hd-ctryh"><b>${name}</b><small>${city}</small></div>
          <p class="hint" style="margin:0">Вход в страну: ${c.daysLocal}–${c.daysOwn} дн.</p>
          <button class="btn sm block" data-act="holdEnter" data-arg="${c.id}:local">С партнёром · ${fm(c.entryLocal)}</button>
          <button class="btn sm block" data-act="holdEnter" data-arg="${c.id}:own">Свой директор · ${fm(c.entryOwn)}</button></article>`;
      }
    }
    s += `</div></div>`;
    if (A.deval) s += `<p class="hint" style="margin:0">Курс падал ${A.deval} раз. После падения выручка в рублях ниже, пока курс не выправится.</p>`;
    if (A.goalDay) s += `<p class="hint" style="margin:0">Цель взята ${E().fmtDate(A.goalDay)}: ${A.open} страны и ${fm(inf.cap)} за 12 месяцев.</p>`;
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  function infoHtml(S) {
    const inf = HD().info(S); if (!inf) return '';
    if (!inf.path) return chooseHtml(S);
    const P = inf.ipo, D = DATA();
    if (inf.abroad) return abroadHtml(S, inf);
    if (!P) return `<div class="modal-h"><span class="eyebrow">Третий акт</span><h2>Без холдинга</h2></div><div class="modal-b"><p style="margin:0">Вы решили не строить холдинг. История закончится как обычно.</p></div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    const capV = inf.cap, goal = inf.goal, pub = P.stage === 'public';
    let s = `<div class="modal-h"><span class="eyebrow pos">Третий акт · Холдинг</span><h2>Выход на биржу</h2></div><div class="modal-b hd-m">`;
    s += stepper(P);
    s += `<div class="hd-goalbox"><div class="hd-gl"><span>${pub ? 'Капитализация' : 'Оценка компании (до биржи)'}</span><b>${bn(capV)}</b><small>цель — ${bn(goal)} и ${KI().GOAL_Q} квартальных отчёта${pub ? ` (сдано ${P.q.length})` : ''}</small></div>${BK.UIH ? BK.UIH.goalBar(capV / goal) : ''}</div>`;
    const fg = inf.val.fg;
    s += `<div class="inv-nums big">
      <span><small>Прибыль за 12 мес.</small><b>${fm(fg.prof12)}</b></span>
      <span><small>Рост выручки за год</small><b>${(fg.growth >= 0 ? '+' : '') + pct(fg.growth)}</b></span>
      <span><small>Маржа</small><b>${(fg.margin * 100).toFixed(1).replace('.', ',')} %</b></span>
      <span><small>P/E (во сколько прибылей)</small><b>${inf.pe.toFixed(1).replace('.', ',')}</b></span>
      ${pub ? `<span><small>Цена акции</small><b>${P.price.toFixed(0)} ₽</b></span><span><small>Ваша доля</small><b>${pct(P.own)}</b></span>` : ''}
      <span><small>Настроение рынка</small><b>×${P.mood.toFixed(2).replace('.', ',')}</b></span>
      <span><small>Потрачено на холдинг</small><b>${fm(P.spent)}</b></span>
    </div>`;
    if (P.approach) s += `<p class="hint" style="margin:0">Подход: <b>${esc(D.approaches[P.approach].name)}</b> — ${esc(D.approaches[P.approach].text)}.</p>`;
    if (P.stage === 'prep') {
      s += `<div class="sec"><h3>Подготовка</h3>${track(S, 'audit', inf)}${track(S, 'board', inf)}</div>`;
      s += `<div class="sec"><h3>Роадшоу и размещение</h3><p class="hint" style="margin:0">Сколько компании продать на бирже — эти деньги придут на счёт. Остальное — ваше.</p>
        <div class="hd-seg" role="group" aria-label="Доля на продажу">${KI().FLOAT.map((f) => `<button class="btn sm${P.float === f ? ' primary' : ''}" data-act="holdFloat" data-arg="${f}" aria-pressed="${P.float === f}">${pct(f)} · ≈ ${bn(inf.fair * P.mood * f)}</button>`).join('')}</div>
        ${inf.blocks.length ? `<ul class="hd-blocks">${inf.blocks.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        <button class="btn primary" data-act="holdRoadshow"${inf.blocks.length ? ' disabled' : ''}>Начать роадшоу · ${fm(inf.rsCost)}</button></div>`;
    } else if (P.stage === 'roadshow') {
      s += `<div class="sec"><h3>Роадшоу</h3><p style="margin:0">Цена размещения — ${esc(D.range[P.range || 'mid'])}. Книга заявок закроется <b>${E().fmtDate(P.rsUntil)}</b>. Продаём ${pct(P.float)} компании.</p></div>`;
      s += `<div class="sec"><h3>Подготовка</h3>${track(S, 'audit', inf)}${track(S, 'board', inf)}</div>`;
    } else {
      const nq = inf.nextQ;
      s += `<div class="sec"><h3>Цена акции <small>размещение — ${P.ipoPrice.toFixed(0)} ₽, ${esc(D.book[P.book] || '')}</small></h3>${spark(P.hist)}</div>`;
      s += `<div class="sec"><h3>Обещание рынку</h3><p class="hint" style="margin:0">Раз в квартал вы отчитываетесь: выручка квартала против того же квартала год назад плюс обещанный рост. Смелое обещание рынок любит сразу, но промах бьёт сильнее.</p>
        <div class="hd-seg" role="group" aria-label="Прогноз роста">${['low', 'mid', 'high'].map((g) => `<button class="btn sm${P.guide === g ? ' primary' : ''}" data-act="holdGuide" data-arg="${g}" aria-pressed="${P.guide === g}"${g === 'low' && P.boardWho === 'elvira' ? ' disabled title="Эльвира не подпишет"' : ''}>${esc(D.guide[g])} · +${pct(KI().GUIDE[g])}</button>`).join('')}</div>
        ${nq ? `<p style="margin:0">Следующий отчёт — <b>${E().fmtDate(nq.day)}</b> (${nq.qn}-й квартал): рынок ждёт <b>${fm(nq.exp)}</b>${nq.monthsIn ? `, уже набрали ${fm(nq.sofar)} за ${nq.monthsIn} мес.` : ''}.</p>` : ''}</div>`;
      s += `<div class="sec"><h3>Дивиденды</h3><div class="hd-seg" role="group" aria-label="Дивиденды">${KI().DIV.map((d) => `<button class="btn sm${P.div === d ? ' primary' : ''}" data-act="holdDiv" data-arg="${d}" aria-pressed="${P.div === d}">${d ? pct(d) + ' прибыли' : 'всё в рост'}</button>`).join('')}</div><p class="hint" style="margin:0">Платим раз в квартал только за проданную долю (${pct(1 - P.own)}). Выплачено всего — ${fm(P.divPaid)}.</p></div>`;
      if (P.q.length) {
        const W = { beat: ['выполнили', 'pos'], inline: ['чуть ниже', ''], miss: ['промах', 'negc'] };
        s += `<div class="sec"><h3>Квартальные отчёты <small>${P.beats} выполнено · ${P.misses} промахов</small></h3><div class="hd-qwrap"><table class="tbl hd-q"><thead><tr><th>Квартал</th><th>Выручка</th><th>Ждали</th><th>Итог</th></tr></thead><tbody>${P.q.slice(-8).reverse().map((q) => `<tr><td>${q.qn}-й ${q.y}</td><td>${fm(q.rev)}</td><td>${fm(q.exp)}</td><td class="${W[q.res][1]}">${W[q.res][0]}${q.scandal ? ' · скандал' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
      s += `<p class="hint" style="margin:0">Каждый месяц: биржа, аудит и отдел по работе с инвесторами — ${fm(inf.listMonth)}${inf.boardMonth ? `, совет — ${fm(inf.boardMonth)}` : ''}. Строка «Биржа и холдинг» в отчёте.</p>`;
      s += `<div class="sec"><h3>Совет директоров</h3>${track(S, 'board', inf)}</div>`;
    }
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  const inHold = () => !!(APP().ui.modal && document.querySelector('#modal .hd-info'));
  function openInfo(keep) {
    const S = APP().state; if (!S || !HD().state(S)) return;
    if (!HD().state(S).path) { openChoose(); return; }
    APP().openModal(infoHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('hd-modal', 'hd-info');
  }

  /* ---------------- «Сводка» ---------------- */
  function dashBlock(S) {
    const inf = HD() && HD().info(S); if (!inf || inf.ending) return '';
    let s = `<div class="sec hdb"><h3><span class="inv-h hd-h">${ICON}Холдинг</span><button class="linkbtn" data-act="hold">Подробнее →</button></h3>`;
    if (!inf.path) s += `<div class="inv-offer"><b>Третий акт открыт</b><span>Выберите путь: биржа, за рубеж или франшиза-империя.</span><button class="btn sm primary" data-act="holdChoose">Выбрать путь</button></div>`;
    else if (inf.path === 'none') s += '<p class="hint" style="margin:0">Без холдинга — история закончится как обычно.</p>';
    else if (inf.ipo) {
      const P = inf.ipo, st = (STAGES.find((x) => x[0] === P.stage) || [])[1] || '';
      s += `<div class="hd-mini"><span>Выход на биржу · <b>${esc(st)}</b></span><span>${P.stage === 'public' ? 'капитализация' : 'оценка'} <b>${bn(inf.cap)}</b> из ${bn(inf.goal)}</span></div>${BK.UIH ? BK.UIH.goalBar(inf.cap / inf.goal) : ''}`;
    } else if (inf.abroad) {
      const A = inf.abroad;
      s += `<div class="hd-mini"><span>За рубеж · <b>${A.open} из ${BK.CFG.HOLDING.ABROAD.GOAL_COUNTRIES} стран</b></span><span>оборот <b>${bn(A.rev12)}</b> из ${bn(A.goal)}</span></div>${BK.UIH ? BK.UIH.goalBar(A.rev12 / A.goal) : ''}`;
    }
    return s + '</div>';
  }

  /* ---------------- итоги игры ---------------- */
  function summaryHtml(S) {
    const H = HD() && HD().state(S); if (!H) return '';
    const D = DATA();
    let s = `<div class="sec hd-sum"><h3>Холдинг <small>третий акт</small></h3>`;
    if (!H.path) s += '<p class="hint" style="margin:0">Третий акт открылся, путь не выбран.</p>';
    else if (H.path === 'none') s += '<p class="hint" style="margin:0">Вы отказались от холдинга — история закончилась как обычно.</p>';
    else if (H.abroad) {
      const A = H.abroad, k = BK.CFG.HOLDING.ABROAD;
      const open = (k.COUNTRIES || []).filter((d) => A.c[d.id] && A.c[d.id].open);
      const rev12 = HD().abInfo(S).rev12;
      s += `<div class="kpis sumk">
        <div class="kpi"><span class="k">Путь</span><span class="v">За рубеж</span></div>
        <div class="kpi"><span class="k">Стран</span><span class="v">${open.length} из ${k.GOAL_COUNTRIES}</span></div>
        <div class="kpi"><span class="k">Оборот за 12 мес.</span><span class="v">${bn(rev12)}</span></div>
        <div class="kpi"><span class="k">Пришло на счёт</span><span class="v">${fm(A.paidIn)}</span></div>
        <div class="kpi"><span class="k">Курсовых падений</span><span class="v">${A.deval}</span></div>
        <div class="kpi"><span class="k">Меню</span><span class="v">${A.menu === 'local' ? 'местное' : 'своё'}</span></div></div>`;
      s += `<p class="hint" style="margin:0">${open.map((d) => esc(d.name) + ' — ' + (A.c[d.id].stores) + ' точек').join(' · ')}.${A.goalDay ? ` Цель «${bn(k.GOAL_REV)}» взята ${E().fmtDate(A.goalDay)}.` : ''}</p>`;
      if (H.ending === 'abroad') {
        const e = (BK.STORY && BK.STORY.endings || {}).abroad || {};
        s += `<div class="sh-end hd-epi"><b>${esc(e.name || 'Хлеб без границ')}</b><span>${esc(sub(S, e.text || ''))}</span></div>`;
      }
    }
    else if (H.ipo) {
      const P = H.ipo, capV = HD().cap(P);
      s += `<div class="kpis sumk">
        <div class="kpi"><span class="k">Путь</span><span class="v">Биржа</span></div>
        <div class="kpi"><span class="k">Лет на бирже</span><span class="v">${P.listDay != null ? String(Math.round(((H.endDay || S.day) - P.listDay) / 36.5) / 10).replace('.', ',') : '—'}</span></div>
        <div class="kpi"><span class="k">Привлекли</span><span class="v">${P.raised ? fm(P.raised) : '—'}</span></div>
        <div class="kpi"><span class="k">Капитализация</span><span class="v">${capV ? bn(capV) : '—'}</span></div>
        <div class="kpi"><span class="k">Отчёты</span><span class="v">${P.beats} / ${P.inline} / ${P.misses}</span></div>
        <div class="kpi"><span class="k">Ваша доля</span><span class="v">${pct(P.own)}</span></div></div>`;
      s += `<p class="hint" style="margin:0">Отчёты: выполнили / чуть ниже / промах. ${P.listDay != null ? `На бирже с ${E().fmtDate(P.listDay)}, размещение — ${esc(D.book[P.book] || '')}.` : ''}${P.goalDay ? ` Цель «${bn(KI().GOAL_CAP)}» взята ${E().fmtDate(P.goalDay)}.` : ''}</p>`;
      if (H.ending === 'ipo') {
        const e = (BK.STORY && BK.STORY.endings || {}).ipo || {};
        s += `<div class="sh-end hd-epi"><b>${esc(e.name || 'Публичная компания')}</b><span>${esc(sub(S, e.text || ''))}</span>${H.f.bell && D.bell[H.f.bell] ? `<span>${esc(sub(S, D.bell[H.f.bell]))}</span>` : ''}</div>`;
      }
    }
    if (H.log.length) s += `<ul class="sh-list hd-log">${H.log.map((x) => `<li><span class="sh-d">${E().fmtDate(x.day)}</span><span><b class="sh-t">${esc(sub(S, x.title))}</b>${x.choice ? ` <span class="sh-c">— ${esc(sub(S, x.choice))}</span>` : ''}</span></li>`).join('')}</ul>`;
    return s + '</div>';
  }

  /* ---------------- уведомления ---------------- */
  function toastEl(kind, ey, title, text) {
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast invtoast ' + kind; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">${esc(ey)}</span><b>${esc(title)}</b><span class="md">${esc(text)}</span></span>`;
    el.title = 'Открыть холдинг';
    el.addEventListener('click', () => { el.remove(); openInfo(); });
    setTimeout(() => el.remove(), 8000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
  }
  // возвращает функцию для очереди окон app.js (или null — только тост)
  function notify(n) {
    const S = APP().state;
    if (n.phase === 'unlock') { if (BK.Sound) BK.Sound.play('fanfare'); return () => openChoose(); }
    if (n.phase === 'scene') return () => { if (!openScene()) APP().refresh(); };
    if (n.phase === 'ending') return () => { if (APP().ACT.rewindLost) APP().ACT.rewindLost(); };
    if (n.phase === 'enter') { toastEl('good', 'За рубеж', 'Вход в ' + n.name, `Открытие через ${n.days} дн.`); if (S && inHold()) openInfo('keep'); return null; }
    if (n.phase === 'country') { toastEl('good', 'Своя страна', n.name, `${n.stores} точки, стран в сети: ${n.count}`); if (BK.Sound) BK.Sound.play('fanfare'); }
    else if (n.phase === 'deval') { toastEl('warn', 'Курс упал', n.name, `Выручка в рублях ×${String(n.rate.toFixed(2)).replace('.', ',')}.`); }
    else if (n.phase === 'listed') { toastEl(n.book === 'fail' ? 'warn' : 'good', 'Акции на бирже', `Привлекли ${fm(n.raised)}`, `Капитализация ${bn(n.cap)}.`); if (BK.Sound) BK.Sound.play('fanfare'); }
    else if (n.phase === 'quarter') { const w = n.res === 'beat' ? 'Обещание выполнено' : n.res === 'inline' ? 'Чуть ниже обещанного' : 'Промах'; toastEl(n.res === 'miss' ? 'warn' : 'good', `Отчёт за ${n.qn}-й квартал`, w, `Выручка ${fm(n.rev)} при ожидании ${fm(n.exp)}.${n.scandal ? ' Всплыла история с договорами — акции упали.' : ''}`); if (BK.Sound) BK.Sound.play(n.res === 'miss' ? 'warn' : 'coin'); }
    else if (n.phase === 'prep') toastEl('good', 'Холдинг', n.what === 'audit' ? 'Аудит готов' : 'Совет директоров собран', `Уровень ${n.lvl}.`);
    else if (n.phase === 'goal') toastEl('good', 'Холдинг', n.abroad ? 'Хлеб без границ' : 'Сто миллиардов', n.abroad ? `Оборот за рубежом ${bn(n.rev12)} за 12 месяцев.` : `Капитализация ${bn(n.cap)}.`);
    if (S && inHold()) openInfo('keep');
    return null;
  }

  /* ---------------- действия ---------------- */
  function boot(tries) {
    const A = APP() && APP().ACT;
    if (!A) { if ((tries || 0) < 20) setTimeout(() => boot((tries || 0) + 1), 150); return; }
    if (A.__holdUI) return; A.__holdUI = true;
    const after = (r) => { const S = APP().state; if (r && !r.ok && r.msg) APP().toast('Не получилось', r.msg, 'warn'); APP().save(); APP().refresh(); if (S && HD().state(S)) openInfo('keep'); };
    Object.assign(A, {
      hold: () => openInfo(),
      holdChoose: () => openChoose(),
      holdPick: (d) => { const S = APP().state; const r = HD().choose(S, d.arg); if (!r.ok) { APP().toast('Не получилось', r.msg || '', 'warn'); return; } APP().save(); APP().closeModal(); if (!openScene()) openInfo(); },
      holdNone: () => { const S = APP().state; HD().choose(S, 'none'); APP().save(); APP().closeModal(); APP().toast('Без холдинга', 'История закончится как обычно.', 'good'); },
      holdScene: () => { if (!openScene()) APP().toast('Холдинг', 'Сейчас сцена не ждёт.', 'warn'); },
      holdAns: (d) => {
        const S = APP().state; const r = HD().resolve(S, +d.arg);
        if (!r.ok) { APP().toast('Не получилось', r.msg || '', 'warn'); return; }
        APP().save();
        if (r.ending) { APP().closeModal(); if (APP().ACT.rewindLost) APP().ACT.rewindLost(); if (BK.Sound) BK.Sound.music('victory'); return; }
        if (!openScene()) APP().closeModal();
        APP().refresh();
      },
      holdAudit: () => after(HD().buyAudit(APP().state)),
      holdBoard: () => { const S = APP().state; const r = HD().buyBoard(S); APP().save(); if (!r.ok) { after(r); return; } APP().refresh(); if (!openScene()) openInfo('keep'); },
      holdFloat: (d) => after(HD().setFloat(APP().state, +d.arg)),
      holdRoadshow: () => { const S = APP().state; const r = HD().startRoadshow(S); APP().save(); if (!r.ok) { after(r); return; } APP().refresh(); if (!openScene()) openInfo('keep'); },
      holdGuide: (d) => after(HD().setGuide(APP().state, d.arg)),
      holdDiv: (d) => after(HD().setDiv(APP().state, +d.arg)),
      holdEnter: (d) => { const [id, mode] = String(d.arg || '').split(':'); after(HD().abEnter(APP().state, id, mode)); },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.HoldingUI = { chooseHtml, openChoose, infoHtml, openInfo, sceneHtml, openScene, dashBlock, summaryHtml, notify, ICON };
})();
