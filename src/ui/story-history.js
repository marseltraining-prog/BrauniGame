/* =====================================================================
   ЛЕТОПИСЬ-ИСТОРИЯ И КНИГА СЕМЁНА (BK.StoryHistory).
   Раздел «История» в «Итогах игры» (src/ui/extras.js): рассказ по главам
   из летописи BK.Story.history(S), книга Семёна Аркадьевича (docs/story.md §5.3)
   и эпилоги героев по отношениям rel и флагам f.
   Кнопка «Сохранить картинкой» рисует летопись на canvas (1080×1350) и отдаёт PNG —
   тем же способом, что BK.PWA рисует иконку (canvas → toDataURL).
   Игра без сюжета (нет S.story / летописи) — раздела нет совсем.
   Данные — src/story.js (BK.Story) и src/data/story.js (BK.STORY). Логику не трогаем.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const HAS_DOM = typeof document !== 'undefined';
  const ST = () => BK.Story, APP = () => BK.App, E = () => BK.Engine;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nw = (n, a, b, c) => (BK.UIH ? BK.UIH.nw(n, a, b, c) : `${Math.round(n)} ${c}`);
  /* Местный слой (src/data/story-cast.js): книга Семёна, эпилоги и подпись «Уфа жуёт» читаются
     по городу партии — в Москве «Москва жуёт», Рашид становится местным наставником и т. д.
     Для Уфы swap() возвращает строку как есть, поэтому её итоги и картинка прежние. */
  const sub = (S, t) => { const C = BK.STORY_CAST; if (!C || !C.swap || t == null) return t; try { return C.swap(S, String(t)); } catch (e) { return t; } };
  // Летописец: имя с фамилией («Семён Аркадьевич Литвак») — целиком по городу партии, иначе подстановка
  // оставила бы уфимскую фамилию рядом с местным именем.
  const NARRATOR_UFA = 'Семён Аркадьевич Литвак';
  const narrator = (S) => { const C = BK.STORY_CAST; if (!C || !C.personOf) return NARRATOR_UFA;
    const id = C.cityOf(S); if (id === 'ufa') return NARRATOR_UFA;
    const p = C.personOf(id, 'chronicler'); return (p && p.name) || NARRATOR_UFA; };

  /* ---------------- 1. ЛЕТОПИСЬ: главы и записи ---------------- */
  // Подписи сцен, у которых в журнале нет title (пролог и глава 1) — чтобы в летописи
  // читалось «что случилось», а не «s13».
  const TITLES = {
    p01: 'Пять утра, улица Пушкина', p02: 'Сухой эчпочмак', p03: 'Конверт от бабушки',
    p04: 'Человек в сером пальто', p05: 'Двести эчпочмаков к утру', p06: 'Третий раз за месяц',
    p07: 'Рашид знает', p08: 'Гуля', h_school: 'Рашид предлагает учёбу', h_lesson: 'Урок про аренду',
    promo: 'Повышение', goal: 'Можно открывать своё!',
    s11: 'Ключи', s12: 'Пустая витрина', s13: 'Кофе напротив', s14: 'Батон и танец',
    s15: 'Первый наём', s16: 'Первый плюс', s17: 'Письмо от Рашида', s18: 'Вторая вывеска',
    ready: 'Пора расти', s1fail: 'Кофейня закрылась',
  };
  // Одна запись летописи → { дата, что случилось, ваше решение }
  function norm(it, S) {
    const id = String(it.id == null ? '' : it.id);
    let title = sub(S, it.title || TITLES[id] || '');
    let choice = typeof it.choice === 'string' ? sub(S, it.choice) : null;
    if (!title) title = sub(S, it.line || id);
    else if (!choice && it.line && it.line !== title) choice = sub(S, it.line);
    // Пролог и глава 1 не пишут поле chapter — достраиваем по факту: записи пролога идут
    // без дня игры, у главы 1 день уже есть.
    const chapter = it.chapter || (it.day == null ? 'prologue' : 'own');
    return { day: it.day, pm: it.pm, id, title: String(title), choice: choice ? String(choice) : null, chapter };
  }
  function dateOf(it) {
    if (it.day != null && isFinite(it.day)) return E().fmtDate(it.day);
    if (it.pm != null) return 'Пролог';
    return '';
  }
  // Список летописи → главы (подряд идущие записи одной главы — одна глава)
  function chaptersOf(h, S) {
    const out = [];
    for (const raw of (h.list || [])) {
      const it = norm(raw, S);
      let c = out[out.length - 1];
      if (!c || c.id !== it.chapter) { c = { id: it.chapter, name: sub(S, ST().chapterName(it.chapter)), items: [] }; out.push(c); }
      c.items.push(it);
    }
    return out;
  }

  /* ---------------- 2. ЭПИЛОГИ ГЕРОЕВ (по отношениям и флагам) ---------------- */
  // «Деталь на пустом стуле» — у каждого героя своя (docs/story.md §7, Ф2).
  const DETAIL = {
    rashid: 'жестяная банка с закваской — без записки',
    gulya: 'белая банка с солью, из которой она солила всё',
    oleg: 'калькулятор с наклейкой «Двор» и чей-то недоеденный батон',
    elvira: 'открытка из Москвы: «План выполнен. Почти.»',
    family: 'тёплый ещё эчпочмак, завёрнутый в полотенце',
    semyon: 'блокнот «Уфа жуёт», исписанный до последней страницы',
    ildar: 'телефон с открытым приложением доставки и двенадцатью пропущенными',
    babushka: 'тетрадка в клетку, перевязанная ниткой',
  };
  const HEROES = [
    { id: 'rashid', name: 'Рашид', text: (f, rel) => {
      if (f.kalach === 'dvor' && f.mentor !== 'friend' && f.mentor !== 'partner') return '«Калач» теперь у «Двора», и Рашид об этом не говорит. Совсем.';
      if (f.kalach === 'mine') return 'Рашид продал «Калач» вам и приходит проверять печь. Бесплатно, но с видом эксперта.';
      if (f.mentor === 'friend') return 'Рашид ворчит, что кофе стал хуже, и каждый день пьёт его у вас. Кофе не стал хуже.';
      if (f.mentor === 'partner') return 'Рашид — совладелец и главный по закваске: «Держи банку в тепле, она живая».';
      if (f.mentor === 'intern') return 'Рашид долго косился на вашу стажировку у Олега, но закваску всё-таки дал.';
      if (f.mentor === 'enemy') return 'Рашид открыл «Калач» заново — маленький, злой, с лучшей закваской в городе.';
      if ((rel.rashid || 0) >= 20) return 'Рашид советует редко, по-стариковски, но всегда в точку.';
      return 'Рашид варит свой чай чёрный и говорит, что вы «ничего, но хлеб у него лучше».';
    } },
    { id: 'gulya', name: 'Гуля', text: (f, rel) => {
      if (f.gulya === 'manager') return 'Гуля ведёт производство всей сети и держит соль в белой банке. Банка на месте.';
      if (f.gulya === 'share') return 'Гуля — совладелица и первый человек в цехе. Спорит с Рашидом о закваске и обычно побеждает.';
      if (f.gulya === 'with') return 'Гуля выросла до директора и до сих пор зовёт вас «шеф» с ударением на второй слог.';
      if (f.gulya === 'rashid') return 'Гуля осталась с Рашидом. Иногда пишет: «У вас тесто лучше. Но я ему не скажу».';
      if ((rel.gulya || 0) <= -20) return 'Гуля ушла тихо, оставив на столе ту самую белую банку.';
      return 'Гуля печёт лучше всех и не признаёт магазинное тесто.';
    } },
    { id: 'oleg', name: 'Олег', text: (f, rel) => {
      if (f.lenin === 'pact') return 'Олег держит слово: рядом с вашими точками не встаёт — только через дорогу, из принципа.';
      if (f.lenin === 'no' || f.lenin === 'fight') return 'Олег всё ещё воюет — тише, но с азартом и скидками по вторникам.';
      if ((rel.oleg || 0) >= 30) return 'Олег звонит по делу и просто так, и вы давно не считаете, кто кому должен.';
      if ((rel.oleg || 0) <= -30) return 'Олег ушёл красиво, как обещал, и вывеску свою забрал.';
      return 'Олег процветает и кивает так, будто ничего и не было.';
    } },
    { id: 'elvira', name: 'Эльвира', text: (f, rel) => {
      if (f.fund > 0) return 'Эльвира считает вас своим лучшим вложением и говорит это вслух, с процентами.';
      if ((rel.elvira || 0) <= -10) return 'Эльвира больше не звонит. Это, в общем, тоже ответ.';
      if ((rel.elvira || 0) >= 10) return 'Эльвира заходит без предупреждения, пьёт кофе и записывает цифры в свой блокнот.';
      return 'Эльвира на пенсию не собирается: у неё новые проекты и те же цифры в блокноте.';
    } },
    { id: 'family', name: 'Семья', text: (f, rel) => {
      if ((rel.family || 0) >= 30) return 'Мама Фания накрывает на всех, и стол опять не помещается.';
      if ((rel.family || 0) <= 0) return 'Мама Фания ставит торт в холодильник: «Ничего. Потом».';
      return 'Мама Фания спрашивает, ели ли вы сегодня, и по лицу видит, что нет.';
    } },
    { id: 'semyon', name: 'Семён', text: (f, rel) => {
      if ((rel.semyon || 0) >= 10) return 'Семён сидит с краю и всё равно записывает. Даже за столом. Особенно за столом.';
      return 'Семён дописывает книгу и обещает ни слова неправды. Врёт умеренно.';
    } },
    { id: 'ildar', name: 'Ильдар', text: (f, rel) => {
      if (f.ildar === 'smm') return 'Ильдар ведёт соцсети сети и требует называть это «контентом».';
      if (f.ildar === 'agency') return 'Ильдар пошёл работать в агентство и теперь присылает вам счёта и советы.';
      if (f.ildar === 'none') return 'Ильдар остался при своём: соцсети — баловство, сарафан надёжнее.';
      if (f.ildar === 'moscow') return 'Ильдар уехал в Москву, присылает стикеры и очень деловые голосовые.';
      return 'Ильдар вырос, научился считать и до сих пор просит у вас советов — или делает вид.';
    } },
    { id: 'babushka', name: 'Бабушка', text: (f, rel) => {
      if ((rel.babushka || 0) >= 10) return 'Бабушка Сания проверяет ваши эчпочмаки: «Лук мелковат. Но ничего».';
      return 'Бабушка Сания говорит, что магазинное тесто — это не тесто. И она права.';
    } },
  ];
  // Герой «был в игре» — есть отношения или его флаг
  function met(id, rel, f) {
    if (id === 'family' || id === 'semyon') return true;
    if ((rel[id] || 0) !== 0) return true;
    if (id === 'rashid') return f.mentor != null || f.kalach === 'dvor' || f.kalach === 'mine';
    if (id === 'gulya') return f.gulya != null;
    if (id === 'oleg') return f.lenin != null || !!f.olegCard;
    if (id === 'elvira') return f.fund > 0;
    if (id === 'ildar') return f.ildar != null;
    return false;
  }
  // Ключи портретов в BK.STORY.heroes не всегда совпадают с Px.CAST — переводим
  // и подстраховываемся: нет портрета — нет и пустой рамки.
  const PX = { ildar: 'damir' };
  function heroPx(id) { const h = (BK.STORY && BK.STORY.heroes) || {}; return PX[id] || (h[id] && h[id].px) || id; }
  function portraitOf(id) {
    if (!HAS_DOM || !BK.Px || !BK.Px.portraitTag) return '';
    const cast = BK.Px.CAST || {};
    if (!cast[heroPx(id)]) return '';
    const C = BK.STORY_CAST, role = C && C.HERO_ROLE ? C.HERO_ROLE[id] : undefined;   // городское лицо (cast.js)
    return BK.Px.portraitTag(heroPx(id), 'calm', 'sh-pxp', role);
  }
  // > = 10 — «сидит за столом», иначе — «стул пустой, но с деталью» (docs/story.md §7, Ф2)
  function epilogues(R, S) {
    const rel = (R && R.rel) || {}, f = (R && R.f) || {};
    const out = [];
    for (const x of HEROES) {
      if (!met(x.id, rel, f)) continue;
      out.push({ id: x.id, name: sub(S, x.name), at: (rel[x.id] || 0) >= 10, text: sub(S, x.text(f, rel)), detail: sub(S, DETAIL[x.id] || 'что-то очень личное'), px: heroPx(x.id) });
    }
    return out;
  }

  /* ---------------- 3. КНИГА СЕМЁНА ---------------- */
  const BOOK_TITLES = {
    empire: 'Хлеб на миллиард', city: 'Хлеб нашего города', twocrusts: 'Две корки',
    empty: 'Человек-калькулятор', deal: 'Продано', hired: 'Смена', bankrupt: 'Тесто и ещё раз тесто',
  };
  function endingOf(S, R, h) {
    const id = (R && R.ending) || (S && S.storyEnding) || null;
    const list = (BK.STORY && BK.STORY.endings) || {};
    const obj = (h && h.ending) || (id ? list[id] : null) || null;
    return obj ? { id: id || obj.id || null, name: obj.name || 'Финал', text: obj.text || '' } : null;
  }
  function bookOf(S, R, h) {
    const e = endingOf(S, R, h);
    const company = String((S && S.company) || 'Пекарня');
    const stores = Math.max(((S.stats || {}).peakStores) || 0, ((S.stores || []).length));
    const years = (S.day || 0) / 365;
    const yy = years < 1 ? 'меньше года' : nw(Math.max(1, Math.round(years)), 'год', 'года', 'лет');
    const f = (R && R.f) || {};
    const p = [];
    p.push(`Меня зовут ${narrator(S)}. Двадцать лет пишу про еду в Уфе и всё это время искал, в чём подвох. В «${company}» подвоха не нашёл — только муку на рукаве.`);
    p.push(`Начиналось всё с одной точки и очень нервного хозяина. Спустя ${yy} в сети стало ${nw(Math.max(1, stores), 'точка', 'точки', 'точек')}. Я проверил каждую. Дважды, если считать эчпочмаки.`);
    if (f.scandal === 'admit') p.push('Когда случилась та история, вы не стали юлить. Я это запомнил. Город — тоже.');
    else if (f.scandal === 'hide') p.push('Про ту историю вы молчали. Я тоже. Из уважения к хорошему эчпочмаку.');
    else if (f.ufa === 'deep') p.push('Вы выбрали не вширь, а вглубь — и хлеб от этого, честно говоря, стал лучше.');
    else if (f.ufa === 'russia') p.push('Вы ушли за Урал. Уфа узнала об этом из моей колонки — раньше, чем из новостей.');
    if (e) p.push(`Чем кончилось — вы знаете: ${e.name}. Только не пересказывайте вслух, у меня эксклюзив.`);
    else p.push('Чем кончилось — не скажу: история ещё пишется, а я не люблю спойлеры.');
    p.push('Могло быть хуже. Могло быть лучше. Но американо у вас честный, и это я написал без взятки.');
    return { title: sub(S, BOOK_TITLES[(e && e.id) || ''] || 'Хлебная карта'), company, lines: p.map((t) => sub(S, t)), ending: e };
  }

  /* ---------------- 4. РАЗДЕЛ «ИСТОРИЯ» В ИТОГАХ ---------------- */
  function epiHtml(list) {
    return list.map((x) => {
      const px = portraitOf(x.id);
      const state = x.at ? '<span class="sh-at">сидит за столом</span>' : '<span class="sh-away">стул пустой</span>';
      return `<li class="${px ? '' : 'sh-nopx'}">${px}<span> <b>${esc(x.name)}</b> — ${state}. ${esc(x.text)}${x.at ? '' : ` <i class="sh-dt">На стуле — ${esc(x.detail)}.</i>`}</span></li>`;
    }).join('');
  }
  function summarySection(S) {
    try {
      const st = ST(); if (!st || !st.history || !st.state || !st.state(S)) return '';
      const R = st.state(S);
      const h = st.history(S) || {};
      if (!R || !((R.log && R.log.length) || R.ending)) return '';   // летописи нет — раздела нет
      if (HAS_DOM) styles();
      const book = bookOf(S, R, h);
      const chs = chaptersOf(h, S);
      const eps = epilogues(R, S);
      let s = `<div class="sec sh-sec" id="shSec"><h3><span>История</span><small>летопись и книга Семёна</small></h3>`;
      s += `<div class="sh-book"><span class="sh-eyebrow">Книга Семёна Аркадьевича Литвака</span><b class="sh-bt">«${esc(book.title)}»</b><div class="sh-bl">${book.lines.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;
      if (book.ending) s += `<div class="sh-end"><b>${esc(book.ending.name)}</b><span>${esc(book.ending.text)}</span></div>`;
      s += '</div>';
      s += `<div class="sh-ch"><b>Летопись по главам</b>`;
      for (const c of chs) {
        s += `<div class="sh-chb"><span class="sh-chh">${esc(c.name)}</span><ul class="sh-list">`;
        for (const it of c.items) {
          const d = dateOf(it);
          s += `<li>${d ? `<span class="sh-d">${esc(d)}</span>` : '<span class="sh-d"></span>'}<span><b class="sh-t">${esc(it.title)}</b>${it.choice ? ` <span class="sh-c">— ${esc(it.choice)}</span>` : ''}</span></li>`;
        }
        s += '</ul></div>';
      }
      s += '</div>';
      if (eps.length) s += `<div class="sh-ch"><b>Где все теперь</b><ul class="sh-epi">${epiHtml(eps)}</ul></div>`;
      s += `<div class="sh-save"><button class="btn" type="button" data-sh="save">🖼 Сохранить картинкой</button><span class="hint">PNG 1080×1350 — можно показать другу</span></div></div>`;
      return s;
    } catch (e) { return ''; }   // история не должна ломать итоги
  }

  /* ---------------- 5. КАРТИНКА (canvas → PNG) ---------------- */
  const FONT = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
  function wrap(ctx, text, maxW) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    const out = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }
  // Перенос по доступной ширине от x0 до x1 (правый край известен точно — текст не уезжает за рамку).
  function wrapAt(ctx, text, x0, x1) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    const out = []; let cur = '';
    const prev = ctx.textAlign; ctx.textAlign = 'left';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (x0 + ctx.measureText(t).width > x1 && cur) { out.push(cur); cur = w; } else cur = t;
    }
    ctx.textAlign = prev;
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }
  function drawImage(S, R, h) {
    if (!HAS_DOM) return null;
    const cv = document.createElement('canvas');
    const W = 1080, H = 1350;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    const X = 84, X2 = W - 84, MW = X2 - X, LIM = H - 96;
    const INK = '#3b2a1a', SOFT = '#7d6750', CRUST = '#a8652c', LINE = '#dcc9a6', PAPER = '#f7eedb', PAPER2 = '#f0e2c6';
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE; ctx.lineWidth = 4; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.strokeStyle = CRUST; ctx.lineWidth = 2; ctx.strokeRect(44, 44, W - 88, H - 88);
    let y = 122;
    const put = (str, font, color, gap, maxW) => {
      ctx.font = font; ctx.fillStyle = color;
      for (const l of wrap(ctx, str, maxW || MW)) { ctx.fillText(l, X, y); y += gap; }
    };
    const room = (n) => y + n <= LIM;
    const book = bookOf(S, R, h), chs = chaptersOf(h, S), eps = epilogues(R, S);
    put('ЛЕТОПИСЬ · КНИГА СЕМЁНА АРКАДЬЕВИЧА', `600 21px ${FONT}`, SOFT, 34);
    y += 22;
    put(`«${book.title}»`, `700 50px ${FONT}`, INK, 60);
    y += 4;
    put(book.company, `700 30px ${FONT}`, CRUST, 42);
    const stores = Math.max(((S.stats || {}).peakStores) || 0, ((S.stores || []).length));
    const yrs = (S.day || 0) / 365;
    put(`${nw(Math.max(1, stores), 'точка', 'точки', 'точек')} · ${yrs < 1 ? 'меньше года' : nw(Math.max(1, Math.round(yrs)), 'год', 'года', 'лет')} · ${E().fmtDate(S.day)}`, `400 22px ${FONT}`, SOFT, 36);
    y += 8; ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X2, y); ctx.stroke(); y += 40;
    // обложка книги: не больше трёх абзацев, чтобы хватило места на главы и концовку
    const cover = book.lines.length > 3 ? book.lines.slice(0, 2).concat(book.lines.slice(-1)) : book.lines;
    for (const p of cover) { if (!room(80)) break; put(p, `400 24px ${FONT}`, INK, 35); y += 12; }
    y += 16;
    // высоту плашки концовки считаем заранее — главы не должны на неё налезать
    const e = book.ending;
    const PAD = 16, EW = MW - PAD * 2;                    // абзац концовки внутри плашки
    let eH = 0, eLines = [], eTextX = X - 12 + PAD;
    if (e) {
      ctx.font = `400 23px ${FONT}`;
      // рисуем от левого края плашки — измеряем от него же, иначе текст уезжает за рамку
      ctx.save(); ctx.textAlign = 'left';
      eLines = wrapAt(ctx, e.text, eTextX, X2 + 6 - PAD); // правый край плашки минус отступ
      ctx.restore();
      eH = 58 + eLines.length * 32;
    }
    const LIM_CH = Math.max(y + 60, LIM - eH - 128);
    if (y + 74 <= LIM_CH) put('ЛЕТОПИСЬ', `700 22px ${FONT}`, CRUST, 38);
    outer:
    for (const c of chs) {
      if (y + 82 > LIM_CH) break;
      put(c.name, `700 24px ${FONT}`, SOFT, 36);
      for (const it of c.items) {
        if (y + 46 > LIM_CH) break outer;
        const d = dateOf(it);
        put(`${d ? d + ' — ' : ''}${it.title}${it.choice ? ' — ' + it.choice : ''}`, `400 21px ${FONT}`, INK, 32);
      }
      y += 6;
    }
    y += 10;
    // концовка — отдельной плашкой
    if (e && y + eH <= LIM) {
      ctx.fillStyle = PAPER2; ctx.fillRect(X - 12, y - 24, MW + 24, eH - 8);
      ctx.strokeStyle = CRUST; ctx.lineWidth = 3; ctx.strokeRect(X - 12, y - 24, MW + 24, eH - 8);
      ctx.font = `700 28px ${FONT}`; ctx.fillStyle = INK; ctx.fillText(e.name, eTextX, y + 8); y += 46;
      ctx.font = `400 23px ${FONT}`; ctx.fillStyle = SOFT;
      for (const l of eLines) { ctx.fillText(l, eTextX, y); y += 32; }
      y += 14;
    }
    const at = eps.filter((x) => x.at).map((x) => x.name);
    if (room(90)) {
      put('ЗА СТОЛОМ', `700 22px ${FONT}`, CRUST, 36);
      put(at.length ? at.join(', ') + '.' : 'Пока никого — но стулья уже поставили.', `400 23px ${FONT}`, INK, 34);
      const away = eps.filter((x) => !x.at);
      if (away.length && room(70)) put(`Пустые стулья: ${away.map((x) => x.name).join(', ')} — но с деталями.`, `400 21px ${FONT}`, SOFT, 32);
    }
    ctx.font = `400 20px ${FONT}`; ctx.fillStyle = SOFT;
    ctx.fillText(sub(S, narrator(S) + ' · «Уфа жуёт»'), X, H - 62);
    ctx.textAlign = 'right'; ctx.fillText(book.company, X2, H - 62); ctx.textAlign = 'left';
    return cv.toDataURL('image/png');
  }
  function fileName(S) {
    const c = String((S && S.company) || 'karta').replace(/[^\wа-яёА-ЯЁ\-]+/g, '_').slice(0, 40);
    return `letopis-${c}.png`;
  }
  function save(S) {
    if (!HAS_DOM) return;
    const st = ST(), R = st && st.state ? st.state(S) : null;
    if (!R) return;
    let url = null;
    try { url = drawImage(S, R, st.history(S) || {}); } catch (e) { url = null; }
    if (!url) { if (APP()) APP().toast('Не получилось', 'Браузер не дал нарисовать картинку.', 'warn'); return; }
    try {
      const a = document.createElement('a');
      a.href = url; a.download = fileName(S);
      document.body.appendChild(a); a.click(); a.remove();
      if (APP()) APP().toast('Картинка готова', 'Летопись сохранена файлом PNG.', 'good');
    } catch (e) {
      if (APP()) APP().toast('Не получилось', 'Браузер не дал сохранить файл.', 'warn');
    }
  }

  /* ---------------- 6. СТИЛИ И ПРИВЯЗКА ---------------- */
  function styles() {
    if (!HAS_DOM || document.getElementById('shStyles')) return;
    const st = document.createElement('style');
    st.id = 'shStyles';
    st.textContent = `
.sh-sec { border-top: 1px solid var(--line); padding-top: 12px; }
.sh-book { background: linear-gradient(180deg, var(--crust-soft), var(--surface) 78%); border: 1px solid var(--line); border-radius: var(--r); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.sh-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; color: var(--crust-t); }
.sh-bt { font-family: var(--f-display); font-size: 20px; line-height: 1.2; }
.sh-bl { display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); }
.sh-bl p { margin: 0; }
.sh-end { border-left: 3px solid var(--crust); padding: 4px 0 4px 12px; display: flex; flex-direction: column; gap: 3px; }
.sh-end b { font-size: 14px; }
.sh-end span { font-size: 13px; color: var(--ink-2); }
.sh-ch { display: flex; flex-direction: column; gap: 8px; }
.sh-ch > b { font-family: var(--f-display); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-3); }
.sh-chb { display: flex; flex-direction: column; gap: 2px; }
.sh-chh { font-family: var(--f-display); font-size: 12px; font-weight: 600; color: var(--crust-t); }
.sh-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.sh-list li { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 2px 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 13px; line-height: 1.4; }
.sh-list li:last-child { border-bottom: 0; }
.sh-d { font-family: var(--f-mono); font-size: 11px; color: var(--ink-3); }
.sh-t { font-weight: 600; }
.sh-c { color: var(--crust-t); }
.sh-epi { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.sh-epi li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; font-size: 13px; line-height: 1.45; }
.sh-epi li.sh-nopx { grid-template-columns: minmax(0, 1fr); }
.sh-epi .sh-pxp { width: 36px; height: 36px; image-rendering: pixelated; border-radius: 8px; background: var(--surface-2); }
.sh-at { color: var(--good-t); font-weight: 600; }
.sh-away { color: var(--ink-3); font-weight: 600; }
.sh-dt { color: var(--ink-3); font-style: italic; }
.sh-save { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
@media (max-width: 640px) { .sh-list li { grid-template-columns: minmax(0, 1fr); } .sh-list .sh-d { grid-row: 1; } }`;
    (document.head || document.documentElement).appendChild(st);
  }
  function bind(root) {
    if (!HAS_DOM || !root) return;
    styles();
    if (BK.Px && BK.Px.hydrate) { try { BK.Px.hydrate(root); } catch (e) { /* портреты не критичны */ } }
    const b = root.querySelector('[data-sh="save"]');
    if (b && !b.__shBound) {
      b.__shBound = true;
      b.addEventListener('click', () => { const S = APP() && APP().state; if (S) save(S); });
    }
  }

  BK.StoryHistory = { summarySection, block: summarySection, chapters: chaptersOf, epilogues, book: bookOf, drawImage, save, bind, styles, TITLES, portraitOf };
})();
