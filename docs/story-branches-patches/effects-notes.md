# Аудит эффектов реально достигнутого выбора

Подготовлено изолированно; проверен только синтаксис `node --check`. Игры/Engine/боты/тесты/браузеры не запускались. Реальные src/sim/qa не изменялись.

Интеграция родителем в sim/story.js:

```js
const effectAudit = require('./story-effect-audit');
const before = effectAudit.snapshot(S); // только когда настоящий pending уже достигнут
const result = BK.Story.resolve(S, idx);
const audit = effectAudit.check(BK, S, sc, idx, before, result);
// audit.errors → блокирующие ошибки; checks/declaredChecks/effectCounts → отчёт;
// audit.unsupported → явный перечень эффектов без независимого численного oracle.
```

snapshot(S) использует глобальный BK.Rewind.take. check сравнивает реально выбранный idx, закрытие pending и seen, total cash+reserve signed delta с индексированием и коэффициентом сложности, perStore считает только неоткрывающиеся точки активного города, revPct использует фактическую выручку с полом 1млн; loan — фактическую незанятую комнату Engine.loanLimit, включая частичную выдачу и exhausted limit. Лимит читается через чистый публичный API, не через повторный takeLoan.

Отношения/скрытые стили проверяются с последовательным clamp. Perks — членство/порядок/дедупликация twocrusts, точные добавленные src:story modifiers (m/scope/until), сохранность старых modifiers и additive loyalty. Shares — точные owner/what/pct/buyout. Очередь — прежние записи, точное число/тип и due-диапазоны schedule, точные deferOpen. Threads — удаления и closed-src, новый id/from/due/who/src/done, счётчик n, общий count и cap40; городской swap реального guests-wrapper учитывается. Family — условие одного открытого дела/seen, реальное due, famSeen/famNext.

Сохранение до resolve реально сериализуется Rewind.take → JSON.parse; после оригинального выбора helper восстанавливает globals активного города для отдельной копии, разрешает на ней тот же idx и сравнивает целиком нормализованные durable states (удалены только cache/notify самим Rewind). Все RNG входят в сравнение; никаких случайных baseline-rolls helper не делает. Повторное resolve копии обязано отказать без любых durable изменений. Globals исходного S восстанавливаются finally, оригинальный S проверяется на неизменность аудитом.

**Ограничения:** core staffQuit/staffTrain/traffic/conv/foodcost/tax/rent/offer и прочие не перечисленные контрактные эффекты не имитируются: возвращаются unsupported; полностью сравниваются только в save/load replay, численный oracle остаётся отдельным Engine-тестам. line/journal/ending/rival также возвращаются unsupported, дополнительно их должны проверять текущие профильные branch assertions. Новые thread.effect вложенные финансовые эффекты проверяются в момент их срабатывания отдельными Threads-тестами, здесь проверяется постановка нити. Отсутствие family/loan/share в реально достигнутом наборе не заявляется покрытием этих эффектов: effectCounts явно показывает фактически встреченные типы. Браузерный layout и localStorage UI этим helper не проверяются. helper требует штатный sim/load.js с data/guests.js (тот ставит Engine.applyEffects wrapper для t:thread); дополнительный Story.case thread не нужен и дублировал бы записи.
