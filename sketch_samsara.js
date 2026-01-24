// sketch.js (FULL) 2025-12-27 (renderer-safe)
// - bgMode=9 : manga shader -> pgManga -> hinotori.frag の bgManga として合成
// - manga は BEAT同期（uTime = beatLocal）
// - useProgram対策：copyToContextを使わず、各pgのrenderer上で createShader(vertSrc, fragSrc) を生成
// - 断ちきり：dir += 4 を “forced bleed” として shader 側で解釈（重なり回避のため「属性化」）

let hinotori, inkelly;

// loaded (main renderer) shaders
let shDisplayLoaded;   // hinotori.vert + hinotori.frag
let shStateLoaded;     // hinotori.vert + bg_inkelly.frag
// Shader source strings (loaded as text for cross-context use)
let vertSrcArr, fragDisplaySrcArr, fragStateSrcArr, fragMangaSrcArr;

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

// ---------------------------
// bgMode=10 : photo background (random from a selected folder, NO manifest)
// ---------------------------
let photoImgs = [];
let photoImgIndex = 0;
let photoBgCycleBeats = 8.0;
let lastPhotoBeatStep  = -1;
let lastPhotoDroneStep = -1;
 // 何拍ごとに切り替えるか
let lastPhotoBgStep = -1;

let bgPhotoTex = null; // p5.Image or p5.Graphics (texture)

// photo compositing buffer (2D)
let pgPhoto;

// photo layers / camera
let photoLayers = 1;
let photoLayerAlpha = 1.0; // 2枚目以降の不透明度（通常合成）
let photoLayerIdx = [];     // indices into photoImgs
let photoCam = { panX: 0, panY: 0, zoom: 1.0 }; // 統一ズーム（全bgMode共通）
let manualZoomOffset = 1.0; // 手動ズームオフセット（累積）
let manualPanX = 0.0;       // 手動パン（累積）
let manualPanY = 0.0;
let panMoveAngle = 0.0;     // 移動方向（キーを押した瞬間に決定）
let panMoveSpeed = 0.0;     // 移動速度
let photoSeed = 1.234;

let beatSpawnMin = 1;
let beatSpawnMax = 4;
let beatSpawnJitterPx = 400; // DRAW配置の中心からの散り半径(px). 小さめにすると“中心から離れすぎない”
let beatSpawnSubdiv = 4;     // 1拍を何分割して発火するか（2 or 4 推奨）

// bgMode=10 space placements
let photoPlacements = [];
let photoPlacementsInit = false;
// camera velocity (px/sec)
let photoCamVel = { x: 48.0, y: 24.0 };

// ---------------------------
// bgMode=10 burst (ENTER hold)
// ---------------------------
let burstHeld10 = false;
let burstImg10 = null;
let burstBaseX10 = 0;
let burstBaseY10 = 0;
let burstDirX10 = 1;
let burstDirY10 = 0;
let burstStepPx10 = 300;          // 1ステップ移動距離
let burstSubDiv10 = 16;           // 1拍を何分割で撃つか（4=16分）
let burstShotsPerTick10 = 1;     // 1刻みで何枚バババするか
let burstJitterPx10 = 0;        // ばらけ幅
let burstScale10 = 1.0;          // 基準スケール
let burstScaleMul10 = 1.0;      // 後半ほど小さく
let lastBurstStep10 = -1;
let photoBlank10 = false;        // SPACEで白紙化→次のスポーンまで保持

// params
let BPM = 120;
let BEAT_DIV = 4;

// Motion mode (global for all bgMode)
const MOTION_DRONE = 0;
const MOTION_BEAT  = 1;
let motionMode = MOTION_DRONE; // default: DRONE
let freezeOthers = false; // S: hinotori以外を一時停止（背景・更新を凍結）
let freezeTimeT = 0.0;
let freezeBeatLocal = 0.0;
let freezeBeatUniform = -1.0;
let freezeWasOn = false; // freeze開始時のスナップショット保持
 // 初期：4拍
let bgMode = 0;   // 0..10
let paletteMode = 0;
let invertPalette = 0; // INVERT(mode 5)を独立して管理: 0=OFF, 1=ON
// glitch (global post)
let glitchMode = 0;
let glitchBlockSize = 20.0;   // Glitch2 block size (like Unity _BlockSize)
let glitchAmount    = 0.10;   // Glitch2 amount (like Unity _GlitchAmount)
let glitchFreqBeats = 2.0;    // Glitch2 frequency in beats (like Unity _GlitchFrequency)
let glitchDurBeats  = 0.5;    // Glitch2 duration in beats (like Unity _GlitchDuration)
let glitchAmt  = 0.85;
// 0 normal, 1 r, 2 g, 3 b, 4 k(tone)

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

// ---------------------------
// bgMode=10 : photo background (selected folder, NO manifest)
// - 「LOAD MANGA FOLDER」でフォルダ選択
// - サブフォルダも再帰探索
// - bgMode=10で複数枚を通常合成で重ね、FREE時はパン/ズーム
// ---------------------------
// ※ブラウザはディレクトリ一覧を直接取得できないため、manifest が必要です。

// 手動フォールバック（manifestが無い時）
let mangaFallbackList = [
  // "001.jpg",
  // "002.png",
];
let photoResetProb = 0.16; // 4%/step（BEATなら毎拍、DRONEなら10秒ごと）
let panel10Count = 10;
let photoImgsActive = []; // 毎回使う12枚


// UI
let uiRoot;
let bgSlider, bpmSlider, beatSlider;
let palButtons = {};
let uiVisible = true;
let uiHideTimer = null;
let uiForceHidden = false;

let bgValueSpan, bpmValueSpan, beatValueSpan;
let hinoBtn;
let photoStatusSpan;

