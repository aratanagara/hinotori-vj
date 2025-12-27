// sketch.js (FULL) 2025-12-27 (renderer-safe)
// - bgMode=9 : manga shader -> pgManga -> hinotori.frag の bgManga として合成
// - manga は BEAT同期（uTime = beatLocal）
// - useProgram対策：copyToContextを使わず、各pgのrenderer上で createShader(vertSrc, fragSrc) を生成
// - 断ちきり：dir += 4 を “forced bleed” として shader 側で解釈（重なり回避のため「属性化」）

let hinotori, inkelly;

// loaded (main renderer) shaders
let shDisplayLoaded;   // hinotori.vert + hinotori.frag
let shStateLoaded;     // hinotori.vert + bg_inkelly_state.frag
let shMangaLoaded;     // hinotori.vert + bg_manga.frag

// runtime shaders (per-renderer)
let shDisplay;     // for main canvas
let shInkellyA;    // for pgA
let shInkellyB;    // for pgB
let shManga;       // for pgManga

// ping-pong (inkelly state)
let pgA, pgB;
let ping = 0;
let fbW = 0, fbH = 0;

// bgMode=9 manga buffer
let pgManga;

// params
let BPM = 120;
let BEAT_DIV = 4; // 初期：4拍
let bgMode = 0;   // 0..9
let paletteMode = 0; // 0 normal, 1 r, 2 g, 3 b, 4 k(tone)

let center = { x: 0.5, y: 0.5 };
let showHinotori = true;

// rings
let ringDensity = 220.0;
let lineW = 0.14;
let arcWidth = 0.12;
let appearRate = 0.60;
let jitter = 0.18;
let hueSpread = 0.06;

// ink extract
let baseInkGain = 1.10;
let baseInkGamma = 1.10;
let inkOpacity = 0.70;

// ring strength
let colorLineOpacity = 4.8;

// beat flash
let flashAmt = 0.45;
let flashPow = 6.0;
let flashInk = 0.20;

// magenta key
let keyRBMin = 0.60;
let keyGMax = 0.35;
let keySoft = 0.10;

// hue base
let hueCycleBeats = 4;
let hueBaseFrom = 0.0;
let hueBaseTo = 0.35;
let hueStepPrev = -1;

// ink gray triangle wave
let inkCycleBeats = 8;
let grayMin = 0.10;
let grayMax = 0.90;
let grayCurvePow = 1.4;
let inkTint = 0.18;

// update shader params（state用）
let beatsPerStep = 8.0;
let curlAmt = 0.010;
let spawnStrength = 1.0;
let decay = 0.30;

// ---------------------------
// bgMode=9 manga params
// ---------------------------
const PANELS_MAX_SINGLE = 12;
const PANELS_MAX_SPREAD = 24;
const PANELS_MAX = 24;

let manga = [];
let lastMangaCycle = -1;
let mangaCycleBeats = 4.0;

// ★断ちきりが「出ない」を潰す：auto corner bleed を強めに（forced は別）
let mangaBleedChance = 0.35;     // auto corner bleed（補助）
let mangaForcedBleedPerPage = 1; // 各ページ最低いくつ forced bleed を作るか

let mangaFramePx = 1.0;
let mangaInnerFramePx = 1.0;

// コマ間余白（縦横別）
let mangaGutterXPx = 3.0;
let mangaGutterYPx = 12.0;

let mangaToneAmt = 1.0;

// page inset / spread
let mangaPageInsetXPx = 36.0;  // ページの左右余白（内枠用）
let mangaPageInsetYPx = 36.0;  // ページの上下余白（内枠用）
let mangaSpinePx      = 12.0;  // 見開きのノド（中央の余白）

// UI
let uiRoot;
let bgSlider, bpmSlider, beatSlider;
let palButtons = {};
let uiVisible = true;
let uiHideTimer = null;

let bgValueSpan, bpmValueSpan, beatValueSpan;
let hinoBtn;

