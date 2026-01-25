// sketch.js (FULL) 2025-12-27 (renderer-safe)
// - manga は BEAT同期（uTime = beatLocal）
// - useProgram対策：copyToContextを使わず、各pgのrenderer上で createShader(vertSrc, fragSrc) を生成
// - 断ちきり：dir += 4 を “forced bleed” として shader 側で解釈（重なり回避のため「属性化」）
// ★showRings: リングの表示制御（[]キーで自動設定）
// ★showVisual: キービジュアルの表示制御（H key）
// ★キービジュアル総称をhinotoriからkeyVisualに変更
// ★SWITCHモード追加（Q key）：paletteModeの2色を入れ替え
// ★[]キーでhinotori.pngとga-oh.pngを切り替え（showRingsも自動設定）

let keyVisual, inkelly;
let hinotoriImg, gaohImg; // 2つの画像を両方ロード
let currentVisualIndex = 1; // 0: hinotori, 1: ga-oh

// loaded (main renderer) shaders
let shDisplayLoaded;   // visual.vert + visual.frag
let shStateLoaded;     // visual.vert + bg_inkelly.frag
// Shader source strings (loaded as text for cross-context use)
let vertSrcArr, fragDisplaySrcArr, fragStateSrcArr;

// runtime shaders (per-renderer)
let shDisplay;     // for main canvas
let shInkellyA;    // for pgA
let shInkellyB;    // for pgB

// ping-pong (inkelly state)
let pgA, pgB;
let ping = 0;
let fbW = 0, fbH = 0;

// ---------------------------
// bgMode=9 : photo background (random from a selected folder, NO manifest)
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
let lastArrowKeyReleaseTime = 0;   // 最後にカーソルキーが離された時刻（連続判定用）
let lastArrowKeyPressTime = 0;     // 最後にカーソルキーが押された時刻（連続判定用）
let photoSeed = 1.234;

let beatSpawnMin = 1;
let beatSpawnMax = 4;
let beatSpawnJitterPx = 400; // DRAW配置の中心からの散り半径(px). 小さめにすると“中心から離れすぎない”
let beatSpawnSubdiv = 4;     // 1拍を何分割して発火するか（2 or 4 推奨）

// bgMode=9 space placements
let photoPlacements = [];
let photoPlacementsInit = false;
// camera velocity (px/sec)
let photoCamVel = { x: 48.0, y: 24.0 };

// ---------------------------
// bgMode=9 burst (ENTER hold)
// ---------------------------
let burstHeld9 = false;
let burstImg9 = null;
let burstBaseX9 = 0;
let burstBaseY9 = 0;
let burstDirX9 = 1;
let burstDirY9 = 0;
let burstStepPx9 = 300;          // 1ステップ移動距離
let burstSubDiv9 = 16;           // 1拍を何分割で撃つか（4=16分）
let burstShotsPerTick9 = 1;     // 1刻みで何枚バババするか
let burstJitterPx9 = 0;        // ばらけ幅
let burstScale9 = 1.0;          // 基準スケール
let burstScaleMul9 = 1.0;      // 後半ほど小さく
let lastBurstStep9 = -1;
let photoBlank9 = false;        // SPACEで白紙化→次のスポーンまで保持

// params
let BPM = 120;
let BEAT_DIV = 4;

// Motion mode (global for all bgMode)
const MOTION_DRONE = 0;
const MOTION_BEAT  = 1;
let motionMode = MOTION_DRONE; // default: DRONE
let freezeOthers = false; // S: キービジュアル以外を一時停止（背景・更新を凍結）
let freezeTimeT = 0.0;
let freezeBeatLocal = 0.0;
let freezeBeatUniform = -1.0;
let freezeWasOn = false; // freeze開始時のスナップショット保持
 // 初期：4拍