// Motion UI (global refs so key shortcuts can update button state)
let motionValueSpan;
let btnDrone;
let btnDraw;
function syncMotionUI(){
  if (!motionValueSpan || !btnDrone || !btnDraw) return;
  const isDrone = (motionMode === MOTION_DRONE);
  motionValueSpan.html(isDrone ? "DRONE" : "BEAT");
  btnDrone.style("opacity", isDrone ? "1.0" : "0.4");
  btnDraw.style("opacity",  isDrone ? "0.4" : "1.0");
}

const LABEL_W = 44;
const VALUE_W = 42;
const GAP_W   = 8;

const BEAT_OPTIONS = [1, 2, 4, 8];

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

  // Load shader sources as text arrays
  vertSrcArr = loadStrings("hinotori.vert");
  fragDisplaySrcArr = loadStrings("hinotori.frag");
  fragStateSrcArr = loadStrings("bg_inkelly.frag");
  fragMangaSrcArr = loadStrings("bg_manga.frag");
}

// ---------------------------
// bgMode=10 helpers
// 画像がキャンバス外にはみ出す時に、反対側へ“つながる”ように二重(四重)描画する
// (x,y) は左上、(w,h) は描画サイズ
function drawImageWrap(pg, img, x, y, w, h){
  if (!pg || !img) return;
  const W = pg.width, H = pg.height;

  // normalize start position so even if x/y are outside, wrapping still works
  x = ((x % W) + W) % W;
  y = ((y % H) + H) % H;

  // まず本体
  pg.image(img, Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));

  // はみ出し判定（少し余裕を持つ）
  const overL = (x < 0);
  const overR = (x + w > W);
  const overT = (y < 0);
  const overB = (y + h > H);

  // 横方向
  if (overL) pg.image(img, Math.floor(x + W), Math.floor(y), Math.floor(w), Math.floor(h));
  if (overR) pg.image(img, Math.floor(x - W), Math.floor(y), Math.floor(w), Math.floor(h));

  // 縦方向
  if (overT) pg.image(img, Math.floor(x), Math.floor(y + H), Math.floor(w), Math.floor(h));
  if (overB) pg.image(img, Math.floor(x), Math.floor(y - H), Math.floor(w), Math.floor(h));

  // 斜め（角）
  if (overL && overT) pg.image(img, Math.floor(x + W), Math.floor(y + H), Math.floor(w), Math.floor(h));
  if (overL && overB) pg.image(img, Math.floor(x + W), Math.floor(y - H), Math.floor(w), Math.floor(h));
  if (overR && overT) pg.image(img, Math.floor(x - W), Math.floor(y + H), Math.floor(w), Math.floor(h));
  if (overR && overB) pg.image(img, Math.floor(x - W), Math.floor(y - H), Math.floor(w), Math.floor(h));
}

function _pickBurstDir8(){
  const dirs = [
    [ 1, 0], [-1, 0], [0, 1], [0,-1],
    [ 1, 1], [ 1,-1], [-1, 1], [-1,-1],
  ];
  const d = dirs[Math.floor(Math.random()*dirs.length)];
  return {x:d[0], y:d[1]};
}

function startBurst10(){
  if (!pgPhoto || !photoImgs || photoImgs.length === 0) return;
  burstHeld10 = true;
  photoBlank10 = false;

  burstImg10 = photoImgs[Math.floor(Math.random()*photoImgs.length)];
  // ランダム開始位置
  burstBaseX10 = Math.random() * pgPhoto.width;
  burstBaseY10 = Math.random() * pgPhoto.height;

  const d = _pickBurstDir8();
  burstDirX10 = d.x;
  burstDirY10 = d.y;

  // 最初は必ずランダム距離（固定でもOK）
  burstStepPx10 = 36 + Math.floor(Math.random()*40);

  lastBurstStep10 = -1;
}

function stopBurst10(){
  burstHeld10 = false;
}

function tickBurst10(beatLocal){
  if (!burstHeld10 || bgMode !== 10) return;
  if (!pgPhoto || !burstImg10) return;

  // BPM同期：1拍を burstSubDiv10 分割
  const step = Math.floor(beatLocal * Math.max(1, burstSubDiv10));
  if (step === lastBurstStep10) return;
  lastBurstStep10 = step;

  // ベース移動（端でループ）
  burstBaseX10 = ((burstBaseX10 + burstDirX10 * burstStepPx10) % pgPhoto.width + pgPhoto.width) % pgPhoto.width;
  burstBaseY10 = ((burstBaseY10 + burstDirY10 * burstStepPx10) % pgPhoto.height + pgPhoto.height) % pgPhoto.height;

  // “バババ”：同じ画像を微妙にズラして重ねる（後半ほど小さく）
  let scale = burstScale10;
  for (let i=0; i<burstShotsPerTick10; i++){
    const ox = (Math.random()*2-1) * burstJitterPx10;
    const oy = (Math.random()*2-1) * burstJitterPx10;

    const w = burstImg10.width * scale;
    const h = burstImg10.height * scale;
    const x = burstBaseX10 + ox - w*0.5;
    const y = burstBaseY10 + oy - h*0.5;

    drawImageWrap(pgPhoto, burstImg10, x, y, w, h);
    scale *= burstScaleMul10;
  }
}

function resetPhotoCanvas10(){
  if (!pgPhoto) return;
  pgPhoto.push();
  pgPhoto.resetMatrix();
  pgPhoto.clear();
  pgPhoto.background(255);
  pgPhoto.pop();
  photoPlacementsInit = false;
  photoBlank10 = true;
  if (typeof _beatShotQueue !== 'undefined') _beatShotQueue = [];
}

