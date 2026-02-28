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

// 背景 "止まる拍" の確率
const float HOLD_PROB = 0.18;

// ===== FREE motion tuning =====
const float FREE_HOVER_GAIN = 12.0;
const float FREE_DRIFT_GAIN = 0.10;
const float FREE_ZOOM_AMP   = 0.50;
const float FREE_ZOOM_RATE  = 0.10;

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
// smooth random helpers
// =====================================================
float smooth01(float x){
  return x*x*(3.0-2.0*x);
}

float vnoise1(float t, float salt){
  float i = floor(t);
  float f = fract(t);
  float e = smooth01(f);
  float a = hash21(vec2(i, salt));
  float b = hash21(vec2(i + 1.0, salt));
  return mix(a, b, e);
}

float fbm1(float t, float salt){
  float n = 0.0;
  float amp = 0.55;
  float frq = 0.22;
  for(int k=0;k<4;k++){
    n += (vnoise1(t*frq, salt + float(k)*19.7) - 0.5) * 2.0 * amp;
    amp *= 0.55;
    frq *= 2.05;
  }
  return n;
}

float freeSeed(float bt, float rate, float salt){
  float t = bt * rate;
  return vnoise1(t, salt);
}

// =====================================================
// FREE zoom
// =====================================================
float freeZoom(float bt, float salt){
  float z = vnoise1(bt * FREE_ZOOM_RATE, salt + 900.1);
  z = (z - 0.5) * 2.0;
  z = z * (0.85 + 0.15 * vnoise1(bt * (FREE_ZOOM_RATE * 2.0), salt + 901.7));
  return 1.0 + z * FREE_ZOOM_AMP;
}

// =====================================================
// DRAW mode random camera
// =====================================================
vec2 drawRandomCam(float bt, float salt){
  float blk = floor(bt);
  float rx = hash21(vec2(blk, salt + 100.0));
  float ry = hash21(vec2(blk, salt + 200.0));
  vec2 range = resolution * 0.0025;
  vec2 offset = vec2((rx - 0.5) * 3.0 * range.x, (ry - 0.5) * 3.0 * range.y);
  return bgCamPx + offset;
}

float drawRandomZoom(float bt, float salt){
  float blk = floor(bt);
  float rz = hash21(vec2(blk, salt + 300.0));
  return mix(1.5, 2.0, rz);
}

float drawRandomAngle(float bt, float salt){
  float blk = floor(bt);
  float ra = hash21(vec2(blk, salt + 400.0));
  float angleRange = 15.0 * PI / 180.0;
  return (ra - 0.5) * 2.0 * angleRange;
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

float freeDriftWeight(float bt, float salt){
  float v = vnoise1(bt * 0.06, salt + 77.7);
  return smoothstep(0.90, 1.00, v);
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
    float w = freeDriftWeight(bt, salt);
    vec2 dir = freeDriftDir(bt, salt);
    float spd = baseScale * FREE_DRIFT_GAIN * (bpm / 120.0);
    float driftVal = (dir.x + dir.y) * bt * spd;
    vec2 hv = freeHoverVec(bt, salt);
    float slow = fbm1(bt * 0.05, salt + 100.0);
    float mid  = hv.x + hv.y;
    float hoverVal = (slow * 1.4 + mid * 0.6) * baseScale * FREE_HOVER_GAIN;
    return mix(hoverVal, driftVal, w);
  }
  MoveRand m = moveRand(bt, salt);
  float blk = floor(bt);
  float ph  = fract(bt);
  float e   = easeOutQuint(ph);
  float adv = mix(e * m.speed, 0.0, m.hold);
  return (blk + adv) * m.dir * m.dist * baseScale;
}

// =====================================================
// DRONE mode seamless camera
// =====================================================
vec2 droneSeamlessCam(float bt, float salt){
  float drift = 0.12;
  float tx = randomMoveTime(bt, TAU * 0.08, salt + 100.0);
  float ty = randomMoveTime(bt, TAU * 0.06, salt + 200.0);
  vec2 offset = vec2(tx, ty) * resolution.y * 0.1 * drift;
  return bgCamPx + offset;
}

float droneSeamlessZoom(float bt, float salt){
  float drift = 0.12;
  float z = vnoise1(bt * FREE_ZOOM_RATE, salt + 500.0);
  z = (z - 0.5) * 2.0;
  z = z * (0.85 + 0.15 * vnoise1(bt * (FREE_ZOOM_RATE * 2.0), salt + 501.0));
  return 1.0 + z * (FREE_ZOOM_AMP * 0.5) * drift;
}

float droneSeamlessAngle(float bt, float salt){
  float drift = 0.12;
  float a = vnoise1(bt * 0.08, salt + 600.0);
  a = (a - 0.5) * 2.0;
  float angleRange = 10.0 * PI / 180.0;
  return a * angleRange * drift;
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
    seed = freeSeed(bt, 0.07, 777.1);
  }else{
    seed = hash21(vec2(blk, blk * 7.1));
  }
  float t = randomMoveTime(bt, TAU * (0.18 + 0.10 * seed), 101.0) + seed * 6.0;
  vec2 p = (fc - 0.5 * resolution.xy) / ZOOM / bgZoom;
  p.x *= resolution.x / resolution.y;
  vec2 panUV = bgCamPx / resolution.y * 5.0;
  p = p + panUV;
  vec2 off = vec2(1.0);
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

// 1) bg_meguru
#define BN_DST 45.0
#define BN_ITR 45
#define BN_SRF 0.2546263
#define BN_PI  acos(-1.0)
#define BN_RT(X) mat2(cos(X), sin(X), -sin(X), cos(X))

float bn_t = 0.0;

float bn_hash11(float x){
  return fract(sin(x * 127.1) * 43758.5453123);
}

vec3 bn_cosineGradient(float tt, vec3 a, vec3 b, vec3 c, vec3 d){
  return a + b * cos(6.28318 * (c * tt + d));
}

float bn_box(vec3 sp, vec3 d){
  sp = abs(sp) - d;
  return max(max(sp.x, sp.y), sp.z);
}

float bn_k3d(vec3 sp, vec3 d, vec3 dm, float s, vec3 r){
  float sc  = 1.0;
  float sdf = BN_DST;
  for(int i=0;i<2;i++){
    sp = abs(sp) - d;
    sp.xy *= BN_RT(r.x);
    sp.zy *= BN_RT(r.y);
    sp.zy *= BN_RT(r.z);
    sdf = min(sdf, bn_box(sp, dm) / sc);
    sp *= sc;
    sc *= s;
  }
  return sdf;
}

