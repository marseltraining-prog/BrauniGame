/* =====================================================================
   ЛИЧНЫЕ ТРЕНЕРЫ ИГРОКА (идея владельца 30.09.2026, ROADMAP «Личные тренеры игрока»).
   Игрок нанимает тренера для себя (с 1 точки): обучение идёт со временем (шкала прогресса), платно — разово при найме
   и 1-го числа, пока идёт учёба. Итог — навык игрока в области с уровнем 1–3. Навык ничего не меняет в экономике:
   он только ПОДСВЕЧИВАЕТ проблемы (в «Сводке» / «Требует внимания», на карте, в карточке точки).
     уровень 1 — общий сигнал: «у одной точки проблемы со средним чеком»;
     уровень 2 — какая точка / город и почему;
     уровень 3 — причина с цифрами, что сделать и кнопка-переход; замечает проблему раньше (SENS_TOP).
   Области: sales — продажи и средний чек, staff — персонал, prod — цех и списания, fin — финансы,
            corp — директора и города (второй акт, тренеры за десятки миллионов).
   Состояние: S.player = { skills: {area: 0..3}, study: [{area, tier, from, days, done, month, fee}], spent, log[] }
   (старые сохранения — без поля: ensure() ставит пустое; боты тренеров не нанимают — первый акт у них побайтно прежний).
   Анализ — чистые функции без DOM (как BK.TutAdvice): analyze(S) — все найденные проблемы, hints(S) — то, что видит игрок
   при своих навыках. Их же использует sim/trainers.js (проверка, что подсказки находят реальные слабые места).
   Числа — BK.CFG.TRAINERS в config.js. Интерфейс — src/ui/trainers-ui.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, T = () => BK.CFG.TRAINERS;
  const AREAS = ['sales', 'staff', 'prod', 'fin', 'corp'];
  const AREA = {
    sales: { name: 'Продажи и средний чек', short: 'Продажи', desc: 'средний чек, очереди, рейтинг на картах, маркетинг' },
    staff: { name: 'Персонал', short: 'Персонал', desc: 'настроение, кто на грани увольнения, нехватка людей и усталость' },
    prod: { name: 'Цех и списания', short: 'Цех', desc: 'сколько печь, списания, мощность цеха, цены ниже себестоимости, доставка' },
    fin: { name: 'Финансы', short: 'Финансы', desc: 'аренда против выручки, точки в минусе, запас денег, кредит против резерва' },
    corp: { name: 'Директора и города', short: 'Директора', desc: 'города без директора, слабые навыки, кто может уйти, утечка денег, кто ждёт ответа', corp: true },
  };
  const LEVELS = ['', 'общий сигнал', 'где и почему', 'цифры и что сделать'];
  const fm = (v) => BK.fmtMoney(v);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const pc = (v, d) => { const a = Math.abs(v * 100); return (v < 0 ? '−' : '') + (a >= 10 || d === 0 ? Math.round(a) : a.toFixed(1)).toString().replace('.', ',') + '%'; };
  const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const where = (st) => `№${st.num} · ${st.address}`;

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S.player || typeof S.player !== 'object') S.player = {};
    const P = S.player;
    if (!P.skills || typeof P.skills !== 'object') P.skills = {};
    if (!Array.isArray(P.study)) P.study = [];
    if (!Array.isArray(P.log)) P.log = [];
    if (P.spent == null) P.spent = 0;
    return P;
  }
  const skill = (S, a) => (S && S.player && S.player.skills && S.player.skills[a]) | 0;
  const corpOn = (S) => !!(S && S.corp && S.corp.unlockedDay != null && BK.Dir);
  const areaOpen = (S, a) => !AREA[a].corp || corpOn(S);
  const tiers = (a) => (AREA[a] && AREA[a].corp ? T().CORP_TIERS : T().TIERS);
  const round4 = (v) => Math.round(v / 1e4) * 1e4;
  function price(S, a, tier) {
    const t = tiers(a)[tier - 1]; if (!t) return null;
    const pl = S.macro.priceLevel;
    return { name: t.name, who: t.who, fee: round4(t.fee * pl), month: round4(t.month * pl), days: t.days };
  }
  const studying = (S, a) => (S.player && S.player.study ? S.player.study.find((x) => x.area === a) : null) || null;
  function slotsFree(S) { return T().MAX_PARALLEL - ((S.player && S.player.study) || []).length; }
  // почему нельзя нанять (null — можно)
  function whyNot(S, a, tier) {
    if (!AREA[a]) return 'Нет такой области';
    if (!areaOpen(S, a)) return 'Откроется во втором акте — после выхода в Россию';
    if (S.phase !== 'play') return 'Сначала откройте первую точку';
    const p = price(S, a, tier); if (!p) return 'Нет такого тренера';
    if (skill(S, a) >= tier) return 'Этот уровень уже освоен';
    if (studying(S, a)) return 'Уже учитесь в этой области';
    if (slotsFree(S) <= 0) return `Одновременно — не больше ${T().MAX_PARALLEL} программ`;
    if (S.cash < p.fee) return 'Не хватает денег на счёте';
    return null;
  }
  function hire(S, a, tier) {
    tier = tier | 0;
    const why = whyNot(S, a, tier); if (why) return { ok: false, msg: why };
    const P = ensure(S), p = price(S, a, tier), I = E()._int;
    I.spend(S, p.fee, 'other');
    P.spent += p.fee;
    P.study.push({ area: a, tier, from: S.day, days: p.days, done: 0, month: p.month, fee: p.fee });
    I.log(S, `Личный тренер: «${p.name}» (${AREA[a].name.toLowerCase()}), ${p.days} дн. Оплачено ${fm(p.fee)}, дальше ${fm(p.month)} 1-го числа, пока идёт обучение.`, 'info');
    return { ok: true, price: p };
  }
  function cancel(S, a) {
    const P = ensure(S), i = P.study.findIndex((x) => x.area === a);
    if (i < 0) return { ok: false, msg: 'Обучения нет' };
    const x = P.study.splice(i, 1)[0];
    E()._int.log(S, `Обучение прервано: ${AREA[a].name.toLowerCase()}. Оплаченное не возвращается.`, 'warn');
    return { ok: true, study: x };
  }
  // сколько уйдёт тренерам 1-го числа (для прогноза «К 1-му числу не хватит»)
  function monthFee(S) { let s = 0; for (const x of (S && S.player && S.player.study) || []) s += x.month; return s; }
  // оплата 1-го числа — ДО дневного шага движка (обёртка tick): платёж попадает в закрываемый месяц, в его отчёт,
  // снимок «Итоги» и проверку кассового разрыва (раньше списывался уже после них — отчёт и счёт расходились)
  function payDay(S) {
    const P = S.player; if (!P || !P.study || !P.study.length) return;
    if (E().dateOf(S.day + 1).d !== 1) return;
    const I = E()._int;
    for (const x of P.study) { I.spend(S, x.month, 'other'); P.spent += x.month; }
  }
  // день: прогресс обучения
  function daily(S) {
    const P = S.player; if (!P || !P.study || !P.study.length) return;
    const I = E()._int;
    for (const x of P.study.slice()) {
      x.done++;
      if (x.done < x.days) continue;
      P.study.splice(P.study.indexOf(x), 1);
      P.skills[x.area] = Math.max(skill(S, x.area), x.tier);
      P.log.push({ day: S.day, area: x.area, lvl: x.tier });
      if (P.log.length > 30) P.log.shift();
      const L = x.tier;
      I.log(S, `Обучение завершено: навык «${AREA[x.area].name}» — уровень ${L} (${LEVELS[L]}).`, 'good');
      I.toast(S, `Новый навык: ${AREA[x.area].short} ${L}`, L === 1 ? 'Теперь вы замечаете общие сигналы — смотрите «Требует внимания».' : L === 2 ? 'Подсказки называют точку и причину; на карте — значок лампочки.' : 'Подсказки с цифрами и что сделать — с кнопкой перехода.', 'good');
    }
  }

  /* ---------------- анализ (без DOM, без случайностей, состояние не меняет) ----------------
     Каждая проблема: { area, kind, key, sev (≥1 — по порогу), impact (₽/мес, для сортировки), storeId|cityId|dirId,
       where (точка / город), cause (коротко — уровень 2), detail (цифры — уровень 3), todo (что сделать — уровень 3),
       go ({act, arg, label} — кнопка на уровне 3), dup (дублирует обычное «Требует внимания» — туда не выводится) } */
  const openStores = (S) => S.stores.filter((st) => st.status !== 'opening' && st.last && st.last.rev > 0);
  function storeCheck(st) { return st.last.checks > 0 ? st.last.rev / st.last.checks : 0; }
  function avgOf(st, f) { let s = 0; for (const e of st.staff) s += f(e); return st.staff.length ? s / st.staff.length : 0; }

  function detSales(S, out) {
    const cfg = C(), K = T(), pl = S.macro.priceLevel;
    const ms = (S.cache && S.cache.ms) || E().menuStats(S);
    const B = ms.avgPrice * cfg.ITEMS_PER_CHECK;
    let mktNeed = 0;
    const OS = openStores(S);
    let nl = 0, nn = 0; for (const st of OS) for (const e of st.staff) { nl += e.lvl; nn++; }
    const netLvl = nn ? nl / nn : 1, netRep = OS.length ? OS.reduce((a, st) => a + st.repair, 0) / OS.length : 0;
    for (const st of OS) {
      const L = st.last, chk = storeCheck(st), Sv = st.solv * pl, lvl = avgOf(st, (e) => e.lvl) || 1;
      const age = S.day - (st.openedDay != null ? st.openedDay : 0);
      // средний чек: что дали бы обучение продавцов до 3-го уровня, ремонт, цены по кошельку района
      const causes = [];
      if (lvl < 3 && age >= 45 && (OS.length < 3 || lvl < netLvl - 0.25)) { const dl = 3 - lvl, g = (1 + cfg.LVL_CHECK * dl) * (1 + cfg.LVL_CONV * dl) - 1; causes.push({ c: 'train', g, cause: 'продавцы не допродают — мало обучены', detail: `средний уровень продавцов ${r1(lvl)} из 5`, detail2: OS.length >= 3 ? ` (по сети ${r1(netLvl)})` : '', todo: `обучите команду до 3-го уровня: чек +${pc(cfg.LVL_CHECK * dl)}, покупок +${pc(cfg.LVL_CONV * dl)}`, go: { act: 'openStore', arg: st.id, label: 'Обучить' } }); }
      if (st.repair < 3 && age >= 150 && (OS.length < 3 ? st.repair === 0 : st.repair < netRep - 0.5)) { const R = cfg.REPAIRS[st.repair + 1], R0 = st.repair ? cfg.REPAIRS[st.repair] : { conv: 1, check: 1 }; const g = (R.check / R0.check) * (R.conv / R0.conv) - 1; causes.push({ c: 'repair', g: g * 0.6, cause: st.repair ? 'интерьер отстал от района' : 'точка без ремонта — гости берут меньше', detail: `ремонт ${st.repair}/3`, todo: `${R.name.toLowerCase()} ремонт: чек +${pc(R.check / R0.check - 1)}, гостей +${pc(R.conv / R0.conv - 1)} (закрытие ${R.days} дн.)`, go: { act: 'openStore', arg: st.id, label: 'К ремонту' } }); }
      if (B > Sv * 1.03) { const g = Math.min(0.25, 1 / Math.pow(Sv / B, 2) - 1) * 0.5; causes.push({ c: 'price', g, cause: 'меню дороже, чем готовы платить в районе', detail: `корзина по меню ≈ ${Math.round(B)} ₽ — дороже кошелька`, todo: 'снизьте цены на самые дорогие позиции или уберите их из меню — гости уходят без покупки', go: { act: 'tab', arg: 'menu', label: 'Меню' } }); }
      if (causes.length) {
        causes.sort((a, b) => b.g - a.g);
        const top = causes[0], sev = top.g / K.CHECK_GAIN;
        out.push({ area: 'sales', kind: 'check', key: 'check:' + st.id, sev, impact: L.rev * top.g, storeId: st.id, where: where(st), cause: (top.c === 'price' ? 'гости уходят без покупки: ' : 'низкий средний чек: ') + top.cause,
          detail: `чек ${Math.round(chk)} ₽ при кошельке района ${Math.round(Sv)} ₽ · ${top.detail}${top.detail2 || ''}`, todo: `${top.todo} — ≈ +${fm(L.rev * top.g)}/мес`, go: top.go });
      }
      // очереди: гостей больше, чем успевает команда
      if (L.lost > 0) {
        const sh = L.lost / (L.rev + L.lost);
        const sz = cfg.SIZES[st.size], short = st.staff.length + st.incoming.length < st.staffTarget, room = st.staffTarget < sz.staffMax;
        out.push({ area: 'sales', kind: 'queue', key: 'queue:' + st.id, sev: sh / K.QUEUE_SHARE, impact: L.lost, storeId: st.id, where: where(st), cause: 'очереди: гости уходят, не дождавшись',
          detail: `за месяц упущено ≈ ${fm(L.lost)} (${pc(sh)} спроса), штат ${st.staff.length}/${st.staffTarget}`,
          todo: short ? `наберите полный штат (${st.staff.length} из ${st.staffTarget}) — каждый продавец обслуживает до ${cfg.CHECKS_PER_STAFF_BASE} чеков в день` : room ? `добавьте продавца в штат (до ${st.staffTarget + 1}) или обучите команду — опытные обслуживают больше` : `штат на максимуме формата — обучайте команду: +${cfg.CHECKS_PER_STAFF_LVL} чека в день за уровень`, go: short ? { act: 'pickCand', arg: st.id, label: 'Нанять' } : { act: 'openStore', arg: st.id, label: 'К персоналу' } });
      }
      // рейтинг на картах
      const r = E().storeRating(S, st);
      if (r < K.RATING_LOW + 0.3 && age >= 60) {
        const p = E().ratingParts(S, st), w = cfg.RATING_W;
        const NAMES = { train: ['обучение персонала', 'обучите команду'], repair: ['ремонт', 'сделайте ремонт'], mood: ['настроение команды', 'поднимите настроение: зарплата, премии'], staff: ['укомплектованность', 'наберите полный штат'], fresh: ['свежесть выпечки', 'поставьте «Сколько печь» ближе к норме'] };
        const weak = Object.keys(NAMES).sort((a, b) => w[b] * (5 - p[b]) - w[a] * (5 - p[a])).slice(0, 2);
        const lossK = (C().RATING_START - r) * C().RATING_TRAFFIC_LO;
        out.push({ area: 'sales', kind: 'rating', key: 'rating:' + st.id, sev: r < K.RATING_LOW ? 1 + (K.RATING_LOW - r) : 0.8 + (K.RATING_LOW + 0.3 - r) / 1.5, impact: L.rev * Math.max(0, lossK), storeId: st.id, where: where(st), cause: `рейтинг на картах ${r1(r)}★ — теряете новых гостей`,
          detail: `слабее всего: ${weak.map((k) => `${NAMES[k][0]} ${r1(p[k])}`).join(', ')}${lossK > 0 ? ` · новых гостей −${pc(lossK, 0)}` : ''}`, todo: weak.map((k) => NAMES[k][1]).join('; '), go: { act: 'openStore', arg: st.id, label: 'Открыть точку' } });
      }
      mktNeed += L.rev;
    }
    // маркетинг: прибыль есть, а на новых гостей ничего не тратится
    const last = S.history[S.history.length - 1];
    if (last && last.profit > 0 && S.alloc.marketing < 0.01 && openStores(S).length) {
      const gain = cfg.MARKETING_EFF * 0.5 * 0.3;
      out.push({ area: 'sales', kind: 'mkt', key: 'mkt', sev: 1.1, impact: mktNeed * gain * 0.2, where: 'вся сеть', cause: 'на маркетинг не идёт ни рубля — новых гостей нет',
        detail: `маркетинг ${pc(S.alloc.marketing, 0)} прибыли; при ${fm(cfg.MARKETING_HALF * S.macro.priceLevel)} на точку в месяц гостей +${pc(cfg.MARKETING_EFF * 0.5, 0)}`, todo: 'направьте 3–5% прибыли на маркетинг в «Финансах»', go: { act: 'tab', arg: 'fin', label: 'Финансы' } });
    }
  }

  function detStaff(S, out) {
    const cfg = C(), K = T();
    const payGap = S.pay.seller / S.market.seller - 1;
    for (const st of S.stores) {
      if (st.status === 'opening' || !st.staff.length) continue;
      const mood = avgOf(st, (e) => e.mood), fat = avgOf(st, (e) => e.fatigue), vac = E().vacancies(st);
      const why = fat > 45 ? 'люди вымотаны очередями' : payGap < -0.005 ? 'зарплата ниже рынка' : vac > 0 ? 'не хватает людей в смене' : S.culture === 0 ? 'нет корпоративной культуры и премий' : 'премий мало';
      const todo = fat > 45 ? 'добавьте продавца в штат или обучите команду' : payGap < -0.005 ? `поднимите зарплату хотя бы до рынка (${fm(S.market.seller)})` : vac > 0 ? 'наймите замену' : 'премии из прибыли или корпоративная культура во вкладке «Команда»';
      const goTeam = fat > 45 || vac > 0 ? { act: 'openStore', arg: st.id, label: 'К персоналу' } : { act: 'tab', arg: 'team', label: 'Команда' };
      // на грани: недовольны или вот-вот станут (раньше, чем придёт личное предупреждение)
      const edge = st.staff.filter((e) => e.mood < cfg.MOOD_UNHAPPY + K.MOOD_EDGE && !(e.mood < cfg.MOOD_UNHAPPY && e.unhappy >= (cfg.UNHAPPY_WARN_AFTER || 5)));
      if (edge.length) {
        const worst = edge.slice().sort((a, b) => a.mood - b.mood)[0];
        const unhappy = edge.filter((e) => e.mood < cfg.MOOD_UNHAPPY).length;
        const hireC = E().hireCost(S, 1);
        out.push({ area: 'staff', kind: 'quit', key: 'quit:' + st.id, sev: 0.9 + 0.25 * edge.length + (unhappy ? 0.3 : 0), impact: hireC * edge.length * 0.5, storeId: st.id, where: where(st),
          cause: `${edge.length > 1 ? edge.length + ' чел. на грани' : 'человек на грани'} увольнения: ${why}`,
          detail: `${worst.name}: настроение ${Math.round(worst.mood)} (недовольство — ниже ${cfg.MOOD_UNHAPPY})${unhappy ? `, недовольны уже ${unhappy}` : ''} · замена стоит ${fm(hireC)} и новичок 1-го уровня`, todo, go: goTeam });
      }
      if (mood < K.MOOD_LOW + 5) {
        out.push({ area: 'staff', kind: 'mood', key: 'mood:' + st.id, sev: (K.MOOD_LOW + 5 - mood) / 5 * 0.5 + (mood < K.MOOD_LOW ? 1 : 0.8), impact: (st.last ? st.last.rev : 0) * cfg.MOOD_CONV * Math.max(0, 60 - mood) / 40, storeId: st.id, where: where(st),
          cause: `в команде падает настроение: ${why}`, detail: `среднее настроение ${Math.round(mood)} · зарплата ${payGap >= 0 ? '+' : ''}${pc(payGap)} к рынку · усталость ${Math.round(fat)} · культура ${S.culture}/5`, todo, go: goTeam });
      }
      if (vac > 0 && fat > K.FATIGUE_CHAIN * 0.8) {
        out.push({ area: 'staff', kind: 'chain', key: 'chain:' + st.id, sev: fat / K.FATIGUE_CHAIN, impact: (st.last ? st.last.rev : 0) * 0.05, storeId: st.id, where: where(st), dup: fat < K.FATIGUE_CHAIN,
          cause: 'нехватка людей выматывает оставшихся — скоро начнут уходить', detail: `в смене ${st.staff.length} из ${st.staffTarget}, средняя усталость ${Math.round(fat)} (от 55 — минус к настроению)`, todo: `наймите ${vac} ${plural(vac, 'человека', 'человек', 'человек')} — иначе цепная реакция увольнений`, go: { act: 'pickCand', arg: st.id, label: 'Нанять' } });
      }
    }
  }

  function detProd(S, out) {
    const cfg = C(), K = T(), E_ = E();
    const last = S.history[S.history.length - 1], lp = last && last.pnl;
    // выпечка: соседнее деление «Сколько печь» (формула как в «Цехе» — wasteSummary)
    if (lp && lp.waste != null && lp.rev > 0 && S.waste) {
      const lost = lp.lostBake || 0, fcShare = clamp((lp.fc - lp.waste) / lp.rev, 0, 0.9), margin = Math.max(0, 1 - fcShare - E_.currentTaxRate(S));
      const i = clamp((S.waste.bake | 0) + 3, 0, 6), L = cfg.BAKE_LEVELS[i], D = L.lost > 0 ? lost / L.lost : 0;
      const step = (j) => { const M = cfg.BAKE_LEVELS[j]; if (!M) return null; return { j, name: M.name, net: -D * (M.lost - L.lost) * margin - lp.waste * (M.waste / L.waste - 1) }; };
      const best = [step(i - 1), step(i + 1)].filter(Boolean).sort((a, b) => b.net - a.net)[0];
      const disc = S.waste.disc | 0;
      if (best && best.net > 0) out.push({ area: 'prod', kind: 'waste', key: 'waste', sev: best.net / (lp.rev * K.WASTE_GAIN), impact: best.net, where: 'вся сеть',
        cause: best.j < i ? 'выпечки слишком много — растут списания' : 'выпечки не хватает к вечеру — гости уходят без покупки',
        detail: `прошлый месяц: списано ${fm(lp.waste)} (${pc(lp.waste / lp.rev)} выручки), упущено продаж ~${fm(lost)}${disc ? '' : ' · вечерней скидки нет'}`,
        todo: `поставьте «Сколько печь» на «${best.name}» — ≈ +${fm(best.net)}/мес${disc ? '' : '; вечерняя скидка 30% раскупит часть остатков'}`, go: { act: 'tab', arg: 'prod', label: 'Цех' } });
    }
    // мощность цеха: ранний сигнал (выше 90% — уже в «Требует внимания»)
    const cu = S.cache ? S.cache.capUse || 0 : 0;
    if (S.productions.length && cu > K.CAP_EARLY * 0.9 && cu <= 0.9) {
      const open = openStores(S).length || 1, units = S.cache.units || 0, cap = S.cache.cap || 0;
      const more = Math.max(0, Math.floor((cap * 0.95 - units) / (units / open || 1)));
      out.push({ area: 'prod', kind: 'cap', key: 'cap', sev: cu / K.CAP_EARLY, impact: (last ? last.rev : 0) * 0.02, where: S.productions.length > 1 ? 'цеха' : 'цех',
        cause: 'цех скоро перестанет успевать', detail: `загрузка ${pc(cu, 0)} · ещё ${more} ${plural(more, 'точка', 'точки', 'точек')} — и выпечки не хватит`, todo: 'купите оборудование заранее: при нехватке продажи режутся по всей сети', go: { act: 'tab', arg: 'prod', label: 'Оборудование' } });
    }
    // цены ниже рекомендованных — фудкост выше
    const cheap = S.menu.filter((m) => m.pm < K.PRICE_CHEAP);
    if (cheap.length && last && last.rev > 0) {
      const names = cheap.map((m) => (E_.byId(BK.PRODUCTS, m.id) || {}).name).filter(Boolean);
      const avgCut = cheap.reduce((a, m) => a + (1 - m.pm), 0) / cheap.length;
      out.push({ area: 'prod', kind: 'fc', key: 'fc', sev: 0.8 + cheap.length / Math.max(4, S.menu.length) * 2 * (avgCut / 0.1), impact: last.rev * avgCut * cheap.length / S.menu.length * 0.5, where: 'меню',
        cause: 'часть меню продаётся почти по себестоимости', detail: `${cheap.length} ${plural(cheap.length, 'позиция', 'позиции', 'позиций')} дешевле рекомендованной в среднем на ${pc(avgCut, 0)}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''} · фудкост ${pc(S.cache && S.cache.fcPct || 0)}`,
        todo: 'верните цены к рекомендованным, если гостей это не отпугивает (кошелёк района выше корзины)', go: { act: 'tab', arg: 'menu', label: 'Меню' } });
    }
    // доставка съедает выручку точки
    for (const st of openStores(S)) {
      const d = E_.deliveryCost(S, st), sh = d / st.last.rev;
      if (sh > K.DELIV_SHARE * 0.7) {
        const p = E_.nearestProd(S, st), km = p ? E_.dist(p, st) * E_.kmPerUnit() : 0;
        out.push({ area: 'prod', kind: 'deliv', key: 'deliv:' + st.id, sev: sh / K.DELIV_SHARE, impact: d * 0.4, storeId: st.id, where: where(st), cause: 'точка далеко от цеха — доставка съедает выручку',
          detail: `доставка ${fm(d)}/мес = ${pc(sh)} выручки, до цеха ${r1(km)} км`, todo: S.stores.length >= cfg.SECOND_PROD_STORES ? 'второй цех ближе к этим точкам снизит доставку' : 'следующие точки открывайте ближе к цеху; здесь поднимайте выручку (обучение, ремонт)', go: { act: 'openStore', arg: st.id, label: 'Открыть точку' } });
      }
    }
    // пекари недовольны — уходят, мощность падает
    for (const p of S.productions) if (p.status === 'open' && p.morale < K.BAKER_MORALE + 8) {
      out.push({ area: 'prod', kind: 'bakers', key: 'bakers:' + p.id, sev: (K.BAKER_MORALE + 8 - p.morale) / 8 * 0.5 + (p.morale < K.BAKER_MORALE ? 1 : 0.7), impact: (last ? last.rev : 0) * 0.01, where: p.name, cause: 'пекари недовольны — будут уходить, мощность просядет',
        detail: `настрой пекарей ${Math.round(p.morale)} (ниже 50 — уходят каждый месяц) · зарплата пекаря ${fm(S.pay.baker)}, рынок ${fm(S.market.baker)}`, todo: S.pay.baker < S.market.baker ? 'поднимите зарплату пекарей до рынка' : 'купите оборудование, чтобы снять перегрузку, и поднимите культуру', go: { act: 'tab', arg: 'team', label: 'Зарплаты' } });
    }
  }

  function detFin(S, out) {
    const cfg = C(), K = T(), E_ = E();
    for (const st of openStores(S)) {
      const L = st.last, rent = E_.storeRentMonth(st), sh = rent / L.rev, age = S.day - (st.openedDay != null ? st.openedDay : 0);
      if (sh > K.RENT_SHARE * 0.8 && age >= 90) out.push({ area: 'fin', kind: 'rent', key: 'rent:' + st.id, sev: sh / K.RENT_SHARE, impact: rent - L.rev * 0.1, storeId: st.id, where: where(st),
        cause: 'аренда съедает прибыль', detail: `аренда ${fm(rent)}/мес = ${pc(sh)} выручки (норма до 10–12%) · прибыль ${fm(L.profit)}`,
        todo: L.profit < 0 ? 'поднимите выручку (обучение, ремонт, штат) — не выйдет за 2–3 месяца, закройте точку' : 'поднимайте выручку: обучение, ремонт; при продлении арендодатель поднимет ставку успешной точке', go: { act: 'openStore', arg: st.id, label: 'Открыть точку' } });
      // первый месяц в минусе (две подряд — уже в «Требует внимания»); новые точки в раскрутке не считаем
      if (L.profit < 0 && (st.lossStreak || 0) < 2 && age >= cfg.RAMP_DAYS * 0.7) {
        const parts = [['аренда', rent], ['зарплаты', L.payroll || 0], ['доставка', L.delivery || 0], ['себестоимость', L.fc || 0]].sort((a, b) => b[1] / L.rev - a[1] / L.rev);
        out.push({ area: 'fin', kind: 'loss', key: 'loss:' + st.id, sev: 1 + Math.min(1, -L.profit / Math.max(1, L.rev) * 5), impact: -L.profit, storeId: st.id, where: where(st), cause: 'точка ушла в минус',
          detail: `прибыль ${fm(L.profit)} при выручке ${fm(L.rev)} · больше всего съедает ${parts[0][0]} (${pc(parts[0][1] / L.rev)})`, todo: parts[0][0] === 'зарплаты' ? 'штат больше, чем нужно потоку? уменьшите на 1 или поднимите выручку' : parts[0][0] === 'аренда' ? 'выручка мала для такой аренды — чек и поток (обучение, ремонт, маркетинг)' : 'проверьте цены и доставку', go: { act: 'openStore', arg: st.id, label: 'Открыть точку' } });
      }
    }
    // запас денег меньше месяца постоянных расходов
    const last = S.history[S.history.length - 1], lp = last && last.pnl;
    if (lp && S.history.length >= 2) {
      const fixed = (lp.rent || 0) + (lp.payroll || 0) + (lp.util || 0) + (lp.delivery || 0) + (lp.upkeep || 0) + (lp.interest || 0) + monthFee(S);
      const have = S.cash + S.reserve;
      if (fixed > 0 && have < fixed * K.CUSHION_MONTHS * 1.25 && have >= 0) out.push({ area: 'fin', kind: 'cushion', key: 'cushion', sev: fixed * K.CUSHION_MONTHS / Math.max(1, have), impact: fixed * 0.1, where: 'счёт и резерв',
        cause: 'запас денег тоньше месяца расходов', detail: `на счёте и в резерве ${fm(have)}, постоянные расходы ≈ ${fm(fixed)}/мес`, todo: `откладывайте в резерв 10–15% прибыли; ${S.alloc.reserve < 0.05 ? `сейчас ${pc(S.alloc.reserve, 0)}` : 'и не открывайте новое, пока запас не вырастет'}`, go: { act: 'tab', arg: 'fin', label: 'Финансы' } });
    }
    // кредит дороже, чем приносит резерв
    if (S.loan > 0 && S.reserve > K.LOAN_RESERVE_MIN * S.macro.priceLevel) {
      const rate = E_.loanRate(S), rr = Math.max(0, S.macro.keyRate - cfg.RESERVE_SPREAD), x = Math.min(S.loan, S.reserve), gain = x * (rate - rr) / 12;
      out.push({ area: 'fin', kind: 'loan', key: 'loan', sev: 0.8 + gain / Math.max(1, (last ? last.rev : 1) * 0.002), impact: gain, where: 'кредит и резерв', dup: false,
        cause: 'кредит стоит дороже, чем приносит резерв', detail: `кредит ${fm(S.loan)} под ${pc(rate)}, резерв ${fm(S.reserve)} приносит ${pc(rr)}`, todo: `погасите ${fm(x)} из резерва — экономия ≈ ${fm(gain)}/мес (резерв можно снова копить из прибыли)`, go: { act: 'tab', arg: 'fin', label: 'Финансы' } });
    }
  }

  function detCorp(S, out) {
    if (!corpOn(S)) return;
    const K = T(), D = BK.Dir, cr = S.corp;
    const cname = (id) => (BK.CITY_BY_ID && BK.CITY_BY_ID[id] ? BK.CITY_BY_ID[id].name : id);
    const SKN = { ops: ['Операции', 'ops'], econ: ['Экономия', 'econ'], growth: ['Рост', 'growth'], people: ['Люди', 'people'] };
    for (const id in cr.cities) {
      const c = cr.cities[id], h = c.hist || [], lastRow = h[h.length - 1];
      const rev = lastRow ? lastRow[2] : 0;
      if (!c.directorId && id !== cr.active && c.status !== 'launch') out.push({ area: 'corp', kind: 'nodir', key: 'nodir:' + id, sev: 1.2, impact: rev * 0.05, cityId: id, where: cname(id),
        cause: 'город без директора — работает «заочно», не растёт', detail: `выручка ${fm(rev)}/мес, новых точек нет`, todo: 'наймите директора или назначьте из резерва', go: { act: 'ruHireFor', arg: id, label: 'Нанять' } });
      // утечка: выручка ниже прогноза 3 месяца подряд
      const dv = D.cityDev ? D.cityDev(S, id) : null;
      if (dv && dv.dev3 != null && dv.dev3 < -K.CITY_LEAK * 0.8 && h.slice(-3).filter((x) => x[7] > 0).length >= 3) out.push({ area: 'corp', kind: 'leak', key: 'leak:' + id, sev: -dv.dev3 / K.CITY_LEAK, impact: rev * -dv.dev3, cityId: id, where: cname(id),
        cause: 'выручка три месяца ниже прогноза — похоже на утечку денег', detail: `отклонение от прогноза ${pc(dv.dev3)} за 3 месяца ≈ ${fm(rev * -dv.dev3)}/мес`, todo: 'назначьте аудит города; служба безопасности в «Штабе» ловит такое сама', go: { act: 'trGo', arg: 'city:' + id, label: 'К городу' } });
      if (h.length >= 2 && h[h.length - 1][3] < 0 && h[h.length - 2][3] < 0 && c.status !== 'launch') out.push({ area: 'corp', kind: 'cityloss', key: 'cityloss:' + id, sev: 1.3, impact: -h[h.length - 1][3], cityId: id, where: cname(id),
        cause: 'город в убытке второй месяц', detail: `прибыль ${fm(h[h.length - 1][3])} и ${fm(h[h.length - 2][3])} при выручке ${fm(rev)}`, todo: 'приоритет «Прибыль», урежьте открытия или замените директора', go: { act: 'trGo', arg: 'city:' + id, label: 'К городу' } });
    }
    for (const d of cr.directors || []) {
      const c = d.city ? cr.cities[d.city] : null, cn = c ? cname(c.id) : 'резерв';
      if (d.loyalty < K.DIR_LOYAL_LOW + 8) {
        const mp = D.marketPay ? D.marketPay(S, d, d.city) : d.salary, gap = d.salary / mp - 1;
        out.push({ area: 'corp', kind: 'loyal', key: 'loyal:' + d.id, sev: (K.DIR_LOYAL_LOW + 8 - d.loyalty) / 8 * 0.4 + (d.loyalty < K.DIR_LOYAL_LOW ? 1 : 0.75), impact: d.salary * 3, dirId: d.id, cityId: d.city || null, where: `${d.name} (${cn})`,
          cause: 'директор может уйти или его переманят', detail: `лояльность ${Math.round(d.loyalty)} · оклад ${gap >= 0 ? '+' : ''}${pc(gap)} к рынку`, todo: gap < -0.03 ? 'поднимите оклад до рынка; отметьте хороший отчёт' : 'опцион или место в совете директоров, отметьте хороший отчёт', go: { act: 'trGo', arg: 'dir:' + d.id, label: 'К директору' } });
      }
      const sk = d.seen || d.skills, weak = Object.keys(SKN).filter((k) => sk[k] != null).sort((a, b) => sk[a] - sk[b])[0];
      if (weak && sk[weak] < K.DIR_SKILL_LOW + 5 && !d.study && d.city) {
        const prog = BK.CORP_UNI && BK.CORP_UNI.programs[SKN[weak][1]];
        out.push({ area: 'corp', kind: 'skill', key: 'skill:' + d.id, sev: (K.DIR_SKILL_LOW + 5 - sk[weak]) / 10 + (sk[weak] < K.DIR_SKILL_LOW ? 1 : 0.8), impact: (c && c.hist && c.hist.length ? c.hist[c.hist.length - 1][2] : 0) * 0.01, dirId: d.id, cityId: d.city, where: `${d.name} (${cn})`,
          cause: `слабый навык «${SKN[weak][0]}» — просит обучения`, detail: `«${SKN[weak][0]}» ${Math.round(sk[weak])} из 100`, todo: prog ? `программа «${prog.name}» в корпоративном университете (+10)` : 'корпоративный университет в «Штабе»', go: { act: 'trGo', arg: 'hq', label: 'Университет' } });
      }
    }
    const open = D.inboxOpen ? D.inboxOpen(S) : 0;
    if (open > 0) {
      const who = [];
      for (const it of cr.inbox || []) if ((it.reqs || []).some((r) => r.st === 'open') && it.dname && who.indexOf(it.dname) < 0) who.push(it.dname);
      out.push({ area: 'corp', kind: 'asks', key: 'asks', sev: 0.9 + open * 0.15, impact: 0, where: 'отчёты директоров', cause: `${open} ${plural(open, 'просьба ждёт', 'просьбы ждут', 'просьб ждут')} ответа`,
        detail: who.length ? `просят: ${who.slice(0, 3).join(', ')}${who.length > 3 ? '…' : ''}` : 'во входящих', todo: 'ответьте до конца месяца — отказ по сроку снижает лояльность', go: { act: 'trGo', arg: 'inbox', label: 'Отчёты' } });
    }
  }

  // все проблемы, которые видит «идеальный» наблюдатель (без учёта навыков игрока)
  function analyze(S) {
    const out = [];
    if (!S || S.phase !== 'play') return out;
    detSales(S, out); detStaff(S, out); detProd(S, out); detFin(S, out); detCorp(S, out);
    for (const p of out) if (!Number.isFinite(p.impact)) p.impact = 0;
    return out;
  }

  /* ---------------- что видит игрок при своих навыках ----------------
     Уровень 1: проблемы по порогу, сгруппированы по виду — «у 2 точек проблемы со средним чеком» (где — не сказано).
     Уровень 2: по порогу, у каждой — где и почему. Уровень 3: ещё и «на подходе» (SENS_TOP), с цифрами, что сделать и кнопкой.
     Возвращает список { area, lvl, kind, key, sev, impact, storeId, cityId, dirId, where, cause, detail, todo, go, n (для уровня 1), dup }. */
  const GEN = {
    check: (n) => n === 1 ? 'У одной точки проблемы со средним чеком' : `У ${n} точек проблемы со средним чеком`,
    queue: (n) => n === 1 ? 'На одной точке гости уходят из-за очередей' : `На ${n} точках гости уходят из-за очередей`,
    rating: (n) => n === 1 ? 'У одной точки проседает рейтинг на картах' : `У ${n} точек проседает рейтинг на картах`,
    mkt: () => 'Сеть почти не зовёт новых гостей',
    quit: (n) => n === 1 ? 'В одной команде кто-то на грани увольнения' : `В ${n} командах есть люди на грани увольнения`,
    mood: (n) => n === 1 ? 'В одной команде падает настроение' : `В ${n} командах падает настроение`,
    chain: (n) => n === 1 ? 'На одной точке нехватка людей выматывает команду' : `На ${n} точках нехватка людей выматывает команды`,
    waste: () => 'Выпечка и списания настроены неудачно',
    cap: () => 'Цех скоро перестанет успевать',
    fc: () => 'Часть меню продаётся слишком дёшево',
    deliv: (n) => n === 1 ? 'У одной точки доставка съедает выручку' : `У ${n} точек доставка съедает выручку`,
    bakers: () => 'В цеху недовольны пекари',
    rent: (n) => n === 1 ? 'У одной точки аренда съедает прибыль' : `У ${n} точек аренда съедает прибыль`,
    loss: (n) => n === 1 ? 'Одна точка ушла в минус' : `${n} ${plural(n, 'точка ушла', 'точки ушли', 'точек ушли')} в минус`,
    cushion: () => 'Запас денег опасно тонкий',
    loan: () => 'Кредит обходится дороже, чем нужно',
    nodir: (n) => n === 1 ? 'Один город без директора' : `${n} ${plural(n, 'город', 'города', 'городов')} без директора`,
    leak: (n) => n === 1 ? 'В одном городе выручка ниже прогноза' : `В ${n} городах выручка ниже прогноза`,
    cityloss: (n) => n === 1 ? 'Один город в убытке' : `${n} ${plural(n, 'город', 'города', 'городов')} в убытке`,
    loyal: (n) => n === 1 ? 'Один директор может уйти' : `${n} ${plural(n, 'директор может', 'директора могут', 'директоров могут')} уйти`,
    skill: (n) => n === 1 ? 'Одному директору нужно обучение' : `${n} ${plural(n, 'директору', 'директорам', 'директорам')} нужно обучение`,
    asks: () => 'Директора ждут ответа',
  };
  let memo = null;
  function hints(S, skillsOverride) {
    if (!S || S.phase !== 'play') return [];
    const sk = skillsOverride || (S.player && S.player.skills) || {};
    let any = false; for (const a of AREAS) if (sk[a] > 0) any = true;
    if (!any) return [];
    if (!skillsOverride) {
      let st = 0; for (const x of S.stores) st += x.staff.length * 7 + (x.last ? 1 : 0) + x.staffTarget * 3 + x.repair;
      const key = [S.day, S.stores.length, st, AREAS.map((a) => sk[a] | 0).join(''), Math.round(S.cash / 1e5), Math.round(S.reserve / 1e5), S.loan, S.alloc.marketing, S.alloc.reserve, S.menu.map((m) => m.pm).join(','), S.waste ? S.waste.bake + ':' + S.waste.disc : '', S.pay.seller].join('|');
      if (memo && memo.S === S && memo.key === key) return memo.r;
      const r = compute(S, sk); memo = { S, key, r }; return r;
    }
    return compute(S, sk);
  }
  function compute(S, sk) {
    const K = T(), all = analyze(S), out = [];
    for (const a of AREAS) {
      const L = sk[a] | 0; if (!L || !areaOpen(S, a)) continue;
      const thr = L >= 3 ? K.SENS_TOP : 1;
      const list = all.filter((p) => p.area === a && p.sev >= thr).sort((x, y) => y.impact - x.impact || y.sev - x.sev);
      if (L === 1) { // общий сигнал: по видам, без «где»
        const kinds = {};
        for (const p of list) (kinds[p.kind] = kinds[p.kind] || []).push(p);
        const groups = Object.keys(kinds).map((k) => { const g = kinds[k]; return { area: a, lvl: 1, kind: k, key: 'g:' + k, n: g.length, sev: Math.max(...g.map((x) => x.sev)), impact: g.reduce((s, x) => s + x.impact, 0), cause: GEN[k] ? GEN[k](g.length) : k, dup: g.every((x) => x.dup), items: g }; });
        groups.sort((x, y) => y.impact - x.impact);
        out.push(...groups.slice(0, K.MAX_HINTS[1]));
      } else out.push(...list.slice(0, K.MAX_HINTS[L]).map((p) => Object.assign({ lvl: L }, p)));
    }
    return out.sort((x, y) => y.sev - x.sev || y.impact - x.impact);
  }
  // подсказки уровня 2+ по точке (карта, карточка точки)
  function forStore(S, id) { return hints(S).filter((h) => h.lvl >= 2 && h.storeId === id); }
  function any(S) { const sk = S && S.player && S.player.skills; if (!sk) return false; for (const a of AREAS) if (sk[a] > 0) return true; return false; }

  /* ---------------- подключение к движку (как achievements.js: обёртка, движок не меняется) ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__trn) return;
    Eng.__trn = true;
    const w = (name, fn) => { const orig = Eng[name]; if (orig) Eng[name] = fn(orig); };
    w('newGame', (o) => function () { const S = o.apply(this, arguments); ensure(S); return S; });
    w('tick', (o) => function (S) {
      const go = S && S.player && S.phase === 'play' && !S.ev.pending && !S.chef.pending && !S.lost; // те же условия, при которых движок делает шаг
      if (go) payDay(S);
      const r = o.apply(this, arguments);
      if (r && S.player) daily(S);
      return r;
    });
    Object.assign(Eng, { trainerHire: hire, trainerCancel: cancel });
  }
  wrap();

  BK.Trainers = { AREAS, AREA, LEVELS, ensure, skill, price, tiers, whyNot, hire, cancel, monthFee, daily, analyze, hints, forStore, any, studying, slotsFree, areaOpen, corpOn, GEN, wrap };
})();
