// sketch.js (FULL) 2025-12-26 (renderer-safe)
// - bgMode=9 : manga shader -> pgManga -> hinotori.frag の bgManga として合成
// - manga は BEAT同期（uTime = beatLocal）
// - useProgram対策：copyToContextを使わず、各pgのrenderer上で createShader(vertSrc, fragSrc) を生成
// -------------------------------------------------

let hinotori, inkelly;

// loaded (main renderer) shaders
let shDisplayLoaded;   // hinotori.vert + hinotori.frag
let shStateLoaded;     // hinotori.vert + bg_inkelly_state.frag（inkelly state）
let shMangaLoaded;     // bg_manga.vert + bg_manga.frag（bgMode=9用）

// runtime shaders (per-renderer)
let shDisplay;     // for main canvas
let shInkellyA;    // for pgA
let shInkellyB;    // for pgB
let shManga;    // for pgManga

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

// visual
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

// bgMode=9 manga params
const PANELS_MAX = 12;
let manga = [];
let lastMangaCycle = -1;
let mangaCycleBeats = 4.0;

let mangaBleedChance = 0.2;
let mangaFramePx = 1.0;
let mangaGutterXPx = 4.0;
let mangaGutterYPx = 12.0;
let mangaInnerPx = 4.0;
let mangaInnerInsetPx = 72.0;
let mangaToneAmt = 1.0;
let mangaInnerFramePx = 1.0;
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

// ---------------------------
// manga layout (0..1 coords)
// ---------------------------
function randWeights(n, lo, hi){
  const a = [];
  for (let i = 0; i < n; i++){
    a.push(lo + Math.random() * (hi - lo));
  }
  const s = a.reduce((p,c)=>p+c, 0);
  return a.map(v => v / s);
}

function pickSpan(maxSpan, biasSmall){
  if (maxSpan <= 1) return 1;
  const r = Math.random();
  if (r < biasSmall) return 1;
  if (maxSpan >= 3 && r < biasSmall + 0.30) return 2;
  return Math.min(maxSpan, 3 + Math.floor(Math.random() * Math.min(2, maxSpan - 2)));
}

function canPlace(occ, r, c, sr, sc){
  const rows = occ.length;
  const cols = occ[0].length;
  if (r + sr > rows || c + sc > cols) return false;
  for (let y = r; y < r + sr; y++){
    for (let x = c; x < c + sc; x++){
      if (occ[y][x] !== -1) return false;
    }
  }
  return true;
}

function mark(occ, r, c, sr, sc, id){
  for (let y = r; y < r + sr; y++){
    for (let x = c; x < c + sc; x++){
      occ[y][x] = id;
    }
  }
}

