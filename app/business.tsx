/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  HeartPulse,
  Lightbulb,
  MapPin,
  MessageSquareText,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  ThermometerSun,
  Timer,
  TrendingUp,
  UserRoundCheck,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type { VenueLocation } from "./system";

type Notify = (text: string) => void;
type Go = (page: string) => void;

function BizPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`biz-pill ${tone}`}>{children}</span>;
}

export function DemoCenter({ go, notify, location }: { go: Go; notify: Notify; location: VenueLocation }) {
  const [role, setRole] = useState("owner");
  const [format, setFormat] = useState("fsr");
  const [done, setDone] = useState<string[]>([]);
  const stories = [
    { key: "morning", time: "09:00", title: "Подготовить смену", text: "Прогноз, staffing, prep и риски до открытия", page: "copilot", value: "₴4 920" },
    { key: "street", time: "12:30", title: "Вернуть дневной трафик", text: "Падение capture rate → что-если → lunch-промо", page: "outside", value: "+18%" },
    { key: "peak", time: "18:40", title: "Удержать вечерний пик", text: "Очередь, первый контакт и нагрузка кухни", page: "live", value: "−2,4 мин" },
    { key: "loss", time: "20:48", title: "Проверить потерю", text: "Void в POS связан с выдачей на видео", page: "profit", value: "₴1 240" },
    { key: "waste", time: "21:04", title: "Остановить списания", text: "Waste Vision меняет prep на 14-дневный тест", page: "waste", value: "₴6 240/мес" },
    { key: "close", time: "23:15", title: "Закрыть день", text: "Факт против прогноза и задачи на завтра", page: "finance", value: "+₴14 860" },
    { key: "prove", time: "+14 дней", title: "Доказать результат", text: "Контрольная группа отделяет uplift от погоды и календаря", page: "experiments", value: "91% conf." },
  ];
  const presets: Record<string, { headline: string; metrics: string[] }> = {
    owner: { headline: "Покажите владельцу деньги, риски и контроль сети", metrics: ["Profit impact", "Prime cost", "Потери", "Сравнение локаций"] },
    manager: { headline: "Покажите управляющему конкретный план этой смены", metrics: ["Очередь", "SLA", "Prep", "Задачи команды"] },
    ops: { headline: "Покажите операционному директору стандартизацию сети", metrics: ["Benchmarks", "Safety", "Labor", "Playbooks"] },
  };
  return (
    <>
      <section className="biz-demo-hero">
        <div>
          <span><Sparkles /> GUIDED PRODUCT DEMO</span>
          <h2>{presets[role].headline}</h2>
          <p>Сценарий строится вокруг причинно-следственной цепочки, а не набора несвязанных графиков.</p>
          <div className="biz-hero-tags">{presets[role].metrics.map((metric) => <b key={metric}><Check /> {metric}</b>)}</div>
        </div>
        <aside>
          <label>Кому показываем?</label>
          <div>{[["owner", "Владелец"], ["manager", "Управляющий"], ["ops", "Операции"]].map(([key, label]) => <button className={role === key ? "active" : ""} key={key} onClick={() => setRole(key)}>{label}</button>)}</div>
          <label>Формат заведения</label>
          <div>{[["fsr", "Ресторан"], ["coffee", "Кофейня"], ["qsr", "QSR"]].map(([key, label]) => <button className={format === key ? "active" : ""} key={key} onClick={() => setFormat(key)}>{label}</button>)}</div>
          <button className="primary" onClick={() => { setDone([]); notify("Демо-сценарий запущен · начните с подготовки смены"); go("copilot"); }}><Play /> Запустить демо · 7 минут</button>
        </aside>
      </section>

      <section className="biz-demo-layout">
        <article className="card biz-storyline">
          <div className="card-head"><div><span>ОДИН ДЕНЬ · {location.name.toUpperCase()}</span><h2>История, которую понимает клиент</h2></div><BizPill tone="live"><i /> LIVE DATA</BizPill></div>
          {stories.map((story, index) => (
            <button className={done.includes(story.key) ? "done" : ""} key={story.key} onClick={() => { setDone((current) => current.includes(story.key) ? current : [...current, story.key]); go(story.page); }}>
              <time>{story.time}</time><span className="biz-story-node">{done.includes(story.key) ? <Check /> : index + 1}</span><p><strong>{story.title}</strong><span>{story.text}</span></p><b>{story.value}</b><ChevronRight />
            </button>
          ))}
        </article>
        <aside className="biz-demo-side">
          <article className="card biz-demo-score"><div className="card-head"><div><span>DEMO READINESS</span><h2>Готовность презентации</h2></div><strong>96</strong></div>{[["Setup и источники", 100], ["Операционные сценарии", 96], ["Денежный эффект", 94], ["Privacy story", 100], ["Mobile", 88]].map(([label, value]: any) => <div key={label}><span>{label}</span><i><b style={{width:`${value}%`}} /></i><strong>{value}%</strong></div>)}</article>
          <article className="card biz-talk-track"><span>SALES TALK TRACK</span><h3>Не говорите «мы считаем людей»</h3><p>«VenueFlow показывает, почему выручка потеряна, даёт доказательство и превращает вывод в задачу с измеримым эффектом».</p><button className="secondary full" onClick={() => notify("Talk track скопирован")}>Скопировать тезис</button></article>
          <article className="card biz-demo-controls"><span>БЫСТРЫЕ ТОЧКИ</span>{[["setup", "Как система понимает локацию", MapPin], ["cameras", "Как подключается камера", CameraIcon], ["trust", "Почему данным можно доверять", ShieldCheck], ["simulator", "Как считается эффект", WandSparkles], ["experiments", "Как доказывается результат", Sparkles]].map(([page, title, Icon]: any) => <button key={page} onClick={() => go(page)}><Icon /><span>{title}</span><ArrowRight /></button>)}</article>
        </aside>
      </section>
    </>
  );
}