// ---------------------------





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
  window.addEventListener('blur', () => stopBurst10());

  // Create shader from loaded source
  if (!vertSrcArr || !fragDisplaySrcArr) {
    console.error("Shader sources not loaded!");
  } else {
    shDisplay = createShader(vertSrcArr.join("\n"), fragDisplaySrcArr.join("\n"));
    console.log("✓ Created shDisplay:", shDisplay ? "SUCCESS" : "FAILED");
  }

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

  bgSlider = createSlider(1, 11, bgMode + 1, 1).parent(bgRow);
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

  beatSlider = createSlider(0, BEAT_OPTIONS.length - 1, 2, 1).parent(beatRow);
  beatSlider.style(`width:${sliderWidth()}px;`);
  beatSlider.input(() => {
    BEAT_DIV = BEAT_OPTIONS[beatSlider.value()];
    syncUI_All();
    showUI();
  });

  // -------------------------------------------------
  // MOTION MODE (DRONE / BEAT)
  // -------------------------------------------------
  const rowMotion = createDiv().parent(uiRoot);
  rowMotion.style("display:flex; align-items:center; gap:8px; margin:4px 0;");

  btnDrone = createButton("DRONE").parent(rowMotion);
  btnDraw  = createButton("BEAT").parent(rowMotion);

  btnDrone.style("flex:1; height:30px; font-size:14px;");
  btnDraw.style("flex:1; height:30px; font-size:14px;");

  btnDrone.mousePressed(() => {
    motionMode = MOTION_DRONE;
    syncMotionUI();
    showUI();
  });

  btnDraw.mousePressed(() => {
    motionMode = MOTION_BEAT;
    reseedPhoto();
    syncMotionUI();
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
    { key: "Y", mode: 3 },
    { key: "K", mode: 4 },
    { key: "I", mode: 5 },
  ];

  pals.forEach(p => {
    const b = createButton(p.key).parent(palWrap);
    b.style(`flex:1; height:32px; font-size:14px; background:#222; color:#fff; border:1px solid #555; border-radius:4px;`);
    b.mousePressed(() => {
      if (p.mode === 0) {
        // Cボタン: 全クリア
        paletteMode = 0;
      } else if (p.mode === 5) {
        // Iボタン: INVERT専用トグル
        invertPalette = invertPalette ? 0 : 1;
      } else {
        // R/G/Y/Kボタン: 排他的選択（従来通り）
        paletteMode = (paletteMode === p.mode) ? 0 : p.mode;
      }
      syncUI_All();
      showUI();
    });
    palButtons[p.mode] = b;
  });

  
  // -------------------------------------------------
  // GLITCH MODE (OFF / CUTUP / MOSAIC / NOISE)  ※paletteModeとは独立
  // -------------------------------------------------
  const rowGlitch = createDiv().parent(uiRoot);
  rowGlitch.style("display:flex; align-items:center; gap:8px; margin:4px 0;");

  const btnG0 = createButton("V").parent(rowGlitch);
  const btnG1 = createButton("X").parent(rowGlitch);
  const btnG2 = createButton("Z").parent(rowGlitch);
  const btnG3 = createButton("W").parent(rowGlitch);
  const btnG4 = createButton("T").parent(rowGlitch);
  const btnG5 = createButton("B").parent(rowGlitch);

  [btnG0, btnG1, btnG2, btnG3, btnG4, btnG5].forEach(b => b.style("flex:1; height:30px; font-size:14px;"));

  function syncGlitchUI(){
    btnG0.style("opacity", glitchMode===0 ? "1.0" : "0.4");
    btnG1.style("opacity", glitchMode===1 ? "1.0" : "0.4");
    btnG2.style("opacity", glitchMode===2 ? "1.0" : "0.4");
    btnG3.style("opacity", glitchMode===3 ? "1.0" : "0.4");
    btnG4.style("opacity", glitchMode===4 ? "1.0" : "0.4");
    btnG5.style("opacity", glitchMode===5 ? "1.0" : "0.4");
  }

  // allow other handlers to refresh button states
  window.__syncGlitchUI = syncGlitchUI;

  btnG0.mousePressed(() => { glitchMode = 0; syncGlitchUI(); syncUI_All(); showUI(); });
  btnG1.mousePressed(() => { 
    glitchMode = (glitchMode === 1) ? 0 : 1;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });
  btnG2.mousePressed(() => { 
    glitchMode = (glitchMode === 2) ? 0 : 2;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });
  btnG3.mousePressed(() => { 
    glitchMode = (glitchMode === 3) ? 0 : 3;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });
  btnG4.mousePressed(() => { 
    glitchMode = (glitchMode === 4) ? 0 : 4;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });
  btnG5.mousePressed(() => { 
    glitchMode = (glitchMode === 5) ? 0 : 5;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });

  syncGlitchUI();
  syncUI_All();
}

function redrawDrone10(){
  if (!pgPhoto) return;

  // キャンバス白紙化
  pgPhoto.push();
  pgPhoto.resetMatrix();
  pgPhoto.clear();
  pgPhoto.background(255);
  pgPhoto.pop();

  // DRONE用の状態をリセット
  photoPlacementsInit = false;
  photoPlacements = [];

  // カメラを初期化（少しランダムにしても気持ちいい）
  photoCam.panX = 0;
  photoCam.panY = 0;
  photoCam.zoom = 1.0; // デフォルトズーム

  // DRONEの再シード
  reseedPhoto();
}