function buildMangaPage(globalTBeats, pageX0, pageY0, pageX1, pageY1, pageInsetXPx, pageInsetYPx, allowTall=true){
  const out = [];

  // ページサイズ(px)
  const pageWpx = fbW * (pageX1 - pageX0);
  const pageHpx = fbH * (pageY1 - pageY0);

  // ページ余白を「そのページ内の0..1」に換算
  const insetX = Math.min(0.45, Math.max(0.0, pageInsetXPx / Math.max(1, pageWpx)));
  const insetY = Math.min(0.45, Math.max(0.0, pageInsetYPx / Math.max(1, pageHpx)));

  // usable area（ページ余白の内側）
  const ux0 = insetX, uy0 = insetY;
  const ux1 = 1.0 - insetX, uy1 = 1.0 - insetY;

  // 1) 行数（上→下）: 2..5
  const rows = 2 + Math.floor(Math.random() * 4);

  const rowH = randWeights(rows, 0.45, 2.30);

  const y0s = [];
  let accY = 0;
  for(let r=0;r<rows;r++){ y0s[r]=accY; accY+=rowH[r]; }
  for(let r=0;r<rows;r++){ y0s[r]/=accY; rowH[r]/=accY; }

  // 2) 縦長主役コマ（右端、2段貫き）をときどき
  const wantTall = allowTall && (rows >= 3) && (Math.random() < 0.30);
  let tall = null;
  if (wantTall){
    const startR = (Math.random() < 0.65) ? 0 : Math.floor(Math.random() * (rows - 1));
    const spanR  = Math.min(2, rows - startR);
    const w      = 0.28 + Math.random() * 0.18;
    tall = { startR, spanR, w };
  }

  // 3) 行内：右→左に充填
  for(let r=0;r<rows;r++){
    const yy0 = y0s[r];
    const yy1 = yy0 + rowH[r];

    // tall が食う幅（ページ内0..1）
    let rightReserved = 0;
    if(tall && r >= tall.startR && r < tall.startR + tall.spanR){
      rightReserved = tall.w;
    }

    const cols = 1 + Math.floor(Math.random() * 4);
    const usableW = Math.max(0.08, 1.0 - rightReserved);
    const colWraw = randWeights(cols, 0.35, 2.40).map(v => v * usableW);

    let xRight = usableW;
    for(let c=0;c<cols;c++){
      const w = Math.max(0.12, colWraw[c]);
      const x1 = xRight;
      const x0 = xRight - w;
      xRight = x0;

      const isLast = (c === cols - 1);
      const lx0 = isLast ? 0.0 : Math.max(0.0, x0);
      const lx1 = isLast ? x1 : Math.min(usableW, x1);

      // ページ余白の内側(ux0..ux1, uy0..uy1)へマップ
      let x0n = ux0 + (ux1 - ux0) * lx0;
      let x1n = ux0 + (ux1 - ux0) * lx1;
      let y0n = uy0 + (uy1 - uy0) * yy0;
      let y1n = uy0 + (uy1 - uy0) * yy1;

      // fx/dir/timing
      const pick = Math.random();
      const fxForShader = (pick < 0.40) ? 2.0 : (pick < 0.70 ? 1.0 : 0.0);
      const dir = Math.floor(Math.random() * 4);
      const t0  = globalTBeats + (Math.random() * 0.20);
      const dur = 1.60 + Math.random() * 0.50;

      // ページ座標(0..1) → 全体uvへ
      const gx0 = pageX0 + (pageX1 - pageX0) * x0n;
      const gx1 = pageX0 + (pageX1 - pageX0) * x1n;
      const gy0 = pageY0 + (pageY1 - pageY0) * y0n;
      const gy1 = pageY0 + (pageY1 - pageY0) * y1n;

      out.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1, t0, dur, fx: fxForShader, dir });
      if(out.length >= PANELS_MAX) break;
    }
    if(out.length >= PANELS_MAX) break;
  }

  // 4) tall を追加（右端）
  if(tall && out.length < PANELS_MAX){
    const r0 = tall.startR;
    const r1 = tall.startR + tall.spanR - 1;

    const yy0 = y0s[r0];
    const yy1 = y0s[r1] + rowH[r1];

    // ページ内 0..1
    let lx0 = 1.0 - tall.w;
    let lx1 = 1.0;

    // ページ余白の内側へ
    let x0n = ux0 + (ux1 - ux0) * lx0;
    let x1n = ux0 + (ux1 - ux0) * lx1;
    let y0n = uy0 + (uy1 - uy0) * yy0;
    let y1n = uy0 + (uy1 - uy0) * yy1;

    const pick = Math.random();
    const fxForShader = (pick < 0.40) ? 2.0 : (pick < 0.70 ? 1.0 : 0.0);
    const dir = Math.floor(Math.random() * 4);
    const t0  = globalTBeats + (Math.random() * 0.20);
    const dur = 1.60 + Math.random() * 0.50;

    const gx0 = pageX0 + (pageX1 - pageX0) * x0n;
    const gx1 = pageX0 + (pageX1 - pageX0) * x1n;
    const gy0 = pageY0 + (pageY1 - pageY0) * y0n;
    const gy1 = pageY0 + (pageY1 - pageY0) * y1n;

    out.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1, t0: t0 + 0.10, dur, fx: fxForShader, dir });
  }

  return out;
}


