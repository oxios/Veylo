# VenueFlow v4 — профессиональный QA-аудит UI-прототипа

- Дата: 14 августа 2026
- Scope: исторический UI-аудит до подключения backend и MongoDB
- Вердикт: UI принят как связный demo product; серверные функции и персистентность проверены отдельным этапом

## 1. Executive summary

Повторный аудит проводился не как проверка «кнопка нажимается», а как проверка продуктового контракта каждого действия:

`контекст → обязательные входы → валидация → результат → сохранённое состояние → следующий шаг → честный failure mode`

Главный найденный класс ошибок — скрытые несостыковки между страницами. Например, камера могла существовать в fleet, но не в пространственной модели этажа; экран второго этажа мог получить зону первого; новая локация могла видеть seeded QR-позиции, lineage или эксперименты другой локации. Эти дефекты исправлены.

Итоговая автоматизированная инвентаризация:

| Объект | Количество | Нарушения контракта |
|---|---:|---:|
| Страницы/маршруты | 37 | 0 без data contract |
| Buttons | 250 | 0 без handler/submit contract |
| Inputs | 51 | 0 без label; 0 без controlled state |
| Selects | 44 | 0 без label; 0 без controlled state |
| Textareas | 1 | 0 без label; 0 без controlled state |
| Icon-only buttons | входит в 250 | 0 без accessible name |

## 2. Методика

Проверены пять уровней.

### 2.1 Control-level

Для каждого `button`, `input`, `select`, `textarea` проверялись:

- доступное имя;
- observable action;
- controlled/read-only/disabled state;
- понятная обязательность;
- inline error или объяснение блокировки;
- отсутствие ложного affordance.

### 2.2 Page-level

Для каждой страницы проверялись:

- scope: сеть, локация, устройство или система;
- период: live/range/not applicable;
- обязательные источники;
- preconditions;
- freshness;
- output;
- failure mode.

### 2.3 Cross-page state

Проверялась сохранность цепочки:

`location → plan → floor → zone → camera → calibration → connector → screen → analytics gate`

### 2.4 Negative paths

Проверены состояния:

- 0 камер;
- 0 зон;
- план не загружен;
- stream test не выполнен;
- placement не подтверждён;
- camera offline;
- calibration не активирована;
- POS/weather/labor/inventory отсутствуют;
- экран offline;
- зона другого этажа;
- история ещё не накоплена;
- нет опубликованных QR-позиций;
- нет выборки для lineage/model quality/experiment effect.

### 2.5 Static and build regression

- ESLint;
- TypeScript noEmit для всех UI-модулей;
- production build;
- Sites artifact validation;
- interaction-contract tests;
- modal semantics tests;
- page contract coverage 37/37;
- `git diff --check`.

## 3. Дефекты уровня P0/P1, исправленные в v4

| Severity | Дефект | Риск | Исправление |
|---|---|---|---|
| P0 | Новая локация с 0 камер могла выглядеть healthy | ложная готовность продукта | 0 cameras теперь всегда setup required; нет `0/0 = 100%` |
| P0 | Unknown location наследовала Franko metrics | решение по чужим данным | fallback удалён; новая локация получает 0/`—` и Data Readiness gate |
| P0 | Созданная зона терялась при переходе | camera wizard не видел spatial context | plan/zones/cameras/screens/connectors сохраняются в location session model |
| P0 | Historical pages показывали mock-историю новой локации | выдуманный тренд/AI insight | введён `historyDays`; range pages блокируются до накопления событий |
| P0 | QR draft выглядел опубликованным меню | ложный guest experience | publish требует POS mapping; phone preview имеет честный empty state |
| P1 | Camera floor не совпадал с floor зоны | неверные heatmap/journey events | единая `spatialZonesFor(location)` для floor plan, wizard, links и screens |
| P1 | Экран второго этажа мог выбрать зону первого | неправильный content targeting | zone options фильтруются по выбранному floor; mismatch валидируется |
| P1 | Seeded zone count не совпадал с карточкой location | недоверие к configuration model | зоны распределены по фактическим этажам, count и capacity нормализованы |
| P1 | Stream test оставался valid после смены source credentials | активация непроверенного потока | изменение ONVIF/RTSP/VMS/upload инвалидирует test result |
| P1 | Incompatible analytic могла остаться после смены типа зоны | неверный model assignment | compatibility считается по zone name + type; stale selections удаляются |
| P1 | Integration button «Настроить» не открывал mapping | действие без результата | connected/unconnected connector открывает один setup flow и connection test |
| P1 | Content rule не проверял источник trigger | правило никогда не сработает | weather/occupancy/queue/stop-list проверяют соответствующие dependencies |
| P1 | Data Trust показывал lineage/model precision без выборки | ложная объяснимость | добавлены lineage/model empty states и фактические quality warnings |
| P1 | Experiments новой локации наследовали seeded portfolio | чужой uplift | новая location начинает с пустого portfolio и draft flow |
| P1 | Venue AI утверждал «8 недель истории» всегда | ложный AI context | drawer показывает фактические history days и блокирует profit без sources |
| P2 | Ellipsis/search/categories выглядели кликабельными, но не работали | ложные ожидания | controls реализованы либо декоративный элемент удалён |
| P2 | Alerts использовали period tabs для live incidents | неясный filter semantics | заменено на Все/Требуют реакции/Информационные |

## 4. Аудит критических input flows

### 4.1 Создание локации

Обязательные данные:

- name;
- format;
- city;
- address;
- IANA timezone;
- capacity;
- business hours;
- latitude;
- longitude.

Валидация блокирует пустой spatial context, capacity меньше 1, неверный формат часов и координаты вне допустимого диапазона. Созданная локация получает `0 zones`, `0 cameras`, `0 screens`, `0 sources`, `0 historyDays` и автоматически ведёт к plan setup.

