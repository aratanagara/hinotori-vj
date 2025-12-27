// bg_manga.frag (SAFE: no dynamic indexing on uniform arrays)
<<<<<<< HEAD
// - aspect-safe thickness/patterns
// - inner frame + outer frame
// - fills: solid black / dots / cloud / noise+speedlines (NO mid-gray fills)
=======
// - 24 panels supported
// - forced bleed: dir >= 4.0  (dir = mod(dir,4))
// - aspect-safe thickness/patterns
// - inner frame + outer frame
// - fills: solid black / dots / cloud / noise+speedlines (NO mid-gray fills)

>>>>>>> 56d0bc0 (update)
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

varying vec2 vTexCoord;

uniform vec2  uResolution;
uniform float uTime;

uniform int   uCount;

<<<<<<< HEAD
// 12 * vec4 (x0,y0,x1,y1) packed into float[48]
uniform float uManga[48];
// 12 * vec4 (t0,dur,fx,dir) packed into float[48]
uniform float uAnim[48];

uniform float uBleedChance;
=======
// 24 * vec4 (x0,y0,x1,y1) packed into float[96]
uniform float uManga[96];
// 24 * vec4 (t0,dur,fx,dir) packed into float[96]
uniform float uAnim[96];

uniform float uBleedChance;   // "auto corner bleed" probability (still used)
>>>>>>> 56d0bc0 (update)
uniform float uFramePx;
uniform float uInnerFramePx;
uniform float uGutterXPx;
uniform float uGutterYPx;
uniform float uToneAmt;

// --------------------
// hash
// --------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// --------------------
// Quint + Bound
// --------------------
float easeOutQuint(float x){
  x = clamp(x, 0.0, 1.0);
  float a = 1.0 - x;
  return 1.0 - a*a*a*a*a;
}
float easeOutQuintBound(float x){
  x = clamp(x, 0.0, 1.0);
  float y = easeOutQuint(x);
  float b = smoothstep(0.70, 1.0, x);
  float wob = sin((x - 0.70) * 8.0) * (1.0 - x) * 0.12;
  return clamp(y + b * wob, 0.0, 1.25);
}

// --------------------
// panel helpers (NO dynamic indexing)
// --------------------
vec4 getPanel(int i){
  if(i==0)  return vec4(uManga[0],  uManga[1],  uManga[2],  uManga[3]);
  if(i==1)  return vec4(uManga[4],  uManga[5],  uManga[6],  uManga[7]);
  if(i==2)  return vec4(uManga[8],  uManga[9],  uManga[10], uManga[11]);
  if(i==3)  return vec4(uManga[12], uManga[13], uManga[14], uManga[15]);
  if(i==4)  return vec4(uManga[16], uManga[17], uManga[18], uManga[19]);
  if(i==5)  return vec4(uManga[20], uManga[21], uManga[22], uManga[23]);
  if(i==6)  return vec4(uManga[24], uManga[25], uManga[26], uManga[27]);
  if(i==7)  return vec4(uManga[28], uManga[29], uManga[30], uManga[31]);
  if(i==8)  return vec4(uManga[32], uManga[33], uManga[34], uManga[35]);
  if(i==9)  return vec4(uManga[36], uManga[37], uManga[38], uManga[39]);
  if(i==10) return vec4(uManga[40], uManga[41], uManga[42], uManga[43]);
<<<<<<< HEAD
  return          vec4(uManga[44], uManga[45], uManga[46], uManga[47]);
=======
  if(i==11) return vec4(uManga[44], uManga[45], uManga[46], uManga[47]);
  if(i==12) return vec4(uManga[48], uManga[49], uManga[50], uManga[51]);
  if(i==13) return vec4(uManga[52], uManga[53], uManga[54], uManga[55]);
  if(i==14) return vec4(uManga[56], uManga[57], uManga[58], uManga[59]);
  if(i==15) return vec4(uManga[60], uManga[61], uManga[62], uManga[63]);
  if(i==16) return vec4(uManga[64], uManga[65], uManga[66], uManga[67]);
  if(i==17) return vec4(uManga[68], uManga[69], uManga[70], uManga[71]);
  if(i==18) return vec4(uManga[72], uManga[73], uManga[74], uManga[75]);
  if(i==19) return vec4(uManga[76], uManga[77], uManga[78], uManga[79]);
  if(i==20) return vec4(uManga[80], uManga[81], uManga[82], uManga[83]);
  if(i==21) return vec4(uManga[84], uManga[85], uManga[86], uManga[87]);
  if(i==22) return vec4(uManga[88], uManga[89], uManga[90], uManga[91]);
  return          vec4(uManga[92], uManga[93], uManga[94], uManga[95]);
>>>>>>> 56d0bc0 (update)
}
vec4 getAnim(int i){
  if(i==0)  return vec4(uAnim[0],  uAnim[1],  uAnim[2],  uAnim[3]);
  if(i==1)  return vec4(uAnim[4],  uAnim[5],  uAnim[6],  uAnim[7]);
  if(i==2)  return vec4(uAnim[8],  uAnim[9],  uAnim[10], uAnim[11]);
  if(i==3)  return vec4(uAnim[12], uAnim[13], uAnim[14], uAnim[15]);
  if(i==4)  return vec4(uAnim[16], uAnim[17], uAnim[18], uAnim[19]);
  if(i==5)  return vec4(uAnim[20], uAnim[21], uAnim[22], uAnim[23]);
  if(i==6)  return vec4(uAnim[24], uAnim[25], uAnim[26], uAnim[27]);
  if(i==7)  return vec4(uAnim[28], uAnim[29], uAnim[30], uAnim[31]);
  if(i==8)  return vec4(uAnim[32], uAnim[33], uAnim[34], uAnim[35]);
  if(i==9)  return vec4(uAnim[36], uAnim[37], uAnim[38], uAnim[39]);
  if(i==10) return vec4(uAnim[40], uAnim[41], uAnim[42], uAnim[43]);
<<<<<<< HEAD
  return          vec4(uAnim[44], uAnim[45], uAnim[46], uAnim[47]);
=======
  if(i==11) return vec4(uAnim[44], uAnim[45], uAnim[46], uAnim[47]);
  if(i==12) return vec4(uAnim[48], uAnim[49], uAnim[50], uAnim[51]);
  if(i==13) return vec4(uAnim[52], uAnim[53], uAnim[54], uAnim[55]);
  if(i==14) return vec4(uAnim[56], uAnim[57], uAnim[58], uAnim[59]);
  if(i==15) return vec4(uAnim[60], uAnim[61], uAnim[62], uAnim[63]);
  if(i==16) return vec4(uAnim[64], uAnim[65], uAnim[66], uAnim[67]);
  if(i==17) return vec4(uAnim[68], uAnim[69], uAnim[70], uAnim[71]);
  if(i==18) return vec4(uAnim[72], uAnim[73], uAnim[74], uAnim[75]);
  if(i==19) return vec4(uAnim[76], uAnim[77], uAnim[78], uAnim[79]);
  if(i==20) return vec4(uAnim[80], uAnim[81], uAnim[82], uAnim[83]);
  if(i==21) return vec4(uAnim[84], uAnim[85], uAnim[86], uAnim[87]);
  if(i==22) return vec4(uAnim[88], uAnim[89], uAnim[90], uAnim[91]);
  return          vec4(uAnim[92], uAnim[93], uAnim[94], uAnim[95]);
>>>>>>> 56d0bc0 (update)
}