// globalTBeats: beatLocal（拍）
function rebuildMangaLayout(globalTBeats){
  manga = [];

  const isSpread = (fbW > fbH * 1.05); // 横長なら見開き

  if(!isSpread){
    // 1ページ
    const page = buildMangaPage(
      globalTBeats,
      0.0, 0.0, 1.0, 1.0,
      mangaPageInsetXPx, mangaPageInsetYPx,
      true
    );
    manga = page.slice(0, PANELS_MAX);
  }else{
    // 見開き：左右2ページ + ノド
    const spineUv = mangaSpinePx / Math.max(1, fbW);
    const pageWuv = (1.0 - spineUv) * 0.5;

    const L0 = 0.0;
    const L1 = pageWuv;

    const R0 = 1.0 - pageWuv;
    const R1 = 1.0;

    const left = buildMangaPage(
      globalTBeats,
      L0, 0.0, L1, 1.0,
      mangaPageInsetXPx, mangaPageInsetYPx,
      true
    );

    const right = buildMangaPage(
      globalTBeats,
      R0, 0.0, R1, 1.0,
      mangaPageInsetXPx, mangaPageInsetYPx,
      true
    );

    // 合成（右ページ→左ページの順にすると「右→左」の読み味が出やすい）
    manga = right.concat(left).slice(0, PANELS_MAX);
  }

  // 断ち切り（四隅中心に確率で）：ページ余白を無視してページ端へ寄せる
  // 見開き時は左右それぞれのページ端を優先
  const cornerBoost = 0.55;

  for(const p of manga){
    // どのページに属するか（見開き時のみ判定）
    const isSpread2 = (fbW > fbH * 1.05);
    let pageX0 = 0.0, pageX1 = 1.0;
    if(isSpread2){
      const spineUv = mangaSpinePx / Math.max(1, fbW);
      const pageWuv = (1.0 - spineUv) * 0.5;
      const L1 = pageWuv;
      const R0 = 1.0 - pageWuv;
      if(p.x1 <= L1 + 1e-5){ pageX0 = 0.0; pageX1 = L1; }
      else { pageX0 = R0; pageX1 = 1.0; }
    }

    const touchesL = (p.x0 <= pageX0 + 0.02*(pageX1-pageX0));
    const touchesR = (p.x1 >= pageX1 - 0.02*(pageX1-pageX0));
    const touchesT = (p.y0 < 0.02);
    const touchesB = (p.y1 > 0.98);

    const isCorner =
      (touchesL && touchesT) || (touchesR && touchesT) ||
      (touchesL && touchesB) || (touchesR && touchesB);

    if(isCorner && Math.random() < cornerBoost){
      if(touchesL) p.x0 = pageX0;
      if(touchesR) p.x1 = pageX1;
      if(touchesT) p.y0 = 0.0;
      if(touchesB) p.y1 = 1.0;
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

  // main canvas: createShader
  if (!pgOrMainRenderer) {
    return createShader(vert, frag);
  }
  // graphics: pg.createShader
  return pgOrMainRenderer.createShader(vert, frag);
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  pixelDensity(1);

  cnv.elt.tabIndex = 1;
  cnv.elt.focus();

  // main shader (main renderer上で再生成)
  shDisplay = makeShaderOn(null, shDisplayLoaded);

  initBuffers();

  // 初回レイアウト
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

  // ---- BG row ----
  const bgRow = createDiv().parent(uiRoot);
  bgRow.style(`display:flex; align-items:center; gap:6px;`);

  createSpan("BG").parent(bgRow).style(`
    width:${LABEL_W}px; color:#fff; font-size:12px;
  `);

  bgValueSpan = createSpan(String(bgMode + 1)).parent(bgRow);
  bgValueSpan.style(`
    width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;
  `);

  // 1..10（bgMode 0..9）
  bgSlider = createSlider(1, 10, bgMode + 1, 1).parent(bgRow);
  bgSlider.style(`width:${sliderWidth()}px;`);
  bgSlider.input(() => {
    bgMode = bgSlider.value() - 1;
    syncUI_All();
    showUI();
  });

  // ---- BPM row ----
  const bpmRow = createDiv().parent(uiRoot);
  bpmRow.style(`display:flex; align-items:center; gap:6px; margin-top:6px;`);

  createSpan("BPM").parent(bpmRow).style(`
    width:${LABEL_W}px; color:#fff; font-size:12px;
  `);

  bpmValueSpan = createSpan(String(BPM)).parent(bpmRow);
  bpmValueSpan.style(`
    width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;
  `);

  bpmSlider = createSlider(60, 200, BPM, 1).parent(bpmRow);
  bpmSlider.style(`width:${sliderWidth()}px;`);
  bpmSlider.input(() => {
    BPM = bpmSlider.value();
    syncUI_All();
    showUI();
  });

  // ---- BEAT row ----
  const beatRow = createDiv().parent(uiRoot);
  beatRow.style(`display:flex; align-items:center; gap:6px; margin-top:6px;`);

  createSpan("BEAT").parent(beatRow).style(`
    width:${LABEL_W}px; color:#fff; font-size:12px;
  `);

  beatValueSpan = createSpan(String(BEAT_DIV)).parent(beatRow);
  beatValueSpan.style(`
    width:${VALUE_W}px; text-align:right; color:#fff; font-size:12px; opacity:0.9;
  `);

  beatSlider = createSlider(0, BEAT_OPTIONS.length - 1, 3, 1).parent(beatRow);
  beatSlider.style(`width:${sliderWidth()}px;`);
  beatSlider.input(() => {
    BEAT_DIV = BEAT_OPTIONS[beatSlider.value()];
    syncUI_All();
    showUI();
  });

  // ---- Hinotori toggle ----
  const hinoRow = createDiv().parent(uiRoot);
  hinoRow.style(`margin-top:6px; display:flex;`);

  hinoBtn = createButton("").parent(hinoRow);
  hinoBtn.style(`
    flex:1; height:32px; font-size:14px;
    border:1px solid #555; border-radius:4px;
  `);
  hinoBtn.mousePressed(() => {
    showHinotori = !showHinotori;
    syncUI_All();
    showUI();
  });

  // ---- palette buttons ----
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
    b.style(`
      flex:1; height:32px; font-size:14px;
      background:#222; color:#fff;
      border:1px solid #555; border-radius:4px;
    `);
    b.mousePressed(() => {
      paletteMode = p.mode;
      syncUI_All();
      showUI();
    });
    palButtons[p.mode] = b;
  });

  // canvas tapでUI切替
  const c = document.querySelector("canvas");
  c.addEventListener("pointerdown", () => toggleUI());

  syncUI_All();
}