const LABEL_W = 44;
const VALUE_W = 42;
const GAP_W   = 8;

const BEAT_OPTIONS = [0, 1, 2, 4, 8];

// helpers
function fract(x){ return x - Math.floor(x); }
function smoothFade01(x, powK = 1.0) {
  x = constrain(x, 0, 1);
  x = x*x*(3 - 2*x);
  return Math.pow(x, powK);
}
function pickPaletteRGB(x) {
  x = ((x % 1) + 1) % 1;
  const P = [
    [0.02, 0.93, 0.80],
    [1.00, 0.00, 0.85],
    [1.00, 0.20, 0.12],
    [1.00, 0.92, 0.12],
    [0.10, 0.35, 1.00],
    [1.00, 0.58, 0.42],
    [0.62, 0.22, 1.00],
  ];
  return P[Math.floor(x * P.length)];
}

function randWeights(n, lo, hi){
  const a = [];
  for (let i = 0; i < n; i++) a.push(lo + Math.random() * (hi - lo));
  const s = a.reduce((p,c)=>p+c, 0);
  return a.map(v => v / s);
}

function isSpread(){
  return (windowWidth / Math.max(1, windowHeight)) > 1.15;
}

// ---------------------------
// layout helpers
// ---------------------------
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function rectArea(r){
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
}

function dist2(ax, ay, bx, by){
  const dx = ax - bx, dy = ay - by;
  return dx*dx + dy*dy;
}

// 「角に近いコマ」を探して forced bleed 化（重なり無し）
function forceBleedNearCorners(panels, pageRect, howMany){
  // corners in global uv
  const corners = [
    {x: pageRect.x0, y: pageRect.y0}, // TL
    {x: pageRect.x1, y: pageRect.y0}, // TR
    {x: pageRect.x0, y: pageRect.y1}, // BL
    {x: pageRect.x1, y: pageRect.y1}, // BR
  ];

  // 候補：面積が小さすぎない、ページ内にある程度いる
  const cand = panels
    .map((p, idx) => ({p, idx, a: rectArea(p)}))
    .filter(o => o.a > 0.01);

  if (cand.length === 0) return;

  let forced = 0;

  // 角ごとに「最も近いコマ」を選ぶ（同じコマが複数角に選ばれたら次へ）
  const used = new Set();
  for (let c = 0; c < corners.length && forced < howMany; c++){
    const cx = corners[c].x;
    const cy = corners[c].y;

    cand.sort((A, B) => {
      const acx = (A.p.x0 + A.p.x1) * 0.5;
      const acy = (A.p.y0 + A.p.y1) * 0.5;
      const bcx = (B.p.x0 + B.p.x1) * 0.5;
      const bcy = (B.p.y0 + B.p.y1) * 0.5;
      return dist2(acx, acy, cx, cy) - dist2(bcx, bcy, cx, cy);
    });

    for (const o of cand){
      if (used.has(o.idx)) continue;
      used.add(o.idx);

      // dir に +4 して forced bleed フラグ化（shader側で解釈）
      o.p.dir = (o.p.dir % 4) + 4;
      forced++;
      break;
    }
  }

  // まだ足りなければ、残り候補から適当に forced
  while (forced < howMany && cand.length > 0){
    const o = cand[Math.floor(Math.random() * cand.length)];
    if (!used.has(o.idx)){
      used.add(o.idx);
      o.p.dir = (o.p.dir % 4) + 4;
      forced++;
    } else break;
  }
}

