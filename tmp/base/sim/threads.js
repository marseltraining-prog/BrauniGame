/* Нити истории (docs/story-v2.md §«Как это устроить технически», часть 1): реестр людей,
   отложенные последствия и влияние на срок открытия точки в городе — механика и баланс.

     node sim/threads.js                 — механика: реестр, сроки, «Требует внимания», летопись, старые сохранения
     node sim/threads.js good 6 22       — баланс: бот good с демо-нитью (обиженный инспектор) против обычного

   Нити в прогонах ботов по умолчанию не грузятся (sim/load.js подключает модуль только при BK_THREADS=1) —
   канонический `good 3 18 --summary` остаётся 3/3, медиана 14,9. Здесь модуль включается сам. */
process.env.BK_THREADS = process.env.BK_THREADS || '1';
const BK = require('./load');
const E = BK.Engine, CFG = BK.CFG, T = BK.Threads;

let bad = 0;
const ok = (cond, what, extra) => { if (!cond) { bad++; console.log('  ✗ ' + what + (extra ? ' — ' + extra : '')); } else console.log('  ✓ ' + what + (extra ? ' — ' + extra : '')); };
const f1 = (v) => Math.round(v / 1e6);
const { play } = require('./bot');
function fresh(years, seed, level) {
  const r = play({ level: level || 'good', seed: seed || 7919, years: years || 12 });
  const S = r.S; S.phase = 'play';
  return S;
}

/* ---------- 1. реестр ---------- */
function registry() {
  console.log('\n# Реестр нитей');
  const S = fresh(3);
  delete S.threads;
  let err = null;
  try { T.attItems(S); T.list(S); T.openGap(S, 'kazan'); T.due(S); T.fire(S); T.summary(S); } catch (e) { err = e.message; }
  ok(!err, 'без S.threads модуль не падает', err || 'ок');
  ok(!S.threads, 'S.threads не создаётся сам (старые сохранения и боты не меняются)');

  const t = T.add(S, { who: 'Рустам Ахметов', role: 'пожарный инспектор', kind: 'grudge', text: 'он этого не забыл', city: 'kazan', after: 400, effect: { openK: 2.4, days: 540, text: 'тянет с разрешениями' } });
  ok(!!t && t.id === 'th1', 'нить записана с id', t && t.id);
  ok(t.from === S.day && t.due === S.day + 400, 'from = день записи, due = from + срок', `${t.from} → ${t.due}`);
  ok(t.kind === 'grudge' && !t.done && t.effect.openK === 2.4, 'поля записи на месте (кто, что помнит, чем грозит)');
  ok(T.list(S).length === 1 && T.waiting(S).length === 1 && T.due(S).length === 0, 'list / waiting / due');
  ok(T.openGap(S, 'kazan') === 1 && T.openGap(S, 'samara') === 1, 'пока не отозвалось — механика не меняется');
  const att0 = T.attItems(S);
  ok(att0.length === 1 && /Вас помнит/.test(att0[0].t) && att0[0].b.label === 'Подробнее', 'строка в «Требует внимания» с кнопкой', att0[0] && att0[0].t);
  const li = BK.Engine._int ? S.log.find((x) => /Вас помнит/.test(x.text)) : null;
  ok(!!li, 'запись в журнале', li && li.text.slice(0, 60));

  S.day = t.due;                       // срок вышел
  ok(T.due(S).length === 1, 'due() видит созревшую нить');
  const fired = T.fire(S);
  ok(fired.length === 1 && t.done && t.until === S.day + 540, 'fire(): нить отозвалась, срок последствия записан', `до ${t.until}`);
  ok(Math.abs(T.openGap(S, 'kazan') - 2.4) < 1e-9, 'множитель срока открытия в этом городе — 2,4', String(T.openGap(S, 'kazan')));
  ok(T.openGap(S, 'samara') === 1, 'в чужом городе ничего не меняется');
  ok(T.active(S).length === 1 && T.past(S).length === 0, 'active() — «помнят сейчас»');
  const att1 = T.attItems(S);
  ok(att1.length === 1 && /открытие точек дольше/.test(att1[0].d), 'игрок видит, чем это грозит', att1[0] && att1[0].d);
  S.day = t.until + 1;
  ok(T.openGap(S, 'kazan') === 1 && T.active(S).length === 0 && T.past(S).length === 1, 'срок вышел — множитель снят, нить в «уже отозвалось»');

  // clear: помирились
  const t2 = T.add(S, { who: 'Азамат', kind: 'favor', city: 'kazan', due: S.day, effect: { openK: 0.8, days: 365 } });
  T.fire(S);
  ok(T.openGap(S, 'kazan') < 1, 'благодарность ускоряет открытие', String(T.openGap(S, 'kazan')));
  T.clear(S, t2.id);
  ok(T.list(S).length === 1 && T.openGap(S, 'kazan') === 1, 'clear() закрывает нить и снимает поправку');

  const t3 = T.add(S, { kind: 'promise', text: 'вернусь с деньгами', due: S.day, effect: { fx: [{ t: 'cash', v: 2e6 }] } });
  const cash0 = S.cash;
  T.fire(S);
  ok(S.cash > cash0, 'обычные эффекты игры применяются движком (деньги)', `+${f1(S.cash - cash0)} млн`);
  ok(t3.done && t3.until == null, 'нить без срока — одноразовая');

  // летопись и итоги игры
  const S2 = fresh(12); S2.day = S2.day; // с сюжетом (S.story есть у игрока, здесь создаём вручную)
  if (!S2.story) S2.story = BK.Story.defaults(S2.seed || 1);
  const tt = T.add(S2, Object.assign({}, T.TEMPLATES.inspector, { city: 'kazan', due: S2.day }));
  T.fire(S2);
  const log = (S2.story.log || []).filter((x) => /Вас помнит/.test(x.title || ''));
  ok(log.length >= 2, 'записи в летописи (S.story.log) — и «помнит», и «отозвалось»', log.map((x) => x.title).join(' / '));
  ok(/дольше на 29 дней \(50 вместо 21\)/.test(log.map((x) => x.choice).join(' ')), 'в летописи видно цену последствия: «50 вместо 21»', (log[1] || {}).choice);
  ok(!!(BK.Story.history(S2).list || []).find((x) => /th_/.test(x.id)), 'летопись подхватывает записи нитей (раздел «История» в итогах)');
  ok(tt.done, 'шаблон владельца работает через spawn');
}

