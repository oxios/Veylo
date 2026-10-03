# CLAUDE.md — VenueFlow (рабочие инструкции для Claude Code)

Этот файл читается автоматически в начале каждой сессии. Он описывает, как устроен проект,
какие правила нельзя нарушать и как проверять свою работу. Язык общения с пользователем — русский.

## 1. Что это за проект

VenueFlow — видеоаналитика и операционное управление для кафе/ресторанов/QSR.

**Проект начат с нуля (28.09.2026)**, строим MVP вертикальным срезом:
заклад → камера (RTSP наживо или загрузка файлов) → YOLO + трекинг → разметка на кадре → метрики на «Головна».
С 02.10.2026 есть **живые RTSP-камеры и узлы обработки** (ТЗ и все решения пользователя: `docs/TZ_Live_Cameras_RU.md`).
Следующие этапы: чат-бот поверх метрик (LLM с tool calling, ключ только на бэкенде), алерты, POS.
План этажа не нужен: зоны рисуются на кадре.
Весь прежний прототип (37 экранов, locations/floors/zones/plan/camera-vision API, контрактные тесты)
лежит в git-ветке **`old`** (коммит `fcc6e13`). Оттуда можно брать код по частям (`git show old:<path>`), но переносить
только то, что берём в работу сейчас.

| Часть | Путь | Стек | Порт |
|---|---|---|---|
| Frontend | `app/`, `worker/`, `vite.config.ts` | Next.js 16 App Router, собирается через **Vite + vinext** как Cloudflare Worker; React 19, TS, Tailwind v4 (только `@import`, классы рукописные) | 5173 |
| API | `backend/` | Express 5 + Mongoose 8 + Zod + multer, CommonJS (`require`) | 4000 |
| Узел обработки | `camera-node/`, `deploy/node/` | Python 3.11, Ultralytics YOLO11s (CUDA или CPU) + ByteTrack, ffmpeg; ходит **только в API** (HTTP + WebSocket, токен узла), Mongo не видит | — |
| MediaMTX узла | `deploy/node/mediamtx.yml` | тянет камеры (main + sub), пишет архив 24 ч (fMP4, только видео), playback | внутр. |
| MediaMTX hub | `deploy/hub/mediamtx.yml` | принимает live от узлов (RTSP), отдаёт браузеру WebRTC через WHEP-прокси API | 8554, 8189 |
| DB | docker | MongoDB 8.0 | 27017 |

Live-пайплайн: API назначает RTSP-камеру на наименее загруженный онлайн-узел → heartbeat узла (5 с) получает конфиг
с расшифрованными URL → `camera-node` настраивает пути своего MediaMTX (`c<id>_main` → ffmpeg без аудио → `c<id>_rec` с записью,
`c<id>_sub` для анализа) → YOLO по субпотоку ~5 fps, треки (точка ног, 2 Гц) и покрытие (секунды анализа) уходят батчами
в `POST /api/node/observations` → `livetracks` (TTL 7 дней) → rollup-цикл API пересчитывает «грязные» часы в `camerahours`
(хранятся бессрочно; `backend/src/services/live-metrics.js` — чистые функции). Пока открыт live-просмотр (SSE), узел
публикует субпоток в hub и шлёт рамки по WebSocket. Архив и фрагменты — на диске узла, браузер получает их через API.
Загрузка файлов: `POST /api/cameras/:id/videos` → `videos{status:"queued"}` → любой онлайн-узел забирает задачу через
`/api/node/jobs/*`, скачивает файл, пишет треки → метрики считаются **на лету** (`video-metrics.js`).

