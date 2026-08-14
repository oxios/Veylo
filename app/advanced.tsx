/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Box,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coffee,
  Eye,
  FileSearch,
  Flame,
  FlaskConical,
  Gauge,
  Headphones,
  Lightbulb,
  MapPin,
  MessageSquareText,
  Mic,
  PackageCheck,
  PhoneCall,
  Play,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  UserRoundCheck,
  Users,
  Utensils,
  Video,
  Volume2,
  WandSparkles,
  Zap,
} from "lucide-react";

type Notify = (message: string) => void;

export function ImpactStrip({ go }: { go: (page: string) => void }) {
  return (
    <section className="v2-impact-strip">
      <div className="v2-impact-copy">
        <div>
          <Sparkles />
        </div>
        <p>
          <span>VENUEFLOW AUTOPILOT</span>
          <strong>Сегодня система нашла ₴14 860 потенциальной прибыли</strong>
          <em>
            3 действия можно применить прямо сейчас · ожидаемый эффект +6,8%
          </em>
        </p>
      </div>
      <div className="v2-impact-actions">
        <button onClick={() => go("copilot")}>
          <Bot />
          Открыть смену
        </button>
        <button onClick={() => go("profit")}>
          <ShieldAlert />
          Потери ₴3 240
        </button>
        <button onClick={() => go("simulator")}>
          <FlaskConical />
          Что-если
        </button>
      </div>
    </section>
  );
}

function MiniMetric({ icon: I, label, value, delta, tone = "green" }: any) {
  return (
    <article className="card v2-mini-metric">
      <div className={`v2-mm-icon ${tone}`}>
        <I />
      </div>
      <p>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{delta}</em>
      </p>
    </article>
  );
}
function Pill({
  children,
  tone = "neutral",
}: {
  children: any;
  tone?: string;
}) {
  return <span className={`v2-pill ${tone}`}>{children}</span>;
}

