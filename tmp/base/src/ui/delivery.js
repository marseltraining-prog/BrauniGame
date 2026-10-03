/* Доставка через агрегаторы и время суток (ROADMAP, этап 2): блоки интерфейса.
   Движок — engine.js, блок «время суток и доставка через агрегаторы»; числа — DAYPART_* и AGG_* в config.js.
   В panels.js / app.js только хуки: блок сети во вкладке «Точки», раздел в карточке точки, строка в карточке помещения,
   значок в списке точек, строка в подсказке карты, действия aggNet / aggStore. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, H = () => BK.UIH;
  const PEAK = { m: 'пик утром', d: 'пик в обед', e: 'пик вечером', flat: 'гости весь день' };
  const pc = (v) => Math.round(v * 100) + '%';

  function dpBar(dp) {
    const seg = (k, v) => `<i class="dp-${k}" style="width:${(v * 100).toFixed(1)}%"></i>`;
    const lab = (k, n, v) => `<span><b class="dp-sw dp-${k}" aria-hidden="true"></b>${n} ${pc(v)}</span>`;
    return `<div class="dp-bar" role="img" aria-label="Гости: утро ${pc(dp.m)}, обед ${pc(dp.d)}, вечер ${pc(dp.e)}">${seg('m', dp.m)}${seg('d', dp.d)}${seg('e', dp.e)}</div>
      <div class="dp-lg">${lab('m', 'утро', dp.m)}${lab('d', 'обед', dp.d)}${lab('e', 'вечер', dp.e)}</div>`;
  }
  // что это значит для игрока (коротко, по порядку важности)
  function dpHint(dp, agg) {
    const cfg = C(), out = [];
    if (dp.thrK < 0.995) out.push(`в пик очередь — команда успевает на ${pc(1 - dp.thrK)} меньше гостей, людей нужно больше`);
    if (dp.e >= 0.42) out.push('вечером людно: остатки раскупают, вечерняя скидка работает сильнее');
    else if (dp.e <= 0.26) out.push(`к вечеру пусто: выпечка залёживается (остатков +${pc(dp.wasteK - 1)})`);
    const a = dp.agg - 1;
    if (Math.abs(a) >= 0.05) out.push(`заказов доставки ${a > 0 ? 'больше' : 'меньше'} обычного на ${pc(Math.abs(a))}${a > 0 ? ' (ужины и обеды с доставкой)' : ''}`);
    else if (agg) out.push('заказов доставки — как в среднем по городу');
    if (!out.length) out.push('гости приходят ровно — без очередей в пик');
    return out.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.';
  }
  const dpChip = (o) => { const dp = E().daypartOf(o); return `<span class="chip dpc" title="Утро ${pc(dp.m)} · обед ${pc(dp.d)} · вечер ${pc(dp.e)}"><b class="dp-sw dp-${dp.peak}" aria-hidden="true"></b>${PEAK[dp.peak]}</span>`; };
  function dpBox(o, title) {
    const dp = E().daypartOf(o);
    return `<div class="dpbox"><div class="dp-h"><span class="flabel">${title || 'Когда приходят гости'}</span>${dpChip(o)}</div>${dpBar(dp)}<div class="hint">${dpHint(dp, true)}</div></div>`;
  }
  const offerLine = (S, o) => dpBox(o); // карточка помещения на «Рынке»
  const tipText = (o) => { const dp = E().daypartOf(o); return `${PEAK[dp.peak]} (утро ${pc(dp.m)}, обед ${pc(dp.d)}, вечер ${pc(dp.e)})`; };
  const listChip = (S, st) => (st.agg ? `<span class="chip dlv" title="Точка подключена к агрегаторам доставки">доставка</span>` : '');

  // строка комиссии и порог следующей ступени
  function commText(S) {
    const cfg = C(), n = E().aggConnected(S), r = E().aggCommission(S);
    const next = cfg.AGG_COMMISSION.find(([k]) => k > n);
    return `комиссия ${pc(r)} + упаковка ${pc(cfg.AGG_PACK)}${next ? ` · от ${next[0]} подключённых точек — ${pc(next[1])}` : ' · лучшие условия'}`;
  }

  /* блок сети — вкладка «Точки», над списком */
  function netBlock(S) {
    if (!S.stores.length || !E().aggSummary) return '';
    const h = H(), A = E().aggSummary(S), cfg = C();
    const need = S.stores.reduce((a, st) => a + (st.agg ? 0 : E().aggConnectCost(S, st)), 0);
    const over = S.stores.filter((st) => st.agg && E().aggLatePen(S, st) > 0.05);
    let s = `<div class="sec dlvnet" id="aggnet"><h3>Доставка через агрегаторы <small>${A.n ? `${A.n} из ${A.total} точек` : 'выключена'}</small></h3>
      <div class="row sp"><span class="hint">${A.on ? 'Новые точки подключаются сами.' : A.n ? 'Подключены не все точки.' : 'Один переключатель на всю сеть.'}</span>${A.on ? h.btn('aggNet', 'Отключить всю сеть', { cls: 'sm', arg: 0 }) : h.btn('aggNet', A.n ? 'Подключить все точки' : 'Подключить сеть', { cls: 'sm primary', arg: 1, cost: need || null, dis: S.cash < need })}</div>`;
    if (A.last) {
      const net = A.last.rev - A.last.cost;
      s += `<div class="grid2">${h.kv('Заказов за прошлый месяц', h.n0(A.last.orders))}${h.kv('Выручка доставки', h.fm(A.last.rev))}${h.kv('Комиссия и упаковка', '−' + h.fm(A.last.cost))}${h.kv('Остаётся до себестоимости', h.fm(net))}</div>`;
    } else if (A.n) s += `<div class="hint">Первые итоги — после 1-го числа. Заказы разгоняются примерно за ${Math.round(cfg.AGG_RAMP_DAYS / 30 * 10) / 10} месяца.</div>`;
    s += `<div class="hint">Гости заказывают из приложений: чек выше на ${pc(cfg.AGG_CHECK - 1)}, ${A.n ? commText(S) : `${commText(S)}, подключение — ${h.fm(Math.round(cfg.AGG_CONNECT * S.macro.priceLevel))} на точку`}. Заказы собирает команда точки: на перегруженных точках гости зала ждут, а опоздания курьеров снижают рейтинг. Отдельную точку можно отключить в её карточке.</div>`;
    if (over.length) s += `<div class="alert warn"><div><div class="a-t">Не успевают с доставкой</div><div>Точки ${over.map((st) => '№' + st.num).join(', ')}: опоздания бьют по рейтингу. Наймите людей или отключите доставку на этих точках.</div></div></div>`;
    return s + `</div>`;
  }

  /* раздел в карточке точки */
  function storeSection(S, st) {
    const h = H(), cfg = C(), E_ = E();
    const T = st.today, L = st.last;
    let s = `<div class="sec" id="dlvst"><h3>Время суток и доставка</h3>${dpBox(st)}`;
    const cost = E_.aggConnectCost(S, st);
    s += `<div class="row sp dlvrow"><div class="row">${st.agg ? '<span class="chip good">В агрегаторах</span>' : '<span class="chip">Без доставки</span>'}${st.agg && T && !T.closed ? `<span class="chip">${h.n0(T.agg || 0)} заказов сегодня</span>` : ''}</div>
      ${st.agg ? h.btn('aggStore', 'Отключить', { cls: 'sm', arg: st.id, arg2: 0 }) : h.btn('aggStore', 'Подключить', { cls: 'sm primary', arg: st.id, arg2: 1, cost: cost || null, dis: S.cash < cost, title: 'Фото, карточки блюд и запас упаковки — один раз' })}</div>`;
    if (L && L.aggRev) s += `<div class="grid2">${h.kv('Заказов за месяц', h.n0(L.aggOrders || 0))}${h.kv('Выручка доставки', h.fm(L.aggRev))}${h.kv('Комиссия и упаковка', '−' + h.fm(L.agg || 0))}${h.kv('Доля в выручке точки', pc(L.aggRev / Math.max(1, L.rev)))}</div>`;
    const pen = E_.aggLatePen(S, st);
    if (pen > 0.05) s += `<div class="alert warn"><div><div class="a-t">Команда не успевает</div><div>Загрузка ${pc(T.load)}: курьеры ждут, гости пишут плохие отзывы — рейтинг тянется вниз на ${pen.toFixed(1).replace('.', ',')}★. Добавьте людей в штат или отключите доставку.</div></div></div>`;
    else if (!st.agg) s += `<div class="hint">Подключение: ${cost ? h.fm(cost) + ' один раз, ' : ''}${commText(S)}. Выгоднее там, где команда не загружена полностью и рейтинг высокий — агрегатор показывает такие точки выше.</div>`;
    return s + `</div>`;
  }

  BK.DeliveryUI = { netBlock, storeSection, offerLine, dpBox, dpChip, tipText, listChip, PEAK };
})();
