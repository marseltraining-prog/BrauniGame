/* Подсказка перед решением: область и сила, без направления последствия. */
var BK = globalThis.BK || (globalThis.BK = {});
BK.choiceImpact = function (icon, name, strength, value) {
  const n = Math.max(0, Math.min(3, Math.ceil(Math.abs(strength || 0))));
  const level = ['нет влияния', 'слабо', 'умеренно', 'сильно'][n];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tip = esc(name + ': ' + level);
  return `<span data-strength="${n}" class="fxc ${n ? 'neutral' : 'zero'}" title="${tip}">${icon || ''}<span class="fxn">${esc(name)}</span><span class="impact-level">${value ? esc(value) : level}</span></span>`;
};

BK.choiceImpacts = function (chips) {
  const strength = html => Number((html.match(/data-strength="(\d)"/) || [0, 0])[1]);
  return chips.slice().sort((a, b) => strength(b) - strength(a)).join('');
};
