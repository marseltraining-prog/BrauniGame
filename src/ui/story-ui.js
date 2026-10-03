/* Сюжет — интерфейс (логика — src/story.js, BK.Story; тексты — src/data/story.js).
   Окно сцены: портрет говорящего и реплики ПО ОДНОЙ (кнопка/тап «Дальше», Enter/Space, прогресс «2 из 5»),
   затем варианты выбора — крупно, с пояснением последствий и честной причиной недоступности;
   кульминации оформлены заметнее. Письма и посты (form: letter/post) и входящие (S.inbox) — карточкой
   с одной кнопкой «Прочитано». Тост о решении — как у остальных механик игры, клик открывает летопись.
   Лента «История» в «Сводке» — строка о последнем решении и кнопка «Вся летопись».
   В app.js / panels.js — только хуки (BK.StoryUI.*, ACT.story / storyLog / storyNext / storyPick / storyRead).

   Портреты — пиксельные, кодом (Px.portraitTag + Px.hydrate): ключ берётся из BK.STORY.heroes[...].px,
   если такого героя в Px.CAST нет — ближайший существующий (см. PX_ALIAS и PX_NOTE).
   Своей игровой логики здесь нет: сцену показывает и закрывает только BK.Story.resolve. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const ST = BK.Story, APP = () => BK.App, E = () => BK.Engine;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const LET = 'АБВГДЕЖЗИК';
  // Финалы-победы (src/data/story.js: endings) — их встречает победная тема; «Пустой зал», «Сделка»,
  // «Жизнь в найме» и банкротство остаются тяжёлыми, как раньше (для них — тема тяжёлых заставок).
  const WIN_END = { empire: 1, city: 1, twocrusts: 1 };

  /* ---------- подстановки в текстах сцен: {name}, {street}, {n}, {city}, {inCity}, {district},
     {mentor}, {rival}, {rivalChain}, {bank}, {colleague}, {banker}, {inspector}, {chronicler}, {shop}…
     Тексты сцен пишутся с плейсхолдерами (docs/writing.md, разбор C3). Без подстановки игрок
     читает «Уфа жуёт: очередь на {street}» и «На №{n} тесто вчерашнее» — поэтому подставляем
     ровно здесь, на отрисовке: данные не переписываем, старые сохранения не трогаем.
       {name}   — имя героя; если игрок его не задавал, зовём «шеф» (как src/data/story-lines.js);
       {street} — адрес точки, о которой сцена (самая сильная по рейтингу, не открывающаяся);
       {n}      — её номер; {district} — её район; {city} — название города сцены: чужой, если сеть
                  уже в других городах, иначе активный; {inCity} — та же мысль в падеже («в Казани»).

     Местный слой (решение владельца, PLAN.md §8.2 — «свои районы и улицы, имена и персонажи другие»)
     живёт в src/data/story-cast.js (BK.STORY_CAST): он подставляет людей города партии по
     плейсхолдерам и заменяет уфимские имена, названия («Хлебный двор», «Семь рек», «Калач»)
     и топонимы на местные — во всех главах, письмах и летописи. Для Уфы слой возвращает текст
     как есть, поэтому партии в Уфе читаются побайтно прежними. Ниже — запасной путь, если
     файла слоя рядом нет (старая сборка): ровно прежняя подстановка. */
  function subStore(S) {
    const list = (S && S.stores) || [];
    let best = null;
    for (const st of list) {
      if (!st || st.status === 'opening' || !st.address) continue;
      if (!best || (st.rating || 0) > (best.rating || 0)) best = st;
    }
    return best || list[0] || null;
  }
  function subCityDef(S) {
    const by = BK.CITY_BY_ID || {}, cr = S && S.corp && S.corp.cities;
    if (cr) for (const id in cr) if (id !== 'ufa' && by[id]) return by[id];
    return BK.CITY || by.ufa || null;
  }
  function subCity(S) { const d = subCityDef(S); return (d && d.name) || 'Уфа'; }
  function subCityIn(S) {
    const d = subCityDef(S);
    if (d && d.in) return d.in;
    const f = (BK.CITY_FORMS || {})[subCity(S)];
    return (f && f.in) || ('в городе ' + subCity(S));
  }
  function sub(S, txt) {
    // родовые формы героя и {name} — общий слой (src/story.js): {say} → «сказал»/«сказала», {self}, {young}…
    const sex = (t) => (ST && ST.heroText ? ST.heroText(S, t) : t);
    if (BK.STORY_CAST && BK.STORY_CAST.render) { try { return sex(BK.STORY_CAST.render(S, txt)); } catch (e) { /* ниже — прежний путь */ } }
    let s = String(txt == null ? '' : txt);
    if (s.indexOf('{') < 0) return sex(s);
    const R = ST.state(S) || {};
    const st = subStore(S);
    // имя героя: из состояния сюжета, а до его появления (первые часы «своей сети») — из выбора на старте
    const name = (R.hero && R.hero.name) || (S && S.story && S.story.hero && S.story.hero.name) || (ST.heroOf && ST.heroOf(S).name) || 'шеф';
    return sex(s.split('{name}').join(name)
      .split('{inCity}').join(subCityIn(S))
      .split('{city}').join(subCity(S))
      .split('{street}').join((st && st.address) || 'Пушкина')
      .split('{n}').join(String(st && st.num != null ? st.num : 1)));
  }

  const BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h5"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>';
  const CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/><path d="M8 9h8M8 13h5"/></svg>';

  /* ---------- портреты: ключ Px.CAST для героя BK.STORY ----------
     fania → mama (мама Фания), babushka → sania (бабушка Сания) — это те же люди.
     ildar — своего портрета нет: подставляем Дамира (молодой человек, кепка) — ближайший по типажу.
     Всё, что не найдено, ведёт к «герою», чтобы окно никогда не осталось без лица. */
  const PX_ALIAS = { fania: 'mama', family: 'mama', mama: 'mama', babushka: 'sania', sania: 'sania', ildar: 'damir' };
  const PX_NOTE = { ildar: 'damir' };                       // подставленные ключи — в отчёт владельцу
  const EMO = { neutral: 1, calm: 1, smile: 1, happy: 1, closed: 1, smirk: 1, surprised: 1, sad: 1, tired: 1, angry: 1, worried: 1 };
  const ui = { scene: null, line: 0, form: 'scene', letter: null };

  /* Город партии решает, кто наставник, соперник, банкир и гости (src/data/story-cast.js).
     Для Уфы или старой сборки без слоя — прежняя запись BK.STORY.heroes. */
  const hero = (who) => {
    const S = APP() && APP().state;
    if (BK.STORY_CAST && BK.STORY_CAST.hero) { try { const h = BK.STORY_CAST.hero(S, who); if (h) return h; } catch (e) { /* прежний герой */ } }
    return (BK.STORY && BK.STORY.heroes && BK.STORY.heroes[who]) || { name: who };
  };
  const whoName = (who) => { const h = hero(who); return h.short || h.name; };
  const post = (sc) => sc && (sc.form === 'letter' || sc.form === 'post');
  const isClimax = (sc) => !!(sc && (sc.form === 'climax' || sc.climax));

  function pxKey(who) {
    const h = hero(who), want = (h && h.px) || who;
    const CAST = (BK.Px && BK.Px.CAST) || null;
    if (!CAST) return null;
    if (CAST[want]) return want;
    const alt = PX_ALIAS[want] || PX_ALIAS[who];
    if (alt && CAST[alt]) return alt;
    return CAST.hero ? 'hero' : null;
  }
  function portrait(who, emo, cls) {
    const h = hero(who), key = pxKey(who), name = esc(h.name || who);
    const e = EMO[emo] ? emo : 'neutral';
    if (key && BK.Px && BK.Px.portraitTag) return `<span class="pxframe st-px${cls ? ' ' + cls : ''}" title="${name}">${BK.Px.portraitTag(key, e)}</span>`;
    return `<span class="st-av${cls ? ' ' + cls : ''}" title="${name}" aria-hidden="true">${esc((h.name || '?').slice(0, 1))}</span>`;
  }
  function hydrate(root) { if (BK.Px && BK.Px.hydrate) { try { BK.Px.hydrate(root); } catch (e) { /* без портрета, но окно работает */ } } }

  /* ---------- требование к варианту: честная причина недоступности ---------- */
  const METER_NAME = { care: 'Забота о людях', risk: 'Готовность рисковать', honesty: 'Честность', fair: 'Справедливость' };
  const FLAG_NAME = { mentor: 'выбор наставника', gulya: 'решение про Гулю', kalach: 'судьба «Калача»', lenin: 'отношения с «Двором»', hire1: 'первый наём', fund: 'фонд', war: 'война за город', scandal: 'проверка', ufa: 'будущее Уфы', ildar: 'решение про Ильдара', olegCard: 'карта Олега', regulars: 'постоянные гости' };
  // noFlag — «этого разговора уже не будет»: тяжёлый момент закрывает вариант навсегда (напр. Рашида больше нет).
  // Пишем причину отдельной фразой, а не через «нужно …»: «нужно Рашида больше нет» — не по-русски.
  const NOFLAG_WHY = { rashidGone: 'Рашида больше нет — этот разговор не состоится' };
  function needText(S, need) {
    const R = ST.state(S); if (!need || !R) return { dis: false, text: '' };
    const bad = [], why = [];
    if (need.rel) for (const k of Object.keys(need.rel)) if ((R.rel[k] || 0) < need.rel[k]) bad.push(`отношения с ${whoName(k)} ≥ ${need.rel[k]}`);
    if (need.meter) for (const k of Object.keys(need.meter)) if ((R.m[k] || 0) < need.meter[k]) bad.push(`${METER_NAME[k] || 'стиль «' + k + '»'} ≥ ${need.meter[k]}`);
    if (need.flag) for (const k of Object.keys(need.flag)) if (R.f[k] !== need.flag[k]) bad.push(FLAG_NAME[k] || 'другое решение раньше');
    if (need.noFlag) for (const k of Object.keys(need.noFlag)) if (R.f[k] === need.noFlag[k]) why.push(NOFLAG_WHY[k] || 'другой ход событий');
    if (!bad.length && !why.length) return { dis: false, text: '' };
    const needTxt = bad.length ? 'нужно ' + sub(S, bad.join(', ')) : '';   // «судьба „Калача“» — по городу партии
    const whyTxt = why.length ? why.join(', ') : '';
    return { dis: true, text: 'Пока нельзя: ' + needTxt + (needTxt && whyTxt ? '. ' : '') + whyTxt };  }

  /* ---------- значки последствий варианта (без скрытых стилей — они и есть скрытые) ---------- */
  function fxChips(fx) {
    const out = [];
    for (const f of fx || []) {
      if (!f || !f.t) continue;
      if (f.t === 'rel') { const up = f.add > 0; out.push({ t: `${whoName(f.who)} ${up ? '+' : '−'}${Math.abs(f.add)}`, up, k: 'Отношения' }); }
      else if (f.t === 'perk') { const p = (BK.STORY.perks || {})[f.id]; if (p) out.push({ t: p.name, up: true, k: 'Бонус' }); }
      else if (f.t === 'ending') { const e = (BK.STORY.endings || {})[f.id]; out.push({ t: 'Финал: ' + (e ? e.name : f.id), up: false, k: 'История' }); }
      else if (f.t === 'share') out.push({ t: `${whoName(f.who)} — ${Math.round(f.pct * 100)} %`, up: false, k: 'Доля' });
      else if (f.t === 'rivalMod') out.push(f.agg > 0 ? { t: '«Двор» жёстче', up: false, k: 'Олег' } : { t: '«Двор» мягче', up: true, k: 'Олег' });
      else if (f.t === 'rivalOpenNear') out.push({ t: '«Двор» откроется рядом', up: false, k: 'Олег' });
      else if (f.t === 'deferOpen') out.push({ t: `Открытие позже на ${f.days} дн.`, up: false, k: 'Дело' });
      // meter и flag не показываем: это скрытые решения (docs/story.md §4.3)
    }
    return out.length ? `<span class="st-fx">${out.map((c) => `<span class="st-fxc ${c.up ? 'up' : 'dn'}"><i>${esc(c.k)}</i>${esc(c.t)}</span>`).join('')}</span>` : '';
  }

  /* ---------- варианты выбора ---------- */
  function choiceHtml(S, c, i, multi) {
    const need = needText(S, c.need), fx = fxChips(c.effects);
    const dis = need.dis ? ' disabled' : '';
    if (!multi) {
      return `<button type="button" class="btn primary block st-big" data-act="storyPick" data-arg="${i}"${dis}>${esc(sub(S, c.label))}${c.desc ? `<small class="st-desc">${esc(sub(S, c.desc))}</small>` : ''}${need.dis ? `<small class="st-need">${WARN}${esc(need.text)}</small>` : ''}</button>`;
    }
    return `<button type="button" class="choice st-choice" data-act="storyPick" data-arg="${i}"${dis}>
      <span class="cl" aria-hidden="true">${LET[i] || (i + 1)}</span>
      <b>${esc(sub(S, c.label))}</b>
      ${c.desc ? `<span class="cd">${esc(sub(S, c.desc))}</span>` : ''}
      ${c.cost ? `<span class="cc">${esc(sub(S, c.cost))}</span>` : ''}
      ${need.dis ? `<span class="cwhy">${WARN}${esc(need.text)}</span>` : ''}
      ${fx ? `<span class="fx">${fx}</span>` : ''}
    </button>`;
  }
  function choicesHtml(S, sc) {
    const chs = sc.choices || [];
    if (!chs.length) return '';
    if (chs.length === 1) return `<div class="st-choices st-one">${choiceHtml(S, chs[0], 0, false)}</div>`;
    return `<div class="st-choices"><div class="st-chq"><h4>Что решаем?</h4><span>Выбор останется в летописи</span></div>${chs.map((c, i) => choiceHtml(S, c, i, true)).join('')}</div>`;
  }

  /* ---------- письмо / пост (одна кнопка «Прочитано») ---------- */
  function paperHtml(S, sc) {
    const R = ST.state(S), day = R && R.pending ? R.pending.day : S.day;
    const lines = sc.lines || [];
    const who = (sc.who && sc.who[0]) || (lines[0] && lines[0].who) || 'semyon';
    const h = hero(who), isPost = sc.form === 'post';
    const body = lines.map((l) => `${lines.length > 1 && l.who && l.who !== who ? `<span class="st-pw">${esc(whoName(l.who))}:</span> ` : ''}${esc(sub(S, l.text))}`).join('</p><p>');
    return `<article class="st-paper ${isPost ? 'post' : 'letter'}">
      <header class="st-ph">${portrait(who, isPost ? 'smirk' : 'smile', 'sm')}<span class="st-pw2"><b>${esc(h.name)}</b><small>${esc(sub(S, h.role || ''))} · ${E().fmtDate(day)}</small></span><span class="st-kind">${isPost ? 'Пост' : 'Письмо'}</span></header>
      <div class="st-pb"><p>${body}</p></div>
      <div class="st-ps">— ${esc(whoName(who))}</div>
    </article>`;
  }
  function paperActions(S, sc) {
    const c = (sc.choices || [])[0];
    if (!c) return '';
    const need = needText(S, c.need);
    return `<div class="st-choices st-one"><button type="button" class="btn primary block st-big" data-act="storyPick" data-arg="0"${need.dis ? ' disabled' : ''}>Прочитано${need.dis ? `<small class="st-need">${WARN}${esc(need.text)}</small>` : ''}</button>${c.desc && !need.dis ? `<p class="st-note">${esc(sub(S, c.desc))}</p>` : ''}</div>`;
  }

  /* ---------- тело окна ---------- */
  function bodyHtml(S, sc) {
    if (post(sc)) return paperHtml(S, sc) + paperActions(S, sc);
    const lines = (sc.lines && sc.lines.length) ? sc.lines : [{ who: (sc.who || [])[0], emo: 'neutral', text: '' }];
    const i = Math.max(0, Math.min(ui.line, lines.length - 1)), last = i >= lines.length - 1, L = lines[i] || {};
    const many = lines.length > 1;
    const dots = many ? `<span class="st-dots" aria-hidden="true">${lines.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const prog = many ? `<span class="st-prog">Реплика <b>${i + 1}</b> из ${lines.length}</span>` : '';
    const attrs = last ? '' : ' data-next="1" role="button" tabindex="0" aria-label="Дальше, следующая реплика"';
    return `<div class="st-stage"${attrs}>
        ${portrait(L.who, L.emo)}
        <div class="st-say">
          <div class="st-meta"><b class="st-who">${esc(whoName(L.who))}</b><span class="st-role">${esc(sub(S, hero(L.who).role || ''))}</span></div>
          <p class="st-text">${esc(sub(S, L.text || ''))}</p>
          ${many ? `<div class="st-foot">${prog}${dots}</div>` : ''}
          ${last ? '' : '<button type="button" class="btn primary block st-next" data-act="storyNext">Дальше <span aria-hidden="true">›</span></button>'}
        </div>
      </div>
      ${last ? choicesHtml(S, sc) : ''}`;
  }
  function chapterOf(S, sc) {
    const R = ST.state(S);
    const id = sc.ch || (R ? ST.chapter(S, R) : '');
    return ST.chapterName ? ST.chapterName(id) : id;
  }
  function sceneHtml(S, sc) {
    const paper = post(sc), climax = isClimax(sc), ch = chapterOf(S, sc);
    const ey = paper ? (sc.form === 'post' ? 'Пост' : 'Письмо') : climax ? 'Поворотный момент' : ch;
    return `<div class="modal-h st-h${climax ? ' climax' : ''}">
        <span class="eyebrow st-ey">${esc(ey)}</span>
        ${climax ? `<span class="st-ch">${esc(ch)}</span>` : ''}
        <h2>${esc(sub(S, sc.title))}</h2>
      </div>
      <div class="modal-b story-m">${bodyHtml(S, sc)}</div>`;
  }

  /* ---------- открыть сцену ---------- */
  // Тяжёлый момент (form:'moment'): окна с репликами нет — есть заставка BK.Moment
  // (медленное затемнение, грустная 8-битная тема, пиксельная сцена-намёк). Кнопка «Дальше»
  // разрешает сцену обычным путём (storyPick 0), поэтому последствия и летопись — как у всех.
  function isMoment(sc) { return !!(sc && sc.form === 'moment'); }
  function momentLines(S, sc) {
    const m = sc.moment || {};
    const src = (m.lines && m.lines.length) ? m.lines : (sc.lines || []);
    return src.map((l) => ({ who: l.who ? whoName(l.who) : '', text: sub(S, l.text || '') }));
  }
  function openScene(keep) {
    const S = APP() && APP().state; if (!S) return false;
    const sc = ST.pendingScene(S);
    if (sc) {
      ui.scene = sc.id; ui.line = 0; ui.form = sc.form || 'scene'; ui.letter = null;
      if (isMoment(sc) && BK.Moment) {
        // заставку показываем без окна: она сама держит паузу и сама зовёт «Дальше»
        ui.moment = sc.id;
        BK.Moment.play(S, { id: sc.id, title: sub(S, sc.title), lines: momentLines(S, sc) }, () => {
          ui.moment = null;
          if (APP().state !== S) return;                       // за время заставки загрузили другую игру
          const A = APP(); if (A && A.ACT && A.ACT.storyPick) A.ACT.storyPick({ arg: '0' });
        });
        return true;
      }
      ui.moment = null;
      APP().openModal(sceneHtml(S, sc), { closable: false, keepScroll: keep === 'keep' });
      decorate(sc);
      return true;
    }
    const m = firstUnread(S);
    if (m) { showLetter(S, m, keep); return true; }
    return false;
  }
  function decorate(sc) {
    const el = $('#modal .modal'); if (!el) return;
    el.classList.add('story-modal', 'story-' + (ui.form || 'scene'));
    el.classList.toggle('story-climax', isClimax(sc));
    el.classList.toggle('story-paper', post(sc));
    el.setAttribute('aria-label', sc.title || 'Сцена');
    bindStage();
    hydrate(el);
  }
  // тап по реплике = «Дальше» (кнопки внутри не трогаем)
  function bindStage() {
    const st = $('#modal .st-stage[data-next="1"]'); if (!st) return;
    const go = (ev) => { if (ev.target.closest && ev.target.closest('button')) return; advance(); };
    st.addEventListener('click', go);
    st.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); advance(); } });
  }
  function renderBody(S, sc) {
    const m = $('#modal .story-m'); if (!m) return;
    m.innerHTML = bodyHtml(S, sc);
    bindStage();
    hydrate(m);
  }
  function advance() {
    const S = APP() && APP().state; if (!S) return false;
    const sc = ST.pendingScene(S); if (!sc || post(sc)) return false;
    const lines = sc.lines || [];
    if (ui.line < lines.length - 1) { ui.line++; renderBody(S, sc); return true; }
    const first = $('#modal .st-choices .choice:not(:disabled), #modal .st-choices .btn:not(:disabled)');
    if (first) { first.focus(); return true; }
    return false;
  }

  /* ---------- входящие (S.story.inbox) — письма пишет логика; пусто — ничего не показываем ---------- */
  function firstUnread(S) {
    const R = ST.state(S); if (!R || !R.inbox || !R.inbox.length) return null;
    return R.inbox.find((m) => m && !m.read) || null;
  }
  function letterHtml(S, m) {
    const R = ST.state(S), day = m.day != null ? m.day : S.day;
    const who = m.who || ((m.lines && m.lines[0] && m.lines[0].who) || 'semyon');
    const h = hero(who);
    const lines = m.lines || (m.text ? [{ who, text: m.text }] : []);
    const body = lines.map((l) => esc(sub(S, l.text))).join('</p><p>');
    const isPost = m.form === 'post';
    return `<div class="modal-h st-h"><span class="eyebrow st-ey">${isPost ? 'Пост' : 'Входящее'}</span><h2>${esc(sub(S, m.title || (isPost ? 'Новый пост' : 'Письмо')))}</h2></div>
      <div class="modal-b story-m"><article class="st-paper ${isPost ? 'post' : 'letter'}">
        <header class="st-ph">${portrait(who, 'smile', 'sm')}<span class="st-pw2"><b>${esc(h.name)}</b><small>${esc(sub(S, h.role || ''))} · ${E().fmtDate(day)}</small></span><span class="st-kind">${isPost ? 'Пост' : 'Письмо'}</span></header>
        <div class="st-pb"><p>${body}</p></div><div class="st-ps">— ${esc(whoName(who))}</div>
      </article><div class="st-choices st-one"><button type="button" class="btn primary block st-big" data-act="storyRead">Прочитано</button></div></div>`;
  }
  function showLetter(S, m, keep) {
    ui.scene = null; ui.letter = m; ui.form = m.form || 'letter';
    APP().openModal(letterHtml(S, m), { closable: false, keepScroll: keep === 'keep' });
    decorate({ title: m.title || 'Письмо', form: ui.form });
  }
  function markRead(S, m) {
    if (!m || m.read) return;
    m.read = true;
    try { APP().save(); } catch (e) { /* сохранит следующий автосейв */ }
  }

  /* ---------- личное (семейное) дело: окно «Решить» ----------
     Строку «Мама болеет — 4 дня, чтобы решить» и кнопку «Решить» даёт реестр нитей
     (BK.Threads.attItems, src/threads.js), блок в «Сводке» — BK.Story.famDash, сам выбор и его
     последствия — BK.Story.famPick (src/story.js). Здесь только окно: цена названа на кнопке,
     а цена «ничего не делать» написана прямо в нём — срок вышел, значит решится само, и вот так. */
  function famHtml(S, id) {
    const T = BK.Threads, t = (T && T.byId) ? T.byId(S, id) : null;
    const opts = (ST.famOpts && ST.famOpts(S, id)) || [];
    if (!t || t.done || !opts.length) return null;
    const def = (ST.famDefs ? ST.famDefs() : []).filter((x) => x.id === String(id).replace(/^fam-/, ''))[0] || {};
    const left = ST.famLeft ? ST.famLeft(S, t) : 0;
    const rows = opts.map((o, i) => `<button type="button" class="choice st-choice" data-act="famPick" data-id="${esc(id)}" data-arg="${i}">
        <span class="cl" aria-hidden="true">${LET[i] || (i + 1)}</span>
        <b>${esc(sub(S, o.label))}</b>
        ${o.desc ? `<span class="cd">${esc(sub(S, o.desc))}</span>` : ''}
        ${o.cost ? `<span class="cc">${esc(BK.fmtMoney ? BK.fmtMoney(o.cost) : Math.round(o.cost))}</span>` : ''}
      </button>`).join('');
    const word = left % 10 === 1 && left % 100 !== 11 ? 'день' : (left % 10 >= 2 && left % 10 <= 4 && (left % 100 < 10 || left % 100 >= 20) ? 'дня' : 'дней');
    const leftTxt = left > 0
      ? `Осталось ${left} ${word}. Если не решите — решится само: ${esc(def.effect || 'как получится')}.`
      : `Срок вышел. Решится само: ${esc(def.effect || 'как получится')}.`;
    return `<div class="modal-h st-h"><span class="eyebrow st-ey">Свои люди</span><h2>${esc(sub(S, t.ask || t.who))}</h2></div>
      <div class="modal-b story-m">
        <p class="fam-lead">${esc(sub(S, t.text || ''))}</p>
        <div class="st-choices">${rows}</div>
        <p class="fam-note">${leftTxt}</p>
      </div>`;
  }
  function famOpen(id) {
    const S = APP() && APP().state; if (!S || !ST.famOpts) return false;
    const html = famHtml(S, id);
    if (!html) { APP().toast('Свои люди', 'Это дело уже решено.', 'warn'); return false; }
    APP().openModal(html, { closable: true });
    if (BK.Sound) BK.Sound.play('win');
    return true;
  }

  /* ---------- лента в «Сводке»: последнее решение + «Вся летопись» ---------- */
  function block(S) {
    const R = ST.state(S); if (!R) return '';
    const log = R.log || [], last = log.length ? log[log.length - 1] : null;
    const pend = ST.pendingScene(S) || firstUnread(S);
    if (!last && !pend) return '';
    let inner;
    if (pend) {
      const title = pend.title || (pend.text ? String(pend.text).slice(0, 60) : 'Письмо');
      inner = `<div class="st-pend"><span class="st-pi" aria-hidden="true">${CHAT}</span><span class="st-pt"><b>«${esc(sub(S, title))}»</b><small>Ждёт вашего решения</small></span><button class="btn sm primary" data-act="story">Открыть</button></div>`;
    } else {
      const ch = last.chapter ? ST.chapterName(last.chapter) : '';
      inner = `<div class="st-last"><span class="st-ld">${E().fmtDate(last.day)}</span><span class="st-lt"><b>${esc(sub(S, last.title || 'Решение'))}</b>${last.choice ? `<small>${esc(sub(S, last.choice))}</small>` : ''}${ch ? `<small class="st-lc">${esc(ch)}</small>` : ''}</span></div>`;
    }
    return `<div class="sec storyb"><h3><span class="st-h">${BOOK}История</span><button class="linkbtn" data-act="storyLog">Вся летопись →</button></h3>${inner}</div>`;
  }

  /* ---------- летопись ---------- */
  function logHtml(S) {
    const h = ST.history(S);
    const head = '<div class="modal-h"><span class="eyebrow">История</span><h2>Летопись</h2></div>';
    if (!h.list.length && !h.ending) return `${head}<div class="modal-b"><p class="hint" style="margin:0">Пока ничего не случилось. История начинается с первого решения.</p></div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    let s = `${head}<div class="modal-b story-m st-logm">`;
    for (const ch of h.chapters) {
      s += `<h4 class="st-ch-h">${esc(ch.name)}<small>${ch.items.length}</small></h4><ul class="st-log">`;
      for (const it of ch.items) s += `<li><span class="st-d">${E().fmtDate(it.day)}</span><span class="st-lb"><b>${esc(sub(S, it.title || ''))}</b>${it.choice ? `<span class="st-c">${esc(sub(S, it.choice))}</span>` : ''}</span></li>`;
      s += '</ul>';
    }
    if (h.ending) s += `<div class="st-end"><b>${esc(sub(S, h.ending.name))}</b><span>${esc(sub(S, h.ending.text))}</span></div>`;
    return `${s}</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
  }
  function openLog() {
    const S = APP() && APP().state; if (!S) return;
    APP().openModal(logHtml(S), { closable: true });
    const el = $('#modal .modal'); if (el) el.classList.add('story-modal', 'story-logm');
    if (BK.Sound) BK.Sound.play('ribbon');
  }

  /* ---------- тост о решении (как у остальных механик) ---------- */
  function notify(n) {
    if (!n) return;
    if (n.phase === 'scene') { openScene(); return; }
    const box = document.getElementById('toasts'); if (!box) return;
    const S = APP() && APP().state;
    const end = n.phase === 'ending';
    const el = document.createElement('div');
    el.className = 'toast sttoast ' + (end ? 'warn' : 'good');
    el.setAttribute('role', 'status');
    if (end) {
      el.innerHTML = `<span class="mi" aria-hidden="true">${BOOK}</span><span class="mt"><span class="ey">История закончилась</span><b>${esc(sub(S, n.name || ''))}</b>${n.text ? `<span class="md">${esc(sub(S, n.text))}</span>` : ''}</span>`;
    } else {
      el.innerHTML = `<span class="mi" aria-hidden="true">${BOOK}</span><span class="mt"><span class="ey">Решение</span><b>${esc(sub(S, n.title || 'Сцена'))}</b><span class="md">${esc(sub(S, n.choice || ''))}${n.out ? ` · ${esc(sub(S, n.out))}` : ''}</span></span>`;
    }
    el.title = 'Открыть летопись';
    el.addEventListener('click', () => { el.remove(); openLog(); });
    setTimeout(() => el.remove(), 9000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    // Победа в истории звучит победной темой (большое событие), тяжёлые финалы — как раньше.
    const winEnd = end && WIN_END[n.id];
    if (BK.Sound) { if (winEnd) BK.Sound.music('victory'); else BK.Sound.play(end ? 'warn' : 'fanfare'); }
  }

  /* ---------- клавиши: Enter/Space — дальше, Esc сцену НЕ закрывает ---------- */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!ui.scene && !ui.letter) return;
    const A = APP(); if (!A || !A.ui || !A.ui.modal) return;
    if (e.key === 'Escape') return;                       // сцену нельзя просто закрыть — нужно решение
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
      const a = document.activeElement;
      if (a && a.tagName === 'BUTTON') return;            // кнопка с фокусом работает сама
      if (advance()) e.preventDefault();
    }
  }

  /* ---------- врезка в ACT ---------- */
  // Лента «История» встроена в panels.js (dash) — обёртка больше не нужна.
  function boot(tries) {
    const A = APP() && APP().ACT;
    if (!A) { if ((tries || 0) < 20) setTimeout(() => boot((tries || 0) + 1), 150); return; }
    if (A.__storyUI) return;
    A.__storyUI = true;
    Object.assign(A, {
      story: () => { if (!openScene()) APP().toast('История', 'Сейчас сюжет ничего не ждёт.', 'warn'); },
      storyLog: () => openLog(),
      storyNext: () => { advance(); },
      storyPick: (d) => {
        const S = APP().state; if (!S) return;
        // выбор, который заканчивает историю, подтверждаем — чтобы не нажать случайно
        const sc0 = ST.pendingScene(S); const c0 = sc0 && (sc0.choices || [])[+d.arg];
        if (c0 && (c0.effects || []).some((e) => e.t === 'ending') && !ui.confirmEnd) {
          ui.confirmEnd = sc0.id;
          APP().openModal(`<div class="modal-h"><span class="eyebrow">Подтверждение</span><h2>Закончить историю?</h2></div><div class="modal-b">
            <p style="margin:0">Вы выбрали: «${String(c0.label).replace(/[<>&]/g, '')}».</p>
            <p class="hint" style="margin:0">Это решение заканчивает игру — дальше будет только экран финала и итоги.</p></div>
            <div class="modal-f"><button class="btn danger block" data-act="storyPick" data-arg="${+d.arg}">Да, закончить</button><button class="btn block" data-act="story">Вернуться к выбору</button></div>`, { closable: false });
          return;
        }
        ui.confirmEnd = null;
        if (ui.letter) { const m = ui.letter; ui.letter = null; markRead(S, m); if (!openScene()) { APP().closeModal(); return; } APP().refresh(); return; }
        const r = ST.resolve(S, +d.arg);
        if (!r.ok) { APP().toast('Не получилось', r.msg || '', 'warn'); return; }
        try { APP().save(); } catch (e) { /* автосейв ниже */ }
        ui.line = 0;
        if (S.lost) { APP().refresh(); return; }          // концовка: игра останавливается, итоги показывает app.js
        if (!openScene('keep')) { APP().closeModal(); return; }
        APP().refresh();                                  // панель за окном: снять «Ждёт решения»
      },
      storyRead: () => {
        const S = APP().state; if (!S || !ui.letter) return;
        const m = ui.letter; ui.letter = null; markRead(S, m);
        if (!openScene()) { APP().closeModal(); return; }
        APP().refresh();
      },
      // личные дела (BK.Threads + BK.Story.fam*): строка в «Требует внимания» и блок в «Сводке»
      // ведут сюда — «Решить» открывает окно, выбор применяет BK.Story.famPick
      fam: (d) => famOpen(d && (d.arg || d.id)),
      famPick: (d) => {
        const S = APP().state; if (!S || !ST.famPick) return;
        const r = ST.famPick(S, d && d.id, +(d && d.arg));
        if (!r.ok) { APP().toast('Не получилось', r.msg || '', 'warn'); return; }
        APP().closeModal();
        APP().toast(r.missed ? 'Не успели' : 'Решено', r.label || '', r.missed ? 'warn' : 'good');
        APP().refresh();
      },
    });
  }
  document.addEventListener('keydown', onKey);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.StoryUI = { openScene, openLog, block, logHtml, sceneHtml, notify, toast: notify, portrait, pxKey, PX_NOTE, ICON: BOOK, sub, get ui() { return ui; } };
})();
