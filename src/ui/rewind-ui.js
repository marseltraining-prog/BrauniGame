/* «Переиграть» — интерфейс (логика и хранилище — src/rewind.js, BK.Rewind).
   Блок в «Меню игры» (выбор месяца со снимками: дата, счёт, точки) и на итоговом экране банкротства («Переиграть с …»),
   подтверждение с понятным текстом, после отката — тост «Вернулись в март 2031» и пауза.
   Связь с ядром — через BK.App (continueGame(st, true) — без миграции, save, toast, setSpeed). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, RW = () => BK.Rewind, APP = () => BK.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fm = (v) => BK.fmtMoney(v);
  const DIFF = { easy: 'Лёгкий', normal: 'Нормальный', hard: 'Хардкор' };
  const monthsW = (n) => `${n} ${n === 1 ? 'месяц' : n < 5 ? 'месяца' : 'месяцев'}`;
  const monthOf = (day) => { const t = E().dateOf(day); return `${E().MONTHS[t.m]} ${t.y}`; };
  const cityName = (id) => (id && BK.CITY_BY_ID && BK.CITY_BY_ID[id] ? BK.CITY_BY_ID[id].name : '');
  function nextFirst(S) { let d = S.day + 1; while (E().dateOf(d).d !== 1) d++; return d; }
  const snapMeta = (x) => {
    const i = x.info || {}, p = [`счёт ${fm(i.cash)}`, `${i.stores} ${BK.UIH ? BK.UIH.plural(i.stores, 'точка', 'точки', 'точек') : 'точек'}`];
    if (i.reserve) p.push(`резерв ${fm(i.reserve)}`);
    if (i.loan) p.push(`кредит ${fm(i.loan)}`);
    if (i.city) p.push(cityName(i.city));
    return p.join(' · ');
  };

  // пояснения о хранилище (честно: что будет после перезагрузки)
  function storeNote(S) {
    const st = RW().status(S);
    if (!st.total) return '';
    if (!st.storage || st.storeOk === false) return '<p class="hint rwnote">Браузер не дал сохранить снимки (мало места или приватный режим) — они живут, пока открыта эта вкладка. После перезагрузки вернуться назад будет нельзя.</p>';
    if (st.persisted < st.total) return `<p class="hint rwnote">В браузере хранятся ${st.persisted ? 'последние ' + st.persisted : 'не все'} снимки из ${st.total} (не хватает места) — остальные пропадут после перезагрузки страницы.</p>`;
    return '';
  }
  function emptyText(S) {
    const st = RW().status(S);
    const next = `Снимок игры делается 1-го числа каждого месяца — следующий будет ${E().fmtDate(nextFirst(S))}.`;
    if (st.reloadEmpty) return `После перезагрузки снимков не нашлось: браузер их не сохранил (мало места или приватный режим). ${next}`;
    return next;
  }
  function listHtml(S, L, sel, lost) {
    return `<div class="rwlist" role="radiogroup" aria-label="На сколько месяцев вернуться">${L.map((x) => `<label class="rwopt"><input type="radio" name="rwpick" value="${x.day}"${x.day === sel ? ' checked' : ''}><span class="rwt"><b>${lost ? 'С ' + E().fmtDate(x.day) : `${x.months} мес. назад`}</b><span class="rwd">${lost ? `${x.months} мес. назад` : E().fmtDate(x.day)}</span></span><span class="rwi">${esc(snapMeta(x))}</span></label>`).join('')}</div>`;
  }
  const goLabel = (x, lost) => (lost ? `Переиграть с ${E().fmtDate(x.day)}` : `Переиграть: вернуться на ${x.months} мес. назад`);

  // блок «Переиграть» — в «Меню игры» (lost: false) и на итоговом экране банкротства (lost: true)
  function blockHtml(S, lost) {
    if (!RW() || !S) return '';
    const mx = RW().max(S), d = S.difficulty || 'normal';
    const head = `<div class="rwh"><b>Переиграть</b><span class="rwlim">${mx ? `до ${monthsW(mx)} назад · «${DIFF[d] || d}»` : '«Хардкор»'}</span></div>`;
    if (!mx) return `<div class="rwbox hard" id="rwBox">${head}<p class="hint">На уровне «Хардкор» вернуться назад нельзя — каждое решение окончательное. На «Нормальном» можно переиграть до 3 месяцев, на «Лёгком» — до 6.</p></div>`;
    const L = RW().list(S);
    if (!L.length) return `<div class="rwbox" id="rwBox">${head}<p class="hint">${lost ? 'Вернуться не к чему: снимков этой игры нет. ' : ''}${esc(emptyText(S))}</p></div>`;
    const sel = L[0].day;
    return `<div class="rwbox${lost ? ' lost' : ''}" id="rwBox">${head}<p class="hint rwlead">${lost ? 'Вернитесь к началу одного из прошлых месяцев и сыграйте иначе.' : 'Вернитесь к 1-му числу одного из прошлых месяцев и сыграйте иначе.'}</p>${listHtml(S, L, sel, lost)}
      <button class="btn${lost ? ' primary' : ''} block rwgo" type="button" id="rwGo">${esc(goLabel(L[0], lost))}</button><div id="rwAsk"></div>${storeNote(S)}</div>`;
  }
  function bind(root, lost) {
    const box = $('#rwBox', root); if (!box) return;
    const S = APP().state;
    const pick = () => { const r = $('input[name=rwpick]:checked', box); return r ? RW().list(S).find((x) => x.day === +r.value) : null; };
    box.addEventListener('change', (e) => {
      if (e.target.name !== 'rwpick') return;
      const x = pick(); if (x) $('#rwGo', box).textContent = goLabel(x, lost);
      $('#rwAsk', box).innerHTML = '';
    });
    const go = $('#rwGo', box); if (!go) return;
    go.addEventListener('click', () => {
      const x = pick(); if (!x) return;
      const days = S.day - x.day;
      $('#rwAsk', box).innerHTML = `<div class="confirm rwconfirm" role="alertdialog" aria-label="Подтверждение"><span>Вернуться к <b>${E().fmtDate(x.day)}</b>? Всё, что было после (${days} ${BK.UIH ? BK.UIH.plural(days, 'день', 'дня', 'дней') : 'дн.'}: деньги, решения, точки, полученные достижения), отменится.${lost ? ' Банкротство тоже.' : ''} Переигровка отметится в журнале и итогах игры.</span>
        <span class="rwcb"><button class="btn sm danger" type="button" id="rwYes">Да, вернуться</button><button class="btn sm" type="button" id="rwNo">Отмена</button></span></div>`;
      $('#rwNo', box).addEventListener('click', () => { $('#rwAsk', box).innerHTML = ''; go.focus(); });
      $('#rwYes', box).addEventListener('click', () => apply(x.day));
      $('#rwYes', box).focus();
    });
  }
  function apply(day) {
    const S = APP().state; if (!S) return;
    const N = RW().restore(S, day);
    if (!N) { APP().toast('Не получилось', 'Этого снимка больше нет.', 'warn'); return; }
    APP().continueGame(N, true);
    APP().setSpeed(0);
    APP().save();
    APP().toast(`Вернулись в ${monthOf(day)}`, `${E().fmtDate(day)} · счёт ${fm(N.cash)}. Игра на паузе — сыграйте иначе.`, 'good');
  }

  BK.RewindUI = { blockHtml, bind, apply };
})();