vec2 bn_map(vec3 sp){
  sp.zy *= BN_RT(sp.x * 0.2 + bn_t);
  sp.xy *= BN_RT(sp.z * 0.05 + bn_t);
  float dst0 = bn_k3d(sp, vec3(7.0, 5.0, 3.0), vec3(5.0, 0.7, 0.7), 1.7, vec3(2.0, 3.0, 2.0));
  return vec2(dst0, 0.0);
}

vec3 bn_mrch(vec3 ro, vec3 rd){
  float d0 = 0.0;
  float id = 0.0;
  float it = 0.0;
  for(int i=0;i<BN_ITR;i++){
    it = float(i);
    vec3 sp = ro + rd * d0;
    vec2 ds = bn_map(sp);
    if(abs(ds.x) < BN_SRF || d0 > BN_DST){
      if(abs(ds.x) < BN_SRF){ d0 = 0.0; }else{ break; }
    }
    d0 += ds.x;
    id  = ds.y;
  }
  if(d0 > BN_DST) d0 = 0.0;
  return vec3(d0, id, it);
}

float vnoise2(vec2 p, float salt){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  vec2 s = vec2(salt, salt*1.37);
  float a = hash21(i + vec2(0.0,0.0) + s);
  float b = hash21(i + vec2(1.0,0.0) + s);
  float c = hash21(i + vec2(0.0,1.0) + s);
  float d = hash21(i + vec2(1.0,1.0) + s);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm2(vec2 p, float salt){
  float n = 0.0;
  float a = 0.55;
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  for(int i=0;i<5;i++){
    n += a * vnoise2(p, salt + float(i)*19.7);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return n;
}

vec3 bg_meguru(vec2 fc){
  float bt = getBeat();
  bool freeModeActive = isFree();
  float b = floor(bt);
  float j = freeModeActive ? 0.0 : bn_hash11(b);
  vec2 camPx;
  float zoom;
  float angle;
  float tm;
  if(freeModeActive){
    camPx = droneSeamlessCam(bt, 777.0);
    zoom = droneSeamlessZoom(bt, 888.0) * bgZoom;
    angle = droneSeamlessAngle(bt, 999.0);
    tm = bt * 1.20 + sin(bt * 0.35) * 0.8 + sin(bt * 0.11) * 1.6;
  } else {
    camPx = drawRandomCam(bt, 777.0);
    zoom = drawRandomZoom(bt, 888.0) * bgZoom;
    angle = drawRandomAngle(bt, 999.0);
    tm = bt;
  }
  vec2 uv = (fc - 0.5 * resolution) / (resolution.y * zoom);
  float cosA = cos(angle);
  float sinA = sin(angle);
  uv = vec2(cosA * uv.x - sinA * uv.y, sinA * uv.x + cosA * uv.y);
  uv += camPx / resolution.y * 5.0;
  uv.x *= 0.5;
  float beatKick = freeModeActive ? 0.0 : (j * 10.0);
  bn_t = mod((tm * 0.05) + beatKick, BN_PI * 30.0);
  vec3 ro = vec3(0.5, 0.0, -20.0);
  vec3 w = normalize(-ro);
  vec3 u = normalize(cross(w, vec3(0.0, 1.0, 0.0)));
  vec3 v = cross(u, w);
  vec3 rd = normalize(mat3(u, v, w) * vec3(uv, 0.5));
  float uvLen = length(uv);
  vec3 bgc = vec3(1.0 - (uvLen - 1.0)) * 0.001;
  vec3 amb = bgc * 0.1;
  vec3 ds = bn_mrch(ro, rd);
  float d0 = ds.x;
  if(d0 <= 0.0) return vec3(0.73, 0.77, 0.80);
  vec3 sp = ro + rd * d0;
  float paletteTime = bt * 0.05;
  float paletteBlock = floor(paletteTime);
  float paletteFract = fract(paletteTime);
  float paletteMix = paletteFract * paletteFract * (3.0 - 2.0 * paletteFract);
  float seed1 = paletteBlock;
  float seed2 = paletteBlock + 1.0;
  vec3 a1 = vec3(hash21(vec2(seed1,1.0))*0.3+0.4, hash21(vec2(seed1,2.0))*0.3+0.4, hash21(vec2(seed1,3.0))*0.3+0.4);
  vec3 a2 = vec3(hash21(vec2(seed2,1.0))*0.3+0.4, hash21(vec2(seed2,2.0))*0.3+0.4, hash21(vec2(seed2,3.0))*0.3+0.4);
  vec3 b1 = vec3(hash21(vec2(seed1,4.0))*0.4+0.3, hash21(vec2(seed1,5.0))*0.4+0.3, hash21(vec2(seed1,6.0))*0.4+0.3);
  vec3 b2 = vec3(hash21(vec2(seed2,4.0))*0.4+0.3, hash21(vec2(seed2,5.0))*0.4+0.3, hash21(vec2(seed2,6.0))*0.4+0.3);
  vec3 c1 = vec3(hash21(vec2(seed1,7.0))*0.4+0.8, hash21(vec2(seed1,8.0))*0.4+0.8, hash21(vec2(seed1,9.0))*0.4+0.8);
  vec3 c2 = vec3(hash21(vec2(seed2,7.0))*0.4+0.8, hash21(vec2(seed2,8.0))*0.4+0.8, hash21(vec2(seed2,9.0))*0.4+0.8);
  vec3 d1 = vec3(hash21(vec2(seed1,10.0)), hash21(vec2(seed1,11.0)), hash21(vec2(seed1,12.0)));
  vec3 d2 = vec3(hash21(vec2(seed2,10.0)), hash21(vec2(seed2,11.0)), hash21(vec2(seed2,12.0)));
  vec3 a = mix(a1, a2, paletteMix);
  vec3 b0 = mix(b1, b2, paletteMix);
  vec3 c = mix(c1, c2, paletteMix);
  vec3 d = mix(d1, d2, paletteMix);
  float phase = freeModeActive ? (tm * 0.005) : (bt * 0.05 + j * 1.5);
  float spatialGrad = dot(sp, vec3(0.030, 0.024, 0.040));
  float colorParam = spatialGrad + d0 * 0.024 + bn_t * 0.08 + phase;
  vec3 palette = bn_cosineGradient(colorParam, a, b0, c, d);
  vec3 rainbow_fcl = palette / (d0 * 0.005 + 0.05);
  return amb + clamp(rainbow_fcl, 0.0, 10.0) * 0.15 - 0.35;
}

// 2) 7sKSDd
vec3 bg_7sKSDd(vec2 fc){
  float bt = getBeat();
  float tx = randomMoveTime(bt, TAU * 0.08, 201.0);
  float ty = randomMoveTime(bt, TAU * 0.06, 202.0);
  vec3 col = vec3(0.0);
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
      uv = -fract(uv / (2.0 - abs((uv.x - uv.y) / 16.0)) - (uv / (2.5 + fract(uv.x + uv.y))) / scale) * scale / scale1 + s1;
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
      uv = -fract(uv / (2.0 - abs((uv.x - uv.y) / 16.0)) - (uv / (2.5 + fract(uv.x + uv.y))) / scale) * scale / scale1 + s1;
      uv /= scale1 + col.yx;
      uv = uv.yx + col.xy;
      uv.x *= -(1.0 + col.x / scale);
      col[c] = fract((0.25 * col[c] + col.x + uv.y - uv.x) / 2.5);
    }
  }
  return col;
}

