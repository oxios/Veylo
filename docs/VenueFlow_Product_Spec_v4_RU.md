# VenueFlow v4 — продуктовое ТЗ, data contracts, QA-аудит и критерии приёмки

- Версия: 4.0
- Дата: 14 августа 2026
- Статус: UI-прототип реализован; backend, MongoDB и Docker добавлены следующим этапом
- Артефакт: интерактивный full-stack demo product для ресторанов, кафе, кофеен, QSR и сетевых операторов

## 1. Результат проекта

VenueFlow — единый операционный интерфейс, который связывает видеоаналитику, трафик, POS, погоду, расписание команды, food safety, списания, отзывы, QR-меню и digital signage.

Прототип должен отвечать не только на вопрос «что произошло», но и проводить пользователя по полной цепочке:

1. Какой источник дал событие.
2. К какой локации, этажу, зоне и объекту оно относится.
3. Как событие превратилось в метрику.
4. Почему AI предложил конкретное действие.
5. Кто должен подтвердить или выполнить действие.
6. Как измеряется результат после изменения.

Главный продуктовый инвариант:

> источник → настройка → событие → метрика → вывод → действие → ответственный → результат

Если любой элемент цепочки отсутствует, интерфейс обязан показать blocked-state, а не достраивать уверенный вывод из несуществующих данных.

В v4 этот инвариант реализован как системный data contract для каждой из 37 страниц. Контракт фиксирует scope, период, источники, preconditions, freshness, результат и failure mode. Для пользовательской локации без источников или истории аналитические страницы показывают честный Data Readiness gate.

## 2. Границы текущего прототипа

Реализовано:

- UI без бэкенда;
- переходы между разделами;
- локальные интерактивные состояния, сохраняющиеся между переходами в пределах текущей сессии;
- модальные окна, фильтры, селекторы, мастера и drawer;
- четыре mock-локации разных форматов;
- location-aware показатели, камеры, статусы, экраны и AI-контекст;
- desktop/tablet/mobile CSS;
- демонстрационные расчёты и доказательные связи;
- состояния online, degraded, offline, setup, empty и warning.
- persisted-in-session цепочка location → plan → zone → camera → calibration → connectors → screens;
- автоматизированный контрактный тест всех интерактивных controls и всех 37 маршрутов.

Не реализовано и не должно выдаваться за работающую интеграцию:

- реальный RTSP/ONVIF поток;
- настоящая компьютерная модель;
- сохранение после перезагрузки;
- реальный POS, payroll, inventory, weather API или VMS;
- отправка Telegram/email/push;
- реальные платежи и бронирования;
- фактический экспорт файлов из UI;
- production-аутентификация и RBAC enforcement.

Все данные, имена, суммы, статусы, video evidence и AI-ответы являются mock-данными.

## 3. Целевые сегменты

### 3.1 Full-service restaurant

Критические задачи:

- capture с улицы;
- посадка и первый контакт;
- контроль столов и зон;
- нагрузка официантов;
- время блюда и pass;
- бронирования и waitlist;
- отзывы, service recovery и повторный визит;
- prime cost, voids, discounts и waste.

### 3.2 Coffee shop / bakery

Критические задачи:

- поток фасада и конверсия входа;
- длина и скорость очереди;
- throughput бариста;
- наличие выпечки и stop-list;
- peak staffing;
- погодные промо;
- QR, loyalty и digital menu board.

### 3.3 QSR / fast casual

Критические задачи:

- order-to-ready;
- queue abandonment;
- точность комплектации;
- pickup и courier dwell;
- labor efficiency;
- SOP и safety;
- menu mix и динамический контент.

### 3.4 Сеть заведений

Критические задачи:

- единая модель локаций и прав;
- сравнение заведений;
- rollout стандартов;
- прозрачное происхождение KPI;
- контроль data quality;
- доказанный эффект до масштабирования на сеть.

## 4. Роли

### Owner

- видит сеть, P&L, prime cost и подтверждённый эффект;
- подтверждает денежные действия и rollout;
- управляет тарифом, ролями и политиками хранения;
- имеет доступ к audit log.

