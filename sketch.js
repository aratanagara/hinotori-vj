// sketch.js (FULL) 2025-12-27 (renderer-safe)
// ★カーソルキー4方向パン（移動開始時±15度のランダムブレ）、<>キーでズームイン/アウト

let keyVisual;
let hinotoriImg, gaohImg;
let currentVisualIndex = 1; // 0: hinotori, 1: ga-oh

let shDisplayLoaded;
let shStateLoaded;
let vertSrcArr, fragDisplaySrcArr, fragStateSrcArr;

let shDisplay;
let shInkellyA;
let shInkellyB;

let pgA, pgB;
let ping = 0;
let fbW = 0, fbH = 0;

let photoImgs = [];
let photoImgIndex = 0;
let photoBgCycleBeats = 8.0;
let lastPhotoBeatStep  = -1;
let lastPhotoDroneStep = -1;
let lastPhotoBgStep = -1;

let bgPhotoTex = null;

let pgPhoto;

let photoLayers = 1;
let photoLayerAlpha = 1.0;
let photoLayerIdx = [];
let photoCam = { panX: 0, panY: 0, zoom: 1.0 };
let manualZoomOffset = 1.0;
let manualPanX = 0.0;
let manualPanY = 0.0;
// 4方向それぞれの移動角度（基準方向±ランダムブレ）
let panAngleLeft  = Math.PI;        // 左：180度方向
let panAngleRight = 0.0;            // 右：0度方向
let panAngleUp    = Math.PI * 0.5;  // 上：Y軸下向き正のため+90度
let panAngleDown  = -Math.PI * 0.5; // 下：Y軸下向き正のため-90度
// 各キーごとに独立した速度（同時押し対応）
let panSpeedLeft  = 0.0;
let panSpeedRight = 0.0;
let panSpeedUp    = 0.0;
let panSpeedDown  = 0.0;
let lastArrowKeyReleaseTime = 0;
let lastArrowKeyPressTime = 0;
let photoSeed = 1.234;

let beatSpawnMin = 1;
let beatSpawnMax = 4;
let beatSpawnJitterPx = 400;
let beatSpawnSubdiv = 4;

let photoPlacements = [];
let photoPlacementsInit = false;
let photoCamVel = { x: 48.0, y: 24.0 };

let burstHeld9 = false;
let burstImg9 = null;
let burstBaseX9 = 0;
let burstBaseY9 = 0;
let burstDirX9 = 1;
let burstDirY9 = 0;
let burstStepPx9 = 300;
let burstSubDiv9 = 16;
let burstShotsPerTick9 = 1;
let burstJitterPx9 = 0;
let burstScale9 = 1.0;
let burstScaleMul9 = 1.0;
let lastBurstStep9 = -1;
let photoBlank9 = false;

let BPM = 120;
let BEAT_DIV = 4;

const MOTION_DRONE = 0;
const MOTION_BEAT  = 1;
let motionMode = MOTION_DRONE;
let freezeOthers = false;
let freezeTimeT = 0.0;
let freezeBeatLocal = 0.0;
let freezeBeatUniform = -1.0;
let freezeWasOn = false;

let bgMode = 0;
let paletteMode = 0;
let invertPalette = 0;
let switchPalette = 0;

let glitchMode = 0;
let glitchBlockSize = 20.0;
let glitchAmount    = 0.10;
let glitchFreqBeats = 2.0;
let glitchDurBeats  = 0.5;
let glitchAmt  = 0.85;

let center = { x: 0.5, y: 0.5 };
let showRings = true;
let showVisual = true;

let ringDensity = 220.0;
let lineW = 0.14;
let arcWidth = 0.12;
let appearRate = 0.60;
let jitter = 0.18;
let hueSpread = 0.06;

let baseInkGain = 1.10;
let baseInkGamma = 1.10;
let inkOpacity = 0.70;

let colorLineOpacity = 4.8;

let flashAmt = 0.45;
let flashPow = 6.0;
let flashInk = 0.20;

let keyRBMin = 0.60;
let keyGMax = 0.35;
let keySoft = 0.10;