// ---------------------------
// rebuild manga layout
// - spread: left/right pages separated by mangaSpinePx
// - per page: rows max 3, cols max 4
// - max panels: 12 single, 24 spread
// - forced bleed is "attribute" on existing panels (no overlap)
// ---------------------------
function rebuildMangaLayout(globalTBeats){
  manga = [];

  const spread = isSpread();
  const maxPanels = spread ? PANELS_MAX_SPREAD : PANELS_MAX_SINGLE;

  // spine gap in uv
  const spineUv = (mangaSpinePx / Math.max(1, fbW));   // total gap width (uv)
  const halfGap = spineUv * 0.5;

  // page rects in global uv
  const pages = [];
  if (!spread){
    pages.push({ x0: 0.0, x1: 1.0, y0: 0.0, y1: 1.0 });
  } else {
    pages.push({ x0: 0.0,          x1: 0.5 - halfGap, y0: 0.0, y1: 1.0 }); // left
    pages.push({ x0: 0.5 + halfGap, x1: 1.0,          y0: 0.0, y1: 1.0 }); // right
  }

  // build one page panels
  function buildPage(pageRect){
    // page inset in uv (inside that page)
    const pageW = Math.max(1e-6, pageRect.x1 - pageRect.x0);
    const pageH = Math.max(1e-6, pageRect.y1 - pageRect.y0);

    const insetXuv = (mangaPageInsetXPx / Math.max(1, fbW)) * pageW;
    const insetYuv = (mangaPageInsetYPx / Math.max(1, fbH)) * pageH;

    const xMin = pageRect.x0 + insetXuv;
    const xMax = pageRect.x1 - insetXuv;
    const yMin = pageRect.y0 + insetYuv;
    const yMax = pageRect.y1 - insetYuv;

    // rows 1..3 (MAX 3)
    const rows = 1 + Math.floor(Math.random() * 4);
    const rowH = randWeights(rows, 0.60, 2.20);

    // y ranges
    const y0s = [];
    let accY = 0;
    for(let r=0;r<rows;r++){ y0s[r] = accY; accY += rowH[r]; }
    for(let r=0;r<rows;r++){
      const ry0 = (y0s[r]/accY);
      const rh  = (rowH[r]/accY);
      y0s[r] = yMin + ry0 * (yMax - yMin);
      rowH[r] = rh * (yMax - yMin);
    }

    const pagePanels = [];

    for(let r=0;r<rows;r++){
      const yy0 = y0s[r];
      const yy1 = yy0 + rowH[r];

      // cols 1..4 (MAX 4)
      const cols = 1 + Math.floor(Math.random() * 3);
      const colW = randWeights(cols, 0.55, 2.40).map(v => v * (xMax - xMin));

      // 右→左
      let xRight = xMax;
      for(let c=0;c<cols;c++){
        const ww = Math.max((xMax - xMin) * 0.12, colW[c]);
        const x1 = xRight;
        const x0 = xRight - ww;
        xRight = x0;

        const isLast = (c === cols - 1);
        const xx0 = isLast ? xMin : Math.max(xMin, x0);
        const xx1 = isLast ? x1   : Math.min(xMax, x1);

        const pick = Math.random();
        const fxForShader = (pick < 0.40) ? 2.0 : (pick < 0.70 ? 1.0 : 0.0);
        const dir = Math.floor(Math.random() * 4);

        const t0  = globalTBeats + (Math.random() * 0.20);
        const dur = 1.60 + Math.random() * 0.50;

        const p = { x0: xx0, y0: yy0, x1: xx1, y1: yy1, t0, dur, fx: fxForShader, dir };
        pagePanels.push(p);
        if (manga.length + pagePanels.length >= maxPanels) break;
      }
      if (manga.length + pagePanels.length >= maxPanels) break;
    }

    // ★断ちきり保証：このページの角近傍から forced bleed を最低 mangaForcedBleedPerPage 個
    // （ページ内枠の外へ伸ばす効果は shader 側で "gutter 0" になるので、見た目がちゃんと断ちきりになる）
    forceBleedNearCorners(pagePanels, pageRect, mangaForcedBleedPerPage);

    // push
    for (const p of pagePanels){
      manga.push(p);
      if (manga.length >= maxPanels) break;
    }
  }

  for (let i=0;i<pages.length;i++){
    if (manga.length >= maxPanels) break;
    buildPage(pages[i]);
  }

  // 仕上げ：たまに “auto corner bleed” も効くように corners を少しだけページ端に寄せる（控えめ）
  // forced bleed が主役なので、これは軽く。
  for (const p of manga){
    if ((p.dir|0) >= 4){
      // forced bleed は完全にページ端へ吸着（断ちきりの見た目を確実に）
      if (p.x0 < 0.03) p.x0 = 0.0;
      if (p.y0 < 0.03) p.y0 = 0.0;
      if (p.x1 > 0.97) p.x1 = 1.0;
      if (p.y1 > 0.97) p.y1 = 1.0;
    }
  }
}