function initBuffers(){
  const scale = 1.0;
  fbW = Math.max(16, Math.floor(windowWidth  * scale));
  fbH = Math.max(16, Math.floor(windowHeight * scale));

  pgA = createGraphics(fbW, fbH, WEBGL);
  pgB = createGraphics(fbW, fbH, WEBGL);
  pgA.noStroke(); pgB.noStroke();
  pgA.pixelDensity(1); pgB.pixelDensity(1);

  shInkellyA = pgA.createShader(vertSrcArr.join("\n"), fragStateSrcArr.join("\n"));
  console.log("✓ Created shInkellyA:", shInkellyA ? "SUCCESS" : "FAILED");
  shInkellyB = pgB.createShader(vertSrcArr.join("\n"), fragStateSrcArr.join("\n"));
  console.log("✓ Created shInkellyB:", shInkellyB ? "SUCCESS" : "FAILED");

  pgA.background(0);
  pgB.background(0);
  ping = 0;

  pgManga = createGraphics(fbW, fbH, WEBGL);
  pgManga.noStroke();
  pgManga.pixelDensity(1);
  pgManga.background(255);

  shManga = pgManga.createShader(vertSrcArr.join("\n"), fragMangaSrcArr.join("\n"));
  console.log("✓ Created shManga:", shManga ? "SUCCESS" : "FAILED");

  // bgMode=10 photo composite buffer (2D)
  // ループ（巻き戻し）はしない前提なので、カメラが大きく動ける“広いキャンバス”を用意
  const PHOTO_SPACE_SCALE = 4.0; // 2x -> 6x（必要ならここだけ上げる）
  pgPhoto = createGraphics(Math.floor(windowWidth*PHOTO_SPACE_SCALE), Math.floor(windowHeight*PHOTO_SPACE_SCALE));
  pgPhoto.pixelDensity(1);
  pgPhoto.background(255);

}

function computeBeatLocal(tSec){
  if (BEAT_DIV === 0) return tSec * 0.66;
  return tSec * (BPM / 60.0) * (BEAT_DIV / 4.0);
}