### Operations director

- сравнивает локации;
- следит за SLA, labor, safety, waste и внедрением playbook;
- создаёт сетевые правила и эксперименты;
- контролирует model/data health.

### Location manager

- видит назначенную локацию;
- принимает алерты;
- управляет сменой, задачами, столами, prep и safety;
- подтверждает операционные действия без доступа к чужим локациям.

### Security / Loss prevention

- расследует POS × video исключения;
- открывает доказательные фрагменты;
- экспортирует evidence только при наличии права;
- видит журнал доступа к видео.

### Marketing / Guest experience

- управляет QR-меню, контентом и экранами;
- работает с отзывами и win-back;
- запускает промо-эксперименты;
- не получает доступ к необработанному видео без отдельной роли.

### Integrator / Installer

- создаёт локации, этажи, зоны и камеры;
- подключает источник;
- размещает камеру на плане;
- выполняет calibration и validation;
- не видит P&L и персональные guest данные.

## 5. Обязательная объектная модель

Иерархия:

`organization → brand → location → floor → zone → camera → ROI/line/object → analytic → event → metric`

### Organization

- юридический и операционный владелец;
- timezone policy;
- роли;
- privacy/retention policy;
- тариф и лимиты.

### Brand

- название;
- визуальные токены;
- QR-меню;
- digital signage templates;
- набор стандартов.

### Location

- уникальный `location_id`;
- адрес и координаты;
- формат;
- timezone;
- часы работы;
- вместимость;
- floors, zones, cameras;
- POS/weather/labor/inventory bindings;
- readiness и health.
- число накопленных исторических дней;
- подтверждение privacy policy;
- связанные экраны/планшеты и их floor/zone placement;
- persisted camera, screen и connector definitions в session state.

### Floor

- `floor_id`;
- название;
- plan image/vector;
- масштаб;
- ориентация;
- точки входа и выхода;
- набор зон.

### Zone

- `zone_id`;
- тип: dining, queue, service, transition, back of house, outdoor, safety;
- полигон на плане;
- вместимость;
- связанные камеры;
- разрешённые аналитики;
- business thresholds.

### Camera

- `camera_id`;
- location, floor, zone;
- источник: ONVIF, RTSP, cloud VMS, uploaded pilot;
- разрешение, FPS, latency, bitrate;
- placement: x/y, высота, угол, ориентация;
- model compatibility;
- health, uptime, last frame;
- privacy и retention override;
- calibration status/version.

### ROI / line / object

- ROI зоны;
- directional tripwire;
- table object;
- POS/pass/pickup object;
- privacy mask;
- reference points camera-to-floor.

### Event contract

Минимальный event envelope:

```json
{
  "organization_id": "org_oxios",
  "location_id": "loc_franko",
  "floor_id": "floor_1",
  "zone_id": "zone_hall",
  "source_id": "cam_02",
  "object_id": "table_08",
  "analytic": "first_contact",
  "event_time": "2026-08-14T19:42:18+03:00",
  "model_version": "table-state-3.1.0",
  "confidence": 0.92,
  "calibration_version": "cal_2026_08_11",
  "privacy_mode": "edge_blur"
}
```

## 6. Инварианты консистентности