Продуктовые документы (описывают целевой продукт, а не текущий код): `docs/VenueFlow_Product_Spec_v4_RU.md`
(инварианты в разделе 6, roadmap в разделе 26) и `docs/VenueFlow_QA_Audit_v4_RU.md`. `backend/README.md` — контракт API.
Питч: `docs/VenueFlow_Pitch_RU.pdf`, исходник `docs/pitch/VenueFlow_Pitch_RU.html`; PDF рендерится headless Chrome
(`chrome.exe --headless=new --no-pdf-header-footer --print-to-pdf=... file:///.../docs/pitch/VenueFlow_Pitch_RU.html`).

Честность данных — главный продуктовый принцип: `источник → настройка → событие → метрика → вывод → действие → ответственный → результат`.
Если звена нет, UI показывает пустое/blocked-состояние, а не выдумывает данные. Mock-данные в кабинет не возвращать.

## 2. Как запускать и проверять

```bash
docker compose up -d --build --remove-orphans   # mongo, api, mediamtx (hub), node-mediamtx, camera-node, frontend
docker compose ps                                # api, mongo, camera-node, frontend — healthy; node-init — exited (0)
docker compose logs -f camera-node               # камеры (online / ошибки RTSP), задачи видео, столики
docker compose logs -f node-mediamtx             # подключение к камерам, запись
docker compose --profile dev-camera up -d fake-camera   # тестовая RTSP-камера: rtsp://fake-camera:8554/main и /sub
docker compose logs -f api
docker compose down                              # volume venueflow_mongo_data сохраняется
```

Нужен `.env` в корне (шаблон `.env.example`); он **не коммитится**, значения никогда не печатать.
Обязательны также `CAMERA_SECRET_KEY` (шифрует RTSP-пароли; смена ключа делает сохранённые пароли нечитаемыми),
`MEDIAMTX_SECRET`, `LOCAL_NODE_SECRET` (локальный узел входит токеном `vfn_local_<secret>`).
На этой машине есть RTX 4060 Ti: в `.env` стоит `COMPOSE_FILE=docker-compose.yml;docker-compose.gpu.yml` (CUDA-образ узла).
Удалённый узел: `deploy/node/` (`.env` с `VENUEFLOW_URL` и `NODE_TOKEN` из админки, GPU — `docker-compose.gpu.yml`).
Приложение: http://127.0.0.1:5173 (`scripts/frontend-runtime.mjs` проксирует `/api` → `api:4000`).
Логин — seed-owner из `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`. Smoke: `curl -s http://127.0.0.1:5173/api/health`.

Frontend без Docker: `npm run dev` (проксирует `/api` на `VENUEFLOW_API_URL` или `127.0.0.1:4000`, API должен быть поднят).

```bash
node node_modules/vinext/dist/cli.js build      # сборка dist/ (то же делает Dockerfile.frontend)
node --test tests/*.test.mjs                    # нужен свежий dist/
npx eslint app tests worker db vite.config.ts   # корневой `eslint .` тянет backend и даёт ложные require-ошибки
npx tsc --noEmit
cd backend && npm install && npm test && npm run check   # node:test, без Mongo и сети
```

Бэкенд-тесты подменяют зависимости через параметры/фейковые объекты, mock-библиотек нет; новые тесты писать так же.
Тесты узла (stdlib `unittest`, только чистые функции `app/pipeline.py`): `docker compose exec camera-node python -m unittest discover tests`
или локально `cd camera-node && python -m unittest discover tests` (без torch). Сборка образа узла долгая (torch cu128 ~3 ГБ, CPU ~1 ГБ);
BuildKit иногда выкидывает этот слой из кеша — тогда пересборка снова качает torch (~10 мин), это не ошибка.
Если pip падает с `ResolutionImpossible`, сначала смотреть на сетевые таймауты, а не на версии.
`docker compose up --build <сервис>` пересобирает и зависимости (api) — открытые SSE/WebSocket при этом рвутся.