let hueCycleBeats = 4;
let hueBaseFrom = 0.0;
let hueBaseTo = 0.35;
let hueStepPrev = -1;

let inkCycleBeats = 8;
let grayMin = 0.10;
let grayMax = 0.90;
let grayCurvePow = 1.4;
let inkTint = 0.18;

let beatsPerStep = 8.0;
let curlAmt = 0.010;
let spawnStrength = 1.0;
let decay = 0.30;

let photoResetProb = 0.16;
let panel10Count = 10;
let photoImgsActive = [];

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
// パン角度の決定：基準方向±max15度のランダムブレを付ける
// baseAngle: ラジアン（0=右, PI=左, -PI/2=上, PI/2=下）
// ---------------------------
function randomizeAngle(baseAngle) {
  const MAX_JITTER_DEG = 15.0;
  const jitterRad = (Math.random() * 2.0 - 1.0) * (MAX_JITTER_DEG * Math.PI / 180.0);
  return baseAngle + jitterRad;
}

// ---------------------------
// preload
function preload(){
  hinotoriImg = loadImage("hinotori.png", 
    () => { console.log("✓ Loaded: hinotori.png"); },
    () => { console.warn("✗ Failed to load hinotori.png"); }
  );
  
  gaohImg = loadImage("ga-oh.png", 
    () => { console.log("✓ Loaded: ga-oh.png"); },
    () => { console.warn("✗ Failed to load ga-oh.png"); }
  );
  
  keyVisual = gaohImg;
  showRings = false;
  showVisual = true;

  vertSrcArr = loadStrings("visual.vert");
  fragDisplaySrcArr = loadStrings("visual.frag");
  fragStateSrcArr = loadStrings("bg_inkelly.frag");
}

// ---------------------------
// bgMode=9 helpers
function drawImageWrap(pg, img, x, y, w, h){
  if (!pg || !img) return;
  const W = pg.width, H = pg.height;

  x = ((x % W) + W) % W;
  y = ((y % H) + H) % H;

  pg.image(img, Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));

  const overL = (x < 0);
  const overR = (x + w > W);
  const overT = (y < 0);
  const overB = (y + h > H);

  if (overL) pg.image(img, Math.floor(x + W), Math.floor(y), Math.floor(w), Math.floor(h));
  if (overR) pg.image(img, Math.floor(x - W), Math.floor(y), Math.floor(w), Math.floor(h));
  if (overT) pg.image(img, Math.floor(x), Math.floor(y + H), Math.floor(w), Math.floor(h));
  if (overB) pg.image(img, Math.floor(x), Math.floor(y - H), Math.floor(w), Math.floor(h));

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
  burstBaseX9 = Math.random() * pgPhoto.width;
  burstBaseY9 = Math.random() * pgPhoto.height;

  const d = _pickBurstDir8();
  burstDirX9 = d.x;
  burstDirY9 = d.y;

  burstStepPx9 = 36 + Math.floor(Math.random()*40);

  lastBurstStep9 = -1;
}

function stopBurst9(){
  burstHeld9 = false;
}