/* ---------- 2. механика: срок открытия точки в городе ---------- */
function mechanic() {
  console.log('\n# Срок открытия точки в городе');
  const base = T.base();
  console.log(`  базовый срок OPEN_DAYS — ${base} дн.`);
  const S = fresh(12);
  ok(!!S.corp, 'второй акт открыт (год ' + (S.corp ? (S.corp.unlockedDay / 365).toFixed(1) : '—') + ')');
  if (!S.corp) return;
  const r = E.enterCity(S, 'kazan');
  ok(r.ok, 'вошли в Казань', r.msg || `${f1(r.cost)} млн`);
  const po = S.prodOffers.slice().sort((a, b) => E.prodOpenCost(S, a).total - E.prodOpenCost(S, b).total)[0];
  E.chooseProduction(S, po.id);
  ok(S.offers.length > 0, 'есть помещения под точки', `${S.offers.length}`);

  const r1 = E.rentStore(S, S.offers[0].id);
  ok(r1.ok, 'первая точка арендована');
  const st1 = r1.store;
  ok(st1.openDay - S.day === base, `без нити точка открывается через базовый срок`, `${st1.openDay - S.day} дн.`);

  // нить: обиженный завсегдатай стал инспектором именно в этом городе
  T.demo = false;
  const t = T.spawn(S, 'inspector', { city: 'kazan' });
  S.day = t.due;
  T.fire(S);
  const gap = T.openGap(S, 'kazan'), days = T.openDays(S, 'kazan');
  ok(Math.abs(gap - 2.4) < 1e-9, 'множитель срока в Казани', `× ${gap.toFixed(2)}`);
  ok(days === 50 && days - base === 29, 'инспектор даёт +29 дней: открытие 50 дней вместо 21', `${days} вместо ${base}`);
  const r2 = E.rentStore(S, S.offers[0].id);
  ok(r2.ok, 'вторая точка арендована');
  ok(r2.store.openDay - S.day === days, 'движок взял срок из CFG.OPEN_DAYS с поправкой нити', `${r2.store.openDay - S.day} дн.`);
  ok(E.fmtDate(st1.openDay) !== E.fmtDate(r2.store.openDay), 'даты открытия действительно разные', `${E.fmtDate(st1.openDay)} и ${E.fmtDate(r2.store.openDay)}`);

  // аренда сразу после загрузки сохранения, без единого дня игры: обёртка BK.Engine.rentStore держит срок актуальным
  {
    const S4 = JSON.parse(JSON.stringify(Object.assign({}, S, { cache: null }))); S4.cache = null;
    BK.Corp.ensure(S4); CFG.OPEN_DAYS = T.base();                 // как в свежем процессе
    const r4 = E.rentStore(S4, S4.offers[0].id);
    ok(r4.ok && r4.store.openDay - S4.day === days, 'сразу после загрузки срок тот же (50 дн.), без тика', r4.ok ? `${r4.store.openDay - S4.day} дн.` : r4.msg);
  }

  // возврат в Уфу: поправка не должна тянуться за игроком
  E.switchCity(S, 'ufa');
  const r3 = S.offers.length ? E.rentStore(S, S.offers[0].id) : null;
  ok(CFG.OPEN_DAYS === base, 'в Уфе срок открытия снова базовый', `${CFG.OPEN_DAYS} дн.`);
  if (r3 && r3.ok) ok(r3.store.openDay - S.day === base, 'точка в Уфе открывается за базовый срок', `${r3.store.openDay - S.day} дн.`);

  // срок нити вышел — срок открытия вернулся
  E.switchCity(S, 'kazan');
  S.day = t.until + 1;
  T.refresh(S);
  ok(CFG.OPEN_DAYS === base, 'срок инспектора вышел — открытие снова 21 день', `${CFG.OPEN_DAYS} дн.`);

  // первый акт (Уфа, без второго): нить из пролога тоже затягивает открытие
  const S1 = fresh(2);
  ok(!S1.corp, 'первый акт: второго акта ещё нет');
  const tg = T.add(S1, { who: 'Сосед', role: 'из пожарной части', kind: 'grudge', city: 'ufa', due: S1.day, effect: { openK: 2 } });
  T.fire(S1); T.refresh(S1);
  ok(CFG.OPEN_DAYS === base * 2, 'в первом акте нить про Уфу тоже удваивает срок', `${CFG.OPEN_DAYS} дн.`);
  T.clear(S1, tg.id); T.refresh(S1);
  ok(CFG.OPEN_DAYS === base, 'нить закрыта — срок вернулся к базовому', `${CFG.OPEN_DAYS} дн.`);

  // город под директором (упакованный, «смонтирован» через BK.Corp.withCity): срок тоже с поправкой
  const S5 = fresh(12);
  const cand = S5.corp && S5.corp.dirCand ? S5.corp.dirCand[0] : null;
  if (cand) {
    T.demo = false;
    const t5 = T.add(S5, Object.assign({}, T.TEMPLATES.inspector, { city: 'samara', due: S5.day })); T.fire(S5);
    ok(T.openGap(S5, 'samara') === 2.4, 'нить про Самару действует', `× ${T.openGap(S5, 'samara')}`);
    E.dirHire(S5, cand.id);
    const r5 = E.enterCity(S5, 'samara', { director: cand.id });
    const pk = S5.corp.cities.samara && S5.corp.cities.samara.packed;
    const d5 = pk && pk.stores.length ? pk.stores[0].openDay - S5.day : 0;
    ok(r5.ok && d5 === 50, 'город запускает директор: точки откроются через 50 дней', `${d5} дн. (цех ${pk && pk.productions[0] ? pk.productions[0].openDay - S5.day : '—'})`);
    ok(CFG.OPEN_DAYS === base && S5.corp.active === 'ufa', 'после запуска чужая поправка не осталась в активном городе', `${CFG.OPEN_DAYS} дн.`);
    void t5;
  }
}