1. При смене локации все location-scoped числа и сущности должны смениться вместе.
2. Нельзя показывать «все системы в норме», если есть offline/degraded источник.
3. Зона без камеры не имеет video-derived аналитики и показывает «нет источника».
4. Камера не создаётся без location, floor и zone.
5. Heatmap не активируется без plan placement и calibration.
6. Multi-camera journey не активируется без общей системы координат и time sync.
7. AI-ответ всегда содержит активную локацию и доступные источники.
8. При переключении локации незавершённый camera/detail state не переносится в другую локацию.
9. Денежное действие создаётся как draft до подтверждения уполномоченной роли.
10. Низкий confidence не должен выглядеть как факт.
11. Отсутствующая интеграция отображается как причина недоступности метрики.
12. Все кликабельные элементы либо изменяют состояние/маршрут, либо явно disabled.
13. Ошибка источника не должна обнулять историю; live и historical состояния различаются.
14. Фрагмент video evidence содержит источник, время, зону, confidence и privacy policy.
15. Recommendation считается завершённой только после измерения outcome.
16. Нулевая камера не считается 100% coverage или healthy fleet.
17. Новый `location_id` не наследует KPI, погоду, блюда, камеры, экраны, lineage или эксперименты другой локации.
18. Этаж камеры обязан совпадать с этажом выбранной зоны; cross-floor linking блокируется.
19. Экран или планшет нельзя привязать к зоне другого этажа.
20. QR-позицию нельзя опубликовать без POS SKU и location mapping; draft preview не изображает опубликованное меню.
21. Smart content rule нельзя активировать без target device, fallback и фактического источника сигнала.
22. Исторический dashboard не публикует mock-тренд для новой локации с `historyDays = 0`.
23. Data Trust не показывает lineage, precision или drift, если для выбранной локации нет выборки.
24. Настройка интеграции всегда фиксирует внешнюю локацию → активный VenueFlow `location_id` и требует connection test.
25. Каждый route имеет один data contract, а каждый control — доступное имя, controlled state и observable result.

## 7. Карта реализованных страниц

### Командный центр

1. Главная.
2. Демо-центр.
3. Автопилот смены.
4. Live-центр.
5. AI-инсайты.
6. Что-если Lab.
7. Growth experiments.

### Видеоаналитика

8. Трафик снаружи.
9. Гости и зоны.
10. Путь гостя.
11. Сервис и столы.
12. Команда.
13. Кухня и стандарты.
14. AI-поиск по видео.
15. Profit Guard.
16. Waste Vision.

### Операции

17. Прогноз спроса.
18. Labor и график.
19. Prep и закупки.
20. Safety и HACCP.
21. Delivery control.
22. Prime cost.

### Guest experience

23. AI-хост и гости.
24. Отзывы и репутация.
25. QR-меню.
26. Menu engineering.
27. Контент-студия.
28. Экраны и планшеты.

### Управление

29. События и алерты.
30. Отчёты.
31. Центр настройки.
32. Data Trust Center.
33. Локации.
34. Планы и зоны.
35. Камеры.
36. Интеграции.
37. Настройки.

## 8. ТЗ: Location Setup

### Функции

- список локаций;
- фильтры all/ready/attention;
- статус и readiness;
- выбор active location;
- карточка адреса, формата, timezone и capacity;
- структура этажей;
- часы работы;
- источники данных;
- добавление локации;
- переход к плану запуска.
- обязательные business hours и IANA timezone;
- широта/долгота с диапазонной валидацией;
- история данных и privacy readiness;
- динамический следующий шаг setup вместо безусловного перехода к камерам.

### Acceptance criteria

- active location видна глобально;
- изменение active location обновляет KPI, камеры, экраны и AI;
- readiness рассчитывается отдельно для каждой локации;
- location с неполной настройкой не выглядит production-ready;
- у каждой data source видна свежесть или причина отсутствия.
- создание локации с пустым адресом, нулевой вместимостью, неверными часами или координатами блокируется;
- новая локация создаётся с 0 zones, 0 cameras, 0 screens, 0 sources и 0 history days;
- переход «План запуска» активирует именно выбранную карточку локации.

## 9. ТЗ: Floor Plan & Zones

### Функции

- переключение этажей;
- слои plan/coverage/traffic;
- зоны как полигоны;
- capacity и coverage;
- точки входа;
- столы/объекты;
- камеры и FOV;
- online/offline состояние;
- связанный набор аналитик;
- создание зоны;
- привязка камеры;
- recommendation по blind spot.

### Acceptance criteria

- количество показанных камер не превышает парк активной локации;
- offline камера визуально отличается;
- зона без источника показывает blocked-state;
- на локации с одним этажом не показывается существующий второй этаж;
- выбранная зона имеет список только реально доступных источников mock-модели.
- число зон на этажах совпадает с карточкой локации;
- сумма capacity базовых зон нормализована к capacity локации;
- camera placement и zone assignment используют одну spatial model;
- после перехода на другую страницу созданный план и custom zone не теряются.