// preload
function preload(){
  hinotori = loadImage("hinotori.png");
  inkelly  = loadImage("inkelly.png");

  shDisplayLoaded = loadShader("hinotori.vert", "hinotori.frag");
  shStateLoaded   = loadShader("hinotori.vert", "bg_inkelly_state.frag");
  shMangaLoaded   = loadShader("hinotori.vert", "bg_manga.frag");
}

// ★renderer安全: 任意renderer上にシェーダを“再生成”する
function makeShaderOn(pgOrMainRenderer, loadedShader){
  const vert = loadedShader._vertSrc;
  const frag = loadedShader._fragSrc;

  if (!pgOrMainRenderer) return createShader(vert, frag);
  return pgOrMainRenderer.createShader(vert, frag);
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  pixelDensity(1);

  cnv.elt.tabIndex = 1;
  cnv.elt.focus();

  shDisplay = makeShaderOn(null, shDisplayLoaded);

  initBuffers();

  rebuildMangaLayout(0.0);

  // ==============================
  // UI
  // ==============================
  uiRoot = createDiv();
  uiRoot.style(`
    position: fixed;
    left: 0;
    bottom: 0;
    width: 100%;
    padding: 8px 10px;
    box-sizing: border-box;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    z-index: 10;
  `);

  const bgRow = createDiv().parent(uiRoot);
  bgRow.style(`display:flex; align-items:center; gap:6px;`);

  createSpan("BG").parent(bgRow).style(`width:${LABEL_W}px; color:#fff; font-size:12px;`);

  bgValueSpan = createSpan(String(bgMode + 1)).parent(bgRow);
  bgValueSpan.style(`width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;`);

  bgSlider = createSlider(1, 10, bgMode + 1, 1).parent(bgRow);
  bgSlider.style(`width:${sliderWidth()}px;`);
  bgSlider.input(() => {
    bgMode = bgSlider.value() - 1;
    syncUI_All();
    showUI();
  });

  const bpmRow = createDiv().parent(uiRoot);
  bpmRow.style(`display:flex; align-items:center; gap:6px; margin-top:6px;`);

  createSpan("BPM").parent(bpmRow).style(`width:${LABEL_W}px; color:#fff; font-size:12px;`);

  bpmValueSpan = createSpan(String(BPM)).parent(bpmRow);
  bpmValueSpan.style(`width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;`);

  bpmSlider = createSlider(60, 200, BPM, 1).parent(bpmRow);
  bpmSlider.style(`width:${sliderWidth()}px;`);
  bpmSlider.input(() => {
    BPM = bpmSlider.value();
    syncUI_All();
    showUI();
  });

  const beatRow = createDiv().parent(uiRoot);
  beatRow.style(`display:flex; align-items:center; gap:6px; margin-top:6px;`);

  createSpan("BEAT").parent(beatRow).style(`width:${LABEL_W}px; color:#fff; font-size:12px;`);

  beatValueSpan = createSpan(String(BEAT_DIV)).parent(beatRow);
  beatValueSpan.style(`width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;`);

  beatSlider = createSlider(0, BEAT_OPTIONS.length - 1, 3, 1).parent(beatRow);
  beatSlider.style(`width:${sliderWidth()}px;`);
  beatSlider.input(() => {
    BEAT_DIV = BEAT_OPTIONS[beatSlider.value()];
    syncUI_All();
    showUI();
  });

  const hinoRow = createDiv().parent(uiRoot);
  hinoRow.style(`margin-top:6px; display:flex;`);

  hinoBtn = createButton("").parent(hinoRow);
  hinoBtn.style(`flex:1; height:32px; font-size:14px; border:1px solid #555; border-radius:4px;`);
  hinoBtn.mousePressed(() => {
    showHinotori = !showHinotori;
    syncUI_All();
    showUI();
  });

  const palWrap = createDiv().parent(uiRoot);
  palWrap.style("margin-top:6px; display:flex; gap:6px;");

  const pals = [
    { key: "C", mode: 0 },
    { key: "R", mode: 1 },
    { key: "G", mode: 2 },
    { key: "B", mode: 3 },
    { key: "K", mode: 4 },
  ];

  pals.forEach(p => {
    const b = createButton(p.key).parent(palWrap);
    b.style(`flex:1; height:32px; font-size:14px; background:#222; color:#fff; border:1px solid #555; border-radius:4px;`);
    b.mousePressed(() => {
      paletteMode = p.mode;
      syncUI_All();
      showUI();
    });
    palButtons[p.mode] = b;
  });

  const c = document.querySelector("canvas");
  c.addEventListener("pointerdown", () => toggleUI());

  syncUI_All();
}