// =====================================================
// 5) bg_NdsSzl（元のfract版・復元）
// =====================================================
vec3 bg_NdsSzl(vec2 fc){
  float bt = getBeat();
  const int ITERS = 12;
  float t  = randomMoveTime(bt, TAU * 0.06, 501.0);
  float tx = randomMoveTime(bt, TAU * 0.05, 502.0);

  vec3 col = vec3(0.0), col_prev = vec3(0.0);
  vec2 uv = (fc * 10.0 - resolution.xy) / resolution.y / 10.0;
  uv.x += tx * 0.20;
  uv.y += t  * 0.20;

  for(int c=0;c<ITERS;c++){
    float scale = 2.48;
    float scale1 = 1.045;
    col_prev = col;

    for(int i=0;i<ITERS;i++){
      uv = fract(-uv.yx / (scale1 * scale)) * scale;
      uv.x *= scale1;
      uv = fract(
             uv + vec2(uv.x/scale - uv.y/scale1,
                       uv.y/scale - uv.x/scale1) / scale
           ) / scale1;
      uv.y /= -scale1;
    }

    col.b = abs(fract(uv.y) - fract(uv.x));
    col = (col + col_prev.yzx) / 2.125;
  }

  return clamp(col * 3.0, 0.0, 1.0);
}

// =====================================================
// 4用) bg_sinFBM  ★流体版★
//    curl noise 近似でUVを歪め、流体のような渦巻き動作
// =====================================================
vec3 bg_sinFBM(vec2 fc){
  float bt = getBeat();

  // 時間：連続で流れるように
  float t = time * (bpm / 120.0) * 0.3;

  // UV: zoom + pan
  vec2 I = 4.0 * (fc + fc - resolution.xy) / resolution.y / bgZoom;
  I += bgCamPx / resolution.y * 8.0;

  // DRONE: 緩やかに浮遊、BEAT: 拍ごとにジャンプ
  if(isFree()){
    float slow = bt * 0.08;
    I += vec2(fbm1(slow, 41.3), fbm1(slow, 82.7)) * 12.0;
  } else {
    float blk = floor(bt);
    I += vec2(hash21(vec2(blk,13.7)), hash21(vec2(blk,71.3))) * 20.0 - 10.0;
  }

  // 流体的UV歪み（curl場近似）
  vec2 q = vec2(
    sin(I.x * 0.7 + t * 0.4) + sin(I.y * 0.5 - t * 0.3),
    sin(I.y * 0.7 - t * 0.4) + sin(I.x * 0.5 + t * 0.3)
  );
  vec2 r = vec2(
    sin(I.x * 1.3 + q.y * 1.2 + t * 0.7) + sin(I.y * 0.9 + q.x * 0.8 - t * 0.5),
    sin(I.y * 1.3 - q.x * 1.2 + t * 0.7) + sin(I.x * 0.9 - q.y * 0.8 + t * 0.5)
  );
  I += r * 1.4;

  // 元の3パス sin fBm
  vec4 O = vec4(0.0);

  for(int ni = 1; ni <= 7; ni++){
    float n = float(ni);
    I += 1.6 * sin(I.yx * n + t * n) / n;
  }
  O += 1.0 + sin(I.x * 0.8 + 2.0 * vec4(0.0, 1.0, 2.0, 0.0));

  for(int ni = 1; ni <= 7; ni++){
    float n = float(ni);
    I += 1.6 * sin(I.yx * n + t * n) / n;
  }
  O += 1.0 + sin(I.x * 0.8 + 1.0 * vec4(0.0, 1.0, 2.0, 0.0));

  for(int ni = 1; ni <= 7; ni++){
    float n = float(ni);
    I += 1.6 * sin(I.yx * n + t * n) / n;
  }
  O += 1.0 + sin(I.x * 0.8 + 1.0 * vec4(0.0, 1.0, 2.0, 0.0));

  O /= 6.0;
  return clamp(O.rgb, 0.0, 1.0);
}

// 6) sin/fract
vec3 bg_newSinFract(vec2 fc){
  float bt = getBeat();
  const int ITERS = 12;
  float t = randomMoveTime(bt, TAU / 16.0, 601.0);
  vec3 col = vec3(0.0), col_prev = vec3(0.0);
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
      uv = -fract(uv + vec2(uv.x/scale - uv.y/scale1, uv.y/scale - uv.x/scale1) / scale) * scale / scale1;
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
    vec2 uv = (fc * 10.0 - resolution.xy) / resolution.y / 10.0 / bgZoom;
    vec2 panUV = bgCamPx / resolution.y * 5.0;
    uv = uv + panUV;
    uv += vec2(tUVx, tUVy) / 10.0;
    float t = tBase + float(c) / 10.0;
    float scale  = 5.0;
    float scale1 = 1.4;
    for(int i=0;i<20;i++){
      float tt = t * 0.5;
      uv = cos(uv / (2.0 + sin((uv.x + uv.y) / 10.0)) - (uv.yx / (2.0 + sin(fract(tt + uv.x + uv.y)))) / scale) * scale / 1.5 + scale1 * scale;
      uv /= scale1;
      uv = uv.yx + col.xy;
    }
    col[c] = fract(uv.x - uv.y);
  }
  return clamp(col, 0.0, 1.0);
}