## 10. ТЗ: Camera Fleet

### Список и health

- location-scoped summary;
- all/online/degraded/offline filters;
- list/grid view;
- location, floor, zone;
- source, resolution, FPS, latency;
- analytic tags;
- health score;
- диагностика edge appliance;
- healthy и incident banners;
- empty state для фильтра.

### Мастер добавления камеры

Обязательные шаги:

1. Organization/location/floor/zone/name.
2. ONVIF, RTSP, VMS или pilot MP4.
3. Проверка потока.
4. Placement на плане.
5. Выбор совместимых аналитик.
6. Privacy и retention.
7. Review.

Проверки:

- нельзя продолжить после stream test, если поток не проверен;
- incompatible analytic нельзя включить;
- итоговый review показывает полный контекст;
- созданная камера открывает calibration studio;
- wizard фиксирует активную локацию и объясняет, как переключить её глобально;
- изменение source credentials инвалидирует предыдущий stream test;
- camera definition сохраняет privacy, retention, raw-video mode и calibration status;
- аналитики фильтруются по фактическому типу зоны, а не по одному жёстко заданному названию.

## 11. ТЗ: Calibration Studio

### Функции

- camera view и floor plan side by side;
- минимум четыре reference point;
- удаление ошибочной точки;
- ROI;
- directional tripwire;
- table/object bounding region;
- privacy mask;
- auto-detect draft;
- validation score;
- средняя ошибка проекции;
- активация только после validation.

### Acceptance criteria

- save до validation не активирует analytics;
- offline камера отображает last frame, а не fake live;
- каждая точка нумеруется одинаково в видео и на плане;
- пользователь понимает, зачем нужна calibration;
- итоговый контекст включает camera/location/floor/zone.

## 12. ТЗ: Video Analytics

### Outside traffic

- passers;
- slowdown;
- storefront view;
- entrance;
- capture rate;
- hourly/day heatmap;
- weather correlation;
- facade funnel.

### Inside analytics

- occupancy;
- dwell time;
- zone utilization;
- heatmap;
- table occupancy;
- guest journey;
- queue and abandonment;
- first contact, order, payment, cleanup SLA.

### Staff analytics

- workload;
- route and active time;
- service score;
- coaching opportunities;
- team-level insight;
- запрет на скрытое identity/face recognition в текущем продукте.

### Kitchen analytics

- order/pass time;
- pass congestion;
- SOP compliance;
- safety events;
- evidence clips;
- связка с HACCP и prep.

## 13. ТЗ: Autopilot and Actions

Каждая рекомендация содержит:

- проблему;
- локацию и период;
- источники;
- baseline;
- confidence;
- прогноз эффекта;
- конкретный action;
- owner/assignee;
- срок;
- guardrail;
- measurement plan.

Денежные действия не применяются автоматически. Прототип создаёт draft или задачу на подтверждение.

## 14. ТЗ: Data Trust Center

### Обязательные блоки

- trust score;
- freshness видео/POS/weather/labor;
- metric lineage explorer;
- event data contract;
- quality gates;
- clock sync;
- calibration health;
- POS reconciliation;
- duplicate tracks;
- minimum sample;
- model version, precision и drift;
- immutable audit log;
- checksum export.

### Killer value

Data Trust превращает «магический AI» в объяснимую систему. Он также обнаруживает несостыковки до того, как они попадут на dashboard или в отчёт владельцу.

## 15. ТЗ: Growth Experiments

### Обязательные блоки

- hypothesis;
- control/treatment;
- primary metric;
- sample/progress;
- uplift;
- confidence;
- estimated value;
- weather/day/staffing/promo guardrails;
- draft/running/completed;
- rollout plan;
- методика и данные.

### Acceptance criteria

- completed experiment отделён от forecast;
- draft нельзя масштабировать;
- rollout создаётся на подтверждение;
- effect не показывается без confidence/measurement context;
- experiment привязан к active location.