let bgMode = 0;   // 0..10
let paletteMode = 0;
let invertPalette = 0; // INVERT(mode 5)を独立して管理: 0=OFF, 1=ON
let switchPalette = 0; // SWITCH: paletteModeの2色を入れ替え: 0=OFF, 1=ON
// glitch (global post)
let glitchMode = 0;
let glitchBlockSize = 20.0;   // Glitch2 block size (like Unity _BlockSize)
let glitchAmount    = 0.10;   // Glitch2 amount (like Unity _GlitchAmount)
let glitchFreqBeats = 2.0;    // Glitch2 frequency in beats (like Unity _GlitchFrequency)
let glitchDurBeats  = 0.5;    // Glitch2 duration in beats (like Unity _GlitchDuration)
let glitchAmt  = 0.85;
// 0 normal, 1 r, 2 g, 3 b, 4 k(tone)

let center = { x: 0.5, y: 0.5 };
let showRings = true;  // 回転する輪の表示制御（hinotoriのマスクで使用）
let showVisual = true; // キービジュアル（手前の画像）の表示制御

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
// bgMode=9 : photo background (selected folder, NO manifest)
// - 「LOAD MANGA FOLDER」でフォルダ選択
// - サブフォルダも再帰探索
// - bgMode=9で複数枚を通常合成で重ね、FREE時はパン/ズーム
// ---------------------------
// ※ブラウザはディレクトリ一覧を直接取得できないため、manifest が必要です。

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
// preload
function preload(){
  // キービジュアル画像の読み込み
  // ★両方の画像を読み込んで、[]キーで切り替え
  hinotoriImg = loadImage("hinotori.png", 
    () => {
      console.log("✓ Loaded: hinotori.png");
    },
    () => {
      console.warn("✗ Failed to load hinotori.png");
    }
  );
  
  gaohImg = loadImage("ga-oh.png", 
    () => {
      console.log("✓ Loaded: ga-oh.png");
    },
    () => {
      console.warn("✗ Failed to load ga-oh.png");
    }
  );
  
  // 初期表示はga-oh（currentVisualIndex = 1）
  keyVisual = gaohImg;
  showRings = false;  // 初期状態：リングは非表示
  showVisual = true;  // 初期状態：キービジュアルは表示
  
  inkelly = loadImage("inkelly.png");

  // Load shader sources as text arrays
  vertSrcArr = loadStrings("visual.vert");
  fragDisplaySrcArr = loadStrings("visual.frag");
  fragStateSrcArr = loadStrings("bg_inkelly.frag");
}

// ---------------------------
// bgMode=9 helpers
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

function startBurst9(){
  if (!pgPhoto || !photoImgs || photoImgs.length === 0) return;
  burstHeld9 = true;
  photoBlank9 = false;

  burstImg9 = photoImgs[Math.floor(Math.random()*photoImgs.length)];
  // ランダム開始位置
  burstBaseX9 = Math.random() * pgPhoto.width;
  burstBaseY9 = Math.random() * pgPhoto.height;

  const d = _pickBurstDir8();
  burstDirX9 = d.x;
  burstDirY9 = d.y;

  // 最初は必ずランダム距離（固定でもOK）
  burstStepPx9 = 36 + Math.floor(Math.random()*40);

  lastBurstStep9 = -1;
}

function stopBurst9(){
  burstHeld9 = false;
}