vec3 bg_inkelly(vec2 fc){
  float bt = getBeat();
  float ph = isFree() ? fract(bt * 0.25) : fract(bt);
  float ease = easeOutQuint(ph);
  vec2 uv = fc / resolution;
  vec2 uvm = uvCover(uv, resolution, texSize);
  float mask = 0.0;
  if(uvm.x>=0.0 && uvm.x<=1.0 && uvm.y>=0.0 && uvm.y<=1.0){
    mask = texture2D(tex1, uvm).r;
    mask = smoothstep(0.2, 0.8, mask);
  }
  float m = texture2D(bgExtra, uv).r * mask;
  float th = isFree() ? (0.50 + 0.06 * sin(bt * 0.80)) : mix(0.42, 0.58, ease);
  vec2 px = vec2(1.0 / resolution.x, 1.0 / resolution.y);
  float mR = texture2D(bgExtra, uv + vec2(px.x, 0.0)).r * mask;
  float mL = texture2D(bgExtra, uv - vec2(px.x, 0.0)).r * mask;
  float mU = texture2D(bgExtra, uv + vec2(0.0, px.y)).r * mask;
  float mD = texture2D(bgExtra, uv - vec2(0.0, px.y)).r * mask;
  m = smoothstep(th - 0.008, th + 0.008, m);
  float edge = abs(mR - mL) + abs(mU - mD);
  edge = pow(edge, 0.65);
  edge *= mix(2.8, 3.0, ease);
  edge = max(edge - 0.5, 0.0);
  float ink = step(0.03, edge);
  vec3 paper = vec3(0.91, 0.94, 0.91);
  vec3 inkCol = vec3(0.02);
  vec3 col = paper;
  col = mix(col, inkCol, ink);
  return col;
}

// =====================================================
// bgMode=9 : panel collage
// =====================================================
vec3 bg_photo(vec2 fc){
  float z = max(0.001, bgZoom);
  vec2 view = (fc - 0.5 * resolution) / z;
  vec2 p = 0.5 * bgPhotoSize + bgCamPx + view;
  vec2 uv = clamp(p / max(bgPhotoSize, vec2(1.0)), vec2(0.0), vec2(1.0));
  return texture2D(bgPhoto, uv).rgb;
}

// Manga helpers
float manga_rand(float n){return fract(cos(n*89.42)*343.42);}

float manga_nz(vec2 nv, float t){
    float o = 0.0;
    float i = 0.2;
    for(int iter = 0; iter < 7; iter++){
        o += abs(dot(sin(nv * i * 64.0), vec2(0.05))) / i;
        i = i * 1.4142;
    }
    return mix(o, distance(vec2(0.0), nv), 0.5 + (sin(t)/2.0));
}

float manga_rMix(float a, float b, float s){
    s = manga_rand(s);
    if(s>0.9) return sin(a);
    if(s>0.8) return sqrt(abs(a));
    if(s>0.7) return a+b;
    if(s>0.6) return a-b;
    if(s>0.5) return b-a;
    if(s>0.4) return manga_nz(vec2(a,b), time);
    if(s>0.3) return b/(a==0.0?0.01:a);
    if(s>0.2) return a/(b==0.0?0.01:b);
    if(s>0.1) return a*b;
    return cos(a);
}

