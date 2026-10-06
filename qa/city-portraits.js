/* Городские портреты: node qa/city-portraits.js [--baseline]
   Пиксельные портреты героев (Px.portraitTag + Px.hydrate — тот же путь, что у окон сюжета, пролога и
   «Истории») и фигуры сцен (Px.fig) для Уфы, Казани, Москвы и Новосибирска.
   Проверяет:
     • Уфа — побайтно как в эталоне qa/baselines/city-portraits-ufa.json (снят с кода ДО городских
       портретов: `--baseline` перезаписывает эталон — только если облик уфимских героев меняют нарочно);
       разметка тегов (data-pxp) для Уфы тоже прежняя;
     • в остальных городах у героев, чьё имя по городу другое (наставник, коллега, соперник, банкир,
       летописец, Дамир, Инна, инспектор), портрет и фигура отличаются от уфимских, а семья, сам герой
       и врач — те же; в разных городах один и тот же герой выглядит по-разному;
     • повторный рендер даёт те же пиксели (детерминированность), в консоли нет ошибок.
   Контактный лист (строка — город, столбец — герой; спокойное лицо и улыбка) —
   qa/shots/city-portraits/contact-sheet.png. Код выхода 1, если есть проблемы. */
const path = require('path');
const fs = require('fs');
const { chromium, openPage } = require('./lib');

const BASE = path.join(__dirname, 'baselines', 'city-portraits-ufa.json');
const OUT = path.join(__dirname, 'shots', 'city-portraits');
const MAKE_BASE = process.argv.includes('--baseline');
const CITIES = ['ufa', 'kazan', 'moscow', 'nsk'];
// [ключ в выдаче, ключ Px.CAST, роль BK.STORY_CAST (или null — портрет по умолчанию), меняется ли по городу]
const SET = [
  ['rashid', 'rashid', null, 1], ['gulya', 'gulya', null, 1], ['oleg', 'oleg', null, 1], ['elvira', 'elvira', null, 1],
  ['semyon', 'semyon', null, 1], ['damir', 'damir', null, 1], ['inna', 'elvira', 'inna', 1], ['inspector', 'semyon', 'inspector', 1],
  ['mama', 'mama', null, 0], ['sania', 'sania', null, 0], ['hero', 'hero', null, 0], ['heroOld', 'heroOld', null, 0], ['doctor', 'doctor', null, 0],
];
const EMOS = ['neutral', 'calm', 'smile', 'happy', 'angry', 'worried', 'sad', 'surprised', 'smirk', 'tired', 'closed'];
const FIGS = ['rashid', 'gulya', 'oleg', 'elvira', 'semyon', 'damir', 'mama', 'sania', 'hero', 'doctor'];
const FIG_OPTS = [{ emo: 'neutral' }, { emo: 'smile', step: 1 }, { view: 'back' }, { emo: 'happy', upper: true }];

const issues = [];
const log = (...a) => console.log(...a);

// всё в странице: город партии → теги → canvas → хэш пикселей
function renderCity(p, city) {
  return p.evaluate(({ city, SET, EMOS, FIGS, FIG_OPTS }) => {
    const C = BK.STORY_CAST, Px = BK.Px;
    if (BK.App && BK.App.state) return { err: 'есть открытая партия — город берётся из неё' };
    C.noteHome(city);
    const now = C.cityIdNow();
    const fnv = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16) + ':' + d.length; };
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(box);
    const tags = {}, por = {};
    for (const [k, who, role] of SET) for (const e of EMOS) tags[k + ':' + e] = role ? Px.portraitTag(who, e, '', role) : Px.portraitTag(who, e);
    box.innerHTML = Object.keys(tags).map((k) => `<span data-k="${k}">${tags[k]}</span>`).join('');
    Px.hydrate(box);
    box.querySelectorAll('span[data-k]').forEach((s) => {
      const cv = s.querySelector('canvas');
      por[s.dataset.k] = fnv(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
    });
    // повторно — в свежие canvas (детерминированность и кэш)
    const box2 = document.createElement('div'); box2.innerHTML = box.innerHTML.replace(/ data-px-done="[^"]*"/g, ''); box.appendChild(box2);
    box2.querySelectorAll('canvas').forEach((cv) => { delete cv.dataset.pxDone; });
    Px.hydrate(box2);
    let again = 0;
    box2.querySelectorAll('span[data-k]').forEach((s) => { const cv = s.querySelector('canvas'); if (fnv(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data) !== por[s.dataset.k]) again++; });
    box.remove();
    const figs = {};
    for (const w of FIGS) FIG_OPTS.forEach((o, i) => { figs[w + ':' + i] = fnv(Px.fig(w, o).d); });
    const names = {};
    for (const [k, , role] of SET) {
      const r = role || ({ rashid: 'mentor', gulya: 'colleague', oleg: 'rival', elvira: 'banker', semyon: 'chronicler', damir: 'damir' })[k];
      const pp = r && C.personOf(city, r); names[k] = pp ? pp.name : (Px.CAST[k] && Px.CAST[k].name) || k;
    }
    return { now, tags, por, figs, again, names };
  }, { city, SET, EMOS, FIGS, FIG_OPTS });
}