function tickBurst9(beatLocal){
  if (!burstHeld9 || bgMode !== 9) return;
  if (!pgPhoto || !burstImg9) return;

  const step = Math.floor(beatLocal * Math.max(1, burstSubDiv9));
  if (step === lastBurstStep9) return;
  lastBurstStep9 = step;

  burstBaseX9 = ((burstBaseX9 + burstDirX9 * burstStepPx9) % pgPhoto.width + pgPhoto.width) % pgPhoto.width;
  burstBaseY9 = ((burstBaseY9 + burstDirY9 * burstStepPx9) % pgPhoto.height + pgPhoto.height) % pgPhoto.height;

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

function makeShaderOn(pgOrMainRenderer, loadedShader){
  const vert = loadedShader._vertSrc;
  const frag = loadedShader._fragSrc;
  if (!pgOrMainRenderer) return createShader(vert, frag);
  return pgOrMainRenderer.createShader(vert, frag);
}


// --------------------------------------------------
// WebGL texture wrap fix for p5.Graphics (2D canvas) used as sampler2D.
// Prevents REPEAT/wrap sampling that can "erase" panel borders in bgMode==9.
// --------------------------------------------------
function clampWrapForGraphics(gfx){
  try{
    // main canvas is WEBGL renderer
    const r = _renderer;
    if(!r || !r.GL || !r.getTexture) return;
    const gl = r.GL;
    const tex = r.getTexture(gfx);
    if(!tex || !tex.glTex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex.glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // keep linear; nearest can create jaggies on manga edges
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }catch(e){
    // ignore
  }
}
function setup() {
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  pixelDensity(1);

  cnv.elt.tabIndex = 1;
  cnv.elt.focus();
  window.addEventListener('blur', () => stopBurst9());

  if (!vertSrcArr || !fragDisplaySrcArr) {
    console.error("Shader sources not loaded!");
  } else {
    console.log("=== COMPILING SHADER ===");
    console.log("Vertex shader lines:", vertSrcArr.length);
    console.log("Fragment shader lines:", fragDisplaySrcArr.length);
    
    const gl = this._renderer.GL;
    
    const vertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShader, vertSrcArr.join("\n"));
    gl.compileShader(vertShader);
    
    if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
      console.error("=== VERTEX SHADER COMPILE ERROR ===");
      console.error(gl.getShaderInfoLog(vertShader));
    } else {
      console.log("✓ Vertex shader compiled");
    }
    
    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, fragDisplaySrcArr.join("\n"));
    gl.compileShader(fragShader);
    
    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
      const errLog = gl.getShaderInfoLog(fragShader);
      console.error("=== FRAGMENT SHADER COMPILE ERROR ===");
      console.error(errLog);
      // エラー行を特定して前後を表示
      const match = errLog.match(/ERROR:\s*\d+:(\d+)/);
      if (match) {
        const errLine = parseInt(match[1]);
        const lines = fragDisplaySrcArr;
        for (let i = Math.max(0, errLine - 3); i <= Math.min(lines.length - 1, errLine + 1); i++) {
          console.error(`  ${i + 1}${i + 1 === errLine ? " >>>" : "    "} ${lines[i]}`);
        }
      }
      // コンパイル失敗時はシェーダーを作らず終了
      return;
    } else {
      console.log("✓ Fragment shader compiled");
    }
    
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
    { key: "Q", mode: 6 },
  ];

  pals.forEach(p => {
    const b = createButton(p.key).parent(palWrap);
    b.style(`flex:1; height:32px; font-size:14px; background:#222; color:#fff; border:1px solid #555; border-radius:4px;`);
    b.mousePressed(() => {
      if (p.mode === 0) {
        glitchMode = 0;
        paletteMode = 0;
        invertPalette = 0;
        switchPalette = 0;
        if (window.__syncGlitchUI) window.__syncGlitchUI();
      } else if (p.mode === 5) {
        invertPalette = invertPalette ? 0 : 1;
      } else if (p.mode === 6) {
        switchPalette = switchPalette ? 0 : 1;
      } else {
        paletteMode = (paletteMode === p.mode) ? 0 : p.mode;
      }
      syncUI_All();
      showUI();
    });
    palButtons[p.mode] = b;
  });

  const rowGlitch = createDiv().parent(uiRoot);
  rowGlitch.style("display:flex; align-items:center; gap:8px; margin:4px 0;");

  const btnG0 = createButton("C").parent(rowGlitch);
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

  window.__syncGlitchUI = syncGlitchUI;

  btnG0.mousePressed(() => { 
    glitchMode = 0; paletteMode = 0; invertPalette = 0; switchPalette = 0;
    syncGlitchUI(); syncUI_All(); showUI(); 
  });
  btnG1.mousePressed(() => { glitchMode = (glitchMode === 1) ? 0 : 1; syncGlitchUI(); syncUI_All(); showUI(); });
  btnG2.mousePressed(() => { glitchMode = (glitchMode === 2) ? 0 : 2; syncGlitchUI(); syncUI_All(); showUI(); });
  btnG3.mousePressed(() => { glitchMode = (glitchMode === 3) ? 0 : 3; syncGlitchUI(); syncUI_All(); showUI(); });
  btnG4.mousePressed(() => { glitchMode = (glitchMode === 4) ? 0 : 4; syncGlitchUI(); syncUI_All(); showUI(); });
  btnG5.mousePressed(() => { glitchMode = (glitchMode === 5) ? 0 : 5; syncGlitchUI(); syncUI_All(); showUI(); });

  syncGlitchUI();
  syncUI_All();
}