vec3 manga_hsl2rgb(in vec3 c){
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

vec3 manga_gpc(float t) {
    return 0.5 + 0.5*cos(vec3(0.0,2.0,4.0) + t*2.0);
}

vec3 manga_contrast(vec3 color, float value) {
    return 0.5 + value * (color - 0.5);
}

vec3 manga_addColor(float num, float seed, float alt, int PALETTE){
    if(abs(num) > 1000000.0){num = alt * seed;}
    if(PALETTE == 7){ return manga_contrast(manga_gpc(num), 1.7); }
    else if(PALETTE > 2 || (PALETTE == 1 && manga_rand(seed+19.0)>0.3)){
        float sat = 1.0;
        if(num<0.0){sat = 1.0-(1.0/(abs(num)+1.0));}
        float light = 1.0-(1.0/(abs(num)+1.0));
        vec3 col = manga_hsl2rgb(vec3(fract(abs(num)), sat, light));
        if(PALETTE == 1){col = col * 2.0;}
        return col;
    } else {
        vec3 col = vec3(fract(abs(num)), 1.0/num, 1.0-fract(abs(num)));
        if(manga_rand(seed*2.0)>0.5){col = col.gbr;}
        if(manga_rand(seed*3.0)>0.5){col = col.gbr;}
        if(PALETTE == 1){col = col + (1.0+cos(manga_rand(num)+vec3(4.0,2.0,1.0))) / 2.0;}
        return col;
    }
}

vec3 manga_sanitize(vec3 dc){
    dc.r = min(1.0, dc.r);
    dc.g = min(1.0, dc.g);
    dc.b = min(1.0, dc.b);
    bool badR = !(dc.r>=0.0) && !(dc.r<0.0);
    bool badG = !(dc.g>=0.0) && !(dc.g<0.0);
    bool badB = !(dc.b>=0.0) && !(dc.b<0.0);
    if(badR || badG || badB){ return vec3(1.0,0.0,0.0); }
    return dc;
}

vec3 manga_mainAgg(vec2 uv, float seed, float t){
    uv.x -= 0.5 * resolution.x / resolution.y;
    uv.y -= 0.5;
    float zoom = 4.0 + (3.0*(sin(t/1.5)+1.0));
    vec2 guv = uv * zoom;
    float x = guv.x;
    float y = guv.y;
    float o = manga_nz(guv, t);
    int PALETTE = int(floor(8.0*manga_rand(seed+66.0)));
    vec3 col = vec3(0.0);
    float cn = 1.0;
    float v0=1.0,v1=10.0,v2=x,v3=y,v4=x*x,v5=y*y,v6=x*x*x,v7=y*y*y;
    float v8=x*x*x*x,v9=y*y*y*y,v10=x*y*x,v11=y*y*x,v12=sin(y),v13=cos(y);
    float v14=sin(x),v15=cos(x),v16=sin(y)*sin(y),v17=cos(y)*cos(y),v18=2.0;
    float v19=distance(vec2(x,y),vec2(0.0)),v20=3.14159,v21=atan(y,x)*4.0;
    float v22=o,v23=distance(vec2(x,y),vec2(0.0))*sin(atan(y,x));
    float total = 0.0, sub = 0.0;
    for(int i = 0; i < 12; i++){
        float val1=v2; if(i==1)val1=v3; if(i==2)val1=v4; if(i==3)val1=v5;
        if(i==4)val1=v12; if(i==5)val1=v13; if(i==6)val1=v14; if(i==7)val1=v15;
        if(i==8)val1=v19; if(i==9)val1=v21; if(i==10)val1=v22; if(i==11)val1=v23;
        float val2=v3; if(i==1)val2=v4; if(i==2)val2=v5; if(i==3)val2=v6;
        if(i==4)val2=v13; if(i==5)val2=v14; if(i==6)val2=v15; if(i==7)val2=v16;
        if(i==8)val2=v20; if(i==9)val2=v22; if(i==10)val2=v23; if(i==11)val2=v19;
        val1=val1*(sin(t*manga_rand(seed+float(i)))*manga_rand(seed+float(i)));
        val2=val2*(sin(t*manga_rand(seed+float(i+5)))*manga_rand(seed+float(i+5)));
        if(manga_rand(seed+float(i+3))>manga_rand(seed)){
            sub=(sub==0.0)?manga_rMix(val1,val2,seed+float(i+4)):manga_rMix(sub,manga_rMix(val1,val2,seed+float(i+4)),seed+float(i));
        }else{
            sub=(sub==0.0)?val1:manga_rMix(sub,val1,seed+float(i));
        }
        if(abs(sub)<1.0){seed+=100.0;PALETTE=int(floor(8.0*manga_rand(seed+66.0)));}
        if(manga_rand(seed+float(i))>manga_rand(seed)/2.0){
            total=(total==0.0)?sub:manga_rMix(total,sub,seed+float(i*2));
            sub=0.0;
            col+=manga_addColor(total,seed+float(i),v21,PALETTE);
            cn+=1.0;
        }
    }
    total=(sub==0.0)?total:manga_rMix(total,sub,seed);
    col+=manga_addColor(total,seed,v21,PALETTE);
    col/=cn;
    if(PALETTE<3){col/=(3.0*(0.5+manga_rand(seed+13.0)));}
    if(PALETTE==4){col=pow(col,1.0/col)*1.5;}
    if(PALETTE==2||PALETTE==5){col=manga_hsl2rgb(col);}
    if(PALETTE==6){col=manga_hsl2rgb(manga_hsl2rgb(col)); if(manga_rand(seed+17.0)>0.5){col=col.gbr;} if(manga_rand(seed+19.0)>0.5){col=col.gbr;}}
    col=manga_sanitize(col);
    return col;
}

mat2 manga_rot2D(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}

float manga_halftone(vec2 uv, float brightness, float dotSize, float angle){
    mat2 rot=manga_rot2D(angle);
    vec2 rotUV=rot*uv*dotSize;
    vec2 cellUV=fract(rotUV)-0.5;
    float radius=0.45*(1.0-brightness);
    return smoothstep(radius-0.02,radius,length(cellUV));
}

vec3 manga_mangaHalftone(vec2 uv, vec3 col){
    float gray=dot(col,vec3(0.299,0.587,0.114));
    return col*manga_halftone(uv,gray,80.0,0.0);
}

float manga_hash_f(float x){return fract(sin(x*12.9898)*43758.5453);}
float manga_hash2_f(vec2 v){return manga_hash_f(v.x+manga_hash_f(v.y));}
float manga_hash3_f(vec3 v){return manga_hash_f(v.x+manga_hash_f(v.y+manga_hash_f(v.z)));}
float manga_gSeed_f;
void manga_initSeed(vec2 v){manga_gSeed_f=manga_hash2_f(v);}
void manga_initSeed3(vec3 v){manga_gSeed_f=manga_hash3_f(v);}
float manga_random(){manga_gSeed_f=manga_hash_f(manga_gSeed_f+0.1);return fract(manga_gSeed_f);}
float manga_easeOutQuint(float t){return 1.0-pow(1.0-t,5.0);}

// ---- manga panel layout (GLSL ES 1.00 compatible) ----
// 配列・動的インデックス不使用。コマUVをシードから決定論的に計算する
// コマのUV rect (x,y,w,h) をシードから再現性よく計算するヘルパー
// splits: 1,2,3  idx: 0〜splits-1
// 戻り値: vec2(y開始, 高さ) in UV
vec2 manga_rowBand(float idx, float splits, float seed0){
    // splits個のバンドをランダム比率で分割
    // 各バンドの比率を計算（正規化済み）
    float r0 = mix(0.25,0.55, manga_hash_f(seed0 + 0.0));
    float r1 = mix(0.25,0.55, manga_hash_f(seed0 + 1.0));
    float r2 = mix(0.25,0.55, manga_hash_f(seed0 + 2.0));
    // 使用するバンド数に合わせて正規化
    float y0, h0, y1, h1, y2, h2;
    if(splits < 1.5){
        // 1段: 全体
        y0=0.0; h0=1.0;
        y1=0.0; h1=0.0;
        y2=0.0; h2=0.0;
    } else if(splits < 2.5){
        // 2段
        float ra = r0 / (r0+r1);
        y0=0.0;  h0=ra;
        y1=ra;   h1=1.0-ra;
        y2=0.0;  h2=0.0;
    } else {
        // 3段
        float s = r0+r1+r2;
        y0=0.0;          h0=r0/s;
        y1=r0/s;         h1=r1/s;
        y2=(r0+r1)/s;    h2=r2/s;
    }
    // idx番目のバンドを返す
    vec2 band = vec2(y0, h0);
    if(idx > 0.5) band = vec2(y1, h1);
    if(idx > 1.5) band = vec2(y2, h2);
    return band;
}

// パネルIDからcell rect (x,y,w,h in UV) を返す（GLSL ES 1.00対応）
// panelId: 0〜7  isWide, timeIndex, gutterL, gutterR から決定論的に計算
vec4 manga_getCell(float panelId, float gutterL, float gutterR,
                   float lSplits, float rSplits,
                   float lSeed, float rSeed){
    // 左ページ: panelId 0〜(lSplits-1)
    // 右ページ: panelId lSplits〜(lSplits+rSplits-1)
    float isRight = step(lSplits - 0.5, panelId);
    float rowIdx  = panelId - isRight * lSplits;
    float splits  = mix(lSplits, rSplits, isRight);
    float seed    = mix(lSeed,   rSeed,   isRight);
    float xStart  = mix(0.0,  gutterR, isRight);
    float xWidth  = mix(gutterL, 1.0-gutterR, isRight);

    vec2 band = manga_rowBand(rowIdx, splits, seed);
    return vec4(xStart, band.x, xWidth, band.y);
}

// 縦長レイアウト用: 1列
vec4 manga_getCellPortrait1(float panelId, float rows, float seed){
    vec2 band = manga_rowBand(panelId, rows, seed);
    return vec4(0.0, band.x, 1.0, band.y);
}

// 縦長レイアウト用: 2列
vec4 manga_getCellPortrait2(float panelId, float cx,
                             float lRows, float rRows,
                             float lSeed, float rSeed){
    float isRight = step(lRows - 0.5, panelId);
    float rowIdx  = panelId - isRight * lRows;
    float rows    = mix(lRows, rRows, isRight);
    float seed    = mix(lSeed, rSeed, isRight);
    float xStart  = mix(0.0, cx, isRight);
    float xWidth  = mix(cx, 1.0-cx, isRight);
    vec2 band = manga_rowBand(rowIdx, rows, seed);
    return vec4(xStart, band.x, xWidth, band.y);
}

vec3 manga_renderCell(vec2 fc, vec4 cell, float panelId, float timeIndex,
                      float sceneProgress, float animDuration){
    vec2 uv = fc / resolution;
    // アニメーション
    manga_initSeed3(vec3(panelId, timeIndex, 7.7));
    float cellDelay = manga_random() * 0.3;
    float prog = clamp((sceneProgress - cellDelay) / animDuration, 0.0, 1.0);
    float ep = manga_easeOutQuint(prog);
    float dr = manga_random();
    vec2 slideDir;
    if(dr<0.25)      slideDir=vec2(-1.0, 0.0);
    else if(dr<0.5)  slideDir=vec2( 1.0, 0.0);
    else if(dr<0.75) slideDir=vec2( 0.0,-1.0);
    else             slideDir=vec2( 0.0, 1.0);
    vec2 aPos = fc - slideDir*(1.0-ep)*resolution;
    vec2 aUV  = aPos / resolution;

    // コマ内チェック
    if(aUV.x < cell.x || aUV.x > cell.x+cell.z ||
       aUV.y < cell.y || aUV.y > cell.y+cell.w){
        return vec3(1.0);
    }

    vec2 cellUV = (aUV - cell.xy) / cell.zw;
    manga_initSeed3(vec3(panelId, timeIndex, 13.3));
    vec3 col = manga_mainAgg(cellUV, manga_random(), time);

    // 枠・断ち切り
    float MG = 6.0;
    float BD = 4.0;
    vec2 cs = cell.xy * resolution;
    vec2 ce = cs + cell.zw * resolution;
    float lD = aPos.x - cs.x;
    float rD = ce.x   - aPos.x;
    float tD = aPos.y - cs.y;
    float bD = ce.y   - aPos.y;
    float mL = (cell.x           < 0.003) ? 0.0 : MG;
    float mR = (cell.x + cell.z  > 0.997) ? 0.0 : MG;
    float mT = (cell.y           < 0.003) ? 0.0 : MG;
    float mB = (cell.y + cell.w  > 0.997) ? 0.0 : MG;
    float bL = (mL < 0.5) ? 0.0 : BD;
    float bR = (mR < 0.5) ? 0.0 : BD;
    float bT = (mT < 0.5) ? 0.0 : BD;
    float bB = (mB < 0.5) ? 0.0 : BD;
    bool inMg = (lD<mL || rD<mR || tD<mT || bD<mB);
    bool isBd = !inMg && (lD<mL+bL || rD<mR+bR || tD<mT+bT || bD<mB+bB);
    if(inMg) col=vec3(1.0);
    else if(isBd) col=vec3(0.0);
    return col;
}

vec3 bg_manga(vec2 fc){
    vec2 uv = fc / resolution;
    bool isWide = (resolution.x / resolution.y) > 1.15;

    float sceneTime    = 3.0;
    float animDuration = 0.45;
    float timeIndex    = floor(time / sceneTime);
    float sceneProgress= fract(time / sceneTime);

    float gutterHalf = 8.0 / resolution.x; // ノド片側幅(UV)

    manga_initSeed(vec2(timeIndex, 31.7));

    if(isWide){
        // ===== 見開きレイアウト =====
        float cx     = mix(0.47, 0.53, manga_random());
        float gutterL = cx - gutterHalf;
        float gutterR = cx + gutterHalf;

        // ノド白帯（早期リターン）
        if(uv.x >= gutterL && uv.x <= gutterR) return vec3(1.0);

        // 分割数（各ページ1〜3段）
        float lSplits = floor(manga_random()*3.0) + 1.0;
        float rSplits = floor(manga_random()*3.0) + 1.0;
        // シード（左ページ・右ページで独立）
        float lSeed = manga_hash_f(timeIndex * 3.7 + 11.1);
        float rSeed = manga_hash_f(timeIndex * 5.3 + 22.2);

        // どのコマか: 左ページ（uv.x < gutterL）or 右ページ（uv.x > gutterR）
        float totalPanels = lSplits + rSplits;
        vec4  hitCell = vec4(0.0);
        float hitId   = -1.0;

        // 左ページ: panelId 0〜lSplits-1
        for(int i=0;i<3;i++){
            float fi = float(i);
            if(fi >= lSplits) break;
            if(uv.x >= gutterL) break; // 右ページは別処理
            vec4 cell = manga_getCell(fi, gutterL, gutterR,
                                      lSplits, rSplits, lSeed, rSeed);
            if(uv.y >= cell.y && uv.y <= cell.y+cell.w){
                hitCell = cell; hitId = fi; break;
            }
        }
        // 右ページ: panelId lSplits〜totalPanels-1
        if(hitId < 0.0){
            for(int i=0;i<3;i++){
                float fi = float(i) + lSplits;
                if(fi >= totalPanels) break;
                if(uv.x <= gutterR) break;
                vec4 cell = manga_getCell(fi, gutterL, gutterR,
                                          lSplits, rSplits, lSeed, rSeed);
                if(uv.y >= cell.y && uv.y <= cell.y+cell.w){
                    hitCell = cell; hitId = fi; break;
                }
            }
        }
        if(hitId < 0.0) return vec3(1.0);
        return manga_renderCell(fc, hitCell, hitId, timeIndex, sceneProgress, animDuration);

    } else {
        // ===== 縦長レイアウト =====
        float colRand = manga_random();
        float cx      = mix(0.40, 0.60, manga_random());

        float lSeed = manga_hash_f(timeIndex * 3.7 + 11.1);
        float rSeed = manga_hash_f(timeIndex * 5.3 + 22.2);

        if(colRand > 0.4){
            // 2列
            float lRows = floor(manga_random()*2.0) + 2.0; // 2,3
            float rRows = floor(manga_random()*2.0) + 2.0;
            float isRight = step(cx, uv.x);
            float rows  = mix(lRows, rRows, isRight);
            float seed  = mix(lSeed, rSeed, isRight);
            // 縦バンド特定
            vec4 hitCell = vec4(0.0);
            float hitId  = -1.0;
            float offset = isRight * lRows;
            for(int i=0;i<3;i++){
                float fi = float(i);
                if(fi >= rows) break;
                vec4 cell = manga_getCellPortrait2(fi+offset, cx, lRows, rRows, lSeed, rSeed);
                if(uv.y >= cell.y && uv.y <= cell.y+cell.w){
                    hitCell = cell; hitId = fi+offset; break;
                }
            }
            if(hitId < 0.0) return vec3(1.0);
            return manga_renderCell(fc, hitCell, hitId, timeIndex, sceneProgress, animDuration);
        } else {
            // 1列
            float rows = floor(manga_random()*3.0) + 2.0; // 2,3,4
            vec4 hitCell = vec4(0.0);
            float hitId  = -1.0;
            for(int i=0;i<4;i++){
                float fi = float(i);
                if(fi >= rows) break;
                vec4 cell = manga_getCellPortrait1(fi, rows, lSeed);
                if(uv.y >= cell.y && uv.y <= cell.y+cell.w){
                    hitCell = cell; hitId = fi; break;
                }
            }
            if(hitId < 0.0) return vec3(1.0);
            return manga_renderCell(fc, hitCell, hitId, timeIndex, sceneProgress, animDuration);
        }
    }
}

vec3 getBackground(vec2 fc){
  if(bgMode==1) return bg_meguru(fc);
  if(bgMode==2) return bg_7sKSDd(fc);
  if(bgMode==3) return bg_sdjGWR(fc);
  if(bgMode==4) return bg_sinFBM(fc);
  if(bgMode==5) return bg_NdsSzl(fc);
  if(bgMode==6) return bg_newSinFract(fc);
  if(bgMode==7) return bg_cos20(fc);
  if(bgMode==8) return bg_manga(fc);
  if(bgMode==9){
    vec2 uv = fc / resolution;
    float z = max(0.001, bgZoom);
    vec2 cam = bgCamPx / max(bgPhotoSize, vec2(1.0));
    vec2 suv = (uv - 0.5) / z + 0.5 + cam;
    suv = fract(suv);
    suv.y = 1.0 - suv.y;
    return texture2D(bgPhoto, suv).rgb;
  }
  return bg_vangogh(fc);
}

// =====================================================
// global palette mode
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
    if(switchPalette != 0){vec3 temp=bg;bg=fg;fg=temp;}
    return applyTwoColor(col, bg, fg, fc);
  }
  if(paletteMode == 2){
    vec3 bg = vec3(0.00, 0.38, 1.00);
    vec3 fg = vec3(0.10, 0.78, 0.18);
    if(switchPalette != 0){vec3 temp=bg;bg=fg;fg=temp;}
    return applyTwoColor(col, bg, fg, fc);
  }
  if(paletteMode == 3){
    vec3 bg = vec3(0.84, 0.30, 0.86);
    vec3 fg = vec3(0.90, 0.78, 0.02);
    if(switchPalette != 0){vec3 temp=bg;bg=fg;fg=temp;}
    return applyTwoColor(col, bg, fg, fc);
  }
  if(paletteMode == 5){ return vec3(1.0) - col; }
  return applyMangaTone(col, fc);
}

