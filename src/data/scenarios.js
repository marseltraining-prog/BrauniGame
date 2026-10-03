/* =====================================================================
   СЦЕНАРИИ: данные (BK.SCEN). Четыре истории с разными правилами с начала.
   Логика — src/scenario.js (BK.Scenario), интерфейс — src/ui/scenario-ui.js.
   Замысел — docs/vision-plan.md §5 п. 5 и plan (этап 4).

   Поля сценария:
     name, text      — название и короткое описание (видно на старте и в итогах);
     goal            — что нужно сделать (строка для игрока);
     start           — стартовые правила: cash (деньги), loan (долг), crisis/crisisIn,
                       trafficK/foodcostK/rentK (множители на days дней), city (город);
     days            — срок сценария (если есть), после — «срок вышел»;
     fail(S)         — провал сценария (иначе партия кончается как обычно);
     done(S)         — сценарий пройден (по этому отмечается прогресс между партиями);
     scenes          — свои сюжетные сцены (в формате BK.STORY.scenes) — их пишут отдельно.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const open = (S) => (S.stores || []).filter((s) => s.status !== 'opening');
  BK.SCEN = {
    v: 1,
    list: {
      legacy: {
        name: 'Наследство', icon: '🕯', text: 'Бабушкина пекарня в долгах. Полгода, чтобы её спасти.',
        goal: 'Выжить полгода и выйти в плюс',
        start: { cash: 1200000, loan: 2600000, trafficK: 0.94, days: 60, foodcostK: 1.04 },
        days: 180,
        done: (S) => (S.cash || 0) > 1500000 && !S.lost,
        fail: (S) => !!S.lost,
        scenes: [],
      },
      rescue: {
        name: 'Спаси сеть', icon: '🚒', text: 'Продаётся сеть в кризисе: точки есть, денег нет, люди устали.',
        goal: 'Вытащить сеть и вернуть её в плюс',
        start: { cash: 3000000, loan: 18000000, trafficK: 0.9, days: 120, foodcostK: 1.03 },
        days: 365,
        done: (S) => !S.lost && (S.history || []).slice(-3).every((m) => m.profit > 0),
        fail: (S) => !!S.lost,
        scenes: [],
      },
      crisis: {
        name: 'Кризис', icon: '📉', text: 'Старт перед кризисом: спрос падает, мука дорожает.',
        goal: 'Пережить кризис и вырасти',
        start: { cash: 9000000, crisis: 14, crisisIn: 45, trafficK: 0.92, days: 300, foodcostK: 1.12 },
        days: 300,
        done: (S) => !S.lost && (S.day || 0) > 300,
        fail: (S) => !!S.lost,
        scenes: [],
      },
      moscow: {
        name: 'Старт в Москве', icon: '🏙', text: 'Дорогая аренда, высокий чек, сильные конкуренты.',
        goal: 'Закрепиться в Москве',
        start: { cash: 10000000, rentK: 1.35, days: 3650, trafficK: 1.06 },
        days: null,
        done: (S) => !S.lost && open(S).length >= 8,
        fail: (S) => !!S.lost,
        scenes: [],
      },
    },
  };
})();