// --------------------
// tones (pixel-safe, no mid-gray fills)
// --------------------
<<<<<<< HEAD

// round halftone dots
=======
>>>>>>> 56d0bc0 (update)
float toneDots(vec2 fc, float density, float seed){
  vec2 p  = fc / density;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;
  float r = 0.20 + 0.22 * hash21(ip + seed * 17.0);
  float d = length(fp);
  float m = smoothstep(r, r - 0.07, d);
<<<<<<< HEAD
  return m; // 1 inside dot
}

// value noise
=======
  return m;
}
>>>>>>> 56d0bc0 (update)
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float n = 0.0;
  float a = 0.55;
  for(int k=0;k<4;k++){
    n += vnoise(p) * a;
    p *= 2.02;
    a *= 0.55;
  }
  return n;
}
<<<<<<< HEAD
// cloud-ish blobs (binary-ish)
=======
>>>>>>> 56d0bc0 (update)
float toneCloud(vec2 fc, float scale, float seed){
  vec2 p = (fc / scale) + vec2(seed*7.1, seed*3.7);
  float n = fbm(p);
  return smoothstep(0.50, 0.74, n);
}
<<<<<<< HEAD

// gritty noise (binary)
=======
>>>>>>> 56d0bc0 (update)
float toneNoise(vec2 fc, float seed){
  float n = hash21(floor(fc) + seed*19.3);
  return step(0.55, n);
}
<<<<<<< HEAD

// radial speedlines in panel local
=======
>>>>>>> 56d0bc0 (update)
float toneSpeed(vec2 local01, float seed){
  vec2 c = local01 - 0.5;
  float ang = atan(c.y, c.x);
  float k = 26.0 + 18.0 * seed;
  float s = abs(sin(ang * k + seed * 6.2831));
  float v = smoothstep(0.93, 1.0, s);
  float d = length(c);
  v *= smoothstep(0.62, 0.10, d);
  return v;
}