// =====================================================
// glitch
// =====================================================
vec2 applyGlitchUV(vec2 uv, vec2 fc){
  if (glitchMode != 1) return uv;
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return uv;
  float b = glitchBeat;
  float stepB = floor(b * 16.0);
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
  float beatPhase = fract(b);
  float beatActive = step(beatPhase, 0.25);
  float beatCurve = sin(min(beatPhase / 0.25, 1.0) * PI);
  float globalTrigger = step(0.3, seed) * beatActive * k;
  if (globalTrigger < 0.001) return uv;
  float sliceRandom = hash11(seed * 3.7);
  float sliceHeightPx = 2.0 + pow(sliceRandom, 6.0) * 598.0;
  float pixelY = uv.y * resolution.y;
  float sid = floor(pixelY / sliceHeightPx);
  float r1 = hash11(sid * 13.37 + seed * 91.7);
  float intensity = pow(r1, 7.0);
  float shouldGlitch = step(0.8, r1);
  if (shouldGlitch < 0.5) return uv;
  float shiftBase = pow(hash11(sid * 7.31 + seed * 19.1), 5.0);
  float shiftAmt = (shiftBase - 0.5) * 3.0 * intensity * beatCurve;
  float shiftAmt2 = (pow(hash11(sid * 29.3 + seed * 3.7), 3.0) - 0.5) * 0.8 * intensity;
  float beatShift = sin(b * TAU) * 0.3 * intensity * beatCurve;
  float randomShift = (pow(hash11(sid * 17.3 + seed * 5.3), 4.0) - 0.5) * 1.2 * intensity;
  float totalShift = globalTrigger * (shiftAmt + shiftAmt2 + beatShift + randomShift);
  uv.x = fract(uv.x + totalShift);
  return uv;
}