## 16. ТЗ: Labor, Prep, Safety and Finance

### Labor

- demand versus scheduled staff;
- skill-aware rota;
- understaffing windows;
- apply recommendation;
- weekly schedule draft;
- target labor percent.

### Prep & inventory

- item demand;
- stock;
- prep quantity;
- stockout risk;
- purchase order draft;
- prevention of overproduction.

### Safety & HACCP

- cold-chain sensors;
- thresholds;
- handwash compliance;
- checklist;
- evidence;
- critical protocol;
- assignee and recovery confirmation.

### Prime cost

- revenue;
- COGS;
- labor;
- waste;
- discounts/voids;
- contribution;
- plan versus fact;
- AI profit bridge;
- 30-day action potential.

## 17. ТЗ: QR Menu and Guest Experience

### QR-меню

- категории;
- availability toggle;
- stop-list;
- conversion;
- QR preview;
- guest link;
- add-to-cart demo;
- language/location branding;
- Poster sync freshness.
- обязательные name/category/price/POS SKU/tax;
- аллергенная информация как явно опциональное поле;
- публикация недоступна без Poster POS;
- guest search и category filters меняют preview;
- empty preview для локации без опубликованных позиций.

### AI-host

- calls;
- booking;
- waitlist;
- intent and summary;
- weather-aware suggestion;
- handoff to human;
- recording access controls.

### Reputation

- unified inbox;
- topics/sentiment;
- review to operational evidence;
- confidence;
- root cause;
- AI reply draft;
- task creation;
- location-aware cause: нельзя ссылаться на offline камеру, если fleet healthy.

## 18. ТЗ: Content and Screens

### Content studio

- playlists;
- clips;
- schedule;
- weather/traffic/inventory rules;
- screen assignment;
- draft/save;
- smart-rule modal.
- source-aware validation: weather, occupancy/queue и stop-list проверяют соответствующие connectors;
- target devices берутся только из активной локации;
- новая локация начинает с draft playlist и 0 smart rules.

### Screen and tablet control

- device fleet;
- online/offline;
- current playlist;
- live preview;
- clip list;
- publish;
- schedule;
- brightness;
- network/storage/app version;
- remote app restart;
- connection flow.
- обязательный pairing code формата `VF-0000`;
- обязательные location/floor/zone/fallback;
- проверка, что zone принадлежит выбранному floor;
- сохранение подключённого устройства и online state в session model;
- запрет publish/restart для offline device с объяснением причины.

## 19. ТЗ: Alerts and Incident Lifecycle

Статусы:

- detected;
- routed;
- acknowledged;
- in progress;
- resolved;
- false positive;
- verified outcome.

Обязательные поля:

- severity;
- location/zone/source;
- timestamp;
- evidence;
- owner;
- SLA;
- escalation;
- resolution note;
- audit trail.

## 20. Privacy and Security

- edge face blur до передачи;
- raw video остаётся в локальном VMS по умолчанию;
- cloud получает анонимные events, aggregates и event clips;
- no face recognition в текущем scope;
- аудио отключено по умолчанию;
- privacy masks для POS PIN и staff screens;
- retention 7/30/90 дней;
- least privilege;
- location-scoped manager;
- video export approval;
- signed webhooks;
- audit log;
- денежные действия с подтверждением.

## 21. Обязательные UI-состояния

Для каждого data-driven блока:

- loading;
- loaded;
- empty;
- partial data;
- stale;
- source offline;
- integration missing;
- permission denied;
- low confidence;
- error/retry;
- success/confirmed.

В текущем prototype представлены ключевые demo-состояния: healthy, attention, setup, degraded, offline, no source, empty filter, draft, running, completed и confirmation toast.

В v4 добавлены системные состояния `data not ready`, `history accumulating`, `no published QR items`, `no experiment sample`, `lineage unavailable`, `device-zone mismatch` и `connector mapping required`.

## 22. Адаптивность

### Desktop