### 4.2 План и зона

- zone нельзя создать до загрузки плана выбранного этажа;
- name/type/capacity обязательны;
- duplicate zone name на одном этаже блокируется;
- capacity пользовательской локации не может превысить location capacity;
- zone сохраняет floor, geometry, capacity, camera links и coverage;
- cross-floor camera link исключён из options.

### 4.3 Камера

Семь обязательных шагов:

1. Active location, floor, existing zone, camera name.
2. ONVIF/RTSP/Cloud VMS/pilot source.
3. Stream test.
4. Plan placement, height, angle, orientation.
5. Compatible analytics.
6. Edge blur, audio lock, events/evidence, retention, raw-video mode.
7. Review и переход в calibration.

Бизнес-метрики не активируются до четырёх reference points, ROI/rules, validation test и явной активации.

### 4.4 Integrations

Для каждого из 14 connector types обязательны account, external location, зафиксированный active VenueFlow location, cadence/history и connection test. Сохранённый connector обновляет только выбранный `location_id`.

### 4.5 QR Menu

Новая позиция требует name, category, positive price и POS SKU. Создаётся выключенным draft. Publish блокируется без Poster POS. Optional allergens явно не помечены обязательными. Guest search/category controls действительно фильтруют preview.

### 4.6 Screens/Tablets

Pairing требует код `VF-0000`, name, model, orientation, floor, zone и fallback playlist. Zone обязана принадлежать floor. Online state сохраняется. Publish/restart для offline устройства дают явное объяснение.

### 4.7 Alerts/Reports

- alert: name, metric, zone, operator, threshold, duration, channel, owner, escalation;
- числовые диапазоны проверяются;
- video-derived alert требует camera + zone + calibration;
- temperature требует IoT/HACCP;
- Telegram требует connector;
- report требует name и валидные emails; отправка остаётся demo-only.

## 5. End-to-end acceptance scenarios

### Scenario A — новая локация

1. Создать location с адресом, часами и координатами.
2. Убедиться, что dashboard не показывает Franko data.
3. Загрузить demo-plan.
4. Создать zone.
5. Добавить camera с location/floor/zone.
6. Проверить source, placement и privacy.
7. Пройти calibration validation.
8. Подключить Poster POS и OpenWeather с location mapping.
9. Подключить screen/tablet к существующей zone.
10. Открыть Live — current camera context доступен.
11. Открыть historical analytics — отображается честный gate «история ещё не накоплена».

Ожидаемый результат: ни один экран не подменяет отсутствующие данные seeded metrics.

### Scenario B — offline camera

1. Выбрать Franko.
2. Global health показывает проблему.
3. Camera fleet показывает offline source.
4. Floor plan показывает affected coverage.
5. Data contract помечает зависимые метрики partial/unavailable.
6. Diagnostic action сохраняет location, period и source context.

### Scenario C — digital signage

1. Выбрать location/floor/zone.
2. Pair device.
3. Назначить fallback.
4. Создать smart rule.
5. Проверить source dependency trigger.
6. Перевести device offline.
7. Убедиться, что publish/restart не выглядят успешно.

### Scenario D — trust before insight

1. Выбрать новую location.
2. Открыть Data Trust.
3. Убедиться, что missing camera/POS/weather/labor/history показаны отдельно.
4. Lineage и model quality не содержат fake precision.
5. Venue AI не сообщает profit или 8-week trend без sources/history.

## 6. Результаты регрессии

| Проверка | Результат |
|---|---|
| ESLint | PASS, 0 errors, 0 warnings |
| TypeScript UI noEmit | PASS |
| Production build | PASS |
| Sites artifact validation | PASS |
| Interaction contracts | PASS |
| Modal semantics | PASS |
| Data contracts | PASS, 37/37 |
| Persisted dependency chain | PASS |
| Whitespace (`git diff --check`) | PASS |

## 7. Ограничения проверки

Cloud browser preview в текущем окружении не открылся из-за timeout, поэтому итоговый visual click-through через удалённый браузер не заявляется как выполненный. Вместо него проведены production build, static AST inventory, rendered metadata test, semantic modal test и source-level regression. Это ограничение не скрывается.

UI-прототип не проверяет:

- реальный RTSP/ONVIF/VMS transport;
- edge inference accuracy;
- production OAuth/API credentials;
- browser persistence после reload;
- реальную отправку email/Telegram;
- production RBAC/SSO;
- реальные PDF/XLSX/CSV exports;
- network failure/retry/backoff;
- hardware pairing и player app;
- полноценный focus trap и screen-reader traversal во всех браузерах.

## 8. Production exit criteria

До production необходимо:

1. Перенести session model в tenant-aware backend.
2. Ввести immutable IDs и optimistic concurrency.
3. Хранить camera secrets в vault, а не в UI state.
4. Реализовать RBAC, SSO/SCIM и video access approvals.
5. Версионировать plan, calibration и privacy policy.
6. Добавить connector reconciliation, retry и data freshness SLA.
7. Реализовать event schema, deduplication и clock synchronization.
8. Добавить automated browser E2E на desktop/tablet/mobile.
9. Провести accessibility audit WCAG 2.2 AA.
10. Выполнить privacy/legal review для юрисдикций развёртывания.
11. Провести load/failover тест edge и cloud pipeline.
12. Добавить observability, audit export и incident response runbooks.

## 9. Итоговый вывод

VenueFlow v4 решает исходную проблему аудита: система теперь явно знает, откуда взялась камера, к какой локации/этажу/зоне она относится, какие настройки обязательны и почему конкретная метрика доступна или заблокирована. Прототип можно использовать для product demo, stakeholder review, UX validation и постановки backend/edge-разработки.