function CameraIcon() { return <Activity />; }

export function LaborPlanner({ notify }: { notify: Notify }) {
  const [applied, setApplied] = useState<number[]>([]);
  const [day, setDay] = useState("Пт 14");
  const hours = ["08", "10", "12", "14", "16", "18", "20", "22"];
  const people = [
    { name: "Анна К.", role: "Manager", from: 8, to: 18, color: "green" },
    { name: "Ирина П.", role: "Server", from: 10, to: 20, color: "blue" },
    { name: "Максим Л.", role: "Server", from: 12, to: 22, color: "blue" },
    { name: "Денис Р.", role: "Bar", from: 8, to: 18, color: "amber" },
    { name: "Мария С.", role: "Kitchen", from: 9, to: 21, color: "violet" },
    { name: "Олег В.", role: "Kitchen", from: 11, to: 23, color: "violet" },
  ];
  const recs = [
    ["Добавить официанта 17:30–21:30", "Ожидание −27% · labor +₴580", "+₴3 100"],
    ["Сдвинуть prep shift на 45 минут", "Пик кухни начнётся раньше прогноза", "−18 мин OT"],
    ["Убрать 1 barista после 21:00", "Нагрузка ниже 42%", "₴310"],
  ];
  return (
    <>
      <section className="biz-labor-summary">{[[Users,"Запланировано","148 ч","+6 ч к baseline"],[CircleDollarSign,"Labor cost","₴21 460","17,8% выручки"],[Gauge,"Productivity","₴816/ч","+9,4%"],[Timer,"Риск SLA","18:00–20:00","высокий"]].map(([Icon,label,value,text]:any)=><article className="card" key={label}><i><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}</section>
      <section className="biz-labor-layout">
        <article className="card biz-rota">
          <div className="card-head"><div><span>СПРОС × ГРАФИК</span><h2>План команды по часам</h2></div><div className="biz-day-switch">{["Чт 13","Пт 14","Сб 15"].map((item)=><button className={day===item?"active":""} onClick={()=>setDay(item)} key={item}>{item}</button>)}</div></div>
          <div className="biz-demand-strip"><span>Прогноз гостей</span>{[28,34,62,48,71,96,88,44].map((value,index)=><i key={index} style={{height:`${value}%`}}><b>{value}</b></i>)}</div>
          <div className="biz-rota-head"><span>Команда</span>{hours.map((hour)=><span key={hour}>{hour}:00</span>)}</div>
          <div className="biz-rota-grid">{people.map((person)=><div key={person.name}><p><strong>{person.name}</strong><span>{person.role}</span></p><div className="biz-shift-track"><i className={person.color} style={{left:`${((person.from-8)/16)*100}%`,width:`${((person.to-person.from)/16)*100}%`}}><span>{person.from}:00–{person.to}:00</span></i></div></div>)}</div>
          <div className="biz-coverage-row"><strong>Покрытие</strong>{["Норма","Норма","+1","Норма","−1","−2","−1","Норма"].map((value,index)=><span className={value.startsWith("−")?"bad":value.startsWith("+")?"over":""} key={index}>{value}</span>)}</div>
        </article>
        <aside className="card biz-labor-recs"><div className="card-head"><div><span>AI STAFFING</span><h2>Оптимизация графика</h2></div><BizPill tone="warning">₴3 990 эффект</BizPill></div>{recs.map((item,index)=><div className={applied.includes(index)?"applied":""} key={item[0]}><span>{index+1}</span><p><strong>{item[0]}</strong><em>{item[1]}</em><b>{item[2]}</b></p>{applied.includes(index)?<BizPill tone="success"><Check /> Применено</BizPill>:<button className="primary" onClick={()=>{setApplied((current)=>[...current,index]);notify("Изменение добавлено в график на подтверждение");}}>Применить</button>}</div>)}</aside>
      </section>
      <section className="card biz-labor-bottom"><div><Sparkles /><p><span>AI SHIFT BUILDER</span><strong>Собрать график следующей недели автоматически</strong><em>Учитывает доступность, навыки, лимиты часов, прогноз и target labor %.</em></p></div><div><span>Экономия менеджера<strong>3ч 40м</strong></span><span>Прогноз labor<strong>17,2%</strong></span><span>Покрытие SLA<strong>96%</strong></span></div><button className="primary" onClick={()=>notify("Черновик графика на неделю создан")}>Создать черновик</button></section>
    </>
  );
}

export function SafetyHub({ notify }: { notify: Notify }) {
  const [tasks, setTasks] = useState([true, true, false, false]);
  const [incident, setIncident] = useState(false);
  return (
    <>
      <section className="biz-safety-hero"><div><ShieldCheck /><p><span>FOOD SAFETY CONTROL TOWER</span><strong>Все критические точки под контролем</strong><em>Температуры, гигиена, SOP и цифровой HACCP-журнал</em></p></div><div className="biz-safety-score"><strong>94</strong><span>Safety score</span></div><button className="secondary" onClick={()=>notify("Аудит HACCP сформирован")}>Экспорт аудита</button></section>
      <section className="biz-safety-metrics">{[[ThermometerSun,"Cold chain","7/8","1 алерт"],[UserRoundCheck,"Гигиена рук","92%","+6 п.п."],[ClipboardCheck,"Чек-листы","18/21","до закрытия"],[AlertTriangle,"Инциденты","1","требует реакции"]].map(([Icon,label,value,text]:any)=><article className="card" key={label}><i><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}</section>
      <section className="biz-safety-layout">
        <article className="card biz-sensors"><div className="card-head"><div><span>IOT · LIVE</span><h2>Температуры и оборудование</h2></div><BizPill tone="live"><i /> 8 сенсоров</BizPill></div>{[["Холодильник 1","+3,2°C","Норма",82],["Холодильник 2","+4,1°C","Норма",76],["Морозильник","−18,6°C","Норма",91],["Prep fridge","+8,4°C","Выше порога",100],["Dishwasher","+82°C","Цикл завершён",68]].map((item,index)=><button className={index===3?"alert":""} key={item[0]} onClick={()=>index===3&&setIncident(true)}><i><ThermometerSun /></i><p><strong>{item[0]}</strong><span>Sensor T-{index+11} · обновлено {index+1} мин</span></p><b>{item[1]}</b><span>{item[2]}</span><em><i style={{width:`${item[3]}%`}} /></em><ChevronRight /></button>)}</article>
        <article className="card biz-haccp"><div className="card-head"><div><span>СЕГОДНЯ · ЗАКРЫТИЕ</span><h2>HACCP-чек-лист</h2></div><BizPill tone={tasks.every(Boolean)?"success":"warning"}>{tasks.filter(Boolean).length}/4</BizPill></div>{[["Проверить температуры","22:30 · Мария",true],["Санитарная обработка pass","22:45 · Олег",true],["Маркировка открытых продуктов","23:00 · Мария",false],["Фото закрытой cold station","23:10 · Manager",false]].map((item,index)=><button key={String(item[0])} onClick={()=>setTasks((current)=>current.map((value,i)=>i===index?!value:value))}><i className={tasks[index]?"done":""}>{tasks[index]&&<Check />}</i><p><strong>{item[0]}</strong><span>{item[1]}</span></p>{index===3&&<BizPill>Фото</BizPill>}</button>)}<button className="secondary full" onClick={()=>notify("Новая safety-задача создана")}><Plus /> Добавить проверку</button></article>
        <aside className="biz-safety-side"><article className="card biz-handwash"><div className="card-head"><div><span>HANDWASH ZONE</span><h2>Соблюдение гигиены</h2></div><strong>92%</strong></div><div className="biz-handwash-chart">{[74,82,78,91,88,96,92].map((value,index)=><i style={{height:`${value}%`}} key={index}><b>{value}</b><span>{["08","10","12","14","16","18","20"][index]}</span></i>)}</div><p><CheckCircle2 /> 46 из 50 входов в kitchen zone после корректного handwash event</p></article><article className="card biz-safety-action"><HeartPulse /><p><strong>Prep fridge выше +8°C 11 минут</strong><span>Переместите молочные продукты и проверьте дверь.</span></p><button className="primary" onClick={()=>setIncident(true)}>Реагировать</button></article></aside>
      </section>
      {incident&&<div className="biz-overlay" onMouseDown={()=>setIncident(false)}><div className="biz-modal" role="dialog" aria-modal="true" aria-labelledby="safety-incident-title" onMouseDown={(event)=>event.stopPropagation()}><button onClick={()=>setIncident(false)} aria-label="Закрыть инцидент"><X /></button><span>КРИТИЧЕСКАЯ ТОЧКА · PREP FRIDGE</span><h2 id="safety-incident-title">Температура +8,4°C выше порога</h2><p>Начало: 21:14 · длительность 11 минут · sensor T-14 · дверь оставалась открытой 6:42 по видео.</p><div className="biz-incident-evidence"><div><ThermometerSun /><strong>+8,4°C</strong><span>порог +7°C</span></div><div><Activity /><strong>11 мин</strong><span>выше порога</span></div><div><CircleDollarSign /><strong>₴2 840</strong><span>продуктов в риске</span></div></div><h3>Рекомендуемый протокол</h3><ol><li>Переместить продукты в холодильник 1.</li><li>Проверить фактическую температуру probe-термометром.</li><li>Закрыть дверь и проверить уплотнитель.</li><li>Через 15 минут подтвердить восстановление.</li></ol><div className="biz-modal-actions"><button className="secondary" onClick={()=>setIncident(false)}>Ложный алерт</button><button className="primary" onClick={()=>{setIncident(false);notify("Safety-протокол назначен менеджеру");}}>Назначить протокол</button></div></div></div>}
    </>
  );
}

export function ReputationHub({ notify, location }: { notify: Notify; location: VenueLocation }) {
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState(false);
  const hasNoCameras = location.cameras === 0;
  const cameraIssue = hasNoCameras || location.online < location.cameras;
  const reviews = [
    {source:"Google",name:"Олена М.",score:3,text:"Еда отличная, но ждали официанта почти десять минут. На террасе нас будто не замечали.",time:"Сегодня · 20:14",topic:"Скорость сервиса",event:hasNoCameras?"Видео-контекст недоступен · в локации нет камер":cameraIssue?`CAM-${String(location.cameras).padStart(2,"0")} offline · first contact 8:42`:`Терраса · first contact 8:42 · camera coverage verified`},
    {source:"Instagram",name:"@food_if",score:5,text:"Очень понравился новый чизкейк и обслуживание в главном зале!",time:"Сегодня · 18:52",topic:"Еда и команда",event:"Table 12 · SLA 96%"},
    {source:"Google",name:"Андрій К.",score:2,text:"Курьерский заказ приехал без соуса, пришлось звонить.",time:"Вчера · 21:38",topic:"Delivery accuracy",event:"Packing check confidence 71%"},
  ];
  const review=reviews[selected];
  const rootCauses: Array<[string, number]> = cameraIssue
    ? [[hasNoCameras ? "Видеоисточник не настроен" : "Недоступен источник зоны",92],["Understaffing 19:30–21:00",88],["Не назначена зона официанту",74]]
    : [["Understaffing 19:30–21:00",91],["Не назначена зона официанту",82],["Пиковая загрузка террасы",76]];
  return <>
    <section className="biz-reputation-summary">{[[Star,"Рейтинг","4,62","+0,08"],[MessageSquareText,"Отзывы","284","30 дней"],[Gauge,"Sentiment","81%","позитивный"],[Timer,"Ответ","1ч 18м","median"]].map(([Icon,label,value,text]:any)=><article className="card" key={label}><i><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}</section>
    <section className="biz-reputation-layout"><article className="card biz-review-list"><div className="card-head"><div><span>ЕДИНЫЙ INBOX · {location.name.toUpperCase()}</span><h2>Отзывы и упоминания</h2></div><button className="secondary" onClick={()=>notify("Открыты фильтры источника, оценки и темы")}><Search /> Фильтры</button></div>{reviews.map((item,index)=><button className={selected===index?"active":""} key={item.name} onClick={()=>setSelected(index)}><i>{item.source[0]}</i><p><span>{item.source} · {item.time}</span><strong>{item.name}</strong><em>{item.text}</em></p><div>{Array.from({length:5}).map((_,star)=><Star key={star} className={star<item.score?"on":""} />)}</div><BizPill tone={item.score<4?"warning":"success"}>{item.topic}</BizPill></button>)}</article><article className="card biz-review-detail"><div className="card-head"><div><span>REVIEW INTELLIGENCE</span><h2>{review.name} · {review.source}</h2></div><BizPill tone={review.score<4?"warning":"success"}>{review.score}/5</BizPill></div><blockquote>“{review.text}”</blockquote><div className="biz-linked-evidence"><Activity /><p><span>СВЯЗАННЫЙ ОПЕРАЦИОННЫЙ КОНТЕКСТ</span><strong>{review.event}</strong><em>{hasNoCameras ? "Причина не подтверждена видео" : "AI confidence 87% · совпадение по времени и зоне"}</em></p><button className="secondary" onClick={()=>notify(hasNoCameras ? "Доказательство недоступно: добавьте камеру, зону и retention" : "Открыт связанный видеофрагмент")}>{hasNoCameras ? "Почему недоступно" : "Доказательство"}</button></div><h3>AI root cause</h3><div className="biz-root-causes">{rootCauses.map(([label,value])=><div key={label}><span>{label}</span><i><b style={{width:`${value}%`}} /></i><strong>{value}%</strong></div>)}</div><div className="biz-response-draft"><span>ЧЕРНОВИК ОТВЕТА</span><p>{draft?"Олено, дякуємо, що відзначили кухню, і вибачте за очікування на терасі. Ми вже змінили покриття цієї зони у вечірній зміні. Будемо раді запросити вас знову — напишіть нам у приватні повідомлення.":"AI подготовит ответ с учётом проблемы, языка гостя и принятого действия."}</p><button className="primary" onClick={()=>{if(draft){notify("Ответ сохранён как черновик для подтверждения");}else setDraft(true);}}>{draft?<><Check /> Сохранить черновик</>:<><WandSparkles /> Подготовить ответ</>}</button></div></article><aside className="biz-sentiment-side"><article className="card"><div className="card-head"><div><span>30 ДНЕЙ</span><h2>Темы отзывов</h2></div></div>{[["Еда",92,"+4"],["Команда",86,"+2"],["Атмосфера",89,"+1"],["Скорость",68,"−9"],["Delivery",73,"−4"],["Цена",78,"−2"]].map(([label,value,delta]:any)=><div className="biz-topic" key={label}><span>{label}</span><i><b style={{width:`${value}%`}} /></i><strong>{value}</strong><em className={delta.startsWith("−")?"bad":""}>{delta}</em></div>)}</article><article className="card biz-review-insight"><Lightbulb /><p><strong>Скорость — главный драйвер негатива</strong><span>61% негативных отзывов за неделю связаны с террасой после 19:00.</span></p><button className="secondary" onClick={()=>notify("Создана задача: вечернее покрытие террасы")}>Создать действие</button></article></aside></section>
  </>;
}

export function PrimeCost({ notify }: { notify: Notify }) {
  const [period, setPeriod] = useState("Неделя");
  const [action, setAction] = useState(false);
  const rows = [
    ["Выручка", "₴3 842 000", "₴3 710 000", "+3,6%", "good"],
    ["Food cost", "₴1 084 000", "₴1 018 000", "+₴66k", "bad"],
    ["Labor", "₴694 000", "₴712 000", "−₴18k", "good"],
    ["Waste", "₴84 200", "₴61 000", "+₴23k", "bad"],
    ["Discounts & voids", "₴112 400", "₴78 000", "+₴34k", "bad"],
  ];
  return <>
    <section className="biz-finance-hero"><div><span>PROFIT CONTROL TOWER</span><h2>От операционного события до P&L</h2><p>Видео, POS, labor и inventory объясняют, где именно потерялась маржа.</p></div><div className="biz-period">{["День","Неделя","Месяц"].map((item)=><button className={period===item?"active":""} onClick={()=>setPeriod(item)} key={item}>{item}</button>)}</div></section>
    <section className="biz-finance-metrics">{[[CircleDollarSign,"Выручка","₴3,84M","+3,6%"],[Gauge,"Prime cost","46,3%","target 44%"],[TrendingUp,"Contribution","₴1,62M","+₴84k"],[AlertTriangle,"Контролируемые потери","₴184k","4,8% выручки"]].map(([Icon,label,value,text]:any)=><article className="card" key={label}><i><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}</section>
    <section className="biz-finance-layout"><article className="card biz-prime-chart"><div className="card-head"><div><span>PRIME COST</span><h2>Labor + COGS против цели</h2></div><BizPill tone="warning">+2,3 п.п.</BizPill></div><div className="biz-prime-donut"><div><strong>46,3%</strong><span>prime cost</span></div><aside><p><i className="food" />Food cost<strong>28,2%</strong></p><p><i className="labor" />Labor<strong>18,1%</strong></p><p><i className="target" />Target<strong>44,0%</strong></p></aside></div><div className="biz-waterfall"><span>Маржа baseline<b>₴1,71M</b></span>{[["Waste",-84200,"waste"],["Voids",-34400,"void"],["Labor",18000,"labor"],["Menu mix",12400,"menu"]].map(([label,value,kind]:any)=><i className={kind} key={label} style={{height:`${Math.max(28,Math.abs(value)/1200)}px`}}><em>{value>0?"+":"−"}₴{Math.abs(value/1000).toFixed(0)}k</em><small>{label}</small></i>)}<span>Факт<b>₴1,62M</b></span></div></article><article className="card biz-finance-table"><div className="card-head"><div><span>ФАКТ VS PLAN</span><h2>Драйверы результата</h2></div><button className="secondary" onClick={()=>notify("Детальный P&L открыт в demo-view")}>Детальный P&L</button></div><div className="biz-fin-head"><span>Показатель</span><span>Факт</span><span>План</span><span>Отклонение</span></div>{rows.map((row)=><button key={row[0]} onClick={()=>notify(`Открыт драйвер P&L: ${row[0]}`)}><strong>{row[0]}</strong><span>{row[1]}</span><span>{row[2]}</span><em className={row[4]}>{row[3]}</em><ChevronRight /></button>)}</article><aside className="biz-finance-actions"><article className="card"><div className="card-head"><div><span>AI PROFIT BRIDGE</span><h2>Что вернёт маржу</h2></div></div>{[["Снизить prep супа после 19:00","Waste Vision","₴6 240/мес"],["Закрыть повторяемые voids кассы 2","Profit Guard","₴9 800/мес"],["Поднять цену 3 stars на 2%","Menu engineering","₴12 400/мес"],["Оптимизировать 21 labor hour","Labor AI","₴7 600/мес"]].map((item,index)=><div className={action&&index===0?"done":""} key={item[0]}><span>{index+1}</span><p><strong>{item[0]}</strong><em>{item[1]}</em></p><b>{item[2]}</b>{index===0&&<button onClick={()=>{setAction(true);notify("Действие добавлено в Profit plan");}}>{action?<Check />:<Plus />}</button>}</div>)}</article><article className="card biz-profit-total"><Sparkles /><p><span>ПОТЕНЦИАЛ 30 ДНЕЙ</span><strong>+₴36 040</strong><em>При выполнении 4 действий</em></p><button className="primary" onClick={()=>notify("Profit plan создан и отправлен управляющему")}>Создать Profit plan</button></article></aside></section>
  </>;
}

export function AICopilotDrawer({ open, onClose, page, location, go, notify }: { open: boolean; onClose: () => void; page: string; location: VenueLocation; go: Go; notify: Notify }) {
  const [query, setQuery] = useState("");
  const hasNoCameras = location.cameras === 0;
  const problemCamera = hasNoCameras ? "камера не подключена" : `CAM-${String(location.cameras).padStart(2, "0")}`;
  const cameraIssue = hasNoCameras || location.online < location.cameras;
  const hasFinanceSources = ["Poster POS", "Inventory", "Worksection"].every((source) => location.connectedSources?.includes(source));
  const initialMessage = hasNoCameras
    ? `Я вижу контекст ${location.name}, но видеоаналитика ещё не готова: нет камеры, зоны и калибровки. Могу открыть обязательный путь настройки.`
    : cameraIssue
    ? `Я вижу контекст ${location.name}. Сейчас главное: ${problemCamera} offline, поэтому одна зона потеряла видео-SLA. Могу показать источник или создать временный план контроля.`
    : location.historyDays === 0
    ? `Источники ${location.name} готовы, но история событий ещё не накоплена. Live-контроль доступен, а тренды, прогнозы и причинные инсайты пока не публикуются.`
    : `Я вижу контекст ${location.name}. Все ${location.cameras} камер online. Главное отклонение сейчас — рост first contact после вечернего пика; могу показать причины и план действий.`;
  const [messages, setMessages] = useState<Array<{role:"user"|"ai";text:string;actions?:Array<[string,string]>}>>([
    { role:"ai", text:initialMessage, actions:[["cameras",hasNoCameras ? "Добавить камеру" : cameraIssue ? `Проверить ${problemCamera}` : "Проверить fleet"],[hasNoCameras ? "floorplan" : "copilot",hasNoCameras ? "Проверить план и зоны" : "Открыть план смены"]] },
  ]);
  const answer = () => {
    if (!query.trim()) return;
    const q=query;
    const response=q.toLowerCase().includes("кам")?{text:hasNoCameras?`В ${location.name} нет подключённых камер. До появления метрик нужны план этажа, зона, источник, placement, privacy и validation test.`:cameraIssue?`${problemCamera} потеряла RTSP-поток 18 минут назад. Это снизило покрытие одной зоны. Рекомендую запустить диагностику сети и временно переназначить SLA-контроль на соседний источник.`:`Все ${location.cameras} камер ${location.name} online. Средний health ${location.readiness}; потерь кадров и calibration drift за последний час нет.`,actions:[["cameras",hasNoCameras?"Добавить камеру":cameraIssue?"Открыть диагностику":"Открыть fleet"],["floorplan",hasNoCameras?"Создать зону":"Показать покрытие"]] as Array<[string,string]>}:q.toLowerCase().includes("приб")?{text:hasFinanceSources&&location.historyDays>0?"За сегодня VenueFlow нашёл ₴14 860 контролируемого эффекта: ₴6 240 waste, ₴3 240 POS loss и ₴5 380 из staffing/menu действий.":"Прибыль пока нельзя рассчитать честно: нужны Poster POS, Inventory, Worksection и накопленная история этой локации. Я могу открыть mapping источников.",actions:hasFinanceSources&&location.historyDays>0?[["finance","Открыть Profit bridge"],["simulator","Проверить сценарий"]] as Array<[string,string]>:[["integrations","Подключить источники"],["trust","Проверить data readiness"]] as Array<[string,string]>}:{text:location.historyDays>0?"Я связал запрос с текущей локацией, сменой и доступными источниками. Лучше всего начать с Автопилота смены: там действия уже отсортированы по срочности и эффекту.":"Контекст локации загружен, но исторических событий пока нет. Используйте Live для текущего контроля или Data Trust, чтобы увидеть, чего не хватает для аналитики.",actions:location.historyDays>0?[["copilot","Открыть Автопилот"]] as Array<[string,string]>:[["live","Открыть Live"],["trust","Проверить готовность"]] as Array<[string,string]>};
    setMessages((current)=>[...current,{role:"user",text:q},{role:"ai",...response}]);setQuery("");notify("Venue AI подготовил ответ с источниками");
  };
  const sourceCount = location.online + (location.connectedSources?.length ?? 0);
  if(!open)return null;
  return (
    <div className="biz-ai-scrim" onMouseDown={onClose}>
      <aside className="biz-ai-drawer" role="dialog" aria-modal="true" aria-label="Venue AI copilot" onMouseDown={(event)=>event.stopPropagation()}>
        <header><div><i><Bot /></i><p><span>VENUE AI · {location.name}</span><strong>Операционный copilot</strong></p></div><button onClick={onClose} aria-label="Закрыть Venue AI"><X /></button></header>
        <div className="biz-ai-context"><MapPin /> Контекст: {page} · сегодня · live + history {location.historyDays ? `${location.historyDays} дней` : "не накоплена"} <BizPill tone={sourceCount ? "success" : "warning"}><i /> {sourceCount} источников</BizPill></div>
        <main>{messages.map((message,index)=><div className={message.role} key={index}>{message.role==="ai"&&<i><Sparkles /></i>}<section><p>{message.text}</p>{message.actions&&<div>{message.actions.map(([target,label])=><button key={target} onClick={()=>{go(target);onClose();}}>{label}<ArrowRight /></button>)}</div>}</section></div>)}</main>
        <div className="biz-ai-suggestions">{["Почему упала прибыль?","Что с камерами?","План на вечер"].map((item)=><button key={item} onClick={()=>setQuery(item)}>{item}</button>)}</div>
        <footer><input aria-label="Запрос Venue AI" value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>event.key==="Enter"&&answer()} placeholder="Спросите о локации, смене или показателе…"/><button aria-label="Отправить запрос Venue AI" disabled={!query.trim()} onClick={answer}><Send /></button></footer>
        <small><ShieldCheck /> AI показывает источники и просит подтверждение перед денежными действиями.</small>
      </aside>
    </div>
  );
}