Git Bash: для `docker compose exec ... /data/...` нужен `MSYS_NO_PATHCONV=1`, иначе путь превращается в `C:/Program Files/Git/...`.
Кириллица в `curl -d` из Git Bash уходит не в UTF-8 — тестовые данные с кириллицей создавать через UI или node-скрипт.
E2E-проверка: публичный ролик `https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4`
(50 с, 7 человек заходят снизу кадра) → разметка линии `y=0.85`, `inside:"negative"` должна дать 7 входов.
Тот же ролик крутит `fake-camera` по RTSP (live-проверка). Реальная тестовая камера пользователя — hybrid, Imou/Dahua:
main HEVC 1280×720 25 fps + AAC, sub H.264 640×480 15 fps (анаморфный, поле зрения то же); URL с паролем есть только
в БД (зашифрован) — в файлы и коммиты не писать.
Грабли RTSP: снимок из HEVC без ключевого кадра — серое месиво, поэтому `grab_jpeg` использует `-skip_frame nokey`.
MediaMTX 1.21: хуки `runOnAvailable` (не `runOnReady`), статус пути — поле `available`.

### Известный baseline (не «чинить» попутно)

- `npx tsc --noEmit` падает только на `db/index.ts` и `worker/index.ts` (нет типов Cloudflare).
- `eslint app`: 1 ошибка `react-hooks/set-state-in-effect` в `auth.tsx` (`checkSession` в эффекте) + 1 warning.
- Правило: не добавлять новых ошибок lint/tsc в изменённых строках.

## 3. Фронтенд

- `app/page.tsx` — клиентский `Home` = `AuthGate` → `VenueFlowDashboard` (sidebar с выбором заклада, header, контент,
  модалка «Новий заклад»). Экраны: `PageKey = "overview" | "guests" | "staff" | "cameras" | "videos" | "admin"` (`app/types.ts`), реестры `nav`
  и `titles` в `page.tsx`; `admin` («Вузли обробки») только при `user.isAdmin`. Неизвестный путь → `/overview`.
  `app/[screen]/page.tsx` реэкспортирует `Home`.
  Новый экран = `PageKey`, `nav`, `titles`, рендер по `page` и тест.
- Данные заклада (`cameras`, `videos`, `worker`) грузит `page.tsx` и отдаёт экранам как `PageContext`; пока есть видео
  в `queued/processing`, опрос каждые 3 с; при наличии RTSP-камер — каждые 10 с (статус узла). Экраны и модули:
  `overview.tsx` (чеклист → полоса «Зараз» → `LiveDashboard` с периодами и KPI по типу камеры → `Dashboard` загруженных видео),
  `guests.tsx` (день: KPI, лента дня-Gantt, журнал визитов), `staff.tsx` (очередь «Оберіть працівника», зміна, стрічка,
  «Стійка без персоналу»), `people-ui.tsx` (DayPicker, PersonAvatar, DayTimeline, VisitClip, PersonDrawer — общие для
  гостей, персонала и клика по рамке в «Наживо»),
  `cameras.tsx` (сетка карточек + карточка камеры с вкладками Наживо / Архів / Розмітка / Налаштування; `useNow`),
  `camera-wizard.tsx` (мастер: подключение + проба через узел → тип → подтверждение), `live-view.tsx` (WebRTC/WHEP +
  canvas-рамки и следы из SSE), `archive-view.tsx` (таймлайн 24 ч, фрагменты, HEVC → H.264 при необходимости),
  `markup-editor.tsx` (инструменты по типу: лінія дверей/поріг, тротуар, проріз дверей, зала, столики; перетаскивание
  точек, подсказки YOLO), `charts.tsx` (BarChart с наложением рядов, HeatmapPanel, TableGrid), `camera-ui.tsx` (статусы,
  типы, кадр, слой разметки), `admin.tsx` (узлы, токены, распределение камер), `videos.tsx`, `video-status.tsx`, `format.ts`.
- Цвета рядов — валидированная палитра (`--s1` синий «зайшло», `--s2` оранжевый «пройшло повз», `--s3` для одиночных
  рядов); одна ось, тултипы, табличный вид; статусы — иконка + текст. Пробелы покрытия — штриховка, не ноль.