function initBuffers(){
  const scale = 1.0;
  fbW = Math.max(16, Math.floor(windowWidth  * scale));
  fbH = Math.max(16, Math.floor(windowHeight * scale));

  // pingpong
  pgA = createGraphics(fbW, fbH, WEBGL);
  pgB = createGraphics(fbW, fbH, WEBGL);
  pgA.noStroke(); pgB.noStroke();
  pgA.pixelDensity(1); pgB.pixelDensity(1);

  // ★各pg上で shader 再生成（renderer事故を根絶）
  shInkellyA = makeShaderOn(pgA, shStateLoaded);
  shInkellyB = makeShaderOn(pgB, shStateLoaded);

  pgA.clear(); pgB.clear();
  pgA.background(0);
  pgB.background(0);
  ping = 0;

  // manga
  pgManga = createGraphics(fbW, fbH, WEBGL);
  pgManga.noStroke();
  pgManga.pixelDensity(1);
  pgManga.clear();
  pgManga.background(255);

  // ★ ここを追加
  shManga = makeShaderOn(pgManga, shMangaLoaded);

  // デバッグ（必要なら）
  // console.log("shInkellyA", shInkellyA);
  // console.log("shInkellyB", shInkellyB);
  // console.log("shMangaCtx", shMangaCtx);
}

