/* Город новой партии. Завершение партии открывает Москву и Петербург;
   старые победы по историям тоже учитываются. Без localStorage прогресс живёт во вкладке. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const KEY = 'bk-ufa-run-done';
  let completed = false;
  function unlocked() {
    if (completed) return true;
    try { if (localStorage.getItem(KEY) === '1') return true; } catch (_) {}
    if (BK.Scenario && BK.Scenario.done().length) {
      // Перенос старого прогресса: сброс историй впоследствии не закрывает города.
      completed = true;
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
      return true;
    }
    return false;
  }
  function complete(S) {
    if (!S || !(S.won || S.lost || (S.story && S.story.ending))) return false;
    completed = true;
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
    return true;
  }
  function available(id) {
    const d = BK.CITY_BY_ID && BK.CITY_BY_ID[id];
    return !!d && (!d.big || unlocked());
  }
  function resolve(id) { return available(id) ? id : 'ufa'; }
  BK.StartCity = { unlocked, complete, available, resolve };
})();
