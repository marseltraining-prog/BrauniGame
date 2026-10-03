/* =====================================================================
   ЧТО ГОВОРЯТ ГОСТИ (vision-plan §4 п. 2, этап В2 «Живость»).
   Чистая логика, без DOM. Каждый день собирает «мысли» гостей по всем открытым точкам
   (очередь, дорого, пустая витрина, вкусно, свежее, сонные продавцы, заказы ждут)
   и раз в неделю подводит итог: три главные мысли сети за неделю + что с этим делать.

   Состояние (маленькое — в сохранении только счётчики):
     S.thoughts = { v: 1, day: 0, wk: { k: { n, w } }, acc: { k: { n, w } } }
     n — сколько раз замечено (в точко-днях), w — вес по выручке точек (крупные точки влияют сильнее).

   Цифры — CFG.THOUGHTS. Блоками в «Сводке» занимается src/ui/lively-ui.js (BK.LivelyUI).
   Движок не менялся: обёртка `BK.Engine.tick`, случайных чисел не тратит (мысли — только чтение состояния).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, K = () => BK.CFG.THOUGHTS;
  const open = (S) => (S.stores || []).filter((st) => st.status !== 'opening');

  /* ---------------- список мыслей: как узнать и что советовать ---------------- */
  const KINDS = {
    queue: { tone: 'bad', t: 'очередь в час пик', d: 'Гостей больше, чем успевает команда: часть уходит, не дождавшись.', todo: 'Добавить человека за стойку или сдвинуть часы', act: 'stores', label: 'Точки' },
    price: { tone: 'bad', t: 'дороговато', d: 'Цены выше того, что район считает справедливым.', todo: 'Проверить цены и набор в «Меню»', act: 'menu', label: 'Меню' },
    empty: { tone: 'bad', t: 'пустая витрина', d: 'К вечеру выпечка кончается — гости уходят с пустыми руками.', todo: 'Печь больше или включить вечернюю скидку', act: 'prod', label: 'Цех' },
    tired: { tone: 'bad', t: 'продавцы сонные', d: 'Команда устала: сервис проседает, гости это замечают.', todo: 'Дать выходной, добавить людей или поднять зарплату', act: 'team', label: 'Команда' },
    slow: { tone: 'bad', t: 'заказы ждут', d: 'Доставка занимает команду, зал стоит в очереди.', todo: 'Разгрузить доставку или усилить смену', act: 'stores', label: 'Точки' },
    tasty: { tone: 'good', t: 'вкусно!', d: 'Высокий рейтинг на картах — гости хвалят выпечку.', todo: 'Держать уровень и собирать отзывы', act: 'stores', label: 'Точки' },
    fresh: { tone: 'good', t: 'свежая выпечка', d: 'Утренний хлеб свежий, гости приходят к открытию.', todo: 'Не ломать график печи', act: 'prod', label: 'Цех' },
  };
  const ORDER = ['queue', 'price', 'empty', 'tired', 'slow', 'tasty', 'fresh'];

  /* ---------------- состояние ---------------- */
  // дозаполняем поля на месте (не заменяем объект: ссылка на состояние не должна «стареть»)
  function ensure(S) {
    if (!S) return null;
    const T = S.thoughts || (S.thoughts = {});
    if (T.v == null) T.v = 1;
    if (typeof T.day !== 'number') T.day = 0;
    if (!T.wk || typeof T.wk !== 'object') T.wk = {};
    if (!T.acc || typeof T.acc !== 'object') T.acc = {};
    return T;
  }

  /* ---------------- что думает одна точка сегодня ---------------- */
  // Общие для всех точек числа дня считаем один раз (день идёт по 60 точкам — важно не гонять menuStats в цикле).
  function dayFactors(S) {
    const e = E();
    let priceIdx = 1; try { priceIdx = e.menuStats(S).priceIdx; } catch (er) {}
    let bake = 0; try { bake = (e.wasteState ? e.wasteState(S) : {}).bake || 0; } catch (er) {}
    return { priceIdx, bake };
  }
  // Возвращает список видов мыслей (по одному разу) — по состоянию точки «сегодня». F — dayFactors(S).
  function ofStore(S, st, F) {
    const out = [];
    if (!st || st.status === 'opening' || st.status === 'repair') return out;
    const t = st.today || {}; if (t.closed) return out;
    const e = E(), f = F || dayFactors(S);
    const load = t.load || 0;
    if (load > 1.02) out.push('queue');
    if (load > 1.05 && st.agg && t.agg) out.push('slow');
    if (f.priceIdx > 1.12) out.push('price');
    // витрина: «печём мало» (bake < 0), а гости всё равно идут
    if (f.bake < 0 && load > 0.85) out.push('empty');
    let parts = null; try { parts = e.ratingParts(S, st); } catch (er) {}
    let rt = 4; try { rt = e.storeRating(S, st); } catch (er) {}
    if (rt >= 4.35) out.push('tasty');
    if (parts && parts.fresh >= 4.4) out.push('fresh');
    let fat = 0; for (const x of st.staff) fat += x.fatigue; fat = st.staff.length ? fat / st.staff.length : 0;
    if (fat > 60) out.push('tired');
    return out;
  }

  /* ---------------- день и неделя ---------------- */
  function day(S) {
    const T = ensure(S); if (!T) return;
    const list = open(S); if (!list.length) return;
    const F = dayFactors(S); // общие числа дня — один раз на весь день
    for (const st of list) {
      const w = Math.max(1, ((st.m && st.m.rev) || 0) / 30.4); // вес точки — её дневная выручка
      for (const k of ofStore(S, st, F)) {
        const a = T.acc[k] || (T.acc[k] = { n: 0, w: 0 });
        a.n += 1; a.w += w;
      }
    }
    T.day = (T.day || 0) + 1;
    if (T.day >= K().WEEK) { T.wk = T.acc; T.acc = {}; T.day = 0; T.at = S.day; }
    // страховка от разрастания (мыслей всего 7 видов, но старое сохранение могло накопить лишнее)
    for (const k in T.wk) if (!KINDS[k]) delete T.wk[k];
    for (const k in T.acc) if (!KINDS[k]) delete T.acc[k];
  }

  /* ---------------- итог недели для интерфейса ---------------- */
  function week(S, max) {
    const T = ensure(S);
    const src = (T.day > 0 && Object.keys(T.wk).length < 3) ? Object.assign({}, T.wk, T.acc) : T.wk; // первая неделя — показываем, что есть
    const rows = ORDER.filter((k) => src[k] && src[k].n > 0).map((k) => {
      const a = src[k], d = KINDS[k];
      return { k, tone: d.tone, t: d.t, d: d.d, todo: d.todo, act: d.act, label: d.label, n: Math.max(1, Math.round(a.n / K().WEEK)), w: a.w, share: 0 };
    });
    const totalW = rows.reduce((s, r) => s + r.w, 0) || 1;
    for (const r of rows) r.share = r.w / totalW;
    // три главные: сначала плохие с большим весом, потом хорошие (их приятно видеть)
    const bad = rows.filter((r) => r.tone === 'bad').sort((a, b) => b.w - a.w);
    const good = rows.filter((r) => r.tone === 'good').sort((a, b) => b.w - a.w);
    const out = bad.concat(good).slice(0, max || K().SHOW);
    // «очередь» и «заказы ждут» — про одно и то же, второе оставляем только если первое не попало
    if (out.some((r) => r.k === 'queue') && out.some((r) => r.k === 'slow')) {
      const i = out.findIndex((r) => r.k === 'slow'); if (i >= 0) out.splice(i, 1);
    }
    return out;
  }
  // готов ли итог: до первой недели — «копим»
  function ready(S) { const T = ensure(S); return !!(T && Object.keys(T.wk).length); }
  function days(S) { const T = ensure(S); return T ? T.day : 0; }
  function clear(S) { const T = ensure(S); T.wk = {}; T.acc = {}; T.day = 0; return T; }

  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__thoughts) return;
    Eng.__thoughts = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* мысли не должны ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Thoughts = { ensure, ofStore, dayFactors, week, ready, days, clear, KINDS };
})();