function initBuffers(){
  const scale = 1.0;
  fbW = Math.max(16, Math.floor(windowWidth  * scale));
  fbH = Math.max(16, Math.floor(windowHeight * scale));

  pgA = createGraphics(fbW, fbH, WEBGL);
  pgB = createGraphics(fbW, fbH, WEBGL);
  pgA.noStroke(); pgB.noStroke();
  pgA.pixelDensity(1); pgB.pixelDensity(1);

  shInkellyA = makeShaderOn(pgA, shStateLoaded);
  shInkellyB = makeShaderOn(pgB, shStateLoaded);

  pgA.background(0);
  pgB.background(0);
  ping = 0;

  pgManga = createGraphics(fbW, fbH, WEBGL);
  pgManga.noStroke();
  pgManga.pixelDensity(1);
  pgManga.background(255);

  shManga = makeShaderOn(pgManga, shMangaLoaded);
}

function computeBeatLocal(tSec){
  if (BEAT_DIV === 0) return tSec * 0.66;
  return tSec * (BPM / 60.0) * (BEAT_DIV / 4.0);
}

function draw() {
  const t = millis() * 0.001;
  const beatLocal = computeBeatLocal(t);

  // A) ping-pong update (inkelly state)
  {
    const src = ping ? pgA : pgB;
    const dst = ping ? pgB : pgA;
    const shU = ping ? shInkellyB : shInkellyA;

    dst.shader(shU);

    shU.setUniform("uPrev", src);
    shU.setUniform("uResolution", [fbW, fbH]);
    shU.setUniform("uTime", t);
    shU.setUniform("uBeat", (BEAT_DIV === 0) ? -1.0 : beatLocal);
    shU.setUniform("uDT", (deltaTime || 16.666) * 0.001);

    shU.setUniform("uBPM", BPM);
    shU.setUniform("uBeatsPerStep", beatsPerStep);
    shU.setUniform("uCurlAmt", curlAmt);
    shU.setUniform("uSpawnStrength", spawnStrength);
    shU.setUniform("uDecay", decay);

    dst.rect(-fbW/2, -fbH/2, fbW, fbH);
    ping ^= 1;
  }
  const stateTex = (ping === 0) ? pgA : pgB;

  // B) bgMode=9 manga render -> pgManga
  {
    const cyc = Math.max(0.001, mangaCycleBeats);
    const cycIndex = Math.floor(beatLocal / cyc);
    if (cycIndex !== lastMangaCycle){
      lastMangaCycle = cycIndex;
      rebuildMangaLayout(beatLocal);
    }

    pgManga.shader(shManga);

    const n = Math.min(manga.length, PANELS_MAX);

    const uM = new Array(96).fill(0);
    const uA = new Array(96).fill(0);

    for(let i=0;i<n;i++){
      const p = manga[i];
      uM[i*4+0] = p.x0;
      uM[i*4+1] = p.y0;
      uM[i*4+2] = p.x1;
      uM[i*4+3] = p.y1;

      uA[i*4+0] = p.t0;
      uA[i*4+1] = p.dur;
      uA[i*4+2] = p.fx;
      uA[i*4+3] = p.dir; // ★ dir>=4 が forced bleed
    }

    shManga.setUniform("uResolution", [fbW, fbH]);
    shManga.setUniform("uTime", beatLocal);
    shManga.setUniform("uCount", n);

    shManga.setUniform("uManga", uM);
    shManga.setUniform("uAnim",  uA);

    shManga.setUniform("uBleedChance", mangaBleedChance);
    shManga.setUniform("uFramePx", mangaFramePx);
    shManga.setUniform("uInnerFramePx", mangaInnerFramePx);
    shManga.setUniform("uGutterXPx", mangaGutterXPx);
    shManga.setUniform("uGutterYPx", mangaGutterYPx);
    shManga.setUniform("uToneAmt", mangaToneAmt);

    pgManga.rect(-fbW/2, -fbH/2, fbW, fbH);
  }

  // C) main render (display)
  shader(shDisplay);

  const phase = (beatLocal / inkCycleBeats) % 1.0;
  let tri = 1.0 - Math.abs(2.0 * phase - 1.0);
  tri = Math.pow(tri, grayCurvePow);
  const g = lerp(grayMin, grayMax, tri);

  const hueStep = Math.floor(beatLocal / hueCycleBeats);
  if (hueStep !== hueStepPrev) {
    hueStepPrev = hueStep;
    hueBaseFrom = hueBaseTo;
    const rrnd = fract(Math.sin((hueStep + 1) * 78.233) * 12345.678);
    hueBaseTo = rrnd;
  }
  const huePhase = (beatLocal / hueCycleBeats) - hueStep;
  const hueF = smoothFade01(huePhase, 1.2);
  const hueBase = lerp(hueBaseFrom, hueBaseTo, hueF);

  const inkCol = pickPaletteRGB(hueBase);
  const r = g * (1 - inkTint) + inkCol[0] * inkTint;
  const gg = g * (1 - inkTint) + inkCol[1] * inkTint;
  const b = g * (1 - inkTint) + inkCol[2] * inkTint;

  let beatUniform = beatLocal;
  if (BEAT_DIV === 0) beatUniform = -1.0;

  shDisplay.setUniform("tex0", hinotori);
  shDisplay.setUniform("tex1", inkelly);
  shDisplay.setUniform("overlayOn", showHinotori ? 1 : 0);

  shDisplay.setUniform("bgExtra", stateTex);
  shDisplay.setUniform("bgManga", pgManga);

  shDisplay.setUniform("resolution", [width, height]);
  shDisplay.setUniform("texSize", [hinotori.width, hinotori.height]);
  shDisplay.setUniform("time", t);
  shDisplay.setUniform("bpm", BPM);
  shDisplay.setUniform("beat", beatUniform);

  shDisplay.setUniform("bgMode", bgMode);
  shDisplay.setUniform("paletteMode", paletteMode);

  shDisplay.setUniform("centerN", [center.x, center.y]);

  shDisplay.setUniform("ringDensity", ringDensity);
  shDisplay.setUniform("lineW", lineW);

  shDisplay.setUniform("arcWidth", arcWidth);
  shDisplay.setUniform("sweepDir", 1.0);
  shDisplay.setUniform("appearRate", appearRate);
  shDisplay.setUniform("jitter", jitter);

  shDisplay.setUniform("baseInkGain", baseInkGain);
  shDisplay.setUniform("baseInkGamma", baseInkGamma);
  shDisplay.setUniform("baseInkColor", [r, gg, b]);
  shDisplay.setUniform("inkOpacity", inkOpacity);

  shDisplay.setUniform("colorLineOpacity", colorLineOpacity);

  shDisplay.setUniform("keyRBMin", keyRBMin);
  shDisplay.setUniform("keyGMax", keyGMax);
  shDisplay.setUniform("keySoft", keySoft);

  shDisplay.setUniform("hueBase", hueBase);
  shDisplay.setUniform("hueSpread", hueSpread);

  shDisplay.setUniform("flashAmt", flashAmt);
  shDisplay.setUniform("flashPow", flashPow);
  shDisplay.setUniform("flashInk", flashInk);

  rect(-width/2, -height/2, width, height);
}