- Метрика без разметки = blocked-карточка со ссылкой «Розмітити», а не ноль. Без обработанного видео дашборд не рендерится.
- `app/login/page.tsx` → `LoginScreen`; `app/auth.tsx` — `AuthGate`/`useAuth`/`LoginScreen`; `app/api-client.ts` — `apiFetch`
  (база `NEXT_PUBLIC_API_URL ?? "/api"`, `credentials: include`). `app/chatgpt-auth.ts` не используется, оставлен намеренно.
- Состояние — `useState`, один контекст Auth. Нет localStorage/sessionStorage.
- CSS — один `app/globals.css`, подключён в `app/layout.tsx`. Язык UI — украинский (`<html lang="uk">`),
  идентификаторы и комментарии — английские.
- `tests/interaction-contract.test.mjs` (статический анализ исходников): каждая `<button>` имеет `onClick` или `type`;
  каждый `input/select/textarea` — accessible label, controlled `value`/`checked` и `onChange`/`readOnly`/`disabled`,
  никаких `defaultValue`/`defaultChecked`; элементы с классом `modal`/`drawer`/`dialog` — `role="dialog"`, `aria-modal="true"`
  и accessible name (file input — `value=""` + `onChange`); кабинет обёрнут в `AuthGate`; дашборд загрузок только при `hasDone`;
  blocked-тексты KPI (и upload, и live) проверяются дословно; в compose есть hub, `node-mediamtx`, `camera-node`, узел не
  получает Mongo, нет onvif; секреты камер/узлов не встречаются в `app/`.
- CSS: не использовать `font: 700 13px inherit` — это невалидно (браузер выбрасывает всё правило). Писать `font-family: inherit` отдельно.

## 4. Бэкенд

- `backend/src/app.js`: helmet → CORS-allowlist (отказ = 403 `CORS_DENIED`) → json 1 MB → cookieParser → morgan →
  публичный `GET /api/health` → `/api/node` (токен узла, свои body-парсеры, смонтирован **до** глобального json) →
  `/api/internal` (хук MediaMTX) → `/api/auth` → за `requireAuth`: `/api/venues`, `/api/cameras`, `/api/videos`,
  `/api/processing`, `/api/admin` (+`requireAdmin`, чужим 404) → `notFound` → `errorHandler`. WebSocket узлов —
  `upgrade` на `/api/node/ws` в `server.js`; фоновые циклы (rollup, финализация треков, назначение камер, requeue задач,
  чистка клипов, обновление визитов, стирание векторов) — `services/background.js`.
  Гости и персонал (ТЗ `docs/TZ_Guests_Staff_RU.md`): после каждого батча наблюдений `services/people.js` превращает треки
  в людей дня (`persons`: «Гість №N», номера с 1 каждый день; роль staff), визиты (`visits`) и подписи рамок для SSE;
  чистая логика — `services/people-metrics.js` (пороги ReID откалиброваны на реальной камере), роуты — `routes/people.js`. Модель заведения — `Venue` (коллекция `venues`; старые `locations`
  в БД от прототипа не трогаем). Контракт — `backend/README.md`.
- Загрузка видео: ownership камеры проверяется **до** multer; тип — только по magic bytes (`services/video-files.js`);
  имена файлов генерирует сервер, `storagePath` отвергает всё остальное; при любой ошибке временный файл удаляется.
  Удаление видео/камеры/заклада — через `services/video-cleanup.js` (записи + треки + файлы).
- Auth: JWT HS256 в httpOnly cookie `venueflow_token` (SameSite=Lax); bearer-токен только при `X-Auth-Mode: bearer`.
  Пользователь перечитывается из БД на каждом запросе. Роль `owner` + флаг `isAdmin` (seed-owner — админ платформы).