/* ---------- 3. демо-нить владельца и «Требует внимания» ---------- */
function demoCase() {
  console.log('\n# Пример владельца: обиженный завсегдатай → инспектор');
  T.demo = true;
  const S = fresh(12);
  if (!S.corp) { console.log('  (нет второго акта — пропуск)'); return; }
  ok(T.demo === true, 'демо-нить включена (её снимут, когда нити пойдут из пролога)');
  const r = E.enterCity(S, 'kazan');
  ok(r.ok, 'вошли в Казань', r.msg || `${f1(r.cost)} млн`);
  T.day(S);                                   // тот же шаг, что делает обёртка BK.Engine.tick после дня
  const th = T.list(S).find((x) => x.src === 'inspector');
  ok(!!th, 'нить появилась сама при входе в новый город', th && `${th.who}, ${th.role}`);
  if (!th) return;
  ok(th.city === 'kazan' && th.due > S.day, 'город записан, последствие отложено', `через ${th.due - S.day} дн.`);
  const att = T.attItems(S);
  console.log('  игрок видит в «Требует внимания»:');
  for (const a of att) console.log(`    • ${a.t} [${a.lvl}] — ${a.d} → кнопка «${a.b.label}»`);
  ok(att.length > 0 && /Вас помнит пожарный инспектор/.test(att.map((x) => x.t).join(' ')), 'строка про инспектора видна заранее');
  S.day = th.due; T.day(S);
  const att2 = T.attItems(S);
  console.log('  когда нить отозвалась:');
  for (const a of att2) console.log(`    • ${a.t} [${a.lvl}] — ${a.d}`);
  ok(th.done && /открытие точек дольше на 29 дней \(50 вместо 21\)/.test(att2.map((x) => x.d).join(' ')), 'игрок видит точную цену: 50 дней вместо 21');
}