function tickBurst9(beatLocal){
  if (!burstHeld9 || bgMode !== 9) return;
  if (!pgPhoto || !burstImg9) return;

  // BPM同期：1拍を burstSubDiv9 分割
  const step = Math.floor(beatLocal * Math.max(1, burstSubDiv9));
  if (step === lastBurstStep9) return;
  lastBurstStep9 = step;

  // ベース移動（端でループ）
  burstBaseX9 = ((burstBaseX9 + burstDirX9 * burstStepPx9) % pgPhoto.width + pgPhoto.width) % pgPhoto.width;
  burstBaseY9 = ((burstBaseY9 + burstDirY9 * burstStepPx9) % pgPhoto.height + pgPhoto.height) % pgPhoto.height;

  // “バババ”：同じ画像を微妙にズラして重ねる（後半ほど小さく）
  let scale = burstScale9;
  for (let i=0; i<burstShotsPerTick9; i++){
    const ox = (Math.random()*2-1) * burstJitterPx9;
    const oy = (Math.random()*2-1) * burstJitterPx9;

    const w = burstImg9.width * scale;
    const h = burstImg9.height * scale;
    const x = burstBaseX9 + ox - w*0.5;
    const y = burstBaseY9 + oy - h*0.5;

    drawImageWrap(pgPhoto, burstImg9, x, y, w, h);
    scale *= burstScaleMul9;
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
  photoBlank9 = true;
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
  window.addEventListener('blur', () => stopBurst9());

  // Create shader from loaded source
  if (!vertSrcArr || !fragDisplaySrcArr) {
    console.error("Shader sources not loaded!");
  } else {
    shDisplay = createShader(vertSrcArr.join("\n"), fragDisplaySrcArr.join("\n"));
    console.log("✓ Created shDisplay:", shDisplay ? "SUCCESS" : "FAILED");
  }

  initBuffers();



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
  hinoRow.style(`margin-top:6px; display:flex; gap:6px;`);

  // VISUAL ボタン (H key)
  hinoBtn = createButton("").parent(hinoRow);
  hinoBtn.style(`flex:1; height:32px; font-size:14px; border:1px solid #555; border-radius:4px;`);
  hinoBtn.mousePressed(() => {
    showVisual = !showVisual;
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
    { key: "Q", mode: 6 },  // SWITCH用
  ];

  pals.forEach(p => {
    const b = createButton(p.key).parent(palWrap);
    b.style(`flex:1; height:32px; font-size:14px; background:#222; color:#fff; border:1px solid #555; border-radius:4px;`);
    b.mousePressed(() => {
      if (p.mode === 0) {
        // Cボタン: 全クリア（Glitch / Palette / Invert / Switch）
        glitchMode = 0;
        paletteMode = 0;
        invertPalette = 0;
        switchPalette = 0;
        if (window.__syncGlitchUI) window.__syncGlitchUI();
      } else if (p.mode === 5) {
        // Iボタン: INVERT専用トグル
        invertPalette = invertPalette ? 0 : 1;
      } else if (p.mode === 6) {
        // Qボタン: SWITCH専用トグル
        switchPalette = switchPalette ? 0 : 1;
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

  const btnG0 = createButton("C").parent(rowGlitch);  // V → C (Clear)
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

  // C: Clear (Glitch / Palette / Invert / Switch すべてリセット)
  btnG0.mousePressed(() => { 
    glitchMode = 0;
    paletteMode = 0;
    invertPalette = 0;
    switchPalette = 0;
    syncGlitchUI(); 
    syncUI_All(); 
    showUI(); 
  });
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


  // bgMode=9 photo composite buffer (2D)
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
    if (burstHeld9) { stopBurst9(); burstHeld9 = false; }
  }

  // ---------------------------
  // bgMode=9 burst (ENTER hold)
  // - burst中は他の動きを止める（updateAndRenderPhotoBG側が早期return）
  // ---------------------------
  if (!freezeOthers && bgMode === 9 && burstHeld9){
    if (!burstImg9) startBurst9();
    tickBurst9(beatLocal);

    // 保険：keyReleased が取りこぼした時でも止める
    if (!(keyIsDown(ENTER) || keyIsDown(RETURN))) {
      stopBurst9();
    }
  }

  // ---------------------------
  // bgMode=7 : 自動ズーム＋パンはfreeZoom()で処理されるため削除
  // ---------------------------

  // ---------------------------
  // bgMode=9 : photo background update + composite into pgPhoto
  // ---------------------------
  if (!freezeOthers && bgMode === 9){
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

  shDisplay.setUniform("tex0", keyVisual);
  shDisplay.setUniform("tex1", inkelly);
  shDisplay.setUniform("overlayOn", showRings ? 1 : 0);
  shDisplay.setUniform("showVisual", showVisual ? 1 : 0);

  shDisplay.setUniform("bgExtra", stateTex);

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
    // キーを離しても0.5秒間は速度維持（連続入力のため）
    const currentTime = millis();
    const timeSinceLastRelease = (currentTime - lastArrowKeyReleaseTime) / 1000.0;
    const timeSinceLastPress = (currentTime - lastArrowKeyPressTime) / 1000.0;
    const timeSinceLastArrow = Math.min(timeSinceLastRelease, timeSinceLastPress);
    
    if (timeSinceLastArrow > 0.5) {
      // 0.5秒以上経過したら速度リセット
      panMoveSpeed = 0.0;
    }
    // 0.5秒以内なら速度維持（何もしない）
  }
  
  shDisplay.setUniform("bgCamPx", [photoCam.panX + manualPanX, photoCam.panY + manualPanY]);
  
  // bgZoom の統一計算：
  // - BEAT時：photoCam.zoom（通常1.0）× 手動オフセット
  // - DRONE時：FREEズーム（シェーダー内のfreeZoom相当を計算）× 手動オフセット
  let finalBgZoom = 1.0;
  
  if (motionMode === MOTION_DRONE) {
    // FREEズーム計算（シェーダーのfreeZoom関数と同等）
    // vnoise1(bt * FREE_ZOOM_RATE, salt) の簡易近似
    const FREE_ZOOM_RATE = 0.10;
    const FREE_ZOOM_AMP = 0.50;
    const salt = 900.1;
    
    // 簡易的なノイズ（sin波で近似）
    const t = beatLocal * FREE_ZOOM_RATE;
    const z = 0.5 + 0.5 * Math.sin(t * 2.0 + salt); // 0..1
    const zNorm = (z - 0.5) * 2.0; // -1..1
    const freeZ = 1.0 + zNorm * FREE_ZOOM_AMP;
    
    finalBgZoom = freeZ * manualZoomOffset;
  } else {
    // BEAT時
    finalBgZoom = photoCam.zoom * manualZoomOffset;
  }
  
  shDisplay.setUniform("bgZoom", finalBgZoom);
  
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
  shDisplay.setUniform("texSize", [keyVisual.width, keyVisual.height]);
  shDisplay.setUniform("time", t);
  shDisplay.setUniform("bpm", BPM);
  shDisplay.setUniform("beat", beatUniform);

  shDisplay.setUniform("bgMode", bgMode);
  shDisplay.setUniform("paletteMode", paletteMode);
  shDisplay.setUniform("invertPalette", invertPalette);
  shDisplay.setUniform("switchPalette", switchPalette);

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

  // BG shortcut keys (1-9, 0, -)
  if (key >= '1' && key <= '9') {
    const v = parseInt(key, 10);
    bgMode = v - 1;
    console.log(`bgMode = ${bgMode}`);
    syncUI_All();
    showUI();
  }
  if (key === '0') {
    bgMode = 9;
    console.log(`bgMode = ${bgMode}`);
    syncUI_All();
    showUI();
  }

  // arrows: ←で左半円、→で右半円のランダム方向を設定
  // ・キーを押しっぱなし（離さずに連打）の場合：強制的に速度維持で方向転換
  // ・キーをRelease後0.5秒以内なら速度維持、それ以外は新しい方向で0から加速開始
  if (keyCode === LEFT_ARROW) {
    const currentTime = millis();
    const isHoldingKey = keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW); // 離さずに連打の判定
    const timeSinceLastRelease = (currentTime - lastArrowKeyReleaseTime) / 1000.0;
    const timeSinceLastPress = (currentTime - lastArrowKeyPressTime) / 1000.0;
    const timeSinceLastArrow = Math.min(timeSinceLastRelease, timeSinceLastPress);
    
    // 離さずに連打 OR 0.5秒以内の連打 → 速度維持
    const isContinuous = isHoldingKey || timeSinceLastArrow < 0.5;
    
    // 左方向（90度〜270度）のランダムな角度（常に新しい方向を設定）
    panMoveAngle = Math.PI * 0.5 + Math.random() * Math.PI;
    
    if (!isContinuous) {
      // 連続でない場合：速度を0から開始
      panMoveSpeed = 0.0;
      console.log(`Pan direction set: ${(panMoveAngle * 180 / Math.PI).toFixed(0)}° LEFT (accelerating...)`);
    } else {
      // 連続の場合：速度を維持（方向は変わる）
      console.log(`Pan direction changed: ${(panMoveAngle * 180 / Math.PI).toFixed(0)}° LEFT (speed maintained: ${panMoveSpeed.toFixed(2)})`);
    }
    
    lastArrowKeyPressTime = currentTime; // Press時刻を記録
    if (typeof showUI === "function") showUI();
  }
  
  if (keyCode === RIGHT_ARROW) {
    const currentTime = millis();
    const isHoldingKey = keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW); // 離さずに連打の判定
    const timeSinceLastRelease = (currentTime - lastArrowKeyReleaseTime) / 1000.0;
    const timeSinceLastPress = (currentTime - lastArrowKeyPressTime) / 1000.0;
    const timeSinceLastArrow = Math.min(timeSinceLastRelease, timeSinceLastPress);
    
    // 離さずに連打 OR 0.5秒以内の連打 → 速度維持
    const isContinuous = isHoldingKey || timeSinceLastArrow < 0.5;
    
    // 右方向（-90度〜90度）のランダムな角度（常に新しい方向を設定）
    panMoveAngle = -Math.PI * 0.5 + Math.random() * Math.PI;
    
    if (!isContinuous) {
      // 連続でない場合：速度を0から開始
      panMoveSpeed = 0.0;
      console.log(`Pan direction set: ${(panMoveAngle * 180 / Math.PI).toFixed(0)}° RIGHT (accelerating...)`);
    } else {
      // 連続の場合：速度を維持（方向は変わる）
      console.log(`Pan direction changed: ${(panMoveAngle * 180 / Math.PI).toFixed(0)}° RIGHT (speed maintained: ${panMoveSpeed.toFixed(2)})`);
    }
    
    lastArrowKeyPressTime = currentTime; // Press時刻を記録
    if (typeof showUI === "function") showUI();
  }

  // palette shortcuts (with toggle)
  // C: Clear - Glitch / Palette / INVERT / SWITCH をすべてリセット
  if (key === 'c' || key === 'C') {
    glitchMode = 0;
    paletteMode = 0;
    invertPalette = 0;
    switchPalette = 0;
    
    syncUI_All();
    if (window.__syncGlitchUI) window.__syncGlitchUI();
    
    console.log("Clear: Glitch=0, Palette=0, Invert=0, Switch=0");
    if (typeof showUI === "function") showUI();
  }
  
  if (key === 'r' || key === 'R') { paletteMode = (paletteMode === 1) ? 0 : 1; syncUI_All(); }
  if (key === 'g' || key === 'G') { paletteMode = (paletteMode === 2) ? 0 : 2; syncUI_All(); }
  if (key === 'y' || key === 'Y') { paletteMode = (paletteMode === 3) ? 0 : 3; syncUI_All(); }
  if (key === 'k' || key === 'K') { paletteMode = (paletteMode === 4) ? 0 : 4; syncUI_All(); }
  if (key === 'i' || key === 'I') { invertPalette = invertPalette ? 0 : 1; syncUI_All(); } // INVERTトグル
  if (key === 'q' || key === 'Q') { switchPalette = switchPalette ? 0 : 1; syncUI_All(); } // SWITCHトグル

  // glitch shortcuts (with toggle)
  // Vキー削除（機能なし）
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

  if (key === 'v' || key === 'V') showVisual = !showVisual;

  // [ キー: hinotori/ga-ohを切り替え
  if (key === '[') {
    currentVisualIndex = (currentVisualIndex + 1) % 2;
    if (currentVisualIndex === 0) {
      keyVisual = hinotoriImg;
      showRings = true;  // hinotoriの場合はリングを表示
      console.log("→ Switched to: hinotori.png (rings enabled)");
    } else {
      keyVisual = gaohImg;
      showRings = false; // ga-ohの場合はリングを非表示
      console.log("→ Switched to: ga-oh.png (rings disabled)");
    }
  }
  
  // ] キーも同じ動作（どちらでも切り替え）
  if (key === ']') {
    currentVisualIndex = (currentVisualIndex + 1) % 2;
    if (currentVisualIndex === 0) {
      keyVisual = hinotoriImg;
      showRings = true;  // hinotoriの場合はリングを表示
      console.log("→ Switched to: hinotori.png (rings enabled)");
    } else {
      keyVisual = gaohImg;
      showRings = false; // ga-ohの場合はリングを非表示
      console.log("→ Switched to: ga-oh.png (rings disabled)");
    }
  }

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

  // S: freeze all except key visual
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
      if (typeof stopBurst9 === 'function') stopBurst9();
      burstHeld9 = false;
    } else {
      freezeWasOn = false;
    }

    if (typeof showUI === "function") showUI();
  }


  if (key === 'm' || key === 'M') {
    uiForceHidden = !uiForceHidden;

    if (uiForceHidden) {
      uiRoot.style('display', 'none');
      uiVisible = false;
      if (uiHideTimer) clearTimeout(uiHideTimer);
    } else {
      showUI(); // 復帰時は一度だけ表示
    }
  }

  if (keyCode === ENTER || keyCode === RETURN){
    startBurst9();
    return;
  }

  if (key === ' '){
    if (motionMode === MOTION_DRONE && bgMode === 9){
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
  // カーソルキー（←→）が離されたときの時刻を記録
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    lastArrowKeyReleaseTime = millis();
  }
  
  // ENTER/RETURN を離したら burst 停止
  if (keyCode === ENTER || keyCode === RETURN) {
    stopBurst9();
    burstHeld9 = false;
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
      if (paletteMode === 0 && invertPalette === 0 && switchPalette === 0) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else if (mode === 5) {
      // Iボタン: invertPaletteで判定
      if (invertPalette) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else if (mode === 6) {
      // Qボタン: switchPaletteで判定
      if (switchPalette) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else {
      // R/G/Y/Kボタン: paletteModeで判定
      if (paletteMode === mode) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    }
  });

  if(hinoBtn){
    if(showVisual){
      hinoBtn.html("VISUAL ON");
      hinoBtn.style("background:#fff;color:#000;");
    }else{
      hinoBtn.html("VISUAL OFF");
      hinoBtn.style("background:#222;color:#fff;");
    }
  }

  if (window.__syncGlitchUI) window.__syncGlitchUI();
}

function showUI(){
  if (uiForceHidden) return; // ← 追加

  uiRoot.style('display', 'block');
  uiVisible = true;

  if (uiHideTimer) clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    uiRoot.style('display', 'none');
    uiVisible = false;
  }, 5000);
}

function toggleUI(){
  if (uiForceHidden) return; // ← 追加

  if (uiVisible) {
    uiRoot.style('display', 'none');
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
// bgMode=9 : load images from a folder (NO manifest)
// =====================================================

// =====================================================
// bgMode=9 : photo background (folder-selected, no manifest)
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
  if (burstHeld9){
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
  photoBlank9 = false;
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