- fixed sidebar;
- multi-column analytics;
- fleet tables;
- floor plan with inspector;
- full calibration workspace.

### Tablet

- collapsed multi-column sections;
- preserved side inspectors below main content;
- horizontal overflow only для матриц и timeline, где это оправдано.

### Mobile

- burger navigation;
- one-column cards;
- large tap targets;
- secondary detail columns stacked;
- phone mock скрывается, но preview остаётся доступен;
- wide tables scroll horizontally;
- modals ограничены viewport.

## 23. Accessibility

- semantic buttons for actions;
- `aria-label` для icon-only close/profile/notification;
- состояние active выражено не только цветом, но и текстом/иконкой;
- disabled state для недоступного rollout;
- достаточный contrast основных controls;
- фокус не должен теряться при открытии modal/drawer в production implementation;
- live timestamps не должны постоянно озвучиваться screen reader без opt-in.
- все modal/drawer surfaces имеют `role="dialog"`, `aria-modal` и доступный title;
- icon-only actions имеют `aria-label`;
- поля находятся внутри label либо имеют `aria-label`/`aria-labelledby`;
- все 51 input, 44 select и 1 textarea являются controlled/read-only/disabled, без uncontrolled defaults;
- визуальные ellipsis/search/category элементы либо стали реальными controls, либо удалены как ложные affordances.

## 24. Исследовательская база

Функциональная модель сверена с публичными продуктами и официальной документацией:

- NVIDIA DeepStream: ROI, overcrowding, direction и line crossing — https://docs.nvidia.com/metropolis/deepstream/7.1/text/DS_plugin_gst-nvdsanalytics.html
- NVIDIA AutoMagicCalib: camera-to-floor calibration и validation — https://docs.nvidia.com/metropolis/deepstream/9.1/text/DS_AutoMagicCalib.html
- Cisco Meraki MV: line crossing и occupancy area — https://documentation.meraki.com/IoT/MV_-_Smart_Cameras/Operate_and_Maintain/Video_Analytics/MV_Presence_Analytics
- Verkada: floor plan placement и camera calibration для heatmap — https://help.verkada.com/verkada-cameras/configuration-and-setup/people-heat-maps-for-floor-plans
- Tenzo: unified restaurant data, forecasting и actions — https://www.gotenzo.com/
- Nory: forecast, scheduling, ordering, payroll и inventory — https://www.nory.ai/agentic-ai
- PathSpot: safety, hygiene, temperature и tasks — https://pathspot.com/
- MarketMan: inventory, recipe cost и purchasing — https://www.marketman.com/platform

Вывод аудита конкурентов: отдельная функция не является killer feature. Killer feature VenueFlow — связать пространственный video context с финансовым результатом, показать provenance и затем доказать outcome контрольным экспериментом.

## 25. Критерии приёмки всего prototype

### Навигация

- все 37 страниц доступны из sidebar;
- активный раздел подсвечен;
- mobile menu открывается и закрывается;
- глобальные notification/profile/date controls работают.

### Location context

- четыре mock-локации переключаются;
- название, camera health, ключевые KPI, QR branding, screen fleet и AI меняются;
- статусы не противоречат количеству online sources.
- пользователь может создать пятую локацию и пройти связный setup flow;
- новая локация не наследует Franko metrics или другой seeded context;
- координаты, часы, планы, зоны, камеры, экраны и connectors сохраняются между переходами в текущей сессии.

### Камеры

- есть list/grid и status filters;
- есть add-camera wizard;
- camera требует location/floor/zone;
- есть stream test;
- есть placement;
- есть analytics compatibility;
- есть privacy;
- есть calibration and validation;
- зоны без источника помечены.
- floor/zone options берутся из единой spatial model;
- 0 камер всегда означает setup required, а не healthy/100%;
- historical analytics остаётся blocked до накопления событий.

### Действия

- основные CTA меняют состояние, открывают modal/drawer/page или показывают подтверждение;
- нет визуально активных dead buttons в доступных сценариях;
- destructive/money actions не применяются молча.
- 250 button controls имеют handler или допустимый submit type;
- 0 icon-only buttons без accessible name;
- 0 полей без accessible label;
- 0 controlled fields без change/read-only/disabled contract.

