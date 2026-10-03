/* Общие куски интерфейса макетов: HUD и вкладки */
(function () {
  const tri = (n) => `<svg width="${6 + n * 6}" height="10" viewBox="0 0 ${6 + n * 6} 10">${Array.from({ length: n }, (_, i) => `<path d="M${i * 6 + 1},1 L${i * 6 + 7},5 L${i * 6 + 1},9Z" fill="currentColor"/>`).join('')}</svg>`;
  const speed = (on) => `<div class="speed">${[IC.pause.replace('<svg', '<svg width="12" height="12"'), tri(1), tri(2), tri(3)].map((s, i) => `<span class="${i === on ? 'on' : ''}">${s}</span>`).join('')}</div>`;
  const acc = [1.91, 2.02, 2.08, 2.16, 2.21, 2.33, 2.41, 2.47, 2.52, 2.61, 2.77, 2.84];
  const rev = [298, 305, 311, 322, 318, 330, 341, 352, 349, 362, 367, 381.5];
  window.HUD = function (o) {
    o = o || {};
    return `<header class="hud">
      <div class="brand"><div class="logo">${IC.loaf}</div><div><b>Пекарня «Каравай»</b><small>Хлебная карта Уфы</small></div></div>
      <div class="clock"><span class="date">14 марта 2039</span>${speed(o.speed == null ? 1 : o.speed)}</div>
      <div class="spacer"></div>
      <div class="metric"><span class="caps">Счёт</span><div class="row"><span class="v">2,84 млрд ₽</span>${MK.spark(acc, 40, 18)}</div><span class="delta up">▲ 2,6 % за мес.</span></div>
      <div class="metric"><span class="caps">Выручка, фев.</span><div class="row"><span class="v">381,5 млн ₽</span>${MK.spark(rev, 40, 18)}</div><span class="delta up">▲ 3,9 % к янв.</span></div>
      <div class="metric"><span class="caps">Резерв</span><div class="row"><span class="v">412 млн ₽</span></div><span class="delta muted">7,8 % годовых</span></div>
      <div class="metric"><span class="caps">Точки</span><div class="row"><span class="v">44</span><span class="moodbar" title="настроение сети"><i style="width:86%;background:var(--face-happy)"></i><i style="width:10%;background:var(--face-mid)"></i><i style="width:4%;background:var(--face-sad)"></i></span></div><span class="delta muted">86 % довольны</span></div>
      <div class="vsep"></div>
      <div class="metric goal"><div class="row"><span class="caps">К цели · 5 млрд</span><span class="delta" style="color:var(--crust-t)">82 %</span></div>
        <div class="row"><span class="v" style="font-size:16px">4,12 млрд ₽</span><span class="delta muted">≈ 1,9 года</span></div>
        <div class="bar"><i style="width:82.4%"></i><span class="ms done" style="left:20%"></span><span class="ms done" style="left:50%"></span><span class="ms done" style="left:80%"></span></div></div>
      <div style="display:flex;gap:6px;margin-left:4px"><span class="icbtn">${IC.theme}</span><span class="icbtn">${IC.help}</span><span class="icbtn">${IC.gear}</span></div>
    </header>`;
  };
  window.TABS = function (on, badge, list) {
    const t = list || ['Сводка', 'Точки', 'Команда', 'Финансы', 'Рынок', 'Цех', 'Меню', 'Журнал'];
    return `<nav class="tabs">${t.map((x) => `<span class="${x === on ? 'on' : ''}">${x}${badge && badge[x] ? `<em class="badge">${badge[x]}</em>` : ''}</span>`).join('')}</nav>`;
  };
})();