- Узлы: токен `vfn_<slug>_<secret>`, в БД только sha256; RTSP-адреса запечатаны AES-256-GCM (`services/secret-box.js`),
  расшифровываются только в `buildNodeConfig`. Узел может писать только в свои камеры (409 иначе).
- Валидация: Zod в `validation/schemas.js`, middleware `validate(schema, source)` → `req.validated[source]`, ошибка = 422 `VALIDATION_ERROR`.
- Ошибки: `new ApiError(status, message, code)`; `error-handler.js` маскирует 5xx. Хендлеры через `asyncHandler`.
- Ответы: `toJSON` из `utils/schema-options.js` отдаёт `id` и вырезает `_id, __v, ownerId, passwordHash, data`.
  Списки — множественный ключ, единичные — единственный, DELETE → 204, создание → 201.
- Для новых ресурсов: выборка всегда с `ownerId` через `services/ownership.js`, чужой ресурс = 404.

## 5. Жёсткие запреты

- **RTSP разрешён** (решение пользователя 02.10.2026) только через узлы обработки; **ONVIF/автопоиск — нет** без явного решения.
- Аудио с камер не записывается и не транслируется (`-map 0:v:0`). Архив видео — 24 ч на узле, не дольше.
- RTSP-пароли и токены узлов никогда не возвращаются API в браузер и не пишутся в логи (`mask_url` на узле).
- Секреты (`JWT_SECRET`, пароли, будущие API-ключи) — только в `.env` бэкенда/compose. Никогда как `VITE_*`/`NEXT_PUBLIC_*`,
  никогда в ответах API, логах, коммитах, сообщениях пользователю.
- Не выдавать mock за работающие интеграции (POS, weather, Telegram, платежи, экспорт).
- `camera-node` использует Ultralytics под **AGPL-3.0**: local-dev runtime, license notice в `camera-node/README.md` не удалять,
  перед продакшеном нужно решение по лицензии.
- Приватность: лица не хранятся и не распознаются. Повторный гость узнаётся только в пределах дня по вектору внешности
  (одежда/силуэт, ReID): вектор не уходит в браузер и стирается после конца дня. Вырез человека для журнала живёт
  на узле не дольше архива (24 ч), API его не хранит. Номер гостя действует только в пределах дня — не обещать
  узнавание «завтра» без решения пользователя по биометрии. Исходное видео удаляется после обработки (`VIDEO_DELETE_AFTER_PROCESSING`).
- Не трогать зарезервированные пути ChatGPT SIWC (`/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`).

## 6. Рабочие правила

- Изменил Zod-схему → проверь, что фронтенд шлёт ровно эти поля, и обнови `backend/README.md`.
- Изменил `docker-compose.yml`, `.env.example`, `backend/src/config/env.js` → синхронизировать все и `backend/.env.example`.
- После изменений в бэкенде: `docker compose up -d --build api`; во фронтенде: `docker compose up -d --build frontend` (~1–2 мин);
  в узле: `docker compose up -d --build camera-node` (если слой torch не выпал из кеша — пара минут).
- Изменил протокол узла (heartbeat/observations/WS-команды) → правь обе стороны (`backend/src/routes/node-api.js`,
  `camera-node/app/*`) и `backend/README.md`.
- Перед «готово»: 1) eslint изменённых файлов; 2) `node --test tests/*.test.mjs` (со свежим `dist`) и/или `cd backend && npm test`;
  3) `docker compose ps` — всё healthy; 4) `curl /api/health`. Результаты сообщать как есть.
- Коммиты только по просьбе пользователя. `dist/`, `.sites-runtime/`, `.wrangler/`, `.env`, логи — в `.gitignore`.
- В Bash-инструменте — Git Bash (POSIX), отдельно доступен PowerShell.
- Docker Desktop должен быть запущен; старые контейнеры `backend-*` (echonoar) и образ `mongo:7` к проекту не относятся — не удалять.
