/* В9: старт не с начала — «Сразу Россия» и «Сразу холдинг».
   Состояния — реальные партии сильного бота (src/data/startacts.js), сжатые LZ и вшитые в сборку.
   Модуль только читает срез, подставляет имя/сложность и собирает карточку «что было раньше». */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const D = () => BK.START_ACTS || {};
  function state(id) {
    const d = D()[id];
    if (!d) return null;
    return JSON.parse(d.data);
  }
  function info(id) { const d = D()[id]; return d ? { id, name: d.name, day: d.day, year: d.year, stores: d.stores, cash: d.cash, revenue12: d.revenue12 } : null; }
  const fm = (v) => BK.fmtMoney(Math.round(v));
  function recapHtml(id) {
    const d = D()[id]; if (!d) return '';
    const what = id === 'holding'
      ? 'Сеть уже выросла в холдинг: выберите путь — биржа, за рубеж или франшиза-империя.'
      : 'Сеть переросла город, Россия открыта: можно входить в новые города.';
    return `<h2>Что было раньше</h2>
      <p>Вы играете за сеть пекарен «${String(d.company || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}».</p>
      <p>К ${d.year}-му году в сети <b>${d.stores} точек</b>, на счету ${fm(d.cash)}, оборот за 12 месяцев — ${fm(d.revenue12)}.
      Первый акт пройден, история шла своим ходом: пропущенные развилки считаются средними, главные решения уже приняты.</p>
      <p>${what}</p><div class="modal-btns">${id === 'holding' ? '<button class="btn primary" data-act="holdChoose">Выбрать путь</button>' : '<button class="btn primary" data-act="closeModal">Дальше</button>'}</div>`;
  }
  function begin(id, APP) {
    if (id === 'coffee') { // своя кофейня без пролога: обычная новая игра, затем стадия 1
      if (!BK.Stage1 || !BK.Stage1UI) return { ok: false, msg: 'Кофейня недоступна' };
      APP.app.newGame(APP.companyName, APP.difficulty, { heroName: APP.heroName, heroG: APP.heroG });
      const S = APP.app.state;
      if (!S) return { ok: false, msg: 'Игра не создалась' };
      BK.Stage1.start(S);
      BK.Stage1UI.open();
      APP.app.save();
      return { ok: true };
    }
    const d = D()[id]; if (!d) return { ok: false, msg: 'Нет такого старта' };
    const S = state(id); if (!S) return { ok: false, msg: 'Стартовое состояние не прочиталось' };
    if (BK.Slots && BK.Slots.beforeNew && !BK.Slots.beforeNew()) return { ok: false, msg: 'Сначала закройте текущую игру' };
    S.company = APP.companyName || S.company;
    S.difficulty = APP.difficulty || S.difficulty;
    S.speed = 0;
    S.startAct = id === 'holding' ? 3 : 2;
    if (BK.Story && BK.Story.heroSet) BK.Story.heroSet(S, { name: APP.heroName || '', g: APP.heroG || 'm' });
    APP.app.continueGame(S);
    APP.app.ui.speed = 0;
    APP.app.save();
    APP.app.openModal(recapHtml(id), { closable: true });
    return { ok: true };
  }
  BK.StartActs = { has: (id) => !!D()[id], info, state, recapHtml, begin };
})();