async function sheet(p, res) {
  await p.setViewportSize({ width: 1900, height: 1100 });
  await p.evaluate(({ CITIES, SET, res }) => {
    const Px = BK.Px, C = BK.STORY_CAST;
    const d = document.createElement('div'); d.id = 'cpSheet';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fbf6ec;padding:12px;font:11px/1.2 sans-serif;color:#2a1a1c;overflow:auto';
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    let h = '<table style="border-collapse:collapse">';
    for (const city of CITIES) {
      h += `<tr><th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:14px;padding:4px">${city}</th>`;
      for (const [k, who, role] of SET) {
        if (k === 'heroOld' || k === 'doctor') continue;
        h += `<td style="padding:3px;text-align:center;vertical-align:top;width:104px"><div data-city="${city}" data-who="${who}" data-role="${role || ''}"></div><div style="height:28px;overflow:hidden">${esc(res[city].names[k])}</div></td>`;
      }
      h += `<td style="padding:3px;vertical-align:top"><canvas data-figs="${city}" style="width:${6 * 18 * 3}px;height:${32 * 3}px;image-rendering:pixelated"></canvas><div>фигуры сцен</div></td></tr>`;
    }
    d.innerHTML = h + '</table>';
    // фигуры сцен (Px.fig): наставник, коллега, соперник, банкир, летописец, Дамир
    for (const cv of d.querySelectorAll('canvas[data-figs]')) {
      C.noteHome(cv.dataset.figs);
      const b = new Px.Buf(6 * 18, 32);
      ['rashid', 'gulya', 'oleg', 'elvira', 'semyon', 'damir'].forEach((w, i) => b.blit(Px.fig(w, { emo: 'smile' }), i * 18, 1));
      b.toCanvas(cv);
    }
    document.body.appendChild(d);
    for (const slot of d.querySelectorAll('[data-city]')) {
      C.noteHome(slot.dataset.city);
      const t = (e) => (slot.dataset.role ? Px.portraitTag(slot.dataset.who, e, '', slot.dataset.role) : Px.portraitTag(slot.dataset.who, e));
      slot.innerHTML = t('neutral') + t('smile');
      slot.querySelectorAll('canvas').forEach((cv) => { cv.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;display:block;margin:1px auto'; });
      Px.hydrate(slot);
    }
    C.noteHome('ufa');
  }, { CITIES, SET, res });
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'contact-sheet.png');
  await p.locator('#cpSheet table').screenshot({ path: file });
  return file;
}

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, 'd1440');
  await p.waitForFunction(() => globalThis.BK && BK.Px && BK.Px.hydrate && BK.STORY_CAST);
  const res = {};
  for (const c of CITIES) {
    res[c] = await renderCity(p, c);
    if (res[c].err) { issues.push(`[${c}] ${res[c].err}`); continue; }
    if (res[c].now !== c) issues.push(`[${c}] город партии в странице — ${res[c].now}`);
    if (res[c].again) issues.push(`[${c}] повторный рендер дал другие пиксели: ${res[c].again} портретов`);
  }
  if (MAKE_BASE) {
    fs.mkdirSync(path.dirname(BASE), { recursive: true });
    const u = res.ufa;
    fs.writeFileSync(BASE, JSON.stringify({ note: 'Уфа: хэши пикселей портретов (Px.portraitTag+hydrate) и фигур (Px.fig) до городских портретов', tags: u.tags, por: u.por, figs: u.figs }, null, 1) + '\n');
    log('эталон Уфы записан:', path.relative(process.cwd(), BASE), Object.keys(u.por).length, 'портретов,', Object.keys(u.figs).length, 'фигур');
  } else {
    const base = JSON.parse(fs.readFileSync(BASE, 'utf8')), u = res.ufa;
    let same = 0;
    for (const k of Object.keys(base.por)) { if (u.por[k] !== base.por[k]) issues.push(`[ufa] портрет ${k} изменился`); else same++; }
    for (const k of Object.keys(base.tags)) if (u.tags[k] !== base.tags[k]) issues.push(`[ufa] тег ${k} изменился: ${u.tags[k]}`);
    for (const k of Object.keys(base.figs)) { if (u.figs[k] !== base.figs[k]) issues.push(`[ufa] фигура ${k} изменилась`); else same++; }
    log(`Уфа: ${same} из ${Object.keys(base.por).length + Object.keys(base.figs).length} картинок побайтно как в эталоне`);
    for (const c of CITIES.slice(1)) {
      const r = res[c]; if (!r.por) continue;
      let diff = 0;
      for (const [k, , , varies] of SET) for (const e of EMOS) {
        const eq = r.por[k + ':' + e] === u.por[k + ':' + e];
        if (varies && eq) issues.push(`[${c}] ${k}:${e} — портрет как в Уфе, хотя имя другое (${r.names[k]})`);
        if (!varies && !eq) issues.push(`[${c}] ${k}:${e} — портрет изменился, хотя герой тот же`);
        if (varies && !eq) diff++;
      }
      for (const k of Object.keys(u.figs)) {
        const w = k.split(':')[0], varies = SET.some((s) => s[1] === w && s[2] == null && s[3]);
        const eq = r.figs[k] === u.figs[k];
        if (varies && eq) issues.push(`[${c}] фигура ${k} как в Уфе`);
        if (!varies && !eq) issues.push(`[${c}] фигура ${k} изменилась, хотя герой тот же`);
      }
      log(`${c}: ${diff} портретов отличаются от уфимских`);
    }
    // один герой в разных городах — разные лица
    for (const [k, , , varies] of SET) if (varies) {
      const hs = CITIES.slice(1).map((c) => res[c].por && res[c].por[k + ':neutral']);
      if (new Set(hs).size < hs.length) issues.push(`${k}: в двух городах одинаковый портрет`);
    }
  }
  const file = await sheet(p, res);
  log('контактный лист:', path.relative(process.cwd(), file));
  for (const e of p.errs) issues.push('консоль: ' + e);
  await browser.close();
  if (issues.length) { log('\nПРОБЛЕМЫ:'); issues.forEach((x) => log(' - ' + x)); process.exit(1); }
  log('\nOK: городские портреты в порядке');
})().catch((e) => { console.error(e); process.exit(1); });
