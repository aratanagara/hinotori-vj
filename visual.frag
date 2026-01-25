#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D bgExtra;
uniform sampler2D bgPhoto;
uniform vec2 bgPhotoSize;
uniform vec2 bgCamPx;
uniform float bgZoom;
uniform float manualZoomOffset; // 手動ズームオフセット（freeZoomに乗算）
uniform vec2  resolution;
uniform vec2  texSize;
uniform float time;
uniform float bpm;
uniform float beat;
uniform int   bgMode;
uniform int   paletteMode;
uniform int   invertPalette; // INVERT専用フラグ
uniform int   switchPalette; // SWITCH: 2色入れ替え

// glitch関連(重複削除)
uniform int   glitchMode;
uniform float glitchAmt;
uniform float glitchSeed;
uniform float glitchBeat;
uniform int   overlayOn;    // リングの表示制御
uniform int   showVisual;   // キービジュアルの表示制御

uniform vec2  centerN;
uniform float ringDensity;
uniform float lineW;

uniform float arcWidth;
uniform float sweepDir;
uniform float appearRate;
uniform float jitter;

uniform float baseInkGain;
uniform float baseInkGamma;
uniform vec3  baseInkColor;
uniform float inkOpacity;

uniform float colorLineOpacity;

uniform float keyRBMin;
uniform float keyGMax;
uniform float keySoft;

uniform float hueBase;
uniform float hueSpread;

uniform float flashAmt;
uniform float flashPow;
uniform float flashInk;

varying vec2 vTexCoord;

// =====================================================
// constants
// =====================================================
const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

const float ZOOM  = 58.0;
const int   TIMES = 4;

const float RING_SAT = 1.60;
const float RING_BRI = 1.12;

// 背景 “止まる拍” の確率
const float HOLD_PROB = 0.18;

// ===== FREE motion tuning =====
// ドローン(浮遊)の移動距離（大きいほど動く）
const float FREE_HOVER_GAIN = 12.0;
// ドリフト(直線流れ)の速さ（小さいほど遅い）
const float FREE_DRIFT_GAIN = 0.10;

// FREEズーム：振幅（±）と速度（btスケール）
const float FREE_ZOOM_AMP   = 0.50; // 0.10 = ±10%
const float FREE_ZOOM_RATE  = 0.10; // 低いほどゆっくり