function keyPressed() {
  if (key >= '1' && key <= '9') {
    const v = parseInt(key, 10);
    bgMode = v - 1;
    syncUI_All();
    showUI();
  }
  if (key === '0') {
    bgMode = 9;
    syncUI_All();
    showUI();
  }

  if (keyCode === RIGHT_ARROW) { bgMode = (bgMode + 1) % 10; syncUI_All(); showUI(); }
  if (keyCode === LEFT_ARROW)  { bgMode = (bgMode + 9) % 10; syncUI_All(); showUI(); }

  if (key === 'c' || key === 'C') paletteMode = 0;
  if (key === 'r' || key === 'R') paletteMode = 1;
  if (key === 'g' || key === 'G') paletteMode = 2;
  if (key === 'b' || key === 'B') paletteMode = 3;
  if (key === 'k' || key === 'K') paletteMode = 4;

  if (key === 'h' || key === 'H') showHinotori = !showHinotori;

  syncUI_All();
  showUI();

  if (key === ' ') {
    const c = document.querySelector('canvas');
    if (c) c.focus();
  }
}

// UI sync
function syncUI_All(){
  if(bgValueSpan) bgValueSpan.html(String(bgMode + 1));
  if(bgSlider) bgSlider.value(bgMode + 1);

  if(bpmValueSpan) bpmValueSpan.html(String(BPM));
  if(bpmSlider) bpmSlider.value(BPM);

  if(beatValueSpan){
    beatValueSpan.html(BEAT_DIV === 0 ? "FREE" : String(BEAT_DIV));
  }
  if(beatSlider){
    const idx = BEAT_OPTIONS.indexOf(BEAT_DIV);
    if(idx >= 0) beatSlider.value(idx);
  }

  Object.keys(palButtons).forEach(k => {
    const b = palButtons[k];
    if (Number(k) === paletteMode) b.style("background:#fff;color:#000;");
    else b.style("background:#222;color:#fff;");
  });

  if(hinoBtn){
    if(showHinotori){
      hinoBtn.html("HINOTORI ON");
      hinoBtn.style("background:#fff;color:#000;");
    }else{
      hinoBtn.html("HINOTORI OFF");
      hinoBtn.style("background:#222;color:#fff;");
    }
  }
}

function showUI(){
  uiRoot.show();
  uiVisible = true;

  if (uiHideTimer) clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    uiRoot.hide();
    uiVisible = false;
  }, 5000);
}

function toggleUI(){
  if (uiVisible) {
    uiRoot.hide();
    uiVisible = false;
    if (uiHideTimer) clearTimeout(uiHideTimer);
  } else {
    showUI();
  }
}

function sliderWidth() {
  const SIDE_PAD = 24;
  return max(120, windowWidth - LABEL_W - VALUE_W - GAP_W - SIDE_PAD);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);

  initBuffers();
  lastMangaCycle = -1;

  const w = sliderWidth();
  if (bgSlider)   bgSlider.style(`width:${w}px;`);
  if (bpmSlider)  bpmSlider.style(`width:${w}px;`);
  if (beatSlider) beatSlider.style(`width:${w}px;`);

  syncUI_All();
}