// --------------------
// main
// --------------------
void main() {
  vec2 uv = vTexCoord;
  vec2 px = 1.0 / uResolution;
  float pxMin = min(px.x, px.y);

  float frame  = uFramePx      * pxMin;
  float innerF = uInnerFramePx * pxMin;

  float gutterX = uGutterXPx * px.x;
  float gutterY = uGutterYPx * px.y;

  vec3 col = vec3(1.0);

  int   bestId = -1;
  float bestA  = 0.0;
  vec4  bestRect  = vec4(0.0);
  vec2  bestLocal = vec2(0.0);

<<<<<<< HEAD
  for (int i = 0; i < 12; i++){
=======
  for (int i = 0; i < 24; i++){
>>>>>>> 56d0bc0 (update)
    if (i >= uCount) break;

    vec4 r = getPanel(i);
    vec4 a = getAnim(i);

    float t0  = a.x;
    float dur = max(a.y, 0.001);
    float fx  = a.z;
<<<<<<< HEAD
    float dir = a.w;
=======
    float dirPacked = a.w;

    // ---- forced bleed flag ----
    float forcedBleed = step(4.0, dirPacked);
    float dir = mod(dirPacked, 4.0);
>>>>>>> 56d0bc0 (update)

    float x = (uTime - t0) / dur;
    float e = easeOutQuintBound(x);
    float alpha = clamp(e, 0.0, 1.0);

    float cornerish =
      (r.x < 0.02 && r.y < 0.02) ||
      (r.z > 0.98 && r.y < 0.02) ||
      (r.x < 0.02 && r.w > 0.98) ||
      (r.z > 0.98 && r.w > 0.98) ? 1.0 : 0.0;

<<<<<<< HEAD
    float bleed = step(0.5, cornerish) * step(hash11(float(i) + 7.0), uBleedChance);

=======
    // auto bleed only for corners (optional), OR forced bleed
    float autoBleed = step(0.5, cornerish) * step(hash11(float(i) + 7.0), uBleedChance);
    float bleed = max(forcedBleed, autoBleed);

    // gutters: if bleed and edge touches page, gutter becomes 0 on that side
>>>>>>> 56d0bc0 (update)
    float gL = gutterX, gR = gutterX, gT = gutterY, gB = gutterY;
    if (bleed > 0.5){
      if (r.x <= 0.0005) gL = 0.0;
      if (r.y <= 0.0005) gT = 0.0;
      if (r.z >= 0.9995) gR = 0.0;
      if (r.w >= 0.9995) gB = 0.0;
    }

    vec4 inner = vec4(r.x + gL, r.y + gT, r.z - gR, r.w - gB);

    vec2 c  = (inner.xy + inner.zw) * 0.5;
    vec2 hs = (inner.zw - inner.xy) * 0.5;

    vec2 cA  = c;
    vec2 hsA = hs;

    if (fx < 0.5) {
<<<<<<< HEAD
      // fade
    } else if (fx < 1.5) {
=======
      // fade only
    } else if (fx < 1.5) {
      // slide
>>>>>>> 56d0bc0 (update)
      vec2 offs = vec2(0.0);
      if      (dir < 0.5) offs = vec2(-1.2, 0.0);
      else if (dir < 1.5) offs = vec2( 1.2, 0.0);
      else if (dir < 2.5) offs = vec2( 0.0,-1.2);
      else                offs = vec2( 0.0, 1.2);
      cA = mix(c + offs, c, e);
    } else {
<<<<<<< HEAD
=======
      // pop
>>>>>>> 56d0bc0 (update)
      float s = mix(0.05, 1.0, e);
      hsA = hs * s;
    }

    vec2 pp = uv - cA;
    float inside = step(max(abs(pp.x) - hsA.x, abs(pp.y) - hsA.y), 0.0);

    if (inside > 0.5 && alpha > bestA) {
      bestA = alpha;
      bestId = i;
      bestRect = vec4(cA - hsA, cA + hsA);
      bestLocal = (uv - (cA - hsA)) / max((hsA * 2.0), vec2(1e-6));
    }
  }

  if (bestId >= 0) {
    vec2 dEdge = min(uv - bestRect.xy, bestRect.zw - uv);
    float dMin = min(dEdge.x, dEdge.y);

    float outerLine = 1.0 - smoothstep(frame, frame + 1.5 * pxMin, dMin);

    float innerEdge = dMin - (frame + innerF * 2.0);
    float innerLine = 1.0 - smoothstep(innerF, innerF + 1.5 * pxMin, innerEdge);

    float sid  = float(bestId);
    float seed = hash11(sid + 13.0);

    vec2 fc = uv * uResolution;

    float pick = seed;
    float black = 0.0;

    if (pick < 0.20) {
<<<<<<< HEAD
      black = 1.0; // ベタ
=======
      black = 1.0;
>>>>>>> 56d0bc0 (update)
    } else if (pick < 0.52) {
      float dens = mix(7.0, 14.0, hash11(sid + 21.0));
      black = toneDots(fc, dens, seed);
    } else if (pick < 0.78) {
      float sc = mix(32.0, 56.0, hash11(sid + 33.0));
      black = toneCloud(fc, sc, seed);
    } else {
      float sp = toneSpeed(bestLocal, seed);
      float nz = toneNoise(fc, seed);
      black = max(sp, nz * 0.55);
    }

    black *= clamp(uToneAmt, 0.0, 1.0);

    vec3 panelCol = vec3(1.0);
    panelCol = mix(panelCol, vec3(0.0), black);

    float line = max(outerLine, innerLine);
    panelCol = mix(panelCol, vec3(0.0), line);

    vec4 aa = getAnim(bestId);
    float fx = aa.z;
    float alpha = (fx < 0.5) ? bestA : clamp(bestA * 1.15, 0.0, 1.0);

    col = mix(col, panelCol, alpha);
  }

  gl_FragColor = vec4(col, 1.0);
}