/* ---------- 4. сохранение и окно реестра ---------- */
function uiAndSave() {
  console.log('\n# Сохранение и окно «Вас помнят»');
  const S = fresh(12);
  if (!S.corp) { console.log('  (нет второго акта — пропуск)'); return; }
  const r = E.enterCity(S, 'kazan');
  if (!r.ok) { console.log('  (не удалось войти в город — пропуск)'); return; }
  T.demo = true; T.day(S);
  const th = T.list(S).find((x) => x.src === 'inspector');
  S.day = th.due; T.day(S);
  T.add(S, { who: 'Азамат Хайруллин', role: 'поставщик муки', kind: 'favor', city: 'kazan', after: 120, effect: { openK: 0.8, days: 365, text: 'ускоряет приёмку' } });
  T.add(S, { who: 'Марат', kind: 'promise', text: 'вернусь с деньгами', after: 30, effect: { fx: [{ t: 'cash', v: 1e6 }], text: 'вернул долг' } });
  S.day += 60; T.day(S);   // обещание отозвалось и прошло (без срока) — попадает в «Уже отозвалось»

  // сохранение: JSON-круг, как у слотов (S.cache в сохранение не идёт)
  const raw = JSON.stringify(Object.assign({}, S, { cache: null }));
  const S2 = JSON.parse(raw); S2.cache = null;
  BK.Corp.ensure(S2);
  let err = null;
  try { T.ensure(S2); T.attItems(S2); T.refresh(S2); } catch (e) { err = e.message; }
  ok(!err, 'сохранение с нитями загружается без ошибок', err || 'ок');
  ok(Math.abs(T.openGap(S2, 'kazan') - 2.4) < 1e-9 && S2.threads.list.length === 3, 'нити и множитель пережили сохранение', `нитей ${S2.threads.list.length}`);

  // старое сохранение: поля S.threads нет
  const S3 = JSON.parse(raw); delete S3.threads;
  err = null;
  try { T.attItems(S3); T.list(S3); T.openGap(S3, 'kazan'); BK.Corp.ensure(S3); } catch (e) { err = e.message; }
  ok(!err && CFG.OPEN_DAYS === T.base(), 'старое сохранение без нитей — срок открытия базовый', err || `${CFG.OPEN_DAYS} дн.`);

  // окно реестра (модуль интерфейса без DOM отдаёт только разметку)
  try { require('../src/ui/threads-ui.js'); } catch (e) { /* останется null */ }
  const UI = BK.ThreadsUI;
  ok(!!UI, 'модуль интерфейса загружается');
  if (!UI) return;
  const block = UI.dashBlock(S), win = UI.windowHtml(S);
  const plain = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('  блок в «Сводке»: ' + plain(block).slice(0, 240));
  ok(/Вас помнят/.test(block) && /data-act="threads"/.test(block), 'блок в «Сводке» с кнопкой «Подробнее»');
  ok(/50 вместо 21/.test(plain(win)), 'в окне видно число: 50 дней вместо 21');
  ok(/Помнят сейчас/.test(win) && /Отзовётся/.test(win) && /Уже отозвалось/.test(win), 'в окне три раздела: помнят сейчас / отзовётся / уже отозвалось');
  console.log('  окно: ' + plain(win).slice(0, 400) + '…');
}

/* ---------- 5. баланс: корпоративный бот с нитями ---------- */
function balance(level, seeds, years) {
  console.log(`\n# Баланс: ${level} с нитями (--corp), ${seeds} сид(ов) × ${years} лет`);
  const rows = [];
  for (let s = 1; s <= seeds; s++) {
    const r = play({ level, seed: s * 7919, years, corp: true });
    const S = r.S, th = T.active(S);
    rows.push({ сид: s, 'год победы': r.won ? r.won.year : null, банкрот: r.lost ? +(S.day / 365).toFixed(1) : null, точек: S.stores.length,
      городов: S.corp ? Object.keys(S.corp.cities).length : 0, нитей: T.list(S).length, 'давит сейчас': th.length });
  }
  console.table(rows);
  const wins = rows.map((x) => x['год победы']).filter((x) => x != null).sort((a, b) => a - b);
  const med = wins.length ? wins[Math.floor(wins.length / 2)] : null;
  console.log(`побед ${wins.length}/${rows.length}, медиана года победы — ${med == null ? '—' : med}`);
  console.log('нити по умолчанию у ботов не грузятся: канонический good 3 18 --summary — 3/3, медиана 14,9');
}

const pos = process.argv.slice(2);
if (!pos.length) { registry(); mechanic(); demoCase(); uiAndSave(); }
else balance(pos[0] || 'good', +(pos[1] || 3), +(pos[2] || 32));

console.log(bad ? `\nПРОБЛЕМ: ${bad}` : '\nНити в порядке.');
process.exitCode = bad ? 1 : 0;