// =====================================================
// utils
// =====================================================
float hash21(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float easeOutQuint(float x){
  return 1.0 - pow(1.0 - x, 5.0);
}

float sstep(float a,float b,float x){
  float t = clamp((x-a)/(b-a),0.0,1.0);
  return t*t*(3.0-2.0*t);
}

vec2 uvCover(vec2 uv, vec2 canvas, vec2 tex){
  float ca = canvas.x / canvas.y;
  float ta = tex.x / tex.y;
  vec2 s = (ca > ta) ? vec2(1.0, ca/ta) : vec2(ta/ca, 1.0);
  return (uv - 0.5) / s + 0.5;
}

float wrapDelta(float a,float b){
  float d = a - b;
  return d - floor(d + 0.5);
}

vec3 saturateColor(vec3 c,float s){
  float l = dot(c, vec3(0.299,0.587,0.114));
  return mix(vec3(l), c, s);
}

// 4x4 Bayer (0..1)
float bayer4(vec2 p){
  vec2 f = mod(p, 4.0);
  float x = f.x, y = f.y;
  float v = 0.0;

  if(y < 1.0){
    if(x < 1.0) v = 0.0;   else if(x < 2.0) v = 8.0;  else if(x < 3.0) v = 2.0;  else v = 10.0;
  }else if(y < 2.0){
    if(x < 1.0) v = 12.0;  else if(x < 2.0) v = 4.0;  else if(x < 3.0) v = 14.0; else v = 6.0;
  }else if(y < 3.0){
    if(x < 1.0) v = 3.0;   else if(x < 2.0) v = 11.0; else if(x < 3.0) v = 1.0;  else v = 9.0;
  }else{
    if(x < 1.0) v = 15.0;  else if(x < 2.0) v = 7.0;  else if(x < 3.0) v = 13.0; else v = 5.0;
  }
  return (v + 0.5) / 16.0;
}

// =====================================================
// FREE / BEAT unified beat
// =====================================================
bool isFree(){
  bool f = false;
  if(beat < 0.0) f = true;
  return f;
}

// FREE は time ベースで連続進行、速度のみ bpm 参照
float freeBeat(){
  float bpmScale = bpm / 120.0;
  return time * 6.0 * bpmScale;
}

float getBeat(){
  float bt = beat;
  if(isFree()){
    bt = freeBeat();
  }
  return bt;
}

// =====================================================
// smooth random helpers (FREE用：リセット感の除去)
// =====================================================
float smooth01(float x){
  return x*x*(3.0-2.0*x);
}

// 1D value noise (continuous)
float vnoise1(float t, float salt){
  float i = floor(t);
  float f = fract(t);
  float e = smooth01(f);
  float a = hash21(vec2(i, salt));
  float b = hash21(vec2(i + 1.0, salt));
  return mix(a, b, e);
}

// cheap fbm (continuous wandering)
float fbm1(float t, float salt){
  float n = 0.0;
  float amp = 0.55;
  float frq = 0.22;
  for(int k=0;k<4;k++){
    n += (vnoise1(t*frq, salt + float(k)*19.7) - 0.5) * 2.0 * amp;
    amp *= 0.55;
    frq *= 2.05;
  }
  return n; // ~[-1..1]
}

float freeSeed(float bt, float rate, float salt){
  float t = bt * rate;
  return vnoise1(t, salt); // 0..1
}

// =====================================================
// FREE zoom (background only)
// =====================================================
float freeZoom(float bt, float salt){
  // 0..1
  float z = vnoise1(bt * FREE_ZOOM_RATE, salt + 900.1);
  // -1..1 へ
  z = (z - 0.5) * 2.0;
  // 少し丸める（ギクつき防止）
  z = z * (0.85 + 0.15 * vnoise1(bt * (FREE_ZOOM_RATE * 2.0), salt + 901.7));
  // 1±amp
  return 1.0 + z * FREE_ZOOM_AMP;
}

vec2 applyZoomToFC(vec2 fc, float zoom){
  vec2 c = 0.5 * resolution.xy;
  return (fc - c) / zoom + c;
}

// =====================================================
// palette
// =====================================================
vec3 pal(int i){
  if(i==0)  return vec3(0.00,0.90,0.73);
  if(i==1)  return vec3(0.70,0.74,0.74);
  if(i==2)  return vec3(0.90,0.58,0.49);
  if(i==3)  return vec3(0.88,0.31,0.29);
  if(i==4)  return vec3(0.16,0.67,0.57);
  if(i==5)  return vec3(0.27,0.82,0.70);
  if(i==6)  return vec3(0.47,0.79,0.67);
  if(i==7)  return vec3(0.07,0.80,0.72);
  if(i==8)  return vec3(0.65,0.42,0.49);
  if(i==9)  return vec3(0.82,0.68,0.18);
  if(i==10) return vec3(0.44,0.60,0.83);
  return           vec3(0.11,0.59,0.88);
}

vec3 palPick(float x){
  return pal(int(floor(fract(x)*12.0)));
}

// =====================================================
// beat helpers
// =====================================================
float colorBeat(float bt){
  return floor(bt) + easeOutQuint(fract(bt));
}

// =====================================================
// random move control (per-beat)
// =====================================================
struct MoveRand {
  float dir;
  float dist;
  float speed;
  float hold;
};

MoveRand moveRand(float bt, float salt){
  float blk = floor(bt);

  float r0 = hash21(vec2(blk, 0.3 + salt));
  float r1 = hash21(vec2(blk, 1.1 + salt));
  float r2 = hash21(vec2(blk, 2.7 + salt));
  float r3 = hash21(vec2(blk, 5.9 + salt));

  MoveRand m;
  m.hold  = step(1.0 - HOLD_PROB, r0);
  m.dir   = step(0.5, r1) * 2.0 - 1.0;
  m.dist  = mix(0.20, 1.20, r2);
  m.speed = mix(0.45, 2.40, r3);
  return m;
}

float freeBlock(float bt){
  float scale = bpm / 120.0;
  return floor(bt * 0.15 * scale);
}

// FREE時：ドリフト寄りのウェイト（0..1、連続）
// だいたい10%くらい“ドリフト寄り”になるようにする
float freeDriftWeight(float bt, float salt){
  float v = vnoise1(bt * 0.06, salt + 77.7);  // 0..1
  return smoothstep(0.90, 1.00, v);           // 上位10%付近だけ 0→1
}

vec2 freeDriftDir(float bt, float salt){
  float blk = freeBlock(bt);
  float a = hash21(vec2(blk, salt + 13.7)) * TAU;
  return vec2(cos(a), sin(a));
}

vec2 freeHoverVec(float bt, float salt){
  float t = bt * 0.25;
  float x = fbm1(t, salt + 1.0);
  float y = fbm1(t, salt + 9.1);
  return vec2(x, y);
}

float randomMoveTime(float bt, float baseScale, float salt){

  if(isFree()){
    // 連続ウェイト（切替段差なし）
    float w = freeDriftWeight(bt, salt);

    // ---- ドリフト成分（直線流れ） ----
    vec2 dir = freeDriftDir(bt, salt);
    float spd = baseScale * FREE_DRIFT_GAIN * (bpm / 120.0);
    // btで積分することで連続的に進む（速すぎるなら FREE_DRIFT_GAIN を下げる）
    float driftVal = (dir.x + dir.y) * bt * spd;

    // ---- ドローン浮遊成分（ランダム軌道）----
    vec2 hv = freeHoverVec(bt, salt);

    float slow = fbm1(bt * 0.05, salt + 100.0); // 大きく漂う
    float mid  = hv.x + hv.y;                   // 中くらいの揺れ

    float hoverVal =
        (slow * 1.4 + mid * 0.6)
        * baseScale
        * FREE_HOVER_GAIN;

    // 常に両方を走らせて補間（切替の“切れ目”を消す）
    return mix(hoverVal, driftVal, w);
  }

  // -------- BEAT MODE（既存） --------
  MoveRand m = moveRand(bt, salt);
  float blk = floor(bt);
  float ph  = fract(bt);
  float e   = easeOutQuint(ph);
  float adv = mix(e * m.speed, 0.0, m.hold);
  return (blk + adv) * m.dir * m.dist * baseScale;
}


// =====================================================
// Backgrounds
// =====================================================

// 0) VanGogh
vec3 bg_vangogh(vec2 fc){
  float bt   = getBeat();

  float blk  = floor(bt);
  float seed = 0.0;

  if(isFree()){
    seed = freeSeed(bt, 0.07, 777.1); // 0..1（連続）
  }else{
    seed = hash21(vec2(blk, blk * 7.1));
  }

  float t = randomMoveTime(bt, TAU * (0.18 + 0.10 * seed), 101.0) + seed * 6.0;

  // 統一されたbgZoomを適用
  vec2 p = (fc - 0.5 * resolution.xy) / ZOOM / bgZoom;
  p.x *= resolution.x / resolution.y;
  
  // パン（カメラ移動）をUV空間で適用
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  p = p + panUV;

  vec2 off = vec2(0.0);
  if(isFree()){
    float ox = freeSeed(bt, 0.05, 33.1);
    float oy = freeSeed(bt, 0.05, 91.7);
    off = vec2(ox, oy) - 0.5;
  }else{
    off = vec2(hash21(vec2(blk, 33.1)), hash21(vec2(blk, 91.7))) - 0.5;
  }
  p += off * 0.35;

  for(int i=0;i<TIMES;i++){
    float d = ceil(-sin(t) + length(p) * 6.0) / 3.0;
    p += vec2(
      sin(p.y + sin(d)) - sin(t / 4.0),
     -sin(p.x - sin(d)) - cos(t / 4.0)
    );
  }

  vec3 c = 0.5 + 0.5 * vec3(cos(p.x * 0.2), sin(p.y * 0.4), sin(p.x * 0.2));
  c = saturateColor(c, 1.15);
  return clamp(c, 0.0, 1.0);
}

// 1) simple noise
vec3 bg_noise(vec2 fc){
  float bt = getBeat();
  
  // ズームとパンを適用
  vec2 p = (fc - 0.5 * resolution.xy) / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  p = p + panUV * resolution.y;
  
  vec2 uv = p / resolution;

  float ty = randomMoveTime(bt, 0.22, 10.0);
  float tx = randomMoveTime(bt, 0.12, 20.0);

  uv += vec2(tx, ty);
  
  // タイリングでシームレスに（境界が見えない）
  uv = fract(uv);
  
  float n = hash21(floor(uv * 420.0));
  return vec3(0.12 + 0.40 * n);
}

// 2) 7sKSDd
vec3 bg_7sKSDd(vec2 fc){
  float bt = getBeat();
  float tx = randomMoveTime(bt, TAU * 0.08, 201.0);
  float ty = randomMoveTime(bt, TAU * 0.06, 202.0);

  vec3 col = vec3(0.0);
  
  // ズームとパンを適用
  vec2 uv1 = (fc * 10.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  uv1 = uv1 + panUV;
  
  uv1 += vec2(tx, ty) / 10.0;

  for(int c=0;c<3;c++){
    vec2 uv = uv1;
    for(int i=0;i<6;i++){
      uv = fract((uv.y + uv.x + uv) / 1.5) * 1.5;
      uv *= (uv.x - uv.y);
      col += col.yzx * (uv.x + uv.y) / 8.0;
      col[c] += (uv.y - uv.x);
    }
  }
  return fract(col);
}

// 3) sdjGWR
vec3 bg_sdjGWR(vec2 fc){
  float bt = getBeat();
  float tx = randomMoveTime(bt, TAU * 0.07, 301.0);
  float ty = randomMoveTime(bt, TAU * 0.05, 302.0);

  vec3 col = vec3(0.0);
  
  // ズームとパンを適用
  vec2 uv = (fc * 10.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  uv = uv + panUV;
  
  uv += vec2(tx * 0.5, ty * 0.33) / 4.0;

  for(int c=0;c<3;c++){
    float scale = 5.6;
    float scale1 = 1.5;
    float s1 = scale1 * scale;
    for(int i=0;i<6;i++){
      uv = fract(uv / s1) * s1;
      uv = -fract(
              uv / (2.0 - abs((uv.x - uv.y) / 16.0))
            - (uv / (2.5 + fract(uv.x + uv.y))) / scale
           ) * scale / scale1 + s1;
      uv /= scale1 + col.yx;
      uv = uv.yx + col.xy;
      uv.x /= -1.1;
      col[c] = fract((0.25 * col[c] + col.x + uv.y - uv.x) / 2.0);
    }
  }
  return col;
}

// 4) 7sSGWD
vec3 bg_7sSGWD(vec2 fc){
  float bt = getBeat();
  float tx = randomMoveTime(bt, TAU * 0.07, 401.0);
  float ty = randomMoveTime(bt, TAU * 0.05, 402.0);

  vec3 col = vec3(0.0);
  
  // ズームとパンを適用
  vec2 uv = (fc * 10.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  uv = uv + panUV;
  
  uv += vec2(tx * 0.5, ty * 0.33) / 4.0;

  for(int c=0;c<3;c++){
    float scale = 5.5;
    float scale1 = 1.4;
    float s1 = scale1 * scale;
    for(int i=0;i<6;i++){
      uv = fract(uv / s1) * s1;
      uv = -fract(
              uv / (2.0 - abs((uv.x - uv.y) / 16.0))
            - (uv / (2.5 + fract(uv.x + uv.y))) / scale
           ) * scale / scale1 + s1;
      uv /= scale1 + col.yx;
      uv = uv.yx + col.xy;
      uv.x *= -(1.0 + col.x / scale);
      col[c] = fract((0.25 * col[c] + col.x + uv.y - uv.x) / 2.5);
    }
  }
  return col;
}

// 5) ShaderToy-based effect (with BPM sync and camera pan/zoom)
vec3 bg_NdsSzl(vec2 fc){
  float bt = getBeat();
  
  // ズームとパンを適用してUV座標を計算
  vec2 uv = (fc - 0.5 * resolution.xy) / resolution.y / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  uv = uv + panUV;
  
  // タイリングサイズ（大きいほど繰り返しの単位が大きく、余白が増える）
  float tileSize = 10.0;
  // UV座標をタイリング（fract でループ）
  // 中心を原点にしてループ
  uv = mod(uv + tileSize * 0.5, tileSize) - tileSize * 0.5;
  
  // BPM同期の時間（randomMoveTimeを使用）
  float t = randomMoveTime(bt, TAU * 0.06, 501.0);
  
  vec3 p = vec3(0.0);
  float s = 0.0, d = 0.0;
  vec4 o = vec4(0.0);
  
  // =========================
  // メイン生成
  // =========================
  for (float i = 0.0; i < 100.0; i += 1.0) {
    p = 1.5 * vec3(uv * d, d + t);
    
    s = 5e-3 + abs(s) * 0.07;
    d += s;
    o += (1.0 + sin(i * 0.5 + 1.5 * vec4(3.0, 1.5, 1.0, 0.0))) / s
       + vec4(1.0, 1.0, 3.0, 1.0) / length(uv + vec2(0.0, -0.7));
    
    // 回転行列を適用
    float angle = d * 0.1 - 4.0;
    float c = cos(angle);
    float sn = sin(angle);
    p.xy = mat2(c, sn, -sn, c) * p.xy;
    
    s += cos(p.x + p.y) * 2.0 + 1.5
       + abs(dot(0.2 * sin(vec3(p.xy * 1.5, p.z + t * 5.0)),
                 vec3(0.0, 9.0, 2.0)));
  }
  
  // =========================
  // トーンマップ（tanh代替）
  // =========================
  vec4 x = o * o / 3e7;
  // tanh(x) ≈ x * (27 + x²) / (27 + 9x²) for small x
  vec4 x2 = x * x;
  o = x * (27.0 + x2) / (27.0 + 9.0 * x2);
  
  // =========================
  // 1) 色差ベース一括：干渉色を抑制
  // =========================
  float L  = dot(o.rgb, vec3(0.299, 0.587, 0.114));
  vec3  ch = o.rgb - vec3(L);
  float sat = length(ch);
  float lumW = smoothstep(0.35, 0.95, L);
  float satW = smoothstep(0.04, 0.20, sat);
  float k = 1.10 * lumW * satW;
  vec3 col = vec3(L) + ch * (1.0 - k);
  
  // =========================
  // 2) 帯（低彩度・中明度）を暗め青シルバーへ
  // =========================
  float Lc = dot(col, vec3(0.299, 0.587, 0.114));
  vec3  ch2 = col - vec3(Lc);
  float sat2 = length(ch2);
  float grayMask =
      (1.0 - smoothstep(0.03, 0.10, sat2)) *
      smoothstep(0.25, 0.80, Lc) *
      (1.0 - smoothstep(0.88, 0.98, Lc));
  vec3 blueSilver = vec3(Lc * 0.78) * vec3(0.88, 0.93, 1.08);
  col = mix(col, blueSilver, grayMask);
  
  // =========================
  // 3) 背景を「帯の輪郭グレー」に揃える
  //    → 暗部を輪郭グレーまで底上げ（黒を残さない）
  // =========================
  float Lf = dot(col, vec3(0.299, 0.587, 0.114));
  // 輪郭グレー（ここが背景色の本体）
  vec3 outlineGray = vec3(0.68, 0.70, 0.74);  // 青寄りのグレー
  // 暗部ほど強く outlineGray に寄せる（=背景が輪郭グレーになる）
  float bgMask = 1.0 - smoothstep(0.08, 0.35, Lf);
  col = mix(col, outlineGray, bgMask);
  
  // =========================
  // 4) 仕上げ：全体をほんのり青銀へ（WB冷却）
  // =========================
  col *= vec3(0.94, 0.98, 1.05);
  
  return clamp(col, 0.0, 1.0);
}

// 6) sin/fract
vec3 bg_newSinFract(vec2 fc){
  float bt = getBeat();
  const int ITERS = 12;
  float t = randomMoveTime(bt, TAU / 16.0, 601.0);

  vec3 col = vec3(0.0), col_prev = vec3(0.0);
  
  // ズームとパンを適用
  vec2 uv = (fc * 10.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  uv = uv + panUV;
  
  uv.y += t;

  for(int c=0;c<ITERS;c++){
    float scale  = 2.25;
    float scale1 = 1.9;
    col_prev = col;

    for(int i=0;i<ITERS;i++){
      uv = sin(uv.yx / (scale1*scale)) * (scale1*scale);
      uv = -fract(
              uv + vec2(uv.x/scale - uv.y/scale1,
                        uv.y/scale - uv.x/scale1) / scale
            ) * scale / scale1;
      uv.y /= -scale1;
      scale1 += (uv.x * (0.005 * fract(uv.x + t * (scale1*scale))));
    }

    col.b = abs(fract(uv.y) - fract(uv.x));
    col = (col + col_prev.yzx) / 2.0;
  }

  return clamp(col * 3.0, 0.0, 1.0);
}

// 7) cos 20 loop
vec3 bg_cos20(vec2 fc){
  float bt = getBeat();
  float tBase = randomMoveTime(bt, TAU * 0.10, 701.0);
  float tUVx  = randomMoveTime(bt, TAU * 0.06, 702.0);
  float tUVy  = randomMoveTime(bt, TAU * 0.05, 703.0);

  vec3 col = vec3(0.0);

  for(int c=0;c<3;c++){
    // 統一されたbgZoomを適用（小さいほどZOOM、大きいほど引き）
    vec2 uv = (fc * 50.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
    
    // パン（カメラ移動）をUV空間で適用（シンプルかつ大きく）
    // bgCamPxはピクセル単位、これをUV空間にスケール
    vec2 panUV = bgCamPx / resolution.y * 5.0; // 5.0倍で効果を大きく
    uv = uv + panUV; // +符号で直感的な方向
    
    uv += vec2(tUVx, tUVy) / 10.0;

    float t = tBase + float(c) / 10.0;

    float scale  = 5.0;
    float scale1 = 1.4;

    for(int i=0;i<20;i++){
      float tt = t * 0.5;

      uv = cos(
             uv / (2.0 + sin((uv.x + uv.y) / 10.0))
           - (uv.yx / (2.0 + sin(fract(tt + uv.x + uv.y)))) / scale
           ) * scale / 1.5 + scale1 * scale;

      uv /= scale1;
      uv = uv.yx + col.xy;
    }

    col[c] = fract(uv.x - uv.y);
  }

  return clamp(col, 0.0, 1.0);
}

// 8) Inkelly（maskをcoverで取る）
vec3 bg_inkelly(vec2 fc){
  float bt = getBeat();

  float ph = 0.0;
  if(isFree()){
    ph = fract(bt * 0.25);
  }else{
    ph = fract(bt);
  }
  float ease = easeOutQuint(ph);

  vec2 uv = fc / resolution;

  vec2 uvm = uvCover(uv, resolution, texSize);
  float mask = 0.0;
  if(uvm.x>=0.0 && uvm.x<=1.0 && uvm.y>=0.0 && uvm.y<=1.0){
    mask = texture2D(tex1, uvm).r;
    mask = smoothstep(0.2, 0.8, mask);
  }

  float m = texture2D(bgExtra, uv).r * mask;

  float th = 0.5;
  if(isFree()){
    th = 0.50 + 0.06 * sin(bt * 0.80);
  }else{
    th = mix(0.42, 0.58, ease);
  }

  vec2 px = vec2(1.0 / resolution.x, 1.0 / resolution.y);
  float mR = texture2D(bgExtra, uv + vec2(px.x, 0.0)).r * mask;
  float mL = texture2D(bgExtra, uv - vec2(px.x, 0.0)).r * mask;
  float mU = texture2D(bgExtra, uv + vec2(0.0, px.y)).r * mask;
  float mD = texture2D(bgExtra, uv - vec2(0.0, px.y)).r * mask;

  // threshold を硬く
  m = smoothstep(th - 0.008, th + 0.008, m);

  // edge 強化
  float edge = abs(mR - mL) + abs(mU - mD);
  edge = pow(edge, 0.65);
  edge *= mix(2.8, 3.0, ease);
  edge = max(edge - 0.5, 0.0);

  // ソリッド線
  float ink = smoothstep(0.040, 0.045, edge);
  // さらに硬くするなら
  // float ink = step(0.04, edge);

  vec3 paper = vec3(0.91, 0.94, 0.91);
  vec3 inkCol = vec3(0.02);
  
  vec3 col = paper;
  col = mix(col, inkCol, ink);

  return col;
}

// selector

// =====================================================
// bgMode=10 : panel collage (CPU composited in bgPhoto)
// - no wrap: clamp outside to white
// - camera: center-based pan(px) + zoom
// =====================================================
vec3 bg_photo(vec2 fc){
  // fc: pixel coords in the main screen (0..resolution)
  float z = max(0.001, bgZoom);

  // map screen to bgPhoto pixel space
  vec2 view = (fc - 0.5 * resolution) / z;
  vec2 p = 0.5 * bgPhotoSize + bgCamPx + view;

  // clamp (no looping)
  vec2 uv = clamp(p / max(bgPhotoSize, vec2(1.0)), vec2(0.0), vec2(1.0));
  return texture2D(bgPhoto, uv).rgb;
}

vec3 getBackground(vec2 fc){
  if(bgMode==1) return bg_noise(fc);
  if(bgMode==2) return bg_7sKSDd(fc);
  if(bgMode==3) return bg_sdjGWR(fc);
  if(bgMode==4) return bg_7sSGWD(fc);
  if(bgMode==5) return bg_NdsSzl(fc);
  if(bgMode==6) return bg_newSinFract(fc);
  if(bgMode==7) return bg_cos20(fc);
  if(bgMode==8) return bg_inkelly(fc);
  if(bgMode==9){
    // bgPhoto は 2D合成キャンバス（2x window）
    // カメラ：スクロール(bgCamPx) + ズーム(bgZoom)、端はラップ
    vec2 uv = fc / resolution;
    float z = max(0.001, bgZoom);
    vec2 cam = bgCamPx / max(bgPhotoSize, vec2(1.0));
    vec2 suv = (uv - 0.5) / z + 0.5 + cam;
    // wrap
    suv = fract(suv);
    // p5テクスチャの上下反転補正
    suv.y = 1.0 - suv.y;
    return texture2D(bgPhoto, suv).rgb;
  }

  return bg_vangogh(fc);
}

// =====================================================
// global palette mode (r/g/b/k)
// =====================================================
float luma709(vec3 c){
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 applyTwoColor(vec3 c, vec3 c0, vec3 c1, vec2 fc){
  float l = luma709(c);
  float d = bayer4(fc);
  float t = 0.5 + (d - 0.5) * 0.10;
  float k = step(t, l);
  return mix(c0, c1, k);
}

vec3 applyMangaTone(vec3 c, vec2 fc){
  float l = luma709(c);

  const float CONTRAST = 2.6;
  l = clamp((l - 0.5) * CONTRAST + 0.5, 0.0, 1.0);

  l = smoothstep(0.32, 0.78, l);

  const float DOT_SIZE = 3.0;
  vec2 cell = floor(fc / DOT_SIZE);
  vec2 f = fract(fc / DOT_SIZE) - 0.5;

  float d = bayer4(cell * DOT_SIZE) - 0.5;
  float l2 = clamp(l + d * 0.06, 0.0, 1.0);

  float radius = (1.0 - l2) * 0.52;

  float dist = length(f);
  float dot = step(dist, radius);

  float v = mix(1.0, 0.0, dot);
  return vec3(v);
}

vec3 applyPaletteAll(vec3 col, vec2 fc){
  if(paletteMode == 0) return col;

  if(paletteMode == 1){
    vec3 bg = vec3(0.56, 0.61, 0.70);
    vec3 fg = vec3(0.82, 0.00, 0.00);
    // SWITCH: 2色を入れ替え
    if(switchPalette != 0){
      vec3 temp = bg;
      bg = fg;
      fg = temp;
    }
    return applyTwoColor(col, bg, fg, fc);
  }

  if(paletteMode == 2){
    vec3 bg = vec3(0.00, 0.38, 1.00);
    vec3 fg = vec3(0.10, 0.78, 0.18);
    // SWITCH: 2色を入れ替え
    if(switchPalette != 0){
      vec3 temp = bg;
      bg = fg;
      fg = temp;
    }
    return applyTwoColor(col, bg, fg, fc);
  }

  if(paletteMode == 3){
    vec3 bg = vec3(0.84, 0.30, 0.86);
    vec3 fg = vec3(0.90, 0.78, 0.02);
    // SWITCH: 2色を入れ替え
    if(switchPalette != 0){
      vec3 temp = bg;
      bg = fg;
      fg = temp;
    }
    return applyTwoColor(col, bg, fg, fc);
  }

  if(paletteMode == 5){
    return vec3(1.0) - col;
  }

  return applyMangaTone(col, fc);
}



// =====================================================
// glitch UV modification (before texture sampling)
// =====================================================
vec2 applyGlitchUV(vec2 uv, vec2 fc){
  if (glitchMode != 1) return uv;
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return uv;

  float b = glitchBeat;
  float stepB = floor(b * 16.0);
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
  
  // ビート同期：1拍ごとに強弱をつける
  float beatPhase = fract(b);
  // ビートの最初の25%で発生、残り75%は休止
  float beatActive = step(beatPhase, 0.25);
  // ビート内での強度カーブ（0→1→0）
  float beatCurve = sin(min(beatPhase / 0.25, 1.0) * PI);
  
  // 全体的な発生確率（常時ではなく間欠的に）
  float globalTrigger = step(0.3, seed) * beatActive * k;
  if (globalTrigger < 0.001) return uv;
  
  // スライス高さ：極端に指数関数的（2px〜600px）
  float sliceRandom = hash11(seed * 3.7);
  // 6乗で極端な偏り：ほとんどが細く、稀に極太
  float sliceHeightPx = 2.0 + pow(sliceRandom, 6.0) * 598.0;
  
  float pixelY = uv.y * resolution.y;
  float sid = floor(pixelY / sliceHeightPx);
  float r1 = hash11(sid * 13.37 + seed * 91.7);
  
  // スライスごとの発生確率（7乗で極端に選択的）
  float intensity = pow(r1, 7.0);
  float shouldGlitch = step(0.8, r1); // 上位20%のみ
  
  if (shouldGlitch < 0.5) return uv;

  // シフト量も極端に（5乗）
  float shiftBase = pow(hash11(sid * 7.31 + seed * 19.1), 5.0);
  float shiftAmt = (shiftBase - 0.5) * 3.0 * intensity * beatCurve;
  float shiftAmt2 = (pow(hash11(sid * 29.3 + seed * 3.7), 3.0) - 0.5) * 0.8 * intensity;
  float beatShift = sin(b * TAU) * 0.3 * intensity * beatCurve;
  float randomShift = (pow(hash11(sid * 17.3 + seed * 5.3), 4.0) - 0.5) * 1.2 * intensity;
  
  // UV X座標をシフト（ループ）
  float totalShift = globalTrigger * (shiftAmt + shiftAmt2 + beatShift + randomShift);
  uv.x = fract(uv.x + totalShift);
  
  return uv;
}

// glitchMode=3,4,5用のUV変換（複数モード対応版）
vec2 applyGlitchUV_Multi(vec2 uv, vec2 fc){
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return uv;
  
  float b = glitchBeat;
  float stepB = floor(b * 16.0);
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
  
  // glitchMode=3: NOISE DISPLACEMENT (disabled - 色ノイズのみ使用)
  if (glitchMode == 3) {
    // 変位なし、色処理のみに任せる
    return uv;
  }
  
  // glitchMode=4: FOCUSED TWIST
  if (glitchMode == 4) {
    float stepB4 = floor(b * 4.0);
    float seed4 = fract(sin((stepB4 + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
    
    float beatPhase = fract(b);
    float twistAmount = sin(beatPhase * PI);
    twistAmount = pow(twistAmount, 0.8) * k;
    
    vec2 center = vec2(hash11(seed4 * 3.1), hash11(seed4 * 7.7));
    vec2 toCenter = uv - center;
    float dist = length(toCenter);
    float radius = 0.3 + hash11(seed4 * 11.3) * 0.4;
    float influence = smoothstep(radius * 1.2, 0.0, dist);
    
    if(influence > 0.001){
      float rotation = (hash11(seed4 * 13.7) - 0.5) * PI * 10.0 * twistAmount;
      float distFactor = 1.0 - pow(dist / radius, 0.5);
      rotation *= distFactor;
      
      float scaleBase = hash11(seed4 * 19.1);
      float scale = (scaleBase < 0.5) ? (1.0 - twistAmount * 0.9) : (1.0 + twistAmount * 2.0);
      
      float angle = atan(toCenter.y, toCenter.x);
      float newAngle = angle + rotation;
      float newDist = dist * scale;
      
      vec2 displaced = center + vec2(cos(newAngle) * newDist, sin(newAngle) * newDist);
      uv = mix(uv, displaced, influence);
    }
    return uv;
  }
  
  // glitchMode=5: MOTION BLUR
  if (glitchMode == 5) {
    float beatPhase = fract(b);
    float blurAmount = sin(beatPhase * PI);
    blurAmount = pow(blurAmount, 1.0) * k;
    
    // 2拍ごとに方向が変わる
    float stepB2 = floor(b * 0.5);
    float directionSeed = fract(sin(stepB2 * 78.233 + glitchSeed * 11.7) * 12345.678);
    
    // 8方向からランダムに選択（上下左右+斜め4方向）
    // 0:右、1:右下、2:下、3:左下、4:左、5:左上、6:上、7:右上
    float dirIndex = floor(directionSeed * 8.0);
    float motionAngle = dirIndex * (TAU / 8.0); // 45度刻み
    
    // ピクセルごとに微妙な揺らぎ
    float pixelNoise = hash11(fc.x * 0.01 + fc.y * 0.01 + seed * 7.3);
    motionAngle += (pixelNoise - 0.5) * 0.3;
    
    vec2 motionDir = vec2(cos(motionAngle), sin(motionAngle));
    float displacement = blurAmount * 0.15;
    float depthVariation = hash11(fc.x * 0.05 + fc.y * 0.05 + seed * 13.7);
    displacement *= (0.5 + depthVariation * 0.5);
    
    return uv + motionDir * displacement;
  }
  
  return uv;
}

// =====================================================
// glitch (screen-space, affects the whole composite)
// =====================================================
float gSat(float x){ return clamp(x, 0.0, 1.0); }

vec3 glitchOp(vec3 c, float k, float m){
  // m selects operation; k is strength
  // channel shuffle / invert / crush
  if (m < 0.33){
    c = vec3(c.g, c.b, c.r);
  } else if (m < 0.66){
    c = 1.0 - c;
  } else {
    float q = mix(10.0, 4.0, k);
    c = floor(c * q + 0.5) / q;
  }
  // contrast bump
  c = mix(c, pow(c, vec3(0.75)), k*0.35);
  return c;
}

vec3 applyGlitchAll(vec3 col, vec2 fc){
  if (glitchMode <= 0) return col;
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return col;

  // beat-synced step (16th by default on JS side)
  float b = glitchBeat;
  float stepB = floor(b * 4.0); // internal: 4x; JS already controls seed per subdiv
  vec2 uv = fc / max(resolution, vec2(1.0));

  // deterministic seed per step (stable inside the step)
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);

  // -----------------------
  // Mode 1: CUTUP (SLICE) - 背景とhinotoriはすでにUVレベルで処理済み
  // -----------------------
  if (glitchMode == 1){
    return col;
  }

  // -----------------------
  // Mode 2: MOSAIC/SLIT（モザイク/スリット）
  // -----------------------
  if (glitchMode == 2){
    // 時間経過で細かい→大きいモザイクへ変化
    float beatPhase = fract(b);
    // 0→1で細かい→大きいへ変化
    float sizeAnim = smoothstep(0.0, 1.0, beatPhase);
    
    // モザイクサイズ（細かい4pxから大きい32pxへ）
    float mosaicSize = mix(4.0, 32.0, sizeAnim * hash11(seed * 7.3));
    vec2 mosaicCell = floor(fc / mosaicSize);
    
    // スリット効果
    float slitType = hash11(seed * 3.7);
    // スリット幅も時間で変化
    float slitFreq = mix(30.0, 8.0, sizeAnim * hash11(seed * 9.1));
    float slit = 0.0;
    
    if(slitType < 0.5){
      slit = step(0.5, fract(uv.x * slitFreq + seed));
    } else {
      slit = step(0.5, fract(uv.y * slitFreq + seed));
    }
    
    // モザイクとスリットの切り替え
    float effectType = hash11(seed * 11.3);
    vec3 result = col;
    
    if(effectType < 0.5){
      // モザイク効果
      float blockHash = hash21(mosaicCell + seed * 7.7);
      if(blockHash > 0.7){
        result = vec3(col.g, col.b, col.r);
      } else if(blockHash > 0.4){
        result = vec3(col.b, col.r, col.g);
      }
    } else {
      // スリット効果
      result = mix(col, vec3(1.0) - col, slit * 0.7);
    }
    
    result = mix(col, result, k);
    
    // ノイズ追加（サイズに応じて強度変化）
    float noiseAmt = mix(0.15, 0.05, sizeAnim);
    float noise = (hash11(fc.x + fc.y * 173.1 + stepB * 5.0) - 0.5) * noiseAmt * k;
    result += noise;
    
    return clamp(result, 0.0, 1.0);
  }

  // -----------------------
  // Mode 3: WHITE NOISE (RGB independent color noise)
  // -----------------------
  if (glitchMode == 3){
    // RGB independent white noise (color) - beat locked
    float nr = hash11(fc.x + fc.y * 113.1 + stepB * 17.0 + seed * 101.7);
    float ng = hash11(fc.x + fc.y * 113.1 + stepB * 19.0 + seed * 107.3);
    float nb = hash11(fc.x + fc.y * 113.1 + stepB * 23.0 + seed * 109.1);
    vec3 wn = vec3(nr, ng, nb);
    // mix color noise with original
    return clamp(mix(col, wn, 0.3 * k), 0.0, 1.0);
  }

  // -----------------------
  // Mode 4: LENS BLUR (強弱のついたレンズぼかし)
  // -----------------------
  if (glitchMode == 4){
    vec2 center = resolution * 0.5;
    vec2 toCenter = fc - center;
    float dist = length(toCenter);
    float maxDist = length(resolution * 0.5);
    float distNorm = clamp(dist / max(maxDist, 1.0), 0.0, 1.0);
    
    // 中心から外側にかけて指数関数的にぼかしを強く
    float blurStrength = pow(distNorm, 2.5) * k;
    
    // ビートに合わせてパルス
    float beatPulse = 0.5 + 0.5 * sin(b * TAU);
    blurStrength *= (0.6 + 0.4 * beatPulse);
    
    // レンズ歪み効果（簡易版）
    float distortAmt = blurStrength * 0.08;
    vec2 dir = (length(toCenter) > 0.1) ? normalize(toCenter) : vec2(0.0);
    float distortion = distNorm * distNorm * distortAmt;
    
    // 色収差（RGB分離）
    vec3 aberration = col;
    float chromaAmt = blurStrength * 12.0;
    
    // 簡易的な色収差（ピクセルシフト）
    aberration.r = col.r * (1.0 - blurStrength * 0.1);
    aberration.g = col.g;
    aberration.b = col.b * (1.0 + blurStrength * 0.1);
    
    // ビネット効果（周辺減光）
    float vignette = 1.0 - pow(distNorm, 3.0) * blurStrength * 0.6;
    aberration *= vignette;
    
    // 歪みとぼかしをミックス
    vec3 result = mix(col, aberration, clamp(blurStrength * 2.0, 0.0, 1.0));
    
    return clamp(result, 0.0, 1.0);
  }

  return col;
}

// =====================================================
// main（短縮禁止：元の流れを維持）
// =====================================================
void main(){
  float bt = getBeat();

  

  // =========================
  // 1) 背景は常に生成する
  // =========================
  vec2 bgFC = gl_FragCoord.xy;
  
  // カットアップグリッチ用のFC座標変更（背景にも適用）
  if(glitchMode == 1 && glitchAmt > 0.0){
    float b = glitchBeat;
    float stepB = floor(b * 16.0);
    float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
    
    // ビート同期
    float beatPhase = fract(b);
    float beatActive = step(beatPhase, 0.25);
    float beatCurve = sin(min(beatPhase / 0.25, 1.0) * PI);
    
    float k = clamp(glitchAmt, 0.0, 1.0);
    float globalTrigger = step(0.3, seed) * beatActive * k;
    
    if(globalTrigger > 0.001){
      vec2 screenUV = bgFC / resolution;
      
      // 極端なスライス高さ（2px〜600px、6乗）
      float sliceRandom = hash11(seed * 3.7);
      float sliceHeightPx = 2.0 + pow(sliceRandom, 6.0) * 598.0;
      
      float pixelY = bgFC.y;
      float sid = floor(pixelY / sliceHeightPx);
      float r1 = hash11(sid * 13.37 + seed * 91.7);
      
      // 極端な選択性（7乗）
      float intensity = pow(r1, 7.0);
      float shouldGlitch = step(0.8, r1);
      
      if(shouldGlitch > 0.5){
        // 極端なシフト量（5乗）
        float shiftBase = pow(hash11(sid * 7.31 + seed * 19.1), 5.0);
        float shiftAmt = (shiftBase - 0.5) * 3.0 * intensity * beatCurve;
        float shiftAmt2 = (pow(hash11(sid * 29.3 + seed * 3.7), 3.0) - 0.5) * 0.8 * intensity;
        float beatShift = sin(b * TAU) * 0.3 * intensity * beatCurve;
        float randomShift = (pow(hash11(sid * 17.3 + seed * 5.3), 4.0) - 0.5) * 1.2 * intensity;
        
        float totalShift = globalTrigger * (shiftAmt + shiftAmt2 + beatShift + randomShift);
        
        // bgFCのX座標をシフト
        bgFC.x = mod(bgFC.x + totalShift * resolution.x, resolution.x);
      }
    }
  }
  
  // glitchMode=3,4,5用のFC座標変更（背景にも適用）
  if((glitchMode == 3 || glitchMode == 4 || glitchMode == 5) && glitchAmt > 0.0){
    vec2 screenUV = bgFC / resolution;
    vec2 transformedUV = applyGlitchUV_Multi(screenUV, bgFC);
    bgFC = transformedUV * resolution;
  }
  
  // FREEズームはsketch.jsでbgZoomに統合されるため、ここでは削除
  // （各背景関数がbgZoomとbgCamPxを直接参照）

  vec3 bg = getBackground(bgFC);

  // 背景の“呼吸”
  float cb = colorBeat(bt);
  bg = mix(bg, palPick(fract(cb * 0.05)), 0.06);

  // =========================
  // 2) showVisual 無効 → 背景のみ（キービジュアルなし）
  // =========================
  if(showVisual == 0){
    vec3 finalBg = applyPaletteAll(bg, gl_FragCoord.xy);
    finalBg = applyGlitchAll(finalBg, gl_FragCoord.xy);
    
    // INVERT（独立して重ねがけ可能）
    if(invertPalette != 0){
      finalBg = vec3(1.0) - finalBg;
    }
    
    gl_FragColor = vec4(finalBg, 1.0);
    return;
  }

  // =========================
  // 3) tex0（漫画・映像）
  // =========================
  vec2 uv = uvCover(vTexCoord, resolution, texSize);
  if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
    vec3 finalBg = applyPaletteAll(bg, gl_FragCoord.xy);
    finalBg = applyGlitchAll(finalBg, gl_FragCoord.xy);
    
    // INVERT（独立して重ねがけ可能）
    if(invertPalette != 0){
      finalBg = vec3(1.0) - finalBg;
    }
    gl_FragColor = vec4(finalBg, 1.0);
    return;
  }

  // カットアップグリッチ用のUV変更を適用
  uv = applyGlitchUV(uv, gl_FragCoord.xy);
  
  // その他のglitchMode用のUV変更を適用
  uv = applyGlitchUV_Multi(uv, gl_FragCoord.xy);

  vec3 src = texture2D(tex0, uv).rgb;

  // =========================
  // マゼンタキー
  // =========================
  float rb = min(src.r, src.b);
  float magHard = step(keyRBMin, rb) * (1.0 - step(keyGMax, src.g));
  float magSoft = sstep(keyRBMin - keySoft, keyRBMin + keySoft, rb)
                * (1.0 - sstep(keyGMax - keySoft, keyGMax + keySoft, src.g));
  float mag = max(magHard, magSoft);
  float paperMask = 1.0 - mag;

  // =========================
  // 紙
  // =========================
  vec3 paper = mix(bg, vec3(1.0), paperMask);
  paper = mix(paper, bg, 0.08);

  // =========================
  // 線画
  // =========================
  float luma = dot(src, vec3(0.299, 0.587, 0.114));
  float ink = 1.0 - smoothstep(0.65, 0.95, luma);
  ink = pow(clamp(ink, 0.0, 1.0), baseInkGamma);
  ink = clamp(ink * baseInkGain, 0.0, 1.0);
  float inkVis = ink * paperMask;

  float flash = isFree()
    ? (0.5 + 0.5 * sin(bt * 0.65)) * flashAmt * 0.35
    : pow(1.0 - fract(bt), max(1.0, flashPow)) * flashAmt;

  vec3 baseCol = mix(
    paper,
    baseInkColor,
    clamp(inkVis * inkOpacity * (1.0 + flashInk * flash), 0.0, 1.0)
  );

  // =========================
  // リング（既存）
  // =========================
  vec2 n = gl_FragCoord.xy / resolution.xy;
  vec2 p = n - centerN;
  p.x *= resolution.x / resolution.y;

  float r  = length(p);
  float an = (atan(p.y, p.x) + PI) / TAU;

  float rf = r * ringDensity;
  float d0 = abs(fract(rf) - 0.5);
  float ringId = floor(rf);

  float alive = isFree()
    ? smoothstep(1.0 - appearRate - 0.18, 1.0 - appearRate + 0.18,
                 hash21(vec2(ringId * 1.7, floor(bt) * 2.3)))
    : step(1.0 - appearRate,
           hash21(vec2(ringId * 1.7, floor(bt) * 2.3)));

  float phaseR = fract(bt * mix(0.65, 1.85, hash21(vec2(ringId, 12.34))));
  float arc = smoothstep(arcWidth, 0.0,
              abs(wrapDelta(an,
                fract(hash21(vec2(ringId, 3.7)) + sweepDir * easeOutQuint(phaseR)))));

  float ringLine = smoothstep(lineW * mix(5.0, 20.0, hash21(vec2(ringId))),
                              0.0, d0);

  float aLine = clamp(
    sqrt(ringLine * arc * alive * inkVis)
    * colorLineOpacity * (1.0 + flash),
    0.0, 1.0
  );
  
  // overlayOn が 0 ならリングを合成しない
  if(overlayOn == 0){
    aLine = 0.0;
  }

  vec3 ringCol = saturateColor(
    palPick(fract(hueBase + ringId * hueSpread + cb * 0.15)),
    RING_SAT
  ) * RING_BRI;

  vec3 outCol = (paletteMode == 0)
    ? mix(baseCol, ringCol, aLine)
    : mix(baseCol, 1.0 - (1.0 - baseCol) * (1.0 - ringCol), aLine);

  vec3 finalCol = applyPaletteAll(outCol, gl_FragCoord.xy);
  finalCol = applyGlitchAll(finalCol, gl_FragCoord.xy);
  
  // INVERT（独立して重ねがけ可能）
  if(invertPalette != 0){
    finalCol = vec3(1.0) - finalCol;
  }
  
  gl_FragColor = vec4(finalCol, 1.0);
}