function computeBeatLocal(tSec){
  if (BEAT_DIV === 0) {
    // FREE
    return tSec * 0.66;
  } else {
    // 4拍基準
    return tSec * (BPM / 60.0) * (BEAT_DIV / 4.0);
  }
}

function draw() {
  const t = millis() * 0.001;
  const beatLocal = computeBeatLocal(t);

  // ---------------------------
  // A) ping-pong update (inkelly state)
  // ---------------------------
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

  // ---------------------------
  // B) bgMode=9 manga render -> pgManga
  // ---------------------------
  // ---------------------------
  // B) bgMode=9 manga render -> pgManga
  // ---------------------------
  {
    const cyc = Math.max(0.001, mangaCycleBeats);
    const cycIndex = Math.floor(beatLocal / cyc);
    if (cycIndex !== lastMangaCycle){
      lastMangaCycle = cycIndex;
      rebuildMangaLayout(beatLocal);
    }

    // ★ pgManga 上で shader を生成しておく（initBuffersで）
    // shManga = makeShaderOn(pgManga, shMangaLoaded);

    pgManga.shader(shManga);

    const n = Math.min(manga.length, PANELS_MAX);

    // float[48] を作る（shader側が float配列なので）
    const uM = new Array(48).fill(0);
    const uA = new Array(48).fill(0);

    for(let i=0;i<n;i++){
      const p = manga[i];
      uM[i*4+0] = p.x0;
      uM[i*4+1] = p.y0;
      uM[i*4+2] = p.x1;
      uM[i*4+3] = p.y1;

      uA[i*4+0] = p.t0;
      uA[i*4+1] = p.dur;
      uA[i*4+2] = p.fx;
      uA[i*4+3] = p.dir;
    }

    shManga.setUniform("uResolution", [fbW, fbH]);
    shManga.setUniform("uTime", beatLocal);
    shManga.setUniform("uCount", n);

    shManga.setUniform("uManga", uM);
    shManga.setUniform("uAnim",  uA);

    // ★縦横別ガター + 内枠
    shManga.setUniform("uBleedChance", mangaBleedChance);
    shManga.setUniform("uFramePx", mangaFramePx);
    shManga.setUniform("uInnerFramePx", mangaInnerFramePx);
    shManga.setUniform("uGutterXPx", mangaGutterXPx);
    shManga.setUniform("uGutterYPx", mangaGutterYPx);
    shManga.setUniform("uToneAmt", mangaToneAmt);


    pgManga.rect(-fbW/2, -fbH/2, fbW, fbH);
  }


  // ---------------------------
  // C) main render (display)
  // ---------------------------
  shader(shDisplay);

  // ink gray triangle wave
  const phase = (beatLocal / inkCycleBeats) % 1.0;
  let tri = 1.0 - Math.abs(2.0 * phase - 1.0);
  tri = Math.pow(tri, grayCurvePow);
  const g = lerp(grayMin, grayMax, tri);

  // hueBase bpm synced fade
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
  // 1..9 => 0..8
  if (key >= '1' && key <= '9') {
    const v = parseInt(key, 10);
    bgMode = v - 1;
    syncUI_All();
    showUI();
  }
  // 0 => 9
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

// ---------------------------
// UI sync
// ---------------------------
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
  return max(
    120,
    windowWidth - LABEL_W - VALUE_W - GAP_W - SIDE_PAD
  );
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);

  // ★FBO再作成（renderer違い事故を避ける）
  initBuffers();
  lastMangaCycle = -1;

  const w = sliderWidth();
  if (bgSlider)   bgSlider.style(`width:${w}px;`);
  if (bpmSlider)  bpmSlider.style(`width:${w}px;`);
  if (beatSlider) beatSlider.style(`width:${w}px;`);

  syncUI_All();
}