export function ShiftCopilot({ notify }: { notify: Notify }) {
  const [auto, setAuto] = useState(true);
  const [done, setDone] = useState<number[]>([0]);
  const actions = [
    {
      time: "17:30",
      title: "Вызвать Ирину на 30 минут раньше",
      why: "В 18:05 ожидается +28 гостей сверх плана",
      effect: "−3:40 ожидания",
      kind: "staff",
    },
    {
      time: "17:45",
      title: "Увеличить prep чизкейка на 6 порций",
      why: "Остаток закончится к 20:10 с вероятностью 84%",
      effect: "+₴1 074",
      kind: "prep",
    },
    {
      time: "18:00",
      title: "Включить Terrace drinks на 3 экранах",
      why: "+24°C, терраса свободна на 52%, холодные напитки растут",
      effect: "+₴2 860",
      kind: "promo",
    },
    {
      time: "18:20",
      title: "Перенаправить раннера в зону B",
      why: "5 столов близки к нарушению SLA выдачи",
      effect: "−22% задержек",
      kind: "service",
    },
  ];
  const apply = (i: number) => {
    setDone((x) => [...x, i]);
    notify("Действие применено и добавлено в журнал смены");
  };
  return (
    <>
      <section className="v2-copilot-hero">
        <div className="v2-copilot-title">
          <div>
            <Bot />
          </div>
          <p>
            <span>СМЕНА · 14 АВГУСТА</span>
            <strong>AI-диспетчер держит вечерний пик под контролем</strong>
            <em>
              Собирает видео, POS, погоду, остатки и график команды в один план
            </em>
          </p>
        </div>
        <label className="v2-auto-switch">
          <span>{auto ? "Автопилот включён" : "Режим рекомендаций"}</span>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <i />
        </label>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={Users}
          label="Прогноз до закрытия"
          value="642 гостя"
          delta="+11% к плану"
        />
        <MiniMetric
          icon={CircleDollarSign}
          label="Потенциал действий"
          value="₴8 940"
          delta="4 решения"
          tone="blue"
        />
        <MiniMetric
          icon={Gauge}
          label="Риск SLA"
          value="Средний"
          delta="пик 18:05–19:40"
          tone="amber"
        />
        <MiniMetric
          icon={CheckCircle2}
          label="Выполнено AI"
          value={`${done.length}/4`}
          delta="за эту смену"
          tone="violet"
        />
      </section>
      <section className="v2-copilot-layout">
        <article className="card v2-runbook">
          <div className="card-head">
            <div>
              <span>ЖИВОЙ ПЛАН СМЕНЫ</span>
              <h2>Следующие решения</h2>
            </div>
            <Pill tone="live">
              <i /> LIVE
            </Pill>
          </div>
          <div className="v2-runbook-list">
            {actions.map((a, i) => {
              const complete = done.includes(i);
              return (
                <div className={complete ? "done" : ""} key={a.title}>
                  <time>{a.time}</time>
                  <span className={`v2-node ${a.kind}`}>
                    <Zap />
                  </span>
                  <p>
                    <strong>{a.title}</strong>
                    <em>{a.why}</em>
                    <span>
                      Ожидаемый эффект <b>{a.effect}</b>
                    </span>
                  </p>
                  {complete ? (
                    <Pill tone="success">
                      <Check />
                      Применено
                    </Pill>
                  ) : (
                    <button className="primary" onClick={() => apply(i)}>
                      Применить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </article>
        <aside className="v2-copilot-side">
          <article className="card v2-shift-score">
            <div className="card-head">
              <div>
                <span>ЗДОРОВЬЕ СМЕНЫ</span>
                <h2>Shift score</h2>
              </div>
              <strong>91</strong>
            </div>
            {[
              ["Гости и очередь", 94],
              ["Команда", 86],
              ["Кухня", 89],
              ["Остатки", 96],
            ].map((x) => (
              <div key={x[0] as string}>
                <span>{x[0] as string}</span>
                <i>
                  <b style={{ width: `${x[1]}%` }} />
                </i>
                <strong>{x[1]}</strong>
              </div>
            ))}
          </article>
          <article className="card v2-digest">
            <div className="card-head">
              <h2>Брифинг менеджеру</h2>
              <Volume2 />
            </div>
            <p>
              «Вечером будет на 11% больше гостей. Главный риск — зона B и запас
              чизкейка. Я подготовил четыре действия; три можно выполнить без
              подтверждения».
            </p>
            <button
              className="secondary full"
              onClick={() => notify("Аудиобрифинг запущен")}
            >
              <Play />
              Прослушать · 0:42
            </button>
          </article>
          <article className="card v2-guardrail">
            <ShieldCheck />
            <p>
              <strong>Human-in-the-loop</strong>
              <span>
                Деньги, график и заказы поставщикам всегда требуют подтверждения
                менеджера.
              </span>
            </p>
          </article>
        </aside>
      </section>
    </>
  );
}

export function VideoSearchPage({ notify }: { notify: Notify }) {
  const [query, setQuery] = useState(
    "столы, где гости ждали официанта больше 5 минут вчера",
  );
  const [selected, setSelected] = useState(0);
  const [searched, setSearched] = useState(true);
  const [queryError, setQueryError] = useState("");
  const results = [
    {
      time: "Вчера · 19:42",
      cam: "CAM-02 · Главный зал",
      title: "Стол 8 · ожидание 7:18",
      tags: ["первый контакт", "SLA +2:18"],
      score: "98%",
    },
    {
      time: "Вчера · 20:11",
      cam: "CAM-03 · Зона B",
      title: "Стол 17 · ожидание 6:44",
      tags: ["официант вне зоны", "SLA +1:44"],
      score: "95%",
    },
    {
      time: "Вчера · 18:36",
      cam: "CAM-02 · Главный зал",
      title: "Стол 4 · ожидание 5:52",
      tags: ["смена пересекается", "SLA +0:52"],
      score: "93%",
    },
    {
      time: "Вчера · 21:08",
      cam: "CAM-04 · Терраса",
      title: "Стол 23 · ожидание 5:31",
      tags: ["высокая загрузка", "SLA +0:31"],
      score: "91%",
    },
  ];
  const run = () => {
    if (query.trim().length < 3) { setQueryError("Опишите событие минимум тремя символами или выберите пример запроса."); setSearched(false); return; }
    setQueryError("");
    setSearched(true);
    setSelected(0);
    notify("Найдено 4 релевантных видеофрагмента");
  };
  return (
    <>
      <section className="v2-search-hero">
        <div>
          <FileSearch />
          <p>
            <span>ПОИСК ПО ВИДЕО ОБЫЧНЫМ ЯЗЫКОМ</span>
            <strong>Найдите любое операционное событие за секунды</strong>
          </p>
        </div>
        <div className="v2-searchbar">
          <Search />
          <input
            aria-label="Запрос для поиска по видео"
            required
            minLength={3}
            placeholder="Например: очередь больше 8 гостей вчера после 18:00"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setQueryError(""); }}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button onClick={run}>Найти</button>
        </div>
        <div className="v2-query-chips">
          {[
            "скидка больше 20% и рядом не было гостя",
            "курьеры ждали больше 8 минут",
            "все падения на кухне",
            "неубранные столы после 19:00",
          ].map((x) => (
            <button
              key={x}
              onClick={() => {
                setQuery(x);
                setSearched(false);
                setQueryError("");
              }}
            >
              {x}
            </button>
          ))}
        </div>
        {queryError && <p className="v2-search-error" role="alert"><AlertTriangle />{queryError}</p>}
      </section>
      <section className="v2-video-search-layout">
        <article className="card v2-result-list">
          <div className="card-head">
            <div>
              <span>РЕЗУЛЬТАТЫ</span>
              <h2>
                {searched ? "4 фрагмента · 23 минуты видео" : "Нажмите «Найти»"}
              </h2>
            </div>
            <button className="secondary" onClick={() => notify("Открыты фильтры: камера, зона, дата и confidence")}>
              <SlidersHorizontal />
              Фильтры
            </button>
          </div>
          {searched &&
            results.map((r, i) => (
              <button
                className={selected === i ? "active" : ""}
                onClick={() => setSelected(i)}
                key={r.title}
              >
                <div className={`v2-clip-thumb clip${i}`}>
                  <Play />
                  <time>00:{18 + i * 7}</time>
                </div>
                <p>
                  <span>{r.time}</span>
                  <strong>{r.title}</strong>
                  <em>{r.cam}</em>
                  <i>
                    {r.tags.map((t) => (
                      <b key={t}>{t}</b>
                    ))}
                  </i>
                </p>
                <Pill tone="success">{r.score}</Pill>
              </button>
            ))}
        </article>
        <article className="card v2-evidence">
          <div className="card-head">
            <div>
              <span>ДОКАЗАТЕЛЬСТВО</span>
              <h2>{results[selected].title}</h2>
            </div>
            <button className="secondary" onClick={() => notify("Видеофрагмент открыт в полноэкранном режиме")}>
              <Eye />
              Полный экран
            </button>
          </div>
          <div className="v2-evidence-video">
            <span>CAM-02 · 19:40:12</span>
            <em>TRACK #A84 · анонимно</em>
            <div className="v2-table-box">
              <b>Стол 8</b>
              <small>ожидание 7:18</small>
            </div>
            <div className="v2-staff-box">
              <b>Официант</b>
              <small>вне зоны 4:06</small>
            </div>
            <button onClick={() => notify("Воспроизведение доказательного фрагмента запущено")}>
              <Play />
            </button>
          </div>
          <div className="v2-evidence-timeline">
            <i>
              <b />
            </i>
            <span>19:37</span>
            <span>Гости сели</span>
            <span>19:44</span>
          </div>
          <div className="v2-evidence-actions">
            <button
              className="secondary"
              onClick={() => notify("Фрагмент добавлен в обучение команды")}
            >
              <UserRoundCheck />В обучение
            </button>
            <button
              className="primary"
              onClick={() =>
                notify("Создано правило: первый контакт > 5 минут")
              }
            >
              <Plus />
              Создать правило
            </button>
          </div>
        </article>
      </section>
    </>
  );
}

export function ProfitGuard({ notify }: { notify: Notify }) {
  const [selected, setSelected] = useState(0);
  const [resolved, setResolved] = useState<number[]>([]);
  const incidents = [
    {
      time: "20:48",
      title: "Отмена чека после выдачи",
      sum: "₴1 240",
      who: "Касса 2 · Андрей С.",
      risk: "Высокий",
      detail:
        "Чек отменён через 3:12 после передачи заказа. На видео гость получил пакет.",
    },
    {
      time: "19:16",
      title: "Скидка 35% без промокода",
      sum: "₴684",
      who: "POS Bar · Ирина П.",
      risk: "Высокий",
      detail:
        "Ручная скидка применена после оплаты наличными; причина не указана.",
    },
    {
      time: "18:52",
      title: "Открытие денежного ящика",
      sum: "—",
      who: "Касса 1 · пользователь не определён",
      risk: "Средний",
      detail: "Ящик открыт вне транзакции, рядом находились два сотрудника.",
    },
    {
      time: "17:34",
      title: "Повторный возврат позиции",
      sum: "₴438",
      who: "Касса 2 · Андрей С.",
      risk: "Средний",
      detail: "Третий возврат одной позиции за неделю в одной смене.",
    },
  ];
  const close = () => {
    setResolved((x) => [...x, selected]);
    notify("Инцидент отмечен проверенным");
  };
  return (
    <>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={ShieldAlert}
          label="Потенциальные потери"
          value="₴3 240"
          delta="сегодня · 7 событий"
          tone="red"
        />
        <MiniMetric
          icon={ReceiptText}
          label="Проверено POS-событий"
          value="1 842"
          delta="99,7% сопоставлено"
          tone="blue"
        />
        <MiniMetric
          icon={TrendingDown}
          label="Loss rate"
          value="0,52%"
          delta="−0,18 п.п. за месяц"
        />
        <MiniMetric
          icon={Timer}
          label="Время расследования"
          value="1:46"
          delta="вместо 24 минут"
          tone="violet"
        />
      </section>
      <section className="v2-profit-layout">
        <article className="card v2-exceptions">
          <div className="card-head">
            <div>
              <span>POS × ВИДЕО</span>
              <h2>Исключения, требующие проверки</h2>
            </div>
            <Pill tone="danger">4 новых</Pill>
          </div>
          {incidents.map((x, i) => (
            <button
              key={x.title}
              className={`${selected === i ? "active" : ""} ${resolved.includes(i) ? "resolved" : ""}`}
              onClick={() => setSelected(i)}
            >
              <div className="v2-risk-icon">
                <ShieldAlert />
              </div>
              <time>{x.time}</time>
              <p>
                <strong>{x.title}</strong>
                <span>{x.who}</span>
              </p>
              <b>{x.sum}</b>
              <Pill tone={x.risk === "Высокий" ? "danger" : "warning"}>
                {resolved.includes(i) ? "Проверено" : x.risk}
              </Pill>
            </button>
          ))}
        </article>
        <article className="card v2-investigation">
          <div className="card-head">
            <div>
              <span>КАРТОЧКА РАССЛЕДОВАНИЯ</span>
              <h2>{incidents[selected].title}</h2>
            </div>
            <button className="secondary" onClick={() => notify("Открыт связанный чек #28491")}>
              <ReceiptText />
              Чек #28491
            </button>
          </div>
          <div className="v2-pos-video">
            <div className="v2-fake-counter">
              <span>CAM-06 · касса</span>
              <div className="v2-human a" />
              <div className="v2-human b" />
              <div className="v2-counter-line" />
              <button onClick={() => notify("Воспроизведение POS-фрагмента запущено")}>
                <Play />
              </button>
            </div>
            <div className="v2-receipt">
              <span>ЧЕК #28491</span>
              <div>
                <b>2× Телятина</b>
                <em>₴778</em>
              </div>
              <div>
                <b>1× Чизкейк</b>
                <em>₴179</em>
              </div>
              <div>
                <b>2× Лимонад</b>
                <em>₴283</em>
              </div>
              <hr />
              <div>
                <strong>ИТОГО</strong>
                <strong>₴1 240</strong>
              </div>
              <div className="void">
                <b>ОТМЕНЕНО</b>
                <em>20:48:32</em>
              </div>
            </div>
          </div>
          <p className="v2-investigation-note">{incidents[selected].detail}</p>
          <div className="v2-investigation-actions">
            <button
              className="secondary"
              onClick={() => notify("Событие отмечено как допустимое")}
            >
              Допустимая операция
            </button>
            <button className="primary" onClick={close}>
              <Check />
              Завершить проверку
            </button>
          </div>
        </article>
      </section>
    </>
  );
}

export function WasteVision({ notify }: { notify: Notify }) {
  const [applied, setApplied] = useState(false);
  const categories = [
    { name: "Перепроизводство", kg: 8.4, cost: 1680, pct: 72 },
    { name: "Обрезки prep", kg: 4.1, cost: 620, pct: 42 },
    { name: "Возврат тарелок", kg: 3.6, cost: 980, pct: 36 },
    { name: "Истёк срок", kg: 1.2, cost: 410, pct: 18 },
  ];
  return (
    <>
      <section className="v2-waste-hero">
        <div>
          <Trash2 />
          <p>
            <span>WASTE VISION · КАМЕРА + ВЕСЫ</span>
            <strong>Сегодня можно было избежать 6,8 кг списаний</strong>
            <em>
              AI распознаёт продукт, вес, стоимость и вероятную причину без
              ручного ввода
            </em>
          </p>
        </div>
        <Pill tone="success">
          <i /> устройство онлайн
        </Pill>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={Trash2}
          label="Списано сегодня"
          value="17,3 кг"
          delta="₴3 690"
          tone="red"
        />
        <MiniMetric
          icon={TrendingDown}
          label="К baseline"
          value="−18%"
          delta="цель −25%"
        />
        <MiniMetric
          icon={CircleDollarSign}
          label="Экономия месяца"
          value="₴24 860"
          delta="после рекомендаций"
          tone="blue"
        />
        <MiniMetric
          icon={Gauge}
          label="AI recognition"
          value="96,4%"
          delta="413 событий"
          tone="violet"
        />
      </section>
      <section className="v2-waste-layout">
        <article className="card v2-waste-camera">
          <div className="card-head">
            <div>
              <span>ПОСЛЕДНЕЕ СОБЫТИЕ · 21:04</span>
              <h2>Распознано: гарбузовий крем-суп</h2>
            </div>
            <button className="secondary" onClick={() => notify("Переключено на Waste station 1")}>
              <Camera />
              Waste station 1
            </button>
          </div>
          <div className="v2-bin-scene">
            <div className="v2-bin">
              <Trash2 />
            </div>
            <div className="v2-food-box">
              <span>Гарбузовий крем-суп</span>
              <b>1,42 кг · ₴284</b>
              <em>уверенность 97%</em>
            </div>
            <div className="v2-scale">
              <span>1.420</span>
              <small>kg</small>
            </div>
            <i className="v2-scanline" />
          </div>
          <div className="v2-waste-event">
            <span>Причина AI</span>
            <strong>Перепроизводство перед закрытием</strong>
            <Pill tone="warning">вероятность 89%</Pill>
          </div>
        </article>
        <article className="card v2-waste-breakdown">
          <div className="card-head">
            <div>
              <span>7 ДНЕЙ</span>
              <h2>Куда уходит еда и деньги</h2>
            </div>
            <button className="secondary" onClick={() => notify("Waste report за 7 дней подготовлен")}>
              <BarChart3 />
              Отчёт
            </button>
          </div>
          {categories.map((x, i) => (
            <div key={x.name}>
              <span className={`v2-waste-dot d${i}`} />
              <p>
                <strong>{x.name}</strong>
                <em>
                  {x.kg} кг · ₴{x.cost.toLocaleString("uk-UA")}
                </em>
              </p>
              <i>
                <b style={{ width: `${x.pct}%` }} />
              </i>
              <span>{x.pct}%</span>
            </div>
          ))}
        </article>
      </section>
      <section className="card v2-waste-recommendation">
        <div>
          <Lightbulb />
        </div>
        <p>
          <span>РЕКОМЕНДАЦИЯ С ВЫСОКОЙ УВЕРЕННОСТЬЮ</span>
          <strong>Уменьшить prep крем-супа после 19:00 с 12 до 7 порций</strong>
          <em>
            За последние 4 четверга списывалось в среднем 4,8 порции. Риск
            stockout после изменения — 6%.
          </em>
        </p>
        <aside>
          <span>Экономия</span>
          <strong>₴6 240/мес</strong>
        </aside>
        {applied ? (
          <Pill tone="success">
            <Check />В плане
          </Pill>
        ) : (
          <button
            className="primary"
            onClick={() => {
              setApplied(true);
              notify("Prep-правило обновлено на следующие 14 дней");
            }}
          >
            Применить на 14 дней
          </button>
        )}
      </section>
    </>
  );
}

export function PrepInventory({ notify }: { notify: Notify }) {
  const [po, setPo] = useState(false);
  const items = [
    {
      name: "Крем-суп",
      need: 28,
      stock: 13,
      prep: 15,
      risk: "medium",
      unit: "порц.",
    },
    {
      name: "Чизкейк",
      need: 34,
      stock: 12,
      prep: 22,
      risk: "high",
      unit: "порц.",
    },
    {
      name: "Телятина sous-vide",
      need: 18,
      stock: 21,
      prep: 0,
      risk: "ok",
      unit: "порц.",
    },
    {
      name: "Лимонад base",
      need: 16,
      stock: 7,
      prep: 9,
      risk: "medium",
      unit: "л",
    },
    {
      name: "Молоко oat",
      need: 24,
      stock: 9,
      prep: 15,
      risk: "high",
      unit: "л",
    },
  ];
  return (
    <>
      <section className="v2-prep-hero">
        <div>
          <PackageCheck />
          <p>
            <span>ПЛАН НА ЗАВТРА · УВЕРЕННОСТЬ 91%</span>
            <strong>AI превратил прогноз спроса в prep-лист и закупку</strong>
            <em>
              Учитывает 1 486 гостей, погоду, событие рядом, остатки и сроки
              поставщиков
            </em>
          </p>
        </div>
        <button className="primary" onClick={() => setPo(true)}>
          <ShoppingBasket />
          Сформировать заказ
        </button>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={Utensils}
          label="Prep на завтра"
          value="46 задач"
          delta="8ч 20м работы"
        />
        <MiniMetric
          icon={AlertTriangle}
          label="Риск stockout"
          value="2 позиции"
          delta="до 20:00"
          tone="red"
        />
        <MiniMetric
          icon={Trash2}
          label="Лишний prep"
          value="₴1 180"
          delta="предотвращено"
          tone="amber"
        />
        <MiniMetric
          icon={CircleDollarSign}
          label="Стоимость закупки"
          value="₴32 480"
          delta="−₴2 260 к ручной"
          tone="blue"
        />
      </section>
      <section className="v2-prep-layout">
        <article className="card v2-prep-table">
          <div className="card-head">
            <div>
              <span>ПРОГНОЗ ПО ПОЗИЦИЯМ</span>
              <h2>Что приготовить до открытия</h2>
            </div>
            <button className="secondary" onClick={() => notify("Порог прогноза переключён: 90% → 95%")}>
              <SlidersHorizontal />
              Порог 95%
            </button>
          </div>
          <div className="v2-prep-head">
            <span>Позиция</span>
            <span>Нужно</span>
            <span>Остаток</span>
            <span>Prep</span>
            <span>Риск</span>
          </div>
          {items.map((x) => (
            <div className="v2-prep-row" key={x.name}>
              <p>
                <strong>{x.name}</strong>
                <span>обновлено 8 мин назад</span>
              </p>
              <b>
                {x.need} {x.unit}
              </b>
              <span>{x.stock}</span>
              <strong>{x.prep ? `+${x.prep}` : "достаточно"}</strong>
              <Pill
                tone={
                  x.risk === "high"
                    ? "danger"
                    : x.risk === "medium"
                      ? "warning"
                      : "success"
                }
              >
                {x.risk === "high"
                  ? "Высокий"
                  : x.risk === "medium"
                    ? "Средний"
                    : "Норма"}
              </Pill>
            </div>
          ))}
        </article>
        <aside className="v2-prep-side">
          <article className="card">
            <div className="card-head">
              <div>
                <span>К 11:30</span>
                <h2>Утренний prep</h2>
              </div>
              <Pill tone="success">68% готово</Pill>
            </div>
            {[
              ["Нарезка овощей", "09:20", "Мария"],
              ["Соусы и base", "10:05", "Олег"],
              ["Десерты", "10:40", "Анна"],
              ["Барная станция", "11:10", "Денис"],
            ].map((x, i) => (
              <div className="v2-prep-task" key={x[0]}>
                <span className={i < 2 ? "done" : ""}>
                  {i < 2 ? <Check /> : i + 1}
                </span>
                <p>
                  <strong>{x[0]}</strong>
                  <em>
                    {x[1]} · {x[2]}
                  </em>
                </p>
              </div>
            ))}
          </article>
          <article className="card v2-supplier-alert">
            <Truck />
            <p>
              <strong>Поставщик молока</strong>
              <span>
                Cut-off заказа через 1ч 18м. AI добавил 15 л oat milk.
              </span>
            </p>
          </article>
        </aside>
      </section>
      {po && (
        <div className="v2-overlay" onMouseDown={() => setPo(false)}>
          <div className="v2-po-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-order-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="v2-close" aria-label="Закрыть заказ поставщикам" onClick={() => setPo(false)}>
              ×
            </button>
            <div className="v2-po-icon">
              <ShoppingBasket />
            </div>
            <span>ЧЕРНОВИК ЗАКАЗА ПОСТАВЩИКАМ</span>
            <h2 id="purchase-order-title">3 поставщика · ₴32 480</h2>
            <p>
              Заказ рассчитан из прогноза, текущих остатков, par levels и
              минимальных партий.
            </p>
            {[
              ["West Food", "₴18 420", "доставка завтра 08:00"],
              ["Milk Lab", "₴6 860", "доставка завтра 07:30"],
              ["Green Market", "₴7 200", "доставка завтра 09:00"],
            ].map((x) => (
              <div className="v2-po-line" key={x[0]}>
                <Store />
                <p>
                  <strong>{x[0]}</strong>
                  <span>{x[2]}</span>
                </p>
                <b>{x[1]}</b>
              </div>
            ))}
            <div className="v2-po-actions">
              <button className="secondary" onClick={() => setPo(false)}>
                Редактировать
              </button>
              <button
                className="primary"
                onClick={() => {
                  setPo(false);
                  notify("Заказ отправлен на подтверждение управляющему");
                }}
              >
                <Send />
                Отправить на подтверждение
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function GuestAI({ notify }: { notify: Notify }) {
  const [call, setCall] = useState(0);
  const [agent, setAgent] = useState(true);
  const calls = [
    {
      time: "21:06",
      name: "Олена · +380•••42",
      topic: "Бронь на 4 · пятница 19:30",
      result: "Бронь создана",
      mood: "Позитивный",
    },
    {
      time: "20:48",
      name: "Новый гость",
      topic: "Есть ли безглютеновые блюда?",
      result: "Ответ дан · меню отправлено",
      mood: "Нейтральный",
    },
    {
      time: "20:31",
      name: "Максим · постоянный",
      topic: "Перенести бронь с 20:00",
      result: "Перенесено на 20:30",
      mood: "Позитивный",
    },
    {
      time: "19:55",
      name: "Новый гость",
      topic: "Банкет на 18 человек",
      result: "Передано менеджеру",
      mood: "Высокий intent",
    },
  ];
  return (
    <>
      <section className="v2-guest-hero">
        <div>
          <PhoneCall />
          <p>
            <span>AI HOST · ГОЛОС, ЧАТ, МЕССЕНДЖЕРЫ</span>
            <strong>
              Каждый звонок и запрос превращается в бронь или профиль гостя
            </strong>
            <em>
              24/7 отвечает на вопросы, бронирует, предлагает другое время и
              передаёт сложные запросы
            </em>
          </p>
        </div>
        <label className="v2-auto-switch light">
          <span>{agent ? "AI-хост на линии" : "AI-хост на паузе"}</span>
          <input
            type="checkbox"
            checked={agent}
            onChange={(e) => setAgent(e.target.checked)}
          />
          <i />
        </label>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={PhoneCall}
          label="Звонков сегодня"
          value="94"
          delta="100% отвечено"
        />
        <MiniMetric
          icon={CalendarCheck}
          label="Создано броней"
          value="31"
          delta="₴48 620 GMV"
          tone="blue"
        />
        <MiniMetric
          icon={Clock3}
          label="Сэкономлено команде"
          value="4ч 12м"
          delta="за сегодня"
          tone="amber"
        />
        <MiniMetric
          icon={Star}
          label="Guest recovery"
          value="8/9"
          delta="негатив закрыт"
          tone="violet"
        />
      </section>
      <section className="v2-guest-layout">
        <article className="card v2-call-list">
          <div className="card-head">
            <div>
              <span>ЕДИНЫЙ INBOX</span>
              <h2>Последние обращения</h2>
            </div>
            <Pill tone="live">
              <i /> 2 разговора сейчас
            </Pill>
          </div>
          {calls.map((x, i) => (
            <button
              className={call === i ? "active" : ""}
              onClick={() => setCall(i)}
              key={x.time}
            >
              <div>
                <PhoneCall />
              </div>
              <time>{x.time}</time>
              <p>
                <strong>{x.name}</strong>
                <span>{x.topic}</span>
                <em>{x.result}</em>
              </p>
              <Pill tone={i === 3 ? "warning" : "success"}>{x.mood}</Pill>
            </button>
          ))}
        </article>
        <article className="card v2-call-detail">
          <div className="card-head">
            <div>
              <span>AI CALL SUMMARY</span>
              <h2>{calls[call].topic}</h2>
            </div>
            <button className="secondary" onClick={() => notify("Запись разговора открыта с разрешённым доступом")}>
              <Headphones />
              Запись
            </button>
          </div>
          <div className="v2-transcript">
            <div className="guest">
              <i>О</i>
              <p>
                <span>Гость</span>
                <strong>
                  Добрый вечер, у вас будет столик на четверых в пятницу около
                  половины восьмого?
                </strong>
              </p>
            </div>
            <div className="agent">
              <i>
                <Bot />
              </i>
              <p>
                <span>Venue AI</span>
                <strong>
                  Да, могу предложить зал у окна или террасу. В пятницу
                  ожидается +22°C. Какой вариант вам удобнее?
                </strong>
              </p>
            </div>
            <div className="guest">
              <i>О</i>
              <p>
                <span>Гость</span>
                <strong>Тогда терраса. И у нас день рождения.</strong>
              </p>
            </div>
            <div className="agent">
              <i>
                <Bot />
              </i>
              <p>
                <span>Venue AI</span>
                <strong>
                  Готово: терраса, 4 гостя, 19:30. Отмечу день рождения и
                  отправлю подтверждение.
                </strong>
              </p>
            </div>
          </div>
          <div className="v2-call-facts">
            <span>
              <CalendarCheck />
              Пт · 19:30 · 4 гостя
            </span>
            <span>
              <MapPin />
              Терраса
            </span>
            <span>
              <Star />
              День рождения
            </span>
          </div>
        </article>
      </section>
      <section className="v2-guest-bottom">
        <article className="card">
          <div className="card-head">
            <div>
              <span>LIVE FLOOR</span>
              <h2>Брони и waitlist</h2>
            </div>
            <button className="secondary" onClick={() => notify("Создан черновик новой брони")}>
              <Plus />
              Добавить
            </button>
          </div>
          <div className="v2-reservations">
            {[
              ["19:30", "Олена", "4", "Терраса", "Подтверждено"],
              ["20:00", "Олексій", "2", "У окна", "Сел"],
              ["20:15", "Марина", "6", "Зал", "Ожидается"],
              ["20:30", "Максим", "3", "Зал", "Подтверждено"],
            ].map((x, i) => (
              <div key={x[0]}>
                <time>{x[0]}</time>
                <p>
                  <strong>
                    {x[1]} · {x[2]} гостя
                  </strong>
                  <span>{x[3]}</span>
                </p>
                <Pill tone={i === 1 ? "success" : "neutral"}>{x[4]}</Pill>
              </div>
            ))}
          </div>
        </article>
        <article className="card v2-winback">
          <div className="card-head">
            <div>
              <span>AUTOMATED REVENUE</span>
              <h2>Вернуть гостей в тихий четверг</h2>
            </div>
            <WandSparkles />
          </div>
          <p>
            AI нашёл 186 гостей, которые любят ужины, не были 45+ дней и чаще
            приходят в будни.
          </p>
          <div>
            <span>Ожидаемые брони</span>
            <strong>18–26</strong>
            <span>Прогноз GMV</span>
            <strong>₴31–44 тыс.</strong>
          </div>
          <button
            className="primary full"
            onClick={() => notify("Win-back кампания создана как черновик")}
          >
            <Send />
            Создать персональную кампанию
          </button>
        </article>
      </section>
    </>
  );
}

export function DeliveryControl({ notify }: { notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const orders = [
    {
      id: "#D-1842",
      channel: "Glovo",
      items: "3 позиции",
      eta: "4 мин",
      status: "На pass",
      tone: "warning",
    },
    {
      id: "#D-1843",
      channel: "Bolt Food",
      items: "2 позиции",
      eta: "7 мин",
      status: "Готовится",
      tone: "neutral",
    },
    {
      id: "#D-1844",
      channel: "Власний сайт",
      items: "5 позиций",
      eta: "11 мин",
      status: "Готовится",
      tone: "neutral",
    },
    {
      id: "#D-1845",
      channel: "Glovo",
      items: "1 позиция",
      eta: "14 мин",
      status: "Новый",
      tone: "live",
    },
  ];
  return (
    <>
      <section className="v2-delivery-hero">
        <div>
          <Truck />
          <p>
            <span>DELIVERY CONTROL TOWER</span>
            <strong>Один поток от заказа до передачи курьеру</strong>
            <em>
              AI синхронизирует агрегаторы, кухню, загрузку, курьеров и
              обещанное время
            </em>
          </p>
        </div>
        <label className="v2-auto-switch light">
          <span>{busy ? "Busy mode · +12 мин" : "Нормальная загрузка"}</span>
          <input
            type="checkbox"
            checked={busy}
            onChange={(e) => {
              setBusy(e.target.checked);
              notify(
                e.target.checked
                  ? "Busy mode включён на всех каналах"
                  : "Обычное время возвращено",
              );
            }}
          />
          <i />
        </label>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={Truck}
          label="Заказов сегодня"
          value="184"
          delta="+21%"
        />
        <MiniMetric
          icon={Timer}
          label="Среднее delivery time"
          value="31:42"
          delta="−4:18"
          tone="blue"
        />
        <MiniMetric
          icon={CheckCircle2}
          label="Order accuracy"
          value="98,6%"
          delta="+1,2 п.п."
          tone="amber"
        />
        <MiniMetric
          icon={Users}
          label="Курьеры у входа"
          value="5"
          delta="медиана 4:20"
          tone="violet"
        />
      </section>
      <section className="v2-delivery-layout">
        <article className="card v2-order-board">
          <div className="card-head">
            <div>
              <span>LIVE · 12 АКТИВНЫХ</span>
              <h2>Поток заказов</h2>
            </div>
            <button className="secondary" onClick={() => notify("Фильтр каналов доставки открыт")}>
              <SlidersHorizontal />
              Все каналы
            </button>
          </div>
          <div className="v2-order-columns">
            {["Новый", "Готовится", "На pass", "Передан"].map((col, ci) => (
              <div key={col}>
                <h3>
                  {col}
                  <span>{[1, 7, 3, 1][ci]}</span>
                </h3>
                {orders
                  .filter(
                    (o) => o.status === col || (col === "Передан" && false),
                  )
                  .map((o) => (
                    <article key={o.id}>
                      <div>
                        <Pill tone={o.tone}>{o.channel}</Pill>
                        <time>{o.eta}</time>
                      </div>
                      <strong>{o.id}</strong>
                      <span>{o.items}</span>
                      <i>
                        <b
                          style={{
                            width:
                              o.status === "Новый"
                                ? "15%"
                                : o.status === "Готовится"
                                  ? "58%"
                                  : "88%",
                          }}
                        />
                      </i>
                    </article>
                  ))}
                {ci === 3 && (
                  <article className="completed">
                    <CheckCircle2 />
                    <strong>#D-1841</strong>
                    <span>Передан · 21:03</span>
                  </article>
                )}
              </div>
            ))}
          </div>
        </article>
        <aside className="v2-delivery-side">
          <article className="card">
            <div className="card-head">
              <div>
                <span>ЗОНА ВЫДАЧИ</span>
                <h2>Очередь курьеров</h2>
              </div>
              <Pill tone="warning">5 сейчас</Pill>
            </div>
            {[
              ["Glovo · G-812", "4:18", "#D-1842"],
              ["Bolt · B-291", "3:44", "#D-1840"],
              ["Glovo · G-104", "2:51", "#D-1839"],
              ["Uklon · U-044", "1:26", "#D-1844"],
            ].map((x, i) => (
              <div className="v2-courier" key={x[0]}>
                <span>{i + 1}</span>
                <p>
                  <strong>{x[0]}</strong>
                  <em>ждёт {x[1]}</em>
                </p>
                <b>{x[2]}</b>
              </div>
            ))}
          </article>
          <article className="card v2-packing">
            <div className="card-head">
              <h2>AI-проверка комплектации</h2>
              <Camera />
            </div>
            <div>
              <CheckCircle2 />
              <p>
                <strong>98,6% точность</strong>
                <span>Камера сверяет пакет с чеком перед выдачей</span>
              </p>
            </div>
            <button
              className="secondary full"
              onClick={() => notify("Открыта последняя проверка заказа")}
            >
              <Play />
              Последняя проверка
            </button>
          </article>
        </aside>
      </section>
    </>
  );
}

export function WhatIfLab({ notify }: { notify: Notify }) {
  const [staff, setStaff] = useState(1),
    [promo, setPromo] = useState(3500),
    [terrace, setTerrace] = useState(8),
    [price, setPrice] = useState(2);
  const result = useMemo(() => {
    const revenue = Math.round(
      staff * 2600 + promo * 1.7 + terrace * 530 + price * 1180,
    );
    const cost = Math.round(staff * 1450 + promo + terrace * 90);
    const wait = Math.max(2.1, 7.4 - staff * 1.35 - terrace * 0.06);
    return {
      revenue,
      cost,
      profit: revenue - cost,
      wait: wait.toFixed(1),
      covers: Math.round(staff * 9 + promo / 420 + terrace * 0.6),
    };
  }, [staff, promo, terrace, price]);
  const reset = () => {
    setStaff(1);
    setPromo(3500);
    setTerrace(8);
    setPrice(2);
  };
  return (
    <>
      <section className="v2-sim-hero">
        <div>
          <FlaskConical />
          <p>
            <span>VENUE DIGITAL TWIN</span>
            <strong>Проверьте решение до того, как потратите деньги</strong>
            <em>
              Модель использует 8 недель видео, POS, погоду и реальные
              ограничения локации
            </em>
          </p>
        </div>
        <button className="secondary" onClick={reset}>
          <RotateCcw />
          Сбросить
        </button>
      </section>
      <section className="v2-sim-layout">
        <article className="card v2-controls">
          <div className="card-head">
            <div>
              <span>СЦЕНАРИЙ · ПЯТНИЦА 18:00–22:00</span>
              <h2>Что изменить?</h2>
            </div>
            <Pill tone="success">точность 86%</Pill>
          </div>
          <Slider
            label="Официанты в пике"
            value={staff}
            min={-2}
            max={3}
            step={1}
            prefix={staff > 0 ? "+" : ""}
            suffix=" чел."
            onChange={setStaff}
          />
          <Slider
            label="Бюджет lunch / evening promo"
            value={promo}
            min={0}
            max={10000}
            step={500}
            prefix="₴"
            onChange={setPromo}
          />
          <Slider
            label="Дополнительные места на террасе"
            value={terrace}
            min={0}
            max={20}
            step={2}
            prefix="+"
            suffix=" мест"
            onChange={setTerrace}
          />
          <Slider
            label="Изменение цены top-5 блюд"
            value={price}
            min={-5}
            max={10}
            step={1}
            prefix={price > 0 ? "+" : ""}
            suffix="%"
            onChange={setPrice}
          />
          <div className="v2-presets">
            <span>Быстрые сценарии</span>
            <button
              onClick={() => {
                setStaff(2);
                setPromo(0);
                setTerrace(0);
                setPrice(0);
              }}
            >
              Усилить смену
            </button>
            <button
              onClick={() => {
                setStaff(0);
                setPromo(6000);
                setTerrace(10);
                setPrice(0);
              }}
            >
              Заполнить террасу
            </button>
            <button
              onClick={() => {
                setStaff(0);
                setPromo(0);
                setTerrace(0);
                setPrice(5);
              }}
            >
              Поднять маржу
            </button>
          </div>
        </article>
        <article className="card v2-sim-result">
          <div className="card-head">
            <div>
              <span>ПРОГНОЗ ЭФФЕКТА</span>
              <h2>Сценарий прибыльнее baseline</h2>
            </div>
            <Pill tone="success">
              <TrendingUp />+{Math.max(1, Math.round(result.profit / 1600))},4%
            </Pill>
          </div>
          <div className="v2-profit-number">
            <span>Дополнительная прибыль</span>
            <strong>+₴{result.profit.toLocaleString("uk-UA")}</strong>
            <em>за один вечерний сервис</em>
          </div>
          <div className="v2-result-grid">
            <div>
              <Users />
              <span>Доп. гости</span>
              <strong>+{result.covers}</strong>
            </div>
            <div>
              <Timer />
              <span>Ожидание</span>
              <strong>{result.wait} мин</strong>
            </div>
            <div>
              <CircleDollarSign />
              <span>Выручка</span>
              <strong>+₴{result.revenue.toLocaleString("uk-UA")}</strong>
            </div>
            <div>
              <TrendingDown />
              <span>Стоимость</span>
              <strong>₴{result.cost.toLocaleString("uk-UA")}</strong>
            </div>
          </div>
          <div className="v2-confidence">
            <span>Диапазон результата</span>
            <i>
              <b style={{ left: "28%", width: "48%" }} />
              <em style={{ left: "52%" }} />
            </i>
            <div>
              <span>
                ₴{Math.round(result.profit * 0.72).toLocaleString("uk-UA")}
              </span>
              <span>
                наиболее вероятно ₴{result.profit.toLocaleString("uk-UA")}
              </span>
              <span>
                ₴{Math.round(result.profit * 1.22).toLocaleString("uk-UA")}
              </span>
            </div>
          </div>
          <button
            className="primary full"
            onClick={() => notify("Сценарий сохранён и отправлен управляющему")}
          >
            <Check />
            Сохранить и создать план действий
          </button>
        </article>
      </section>
      <article className="card v2-sim-explain">
        <Sparkles />
        <p>
          <strong>Почему модель ожидает рост</strong>
          <span>
            Дополнительный официант убирает узкое место первого контакта; 8 мест
            на террасе совпадают с прогнозом +22°C; промо показано сегменту,
            который ранее конвертировался в 2,4 раза лучше.
          </span>
        </p>
        <button className="secondary" onClick={() => notify("Открыта методика: forecast × uplift × cost model")}>
          <FileSearch />
          Методика расчёта
        </button>
      </article>
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  prefix = "",
  suffix = "",
  onChange,
}: any) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="v2-slider">
      <div>
        <span>{label}</span>
        <strong>
          {prefix}
          {value.toLocaleString("uk-UA")}
          {suffix}
        </strong>
      </div>
      <input
        aria-label={label}
        aria-valuetext={`${prefix}${value.toLocaleString("uk-UA")}${suffix}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${pct}%` } as any}
      />
      <div>
        <span>
          {prefix}
          {min.toLocaleString("uk-UA")}
          {suffix}
        </span>
        <span>
          {prefix}
          {max.toLocaleString("uk-UA")}
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function MenuEngineering({ notify }: { notify: Notify }) {
  const [selected, setSelected] = useState("Телятина з трюфельним пюре");
  const dishes = [
    {
      name: "Телятина з трюфельним пюре",
      type: "star",
      profit: 214,
      sales: 184,
      x: 72,
      y: 20,
    },
    {
      name: "Баскський чізкейк",
      type: "star",
      profit: 108,
      sales: 226,
      x: 84,
      y: 34,
    },
    {
      name: "Борщ з ребром",
      type: "plow",
      profit: 82,
      sales: 248,
      x: 70,
      y: 72,
    },
    {
      name: "Качина ніжка",
      type: "puzzle",
      profit: 196,
      sales: 48,
      x: 24,
      y: 23,
    },
    {
      name: "Салат з буряком",
      type: "puzzle",
      profit: 132,
      sales: 61,
      x: 34,
      y: 38,
    },
    {
      name: "Дитячі сирники",
      type: "dog",
      profit: 54,
      sales: 33,
      x: 18,
      y: 78,
    },
  ];
  const current = dishes.find((x) => x.name === selected)!;
  return (
    <>
      <section className="v2-menueng-hero">
        <div>
          <CircleDollarSign />
          <p>
            <span>MENU ENGINEERING · POS + FOOD COST + ПОВЕДЕНИЕ</span>
            <strong>
              Не просто популярность: реальная прибыль каждого блюда
            </strong>
            <em>
              Учитывает ingredient cost, prep loss, списания, место в меню,
              просмотры и продажи
            </em>
          </p>
        </div>
        <button
          className="primary"
          onClick={() => notify("Создан A/B тест расположения блюд на 14 дней")}
        >
          <FlaskConical />
          Запустить A/B тест
        </button>
      </section>
      <section className="v2-metrics-4">
        <MiniMetric
          icon={CircleDollarSign}
          label="Menu contribution"
          value="₴412 тыс."
          delta="+8,4% за месяц"
        />
        <MiniMetric
          icon={Star}
          label="Stars"
          value="9 блюд"
          delta="46% валовой прибыли"
          tone="blue"
        />
        <MiniMetric
          icon={AlertTriangle}
          label="Dogs"
          value="6 блюд"
          delta="₴18 200 hidden cost"
          tone="red"
        />
        <MiniMetric
          icon={Eye}
          label="Просмотр → заказ"
          value="18,6%"
          delta="+2,1 п.п."
          tone="violet"
        />
      </section>
      <section className="v2-menueng-layout">
        <article className="card v2-quadrant">
          <div className="card-head">
            <div>
              <span>ПОПУЛЯРНОСТЬ × CONTRIBUTION MARGIN</span>
              <h2>Матрица меню</h2>
            </div>
            <button className="secondary" onClick={() => notify("Фильтр категорий меню открыт")}>
              <SlidersHorizontal />
              Все категории
            </button>
          </div>
          <div className="v2-matrix">
            <div className="q puzzle">
              <span>PUZZLES</span>
              <small>маржинальные, но редко выбирают</small>
            </div>
            <div className="q star">
              <span>STARS</span>
              <small>защищать и продвигать</small>
            </div>
            <div className="q dog">
              <span>DOGS</span>
              <small>убрать или полностью изменить</small>
            </div>
            <div className="q plow">
              <span>PLOWHORSES</span>
              <small>популярные, но низкая маржа</small>
            </div>
            {dishes.map((x, i) => (
              <button
                key={x.name}
                className={`dish-point ${selected === x.name ? "active" : ""} ${x.type}`}
                style={{ left: `${x.x}%`, top: `${x.y}%` }}
                onClick={() => setSelected(x.name)}
              >
                <span>{i + 1}</span>
                <em>{x.name}</em>
              </button>
            ))}
            <span className="axis y">Маржа →</span>
            <span className="axis x">Популярность →</span>
          </div>
        </article>
        <aside className="card v2-dish-detail">
          <div className="v2-dish-cover">
            <Utensils />
          </div>
          <span>{current.type.toUpperCase()}</span>
          <h2>{current.name}</h2>
          <div className="v2-dish-kpis">
            <div>
              <span>Цена</span>
              <strong>₴389</strong>
            </div>
            <div>
              <span>Food cost</span>
              <strong>₴175</strong>
            </div>
            <div>
              <span>Маржа</span>
              <strong>₴{current.profit}</strong>
            </div>
            <div>
              <span>Продажи</span>
              <strong>{current.sales}</strong>
            </div>
          </div>
          <div className="v2-dish-funnel">
            <span>
              Просмотры QR <b>1 284</b>
            </span>
            <i>
              <b style={{ width: "100%" }} />
            </i>
            <span>
              Открыли блюдо <b>486</b>
            </span>
            <i>
              <b style={{ width: "62%" }} />
            </i>
            <span>
              Заказали <b>{current.sales}</b>
            </span>
            <i>
              <b style={{ width: "38%" }} />
            </i>
          </div>
          <div className="v2-ai-tip">
            <Sparkles />
            <p>
              <strong>AI-рекомендация</strong>
              <span>
                Поднять цену на 4%: чувствительность низкая, прогноз потери
                спроса 1,2%.
              </span>
            </p>
          </div>
          <button
            className="primary full"
            onClick={() => notify("Ценовой эксперимент добавлен как черновик")}
          >
            <ArrowRight />
            Смоделировать изменение
          </button>
        </aside>
      </section>
    </>
  );
}