function redrawDrone10(){
  if (!pgPhoto) return;

  pgPhoto.push();
  pgPhoto.resetMatrix();
  pgPhoto.clear();
  pgPhoto.background(255);
  pgPhoto.pop();

  photoPlacementsInit = false;
  photoPlacements = [];

  photoCam.panX = 0;
  photoCam.panY = 0;
  photoCam.zoom = 1.0;

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

  const PHOTO_SPACE_SCALE = 4.0;
  pgPhoto = createGraphics(Math.floor(windowWidth*PHOTO_SPACE_SCALE), Math.floor(windowHeight*PHOTO_SPACE_SCALE));
  pgPhoto.pixelDensity(1);
  pgPhoto.background(255);
  clampWrapForGraphics(pgPhoto);
}

function computeBeatLocal(tSec){
  if (BEAT_DIV === 0) return tSec * 0.66;
  return tSec * (BPM / 60.0) * (BEAT_DIV / 4.0);
}

function draw() {
  if (!shDisplay) {
    console.error("shDisplay is null - shader not loaded properly");
    background(255, 0, 0);
    return;
  }
  
  const tNow = millis() * 0.001;

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

  if (freezeOthers) {
    if (burstHeld9) { stopBurst9(); burstHeld9 = false; }
  }

  if (!freezeOthers && bgMode === 9 && burstHeld9){
    if (!burstImg9) startBurst9();
    tickBurst9(beatLocal);
    if (!(keyIsDown(ENTER) || keyIsDown(RETURN))) {
      stopBurst9();
    }
  }

  if (!freezeOthers && bgMode === 9){
    updateAndRenderPhotoBG(t, beatLocal, beatUniform);
  }

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
  shDisplay.setUniform("tex1", keyVisual);
  shDisplay.setUniform("overlayOn", showRings ? 1 : 0);
  shDisplay.setUniform("showVisual", showVisual ? 1 : 0);
  shDisplay.setUniform("bgExtra", stateTex);
  clampWrapForGraphics(pgPhoto);
  shDisplay.setUniform("bgPhoto", pgPhoto);
  shDisplay.setUniform("bgPhotoSize", [pgPhoto.width, pgPhoto.height]);
  
  // --------------------------------------------------
  // パン：4方向カーソルキー同時押し対応
  // 各キーが独立した速度を持ち、同時押しは合成される
  // --------------------------------------------------
  const dt = deltaTime * 0.001;
  const acceleration = 3000;
  const maxSpeed = 9999;
  const currentTime_pan = millis();
  const timeSinceLast_pan = Math.min(
    (currentTime_pan - lastArrowKeyReleaseTime) / 1000.0,
    (currentTime_pan - lastArrowKeyPressTime)   / 1000.0
  );

  // LEFT
  if (keyIsDown(LEFT_ARROW)) {
    panSpeedLeft = Math.min(panSpeedLeft + acceleration * dt, maxSpeed);
    manualPanX += Math.cos(panAngleLeft) * panSpeedLeft * dt;
    manualPanY += Math.sin(panAngleLeft) * panSpeedLeft * dt;
  } else if (timeSinceLast_pan > 0.5) { panSpeedLeft = 0.0; }

  // RIGHT
  if (keyIsDown(RIGHT_ARROW)) {
    panSpeedRight = Math.min(panSpeedRight + acceleration * dt, maxSpeed);
    manualPanX += Math.cos(panAngleRight) * panSpeedRight * dt;
    manualPanY += Math.sin(panAngleRight) * panSpeedRight * dt;
  } else if (timeSinceLast_pan > 0.5) { panSpeedRight = 0.0; }

  // UP
  if (keyIsDown(UP_ARROW)) {
    panSpeedUp = Math.min(panSpeedUp + acceleration * dt, maxSpeed);
    manualPanX += Math.cos(panAngleUp) * panSpeedUp * dt;
    manualPanY += Math.sin(panAngleUp) * panSpeedUp * dt;
  } else if (timeSinceLast_pan > 0.5) { panSpeedUp = 0.0; }

  // DOWN
  if (keyIsDown(DOWN_ARROW)) {
    panSpeedDown = Math.min(panSpeedDown + acceleration * dt, maxSpeed);
    manualPanX += Math.cos(panAngleDown) * panSpeedDown * dt;
    manualPanY += Math.sin(panAngleDown) * panSpeedDown * dt;
  } else if (timeSinceLast_pan > 0.5) { panSpeedDown = 0.0; }

  shDisplay.setUniform("bgCamPx", [photoCam.panX + manualPanX, photoCam.panY + manualPanY]);

  // --------------------------------------------------
  // <>キー：押している間ズーム変化（連続）
  // --------------------------------------------------
  const zoomSpeed = 1.5; // 倍率/秒
  if (keyIsDown(188) || keyIsDown(44)) { // , / <
    manualZoomOffset = constrain(manualZoomOffset - zoomSpeed * dt, 0.5, 4.0);
  }
  if (keyIsDown(190) || keyIsDown(46)) { // . / >
    manualZoomOffset = constrain(manualZoomOffset + zoomSpeed * dt, 0.5, 4.0);
  }

  // bgZoom 計算（<>キーで manualZoomOffset を変更）
  let finalBgZoom = 1.0;
  
  if (motionMode === MOTION_DRONE) {
    const FREE_ZOOM_RATE = 0.10;
    const FREE_ZOOM_AMP = 0.50;
    const salt = 900.1;
    const tz = beatLocal * FREE_ZOOM_RATE;
    const z = 0.5 + 0.5 * Math.sin(tz * 2.0 + salt);
    const zNorm = (z - 0.5) * 2.0;
    const freeZ = 1.0 + zNorm * FREE_ZOOM_AMP;
    finalBgZoom = freeZ * manualZoomOffset;
  } else {
    finalBgZoom = photoCam.zoom * manualZoomOffset;
  }
  
  shDisplay.setUniform("bgZoom", finalBgZoom);
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

  // BG shortcut keys (1-9, 0)
  if (key >= '1' && key <= '9') {
    bgMode = parseInt(key, 10) - 1;
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

  // --------------------------------------------------
  // カーソルキー：
  //   押した瞬間に各方向の角度をランダムブレで決定（±15度）
  //   実際の移動は draw() の keyIsDown 判定で処理
  // --------------------------------------------------
  if (keyCode === LEFT_ARROW) {
    // 速度維持判定（0.5秒以内の連打なら速度を引き継ぐ）
    const t = millis();
    const timeSinceLast = Math.min(
      (t - lastArrowKeyReleaseTime) / 1000.0,
      (t - lastArrowKeyPressTime)   / 1000.0
    );
    if (timeSinceLast > 0.5) panSpeedLeft = 0.0;

    // 基準180度（左）に±15度のブレを付ける
    panAngleLeft = randomizeAngle(Math.PI);
    lastArrowKeyPressTime = t;
    if (typeof showUI === "function") showUI();
  }

  if (keyCode === RIGHT_ARROW) {
    const t = millis();
    const timeSinceLast = Math.min(
      (t - lastArrowKeyReleaseTime) / 1000.0,
      (t - lastArrowKeyPressTime)   / 1000.0
    );
    if (timeSinceLast > 0.5) panSpeedRight = 0.0;

    // 基準0度（右）に±15度のブレを付ける
    panAngleRight = randomizeAngle(0.0);
    lastArrowKeyPressTime = t;
    if (typeof showUI === "function") showUI();
  }

  if (keyCode === UP_ARROW) {
    const t = millis();
    const timeSinceLast = Math.min(
      (t - lastArrowKeyReleaseTime) / 1000.0,
      (t - lastArrowKeyPressTime)   / 1000.0
    );
    if (timeSinceLast > 0.5) panSpeedUp = 0.0;

    // 基準+90度（上、Y下向き正）に±15度のブレを付ける
    panAngleUp = randomizeAngle(Math.PI * 0.5);
    lastArrowKeyPressTime = t;
    if (typeof showUI === "function") showUI();
  }

  if (keyCode === DOWN_ARROW) {
    const t = millis();
    const timeSinceLast = Math.min(
      (t - lastArrowKeyReleaseTime) / 1000.0,
      (t - lastArrowKeyPressTime)   / 1000.0
    );
    if (timeSinceLast > 0.5) panSpeedDown = 0.0;

    // 基準-90度（下、Y下向き正）に±15度のブレを付ける
    panAngleDown = randomizeAngle(-Math.PI * 0.5);
    lastArrowKeyPressTime = t;
    if (typeof showUI === "function") showUI();
  }

  // palette shortcuts
  if (key === 'c' || key === 'C') {
    glitchMode = 0; paletteMode = 0; invertPalette = 0; switchPalette = 0;
    syncUI_All();
    if (window.__syncGlitchUI) window.__syncGlitchUI();
    console.log("Clear: Glitch=0, Palette=0, Invert=0, Switch=0");
    if (typeof showUI === "function") showUI();
  }
  
  if (key === 'r' || key === 'R') { paletteMode = (paletteMode === 1) ? 0 : 1; syncUI_All(); }
  if (key === 'g' || key === 'G') { paletteMode = (paletteMode === 2) ? 0 : 2; syncUI_All(); }
  if (key === 'y' || key === 'Y') { paletteMode = (paletteMode === 3) ? 0 : 3; syncUI_All(); }
  if (key === 'k' || key === 'K') { paletteMode = (paletteMode === 4) ? 0 : 4; syncUI_All(); }
  if (key === 'i' || key === 'I') { invertPalette = invertPalette ? 0 : 1; syncUI_All(); }
  if (key === 'q' || key === 'Q') { switchPalette = switchPalette ? 0 : 1; syncUI_All(); }

  // glitch shortcuts
  if (key === 'x' || key === 'X') { glitchMode = (glitchMode === 1) ? 0 : 1; window.__syncGlitchUI(); }
  if (key === 'z' || key === 'Z') { glitchMode = (glitchMode === 2) ? 0 : 2; window.__syncGlitchUI(); }
  if (key === 'w' || key === 'W') { glitchMode = (glitchMode === 3) ? 0 : 3; window.__syncGlitchUI(); }
  if (key === 't' || key === 'T') { glitchMode = (glitchMode === 4) ? 0 : 4; window.__syncGlitchUI(); }
  if (key === 'b' || key === 'B') { glitchMode = (glitchMode === 5) ? 0 : 5; window.__syncGlitchUI(); }
  
  if (key === 'n' || key === 'N') { invertPalette = invertPalette ? 0 : 1; syncUI_All(); }

  // O: ズームとパンをリセット
  if (key === 'o' || key === 'O') {
    manualZoomOffset = 1.0;
    manualPanX = 0.0;
    manualPanY = 0.0;
    panSpeedLeft = panSpeedRight = panSpeedUp = panSpeedDown = 0.0;
    console.log("Zoom and pan reset");
    if (typeof showUI === "function") showUI();
  }

  if (key === 'v' || key === 'V') showVisual = !showVisual;

  // [ / ] キー: BEATを上下
  if (key === '[') {
    const idx = BEAT_OPTIONS.indexOf(BEAT_DIV);
    if (idx > 0) {
      BEAT_DIV = BEAT_OPTIONS[idx - 1];
      syncUI_All();
      showUI();
    }
  }
  if (key === ']') {
    const idx = BEAT_OPTIONS.indexOf(BEAT_DIV);
    if (idx < BEAT_OPTIONS.length - 1) {
      BEAT_DIV = BEAT_OPTIONS[idx + 1];
      syncUI_All();
      showUI();
    }
  }

  // ¥ キー: hinotori/ga-ohを切り替え
  if (key === '¥' || keyCode === 220) {
    currentVisualIndex = (currentVisualIndex + 1) % 2;
    if (currentVisualIndex === 0) {
      keyVisual = hinotoriImg;
      showRings = true;
      console.log("→ Switched to: hinotori.png (rings enabled)");
    } else {
      keyVisual = gaohImg;
      showRings = false;
      console.log("→ Switched to: ga-oh.png (rings disabled)");
    }
  }

  if (key === 'd' || key === 'D') {
    motionMode = (motionMode === MOTION_DRONE) ? MOTION_BEAT : MOTION_DRONE;
    if (typeof syncMotionUI === "function") syncMotionUI();
    if (typeof showUI === "function") showUI();
  }

  // S: freeze all except key visual
  if (key === 's' || key === 'S') {
    freezeOthers = !freezeOthers;
    if (freezeOthers) {
      const tSnap = millis() * 0.001;
      freezeWasOn = true;
      freezeTimeT = tSnap;
      freezeBeatLocal = computeBeatLocal(tSnap);
      freezeBeatUniform = (motionMode === MOTION_DRONE) ? -1.0 : freezeBeatLocal;
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
      showUI();
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

  if (key === 'l' || key === 'L') {
    if (typeof pickPhotoFolderAndLoad === "function") {
      pickPhotoFolderAndLoad();
      showUI?.();
    } else {
      console.warn("pickPhotoFolderAndLoad is not defined");
    }
  }

  if (typeof syncMotionUI === "function") syncMotionUI();
  syncUI_All();
  if (typeof showUI === "function") showUI();
}

function keyReleased() {
  // 4方向カーソルキーが離されたときの時刻を記録
  if (keyCode === LEFT_ARROW  || keyCode === RIGHT_ARROW ||
      keyCode === UP_ARROW    || keyCode === DOWN_ARROW) {
    lastArrowKeyReleaseTime = millis();
  }
  
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
  if(beatValueSpan) beatValueSpan.html(String(BEAT_DIV));
  if(beatSlider){
    const idx = BEAT_OPTIONS.indexOf(BEAT_DIV);
    if(idx >= 0) beatSlider.value(idx);
  }

  Object.keys(palButtons).forEach(k => {
    const b = palButtons[k];
    const mode = Number(k);
    if (mode === 0) {
      if (paletteMode === 0 && invertPalette === 0 && switchPalette === 0) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else if (mode === 5) {
      if (invertPalette) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else if (mode === 6) {
      if (switchPalette) b.style("background:#fff;color:#000;");
      else b.style("background:#222;color:#fff;");
    } else {
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
  if (uiForceHidden) return;
  uiRoot.style('display', 'block');
  uiVisible = true;
  if (uiHideTimer) clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    uiRoot.style('display', 'none');
    uiVisible = false;
  }, 5000);
}

function toggleUI(){
  if (uiForceHidden) return;
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
// bgMode=9 : photo background
// =====================================================

function reseedPhoto(){
  photoPlacementsInit = false;
  renderPhotoComposite();
}

function choosePhotoLayers(){ /* deprecated */ }

function updatePhotoCamera(tSec, beatLocal, beatUniform){
  if (!pgPhoto) return;

  const isDrone = (motionMode === MOTION_DRONE);
  let z = 2.0;
  let px = photoCam.panX;
  let py = photoCam.panY;

  if (isDrone){
    const ax = pgPhoto.width  * 0.28;
    const ay = pgPhoto.height * 0.28;
    px = ax * Math.sin(tSec * 0.17) + ax * 0.55 * Math.sin(tSec * 0.41 + 1.7);
    py = ay * Math.cos(tSec * 0.13) + ay * 0.65 * Math.sin(tSec * 0.29 + 2.4);
    z = 2.2 + 1.2 * Math.sin(tSec * 0.23) + 0.35 * Math.sin(tSec * 0.71 + 0.8);
    z = constrain(z, 1.4, 4.6);
  } else {
    px = 0.0;
    py = 0.0;
    z = 2.0;
  }

  const halfViewW = (width  * 0.5) / z;
  const halfViewH = (height * 0.5) / z;
  const maxPanX = Math.max(0.0, (pgPhoto.width  * 0.5) - halfViewW);
  const maxPanY = Math.max(0.0, (pgPhoto.height * 0.5) - halfViewH);

  photoCam.panX = constrain(px, -maxPanX, maxPanX);
  photoCam.panY = constrain(py, -maxPanY, maxPanY);
  photoCam.zoom = z;
}

function pickActivePhotos(){ /* deprecated */ }

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
      p.idx = Math.floor(Math.random() * photoImgs.length);
      const t = (count <= 1) ? 0.0 : (i / (count - 1));
      const base = lerp(1.15, 0.35, t);
      const jitter = 0.70 + Math.random() * 0.60;
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
  if (burstHeld9) return;

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
    const step = Math.floor(tSec);
    if (step !== lastPhotoDroneStep){
      lastPhotoDroneStep = step;
      if (Math.random() < photoResetProb){
        pgPhoto.clear();
        pgPhoto.background(255);
        photoPlacementsInit = false;
        renderPhotoComposite();
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

  const n = Math.floor(beatSpawnMin + Math.random() * (Math.max(beatSpawnMin, beatSpawnMax) - beatSpawnMin + 1));
  const cx = pgPhoto.width  * 0.5;
  const cy = pgPhoto.height * 0.5;
  const rMax = Math.max(8, beatSpawnJitterPx);
  let sc = 1.0;

  for (let i = 0; i < n; i++){
    const img = photoImgs[Math.floor(Math.random() * photoImgs.length)];
    if (!img) continue;

    const ox = constrain(randomGaussian(0, rMax * 0.28), -rMax, rMax);
    const oy = constrain(randomGaussian(0, rMax * 0.28), -rMax, rMax);
    const base = 0.35 + Math.random() * 0.95;
    const scale = base * sc;
    const w = img.width  * scale;
    const h = img.height * scale;
    const x = (cx + ox) - w * 0.5;
    const y = (cy + oy) - h * 0.5;

    drawImageWrap(pgPhoto, img, x, y, w, h);
    sc *= 0.90;
  }
}

async function pickPhotoFolderAndLoad(){
  photoImgs = [];
  bgPhotoTex = null;
  lastPhotoBgStep = -1;

  const setStat = (msg) => { if (photoStatusSpan) photoStatusSpan.html(msg); };

  async function collectImageUrlsFromHandle(dirHandle, maxDepth = 6){
    const out = [];
    async function walk(handle, depth){
      if (!handle || depth > maxDepth) return;
      for await (const [name, entry] of handle.entries()){
        if (!entry) continue;
        if (entry.kind === "file"){
          const n = (entry.name || name || "").toLowerCase();
          if (!(n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp"))) continue;
          try{
            const file = await entry.getFile();
            out.push(URL.createObjectURL(file));
          }catch(e){ console.warn("getFile failed:", e); }
        } else if (entry.kind === "directory"){
          await walk(entry, depth + 1);
        }
      }
    }
    await walk(dirHandle, 0);
    return out;
  }

  setStat("…");

  if (window.showDirectoryPicker) {
    try{
      const handle = await window.showDirectoryPicker();
      const urls = await collectImageUrlsFromHandle(handle);
      await loadPhotoFromUrls(urls);
      if (photoImgs.length === 0){
        setStat("(0) NO IMAGES");
        console.warn("No images found.");
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
    if (photoImgs.length === 0) setStat("(0) NO IMAGES");
    else setStat(`(${photoImgs.length}) LOADED`);
    document.body.removeChild(inp);
  });

  inp.click();
}

async function loadPhotoFromUrls(urls){
  urls = (urls || []).filter(Boolean);

  for (let i = urls.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [urls[i], urls[j]] = [urls[j], urls[i]];
  }

  if (urls.length === 0){
    console.warn("No images found in selected folder.");
    return;
  }

  const loadOne = (u) => new Promise((resolve) => {
    loadImage(u, (img) => resolve(img), () => resolve(null));
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