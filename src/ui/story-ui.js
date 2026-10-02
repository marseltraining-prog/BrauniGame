/* Сюжет — интерфейс (логика — src/story.js, BK.Story; тексты — src/data/story.js).
   Окно сцены: портреты героев (пиксельные, Px.portraitTag), реплики, варианты выбора
   с последствиями; тост о случившемся; записи в летопись для итогов игры.
   В app.js / panels.js — только хуки (BK.StoryUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const ST = BK.Story, APP = () => BK.App, E = () => BK.Engine;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h5"/></svg>';

  function portrait(who, emo) {
    const h = (BK.STORY.heroes || {})[who] || { name: who };
    if (BK.Px && BK.Px.portraitTag) return `<span class="pxframe st-px" title="${esc(h.name)}">${BK.Px.portraitTag(h.px || who, emo || 'calm')}</span>`;
    return `<span class="st-av" title="${esc(h.name)}">${esc((h.name || '?').slice(0, 1))}</span>`;
  }
  function linesHtml(sc) {
    return (sc.lines || []).map((l) => {
      const h = (BK.STORY.heroes || {})[l.who] || { name: l.who };
      return `<div class="st-line"><b>${esc(h.short || h.name)}</b>${esc(l.text)}</div>`;
    }).join('');
  }
  function choicesHtml(sc, S) {
    return (sc.choices || []).map((c, i) => {
      const need = needText(S, c.need);
      return `<button class="btn st-ch" data-act="storyPick" data-arg="${i}"${need.dis ? ' disabled' : ''}>${esc(c.label)}${c.desc ? `<small>${esc(c.desc)}</small>` : ''}${need.dis ? `<small>${esc(need.text)}</small>` : ''}</button>`;
    }).join('');
  }
  // требование к варианту (отношения и скрытые стили) — показываем честно
  function needText(S, need) {
    const R = ST.state(S); if (!need || !R) return { dis: false, text: '' };
    const bad = [];
    if (need.rel) for (const k of Object.keys(need.rel)) if ((R.rel[k] || 0) < need.rel[k]) bad.push(`${(BK.STORY.heroes[k] || {}).short || k} ≥ ${need.rel[k]}`);
    if (need.meter) for (const k of Object.keys(need.meter)) if ((R.m[k] || 0) < need.meter[k]) bad.push(`стиль «${k}» ≥ ${need.meter[k]}`);
    if (need.flag) for (const k of Object.keys(need.flag)) if (R.f[k] !== need.flag[k]) bad.push('другое решение раньше');
    return bad.length ? { dis: true, text: 'Требуется: ' + bad.join(', ') } : { dis: false, text: '' };
  }
  function sceneHtml(S, sc) {
    const climax = sc.form === 'climax';
    const chName = ST.chapterName ? ST.chapterName(ST.chapter(S, ST.state(S))) : '';
    return `<div class="modal-h"><span class="eyebrow">${climax ? 'Поворотный момент' : esc(chName)}</span><h2>${esc(sc.title)}</h2></div>
      <div class="modal-b story-m">
        <div class="st-lines">${linesHtml(sc)}</div>
        <div class="st-choices">${choicesHtml(sc, S)}</div>
      </div>`;
  }
  function openScene(keep) {
    const S = APP().state; const sc = ST.pendingScene(S);
    if (!sc) return false;
    APP().openModal(sceneHtml(S, sc), { closable: false, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('story-modal', 'story-' + (sc.form || 'scene'));
    return true;
  }
  // Лента Семёна и записи сюжета в «Сводке» — короткая строка (полная летопись — в итогах игры).
  function block(S) {
    const R = ST.state(S); if (!R) return '';
    const last = R.log.length ? R.log[R.log.length - 1] : null;
    const pend = ST.pendingScene(S);
    if (!last && !pend) return '';
    let s = `<div class="sec storyb"><h3><span class="st-h">${ICON}История</span>${R.log.length ? `<button class="linkbtn" data-act="storyLog">Вся летопись →</button>` : ''}</h3>`;
    if (pend) s += `<div class="st-pend"><b>Ждёт решения: «${esc(pend.title)}»</b><button class="btn sm primary" data-act="story">Открыть</button></div>`;
    else if (last) s += `<p class="hint" style="margin:0">${E().fmtDate(last.day)} — ${esc(last.title)}${last.choice ? `: ${esc(last.choice)}` : ''}</p>`;
    return s + '</div>';
  }
  function logHtml(S) {
    const h = ST.history(S);
    if (!h.list.length) return '<div class="modal-h"><span class="eyebrow">История</span><h2>Летопись</h2></div><div class="modal-b"><p class="hint" style="margin:0">Пока ничего не случилось. История начинается с первого решения.</p></div>';
    let s = `<div class="modal-h"><span class="eyebrow">История</span><h2>Летопись</h2></div><div class="modal-b story-m">`;
    for (const ch of h.chapters) {
      s += `<h4 class="st-ch-h">${esc(ch.name)}</h4><ul class="st-log">`;
      for (const it of ch.items) s += `<li><span class="st-d">${E().fmtDate(it.day)}</span><b>${esc(it.title)}</b>${it.choice ? `<span class="st-c">${esc(it.choice)}</span>` : ''}</li>`;
      s += '</ul>';
    }
    if (h.ending) s += `<div class="st-end"><b>${esc(h.ending.name)}</b>${esc(h.ending.text)}</div>`;
    return s + '</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>';
  }
  function toast(n) {
    if (n.phase === 'scene') { openScene(); return; }
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast sttoast' + (n.phase === 'ending' ? ' warn' : '');
    el.setAttribute('role', 'status');
    if (n.phase === 'ending') {
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">История закончилась</span><b>${esc(n.name || '')}</b><span class="md">${esc(n.text || '')}</span></span>`;
    } else {
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">${esc(n.title || '')}</span><b>${esc(n.choice || '')}</b>${n.out ? `<span class="md">${esc(n.out)}</span>` : ''}</span>`;
    }
    el.addEventListener('click', () => { el.remove(); openLog(); });
    el.title = 'Открыть летопись';
    setTimeout(() => el.remove(), 9000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (BK.Sound) BK.Sound.play(n.phase === 'ending' ? 'warn' : 'fanfare');
  }
  function openLog() {
    const S = APP().state; if (!S) return;
    APP().openModal(logHtml(S), { closable: true });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('story-modal');
  }
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    Object.assign(A, {
      story: () => openScene(),
      storyLog: () => openLog(),
      storyPick: (d) => {
        const S = APP().state;
        const r = ST.resolve(S, +d.arg);
        APP().save();
        if (r.ok && r.out && r.out.length) APP().toast(r.scene.title, r.out.join('; '), 'good');
        if (r.ok && S.lost) { APP().refresh(); return; }
        if (!openScene('keep')) { APP().closeModal(); APP().refresh(); }
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.StoryUI = { openScene, openLog, block, logHtml, sceneHtml, toast, portrait, ICON };
})();
