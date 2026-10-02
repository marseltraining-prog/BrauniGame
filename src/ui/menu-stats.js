/* Хлебная карта — статистика продуктов в окне шеф-пекаря и во вкладке «Меню» (BK.MenuStats).
   Данные — BK.ProdStats (src/prodstats.js): факт по месяцам и оценка по модели спроса для новинок.
   app.js (openChefModal) берёт отсюда разметку окна, panels.js (menu) — строку статистики под продуктом. */
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, H = () => BK.UIH, PS = () => BK.ProdStats;
  const esc = (s) => H().esc(s);
  const n0 = (v) => Math.round(v).toLocaleString('ru-RU');
  const pc = (v, d) => { const a = v * 100; return (Math.abs(a) >= 10 || d === 0 ? a.toFixed(0) : a.toFixed(1)).replace('.', ',').replace('-', '−') + '%'; };
  const money = (v) => BK.fmtMoney(v);
  const signMoney = (v) => (v >= 0 ? '+' : '−') + BK.fmtMoney(Math.abs(v));
  const cat = (p) => BK.CATEGORIES[p.cat];

  // сводка с кешем: панель перерисовывается часто, а история меняется раз в месяц
  let cache = { key: '', val: null };
  function sum(S) {
    const cd = S.prodStats && S.prodStats.c ? S.prodStats.c[S.corp ? S.corp.active : 'ufa'] : null;
    const hasHist = !!(cd && cd.hist.length);
    const key = [S.seed, S.corp ? S.corp.active : '', cd ? cd.hist.length + ':' + (cd.hist.length ? cd.hist[cd.hist.length - 1].y * 12 + cd.hist[cd.hist.length - 1].m : 0) : 0,
      S.menu.map((m) => m.id + m.pm).join(), Math.round(S.macro.priceLevel * 1e4), hasHist ? '' : S.stores.length + ':' + Math.floor(S.day / 7)].join('|');
    if (cache.key !== key) cache = { key, val: PS().summary(S) };
    return cache.val;
  }

  // мини-график выручки по месяцам (пропуски — месяцы, когда продукта не было в меню)
  function spark(vals, w, h) {
    const pts = vals.map((v, i) => [i, v]).filter((x) => x[1] != null);
    if (pts.length < 2) return `<svg class="ms-spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
    const max = Math.max(...pts.map((x) => x[1])), min = Math.min(...pts.map((x) => x[1])), pad = 2.5, n = Math.max(2, vals.length);
    const X = (i) => pad + (i * (w - pad * 2)) / (n - 1), Y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    const d = pts.map((x, k) => (k ? 'L' : 'M') + X(x[0]).toFixed(1) + ',' + Y(x[1]).toFixed(1)).join('');
    const l = pts[pts.length - 1];
    return `<svg class="ms-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--ink-3)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(l[0]).toFixed(1)}" cy="${Y(l[1]).toFixed(1)}" r="2.3" fill="var(--crust)"/></svg>`;
  }
  function trend(x) {
    const t = x.trend;
    if (!t || t.pct == null) return `<span class="ms-tr flat" title="Динамику покажем, когда накопится 6+ месяцев продаж">—</span>`;
    const up = t.pct >= 0.02, dn = t.pct <= -0.02;
    const sh = t.share != null ? `, доля в выручке ${t.share >= 0 ? '+' : ''}${pc(t.share, 0)}` : '';
    return `<span class="ms-tr ${up ? 'up' : dn ? 'down' : 'flat'}" title="Продано штук ${t.label}: ${t.pct >= 0 ? '+' : ''}${pc(t.pct, 0)}${sh}">${up ? '▲' : dn ? '▼' : '▶'} ${pc(Math.abs(t.pct), 0)}</span>`;
  }
  const bar = (v, max) => `<span class="ms-bar"><i style="width:${Math.max(2, Math.min(100, (v / (max || 1)) * 100)).toFixed(0)}%"></i></span>`;

  // подпись источника данных
  function source(s) {
    const city = s.city && s.city !== 'ufa' && BK.CITY ? ` · ${esc(BK.CITY.name || '')}` : '';
    if (s.hasData) return `в месяц, среднее за ${H().nw(s.months, 'месяц', 'месяца', 'месяцев')}${city}`;
    return `копим статистику — пока оценка по модели спроса${city}`;
  }

  /* ---------- вкладка «Меню»: строка под продуктом ---------- */
  function menuHead(S) {
    const s = sum(S);
    return `<span class="ms-src${s.hasData ? '' : ' est'}">${source(s)}</span>`;
  }
  function menuRow(S, id) {
    const s = sum(S), x = s.rows.find((r) => r.id === id); if (!x) return '';
    const est = x.est ? '≈ ' : '';
    const fl = x.candidate ? `<span class="ms-flag cand">кандидат на вывод</span>` : x.flags.map((f) => `<span class="ms-flag">${f.t}</span>`).join('');
    return `<div class="ms-line${x.est ? ' est' : ''}">
      <span title="Продано штук в месяц">${est}${n0(x.units)} шт.</span>
      <span title="Выручка продукта в месяц и доля от выручки всех продуктов"><b>${est}${money(x.rev)}</b> · ${pc(x.share)}</span>
      <span title="Маржа: выручка минус себестоимость и списания">маржа ${pc(x.marginPct, 0)}</span>
      <span title="Доля выпечки, ушедшая в списание, и сумма в месяц">списано ${pc(x.wastePct)} · ${money(x.waste)}</span>
      ${x.est ? '<span class="ms-est">оценка</span>' : `<span class="ms-dyn">${spark(x.spark, 54, 16)}${trend(x)}</span>`}${fl}</div>`;
  }

  /* ---------- окно шеф-пекаря ---------- */
  function chefHtml(S, pick, drop) {
    const cfg = C(), s = sum(S), pl = S.macro.priceLevel;
    const after = S.menu.length - drop.size + pick.size;
    const maxShare = Math.max(0.01, ...s.rows.map((r) => r.share));
    let html = `<div class="modal-h"><span class="eyebrow">Шеф-пекарь · новинки ${E().dateOf(S.day).y}</span><h2>Что добавим в меню?</h2></div><div class="modal-b">
      <p class="hint" style="margin:0">Выберите до ${cfg.CHEF_PICK} новинок и выведите до ${cfg.CHEF_REMOVE} старых позиций. Цену шеф предлагает сам — изменить её можно во вкладке «Меню».</p>
      ${s.hasData ? '' : `<div class="ms-note">Копим статистику: продажи по продуктам записываются с этой версии игры. Пока цифры ниже — <b>оценка</b> по модели спроса; факт появится после первого полного месяца.</div>`}
      <h3 class="ms-h">Новинки шефа <span class="ms-est">оценка</span></h3>
      <p class="hint ms-sub">В месяц, если добавить одну эту новинку к нынешнему меню: сколько она продаст, её доля и маржа, и как изменится выручка всей сети (часть гостей просто переключится с других позиций).</p><div class="chefgrid">`;
    for (const id of S.chef.pending) {
      const p = E().byId(BK.PRODUCTS, id), ok = E().eqUnlocked(S, p.req);
      const reqName = p.req ? (E().byId(BK.EQUIPMENT, p.req) || {}).name : '';
      const c = PS().candidate(S, id, s);
      html += `<label class="chefitem ms-new ${pick.has(id) ? 'on' : ''} ${ok ? '' : 'locked'}"><input type="checkbox" data-pick="${id}" ${pick.has(id) ? 'checked' : ''} ${ok ? '' : 'disabled'}><span class="cn">${esc(p.name)}</span><span class="chip cat" style="--cat:${cat(p).color}">${cat(p).name}</span>
        <span class="cm"><span>цена ${n0(p.price * pl)} ₽</span><span>фудкост ${H().pct(p.fc)}</span><span>тренд ${Math.round(S.trends[p.cat])}</span><span>популярность ${p.pop}</span>${ok ? '' : `<span class="negc">нужно: ${esc(reqName)}</span>`}</span>
        <span class="ms-grid">
          <span class="ms-k"><span class="l">Продажи</span><span class="v">≈ ${n0(c.units)} шт.</span></span>
          <span class="ms-k"><span class="l">Выручка · доля</span><span class="v">≈ ${money(c.rev)} · ${pc(c.share)}</span></span>
          <span class="ms-k"><span class="l">Маржа</span><span class="v">≈ ${pc(c.marginPct, 0)} · ${money(c.margin)}</span></span>
          <span class="ms-k"><span class="l">Выручка сети</span><span class="v ${c.dRev >= 0 ? 'ms-pos' : 'ms-neg'}">${signMoney(c.dRev)}</span></span>
        </span></label>`;
    }
    html += `</div><h3 class="ms-h">Текущее меню <span class="ms-src${s.hasData ? '' : ' est'}">${source(s)}</span></h3>
      <p class="hint ms-sub">Отметьте, что вывести. Подсвечены кандидаты: малая доля выручки, много списаний, низкая маржа, падающая доля. Списания — доля выпечки, ушедшая в утиль, и её себестоимость; маржа — выручка минус себестоимость и списания.${s.base ? ` Списания по всем позициям в сумме — <b>${money(s.base.waste)}</b> в месяц: та же строка «Списания», что в отчёте месяца.` : ''} «Если вывести» — оценка: часть гостей купит другое, но меню станет уже.</p><div class="chefgrid">`;
    for (const x of s.rows) {
      const it = S.menu.find((m) => m.id === x.id), p = x.p, rm = PS().removal(S, x.id, s), est = x.est ? '≈ ' : '';
      const flags = x.flags.map((f) => `<span class="ms-flag">${f.t}</span>`).join('');
      html += `<label class="chefitem ms-cur ${drop.has(x.id) ? 'off' : ''} ${x.candidate ? 'cand' : ''}"><input type="checkbox" data-drop="${x.id}" ${drop.has(x.id) ? 'checked' : ''}><span class="cn">${esc(p.name)}</span><span class="chip cat" style="--cat:${cat(p).color}">${cat(p).name}</span>
        <span class="cm"><span>цена ${n0(p.price * pl * it.pm)} ₽</span><span>фудкост ${H().pct(p.fc / it.pm)}</span><span>тренд ${Math.round(S.trends[p.cat])}</span>${x.candidate ? '<span class="ms-flag cand">кандидат на вывод</span>' : ''}${flags}</span>
        <span class="ms-grid five">
          <span class="ms-k" title="Продано штук в месяц"><span class="l">Продано</span><span class="v">${est}${n0(x.units)} шт.</span></span>
          <span class="ms-k" title="Выручка продукта в месяц и доля от выручки всех продуктов"><span class="l">Выручка · доля</span><span class="v">${est}${money(x.rev)} · ${pc(x.share)}</span>${bar(x.share, maxShare)}</span>
          <span class="ms-k" title="Доля выпечки, ушедшая в списание, и её себестоимость в месяц"><span class="l">Списания</span><span class="v${x.flags.some((f) => f.k === 'waste') ? ' warnv' : ''}">${pc(x.wastePct)} · ${money(x.waste)}</span></span>
          <span class="ms-k" title="Выручка минус себестоимость и списания, в месяц"><span class="l">Маржа</span><span class="v${x.flags.some((f) => f.k === 'margin') ? ' warnv' : ''}">${pc(x.marginPct, 0)} · ${money(x.margin)}</span></span>
          <span class="ms-k"><span class="l">Динамика</span><span class="v ms-dyn">${x.est ? '<span class="ms-est">оценка</span>' : spark(x.spark, 58, 18) + trend(x)}</span></span>
        </span>
        <span class="ms-if">Если вывести: выручка сети <b class="${rm.dRev >= 0 ? 'ms-pos' : 'ms-neg'}">${signMoney(rm.dRev)}</b> в месяц, маржа продуктов <b class="${rm.dMargin >= 0 ? 'ms-pos' : 'ms-neg'}">${signMoney(rm.dMargin)}</b> (оценка)</span></label>`;
    }
    // итог выбора
    let foot = '';
    if (pick.size || drop.size) {
      const menu = S.menu.filter((m) => !drop.has(m.id)).concat([...pick].map((id) => ({ id, pm: 1 })));
      const e = PS().estimate(S, menu, s), b = s.base, m0 = b.rev - b.fc - b.waste;
      foot = `<div class="ms-sum"><span class="ms-est">оценка</span> После изменений: выручка сети <b class="${e.dRev >= 0 ? 'ms-pos' : 'ms-neg'}">${signMoney(e.dRev)}</b> в месяц (${e.kRev >= 1 ? '+' : '−'}${pc(Math.abs(e.kRev - 1))}), маржа продуктов <b class="${e.margin - m0 >= 0 ? 'ms-pos' : 'ms-neg'}">${signMoney(e.margin - m0)}</b>, списания ${pc(e.wastePct)} выпечки, привлекательность меню ${e.appeal0.toFixed(2).replace('.', ',')} → ${e.appeal1.toFixed(2).replace('.', ',')}</div>`;
    }
    html += `</div></div><div class="modal-f">${foot}<div class="row sp"><span class="hint">В меню станет ${H().nw(after, 'позиция', 'позиции', 'позиций')} (от ${cfg.MENU_MIN} до ${cfg.MENU_MAX})</span><button class="btn primary" id="chefOk" ${after < cfg.MENU_MIN || after > cfg.MENU_MAX ? 'disabled' : ''}>Утвердить меню</button></div></div>`;
    return html;
  }

  BK.MenuStats = { sum, chefHtml, menuHead, menuRow };
})();