vec2 applyGlitchUV_Multi(vec2 uv, vec2 fc){
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return uv;
  float b = glitchBeat;
  float stepB = floor(b * 16.0);
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
  if (glitchMode == 3) return uv;
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
  if (glitchMode == 5) {
    float beatPhase = fract(b);
    float blurAmount = pow(sin(beatPhase * PI), 1.0) * k;
    float stepB2 = floor(b * 0.5);
    float directionSeed = fract(sin(stepB2 * 78.233 + glitchSeed * 11.7) * 12345.678);
    float dirIndex = floor(directionSeed * 8.0);
    float motionAngle = dirIndex * (TAU / 8.0);
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

float gSat(float x){ return clamp(x, 0.0, 1.0); }

vec3 applyGlitchAll(vec3 col, vec2 fc){
  if (glitchMode <= 0) return col;
  float k = clamp(glitchAmt, 0.0, 1.0);
  if (k <= 0.00001) return col;
  float b = glitchBeat;
  float stepB = floor(b * 4.0);
  vec2 uv = fc / max(resolution, vec2(1.0));
  float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
  if (glitchMode == 1){ return col; }
  if (glitchMode == 2){
    float beatPhase = fract(b);
    float sizeAnim = smoothstep(0.0, 1.0, beatPhase);
    float mosaicSize = mix(4.0, 32.0, sizeAnim * hash11(seed * 7.3));
    vec2 mosaicCell = floor(fc / mosaicSize);
    float slitType = hash11(seed * 3.7);
    float slitFreq = mix(30.0, 8.0, sizeAnim * hash11(seed * 9.1));
    float slit = 0.0;
    if(slitType < 0.5){ slit = step(0.5, fract(uv.x * slitFreq + seed)); }
    else { slit = step(0.5, fract(uv.y * slitFreq + seed)); }
    float effectType = hash11(seed * 11.3);
    vec3 result = col;
    if(effectType < 0.5){
      float blockHash = hash21(mosaicCell + seed * 7.7);
      if(blockHash > 0.7){ result = vec3(col.g, col.b, col.r); }
      else if(blockHash > 0.4){ result = vec3(col.b, col.r, col.g); }
    } else {
      result = mix(col, vec3(1.0) - col, slit * 0.7);
    }
    result = mix(col, result, k);
    float noiseAmt = mix(0.15, 0.05, sizeAnim);
    float noise = (hash11(fc.x + fc.y * 173.1 + stepB * 5.0) - 0.5) * noiseAmt * k;
    result += noise;
    return clamp(result, 0.0, 1.0);
  }
  if (glitchMode == 3){
    float nr = hash11(fc.x + fc.y * 113.1 + stepB * 17.0 + seed * 101.7);
    float ng = hash11(fc.x + fc.y * 113.1 + stepB * 19.0 + seed * 107.3);
    float nb = hash11(fc.x + fc.y * 113.1 + stepB * 23.0 + seed * 109.1);
    return clamp(mix(col, vec3(nr, ng, nb), 0.3 * k), 0.0, 1.0);
  }
  if (glitchMode == 4){
    vec2 center = resolution * 0.5;
    vec2 toCenter = fc - center;
    float dist = length(toCenter);
    float maxDist = length(resolution * 0.5);
    float distNorm = clamp(dist / max(maxDist, 1.0), 0.0, 1.0);
    float blurStrength = pow(distNorm, 2.5) * k;
    float beatPulse = 0.5 + 0.5 * sin(b * TAU);
    blurStrength *= (0.6 + 0.4 * beatPulse);
    vec3 aberration = col;
    aberration.r = col.r * (1.0 - blurStrength * 0.1);
    aberration.b = col.b * (1.0 + blurStrength * 0.1);
    float vignette = 1.0 - pow(distNorm, 3.0) * blurStrength * 0.6;
    aberration *= vignette;
    return clamp(mix(col, aberration, clamp(blurStrength * 2.0, 0.0, 1.0)), 0.0, 1.0);
  }
  return col;
}

// =====================================================
// main
// =====================================================
void main(){
  float bt = getBeat();

  vec2 bgFC = gl_FragCoord.xy;
  
  if(glitchMode == 1 && glitchAmt > 0.0){
    float b = glitchBeat;
    float stepB = floor(b * 16.0);
    float seed = fract(sin((stepB + 1.0) * 78.233 + glitchSeed * 11.7) * 12345.678);
    float beatPhase = fract(b);
    float beatActive = step(beatPhase, 0.25);
    float beatCurve = sin(min(beatPhase / 0.25, 1.0) * PI);
    float k = clamp(glitchAmt, 0.0, 1.0);
    float globalTrigger = step(0.3, seed) * beatActive * k;
    if(globalTrigger > 0.001){
      float sliceRandom = hash11(seed * 3.7);
      float sliceHeightPx = 2.0 + pow(sliceRandom, 6.0) * 598.0;
      float pixelY = bgFC.y;
      float sid = floor(pixelY / sliceHeightPx);
      float r1 = hash11(sid * 13.37 + seed * 91.7);
      float intensity = pow(r1, 7.0);
      float shouldGlitch = step(0.8, r1);
      if(shouldGlitch > 0.5){
        float shiftBase = pow(hash11(sid * 7.31 + seed * 19.1), 5.0);
        float shiftAmt = (shiftBase - 0.5) * 3.0 * intensity * beatCurve;
        float shiftAmt2 = (pow(hash11(sid * 29.3 + seed * 3.7), 3.0) - 0.5) * 0.8 * intensity;
        float beatShift = sin(b * TAU) * 0.3 * intensity * beatCurve;
        float randomShift = (pow(hash11(sid * 17.3 + seed * 5.3), 4.0) - 0.5) * 1.2 * intensity;
        float totalShift = globalTrigger * (shiftAmt + shiftAmt2 + beatShift + randomShift);
        bgFC.x = mod(bgFC.x + totalShift * resolution.x, resolution.x);
      }
    }
  }
  
  if((glitchMode == 3 || glitchMode == 4 || glitchMode == 5) && glitchAmt > 0.0){
    vec2 screenUV = bgFC / resolution;
    vec2 transformedUV = applyGlitchUV_Multi(screenUV, bgFC);
    bgFC = transformedUV * resolution;
  }

  vec3 bg = getBackground(bgFC);
  float cb = colorBeat(bt);
  bg = mix(bg, palPick(fract(cb * 0.05)), 0.00);

  if(showVisual == 0){
    vec3 finalBg = applyPaletteAll(bg, gl_FragCoord.xy);
    finalBg = applyGlitchAll(finalBg, gl_FragCoord.xy);
    if(invertPalette != 0){ finalBg = vec3(1.0) - finalBg; }
    gl_FragColor = vec4(finalBg, 1.0);
    return;
  }

  vec2 uv = uvCover(vTexCoord, resolution, texSize);
  if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
    vec3 finalBg = applyPaletteAll(bg, gl_FragCoord.xy);
    finalBg = applyGlitchAll(finalBg, gl_FragCoord.xy);
    if(invertPalette != 0){ finalBg = vec3(1.0) - finalBg; }
    gl_FragColor = vec4(finalBg, 1.0);
    return;
  }

  uv = applyGlitchUV(uv, gl_FragCoord.xy);
  uv = applyGlitchUV_Multi(uv, gl_FragCoord.xy);

  vec3 src = texture2D(tex0, uv).rgb;

  float rb = min(src.r, src.b);
  float magHard = step(keyRBMin, rb) * (1.0 - step(keyGMax, src.g));
  float magSoft = sstep(keyRBMin - keySoft, keyRBMin + keySoft, rb)
                * (1.0 - sstep(keyGMax - keySoft, keyGMax + keySoft, src.g));
  float mag = max(magHard, magSoft);
  float paperMask = 1.0 - mag;

  vec3 paper = mix(bg, vec3(1.0), paperMask);
  paper = mix(paper, bg, 0.08);

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

  float ringLine = smoothstep(lineW * mix(5.0, 20.0, hash21(vec2(ringId))), 0.0, d0);

  float aLine = clamp(
    sqrt(ringLine * arc * alive * inkVis) * colorLineOpacity * (1.0 + flash),
    0.0, 1.0
  );
  
  if(overlayOn == 0){ aLine = 0.0; }

  vec3 ringCol = saturateColor(
    palPick(fract(hueBase + ringId * hueSpread + cb * 0.15)),
    RING_SAT
  ) * RING_BRI;

  vec3 outCol = (paletteMode == 0)
    ? mix(baseCol, ringCol, aLine)
    : mix(baseCol, 1.0 - (1.0 - baseCol) * (1.0 - ringCol), aLine);

  vec3 finalCol = applyPaletteAll(outCol, gl_FragCoord.xy);
  finalCol = applyGlitchAll(finalCol, gl_FragCoord.xy);
  if(invertPalette != 0){ finalCol = vec3(1.0) - finalCol; }
  
  gl_FragColor = vec4(finalCol, 1.0);
}