function draw() {
  const tNow = millis() * 0.001;

  // freeze中は「その瞬間の時刻/ビート」を固定して、全bgModeのアニメを止める
  let t = tNow;
  let beatLocal = computeBeatLocal(tNow);
  let beatUniform = (motionMode === MOTION_DRONE) ? -1.0 : beatLocal;

  if (freezeOthers){
    if (!freezeWasOn){
      freezeWasOn = true;
      freezeTimeT = tNow;
      freezeBeatLocal = beatLocal;
      freezeBeatUniform = beatUniform;
    }
    t = freezeTimeT;
    beatLocal = freezeBeatLocal;
    beatUniform = freezeBeatUniform;
  } else {
    freezeWasOn = false;
  }


  // beat
  if (freezeOthers) {
    // freeze中は入力取りこぼし対策でburstも停止
    if (burstHeld10) { stopBurst10(); burstHeld10 = false; }
  }

  // ---------------------------
  // bgMode=10 burst (ENTER hold)
  // - burst中は他の動きを止める（updateAndRenderPhotoBG側が早期return）
  // ---------------------------
  if (!freezeOthers && bgMode === 10 && burstHeld10){
    if (!burstImg10) startBurst10();
    tickBurst10(beatLocal);

    // 保険：keyReleased が取りこぼした時でも止める
    if (!(keyIsDown(ENTER) || keyIsDown(RETURN))) {
      stopBurst10();
    }
  }

  // ---------------------------
  // bgMode=7 : 自動ズーム＋パンはfreeZoom()で処理されるため削除
  // ---------------------------

  // ---------------------------
  // bgMode=10 : photo background update + composite into pgPhoto
  // ---------------------------
  if (!freezeOthers && bgMode === 10){
    updateAndRenderPhotoBG(t, beatLocal, beatUniform);
  }

// A) ping-pong update (inkelly state)
  if (!freezeOthers) {
  {
    const src = ping ? pgA : pgB;
    const dst = ping ? pgB : pgA;
    const shU = ping ? shInkellyB : shInkellyA;

    dst.shader(shU);

    shU.setUniform("uPrev", src);
    shU.setUniform("uResolution", [fbW, fbH]);
    shU.setUniform("uTime", t);
    shU.setUniform("uBeat", beatUniform);
    shU.setUniform("uDT", (deltaTime || 16.666) * 0.001);

    shU.setUniform("uBPM", BPM);
    shU.setUniform("uBeatsPerStep", beatsPerStep);
    shU.setUniform("uCurlAmt", curlAmt);
    shU.setUniform("uSpawnStrength", spawnStrength);
    shU.setUniform("uDecay", decay);

    dst.rect(-fbW/2, -fbH/2, fbW, fbH);
    ping ^= 1;
  }
  }
  const stateTex = (ping === 0) ? pgA : pgB;

  // B) bgMode=9 manga render -> pgManga
  if (!freezeOthers) {
  {
    const cyc = Math.max(0.001, mangaCycleBeats);
    const cycIndex = Math.floor(beatLocal / cyc);
    if (cycIndex !== lastMangaCycle){
      lastMangaCycle = cycIndex;
      rebuildMangaLayout(beatLocal);
    }
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

  shDisplay.setUniform("tex0", hinotori);
  shDisplay.setUniform("tex1", inkelly);
  shDisplay.setUniform("overlayOn", showHinotori ? 1 : 0);

  shDisplay.setUniform("bgExtra", stateTex);
  shDisplay.setUniform("bgManga", pgManga);

  shDisplay.setUniform("bgPhoto", pgPhoto);
  shDisplay.setUniform("bgPhotoSize", [pgPhoto.width, pgPhoto.height]);
  
  // パン：←→キーを押している間、加速しながら移動（MAX 9999 px/s）
  const dt = deltaTime * 0.001; // 秒単位
  const acceleration = 3000;     // 加速度 (px/s²)
  const maxSpeed = 9999;         // 最大速度 (px/s)
  
  if (keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW)) {
    // キーを押している間、加速
    panMoveSpeed += acceleration * dt;
    panMoveSpeed = Math.min(panMoveSpeed, maxSpeed); // 上限
    
    // 設定された方向・速度で移動
    manualPanX += Math.cos(panMoveAngle) * panMoveSpeed * dt;
    manualPanY += Math.sin(panMoveAngle) * panMoveSpeed * dt;
  } else {
    // キーを離したら速度リセット（次に押したときは初速から）
    panMoveSpeed = 0.0;
  }
  
  shDisplay.setUniform("bgCamPx", [photoCam.panX + manualPanX, photoCam.panY + manualPanY]);
  shDisplay.setUniform("bgZoom", photoCam.zoom);
  
  // 手動ズームオフセット: ↑↓キー押しっぱなしで毎フレーム累積
  const zoomSpeed = 0.02; // 1フレームあたりの変化量
  if (keyIsDown(UP_ARROW)) {
    manualZoomOffset += zoomSpeed; // ズームイン
  } else if (keyIsDown(DOWN_ARROW)) {
    manualZoomOffset -= zoomSpeed; // ズームアウト
  }
  manualZoomOffset = constrain(manualZoomOffset, 0.5, 4.0);
  shDisplay.setUniform("manualZoomOffset", manualZoomOffset);
  
  shDisplay.setUniform("resolution", [width, height]);
  shDisplay.setUniform("texSize", [hinotori.width, hinotori.height]);
  shDisplay.setUniform("time", t);
  shDisplay.setUniform("bpm", BPM);
  shDisplay.setUniform("beat", beatUniform);

  shDisplay.setUniform("bgMode", bgMode);
  shDisplay.setUniform("paletteMode", paletteMode);
  shDisplay.setUniform("invertPalette", invertPalette);

  // glitch (whole output)
  shDisplay.setUniform("glitchMode", glitchMode);
  shDisplay.setUniform("glitchBlockSize", glitchBlockSize);
  shDisplay.setUniform("glitchAmount", glitchAmount);
  shDisplay.setUniform("glitchFreqBeats", glitchFreqBeats);
  shDisplay.setUniform("glitchDurBeats", glitchDurBeats);
  shDisplay.setUniform("glitchAmt", glitchAmt);
  shDisplay.setUniform("glitchBeat", beatLocal);

  shDisplay.setUniform("centerN", [center.x, center.y]);

  shDisplay.setUniform("ringDensity", ringDensity);
  shDisplay.setUniform("lineW", lineW);

  shDisplay.setUniform("arcWidth", arcWidth);
  shDisplay.setUniform("sweepDir", 1.0);
  shDisplay.setUniform("appearRate", appearRate);
  shDisplay.setUniform("jitter", jitter);

  shDisplay.setUniform("baseInkGain", baseInkGain);
  shDisplay.setUniform("baseInkGamma", baseInkGamma);
  shDisplay.setUniform("baseInkColor", [g, g, g]);
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
  // Beat division cycle with <> keys: 1→2→4→8→1...
  if (key === ',' || key === '<') {
    const currentIndex = BEAT_OPTIONS.indexOf(BEAT_DIV);
    const nextIndex = (currentIndex - 1 + BEAT_OPTIONS.length) % BEAT_OPTIONS.length;
    BEAT_DIV = BEAT_OPTIONS[nextIndex];
    syncUI_All();
    showUI();
    return;
  }
  if (key === '.' || key === '>') {
    const currentIndex = BEAT_OPTIONS.indexOf(BEAT_DIV);
    const nextIndex = (currentIndex + 1) % BEAT_OPTIONS.length;
    BEAT_DIV = BEAT_OPTIONS[nextIndex];
    syncUI_All();
    showUI();
    return;
  }

  // BG shortcut keys
  if (key >= '1' && key <= '9') {
    const v = parseInt(key, 10);
    bgMode = v - 1;
  }
  if (key === '0') {
    bgMode = 9;
  }
  if (key === '-' || key === '_') {
    bgMode = 10;
  }

  // arrows: ←→でランダム方向を設定（速度は0から加速開始）
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    // ランダムな角度（速度は0から加速）
    panMoveAngle = Math.random() * Math.PI * 2;
    panMoveSpeed = 0.0; // 初速0
    
    console.log(`Pan direction set: ${(panMoveAngle * 180 / Math.PI).toFixed(0)}° (accelerating...)`);
    if (typeof showUI === "function") showUI();
  }

  // palette shortcuts (with toggle)
  if (key === 'c' || key === 'C') { paletteMode = 0; invertPalette = 0; syncUI_All(); } // Cは全クリア
  if (key === 'r' || key === 'R') { paletteMode = (paletteMode === 1) ? 0 : 1; syncUI_All(); }
  if (key === 'g' || key === 'G') { paletteMode = (paletteMode === 2) ? 0 : 2; syncUI_All(); }
  if (key === 'y' || key === 'Y') { paletteMode = (paletteMode === 3) ? 0 : 3; syncUI_All(); }
  if (key === 'k' || key === 'K') { paletteMode = (paletteMode === 4) ? 0 : 4; syncUI_All(); }
  if (key === 'i' || key === 'I') { invertPalette = invertPalette ? 0 : 1; syncUI_All(); } // INVERTトグル

  // glitch shortcuts (with toggle)
  if (key === 'v' || key === 'V') { glitchMode = 0; window.__syncGlitchUI(); }
  if (key === 'x' || key === 'X') { glitchMode = (glitchMode === 1) ? 0 : 1; window.__syncGlitchUI(); }
  if (key === 'z' || key === 'Z') { glitchMode = (glitchMode === 2) ? 0 : 2; window.__syncGlitchUI(); }
  if (key === 'w' || key === 'W') { glitchMode = (glitchMode === 3) ? 0 : 3; window.__syncGlitchUI(); }
  
  // O: ズームリセット
  if (key === 'o' || key === 'O') {
    manualZoomOffset = 1.0;
    console.log("Zoom offset reset to 1.0");
    if (typeof showUI === "function") showUI();
  }
  if (key === 't' || key === 'T') { glitchMode = (glitchMode === 4) ? 0 : 4; window.__syncGlitchUI(); }
  if (key === 'b' || key === 'B') { glitchMode = (glitchMode === 5) ? 0 : 5; window.__syncGlitchUI(); }
  
  if (key === 'n' || key === 'N') { invertPalette = invertPalette ? 0 : 1; syncUI_All(); } // NもINVERT

  // O: ズームオフセットとパンをリセット
  if (key === 'o' || key === 'O') {
    manualZoomOffset = 1.0;
    manualPanX = 0.0;
    manualPanY = 0.0;
    panMoveAngle = 0.0;
    panMoveSpeed = 0.0;
    console.log("Zoom and pan reset");
    if (typeof showUI === "function") showUI();
  }

  if (key === 'h' || key === 'H') showHinotori = !showHinotori;

  if (key === 'd' || key === 'D') {
    motionMode =
      (motionMode === MOTION_DRONE)
        ? MOTION_BEAT
        : MOTION_DRONE;

    // UIがある場合は同期
    if (typeof syncMotionUI === "function") {
      syncMotionUI();
    }

    // UIが自動表示される設計なら一応呼ぶ（強制非表示中は無視される）
    if (typeof showUI === "function") {
      showUI();
    }
  }

  // S: freeze all except hinotori
  if (key === 's' || key === 'S') {
    freezeOthers = !freezeOthers;

    if (freezeOthers) {
      // freeze開始：この瞬間の時刻/ビートをスナップショット
      const tSnap = millis() * 0.001;
      freezeWasOn = true;
      freezeTimeT = tSnap;
      freezeBeatLocal = computeBeatLocal(tSnap);
      freezeBeatUniform = (motionMode === MOTION_DRONE) ? -1.0 : freezeBeatLocal;

      // freeze中はburst等も止める
      if (typeof stopBurst10 === 'function') stopBurst10();
      burstHeld10 = false;
    } else {
      freezeWasOn = false;
    }

    if (typeof showUI === "function") showUI();
  }


  if (key === 'm' || key === 'M') {
    uiForceHidden = !uiForceHidden;

    if (uiForceHidden) {
      uiRoot.hide();
      uiVisible = false;
      if (uiHideTimer) clearTimeout(uiHideTimer);
    } else {
      showUI(); // 復帰時は一度だけ表示
    }
  }

  if (keyCode === ENTER || keyCode === RETURN){
    startBurst10();
    return;
  }

  if (key === ' '){
    if (motionMode === MOTION_DRONE && bgMode === 10){
      redrawDrone10();
    }
    return;
  }

  // ------------------------------------
  // L : load manga / panel folder
  // ------------------------------------
  if (key === 'l' || key === 'L') {
    if (typeof pickPhotoFolderAndLoad === "function") {
      pickPhotoFolderAndLoad();
      showUI?.();
    } else {
      console.warn("pickPhotoFolderAndLoad is not defined");
    }
  }

  if (key === '1'){
    showHinotori = true;
    BPM = 131.0;
    bpmSlider.value(BPM);
    BEAT_DIV = 4;
    beatSlider.value(BEAT_DIV);
    bgMode = 3;
    paletteMode = 0;
    glitchMode = 1;
    motionMode = MOTION_BEAT;

  }

  if (key === '2'){
    showHinotori = false;
    BPM = 131.0;
    bpmSlider.value(BPM);
    BEAT_DIV = 4;
    beatSlider.value(BEAT_DIV);
    bgMode = 0;
    paletteMode = 1;
    glitchMode = 2;
    motionMode = MOTION_BEAT;
  }

  if (key === '3'){
    showHinotori = false;
    BPM = 131.0;
    bpmSlider.value(BPM);
    BEAT_DIV = 2;
    beatSlider.value(BEAT_DIV);
    bgMode = 7;
    paletteMode = 0;
    glitchMode = 4;
    motionMode = MOTION_DRONE;
  }

  if (key === '4'){
    showHinotori = false;
    BPM = 120.0;
    bpmSlider.value(BPM);
    BEAT_DIV = 2;
    beatSlider.value(BEAT_DIV);
    bgMode = 10;
    paletteMode = 1;
    glitchMode = 0;
    motionMode = MOTION_DRONE;
  }

  if (key === '5'){
    showHinotori = false;
    BPM = 120.0;
    bpmSlider.value(BPM);
    BEAT_DIV = 4;
    beatSlider.value(BEAT_DIV);
    bgMode = 10;
    paletteMode = 5;
    glitchMode = 0;
    motionMode = MOTION_BEAT;
  }

  if (typeof syncMotionUI === "function") {
    syncMotionUI();
  }
    syncUI_All();


  // UIが自動表示される設計なら一応呼ぶ（強制非表示中は無視される）
  if (typeof showUI === "function") {
    showUI();
  }
}

