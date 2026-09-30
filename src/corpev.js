/* =====================================================================
   КОРПОРАТИВНЫЕ СОБЫТИЯ e201–e218 (docs/russia-design.md §7.4; данные и контракт эффектов — src/data/corp-events.js).
   Выпадают только после выхода в Россию и при 2+ городах, раз в 45–75 дней, своим ГСЧ (S.corp.rng).
   Событие с выбором кладётся в S.ev.pending с полем corp: true — время стоит, окно события общее с событиями города;
   BK.Engine.resolveEvent обёрнут: корпоративные решаются здесь. Последствия (e202 переманивание, e217 выгорание) —
   очередь S.corp.ev.queue (ставит corphq.js по формуле §6.8 и скрытым чертам).
   Состояние: S.corp.ev = { next, last: { id: day }, queue: [{ id, day, dir, city, offerPct, poacher }], seen }
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, I = E._int, C = () => BK.CFG, K = () => BK.CFG.CORP;
  const D = () => BK.Dir, HQ = () => BK.HQ;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = (v) => BK.fmtMoney(v);
  const def = (id) => BK.CITY_BY_ID[id] || {};
  const cname = (id) => def(id).name || id;
  const byId = (id) => (BK.CORP_EVENTS || []).find((e) => e.id === id);
  const pctS = (m) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)} %`;
  BK.CORP_LOCAL_CHAINS = BK.CORP_LOCAL_CHAINS || ['Пекарня у дома', 'Горячий каравай', 'Булочная №1', 'Пышка', 'Хлебница', 'Тёплый хлеб', 'Сдобный двор'];

  function st(S) { const cr = S.corp; if (!cr.ev) cr.ev = { next: null, last: {}, queue: [], seen: 0 }; if (!cr.ev.queue) cr.ev.queue = []; if (!cr.ev.last) cr.ev.last = {}; return cr.ev; }
  const rng = (S, fn) => HQ().corpRng(S, fn);
  function queue(S, item) { const q = st(S).queue; if (q.some((x) => x.id === item.id && x.dir === item.dir)) return false; q.push(item); return true; }
  function queued(S, id, dir) { const cr = S.corp; return !!(cr.ev && cr.ev.queue.some((x) => x.id === id && (dir == null || x.dir === dir))) || !!(S.ev.pending && S.ev.pending.corp && S.ev.pending.id === id && S.ev.pending.ctx && S.ev.pending.ctx.dir === dir); }

  /* ---------------- когда и какое событие ---------------- */
  function ownIds(S) { return Object.keys(S.corp.cities); }
  function runCities(S) { return ownIds(S).filter((id) => S.corp.cities[id].status === 'run' || id === 'ufa'); }
  function dirsOnCity(S) { return (S.corp.directors || []).filter((d) => d.city && S.corp.cities[d.city] && d.leaveDay == null); }
  function newCities(S) { return BK.CITIES.map((d) => d.id).filter((id) => !S.corp.cities[id] && !(def(id).big && HQ().bigLock(S))); }
  function daily(S, t) {
    const cr = S.corp; if (!cr || cr.unlockedDay == null || S.phase !== 'play') return;
    if (ownIds(S).length < 2) return; // до второго города корпоративных событий нет (ГСЧ не трогается)
    const ev = st(S);
    const qi = ev.queue.findIndex((x) => x.day <= S.day);
    if (qi >= 0) { const it = ev.queue.splice(qi, 1)[0]; const e = byId(it.id); if (e) start(S, e, it); return; }
    if (ev.next == null) { ev.next = S.day + rng(S, () => I.ri(S, K().CEV_GAP[0], K().CEV_GAP[1])); return; }
    if (S.day < ev.next) return;
    rng(S, () => {
      ev.next = S.day + Math.round(I.ri(S, K().CEV_GAP[0], K().CEV_GAP[1]) * E.diffK(S, 'evGap'));
      const kind = I.rnd(S) < K().CEV_POS + E.diffK(S, 'posAdd') ? 'pos' : 'neg';
      let pool = BK.CORP_EVENTS.filter((e) => e.kind === kind && eligible(S, e, t));
      if (!pool.length) pool = BK.CORP_EVENTS.filter((e) => eligible(S, e, t));
      if (!pool.length) return;
      let tw = 0; for (const e of pool) tw += e.weight || 1;
      let r = I.rnd(S) * tw, e = pool[0]; for (const x of pool) { r -= x.weight || 1; if (r < 0) { e = x; break; } }
      start(S, e, null);
    });
  }
  function eligible(S, e, t) {
    if (e.followUp || !e.weight) return false;
    const cr = S.corp, ev = st(S), n = e.need || {};
    if (ev.last[e.id] != null && S.day - ev.last[e.id] < (e.cooldown || 365)) return false;
    if ((e.minYear || 0) > (S.day - cr.unlockedDay) / 365) return false;
    if (e.months && e.months.indexOf(t.m) < 0) return false;
    if (ownIds(S).length < (n.cities || 2)) return false;
    if (n.directors && dirsOnCity(S).length < n.directors) return false;
    if (n.rival && (!cr.rivalOn || !runCities(S).some((id) => id !== 'ufa' && !cr.cities[id].rivalIn))) return false;
    if (n.dirTrait && !dirsOnCity(S).some((d) => d.traits.indexOf(n.dirTrait) >= 0 && d.months >= (n.dirMonths || 0))) return false;
    if (n.supply === 'intercity' && !(HQ().lvlOf(S, 'logistics') > 0 && supplied(S).length)) return false;
    if (e.target === 'newCity' && !newCities(S).length) return false;
    if (e.target === 'director' && !dirsOnCity(S).length) return false;
    if (e.target === 'twoDirectors' && dirsOnCity(S).length < 2) return false;
    if (e.id === 'e216' && cr.equitySold >= 0.4) return false;
    if (e.id === 'e213' && cr.creditK) return false;
    return true;
  }
  // межгородние поставки (Р3 — упрощённо): города дальше 150 км от Уфы на трассе М-5 / Урал (ближе 700 км)
  function supplied(S) { return ownIds(S).filter((id) => id !== 'ufa' && BK.roadKm('ufa', id) < 700); }

  /* ---------------- цель и текст ---------------- */
  function districtOf(S, id) {
    const cr = S.corp, c = cr.cities[id]; if (!c) return 'Центр';
    const list = id === cr.active ? S.stores : c.packed ? c.packed.stores : [];
    if (!list.length) return 'Центр';
    const s = list[I.ri(S, 0, list.length - 1)];
    if (id === cr.active) { const d = (BK.DISTRICTS || []).find((x) => x.id === s.district); return d ? d.name : 'Центр'; }
    return D().districtName(c, s.district);
  }
  function target(S, e, forced) {
    const cr = S.corp, ctx = { city: null, city2: null, dir: null, dir2: null };
    if (forced && forced.dir) {
      const d = D().dirById(S, forced.dir); if (!d || !d.city) return null;
      Object.assign(ctx, { dir: d.id, city: d.city, offerPct: forced.offerPct, poacher: forced.poacher });
    } else if (e.target === 'city') {
      let ids = runCities(S); if (e.need && e.need.rival) ids = ids.filter((id) => id !== 'ufa' && !cr.cities[id].rivalIn);
      if (e.need && e.need.cityFeature === 'industry') { const ind = ids.filter((id) => /Промышлен|завод/i.test(def(id).feat || '')); if (ind.length && I.rnd(S) < 0.5) ids = ind; }
      if (!ids.length) return null; ctx.city = I.pick(S, ids);
    } else if (e.target === 'director') {
      let ds = dirsOnCity(S);
      if (e.need && e.need.dirTrait) ds = ds.filter((d) => d.traits.indexOf(e.need.dirTrait) >= 0 && d.months >= (e.need.dirMonths || 0));
      if (!ds.length) return null;
      let d = I.pick(S, ds.filter((x) => x.city !== cr.active).length ? ds.filter((x) => x.city !== cr.active) : ds);
      if (e.hint === 'theft') { // анонимное письмо: с шансом 70 % — правдивое, о городе вора
        const thief = ds.find((x) => HQ().has(x, 'theft') && !x.caught);
        ctx.truth = !!(thief && I.rnd(S) < 0.7); if (ctx.truth) d = thief;
      }
      ctx.dir = d.id; ctx.city = d.city;
    } else if (e.target === 'twoDirectors') {
      const ds = dirsOnCity(S), pairs = [];
      for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (BK.roadKm(ds[i].city, ds[j].city) <= K().REGION_KM) pairs.push([ds[i], ds[j]]);
      const pr = pairs.length ? I.pick(S, pairs) : [ds[0], ds[1]];
      ctx.dir = pr[0].id; ctx.city = pr[0].city; ctx.dir2 = pr[1].id; ctx.city2 = pr[1].city;
    } else if (e.target === 'newCity') { const ids = newCities(S); if (!ids.length) return null; ctx.city = I.pick(S, ids); }
    if (ctx.city) ctx.district = districtOf(S, ctx.city);
    if (e.id === 'e202' && !ctx.offerPct) { ctx.offerPct = I.ri(S, K().POACH_OFFER[0], K().POACH_OFFER[1]); ctx.poacher = `«${C().RIVAL_NAME}»`; }
    if (e.id === 'e208') { ctx.n = I.ri(S, 6, 12); ctx.price = chainPrice(S, ctx.city, ctx.n); }
    if (e.id === 'e216') ctx.price = equityPrice(S, 0.25, 6);
    return ctx;
  }
  function textCtx(S, ctx) {
    const d = ctx.dir && D().dirById(S, ctx.dir), d2 = ctx.dir2 && D().dirById(S, ctx.dir2);
    return { city: ctx.city ? cname(ctx.city) : null, city2: ctx.city2 ? cname(ctx.city2) : null, director: d ? d.name : null, director2: d2 ? d2.name : null, district: ctx.district, poacher: ctx.poacher, offerPct: ctx.offerPct, price: ctx.price != null ? fm(ctx.price) : null, rival: C().RIVAL_NAME };
  }
  const tx = (S, s, ctx) => (BK.corpText ? BK.corpText(s, textCtx(S, ctx)) : s);
  // средняя годовая выручка точки сети × доход города — оценка покупаемой местной сети
  function avgStoreYear(S) { let rev = 0, n = 0; for (const x of S.history.slice(-12)) rev += x.rev; for (const id in S.corp.cities) n += BK.Corp.cityStats(S, id).open; return n ? rev / n : 60e6 * S.macro.priceLevel; }
  function chainPrice(S, id, n) { return Math.round(1.2 * n * avgStoreYear(S) * 0.7 * (def(id).inc || 1) / 1e6) * 1e6; }
  function equityPrice(S, share, val) { return Math.round(share * val * Math.max(0, HQ().profit12(S)) / 1e6) * 1e6; }

  /* ---------------- стоимость и доступность выбора ---------------- */
  function storesOf(S, id) { if (!id) return 0; const s = BK.Corp.cityStats(S, id); return s ? s.open : 0; }
  function costOf(S, c, ctx, ch) {
    if (!c) return 0;
    const pl = S.macro.priceLevel, k = E.diffK(S, 'cost'); let v = 0;
    if (typeof c === 'number') v = c * pl;
    else if (c.perStore) v = c.perStore * pl * Math.max(1, (ch.effects || []).some((f) => f.where === 'all') ? ownIds(S).reduce((a, id) => a + storesOf(S, id), 0) : storesOf(S, ctx.city));
    else if (c.revPct) v = c.revPct * Math.max(S.lastMonthRev, 1e6);
    else if (c.audit) return HQ().auditCost(S, ctx.city);
    else if (c.dirSalary) { const d = D().dirById(S, ctx.dir); v = d ? d.salary * c.dirSalary : 0; return Math.round(v); }
    else if (c.deal) { const f = (ch.effects || []).find((x) => x.t === 'buyChain'); return f ? ctx.price : 0; }
    return Math.round(v * k);
  }
  function lockOf(S, ch, ctx) {
    const n = ch.need; if (n) {
      if (n.hqAny && !n.hqAny.some((key) => HQ().lvlOf(S, key) > 0)) return 'Нужен отдел: ' + n.hqAny.map((key) => (BK.CORP_HQ[key] || {}).name).join(' или ');
      if (n.dirGrade) { const d = D().dirById(S, ctx.dir); if (!d || d.grade < n.dirGrade) return `Нужен грейд ${n.dirGrade}+`; }
    }
    const se = (ch.effects || []).find((f) => f.t === 'sellEquity');
    if (se && S.corp.equitySold + se.share > 0.49) return 'Больше 49 % продать нельзя';
    if (se && !(HQ().profit12(S) > 0)) return 'Сеть без прибыли — фонд не купит';
    return null;
  }
  function start(S, e, forced) {
    const cr = S.corp, ev = st(S);
    const ctx = rng(S, () => target(S, e, forced)); if (!ctx) return;
    ev.last[e.id] = S.day; ev.seen = (ev.seen || 0) + 1;
    const inst = { id: e.id, corp: true, kind: e.kind, title: tx(S, e.title, ctx), text: tx(S, e.text, ctx), tg: { scope: 'global', target: null }, day: S.day, ctx, effectsText: [] };
    inst.effectsText = rng(S, () => apply(S, e.effects || [], ctx));
    if (e.choices && e.choices.length) {
      inst.choices = e.choices.map((c) => {
        let desc = tx(S, c.desc || '', ctx);
        const se = (c.effects || []).find((f) => f.t === 'sellEquity'); if (se) desc += ` Получим ${fm(equityPrice(S, se.share, se.valuation))}.`;
        return { label: tx(S, c.label, ctx), desc, cost: costOf(S, c.cost, ctx, c), dis: lockOf(S, c, ctx) };
      });
      S.ev.pending = inst;
    } else {
      I.log(S, `Корпорация: ${inst.title}. ${inst.text}${inst.effectsText.length ? ' ' + inst.effectsText.join('; ') + '.' : ''}`, e.kind === 'pos' ? 'good' : 'bad');
      S.notify.push({ type: 'event', ev: inst });
      D().pushInbox(S, { kind: 'note', tone: e.kind === 'pos' ? 'good' : 'bad', dir: null, dname: '', city: ctx.city, title: inst.title, text: inst.text + (inst.effectsText.length ? ' ' + inst.effectsText.join('; ') + '.' : '') });
    }
    void cr;
  }
  function resolve(S, idx) {
    const inst = S.ev.pending; if (!inst || !inst.corp) return;
    const e = byId(inst.id); S.ev.pending = null;
    if (!e || !e.choices) return;
    let i = idx | 0; if (!inst.choices[i] || inst.choices[i].dis) i = inst.choices.findIndex((c) => !c.dis); if (i < 0) i = 0;
    const ch = e.choices[i], cost = inst.choices[i].cost || 0;
    if (cost > 0) I.spend(S, cost, 'other');
    const txt = rng(S, () => apply(S, ch.effects || [], inst.ctx));
    I.log(S, `${inst.title}: выбрано «${inst.choices[i].label}»${cost ? ` (−${fm(cost)})` : ''}.${txt.length ? ' ' + txt.join('; ') + '.' : ''}`, inst.kind === 'pos' ? 'good' : 'warn');
    if (S.chron) S.chron.push({ day: S.day, t: 'choice', id: inst.id, title: inst.title, label: inst.choices[i].label, cost: Math.round(cost), kind: inst.kind, corp: true });
    return { idx: i, txt };
  }
  const origResolve = E.resolveEvent;
  E.resolveEvent = function (S, idx) { if (S && S.ev && S.ev.pending && S.ev.pending.corp) return resolve(S, idx); return origResolve.call(this, S, idx); };

  /* ---------------- эффекты (контракт — шапка corp-events.js) ---------------- */
  function whereIds(S, f, ctx) {
    const w = f.where || (ctx.city ? 'city' : 'all');
    if (w === 'city') return ctx.city ? [ctx.city] : [];
    if (w === 'city2') return ctx.city2 ? [ctx.city2] : [];
    if (w === 'all') return ownIds(S);
    if (w === 'others') return ownIds(S).filter((id) => id !== ctx.city);
    if (w === 'supplied') return supplied(S);
    return [];
  }
  function scaled(S, f) { // hqK: отдел открыт — сила эффекта × k
    if (!f.hqK) return f;
    let k = 1; for (const key in f.hqK) if (HQ().lvlOf(S, key)) k *= f.hqK[key];
    if (k === 1) return f;
    const g = Object.assign({}, f);
    if (g.m != null) g.m = 1 + (g.m - 1) * k;
    for (const key of ['add', 'v', 'revPct', 'days']) if (g[key] != null) g[key] = g[key] * k;
    return g;
  }
  const anyHq = (S, x) => [].concat(x).some((key) => HQ().lvlOf(S, key) > 0);
  function dirsWho(S, f, ctx) {
    const who = f.who || 'target', out = [];
    if (who === 'all') return dirsOnCity(S);
    if (who === 'target' || who === 'both') { const d = D().dirById(S, ctx.dir); if (d) out.push(d); }
    if (who === 'second' || who === 'both') { const d = D().dirById(S, ctx.dir2); if (d) out.push(d); }
    if (!out.length && who === 'target' && ctx.city) { const d = D().dirOf(S, S.corp.cities[ctx.city]); if (d) out.push(d); }
    return out;
  }
  function apply(S, effects, ctx) {
    effects = I.diffEffects ? I.diffEffects(S, effects) : effects;
    const out = [], cr = S.corp, pl = S.macro.priceLevel;
    for (const f0 of effects) {
      if (f0.ifHq && !anyHq(S, f0.ifHq)) continue;
      if (f0.unlessHq && anyHq(S, f0.unlessHq)) continue;
      const f = scaled(S, f0), ids = whereIds(S, f, ctx), names = ids.map(cname).join(', ') || 'сеть';
      const all = (f.where || (ctx.city ? 'city' : 'all')) === 'all';
      switch (f.t) {
        case 'traffic': case 'check': case 'conv': case 'competitor': case 'foodcost': {
          const until = S.day + (f.d || 30);
          if (all) S.mods.push({ t: f.t, m: f.m, until, scope: 'global', target: null });
          else for (const id of ids) S.mods.push({ t: f.t, m: f.m, until, scope: 'city', target: id });
          out.push(`${{ traffic: 'гостей', check: 'средний чек', conv: 'конверсия', competitor: 'гостей', foodcost: 'фудкост' }[f.t]} ${pctS(f.m)} на ${f.d} дн. (${all ? 'все города' : names})`); break;
        }
        case 'close': {
          for (const id of ids) {
            const c = cr.cities[id];
            if (id === cr.active) { const open = S.stores.filter((s) => s.status === 'open'); const pick = f.n ? shuffle(S, open).slice(0, f.n) : open; for (const s of pick) s.closedUntil = Math.max(s.closedUntil || 0, S.day + f.d); }
            else if (c && c.packed) { const open = c.packed.stores.filter((s) => s.status !== 'opening'); const pick = f.n ? shuffle(S, open).slice(0, f.n) : open; for (const s of pick) s.lostDays = (s.lostDays || 0) + f.d; }
          }
          out.push(`${f.n ? f.n + ' ' + (f.n === 1 ? 'точка закрыта' : 'точки закрыты') : 'точки закрыты'} на ${f.d} дн. (${names})`); break;
        }
        case 'lostSales': {
          const days = Math.max(1, Math.round(f.days * (f.skip === 'frozen' && HQ().lvlOf(S, 'logistics') >= 2 ? 0.5 : 1)));
          for (const id of ids) {
            const c = cr.cities[id];
            if (id === cr.active) for (const s of S.stores) { if (s.status === 'open') s.closedUntil = Math.max(s.closedUntil || 0, S.day + days); }
            else if (c && c.packed) for (const s of c.packed.stores) if (s.status !== 'opening') s.lostDays = (s.lostDays || 0) + days;
          }
          out.push(`потеря ≈ ${days} ${days === 1 ? 'дня' : 'дней'} продаж (${all ? 'все города' : names})`); break;
        }
        case 'offer': {
          for (const id of ids) {
            if (id === cr.active) { for (let i = 0; i < (f.n || 1); i++) { const o = I.makeStoreOffer(S, { lm: f.lm }); if (f.rent) o.rentM2 = Math.round(o.rentM2 * f.rent / 10) * 10; o.expires = S.day + (f.days || 60); o.special = true; S.offers.push(o); } }
            else if (cr.cities[id]) cr.cities[id].spOffer = { n: f.n || 1, rent: f.rent || 1, until: S.day + (f.days || 60) };
          }
          out.push(`особые помещения: ${f.n || 1} (${names}), аренда ${pctS(f.rent || 1)}`); break;
        }
        case 'cash': {
          let v = 0; if (f.v != null) v = f.v * pl; else if (f.revPct != null) v = f.revPct * Math.max(S.lastMonthRev, 1e6); else if (f.perStore != null) v = f.perStore * pl * Math.max(1, storesOf(S, ctx.city));
          v = Math.round(v); if (v < 0) I.spend(S, -v, 'other'); else { S.cash += v; S.month.income += v; }
          out.push(`${v >= 0 ? '+' : '−'}${fm(Math.abs(v))}`); break;
        }
        case 'loyalty': S.loyaltyMod = clamp(S.loyaltyMod + f.add, -30, 30); out.push(`настроение команды ${f.add > 0 ? '+' : '−'}${Math.abs(f.add)}`); break;
        case 'schedule': {
          if (f.p != null && I.rnd(S) >= f.p) break;
          const a = f.after || [90, 180]; queue(S, { id: f.id, day: S.day + I.ri(S, a[0], a[1]), dir: ctx.dir, city: ctx.city });
          break;
        }
        case 'rivalEnter': { for (const id of ids) HQ().rivalEnter(S, id, true); out.push(`«${C().RIVAL_NAME}» ${ids.map((id) => def(id).in || id).join(', ')}`); break; }
        case 'pressure': {
          for (const id of ids.length ? ids : ctx.city ? [ctx.city] : []) {
            const c = cr.cities[id];
            if (c) { if (id === 'ufa') continue; c.rp = clamp((c.rp || 0) + f.add, 0, K().RIVAL_PRESS_CAP); c.pressure = HQ().pressOf(c); if (!c.rivalIn && cr.rivalOn) c.rivalIn = S.day; }
            else cr.prePressure[id] = clamp((cr.prePressure[id] || 0) + f.add, 0, K().PRESS_MAX);
          }
          out.push(`давление соперника ${f.add > 0 ? '+' : '−'}${String(Math.abs(f.add)).replace('.', ',')} (${names})`); break;
        }
        case 'awareness': {
          for (const id of ids) if (id !== 'ufa' && cr.cities[id]) cr.cities[id].aw = clamp(cr.cities[id].aw + f.add, 0, 1);
          out.push(`узнаваемость ${f.add > 0 ? '+' : '−'}${Math.round(Math.abs(f.add) * 100)} % (${all ? 'все города' : names})`); break;
        }
        case 'entryPerk': {
          for (const id of ids) cr.perks[id] = { until: S.day + (f.d || 180), prodRent: f.prodRent || 1, regFree: !!f.regFree };
          out.push(`приглашение: вход ${ids.map((id) => def(id).in).join(', ')} до ${E.fmtDate(S.day + (f.d || 180))} — регистрация бесплатно, цех ${pctS(f.prodRent || 1)}`); break;
        }
        case 'buyChain': out.push(buyChain(S, ctx, f)); break;
        case 'dirLoyalty': { for (const d of dirsWho(S, f, ctx)) d.loyalty = clamp(d.loyalty + f.add, 0, 100); out.push(`лояльность ${dirsWho(S, f, ctx).map((d) => d.name).join(' и ') || 'директора'} ${f.add > 0 ? '+' : '−'}${Math.abs(f.add)}`); break; }
        case 'dirSalary': {
          for (const d of dirsWho(S, f, ctx)) { const m = f.toOffer ? 1 + (ctx.offerPct || 30) / 100 : f.m; d.salary = Math.round(d.salary * m / 1000) * 1000; out.push(`оклад ${d.name} → ${fm(d.salary)}/мес`); }
          break;
        }
        case 'dirOptions': {
          for (const d of dirsWho(S, f, ctx)) {
            if (f.cityShare) { HQ().setCityShare(S, d.id, ((d.opt && d.opt.city) || 0) + f.cityShare); out.push(`${d.name}: доля ${Math.round(f.cityShare * 1000) / 10} % прибыли города`); }
            if (f.corp) { const value = Math.round(f.corp * K().OPT_YEARS * Math.max(0, HQ().profit12(S))); const o = d.opt || {}; d.opt = Object.assign(o, { corp: (HQ().unvested(d) > 0 ? o.corp : 0) + f.corp, value: (HQ().unvested(d) > 0 ? o.value : 0) + value, grant: HQ().unvested(d) > 0 ? o.grant : S.day, vested: HQ().unvested(d) > 0 ? o.vested : 0 }); out.push(`${d.name}: опцион ${String(f.corp * 100).replace('.', ',')} % (≈ ${fm(value)})`); }
          }
          break;
        }
        case 'dirPromote': { for (const d of dirsWho(S, f, ctx)) { const r = HQ().promote(S, d.id); out.push(r.ok ? `${d.name} — региональный директор` : `повышение: ${r.msg}`); } break; }
        case 'dirLeave': {
          for (const d of dirsWho(S, f, ctx)) { d.leaveDay = S.day + (f.notice || 30); d.takeStaff = f.takeStaff; d.takeP = f.p; d.leaveMood = f.mood; d.leaveWho = ctx.poacher ? `в ${ctx.poacher}` : 'к конкуренту'; d.leaveTo = 'poach'; out.push(`${d.name} уходит через ${f.notice || 30} дн. — город без директора`); }
          break;
        }
        case 'dirAbsent': { for (const d of dirsWho(S, f, ctx)) { d.absentUntil = S.day + f.d; out.push(`${d.name} в отпуске ${f.d} дн.`); } break; }
        case 'dirFire': { for (const d of dirsWho(S, f, ctx)) { D().fire(S, d.id, f.severance || 0); out.push(`${d.name} уволен${d.f ? 'а' : ''}`); } break; }
        case 'dirSkill': {
          for (const d of dirsWho(S, f, ctx)) { for (const s of f.skill === 'all' ? D().SK : [f.skill]) d.skills[s] = clamp(d.skills[s] + f.add, 0, K().DIR_CAP[d.grade]); out.push(`навыки ${d.name} ${f.add > 0 ? '+' : '−'}${Math.abs(f.add)}`); }
          break;
        }
        case 'dirTrait': {
          for (const d of dirsWho(S, f, ctx)) {
            if (f.remove) { d.traits = d.traits.filter((x) => x !== f.remove); d.hidden = d.hidden.filter((x) => x !== f.remove); d.known = (d.known || []).filter((x) => x !== f.remove); }
            if (f.add) { const hid = (BK.DIRECTOR_TRAITS[f.add] || {}).hidden; const arr = hid ? d.hidden : d.traits; if (arr.indexOf(f.add) < 0) arr.push(f.add); }
          }
          break;
        }
        case 'audit': { const r = HQ().audit(S, ctx.city, { free: true, falsePenalty: f.falsePenalty }); out.push(r.ok ? (r.found.length ? 'аудит нашёл нарушения' : 'аудит: нарушений нет') : r.msg || 'аудит не проведён'); break; }
        case 'reveal': {
          const d = ctx.city && D().dirOf(S, cr.cities[ctx.city]);
          const hit = d && HQ().has(d, f.trait) && !HQ().knows(d, f.trait) && I.rnd(S) < f.p;
          if (hit) HQ().reveal(S, d, f.trait, 'security');
          out.push(hit ? 'служба безопасности нашла нарушения' : 'служба безопасности ничего не нашла'); break;
        }
        case 'chance': {
          let p = f.p;
          if (p === 'loyalty') { const d = D().dirById(S, ctx.dir); p = d ? d.loyalty / 100 : 0.5; }
          else if (p === 'rating') { let r = 0, n = 0; for (const id of ownIds(S)) { const s = BK.Corp.cityStats(S, id); if (s.rating) { r += s.rating * s.open; n += s.open; } } p = clamp(((n ? r / n : 4) - 3.5) / 1.5, 0.1, 0.9); }
          const yes = I.rnd(S) < p;
          out.push(yes ? 'удалось' : 'не удалось'); out.push(...apply(S, (yes ? f.yes : f.no) || [], ctx)); break;
        }
        case 'creditLimit': { cr.creditK = (cr.creditK || 1) * f.m; if (f.covenant) cr.cov = { margin: f.covenant.margin, rateAdd: f.covenant.rateAdd, until: 0 }; out.push(`кредитный лимит ${pctS(f.m)}`); break; }
        case 'sellEquity': {
          const v = equityPrice(S, f.share, f.valuation); S.cash += v; S.month.income += v; cr.equitySold = +(cr.equitySold + f.share).toFixed(3);
          out.push(`+${fm(v)} от фонда за ${Math.round(f.share * 100)} %`); break;
        }
        default: break;
      }
    }
    return out;
  }
  function shuffle(S, a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = I.ri(S, 0, i); const t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function buyChain(S, ctx, f) {
    const cr = S.corp, id = ctx.city; if (!id || cr.cities[id]) return 'сделка не состоялась';
    const seed = I.ri(S, 1, 2e9);
    cr.cities[id] = { id, name: cname(id), enteredDay: S.day, status: 'run', bought: true, seed, mapGen: 1, rng: (seed ^ 0x51ed27) | 0, aw: BK.Corp.awStart(S, id) - K().AW_MKT + 0.1,
      payK: S.pay.seller / S.market.seller, payKb: S.pay.baker / S.market.baker, numSeq: 0, packed: null, aggFrom: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
    HQ().onEnter(S, id);
    const list = D().buyStores(S, id, ctx.n || 8, f.mood || 0);
    const c = cr.cities[id];
    if (f.rebrand) { for (const s of list) s.rating = Math.max(1, (s.rating || 4) + f.rebrand.rating); I.spend(S, f.rebrand.perStore * S.macro.priceLevel * list.length, 'capex'); }
    if (f.keepSign) c.keepSignUntil = S.day + 365;
    I.log(S, `Куплена местная сеть ${def(id).in}: ${list.length} точек и цех. Город без директора — назначьте.`, 'good');
    return `${def(id).in}: ${list.length} точек и цех — город наш, нужен директор`;
  }

  /* ---------------- выбор для ботов (sim/corpbot.js) ---------------- */
  const GOOD = { e201: 1, e202: -1, e203: 2, e204: 0, e205: 0, e206: 0, e209: 0, e210: 0, e211: -1, e212: 3, e215: 0, e217: 0, e218: 1, e208: -1, e213: 0, e214: 0, e216: 2 };
  function botChoice(S, inst, level) {
    const ch = inst.choices || [], ok = (i) => ch[i] && !ch[i].dis && (!ch[i].cost || ch[i].cost <= S.cash + S.reserve);
    const valid = ch.map((c, i) => i).filter(ok);
    if (!valid.length) return 0;
    if (level === 'bad') { const f = valid.find((i) => !ch[i].cost); return f != null ? f : valid[0]; }
    if (level === 'avg') return rng(S, () => I.pick(S, valid));
    let i = GOOD[inst.id];
    if (inst.id === 'e202') { const d = D().dirById(S, inst.ctx.dir); i = d && d.grade >= 3 ? (HQ().unvested(d) > 0 ? 0 : 1) : d && d.loyalty >= 70 ? 2 : 0; }
    if (inst.id === 'e211') i = ok(1) ? 1 : 0;
    if (inst.id === 'e208') i = S.cash > (ch[0].cost || 0) * 2.5 ? 0 : 2;
    if (inst.id === 'e204' && HQ().lvlOf(S, 'legal')) i = 1;
    if (inst.id === 'e215') i = ok(0) ? 0 : 1;
    return ok(i) ? i : valid[0];
  }

  BK.CorpEv = { daily, queue, queued, start, resolve, apply, botChoice, eligible, supplied, byId };
})();