### Trust and outcome

- metric lineage доступен;
- data quality warnings видны;
- model drift показан;
- audit log доступен;
- experiment показывает control/treatment/confidence/guardrails;
- rollout создаётся как plan, не как мгновенное применение.

### Технические проверки

- ESLint без ошибок и предупреждений;
- UI TypeScript-модули проходят noEmit typecheck;
- `git diff --check` без whitespace errors;
- автоматизированные interaction-contract tests: controls, modal semantics, 37/37 data contracts, persisted setup chain;
- production build и artifact validation проходят;
- checkpoint build должен завершиться успешно;
- при невозможности browser preview ограничение фиксируется отдельно и не маскируется.

## 26. Рекомендованный production roadmap

### Phase 1 — Foundation

- tenant/org/location model;
- authentication/RBAC;
- camera/VMS registry;
- edge gateway;
- event schema;
- plan/zone/calibration storage;
- audit log.

### Phase 2 — Core analytics

- people count;
- line crossing;
- occupancy/dwell;
- queue;
- table states;
- service SLA;
- data quality.

### Phase 3 — Restaurant integrations

- POS;
- weather;
- labor;
- inventory/recipes;
- reservations;
- reviews;
- notification routing.

### Phase 4 — Decision layer

- forecast;
- shift copilot;
- what-if;
- experiment engine;
- outcome attribution;
- network benchmarks.

### Phase 5 — Enterprise

- regional data residency;
- SSO/SCIM;
- advanced retention;
- model governance;
- signed evidence export;
- SLA and fleet observability;
- partner marketplace.

## 27. Главные изменения v4 после профессионального QA-аудита

1. Каждая из 37 страниц получила явный data contract со scope, периодом, sources, gates, freshness и failure mode.
2. Добавлен глобальный Data Context bar и drawer «Как формируется».
3. Добавлен Data Readiness gate: новая локация не получает чужие mock-графики.
4. В location model добавлены business hours, coordinates, plans, custom zones, cameras, screens, connectors, privacy и history days.
5. Полная цепочка location → floor plan → zone → camera → stream test → placement → privacy → calibration сохраняется между переходами.
6. Исправлен ложный healthy state при 0 камер и деление `0/0`.
7. Устранено наследование KPI/погоды/QR/screens/AI контекста Franko новой локацией.
8. Seeded floor zones нормализованы по числу этажей, zone count и общей capacity.
9. Camera floor/zone и screen floor/zone используют одну spatial model; cross-floor mismatch блокируется.
10. Camera wizard учитывает тип зоны, инвалидирует stream test после изменения источника и сохраняет privacy/retention.
11. Setup Center рассчитывает blockers по фактическим dependencies и ведёт к первому незавершённому шагу.
12. Integrations расширены до 14 connector types, требуют connection test и location mapping и сохраняются в активной локации.
13. QR Menu не публикует позиции без POS, показывает честный пустой preview и получил рабочий guest search/categories.
14. Screens сохраняются в location model; smart content rule проверяет target, fallback и источник сигнала.
15. Alerts проверяют zone/camera/sensor/channel dependencies и числовые диапазоны.
16. Data Trust не показывает lineage/model quality без источников и выборки.
17. Growth Experiments не наследуют чужой portfolio и effect для новой локации.
18. Venue AI сообщает реальное число history days и не придумывает profit без POS/Inventory/Labor.
19. Убраны ложные ellipsis/search/category affordances: они стали controls либо были удалены.
20. Добавлены автоматизированные tests для 250 buttons, 96 form controls, modal semantics, 37 contracts и persisted dependency chain.

---

Итог: v4 представляет цельный, честный demo product, в котором конфигурация и доступность данных предшествуют метрикам. Для production реализации главным техническим риском остаётся не UI, а качество spatial configuration, edge pipeline, event identity, cross-camera tracking, connector reconciliation и дисциплина data contracts.