function keyReleased() {
  // ENTER/RETURN を離したら burst 停止
  if (keyCode === ENTER || keyCode === RETURN) {
    stopBurst10();
    burstHeld10 = false;
    return;
  }
}

// UI sync
function syncUI_All(){
  if(bgValueSpan) bgValueSpan.html(String(bgMode + 1));
  if(bgSlider) bgSlider.value(bgMode + 1);

  if(bpmValueSpan) bpmValueSpan.html(String(BPM));
  if(bpmSlider) bpmSlider.value(BPM);

  if(beatValueSpan){
    beatValueSpan.html(String(BEAT_DIV));
  }
  if(beatSlider){
    const idx = BEAT_OPTIONS.indexOf(BEAT_DIV);
    if(idx >= 0) beatSlider.value(idx);
  }

  Object.keys(palButtons).forEach(k => {
    const b = palButtons[k];
    const mode = Number(k);
    if (mode === 0) {
      // Cボタン: 全OFF時のみハイライト
      if (paletteMode === 0 && invertPalette === 0) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else if (mode === 5) {
      // Iボタン: invertPaletteで判定
      if (invertPalette) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else {
      // R/G/Y/Kボタン: paletteModeで判定
      if (paletteMode === mode) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    }
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

  if (window.__syncGlitchUI) window.__syncGlitchUI();
}

function showUI(){
  if (uiForceHidden) return; // ← 追加

  uiRoot.show();
  uiVisible = true;

  if (uiHideTimer) clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    uiRoot.hide();
    uiVisible = false;
  }, 5000);
}

function toggleUI(){
  if (uiForceHidden) return; // ← 追加

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


// =====================================================
// bgMode=10 : load images from a folder (NO manifest)
// =====================================================

// =====================================================
// bgMode=10 : photo background (folder-selected, no manifest)
// =====================================================

function reseedPhoto(){
  // re-randomize placements (use whole pool each time; no fixed 12-set)
  photoPlacementsInit = false;
  renderPhotoComposite();
}



function choosePhotoLayers(){
  // legacy: keep API; now we render all images once into the 2x space
}


function updatePhotoCamera(tSec, beatLocal, beatUniform){
  if (!pgPhoto) return;

  const isDrone = (motionMode === MOTION_DRONE);

  // base zoom (default 3x)
  let z = 2.0;

  // “広いキャンバス”上をカメラ中心が動く想定
  // pan は「pgPhoto の中心」からのオフセット(px)
  let px = photoCam.panX;
  let py = photoCam.panY;

  if (isDrone){
    // DRONE：もっとダイナミックに漂う（複数周波数の合成）
    const ax = pgPhoto.width  * 0.28;
    const ay = pgPhoto.height * 0.28;

    px = ax * Math.sin(tSec * 0.17) + ax * 0.55 * Math.sin(tSec * 0.41 + 1.7);
    py = ay * Math.cos(tSec * 0.13) + ay * 0.65 * Math.sin(tSec * 0.29 + 2.4);

    z = 2.2 + 1.2 * Math.sin(tSec * 0.23) + 0.35 * Math.sin(tSec * 0.71 + 0.8);
    z = constrain(z, 1.4, 4.6);
  } else {
    // BEAT：移動もズームも無し（中央固定）
    px = 0.0;
    py = 0.0;
    z = 2.0;
  }

  // clamp so we don't show outside area (no wrap)
  const halfViewW = (width  * 0.5) / z;
  const halfViewH = (height * 0.5) / z;

  const maxPanX = Math.max(0.0, (pgPhoto.width  * 0.5) - halfViewW);
  const maxPanY = Math.max(0.0, (pgPhoto.height * 0.5) - halfViewH);

  photoCam.panX = constrain(px, -maxPanX, maxPanX);
  photoCam.panY = constrain(py, -maxPanY, maxPanY);
  photoCam.zoom = z;
}


function pickActivePhotos(){ /* deprecated: no fixed 12-set */ }


function renderPhotoComposite(){
  if (!pgPhoto) return;

  pgPhoto.push();
  pgPhoto.resetMatrix();
  pgPhoto.clear();
  pgPhoto.background(255);
  pgPhoto.blendMode(pgPhoto.BLEND);

  if (!photoImgs || photoImgs.length <= 0){
    pgPhoto.pop();
    return;
  }

  const count = Math.max(1, Math.min(panel10Count|0, 240));

  for (let i = 0; i < count; i++){
    let p = photoPlacements[i];
    if (!p) p = (photoPlacements[i] = {x:0,y:0,s:1,idx:0});

    if (!photoPlacementsInit){
      // choose from the whole pool (not a fixed 12-set)
      p.idx = Math.floor(Math.random() * photoImgs.length);

      // random scale: later layers (drawn later) are smaller
      const t = (count <= 1) ? 0.0 : (i / (count - 1));
      const base = lerp(1.15, 0.35, t);           // back -> big, front -> small
      const jitter = 0.70 + Math.random() * 0.60; // random
      p.s = constrain(base * jitter, 0.18, 1.40);

      const img0 = photoImgs[p.idx];
      const w = img0 ? (img0.width  * p.s) : 256;
      const h = img0 ? (img0.height * p.s) : 256;

      p.x = Math.random() * Math.max(1, (pgPhoto.width  - w));
      p.y = Math.random() * Math.max(1, (pgPhoto.height - h));
    }

    const img = photoImgs[p.idx];
    if (!img) continue;

    const dw = img.width  * p.s;
    const dh = img.height * p.s;

    drawImageWrap(pgPhoto, img, p.x, p.y, dw, dh);
  }

  photoPlacementsInit = true;
  pgPhoto.pop();
}



function updateAndRenderPhotoBG(tSec, beatLocal, beatUniform){
  if (burstHeld10){
    // burst自体の描画（キュー処理など）は別で行う
    return;
  }

  if (photoImgs.length <= 0){
    if (photoStatusSpan) photoStatusSpan.html("(0) NO IMAGES");
    return;
  }

  if (motionMode === MOTION_BEAT){
    const step = Math.floor(beatLocal * Math.max(1, beatSpawnSubdiv|0));
    if (step !== lastPhotoBeatStep){
      lastPhotoBeatStep = step;

      if (Math.random() < photoResetProb){
        pgPhoto.clear();
        pgPhoto.background(255);
        photoPlacementsInit = false;
      }

      spawnPanelsOnBeat();
    }
  }

  if (motionMode === MOTION_DRONE){
    const step = Math.floor(tSec); // 1s tick
    if (step !== lastPhotoDroneStep){
      lastPhotoDroneStep = step;

      if (Math.random() < photoResetProb){
        pgPhoto.clear();
        pgPhoto.background(255);
        photoPlacementsInit = false;
        renderPhotoComposite(); // redraw static layout (no burst)
      }
    }
  }

  updatePhotoCamera(tSec, beatLocal, beatUniform);

  if (photoStatusSpan){
    photoStatusSpan.html(`(${photoImgs.length}) LOADED`);
  }
}


function spawnPanelsOnBeat(){
  photoBlank10 = false;
  if (!pgPhoto || !photoImgs || photoImgs.length === 0) return;

  // 1回の呼び出しで何枚貼るか（beatSpawnMin/Max）
  const n = Math.floor(beatSpawnMin + Math.random() * (Math.max(beatSpawnMin, beatSpawnMax) - beatSpawnMin + 1));

  // 中心付近（散りすぎないようにガウス＋半径クランプ）
  const cx = pgPhoto.width  * 0.5;
  const cy = pgPhoto.height * 0.5;
  const rMax = Math.max(8, beatSpawnJitterPx);

  // “マシンガン感”：n枚を同フレームで短いストロークとして散布
  // （より“時間差”が欲しい場合は、ここをキュー化して数フレームに分散すると良い）
  let sc = 1.0;

  for (let i = 0; i < n; i++){
    const img = photoImgs[Math.floor(Math.random() * photoImgs.length)];
    if (!img) continue;

    // 位置：中心近傍（ガウス分布）
    const ox = constrain(randomGaussian(0, rMax * 0.28), -rMax, rMax);
    const oy = constrain(randomGaussian(0, rMax * 0.28), -rMax, rMax);

    // スケール：ばらつき + 後ろほど小さく
    const base = 0.35 + Math.random() * 0.95; // 0.35..1.30
    const scale = base * sc;

    const w = img.width  * scale;
    const h = img.height * scale;

    // 少し中心からズラす（完全中央固定になりすぎない）
    const x = (cx + ox) - w * 0.5;
    const y = (cy + oy) - h * 0.5;

    drawImageWrap(pgPhoto, img, x, y, w, h);

    // 後から貼るほど小さく
    sc *= 0.90;
  }
}




async function pickPhotoFolderAndLoad(){
  photoImgs = [];
  bgPhotoTex = null;
  lastPhotoBgStep = -1;

  const setStat = (msg) => {
    if (photoStatusSpan) photoStatusSpan.html(msg);
  };

  // 再帰でディレクトリを走査（サブフォルダも拾う）
  async function collectImageUrlsFromHandle(dirHandle, maxDepth = 6){
    const out = [];
    async function walk(handle, depth){
      if (!handle || depth > maxDepth) return;

      // entries() が最も互換が良い
      for await (const [name, entry] of handle.entries()){
        if (!entry) continue;
        if (entry.kind === "file"){
          const n = (entry.name || name || "").toLowerCase();
          if (!(n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp"))) continue;
          try{
            const file = await entry.getFile();
            out.push(URL.createObjectURL(file));
          }catch(e){
            console.warn("getFile failed:", e);
          }
        } else if (entry.kind === "directory"){
          await walk(entry, depth + 1);
        }
      }
    }
    await walk(dirHandle, 0);
    return out;
  }

  setStat("…");

  // 1) File System Access API（Chrome/Edge系）
  if (window.showDirectoryPicker) {
    try{
      const handle = await window.showDirectoryPicker();
      const urls = await collectImageUrlsFromHandle(handle);

      await loadPhotoFromUrls(urls);

      if (photoImgs.length === 0){
        setStat("(0) NO IMAGES");
        console.warn("No images found. Put images directly in the folder (or subfolders) and try again.");
      } else {
        setStat(`(${photoImgs.length}) LOADED`);
      }
      return;
    }catch(e){
      console.warn("Folder pick canceled / failed:", e);
      setStat("(0)");
      return;
    }
  }

  // 2) フォールバック：webkitdirectory（Chrome系）
  const inp = document.createElement("input");
  inp.type = "file";
  inp.multiple = true;
  inp.webkitdirectory = true;
  inp.accept = "image/*";
  inp.style.display = "none";
  document.body.appendChild(inp);

  inp.addEventListener("change", async () => {
    const files = Array.from(inp.files || []);
    const urls = files
      .filter(f => (f.type || "").startsWith("image/"))
      .map(f => URL.createObjectURL(f));

    await loadPhotoFromUrls(urls);

    if (photoImgs.length === 0){
      setStat("(0) NO IMAGES");
    } else {
      setStat(`(${photoImgs.length}) LOADED`);
    }

    document.body.removeChild(inp);
  });

  inp.click();
}

async function loadPhotoFromUrls(urls){
  urls = (urls || []).filter(Boolean);

  // shuffle
  for (let i = urls.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [urls[i], urls[j]] = [urls[j], urls[i]];
  }

  if (urls.length === 0){
    console.warn("No images found in selected folder.");
    return;
  }

  // p5 loadImage -> Promise
  const loadOne = (u) => new Promise((resolve) => {
    loadImage(u,
      (img) => resolve(img),
      () => resolve(null)
    );
  });

  const imgs = [];
  for (const u of urls){
    const img = await loadOne(u);
    if (img) imgs.push(img);
  }

  photoImgs = imgs;
  photoImgIndex = 0;
  bgPhotoTex = photoImgs[0] || null;

  choosePhotoLayers();
  reseedPhoto();
  updatePhotoCamera(millis()*0.001, 0.0, -1.0);
console.log("Loaded bg photos:", photoImgs.length);
}