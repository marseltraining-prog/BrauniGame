/* =====================================================================
   ТРЕТИЙ АКТ «ХОЛДИНГ» (В8, BK.Holding). Чистая логика, без DOM.
   Замысел — docs/holding-design.md; тексты и сцены — src/data/holding.js; числа — CFG.HOLDING;
   интерфейс — src/ui/holding-ui.js (BK.HoldingUI).

   Когда открывается: через CFG.HOLDING.UNLOCK_DELAY дней после победы первого акта (S.won).
   Игрок выбирает один из трёх путей — «Выход на биржу», «За рубеж», «Франшиза-империя» (фаза 1:
   готов только путь биржи, остальные — «скоро») — или отказывается от третьего акта.
   Пока путь не выбран или идёт, финал сюжета «Последний ужин» (sf2) ждёт: концовку даёт путь
   (src/story.js спрашивает BK.Holding.holdsFinale).

   Путь «Выход на биржу» (S.holding.ipo):
     prep     — аудит (уровни 1–3) и совет директоров (1–3): разовая цена, срок, совет — ещё и в месяц;
     roadshow — неделя встреч, цена размещения (ниже / по / выше оценки), два месяца на книгу заявок;
     public   — акции торгуются: цена каждый месяц идёт к «справедливой» (прибыль × P/E × настроение
                рынка); раз в квартал — отчёт против обещанного роста (прогноз): выполнили — цена вверх,
                промах — вниз и звонок из фонда; дивиденды — по выбору;
     цель     — капитализация ≥ CFG.HOLDING.IPO.GOAL_CAP после не меньше GOAL_Q квартальных отчётов → сцена «Колокол» → концовка «Публичная компания».

   Состояние создаётся только при открытии третьего акта (S.holding = { v: 1, … }): у старых сохранений
   и у ботов его нет. **В прогонах ботов холдинг выключен** (sim/load.js ставит ON = false, включает
   BK_HOLDING=1). Свой ГСЧ — S.holding.rng; основной поток случайных чисел не трогаем.
   Подключение — обёртка BK.Engine.tick (как investors.js). Движок не менялся, кроме статьи месяца
   S.month.hold («Биржа и холдинг», входит в расходы) — дивиденды идут статьёй S.month.hdiv (из прибыли).
   Проверка — node sim/holding.js, node qa/holding.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, K = () => BK.CFG.HOLDING, KI = () => BK.CFG.HOLDING.IPO, KA = () => BK.CFG.HOLDING.ABROAD, KF = () => BK.CFG.HOLDING.FRANCHISE, D = () => BK.HOLDING_DATA || {};
  const I = () => (BK.Engine && BK.Engine._int) || {};
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  const state = (S) => (S && S.holding && S.holding.v ? S.holding : null);
  const pl = (S) => (S.macro && S.macro.priceLevel) || 1;
  const PATHS = ['ipo', 'abroad', 'franchise'];

  /* ---------------- состояние ---------------- */
  function defaults(S) {
    return {
      v: 1, unlockDay: S.day, path: null, pathDay: null,
      rng: (((S.seed | 0) ^ 0x7a11d) | 0) || 7,
      f: {}, seen: {}, queue: [], pending: null, log: [], ending: null, endDay: null, ipo: null, abroad: null, franchise: null,
    };
  }
  function ipoDefaults() {
    return {
      stage: 'prep', approach: null, audit: 0, auditJob: null, board: 0, boardJob: null, boardWho: null,
      float: KI().FLOAT_DEF, range: null, rsUntil: null, book: null, cover: null,
      shares: KI().SHARES, own: 1, price: 0, ipoPrice: 0, raised: 0, fee: 0, listDay: null,
      mood: 1, guide: 'mid', div: 0, trust: 0, hist: [], q: [], beats: 0, inline: 0, misses: 0, scandals: 0,
      peakCap: 0, goalDay: null, divPaid: 0, spent: 0,
    };
  }
  function franchiseDefaults() {
    return {
      stage: 'build', points: 0, cities: 0, brand: KF().BRAND0, standards: KF().STAND0, fee: KF().FEE,
      hist: [], paidIn: 0, spent: 0, checks: 0, scandals: 0, goalDay: null, oleg: false, recipe: 'own', apps: 0, lastMonth: 0,
    };
  }
  function abroadDefaults() {
    return {
      stage: 'enter', defaultMode: 'local', menu: 'own', gulya: false, hedge: false, inspection: null,
      jobs: {}, c: {}, hist: [], paidIn: 0, spent: 0, goalDay: null, deval: 0, demandK: 1, demandUntil: 0, priceK: 1,
    };
  }
  function countryDefaults(id) {
    const def = (KA().COUNTRIES || []).find((x) => x.id === id) || {};
    return { id, name: def.name || id, city: def.city || '', open: false, day: null, stores: 0, mode: null, rate: 1, rev: 0, prof: 0, lastGrow: 0 };
  }
  function fill(H) {
    const d = { f: {}, seen: {}, queue: [], log: [] };
    for (const k of Object.keys(d)) if (H[k] == null || typeof H[k] !== 'object') H[k] = d[k];
    if (H.pending === undefined) H.pending = null;
    if (H.ipo) { const id = ipoDefaults(); for (const k of Object.keys(id)) if (H.ipo[k] === undefined) H.ipo[k] = id[k]; }
    if (H.franchise) { const id = franchiseDefaults(); for (const k of Object.keys(id)) if (H.franchise[k] === undefined) H.franchise[k] = id[k]; }
    if (H.abroad) {
      const id = abroadDefaults();
      for (const k of Object.keys(id)) if (H.abroad[k] === undefined) H.abroad[k] = id[k];
      if (!H.abroad.c || typeof H.abroad.c !== 'object') H.abroad.c = {};
      for (const def of (KA().COUNTRIES || [])) if (!H.abroad.c[def.id]) H.abroad.c[def.id] = countryDefaults(def.id);
    }
    if (typeof H.rng !== 'number' || !H.rng) H.rng = 7;
    return H;
  }
  function rnd(H) { H.rng = (Math.imul(H.rng >>> 0, 1664525) + 1013904223) >>> 0; return H.rng / 4294967296; }
  function gauss(H) { const u = Math.max(1e-9, rnd(H)), v = rnd(H); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function log(S, text, kind) { const f = I().log; if (f) f(S, text, kind || 'info'); }
  function toast(S, title, text, kind) { const f = I().toast; if (f) f(S, title, text, kind); }
  function spend(S, v, bucket) { if (!(v > 0)) return; const f = I().spend; if (f) f(S, v, bucket); else { S.cash -= v; S.month[bucket] = (S.month[bucket] || 0) + v; } }
  function note(S, o) { if (S.notify) S.notify.push(Object.assign({ type: 'holding' }, o)); }

  /* ---------------- цифры компании ---------------- */
  function sums(h, from, to) { let rev = 0, prof = 0; for (const x of h.slice(from, to)) { rev += x.rev || 0; prof += x.profit || 0; } return { rev, prof }; }
  function figures(S) {
    const h = S.history || [];
    const a = sums(h, -12), n = Math.min(12, h.length);
    const prev = h.length >= 24 ? sums(h, -24, -12) : null;
    const g = prev && prev.rev > 0 ? a.rev / prev.rev - 1 : 0.1;
    return { rev12: a.rev, prof12: a.prof, margin: a.rev > 0 ? a.prof / a.rev : 0, growth: g, months: n };
  }
  // P/E и «справедливая» стоимость: прибыль × P/E; в убыточный год — доля выручки
  function valuation(S) {
    const H = state(S), P = H && H.ipo, k = KI(), fg = figures(S);
    const gK = 1 + k.G_K * cl(fg.growth, k.G_MIN, k.G_MAX);
    const mK = cl(0.5 + fg.margin / (2 * k.MARGIN_REF), k.MARGIN_K[0], k.MARGIN_K[1]);
    const audit = P ? P.audit : 0, board = P ? P.board : 0;
    const govK = 1 + k.GOV_AUDIT * audit * (P && P.approach === 'big4' ? k.BIG4_GOV : 1) + k.GOV_BOARD * board + (P && P.boardWho === 'elvira' ? 0.04 : 0);
    const divK = 1 + k.DIV_PE * ((P ? P.div : 0) / 0.5);
    const pe = k.PE_BASE * gK * mK * govK * divK;
    const base = fg.prof12 > 0 ? fg.prof12 * pe : 0;
    const floor = fg.rev12 * k.REV_FLOOR * govK;
    return { fair: Math.max(base, floor), pe, gK, mK, govK, divK, fg };
  }
  const cap = (P) => (P ? P.price * P.shares : 0);

  /* ---------------- открытие и выбор пути ---------------- */
  function unlocked(S) { return !!state(S); }
  function day(S) {
    if (!K().ON || !S || S.lost || S.phase !== 'play') return;
    let H = state(S);
    if (!H) {
      if (!S.won || S.day < (S.wonDay || 0) + K().UNLOCK_DELAY) return;
      H = S.holding = defaults(S);
      log(S, 'Третий акт: сеть выросла в холдинг. Выберите путь — биржа, за рубеж или франшиза-империя.', 'good');
      note(S, { phase: 'unlock' });
    }
    fill(H);
    if (H.ending) return;
    flushQueue(S, H);
    if (H.path === 'ipo' && H.ipo) ipoDay(S, H);
    if (H.path === 'abroad' && H.abroad) abroadDay(S, H);
    if (H.path === 'franchise' && H.franchise) franchiseDay(S, H);
  }
  function choose(S, path) {
    const H = state(S); if (!H) return { ok: false, msg: 'Третий акт ещё не открыт' };
    if (H.path && H.path !== 'none') return { ok: false, msg: 'Путь уже выбран' };
    if (path === 'none') { H.path = 'none'; H.pathDay = S.day; pushLog(S, H, 'h_none', 'Третий акт', 'Без холдинга: история закончится как обычно'); return { ok: true }; }
    if (PATHS.indexOf(path) < 0) return { ok: false, msg: 'Нет такого пути' };
    if (!K().READY[path]) return { ok: false, msg: 'Этот путь пока в разработке' };
    H.path = path; H.pathDay = S.day;
    if (path === 'ipo') H.ipo = ipoDefaults();
    if (path === 'abroad') H.abroad = abroadDefaults();
    if (path === 'franchise') H.franchise = franchiseDefaults();
    const p = (D().paths || {})[path] || {};
    pushLog(S, H, 'h_path', 'Третий акт: ' + (p.name || path), p.goal || '');
    log(S, `Третий акт: выбран путь «${p.name || path}». Цель — ${(p.goal || '').toLowerCase()}.`, 'good');
    if (path === 'ipo') startScene(S, 'h_ipo1');
    if (path === 'abroad') startScene(S, 'h_ab1');
    if (path === 'franchise') startScene(S, 'h_fr1');
    return { ok: true };
  }
  // Пока путь не выбран или идёт — финал сюжета ждёт (концовку даст путь). Отказ — история идёт как обычно.
  function holdsFinale(S) { const H = state(S); return !!(H && H.path !== 'none' && !H.ending); }

  /* ---------------- сцены ---------------- */
  function sceneById(id) { return ((D().scenes) || []).find((s) => s.id === id) || null; }
  function blocked(S) { return !!((S.ev && S.ev.pending) || (S.chef && S.chef.pending) || (S.story && S.story.pending)); }
  function startScene(S, id) {
    const H = state(S); if (!H || H.seen[id] != null || H.ending) return false;
    if (H.pending && H.pending.id === id) return false;
    if (H.queue.some((q) => q.id === id)) return false;
    if (H.pending || blocked(S)) { H.queue.push({ id, day: S.day }); return false; }
    H.pending = { id, day: S.day };
    note(S, { phase: 'scene', id });
    return true;
  }
  function flushQueue(S, H) {
    if (H.pending || !H.queue.length || blocked(S)) return;
    const q = H.queue.shift();
    if (H.seen[q.id] != null) return;
    H.pending = { id: q.id, day: S.day };
    note(S, { phase: 'scene', id: q.id });
  }
  function storyR(S) { return BK.Story && BK.Story.state ? BK.Story.state(S) : null; }
  function canChoose(S, need) {
    if (!need) return true;
    if (need.any) return need.any.some((n) => canChoose(S, n));
    const R = storyR(S);
    if (need.rel) for (const k of Object.keys(need.rel)) if (((R && R.rel && R.rel[k]) || 0) < need.rel[k]) return false;
    if (need.flag) for (const k of Object.keys(need.flag)) if (!R || !R.f || R.f[k] !== need.flag[k]) return false;
    return true;
  }
  function needText(S, need) {
    if (canChoose(S, need)) return '';
    const H = (BK.STORY && BK.STORY.heroes) || {};
    const one = (n) => {
      if (n.rel) { const k = Object.keys(n.rel)[0]; return `нужны отношения с героем «${(H[k] && (H[k].short || H[k].name)) || k}» от ${n.rel[k]}`; }
      if (n.flag && n.flag.olegEnd === 'merge') return 'нужно слияние с Олегом';
      return 'пока недоступно';
    };
    return need.any ? need.any.map(one).join(' или ') : one(need);
  }
  // Сцена, как её видит игрок: реплики под исход книги заявок
  function sceneView(S, sc) {
    if (!sc) return null;
    const P = state(S) && state(S).ipo;
    const res = P && P.book;
    const lines = (sc.lines || []).filter((l) => !l.if || l.if === res);
    return Object.assign({}, sc, { lines, choices: (sc.choices || []).map((c) => Object.assign({}, c, { ok: canChoose(S, c.need), why: needText(S, c.need) })) });
  }
  function pendingScene(S) { const H = state(S); return H && H.pending ? sceneView(S, sceneById(H.pending.id)) : null; }
  function resolve(S, idx) {
    const H = state(S); if (!H || !H.pending) return { ok: false, msg: 'Сцены нет' };
    const sc = sceneById(H.pending.id); if (!sc) { H.pending = null; return { ok: false, msg: 'Сцены нет' }; }
    const ch = (sc.choices || [])[idx]; if (!ch) return { ok: false, msg: 'Нет такого варианта' };
    if (!canChoose(S, ch.need)) return { ok: false, msg: 'Этот вариант пока недоступен' };
    H.seen[sc.id] = S.day; H.pending = null;
    const subT = (t) => (BK.Story && BK.Story.heroText ? BK.Story.heroText(S, t) : t);
    pushLog(S, H, sc.id, subT(sc.title), subT(ch.log || ch.label));
    let ending = null;
    for (const fx of ch.effects || []) { if (fx.t === 'ending') ending = fx.id; else apply(S, H, fx); }
    note(S, { phase: 'done', id: sc.id, title: sc.title, choice: ch.label });
    if (ending) endWith(S, ending);
    else flushQueue(S, H);
    return { ok: true, scene: sc, choice: ch, ending };
  }
  function apply(S, H, fx) {
    const P = H.ipo, R = storyR(S);
    switch (fx.t) {
      case 'set': if (P) { P[fx.k] = fx.v; if (fx.k === 'guide' && P.boardWho === 'elvira' && fx.v === 'low') P.guide = 'mid'; } return;
      case 'hflag': H.f[fx.k] = fx.v; return;
      case 'mood': if (P) P.mood = cl(P.mood + fx.add, KI().MOOD[0], KI().MOOD[1]); return;
      case 'rel': if (R && R.rel) R.rel[fx.who] = cl((R.rel[fx.who] || 0) + fx.add, -100, 100); return;
      case 'meter': if (R && R.m) R.m[fx.k] = cl((R.m[fx.k] || 0) + fx.add, -100, 100); return;
      case 'mod': if (Array.isArray(S.mods)) S.mods.push({ t: fx.mt, m: fx.m, until: S.day + (fx.d || 365), scope: 'global', src: 'hold' }); return;
      case 'loyalty': try { E().applyEffects(S, [{ t: 'loyalty', add: fx.add }], { scope: 'global', target: null }); } catch (e) { /* без лояльности */ } return;
      case 'journal': log(S, fx.text, 'info'); return;
      case 'abDefault': if (H.abroad) H.abroad.defaultMode = fx.v === 'own' ? 'own' : 'local'; return;
      case 'abMenu': if (H.abroad) H.abroad.menu = fx.v === 'local' ? 'local' : 'own'; return;
      case 'abGulya': if (H.abroad) H.abroad.gulya = true; return;
      case 'abHedge': if (H.abroad) H.abroad.hedge = true; return;
      case 'abDemand': if (H.abroad) { H.abroad.demandK = fx.v; H.abroad.demandUntil = S.day + (fx.d || 365); } return;
      case 'abPrice': if (H.abroad) H.abroad.priceK = fx.v; return;
      case 'abSpend': spend(S, fx.v * pl(S), 'hold'); if (H.abroad) H.abroad.spent += fx.v * pl(S); return;
      case 'abInspection': if (H.abroad) H.abroad.inspection = fx.v; return;
      case 'abClose':
        if (H.abroad && H.abroad.c[fx.id] && H.abroad.c[fx.id].open) {
          const c = H.abroad.c[fx.id]; c.open = false; c.stores = 0; c.rev = 0; c.prof = 0;
          log(S, `Холдинг: мы ушли из ${c.city || c.name}. Направление закрыто.`, 'bad');
        }
        return;
      case 'abStores': if (H.abroad && H.abroad.c[fx.id]) H.abroad.c[fx.id].stores = Math.max(0, H.abroad.c[fx.id].stores + fx.add); return;
      case 'frBrand': if (H.franchise) H.franchise.brand = cl(H.franchise.brand + fx.add, 0.3, 1.6); return;
      case 'frStand': if (H.franchise) H.franchise.standards = cl(H.franchise.standards + fx.add, 0.3, 1.6); return;
      case 'frPoints': if (H.franchise) H.franchise.points = Math.max(0, Math.round(H.franchise.points * (fx.k || 1) + (fx.add || 0))); return;
      case 'frSpend': spend(S, fx.v * pl(S), 'hold'); if (H.franchise) H.franchise.spent += fx.v * pl(S); return;
      case 'frOleg': if (H.franchise) H.franchise.oleg = true; return;
      case 'frRecipe': if (H.franchise) H.franchise.recipe = fx.v; return;
      case 'frCash': S.cash += fx.v * pl(S); if (H.franchise) H.franchise.paidIn += fx.v * pl(S); return;
      default:
    }
  }
  // запись в летопись холдинга и — если сюжет идёт — в летопись истории (глава «Холдинг»)
  function pushLog(S, H, id, title, choice) {
    H.log.push({ day: S.day, id, title, choice: choice || '' });
    while (H.log.length > 60) H.log.shift();
    const R = storyR(S);
    if (R && Array.isArray(R.log)) { R.log.push({ day: S.day, id, title, choice: choice || '', chapter: 'holding', fx: ['holding'] }); while (R.log.length > 120) R.log.shift(); }
  }
  function endWith(S, id) {
    const H = state(S); if (!H) return;
    H.ending = id; H.endDay = S.day;
    if (BK.Story && BK.Story.endWith && storyR(S)) { BK.Story.endWith(S, id, null, 'holding'); return; }
    const e = ((BK.STORY && BK.STORY.endings) || {})[id] || {};
    S.storyEnding = id; S.lost = true;
    note(S, { phase: 'ending', id, name: e.name, text: e.text });
  }

  /* ---------------- путь «Выход на биржу» ---------------- */
  function auditCost(S, lvl) { const P = state(S).ipo, a = KI().AUDIT[lvl - 1]; return Math.round(a.cost * pl(S) * (P.approach === 'big4' ? KI().BIG4_COST : 1)); }
  function boardCost(S, lvl) { return Math.round(KI().BOARD[lvl - 1].cost * pl(S)); }
  function prepDays(S, base) { const P = state(S).ipo; return Math.round(base * (P.approach === 'own' ? KI().OWN_SLOW : 1)); }
  function boardMonth(S) {
    const P = state(S).ipo; let m = 0;
    for (let i = 0; i < P.board; i++) m += KI().BOARD[i].month;
    if (P.boardWho === 'official') m += 2e6;
    return Math.round(m * pl(S));
  }
  function ipoP(S) { const H = state(S); return H && H.path === 'ipo' ? H.ipo : null; }
  function buyAudit(S) {
    const P = ipoP(S); if (!P || P.stage !== 'prep') return { ok: false, msg: 'Сейчас не подготовка' };
    if (P.auditJob) return { ok: false, msg: 'Аудиторы ещё работают' };
    const lvl = P.audit + 1; if (lvl > KI().AUDIT.length) return { ok: false, msg: 'Аудит уже полный' };
    const c = auditCost(S, lvl); if (S.cash < c) return { ok: false, msg: `Нужно ${fm(c)} на счёте` };
    spend(S, c, 'hold'); P.spent += c;
    P.auditJob = { lvl, until: S.day + prepDays(S, KI().AUDIT[lvl - 1].days) };
    log(S, `Холдинг: аудит — «${KI().AUDIT[lvl - 1].name}», ${fm(c)}. Готово к ${E().fmtDate(P.auditJob.until)}.`, 'info');
    return { ok: true, cost: c };
  }
  function buyBoard(S) {
    const P = ipoP(S); if (!P || P.stage === 'done') return { ok: false, msg: 'Сейчас нельзя' };
    if (P.boardJob) return { ok: false, msg: 'Совет ещё собирается' };
    const lvl = P.board + 1; if (lvl > KI().BOARD.length) return { ok: false, msg: 'Совет уже полный' };
    const c = boardCost(S, lvl); if (S.cash < c) return { ok: false, msg: `Нужно ${fm(c)} на счёте` };
    spend(S, c, 'hold'); P.spent += c;
    P.boardJob = { lvl, until: S.day + prepDays(S, KI().BOARD[lvl - 1].days) };
    log(S, `Холдинг: совет директоров — «${KI().BOARD[lvl - 1].name}», ${fm(c)}. Готово к ${E().fmtDate(P.boardJob.until)}.`, 'info');
    if (lvl === 1) startScene(S, 'h_ipo3');
    return { ok: true, cost: c };
  }
  // что мешает выйти на биржу (пустой список — можно начинать роадшоу)
  function listBlocks(S) {
    const P = ipoP(S); if (!P) return ['путь не выбран'];
    const out = [];
    if (P.stage !== 'prep') out.push('роадшоу уже было');
    if (P.audit < KI().NEED_AUDIT) out.push(`аудит — нужен ${KI().NEED_AUDIT}-й уровень («${KI().AUDIT[KI().NEED_AUDIT - 1].name}»)`);
    if (P.board < KI().NEED_BOARD) out.push('совет директоров — хотя бы два независимых директора');
    if (figures(S).prof12 <= 0) out.push('прибыль за 12 месяцев должна быть в плюсе');
    if (!P.approach) out.push('сначала поговорите с Эльвирой');
    const c = Math.round(KI().ROADSHOW.cost * pl(S));
    if (S.cash < c) out.push(`на роадшоу нужно ${fm(c)}`);
    return out;
  }
  function setFloat(S, f) { const P = ipoP(S); if (!P || P.stage !== 'prep') return { ok: false }; f = +f; if (KI().FLOAT.indexOf(f) < 0) return { ok: false }; P.float = f; return { ok: true }; }
  function startRoadshow(S) {
    const P = ipoP(S); const bl = listBlocks(S); if (!P || bl.length) return { ok: false, msg: bl.join('; ') };
    const c = Math.round(KI().ROADSHOW.cost * pl(S));
    spend(S, c, 'hold'); P.spent += c;
    P.stage = 'roadshow'; P.rsUntil = S.day + KI().ROADSHOW.days;
    log(S, `Холдинг: роадшоу — неделя встреч с фондами, ${fm(c)}. Книга заявок закроется ${E().fmtDate(P.rsUntil)}.`, 'info');
    startScene(S, 'h_ipo4');
    return { ok: true, cost: c };
  }
  function list(S) {
    const H = state(S), P = H.ipo, k = KI();
    const v = valuation(S);
    const r = k.RANGE[P.range || 'mid'];
    const offerCap = v.fair * P.mood * (1 + r);
    const demand = k.DEMAND0 + k.DEMAND_AUDIT * (P.audit - k.NEED_AUDIT) + k.DEMAND_BOARD * P.board + (P.approach === 'bank' ? k.DEMAND_BANK : 0) + gauss(H) * k.DEMAND_SD;
    const cover = Math.max(0.3, demand * (1 - k.RANGE_K * r));
    const book = cover >= k.COVER_HOT ? 'hot' : cover >= 1 ? 'ok' : 'fail';
    const p0 = (book === 'fail' ? offerCap * (1 - k.FAIL_CUT) : offerCap) / P.shares;
    P.cover = Math.round(cover * 100) / 100; P.book = book;
    P.ipoPrice = p0;
    P.price = book === 'hot' ? p0 * (1 + k.HOT_POP) : p0;
    P.mood = cl(P.mood + (book === 'hot' ? 0.05 : book === 'fail' ? -0.1 : 0), k.MOOD[0], k.MOOD[1]);
    P.raised = Math.round(p0 * P.shares * P.float);
    P.fee = P.approach === 'bank' ? Math.round(P.raised * k.BANK_FEE) : 0;
    P.own = 1 - P.float;
    P.stage = 'public'; P.listDay = S.day;
    S.cash += P.raised - P.fee;
    P.hist.push([S.day, Math.round(P.price * 100) / 100]);
    P.peakCap = Math.max(P.peakCap, cap(P));
    const word = (D().book || {})[book] || book;
    log(S, `Холдинг: акции на бирже. ${word[0].toUpperCase() + word.slice(1)} (спрос ×${String(P.cover).replace('.', ',')}). Продано ${Math.round(P.float * 100)} % компании за ${fm(P.raised)}${P.fee ? `, банку — ${fm(P.fee)}` : ''}. Капитализация ${fm(cap(P))}.`, book === 'fail' ? 'bad' : 'good');
    pushLog(S, H, 'h_list', 'Первый день торгов', `${word}: ${fm(P.raised)} на счёт, капитализация ${fm(cap(P))}`);
    note(S, { phase: 'listed', book, raised: P.raised, cap: cap(P) });
    startScene(S, 'h_ipo5');
  }
  function setGuide(S, g) {
    const P = ipoP(S); if (!P || P.stage === 'done') return { ok: false };
    if (!KI().GUIDE[g]) return { ok: false };
    if (g === 'low' && P.boardWho === 'elvira') return { ok: false, msg: 'Эльвира не подпишет осторожный прогноз' };
    if (P.stage === 'public' && g !== P.guide) P.mood = cl(P.mood + KI().GUIDE_MOOD[g] - KI().GUIDE_MOOD[P.guide], KI().MOOD[0], KI().MOOD[1]);
    P.guide = g;
    return { ok: true };
  }
  function setDiv(S, d) { const P = ipoP(S); if (!P || P.stage !== 'public') return { ok: false }; d = +d; if (KI().DIV.indexOf(d) < 0) return { ok: false }; P.div = d; return { ok: true }; }

  function ipoDay(S, H) {
    const P = H.ipo, k = KI();
    if (P.auditJob && S.day >= P.auditJob.until) {
      P.audit = P.auditJob.lvl; P.auditJob = null;
      log(S, `Холдинг: аудит готов — «${k.AUDIT[P.audit - 1].name}».`, 'good');
      note(S, { phase: 'prep', what: 'audit', lvl: P.audit });
      if (P.audit === 1) startScene(S, 'h_ipo2');
    }
    if (P.boardJob && S.day >= P.boardJob.until) {
      P.board = P.boardJob.lvl; P.boardJob = null;
      log(S, `Холдинг: совет директоров — «${k.BOARD[P.board - 1].name}».`, 'good');
      note(S, { phase: 'prep', what: 'board', lvl: P.board });
    }
    if (P.stage === 'roadshow' && S.day >= P.rsUntil && !(H.pending && H.pending.id === 'h_ipo4')) {
      if (!P.range) P.range = 'mid';
      list(S);
    }
    if (E().dateOf(S.day).d !== 1) return;
    // 1-е число: расходы месяца, цена акций, квартальный отчёт, цель
    let cost = boardMonth(S);
    if (P.stage === 'public') cost += Math.round(k.LIST_MONTH * pl(S));
    if (cost > 0) { spend(S, cost, 'hold'); P.spent += cost; }
    if (P.stage !== 'public' || S.day === P.listDay) return;
    const m = E().dateOf(S.day).m;
    if (m % 3 === 0 && S.day - P.listDay >= 60) quarter(S, H);
    const v = valuation(S);
    const target = v.fair * P.mood / P.shares;
    P.price = Math.max(0.01, P.price + (target - P.price) * k.PRICE_STEP);
    P.price *= 1 + gauss(H) * k.PRICE_SD;
    P.hist.push([S.day, Math.round(P.price * 100) / 100]);
    while (P.hist.length > k.HIST) P.hist.shift();
    P.peakCap = Math.max(P.peakCap, cap(P));
    if (!P.goalDay && cap(P) >= k.GOAL_CAP && P.q.length >= (k.GOAL_Q || 0)) {
      P.goalDay = S.day;
      log(S, `Холдинг: компания стоит на бирже ${fm(cap(P))} — цель пути взята.`, 'good');
      pushLog(S, H, 'h_goal', 'Сто миллиардов', `капитализация ${fm(cap(P))}`);
      note(S, { phase: 'goal', cap: cap(P) });
      startScene(S, 'h_ipo7');
    }
  }
  function quarter(S, H) {
    const P = H.ipo, k = KI(), h = S.history || [];
    if (h.length < 15) return;
    const q = sums(h, -3), was = sums(h, -15, -12);
    const exp = was.rev * (1 + k.GUIDE[P.guide]);
    const score = exp > 0 ? q.rev / exp - 1 : 0;
    const mood0 = P.mood;
    P.mood = 1 + (P.mood - 1) * (1 - k.MOOD_BACK);
    let res;
    if (k.LOSS_MISS && q.prof < 0) res = 'miss';
    else if (score >= 0) res = 'beat';
    else if (score >= -k.TOL) res = 'inline';
    else res = 'miss';
    const missK = (P.boardWho === 'official' ? 0.67 : 1) * (P.trust > 0 ? 0.67 : 1);
    if (res === 'beat') { P.mood += k.BEAT + Math.min(k.BEAT_MAX, score * 0.5); P.beats++; }
    else if (res === 'inline') { P.mood += k.INLINE; P.inline++; }
    else { P.mood -= (k.MISS + Math.min(k.MISS_MAX, Math.abs(Math.min(0, score)))) * missK; P.misses++; }
    if (P.trust > 0) P.trust--;
    let scandal = false;
    if (H.f.audit === 'quiet' && !H.f.scandal && rnd(H) < k.QUIET_P) {
      scandal = true; H.f.scandal = S.day; P.scandals++; P.mood += k.SCANDAL;
      log(S, 'Холдинг: журналисты нашли договоры с поставщиком, переоформленные задним числом. Акции упали.', 'bad');
      pushLog(S, H, 'h_scandal', 'Договоры задним числом', 'история с мукой всплыла — цена акций −20 %');
    }
    P.mood = cl(P.mood, k.MOOD[0], k.MOOD[1]);
    P.price *= P.mood / mood0;                      // рынок реагирует на отчёт сразу
    let div = 0;
    if (P.div > 0 && q.prof > 0) { div = Math.round(q.prof * P.div * (1 - P.own)); spend(S, div, 'hdiv'); P.divPaid += div; }
    const d = E().dateOf(S.day - 1), qn = Math.floor(d.m / 3) + 1;
    P.q.push({ day: S.day, y: d.y, qn, rev: Math.round(q.rev), exp: Math.round(exp), prof: Math.round(q.prof), res, guide: P.guide, div, scandal });
    while (P.q.length > 24) P.q.shift();
    const word = res === 'beat' ? 'обещание выполнено' : res === 'inline' ? 'чуть ниже обещанного' : 'промах';
    log(S, `Холдинг: отчёт за ${qn}-й квартал ${d.y}: выручка ${fm(q.rev)} при ожидании ${fm(exp)} — ${word}.${div ? ` Дивиденды — ${fm(div)}.` : ''}`, res === 'miss' ? 'bad' : 'good');
    note(S, { phase: 'quarter', res, rev: q.rev, exp, qn, y: d.y, scandal });
    if (res === 'miss') startScene(S, 'h_ipo6');
  }

  /* ---------------- путь «За рубеж» ---------------- */
  function abP(S) { const H = state(S); return H && H.path === 'abroad' ? H.abroad : null; }
  function abDef(id) { return (KA().COUNTRIES || []).find((x) => x.id === id) || null; }
  function abOpen(A) { return Object.keys(A.c || {}).filter((id) => A.c[id] && A.c[id].open); }
  function abRev12(A) { return (A.hist || []).slice(-12).reduce((a, x) => a + (x.rev || 0), 0); }
  function abEnter(S, id, mode) {
    const A = abP(S), def = abDef(id), k = KA();
    if (!A || !def) return { ok: false, msg: 'Нет такой страны' };
    const c = A.c[id];
    if (c && c.open) return { ok: false, msg: 'Страна уже открыта' };
    if (A.jobs[id]) return { ok: false, msg: 'Вход уже идёт' };
    mode = mode === 'own' ? 'own' : 'local';
    const cost = Math.round(def.cost * pl(S) * (mode === 'local' ? k.PARTNER_ENTRY : 1));
    if (S.cash < cost) return { ok: false, msg: `Нужно ${fm(cost)} на счёте` };
    spend(S, cost, 'hold'); A.spent += cost;
    const days = Math.round(def.days * (mode === 'local' ? k.PARTNER_DAYS : k.OWN_DAYS));
    A.jobs[id] = { until: S.day + days, mode, cost };
    log(S, `Холдинг: вход в ${def.name} (${def.city}) — ${mode === 'local' ? 'с местным партнёром 51 %' : 'со своим директором'}, ${fm(cost)}. Открытие ${E().fmtDate(S.day + days)}.`, 'info');
    note(S, { phase: 'enter', country: id, name: def.name, days });
    return { ok: true, cost, days };
  }
  function abOpenCountry(S, A, id) {
    const def = abDef(id), k = KA(), job = A.jobs[id], c = A.c[id] || (A.c[id] = countryDefaults(id));
    delete A.jobs[id];
    c.open = true; c.day = S.day; c.mode = job ? job.mode : A.defaultMode; c.stores = k.OPEN_STORES; c.rate = 1; c.lastGrow = S.day;
    A.stage = 'open';
    const n = abOpen(A).length;
    log(S, `Холдинг: открылись в ${def.name} — ${c.city}, сразу ${c.stores} ${c.stores === 1 ? 'точка' : 'точки'}. Всего стран: ${n}.`, 'good');
    pushLog(S, state(S), 'h_ab_open_' + id, 'За рубежом: ' + def.name, `${c.city}, ${c.stores} точки`);
    note(S, { phase: 'country', country: id, name: def.name, stores: c.stores, count: n });
    if (n === 1) startScene(S, 'h_ab2');
    if (n === 2 && !A.gulyaAsked) { A.gulyaAsked = true; startScene(S, 'h_ab5'); }
    return c;
  }
  function abroadDay(S, H) {
    const A = H.abroad, k = KA(); if (!A) return;
    // вход в страну: срок вышел — открываем
    for (const id of Object.keys(A.jobs || {})) if (S.day >= A.jobs[id].until) abOpenCountry(S, A, id);
    const open = abOpen(A);
    // директор страны открывает точки (каждые STORE_GROWTH_DAYS, если хватает денег)
    for (const id of open) {
      const c = A.c[id], def = abDef(id);
      if (!def || c.stores >= def.max) continue;
      if (S.day - (c.lastGrow || c.day || S.day) < k.STORE_GROWTH_DAYS) continue;
      if (S.cash < k.RESERVE * pl(S)) continue;
      c.stores++; c.lastGrow = S.day;
    }
    // проверка в Алматы: 8 точек в Казахстане
    if (A.c.kz && A.c.kz.open && A.c.kz.stores >= k.INSPECT_STORES && !A.inspection) { A.inspection = 'pending'; startScene(S, 'h_ab4'); }
    if (E().dateOf(S.day).d !== 1) return;
    const dt = E().dateOf(S.day);
    // раз в квартал — курс
    if (dt.m % 3 === 0 && A.lastRate !== S.day) {
      A.lastRate = S.day;
      let deval = null;
      for (const id of open) { const c = A.c[id]; c.rate = cl(c.rate * (1 + gauss(H) * k.RATE_SD), 0.4, 1.8); if (!deval && rnd(H) < k.DEVAL_P) deval = id; }
      if (deval) {
        const c = A.c[deval], def = abDef(deval);
        c.rate = cl(c.rate * k.DEVAL, 0.3, 1.8); A.deval++;
        log(S, `Холдинг: ${def.name} — курс упал за ночь. Выручка в рублях теперь ×${c.rate.toFixed(2).replace('.', ',')}.`, 'bad');
        note(S, { phase: 'deval', country: deval, name: def.name, rate: c.rate });
        startScene(S, 'h_ab3');
      }
    }
    // месяц: выручка стран
    let rev = 0, prof = 0;
    for (const id of open) {
      const c = A.c[id], def = abDef(id); if (!def) continue;
      const menuK = A.menu === 'local' ? k.MENU_LOCAL_REV : A.menu === 'own' ? k.MENU_OWN_REV : 1;
      const demK = A.demandUntil > S.day ? A.demandK : 1;
      const r = c.stores * k.REV_STORE * def.rev * pl(S) * c.rate * menuK * (A.gulya ? 1.08 : 1) * demK * A.priceK;
      const cost = r * k.COST * (A.menu === 'local' ? k.MENU_LOCAL_COST : 1) + k.LICENSE * pl(S);
      const p = r - cost, ours = c.mode === 'local' ? p * (1 - k.PARTNER_SHARE) : p;
      c.rev += r; c.prof += p;
      S.cash += ours; A.paidIn += ours;
      rev += r; prof += p;
      if (dt.m === 0 || p < 0) log(S, `Холдинг: ${def.name} — ${c.stores} точек, выручка ${fm(r)} за месяц${p < 0 ? ', убыток ' + fm(-p) : ''}.`, p < 0 ? 'bad' : 'info');
    }
    A.hist.push({ day: S.day, rev: Math.round(rev), prof: Math.round(prof) });
    while (A.hist.length > 36) A.hist.shift();
    // цель: три страны и 10 млрд оборота за 12 месяцев
    const rev12 = abRev12(A);
    if (!A.goalDay && open.length >= k.GOAL_COUNTRIES && rev12 >= k.GOAL_REV) {
      A.goalDay = S.day; A.stage = 'done';
      log(S, `Холдинг: за рубежом ${fm(rev12)} оборота за 12 месяцев, сеть в ${open.length} странах — цель пути взята.`, 'good');
      pushLog(S, H, 'h_ab_goal', 'Хлеб без границ', `оборот за рубежом ${fm(rev12)} за 12 мес.`);
      note(S, { phase: 'goal', abroad: true, rev12, count: open.length });
      startScene(S, 'h_ab6');
    }
  }
  function abInfo(S) {
    const A = abP(S); if (!A) return null;
    const k = KA(), open = abOpen(A);
    const countries = (k.COUNTRIES || []).map((def) => {
      const c = A.c[def.id] || countryDefaults(def.id);
      const job = A.jobs[def.id] || null;
      return {
        id: def.id, name: def.name, city: def.city, max: def.max, open: !!c.open, job,
        stores: c.stores, rate: c.rate, rev: c.rev, prof: c.prof, mode: c.mode,
        entryLocal: Math.round(def.cost * pl(S) * k.PARTNER_ENTRY), entryOwn: Math.round(def.cost * pl(S)),
        daysLocal: Math.round(def.days * k.PARTNER_DAYS), daysOwn: Math.round(def.days * k.OWN_DAYS),
      };
    });
    const last = (A.hist || [])[A.hist.length - 1] || { rev: 0, prof: 0 };
    return { countries, open: open.length, rev12: abRev12(A), monthRev: last.rev, monthProf: last.prof, goal: k.GOAL_REV, goalDay: A.goalDay, spent: A.spent, paidIn: A.paidIn, menu: A.menu, gulya: A.gulya, deval: A.deval, defaultMode: A.defaultMode };
  }

  /* ---------------- путь «Франшиза-империя» ---------------- */
  function frP(S) { const H = state(S); return H && H.path === 'franchise' ? H.franchise : null; }
  function frInfo(S) {
    const F = frP(S); if (!F) return null;
    const k = KF(), plr = pl(S);
    return {
      points: F.points, cities: F.cities, brand: F.brand, standards: F.standards, goal: k.GOAL_POINTS, goalDay: F.goalDay,
      fee: Math.round(k.FEE * plr), royalty: Math.round(k.ROYALTY * plr), monthRoyalty: Math.round(F.points * k.ROYALTY * plr),
      brandK: F.brand, standK: F.standards, spent: F.spent, paidIn: F.paidIn, checks: F.checks, scandals: F.scandals,
      oleg: F.oleg, recipe: F.recipe, hist: F.hist,
      costs: { checks: Math.round(k.CHECKS.cost * plr), ads: Math.round(k.ADS.cost * plr), school: Math.round(k.SCHOOL.cost * plr) },
    };
  }
  function frBuy(S, kind) {
    const F = frP(S), k = KF(); if (!F) return { ok: false, msg: 'Путь не выбран' };
    const c = k[String(kind).toUpperCase()]; if (!c) return { ok: false, msg: 'Нет такого действия' };
    const cost = Math.round(c.cost * pl(S));
    if (S.cash < cost) return { ok: false, msg: `Нужно ${fm(cost)} на счёте` };
    spend(S, cost, 'hold'); F.spent += cost;
    if (kind === 'checks') { F.standards = cl(F.standards + k.CHECKS.stand, 0.3, 1.6); F.checks++; log(S, `Холдинг: проверки франчайзи — стандарты ${F.standards.toFixed(2).replace('.', ',')}.`, 'good'); }
    else if (kind === 'ads') F.brand = cl(F.brand + k.ADS.brand, 0.3, 1.6);
    else if (kind === 'school') F.standards = cl(F.standards + k.SCHOOL.stand, 0.3, 1.6);
    else return { ok: false };
    log(S, `Холдинг: «${kind === 'ads' ? 'реклама бренда' : kind === 'school' ? 'университет для франчайзи' : 'проверки'}» — ${fm(cost)}.`, 'info');
    note(S, { phase: 'fran', what: kind });
    return { ok: true, cost };
  }
  function franchiseDay(S, H) {
    const F = H.franchise, k = KF(); if (!F) return;
    if (E().dateOf(S.day).d !== 1) return;
    const dt = E().dateOf(S.day);
    F.brand = cl(F.brand - k.BRAND_DECAY, 0.3, 1.6);
    F.standards = cl(F.standards - k.STAND_DECAY, 0.3, 1.6);
    const demand = Math.max(0, (k.BASE_GROWTH + F.points / k.POINTS_K) * F.brand * F.standards * (1 + gauss(H) * 0.08));
    const open = Math.min(k.MAX_OPEN, Math.round(demand));
    const fee = open * k.FEE * pl(S), roy = F.points * k.ROYALTY * pl(S);
    F.points += open; F.cities = Math.ceil(F.points / k.CITY_POINTS);
    F.apps = open; F.lastMonth = S.day;
    S.cash += fee + roy; F.paidIn += fee + roy;
    F.hist.push({ day: S.day, points: F.points, open, fee: Math.round(fee), roy: Math.round(roy) });
    while (F.hist.length > 36) F.hist.shift();
    log(S, `Холдинг: франшиза — ${F.points} точек в ${F.cities} городах. За месяц открылось ${open}, взносы ${fm(fee)}, роялти ${fm(roy)}.`, open ? 'good' : 'info');
    if (F.standards < k.SCANDAL_BELOW && rnd(H) < (k.SCANDAL_BELOW - F.standards) * k.SCANDAL_K) {
      const lost = Math.round(F.points * k.SCANDAL_PTS);
      F.points = Math.max(0, F.points - lost); F.cities = Math.ceil(F.points / k.CITY_POINTS);
      F.brand = cl(F.brand - k.SCANDAL_BRAND, 0.3, 1.6); F.scandals++;
      log(S, `Холдинг: скандал с франчайзи — «на муке экономят». Закрылось ${lost} точек, бренд просел.`, 'bad');
      pushLog(S, H, 'h_fr_scandal', 'Скандал с франчайзи', `−${lost} точек, бренд ${F.brand.toFixed(2).replace('.', ',')}`);
      note(S, { phase: 'fran', what: 'scandal', lost });
    }
    if (!H.seen.h_fr2 && F.points >= 60) startScene(S, 'h_fr2');
    if (!H.seen.h_fr3 && F.points >= 250) startScene(S, 'h_fr3');
    if (!H.seen.h_fr4 && F.points >= 380 && !F.oleg) startScene(S, 'h_fr4');
    if (!H.seen.h_fr5 && F.points >= 650) startScene(S, 'h_fr5');
    if (!F.goalDay && F.points >= k.GOAL_POINTS) {
      F.goalDay = S.day; F.stage = 'done';
      log(S, `Холдинг: тысяча точек под брендом — цель пути взята.`, 'good');
      pushLog(S, H, 'h_fr_goal', 'Тысячная вывеска', `${F.points} точек, ${F.cities} городов`);
      note(S, { phase: 'goal', franchise: true, points: F.points, cities: F.cities });
      startScene(S, 'h_fr6');
    }
    if (dt.m === 0) pushLog(S, H, 'h_fr_year', 'Франшиза за год', `${F.points} точек, ${F.cities} городов`);
  }

  /* ---------------- данные для интерфейса ---------------- */
  function info(S) {
    const H = state(S); if (!H) return null;
    const P = H.ipo, A = abP(S), v = valuation(S);
    const out = { path: H.path, ending: H.ending, unlockDay: H.unlockDay, pending: H.pending, fair: v.fair, pe: v.pe, val: v, goal: KI().GOAL_CAP };
    if (A) {
      out.abroad = abInfo(S);
      out.goal = KA().GOAL_REV;
      out.cap = out.abroad.rev12;
    }
    const F = frP(S);
    if (F) { out.franchise = frInfo(S); out.goal = KF().GOAL_POINTS; out.cap = F.points; }
    if (P) {
      out.ipo = P;
      out.cap = P.stage === 'public' || P.stage === 'done' ? cap(P) : v.fair * KI().PRIVATE_K * P.mood;
      out.blocks = listBlocks(S);
      out.auditNext = P.audit < KI().AUDIT.length ? { lvl: P.audit + 1, name: KI().AUDIT[P.audit].name, cost: auditCost(S, P.audit + 1), days: prepDays(S, KI().AUDIT[P.audit].days) } : null;
      out.boardNext = P.board < KI().BOARD.length ? { lvl: P.board + 1, name: KI().BOARD[P.board].name, cost: boardCost(S, P.board + 1), days: prepDays(S, KI().BOARD[P.board].days), month: Math.round(KI().BOARD[P.board].month * pl(S)) } : null;
      out.boardMonth = boardMonth(S);
      out.rsCost = Math.round(KI().ROADSHOW.cost * pl(S));
      out.listMonth = Math.round(KI().LIST_MONTH * pl(S));
      out.nextQ = nextQuarter(S);
    }
    return out;
  }
  function nextQuarter(S) {
    const P = ipoP(S); if (!P || P.stage !== 'public') return null;
    let dd = S.day + 1;
    for (let i = 0; i < 100; i++, dd++) { const t = E().dateOf(dd); if (t.d === 1 && t.m % 3 === 0 && dd - P.listDay >= 60) break; }
    const h = S.history || [];
    const t = E().dateOf(dd - 1), qn = Math.floor(t.m / 3) + 1;
    // база ожидания — тот же квартал год назад (3 месяца, которые закончились за 12 мес. до отчёта)
    const n = h.length, cur = E().dateOf(S.day);
    const monthsIn = ((cur.m % 3) + 3) % 3;          // сколько месяцев квартала уже в истории
    const baseFrom = n - monthsIn - 12, base = baseFrom >= 0 ? sums(h, baseFrom, baseFrom + 3).rev : 0;
    const sofar = monthsIn ? sums(h, n - monthsIn).rev : 0;
    return { day: dd, inDays: dd - S.day, qn, y: t.y, exp: base * (1 + KI().GUIDE[P.guide]), sofar, monthsIn };
  }
  function attItems(S) {
    const H = state(S); if (!H || H.ending) return [];
    const out = [];
    if (H.pending) { const sc = sceneById(H.pending.id); out.push({ lvl: 'warn', ic: 'alert', t: `Холдинг ждёт решения: «${sc ? sc.title : 'сцена'}»`, d: 'Сцена третьего акта. Игра на паузе, пока не решите.', b: { act: 'holdScene', label: 'Решить', primary: true } }); }
    if (!H.path) out.push({ lvl: 'info', ic: 'alert', t: 'Третий акт: выберите путь холдинга', d: 'Биржа, за рубеж или франшиза-империя. Финал истории ждёт вашего выбора.', b: { act: 'holdChoose', label: 'Выбрать', primary: true } });
    const Fr = frP(S);
    if (Fr) {
      const fi = frInfo(S);
      if (fi.standards < 0.8) out.push({ lvl: 'warn', ic: 'alert', t: 'Франшиза: стандарты низкие', d: `Стандарты ${fi.standards.toFixed(2).replace('.', ',')} — риск скандала. Проверки или университет.`, b: { act: 'hold', label: 'Франшиза' } });
      if (!fi.goalDay) out.push({ lvl: 'info', ic: 'store', t: `Франшиза: ${fi.points} из ${fi.goal} точек`, d: `${fi.cities} городов, роялти ${fm(fi.monthRoyalty)} в месяц.`, b: { act: 'hold', label: 'Франшиза' } });
    }
    const A = abP(S);
    if (A) {
      const ai = abInfo(S);
      if (!ai.open && !Object.keys(A.jobs || {}).length) out.push({ lvl: 'info', ic: 'globe', t: 'За рубеж: выберите первую страну', d: `Вход в Казахстан, Узбекистан или Кыргызстан. Цель — ${fm(ai.goal)} оборота за 12 месяцев.`, b: { act: 'hold', label: 'За рубеж' } });
      for (const c of ai.countries) if (c.job) out.push({ lvl: 'info', ic: 'globe', t: `${c.name}: вход идёт`, d: `Открытие ${E().fmtDate(c.job.until)}.`, b: { act: 'hold', label: 'За рубеж' } });
      if (ai.open && !ai.goalDay) out.push({ lvl: 'info', ic: 'globe', t: `За рубежом ${ai.open} из ${KA().GOAL_COUNTRIES} стран`, d: `Оборот за 12 мес. ${fm(ai.rev12)} из ${fm(ai.goal)}.`, b: { act: 'hold', label: 'За рубеж' } });
    }
    const P = ipoP(S);
    if (P && P.stage === 'prep' && !P.auditJob && !P.boardJob && !listBlocks(S).length) out.push({ lvl: 'info', ic: 'rub', t: 'Можно выходить на биржу', d: 'Аудит и совет готовы. Осталось роадшоу — неделя встреч с фондами.', b: { act: 'hold', label: 'Биржа' } });
    if (P && P.stage === 'public') {
      const nq = nextQuarter(S);
      if (nq && nq.inDays <= 20) out.push({ lvl: 'info', ic: 'cal', t: `Отчёт за квартал через ${nq.inDays} дн.`, d: `Рынок ждёт выручку ${fm(nq.exp)} (прогноз «${(D().guide || {})[P.guide]}»).`, b: { act: 'hold', label: 'Биржа' } });
    }
    return out;
  }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__hold) return;
    Eng.__hold = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre && K().ON) { try { day(S); } catch (e) { /* холдинг не должен ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Holding = {
    state, unlocked, day, choose, holdsFinale, startScene, pendingScene, resolve, canChoose, sceneById, sceneView,
    valuation, figures, info, listBlocks, buyAudit, buyBoard, setFloat, startRoadshow, setGuide, setDiv, nextQuarter,
    abInfo, abEnter, abP, frInfo, frBuy, frP,
    attItems, endWith, PATHS, cap,
  };
})();
