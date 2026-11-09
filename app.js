(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEG = Math.PI / 180;

  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const fmt = (v, d = 1) => Number(v).toFixed(d).replace(".", ",");

  const DEFAULT_PARAMS = {
    rollP: 0.070, pitchP: 0.070, rollD: 0.0030, pitchD: 0.0030, rollI: 0.060, pitchI: 0.060,
    yawP: 0.180, yawD: 0.0030, yawI: 0.060,
    angRollP: 4.5, angPitchP: 4.5, angYawP: 4.5,
    filter: 80, accelFilter: 10,
    notchEnable: 0, notchMode: 1, notchFreq: 120, notchBW: 40, notchAtt: 30,
    notch2Enable: 0, notch2Freq: 240, fftEnable: 0,
    motThstExpo: 0.65, motThstHover: 0.50, motSpinMin: 0.10, motSpinMax: 0.95,
    batVoltMax: 25.2, batVoltMin: 19.8,
    pscPosXY: 1.0, pscVelXY: 2.0, pscPosZ: 1.0,
    accMaxRll: 1100, accMaxPit: 1100,
  };

  const LEVELS = [
    {
      id: 1,
      label: "Тремтіння",
      kicker: "Рівень 1 · діагностика",
      title: "Дрон тремтить",
      heading: "Дрон тремтить. Знайдіть причину.",
      intro: "Під час hover дрон швидко тремтить. VIBE і BAT виглядають нормально. Підніміть дрон, зніміть лог і знайдіть, що саме це викликає.",
      story: "Дрон зібраний і відкалібрований. На першому hover з'явилося швидке тремтіння. Ваше завдання - не вгадати параметр, а знайти докази й усунути причину.",
      mission: "Стабільний hover без тремтіння",
      hint: "Не змінюйте параметри, поки не побачите докази в лозі.",
      initial: { rollP: 0.180, pitchP: 0.180 },
      evidence: { required: ["rate"], optional: ["rcou"], wrong: ["vibe", "bat", "fft", "att"], ok: "Діагноз підтверджено: контур коливався, VIBE і BAT були в нормі." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        if (p > 0.095) return fail("P все ще завеликий");
        if (p < 0.045) return fail("P замалий");
        return ok();
      },
    },
    {
      id: 2,
      label: "Дзижчання",
      kicker: "Рівень 2 · діагностика",
      title: "Дрон дзижчить",
      heading: "Дрон дзижчить. Знайдіть причину.",
      intro: "Дрон не розгойдується великою хвилею, а дрібно дзижчить. VIBE виглядає майже нормальним. Подивіться RATE і RCOU.",
      story: "Після заміни гвинтів з'явився дрібний шум. Механіка перевірена, VIBE низький. Знайдіть, що саме змінилося в контурі.",
      mission: "Прибрати високочастотний шум",
      hint: "Шум і механічна вібрація виглядають схоже, але логи показують різні речі.",
      initial: { rollD: 0.0200, pitchD: 0.0200 },
      evidence: { required: ["rate", "rcou"], optional: [], wrong: ["vibe", "bat", "fft", "att"], ok: "Діагноз підтверджено: шум у контурі, VIBE нормальний." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006) return fail("D все ще завеликий");
        if (d < 0.001) return fail("D замалий");
        return ok();
      },
    },
    {
      id: 3,
      label: "Запізнення",
      kicker: "Рівень 3 · діагностика",
      title: "Дрон запізнюється",
      heading: "Дрон запізнюється. Знайдіть причину.",
      intro: "Дрон млявий, реагує із затримкою і плавно розгойдується. VIBE нормальний. Порівняйте RATE з RATE_SP.",
      story: "PID уже хтось чіпав, але симптом не зник. P і D виглядають розумно. Подивіться не на амплітуду, а на момент реакції.",
      mission: "Прибрати затримку в контурі",
      hint: "Логи покажуть, чи проблема в амплітуді, чи в часі.",
      initial: { filter: 20 },
      evidence: { required: ["rate"], optional: [], wrong: ["vibe", "bat", "fft", "att"], ok: "Діагноз підтверджено: RATE відставав від цілі, VIBE нормальний." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006 || d < 0.001) return fail("D змінений неправильно");
        if (a.filter < 60) return fail("Фільтр все ще занизький");
        if (a.filter > 100) return fail("Фільтр зависокий");
        return ok();
      },
    },
    {
      id: 4,
      label: "Вібрація",
      kicker: "Рівень 4 · діагностика",
      title: "Дрон вібрує",
      heading: "Дрон вібрує. Знайдіть причину.",
      intro: "VIBE високий, у спектрі є пік. RATE шумить. Це не схоже на звичайне налаштування P.",
      story: "Після заміни моторів з'явилася вібрація. Механіку перевірили, але VIBE не впав. Знайдіть частоту й усуньте джерело.",
      mission: "Прибрати моторний пік",
      hint: "Спектр покаже частоту; не знижуйте загальний фільтр навмання.",
      initial: { notchEnable: 0 },
      evidence: { required: ["vibe", "fft"], optional: ["rate"], wrong: ["bat", "att"], ok: "Діагноз підтверджено: VIBE і FFT вказували на моторний пік." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006 || d < 0.001) return fail("D змінений неправильно");
        if (a.filter < 60 || a.filter > 100) return fail("Фільтр змінений неправильно");
        if (a.notchEnable !== 1) return fail("Notch не увімкнений");
        if (a.notchFreq < 105 || a.notchFreq > 135) return fail("Частота notch не на піку");
        if (a.notchBW < 20 || a.notchBW > 80) return fail("Смуга notch не в нормі");
        return ok();
      },
    },
    {
      id: 5,
      label: "Знос",
      kicker: "Рівень 5 · діагностика",
      title: "Дрон зносить",
      heading: "Дрон зносить. Знайдіть причину.",
      intro: "Дрон постійно відходить в один бік і тримає невеликий нахил. VIBE нормальний, батарея в нормі.",
      story: "На вулиці з легким вітром дрон не тримає точку. P і D уже перевірені. Подивіться на сталий зсув, а не на шум.",
      mission: "Прибрати сталий знос",
      hint: "Сталий зсув і шум - різні діагнози.",
      initial: { rollI: 0.010 },
      evidence: { required: ["rate", "att"], optional: [], wrong: ["vibe", "bat", "fft"], ok: "Діагноз підтверджено: RATE мав сталий зсув, ATT показував нахил." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006 || d < 0.001) return fail("D змінений неправильно");
        if (a.filter < 60 || a.filter > 100) return fail("Фільтр змінений неправильно");
        if (a.rollI < 0.045) return fail("I все ще замалий");
        if (a.rollI > 0.09) return fail("I завеликий");
        return ok();
      },
    },
    {
      id: 6,
      label: "Комбінована",
      kicker: "Рівень 6 · складний",
      title: "Кілька симптомів",
      heading: "Симптомів більше одного. Знайдіть причини.",
      intro: "Дрон і тремтить, і дрібно шумить. Один параметр не пояснює всю картину. Логи містять кілька складових.",
      story: "Після ремонту хтось змінив кілька параметрів. Механіка й батарея в нормі. Потрібно знайти не один винний параметр, а комбінацію.",
      mission: "Стабільний hover без тремтіння й шуму",
      hint: "Розділіть симптоми за частотою: що повільніше, що швидше.",
      initial: { rollP: 0.165, pitchP: 0.165, rollD: 0.0180, pitchD: 0.0180 },
      evidence: { required: ["rate", "rcou"], optional: [], wrong: ["vibe", "bat", "fft", "att"], ok: "Діагноз підтверджено: у лозі були дві складові." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006 || d < 0.001) return fail("D змінений неправильно");
        if (a.rollI < 0.04 || a.rollI > 0.09) return fail("I змінений неправильно");
        return ok();
      },
    },
    {
      id: 7,
      label: "Вібрація + запізнення",
      kicker: "Рівень 7 · складний",
      title: "Вібрація і запізнення",
      heading: "Два симптоми в одному лозі.",
      intro: "VIBE високий, а RATE одночасно відстає від цілі. Схоже, що проблема не в одному параметрі.",
      story: "Після заміни моторів і експериментів із фільтрами дрон став млявим і вібрує. Потрібно розділити механічний пік і затримку.",
      mission: "Прибрати пік і повернути нормальну реакцію",
      hint: "Спектр і час реакції - різні джерела доказів.",
      initial: { filter: 25, notchEnable: 0 },
      evidence: { required: ["vibe", "fft", "rate"], optional: [], wrong: ["bat", "att", "rcou"], ok: "Діагноз підтверджено: були і пік, і затримка." },
      check: (a) => {
        const p = (a.rollP + a.pitchP) / 2;
        const d = (a.rollD + a.pitchD) / 2;
        if (p > 0.095 || p < 0.045) return fail("P змінений неправильно");
        if (d > 0.006 || d < 0.001) return fail("D змінений неправильно");
        if (a.filter < 60 || a.filter > 100) return fail("Фільтр змінений неправильно");
        if (a.notchEnable !== 1) return fail("Notch не увімкнений");
        if (a.notchFreq < 105 || a.notchFreq > 135) return fail("Частота notch не на піку");
        if (a.notchBW < 20 || a.notchBW > 80) return fail("Смуга notch не в нормі");
        return ok();
      },
    },
  ];

  const PARAM_DEFS = {
    rollP: { code: "ATC_RAT_RLL_P", min: 0.01, max: 0.30, step: 0.005, dec: 3, unit: "-", desc: "Пропорційна складова roll" },
    pitchP: { code: "ATC_RAT_PIT_P", min: 0.01, max: 0.30, step: 0.005, dec: 3, unit: "-", desc: "Пропорційна складова pitch" },
    rollD: { code: "ATC_RAT_RLL_D", min: 0, max: 0.02, step: 0.0005, dec: 4, unit: "-", desc: "Демпфування roll" },
    pitchD: { code: "ATC_RAT_PIT_D", min: 0, max: 0.02, step: 0.0005, dec: 4, unit: "-", desc: "Демпфування pitch" },
    rollI: { code: "ATC_RAT_RLL_I", min: 0, max: 0.30, step: 0.005, dec: 3, unit: "-", desc: "Інтегральна складова roll" },
    filter: { code: "INS_GYRO_FILTER", min: 20, max: 120, step: 5, dec: 0, unit: "Гц", desc: "ФНЧ гіроскопа" },
    notchEnable: { code: "INS_HNTCH_ENABLE", min: 0, max: 1, step: 1, dec: 0, unit: "0/1", desc: "Увімкнення notch" },
    notchFreq: { code: "INS_HNTCH_FREQ", min: 40, max: 250, step: 1, dec: 0, unit: "Гц", desc: "Центральна частота notch" },
    notchBW: { code: "INS_HNTCH_BW", min: 10, max: 120, step: 1, dec: 0, unit: "Гц", desc: "Ширина notch" },    pitchI: { code: "ATC_RAT_PIT_I", min: 0, max: 0.30, step: 0.005, dec: 3, unit: "-", desc: "Інтегральна складова pitch" },
    yawP: { code: "ATC_RAT_YAW_P", min: 0.01, max: 0.50, step: 0.005, dec: 3, unit: "-", desc: "Пропорційна складова yaw" },
    yawD: { code: "ATC_RAT_YAW_D", min: 0, max: 0.02, step: 0.0005, dec: 4, unit: "-", desc: "Демпфування yaw" },
    yawI: { code: "ATC_RAT_YAW_I", min: 0, max: 0.30, step: 0.005, dec: 3, unit: "-", desc: "Інтегральна складова yaw" },
    angRollP: { code: "ATC_ANG_RLL_P", min: 0.5, max: 12, step: 0.1, dec: 1, unit: "-", desc: "Кутовий P roll" },
    angPitchP: { code: "ATC_ANG_PIT_P", min: 0.5, max: 12, step: 0.1, dec: 1, unit: "-", desc: "Кутовий P pitch" },
    angYawP: { code: "ATC_ANG_YAW_P", min: 0.5, max: 12, step: 0.1, dec: 1, unit: "-", desc: "Кутовий P yaw" },
    accelFilter: { code: "INS_ACCEL_FILTER", min: 5, max: 40, step: 1, dec: 0, unit: "Гц", desc: "ФНЧ акселерометра" },
    notchMode: { code: "INS_HNTCH_MODE", min: 1, max: 4, step: 1, dec: 0, unit: "-", desc: "Режим notch" },
    notchAtt: { code: "INS_HNTCH_ATT", min: 5, max: 50, step: 1, dec: 0, unit: "дБ", desc: "Глибина notch" },
    notch2Enable: { code: "INS_HNTC2_ENABLE", min: 0, max: 1, step: 1, dec: 0, unit: "0/1", desc: "Другий notch" },
    notch2Freq: { code: "INS_HNTC2_FREQ", min: 40, max: 300, step: 1, dec: 0, unit: "Гц", desc: "Частота другого notch" },
    fftEnable: { code: "FFT_ENABLE", min: 0, max: 1, step: 1, dec: 0, unit: "0/1", desc: "Увімкнення FFT" },
    motThstExpo: { code: "MOT_THST_EXPO", min: 0, max: 1, step: 0.01, dec: 2, unit: "-", desc: "Крива тяги" },
    motThstHover: { code: "MOT_THST_HOVER", min: 0.1, max: 0.8, step: 0.01, dec: 2, unit: "-", desc: "Газ зависання" },
    motSpinMin: { code: "MOT_SPIN_MIN", min: 0, max: 0.3, step: 0.01, dec: 2, unit: "-", desc: "Мінімальний газ" },
    motSpinMax: { code: "MOT_SPIN_MAX", min: 0.5, max: 1, step: 0.01, dec: 2, unit: "-", desc: "Максимальний газ" },
    batVoltMax: { code: "MOT_BAT_VOLT_MAX", min: 12, max: 50, step: 0.1, dec: 1, unit: "В", desc: "Максимум напруги" },
    batVoltMin: { code: "MOT_BAT_VOLT_MIN", min: 9, max: 42, step: 0.1, dec: 1, unit: "В", desc: "Мінімум напруги" },
    pscPosXY: { code: "PSC_POSXY_P", min: 0.1, max: 5, step: 0.1, dec: 1, unit: "-", desc: "Позиційний P XY" },
    pscVelXY: { code: "PSC_VELXY_P", min: 0.1, max: 8, step: 0.1, dec: 1, unit: "-", desc: "Швидкісний P XY" },
    pscPosZ: { code: "PSC_POSZ_P", min: 0.1, max: 5, step: 0.1, dec: 1, unit: "-", desc: "Позиційний P Z" },
    accMaxRll: { code: "ATC_ACC_RLL_MAX", min: 100, max: 3000, step: 50, dec: 0, unit: "deg/s²", desc: "Макс. кутове прискорення roll" },
    accMaxPit: { code: "ATC_ACC_PIT_MAX", min: 100, max: 3000, step: 50, dec: 0, unit: "deg/s²", desc: "Макс. кутове прискорення pitch" },

  };

  function ok() { return { ok: true, reason: "" }; }
  function fail(reason) { return { ok: false, reason }; }

  const state = {
    active: { ...DEFAULT_PARAMS, ...LEVELS[0].initial },
    draft: { ...DEFAULT_PARAMS, ...LEVELS[0].initial },
    level: 0,
    completed: new Set(),
    running: false,
    ended: false,
    t: 0,
    duration: 45,
    flightNo: 0,
    battery: 100,
    diagnosed: false,
    evidenceTried: false,
    needsRetest: false,
    log: [],
    lastLogSample: -1,
    keys: new Set(),
    vehicle: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      motor: [0.5, 0.5, 0.5, 0.5],
      alt: 0,
      targetAlt: 0,
      altRate: 0,
      roll: 0,
      pitch: 0,
      yaw: 0,
      rollRate: 0,
      pitchRate: 0,
      yawRate: 0,
      rollI: 0,
      pitchI: 0,
      prevRollErr: 0,
      prevPitchErr: 0,
      dRoll: 0,
      dPitch: 0,
      maxRate: 0,
      oscAmp: 0,
      oscPhase: 0,
      lagAmp: 0,
      lagPhase: 0,
      noiseAmp: 0,
      noisePhase: 0,
      biasAmp: 0,
    },
  };

  const el = {
    hudAlt: $("#hudAlt"),
    hudSpeed: $("#hudSpeed"),
    hudTime: $("#hudTime"),
    hudBat: $("#hudBat"),
    oscBar: $("#oscBar"),
    oscValue: $("#oscValue"),
    hudHint: $("#hudHint"),
    startOverlay: $("#startOverlay"),
    endOverlay: $("#endOverlay"),
    endTitle: $("#endTitle"),
    endText: $("#endText"),
    startBtn: $("#startBtn"),
    againBtn: $("#againBtn"),
    openGcsBtn: $("#openGcsBtn"),
    landBtn: $("#landBtn"),
    gcsModal: $("#gcsModal"),
    helpModal: $("#helpModal"),
    logCanvas: $("#logCanvas"),
    logTime: $("#logTime"),
    logTimeOut: $("#logTimeOut"),
    flightCount: $("#flightCount"),
    currentP: $("#currentP"),
    diagState: $("#diagState"),
    scoreState: $("#scoreState"),
    logRms: $("#logRms"),
    logMax: $("#logMax"),
    logVibe: $("#logVibe"),
    logSummary: $("#logSummary"),
    logFlightNo: $("#logFlightNo"),
    logReadout: $("#logReadout"),
    fftBlock: $("#fftBlock"),
    fftCanvas: $("#fftCanvas"),
    fftPeak: $("#fftPeak"),
    paramLock: $("#paramLock"),
    paramFeedback: $("#paramFeedback"),
    paramBody: $("#paramBody"),
    paramHint: $("#paramHint"),
    evidenceFeedback: $("#evidenceFeedback"),
    writeParams: $("#writeParams"),
    rebootBtn: $("#rebootBtn"),
    levelSelect: $("#levelSelect"),
    levelHeading: $("#levelHeading"),
    levelIntro: $("#levelIntro"),
    levelKicker: $("#levelKicker"),
    levelTitle: $("#levelTitle"),
    levelStory: $("#levelStory"),
    missionTitle: $("#missionTitle"),
    missionHint: $("#missionHint"),
    brandSub: $("#brandSub"),
    nextLevelBtn: $("#nextLevelBtn"),
  };

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  /* ============================================================
     SCENE
     ============================================================ */
  function drawScene() {
    const v = state.vehicle;
    const horizon = 225 - v.pitch * 3.2 + v.y * 2.0 + Math.sin(state.t * 0.6) * 1.5;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#0a1c25");
    sky.addColorStop(0.55, "#123743");
    sky.addColorStop(1, "#1f4d55");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // distant light
    const glow = ctx.createRadialGradient(W * 0.5, horizon - 35, 5, W * 0.5, horizon - 35, 290);
    glow.addColorStop(0, "rgba(233,196,106,.18)");
    glow.addColorStop(1, "rgba(233,196,106,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, horizon);

    // ground
    const grd = ctx.createLinearGradient(0, horizon, 0, H);
    grd.addColorStop(0, "#1b3d3b");
    grd.addColorStop(1, "#102823");
    ctx.fillStyle = grd;
    ctx.fillRect(0, horizon, W, H - horizon);

    // horizon line
    ctx.strokeStyle = "rgba(233,196,106,.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();

    // perspective grid
    ctx.strokeStyle = "rgba(170,220,210,.16)";
    ctx.lineWidth = 1;
    const vpX = W / 2 - v.x * 9;
    for (let i = -7; i <= 7; i++) {
      ctx.beginPath();
      ctx.moveTo(vpX + i * 18, horizon);
      ctx.lineTo(vpX + i * 170, H);
      ctx.stroke();
    }
    for (let j = 1; j <= 9; j++) {
      const t = j / 9;
      const y = horizon + Math.pow(t, 1.6) * (H - horizon);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // landing pad
    const padY = H - 65 + v.y * 6;
    const padX = W / 2 - v.x * 24;
    ctx.save();
    ctx.translate(padX, padY);
    ctx.scale(1, 0.30);
    ctx.beginPath(); ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,184,166,.10)";
    ctx.fill();
    ctx.strokeStyle = "rgba(45,212,191,.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(0, 0, 51, 0, Math.PI * 2); ctx.strokeStyle = "rgba(233,196,106,.5)"; ctx.stroke();
    ctx.restore();

    // drone
    const altScale = clamp(v.alt, 0, 4);
    const droneY = H - 145 - altScale * 48;
    const droneX = W / 2 + v.x * 6;
    const scale = 1 + altScale * 0.035;

    // shadow
    ctx.save();
    ctx.translate(padX, padY - 2);
    ctx.scale(1, 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, 42 * (1 - altScale * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fill();
    ctx.restore();

    // drone body
    ctx.save();
    ctx.translate(droneX, droneY);
    ctx.scale(scale, scale);
    ctx.rotate(v.yaw * DEG * 0.12);

    const visualRoll = v.roll + v.oscAmp * Math.sin(v.oscPhase) + v.lagAmp * Math.sin(v.lagPhase) + v.noiseAmp * Math.sin(v.noisePhase) + v.biasAmp * 0.15;
    const visualPitch = v.pitch + v.oscAmp * 0.55 * Math.sin(v.oscPhase + 0.8);
    const rollPx = Math.sin(visualRoll * DEG) * 26;
    const pitchPx = Math.sin(visualPitch * DEG) * 18;

    // arms
    const arms = [
      { x: -1, y: -0.55, label: "FL" },
      { x: 1, y: -0.55, label: "FR" },
      { x: -1, y: 0.55, label: "RL" },
      { x: 1, y: 0.55, label: "RR" },
    ];
    arms.forEach((a) => {
      const ax = a.x * 76;
      const ay = a.y * 45 + (a.x < 0 ? -rollPx : rollPx) + (a.y < 0 ? -pitchPx : pitchPx);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = "rgba(220,235,232,.48)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.stroke();

      // motor
      ctx.beginPath();
      ctx.arc(ax, ay, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1b20";
      ctx.fill();
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // prop blur
      ctx.beginPath();
      ctx.ellipse(ax, ay - 6, 31, 5, -0.1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(233,196,106,.16)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ax, ay - 6, 22, 3, -0.1, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(245,239,226,.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 57, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#e9e1d1";
    ctx.fill();
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#102331";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -1, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#2dd4bf";
    ctx.fill();

    // nose marker
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(-5, -36);
    ctx.lineTo(5, -36);
    ctx.closePath();
    ctx.fillStyle = "#c2571a";
    ctx.fill();
    ctx.restore();

    // oscillation wave near drone
    const oscLevel = Math.abs(
      v.rollRate +
      v.oscAmp * 2 * Math.PI * 8 * Math.cos(v.oscPhase) +
      v.lagAmp * 2 * Math.PI * 2.3 * Math.cos(v.lagPhase) +
      v.noiseAmp * 2 * Math.PI * 22 * Math.cos(v.noisePhase) +
      v.biasAmp
    );
    if (state.running && oscLevel > 18) {
      ctx.beginPath();
      for (let i = 0; i < 50; i++) {
        const x = droneX - 75 + i * 3;
        const y = droneY + 45 + Math.sin(i * 0.7 + state.t * 16) * clamp(oscLevel / 40, 1, 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(242,112,82,.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  /* ============================================================
     PHYSICS
     ============================================================ */
  const physics = {
    angleP: 4.2,
    maxAcc: 1400,
    damping: 2.1,
    dt: 1 / 120,
    mass: 1.5,
    arm: 0.25,
    inertiaX: 0.020,
    inertiaY: 0.020,
    inertiaZ: 0.032,
    maxThrustPerMotor: 9.0,
    hoverThrottle: 0.50,
    drag: 0.16,
    motorTau: 0.035,
  };

  function stepPhysics(dt) {
    const v = state.vehicle;
    const active = state.active;
    const keys = state.keys;

    if (!state.running) {
      v.roll *= 0.9;
      v.pitch *= 0.9;
      v.rollRate *= 0.9;
      v.pitchRate *= 0.9;
      return;
    }

    state.t += dt;
    if (state.t >= state.duration) {
      endFlight(true);
      return;
    }

    const rollInput = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const pitchInput = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
    const yawInput = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
    const climb = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);

    const targetRoll = rollInput * 15;
    const targetPitch = pitchInput * 12;

    // throttle sets an altitude target; the collective is stabilized
    v.targetAlt = clamp(v.targetAlt + climb * 1.0 * dt, 0.5, 4.2);
    const altErr = v.targetAlt - v.alt;
    const desiredClimb = clamp(altErr * 2.0, -1.6, 1.6);
    const collective = clamp(
      physics.hoverThrottle + altErr * 0.30 + (desiredClimb - v.altRate) * 0.22,
      0.15, 0.95
    );

    const rollTargetRate = clamp(physics.angleP * (targetRoll - v.roll), -220, 220);
    const rollErr = rollTargetRate - v.rollRate;
    v.rollI = clamp(v.rollI + rollErr * dt, -80, 80);
    const dRollRaw = (rollErr - v.prevRollErr) / dt;
    v.dRoll += (dRollRaw - v.dRoll) * (dt / 0.02);
    let rollU = active.rollP * rollErr + active.rollI * v.rollI + active.rollD * v.dRoll +
      (0.075 * Math.sin(2 * Math.PI * 6.0 * state.t) + 0.035 * Math.sin(2 * Math.PI * 2.3 * state.t));
    rollU = clamp(rollU, -1, 1);
    v.prevRollErr = rollErr;

    const pitchTargetRate = clamp(physics.angleP * (targetPitch - v.pitch), -200, 200);
    const pitchErr = pitchTargetRate - v.pitchRate;
    v.pitchI = clamp(v.pitchI + pitchErr * dt, -80, 80);
    const dPitchRaw = (pitchErr - v.prevPitchErr) / dt;
    v.dPitch += (dPitchRaw - v.dPitch) * (dt / 0.02);
    let pitchU = active.pitchP * pitchErr + active.rollI * v.pitchI + active.pitchD * v.dPitch +
      (0.060 * Math.sin(2 * Math.PI * 5.4 * state.t + 1) + 0.030 * Math.sin(2 * Math.PI * 2.1 * state.t));
    pitchU = clamp(pitchU, -1, 1);
    v.prevPitchErr = pitchErr;

    const yawTargetRate = yawInput * 55;
    v.yawRate += (yawTargetRate - v.yawRate) * (dt / 0.25);
    v.yaw += v.yawRate * dt;

    // motor mixer: collective + roll + pitch + yaw
    const rollMix = rollU * 0.38;
    const pitchMix = pitchU * 0.38;
    const yawMix = yawInput * 0.10;
    const cmd = [
      clamp(collective + rollMix + pitchMix - yawMix, 0, 1),
      clamp(collective - rollMix + pitchMix + yawMix, 0, 1),
      clamp(collective + rollMix - pitchMix + yawMix, 0, 1),
      clamp(collective - rollMix - pitchMix - yawMix, 0, 1),
    ];
    for (let i = 0; i < 4; i++) {
      v.motor[i] += (cmd[i] - v.motor[i]) * (dt / physics.motorTau);
      v.motor[i] = clamp(v.motor[i], 0, 1);
    }
    const thrust = v.motor.map((m) => physics.maxThrustPerMotor * Math.pow(m, 1.35));
    const totalThrust = thrust.reduce((a, b) => a + b, 0);

    // body axes -> world
    const cr = Math.cos(v.roll * DEG), sr = Math.sin(v.roll * DEG);
    const cp = Math.cos(v.pitch * DEG), sp = Math.sin(v.pitch * DEG);
    const cy = Math.cos(v.yaw * DEG), sy = Math.sin(v.yaw * DEG);
    const bodyZ = {
      x: cy * sp * cr + sy * sr,
      y: sy * sp * cr - cy * sr,
      z: cp * cr,
    };

    // translational dynamics: thrust, gravity, drag and light wind
    const windX = 0.035 * Math.sin(2 * Math.PI * 0.17 * state.t) + 0.015 * Math.sin(2 * Math.PI * 0.9 * state.t);
    const windY = 0.025 * Math.sin(2 * Math.PI * 0.11 * state.t + 1.2);
    const ax = (totalThrust / physics.mass) * bodyZ.x - physics.drag * v.vx + windX;
    const ay = (totalThrust / physics.mass) * bodyZ.y - physics.drag * v.vy + windY;
    const az = (totalThrust / physics.mass) * bodyZ.z - 9.81 - physics.drag * v.vz;

    v.vx += ax * dt;
    v.vy += ay * dt;
    v.vz += az * dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.alt += v.vz * dt;
    if (v.alt < 0) {
      v.alt = 0;
      v.vz = Math.max(0, v.vz);
    }
    v.x = clamp(v.x, -8, 8);
    v.y = clamp(v.y, -8, 8);
    v.altRate = v.vz;

    // attitude response from actual motor differential
    const rollTorque = physics.arm * (thrust[0] + thrust[2] - thrust[1] - thrust[3]) * 0.75;
    const pitchTorque = physics.arm * (thrust[0] + thrust[1] - thrust[2] - thrust[3]) * 0.75;
    const yawTorque = 0.018 * (thrust[0] + thrust[3] - thrust[1] - thrust[2]);
    v.rollRate += ((rollTorque - 0.03 * v.rollRate) / physics.inertiaX) * dt;
    v.pitchRate += ((pitchTorque - 0.03 * v.pitchRate) / physics.inertiaY) * dt;
    v.yawRate += ((yawTorque - 0.05 * v.yawRate) / physics.inertiaZ) * dt;
    v.roll += v.rollRate * dt;
    v.pitch += v.pitchRate * dt;

    // Level-specific training symptoms. They are simplified but driven by the same parameters.
    const level = LEVELS[state.level];
    const pExcess = clamp((active.rollP - 0.08) / 0.20, 0, 1);
    const dExcess = clamp((active.rollD - 0.006) / 0.014, 0, 1);
    const lagExcess = clamp((60 - active.filter) / 40, 0, 1);
    const notchMissing = (level.id === 4 || level.id === 7) && active.notchEnable !== 1;

    const iDeficit = clamp((0.045 - active.rollI) / 0.035, 0, 1);
    const targetOsc = pExcess * 6.0;
    const targetLag = lagExcess * 3.2;
    const targetNoise = dExcess * 1.4 + (notchMissing ? 0.9 : 0);
    const targetBias = iDeficit * 22;

    v.oscAmp += (targetOsc - v.oscAmp) * (dt / 0.55);
    v.lagAmp += (targetLag - v.lagAmp) * (dt / 0.35);
    v.noiseAmp += (targetNoise - v.noiseAmp) * (dt / 0.25);
    v.biasAmp += (targetBias - v.biasAmp) * (dt / 0.55);
    v.oscPhase += 2 * Math.PI * 8 * dt;
    v.lagPhase += 2 * Math.PI * 2.3 * dt;
    v.noisePhase += 2 * Math.PI * 22 * dt;

    const biasAngle = iDeficit * 3.2;
    const oscAngle = v.oscAmp * Math.sin(v.oscPhase) +
      v.lagAmp * Math.sin(v.lagPhase) +
      v.noiseAmp * Math.sin(v.noisePhase) +
      biasAngle;
    const oscRate = v.oscAmp * 2 * Math.PI * 8 * Math.cos(v.oscPhase) +
      v.lagAmp * 2 * Math.PI * 2.3 * Math.cos(v.lagPhase) +
      v.noiseAmp * 2 * Math.PI * 22 * Math.cos(v.noisePhase) +
      v.biasAmp;

    v.maxRate = Math.max(v.maxRate, Math.abs(v.rollRate + oscRate), Math.abs(v.pitchRate));
    state.battery = Math.max(20, state.battery - dt * 0.07);

    if (state.t - state.lastLogSample >= 0.05) {
      state.lastLogSample = state.t;
      const vibeBase = notchMissing ? 42 : 10.5 + dExcess * 2.0;
      const vibe = vibeBase + Math.sin(state.t * 0.7) * 1.2 + (Math.random() - 0.5) * 0.6;
      state.log.push({
        t: state.t,
        rate: v.rollRate + oscRate,
        target: rollTargetRate,
        roll: v.roll + oscAngle,
        att: v.roll + oscAngle,
        targetRoll,
        vibe,
        alt: v.alt,
        volt: 24.9 - state.t * 0.002 - Math.abs(v.rollRate) * 0.001,
        curr: 22 + totalThrust * 1.8,
        rcou: (v.motor.reduce((a, b) => a + b, 0) / 4) * 1800 + 500,
        p: active.rollP,
      });
    }

    updateHud();
  }

  function updateHud() {
    const v = state.vehicle;
    setText(el.hudAlt, `${fmt(v.alt, 1)} м`);
    setText(el.hudSpeed, `${fmt(Math.hypot(v.vx || 0, v.vy || 0), 1)} м/с`);
    setText(el.hudTime, `${fmt(Math.max(0, state.duration - state.t), 1)} с`);
    setText(el.hudBat, `${Math.round(state.battery)}%`);
    const osc = Math.abs(
      v.rollRate +
      v.oscAmp * 2 * Math.PI * 8 * Math.cos(v.oscPhase) +
      v.lagAmp * 2 * Math.PI * 2.3 * Math.cos(v.lagPhase) +
      v.noiseAmp * 2 * Math.PI * 22 * Math.cos(v.noisePhase) +
      v.biasAmp
    );
    if (el.oscValue) el.oscValue.textContent = fmt(osc, 1);
    if (el.oscBar) {
      const pct = clamp(osc / 80 * 100, 0, 100);
      el.oscBar.style.width = `${pct}%`;
      el.oscBar.style.background = pct > 45 ? "#f27052" : pct > 20 ? "#e9c46a" : "#2dd4bf";
    }
  }

  /* ============================================================
     FLIGHT CONTROL
     ============================================================ */
  function freshVehicle() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, vz: 0,
      motor: [0.5, 0.5, 0.5, 0.5],
      alt: 0, targetAlt: 0, altRate: 0,
      roll: 0, pitch: 0, yaw: 0,
      rollRate: 0, pitchRate: 0, yawRate: 0,
      rollI: 0, pitchI: 0,
      prevRollErr: 0, prevPitchErr: 0, dRoll: 0, dPitch: 0,
      maxRate: 0, oscAmp: 0, oscPhase: 0,
      lagAmp: 0, lagPhase: 0, noiseAmp: 0, noisePhase: 0, biasAmp: 0,
    };
  }

  function makeInitial(lv) {
    const a = { ...DEFAULT_PARAMS, ...lv.initial };
    if (lv.id === 1) {
      const p = 0.16 + Math.random() * 0.06;
      a.rollP = a.pitchP = Number(p.toFixed(3));
    } else if (lv.id === 2) {
      const d = 0.017 + Math.random() * 0.006;
      a.rollD = a.pitchD = Number(d.toFixed(4));
    } else if (lv.id === 3) {
      a.filter = [15, 20, 25, 30][Math.floor(Math.random() * 4)];
    } else if (lv.id === 4) {
      a.notchFreq = 110 + Math.round(Math.random() * 20);
      a.notchEnable = 0;
    } else if (lv.id === 5) {
      a.rollI = Number((0.008 + Math.random() * 0.008).toFixed(3));
    } else if (lv.id === 6) {
      const p = 0.15 + Math.random() * 0.03;
      const d = 0.016 + Math.random() * 0.004;
      a.rollP = a.pitchP = Number(p.toFixed(3));
      a.rollD = a.pitchD = Number(d.toFixed(4));
    } else if (lv.id === 7) {
      a.filter = [20, 25, 30][Math.floor(Math.random() * 3)];
      a.notchFreq = 110 + Math.round(Math.random() * 20);
      a.notchEnable = 0;
    }
    return a;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem("tuningGameProgress");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.completed)) state.completed = new Set(data.completed);
      if (Number.isInteger(data.level) && data.level >= 0 && data.level < LEVELS.length) state.level = data.level;
    } catch (e) { /* ignore */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem("tuningGameProgress", JSON.stringify({
        completed: Array.from(state.completed),
        level: state.level,
      }));
    } catch (e) { /* ignore */ }
  }

  function updateLevelSelect() {
    if (!el.levelSelect) return;
    el.levelSelect.innerHTML = LEVELS.map((lv, i) => {
      const mark = state.completed.has(lv.id) ? " ✓" : "";
      return `<option value="${i}"${i === state.level ? " selected" : ""}>${i + 1}. ${lv.label}${mark}</option>`;
    }).join("");
  }

  function clearEvidence() {
    ["evRate", "evRcou", "evVibe", "evBat", "evFft", "evAtt"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.checked = false;
    });
    if (el.evidenceFeedback) {
      el.evidenceFeedback.textContent = "";
      el.evidenceFeedback.className = "feedback";
    }
  }

  function loadLevel(index) {
    const safeIndex = clamp(index, 0, LEVELS.length - 1);
    state.level = safeIndex;
    const lv = LEVELS[safeIndex];
    const initial = { ...DEFAULT_PARAMS, ...makeInitial(lv) };
    state.active = { ...initial };
    state.draft = { ...initial };
    state.running = false;
    state.ended = false;
    state.t = 0;
    state.flightNo = 0;
    state.battery = 100;
    state.diagnosed = false;
    state.needsRetest = false;
    state.log = [];
    state.lastLogSample = -1;
    state.vehicle = freshVehicle();
    state.keys.clear();

    closeGcs();
    if (el.helpModal) el.helpModal.hidden = true;
    if (el.endOverlay) el.endOverlay.hidden = true;
    if (el.startOverlay) el.startOverlay.hidden = false;
    if (el.landBtn) el.landBtn.hidden = true;
    if (el.nextLevelBtn) el.nextLevelBtn.hidden = true;

    setText(el.levelKicker, lv.kicker);
    setText(el.levelTitle, lv.title);
    setText(el.levelStory, lv.story);
    setText(el.levelHeading, lv.heading);
    setText(el.levelIntro, lv.intro);
    setText(el.missionTitle, lv.mission);
    setText(el.missionHint, "Спочатку докази в лозі, потім зміни.");
    setText(el.brandSub, `${lv.kicker.toLowerCase()} · ${lv.label.toLowerCase()}`);
    setText(el.startBtn, "Зліт");
    setText(el.hudHint, "Натисніть «Зліт»");
    setText(el.flightCount, "0");
    setText(el.currentP, fmt(state.active.rollP, 3));
    setText(el.diagState, "не підтверджено");
    setText(el.scoreState, "-");
    setText(el.paramFeedback, "");
    setText(el.paramLock, "Спочатку підтвердіть діагноз на вкладці «Логи». Параметри заблоковані.");
    el.paramLock?.classList.remove("unlocked");

    renderParams();
    syncParamInputs();
    clearEvidence();
    updateLevelSelect();
    saveProgress();
    drawScene();
    updateHud();
  }

  function startFlight() {
    if (state.running) return;
    state.running = true;
    state.ended = false;
    state.t = 0;
    state.flightNo += 1;
    state.lastLogSample = -1;
    state.log = [];
    state.battery = 100;
    state.vehicle = freshVehicle();
    state.vehicle.targetAlt = 1.9;
    state.keys.clear();
    if (el.startOverlay) el.startOverlay.hidden = true;
    if (el.endOverlay) el.endOverlay.hidden = true;
    if (el.nextLevelBtn) el.nextLevelBtn.hidden = true;
    if (el.landBtn) el.landBtn.hidden = false;
    setText(el.flightCount, String(state.flightNo));
    setText(el.hudHint, "Утримуйте висоту й дивіться на реакцію");
    setText(el.currentP, fmt(state.active.rollP, 3));
  }

  function endFlight(auto = false) {
    if (!state.running) return;
    state.running = false;
    state.ended = true;
    state.keys.clear();
    if (el.landBtn) el.landBtn.hidden = true;

    const result = evaluate();
    setText(el.endTitle, result.title);
    setText(el.endText, result.text);
    if (el.endOverlay) el.endOverlay.hidden = false;
    if (el.nextLevelBtn) {
      el.nextLevelBtn.hidden = !result.success || state.level >= LEVELS.length - 1;
    }

    const maxRate = state.log.length ? Math.max(...state.log.map((r) => Math.abs(r.rate))) : 0;
    const rms = state.log.length ? Math.sqrt(state.log.reduce((s, r) => s + r.rate * r.rate, 0) / state.log.length) : 0;
    const lastVibe = state.log.length ? state.log[state.log.length - 1].vibe : 0;
    setText(el.logFlightNo, String(state.flightNo));
    setText(el.logMax, fmt(maxRate, 0));
    setText(el.logRms, fmt(rms, 1));
    setText(el.logVibe, fmt(lastVibe, 1));
    const lv = LEVELS[state.level];
    const summaryKeys = ["rollP", "pitchP", "rollD", "pitchD", "rollI", "filter"];
    if (lv.id === 4 || lv.id === 7) summaryKeys.push("notchEnable", "notchFreq", "notchBW");
    const paramText = summaryKeys
      .map((k) => `${PARAM_DEFS[k].code}=${fmt(state.active[k], PARAM_DEFS[k].dec)}`)
      .join(", ");
    const fftText = (lv.id === 4 || lv.id === 7)
      ? (state.active.notchEnable === 1 ? " Notch увімкнений." : " FFT: пік близько 120 Гц.")
      : "";
    setText(el.logSummary, `${paramText}. VIBE ${fmt(lastVibe, 1)}.${fftText}`);
    drawLog();
    setText(el.diagState, state.diagnosed ? "підтверджено" : "не підтверджено");
    if (result.success) {
      state.completed.add(lv.id);
      saveProgress();
      updateLevelSelect();
      setText(el.scoreState, `${result.score}/100`);
    }
  }

  function evaluate() {
    const lv = LEVELS[state.level];
    const maxRate = state.log.length ? Math.max(...state.log.map((r) => Math.abs(r.rate))) : 0;
    const rms = state.log.length ? Math.sqrt(state.log.reduce((s, r) => s + r.rate * r.rate, 0) / state.log.length) : 0;
    const check = lv.check(state.active);
    let title = "Ще не готово";
    let text = "";
    let success = false;
    let score = 35;

    if (!state.diagnosed) {
      title = "Діагноз не підтверджено";
      text = "Параметри можна змінювати тільки після доказів. Поверніться до GCS → «Логи», виберіть поля, які підтверджують причину.";
      score = 30;
    } else if (!check.ok) {
      title = "Ще не в нормі";
      text = "Параметри не дають стабільного польоту. Поверніться до логів і перевірте, який симптом залишився.";
      score = 45;
    } else if (maxRate >= 12 || rms >= 8) {
      title = "Симптом ще є";
      text = `Параметри в нормі, але в лозі ще є коливання: RATE max ${fmt(maxRate, 0)} deg/s, RMS ${fmt(rms, 1)}. Повторіть політ після Reboot.`;
      score = 65;
    } else {
      title = "Рівень пройдено";
      text = `Стабільний hover: RATE max ${fmt(maxRate, 0)} deg/s, RMS ${fmt(rms, 1)}. ${lv.evidence.ok}`;
      success = true;
      score = 100;
    }

    return { title, text, success, score, maxRate, rms };
  }

  /* ============================================================
     LOG DRAWING
     ============================================================ */
  function drawFft() {
    const c = el.fftCanvas;
    if (!c) return;
    const isL4 = [4, 7].includes(LEVELS[state.level].id);
    if (el.fftBlock) el.fftBlock.hidden = !isL4;
    if (!isL4) return;
    const g = c.getContext("2d");
    const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#0c222b";
    g.fillRect(0, 0, w, h);

    const ml = 46, mr = 18, mt = 16, mb = 24;
    const maxF = 260;
    const x = (f) => ml + (f / maxF) * (w - ml - mr);
    const y = (a) => h - mb - a * (h - mt - mb);

    g.strokeStyle = "rgba(255,255,255,.12)";
    g.fillStyle = "rgba(255,255,255,.45)";
    g.font = "10px Consolas, monospace";
    for (let f = 40; f <= 240; f += 40) {
      g.beginPath(); g.moveTo(x(f), mt); g.lineTo(x(f), h - mb); g.stroke();
      g.fillText(`${f}`, x(f) - 8, h - 8);
    }
    g.fillText("Гц", w - 28, h - 8);

    const notchOn = state.active.notchEnable === 1;
    const peakF = clamp(Number(state.active.notchFreq) || 120, 40, 250);
    const peakAmp = notchOn ? 0.18 : 1.0;

    g.beginPath();
    for (let f = 40; f <= maxF; f += 1) {
      const floor = 0.05 + 0.018 * Math.sin(f * 0.13) + 0.012 * Math.sin(f * 0.41);
      const peak = peakAmp * Math.exp(-Math.pow((f - peakF) / 14, 2));
      const a = clamp(floor + peak, 0, 1.2);
      const xx = x(f), yy = y(a);
      if (f === 40) g.moveTo(xx, yy); else g.lineTo(xx, yy);
    }
    g.strokeStyle = notchOn ? "rgba(45,212,191,.85)" : "rgba(242,112,82,.95)";
    g.lineWidth = 1.6;
    g.stroke();

    g.strokeStyle = "rgba(233,196,106,.55)";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(x(peakF), mt); g.lineTo(x(peakF), h - mb); g.stroke();
    g.setLineDash([]);
    setText(el.fftPeak, notchOn
      ? `пік ${Math.round(peakF)} Гц пригнічений notch`
      : `пік ${Math.round(peakF)} Гц високий`);
  }

  function updateLogReadout() {
    if (!el.logReadout) return;
    if (!state.log.length) {
      setText(el.logReadout, "Спочатку виконайте політ");
      return;
    }
    const t = Number(el.logTime?.value || 0);
    let nearest = state.log[0];
    for (const r of state.log) {
      if (Math.abs(r.t - t) < Math.abs(nearest.t - t)) nearest = r;
    }
    const parts = [
      `t ${fmt(nearest.t, 1)} с`,
      `RATE ${fmt(nearest.rate, 0)}`,
      `RATE_SP ${fmt(nearest.target, 0)}`,
      `VIBE ${fmt(nearest.vibe, 1)}`,
      `BAT ${fmt(nearest.volt, 2)} В`,
      `ALT ${fmt(nearest.alt || 0, 1)} м`,
    ];
    if (nearest.att != null) parts.push(`ATT ${fmt(nearest.att, 1)}°`);
    setText(el.logReadout, parts.join("  ·  "));
  }

  function drawLog() {
    const c = el.logCanvas;
    if (!c) return;
    const g = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#0c222b";
    g.fillRect(0, 0, w, h);

    if (!state.log.length) {
      g.fillStyle = "rgba(255,255,255,.55)";
      g.font = "16px Consolas, monospace";
      g.fillText("Спочатку виконайте політ", 30, 45);
      if (el.fftBlock) el.fftBlock.hidden = true;
      setText(el.logReadout, "Спочатку виконайте політ");
      return;
    }

    const ml = 58, mr = 22, mt = 24, mb = 26;
    const ph = (h - mt - mb - 32) / 3;
    const maxT = Math.max(5, state.log[state.log.length - 1].t);
    const x = (t) => ml + (t / maxT) * (w - ml - mr);

    g.font = "11px Consolas, monospace";
    g.fillStyle = "rgba(255,255,255,.45)";
    for (let s = 0; s <= Math.ceil(maxT); s += 5) {
      const xx = x(s);
      g.strokeStyle = "rgba(255,255,255,.08)";
      g.beginPath(); g.moveTo(xx, mt); g.lineTo(xx, h - mb); g.stroke();
      g.fillText(`${s}`, xx - 6, h - 8);
    }

    const vibeMax = [4, 7].includes(LEVELS[state.level].id) ? 60 : 30;
    const panels = [
      { y: mt, h: ph, label: "RATE, deg/s", min: -250, max: 250 },
      { y: mt + ph + 18, h: ph, label: "VIBE Z, m/s²", min: 0, max: vibeMax },
      { y: mt + (ph + 18) * 2, h: ph, label: "BAT, V", min: 22, max: 26 },
    ];
    panels.forEach((p) => {
      g.strokeStyle = "rgba(255,255,255,.15)";
      g.strokeRect(ml, p.y, w - ml - mr, p.h);
      g.fillStyle = "rgba(255,255,255,.58)";
      g.fillText(p.label, ml, p.y - 5);
      g.fillStyle = "rgba(255,255,255,.3)";
      g.fillText(`${p.max}`, 20, p.y + 8);
      g.fillText(`${p.min}`, 20, p.y + p.h);
    });

    const yR = (v) => panels[0].y + panels[0].h / 2 - (v / 250) * (panels[0].h / 2);
    const yV = (v) => panels[1].y + panels[1].h - (clamp(v, 0, vibeMax) / vibeMax) * panels[1].h;
    const yB = (v) => panels[2].y + panels[2].h - (clamp(v, 22, 26) - 22) / 4 * panels[2].h;

    // actual rate first, then the setpoint on top so RATE_SP is always visible
    g.save();
    g.beginPath();
    state.log.forEach((r, i) => {
      const yy = yR(r.rate);
      if (i === 0) g.moveTo(x(r.t), yy); else g.lineTo(x(r.t), yy);
    });
    g.strokeStyle = "#2dd4bf";
    g.lineWidth = 2.0;
    g.shadowColor = "rgba(45,212,191,.55)";
    g.shadowBlur = 5;
    g.stroke();
    g.restore();

    g.save();
    g.beginPath();
    state.log.forEach((r, i) => {
      const yy = yR(r.target);
      if (i === 0) g.moveTo(x(r.t), yy); else g.lineTo(x(r.t), yy);
    });
    g.strokeStyle = "#ffd166";
    g.lineWidth = 2.4;
    g.setLineDash([7, 4]);
    g.shadowColor = "rgba(255,209,102,.95)";
    g.shadowBlur = 7;
    g.stroke();
    g.restore();
    g.setLineDash([]);

    // vibe
    g.beginPath();
    state.log.forEach((r, i) => {
      const yy = yV(r.vibe);
      if (i === 0) g.moveTo(x(r.t), yy); else g.lineTo(x(r.t), yy);
    });
    g.strokeStyle = "#f08a4b";
    g.lineWidth = 1.4;
    g.stroke();

    // battery
    g.beginPath();
    state.log.forEach((r, i) => {
      const yy = yB(r.volt);
      if (i === 0) g.moveTo(x(r.t), yy); else g.lineTo(x(r.t), yy);
    });
    g.strokeStyle = "#e9c46a";
    g.lineWidth = 1.4;
    g.stroke();

    // cursor
    const cursorT = Number(el.logTime?.value || 0);
    const xx = x(cursorT);
    g.strokeStyle = "rgba(255,255,255,.65)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(xx, mt); g.lineTo(xx, h - mb); g.stroke();

    // legend with line samples so RATE and RATE_SP are not confused
    g.font = "bold 11px Consolas, monospace";
    let lx = w - 265;
    g.strokeStyle = "#2dd4bf";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(lx, 16); g.lineTo(lx + 18, 16); g.stroke();
    g.fillStyle = "#7ff5e7"; g.fillText("RATE", lx + 24, 20);

    lx += 92;
    g.strokeStyle = "#ffd166";
    g.lineWidth = 3;
    g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(lx, 16); g.lineTo(lx + 18, 16); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#ffe7a3"; g.fillText("RATE_SP", lx + 24, 20);

    lx += 108;
    g.strokeStyle = "#f08a4b";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(lx, 16); g.lineTo(lx + 18, 16); g.stroke();
    g.fillStyle = "#ffb37a"; g.fillText("VIBE", lx + 24, 20);

    if (el.logTime) {
      const max = Math.max(5, Math.ceil(maxT));
      el.logTime.max = String(max);
      if (Number(el.logTime.value) > max) el.logTime.value = String(max);
      setText(el.logTimeOut, `${fmt(Number(el.logTime.value), 1)} с`);
    }
    drawFft();
    updateLogReadout();
  }

  /* ============================================================
     GCS / PARAMS
     ============================================================ */
  let paramInputs = {};

  function renderParams() {
    if (!el.paramBody) return;
    const keys = Object.keys(PARAM_DEFS);
    el.paramBody.innerHTML = keys.map((key) => {
      const d = PARAM_DEFS[key];
      return `<tr data-param="${d.code.toLowerCase()} ${d.desc.toLowerCase()}"><td><code>${d.code}</code></td><td><input id="param_${key}" type="number" step="${d.step}" min="${d.min}" max="${d.max}" value="${(state.active[key] ?? DEFAULT_PARAMS[key] ?? 0).toFixed(d.dec)}" disabled></td><td>${d.unit}</td><td>${d.desc}</td></tr>`;
    }).join("");
    paramInputs = {};
    keys.forEach((key) => {
      const input = document.getElementById(`param_${key}`);
      if (input) {
        input.disabled = !state.diagnosed;
        paramInputs[key] = input;
      }
    });
    setText(el.paramHint, "Параметри відкриваються після доказів. Не змінюйте все одразу.");
    filterParams();
  }

  function filterParams() {
    const q = (document.getElementById("paramSearch")?.value || "").trim().toLowerCase();
    $$("#paramBody tr").forEach((tr) => {
      tr.hidden = !!q && !(tr.dataset.param || "").includes(q);
    });
  }

  function syncParamInputs() {
    Object.entries(paramInputs).forEach(([key, input]) => {
      if (!input) return;
      const d = PARAM_DEFS[key];
      input.value = state.active[key].toFixed(d.dec);
      input.disabled = !state.diagnosed;
    });
  }

  function unlockParams() {
    state.diagnosed = true;
    if (el.paramLock) {
      el.paramLock.textContent = "Діагноз підтверджено. Тепер можна змінювати параметри.";
      el.paramLock.classList.add("unlocked");
    }
    Object.values(paramInputs).forEach((i) => { if (i) i.disabled = false; });
    setText(el.diagState, "підтверджено");
    setText(el.evidenceFeedback, LEVELS[state.level].evidence.ok);
    el.evidenceFeedback.className = "feedback ok";
  }

  function readParamInputs() {
    const values = {};
    Object.entries(paramInputs).forEach(([key, input]) => {
      values[key] = Number(input.value);
    });
    return values;
  }

  function writeParams() {
    if (!state.diagnosed) return;
    const values = readParamInputs();
    let valid = true;
    Object.entries(values).forEach(([key, value]) => {
      const d = PARAM_DEFS[key];
      if (!Number.isFinite(value) || value < d.min || value > d.max) valid = false;
    });
    if (!valid) {
      setText(el.paramFeedback, "Значення поза допустимим діапазоном. Перевірте поля.");
      el.paramFeedback.className = "feedback bad";
      return;
    }
    state.draft = { ...state.active, ...values };
    setText(el.paramFeedback, "Записано в чернетку. Натисніть Reboot, щоб застосувати.");
    el.paramFeedback.className = "feedback ok";
  }

  function reboot() {
    if (!state.diagnosed) return;
    state.active = { ...state.draft };
    state.needsRetest = true;
    setText(el.currentP, fmt(state.active.rollP, 3));
    setText(el.paramFeedback, "Контролер перезавантажено. Закрийте GCS і виконайте повторний політ.");
    el.paramFeedback.className = "feedback ok";
    closeGcs();
    if (el.endOverlay) el.endOverlay.hidden = true;
    if (el.startOverlay) {
      el.startOverlay.hidden = false;
      el.startBtn.textContent = "Повторний політ";
    }
    setText(el.hudHint, "Параметри змінено. Перевірте повторно");
    drawScene();
  }

  function closeGcs() {
    if (el.gcsModal) el.gcsModal.hidden = true;
  }

  function openGcs(tab = "logs") {
    if (el.gcsModal) el.gcsModal.hidden = false;
    switchTab(tab);
    drawLog();
    syncParamInputs();
    if (!state.diagnosed) {
      setText(el.paramLock, "Спочатку підтвердіть діагноз на вкладці «Логи». Параметри заблоковані.");
      el.paramLock.classList.remove("unlocked");
    }
  }

  function switchTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    $$(".tab-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));
  }

  /* ============================================================
     INPUT
     ============================================================ */
  const controlled = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "Space"]);
  window.addEventListener("keydown", (e) => {
    if (!controlled.has(e.code)) return;
    e.preventDefault();
    state.keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    if (!controlled.has(e.code)) return;
    e.preventDefault();
    state.keys.delete(e.code);
  });
  window.addEventListener("blur", () => state.keys.clear());

  $$(".touch button").forEach((b) => {
    const code = b.dataset.key;
    const down = (e) => { e.preventDefault(); state.keys.add(code); };
    const up = (e) => { e.preventDefault(); state.keys.delete(code); };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointerleave", up);
    b.addEventListener("pointercancel", up);
  });

  /* ============================================================
     UI BINDINGS
     ============================================================ */
  $("#startBtn")?.addEventListener("click", startFlight);
  $("#againBtn")?.addEventListener("click", () => {
    if (el.endOverlay) el.endOverlay.hidden = true;
    if (el.startOverlay) { el.startOverlay.hidden = false; el.startBtn.textContent = "Зліт"; }
  });
  $("#openGcsBtn")?.addEventListener("click", () => openGcs("logs"));
  $("#landBtn")?.addEventListener("click", () => endFlight(false));
  $("#closeGcs")?.addEventListener("click", closeGcs);
  $("#helpBtn")?.addEventListener("click", () => { if (el.helpModal) el.helpModal.hidden = false; });
  $("#closeHelp")?.addEventListener("click", () => { if (el.helpModal) el.helpModal.hidden = true; });
  $("#helpModal")?.addEventListener("click", (e) => { if (e.target === el.helpModal) el.helpModal.hidden = true; });
  $("#gcsModal")?.addEventListener("click", (e) => { if (e.target === el.gcsModal) closeGcs(); });
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  $("#writeParams")?.addEventListener("click", writeParams);
  $("#rebootBtn")?.addEventListener("click", reboot);
  $("#checkEvidence")?.addEventListener("click", () => {
    const lv = LEVELS[state.level];
    const selected = {
      rate: !!$("#evRate")?.checked,
      rcou: !!$("#evRcou")?.checked,
      vibe: !!$("#evVibe")?.checked,
      bat: !!$("#evBat")?.checked,
      fft: !!$("#evFft")?.checked,
      att: !!$("#evAtt")?.checked,
    };
    const missing = lv.evidence.required.filter((k) => !selected[k]);
    const bad = lv.evidence.wrong.filter((k) => selected[k]);
    if (missing.length) {
      const names = { rate: "RATE", rcou: "RCOU", vibe: "VIBE", bat: "BAT", fft: "FFT", att: "ATT" };
      setText(el.evidenceFeedback, `Бракує доказів: ${missing.map((k) => names[k]).join(", ")}. Подивіться на графіки уважніше.`);
      el.evidenceFeedback.className = "feedback bad";
      return;
    }
    if (bad.length) {
      const names = { rate: "RATE", rcou: "RCOU", vibe: "VIBE", bat: "BAT", fft: "FFT", att: "ATT" };
      setText(el.evidenceFeedback, `Ці поля не підтверджують причину: ${bad.map((k) => names[k]).join(", ")}. Подивіться на графіки уважніше.`);
      el.evidenceFeedback.className = "feedback bad";
      return;
    }
    unlockParams();
  });

  $("#levelSelect")?.addEventListener("change", (e) => {
    loadLevel(Number(e.target.value));
  });

  $("#nextLevelBtn")?.addEventListener("click", () => {
    if (state.level < LEVELS.length - 1) loadLevel(state.level + 1);
  });

  $("#logTime")?.addEventListener("input", drawLog);  $("#paramSearch")?.addEventListener("input", filterParams);

  $("#resetBtn")?.addEventListener("click", () => {
    if (confirm("Скинути гру?")) location.reload();
  });

  /* ============================================================
     LOOP
     ============================================================ */
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.running) {
      acc += dt;
      while (acc >= physics.dt) {
        stepPhysics(physics.dt);
        acc -= physics.dt;
        if (!state.running) break;
      }
    } else {
      stepPhysics(dt);
    }
    drawScene();
    updateHud();
    requestAnimationFrame(loop);
  }

  // init
  loadProgress();
  loadLevel(state.level);
  requestAnimationFrame(loop);
})();







































