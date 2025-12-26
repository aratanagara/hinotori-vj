#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D uPrev;
uniform vec2  uResolution;
uniform float uTime;
uniform float uBeat;
uniform float uDT;

uniform float uBPM;
uniform float uBeatsPerStep;

uniform float uCurlAmt;
uniform float uSpawnStrength;
uniform float uDecay;

varying vec2 vTexCoord;

float gyroid(vec3 s){ return dot(sin(s), cos(s.yzx)); }

// 表示側と必ず一致させる
const float BEATS_PER_CYCLE = 8.0;

bool isFree(){
  return uBeat < 0.0;
}

float beatTime(){
  if(isFree()){
    // FREE：連続時間（BPM影響だけ残す）
    return uTime * (uBPM / 30.0);
  }else{
    // BEAT：display と完全同期
    return uBeat * BEATS_PER_CYCLE;
  }
}

float stepIndex(){
  float b = beatTime();

  if(isFree()){
    // FREE：floorしない（完全に連続）
    return b / max(0.001, uBeatsPerStep);
  }else{
    // BEAT：拍スナップ
    return floor(b / max(0.001, uBeatsPerStep));
  }
}

float fbm(vec2 pos){
  float t  = stepIndex();
  float t2 = t * 1.354;

  vec3 p = vec3(pos, t);
  float result = 0.0;
  float a = 0.5;

  for(int i=0;i<3;i++){
    result += abs(gyroid(p / a) * a);
    a *= 0.5;
  }

  result = sin(result * 6.2831853 + t2 - pos.x);
  return result;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uResolution.xy;

  vec2 p = (2.0 * fc - uResolution.xy) / uResolution.y;

  vec2 e = vec2(4.0 / uResolution.y, 0.0);
  float dx = (fbm(p + e.xy) - fbm(p - e.xy)) / (2.0 * e.x);
  float dy = (fbm(p + e.yx) - fbm(p - e.yx)) / (2.0 * e.x);
  vec2 curl = vec2(dy, -dx);

  vec2 pp = p + curl * 0.05;
  float dist = abs(length(pp) - 0.9);
  float maskSpawn = smoothstep(0.01, 0.0, dist) * uSpawnStrength;

  // 拍インデックス（既存ロジックをそのまま使う）
  float si = stepIndex();

  // 拍ごとに固定される角度
  float ang = fract(sin(si * 37.7) * 43758.5453) * 6.2831853;
  vec2 beatDir = vec2(cos(ang), sin(ang));

  // 拍の中で 0→1 進む位相
  float beatPhase = fract(beatTime() / max(0.001, uBeatsPerStep));

  // カール＋拍方向をブレンド
  vec2 disp =
      curl * uCurlAmt * 0.7 +
      beatDir * uCurlAmt * 0.6 * beatPhase;

  vec4 prev = texture2D(uPrev, uv + disp);

  float m = max(maskSpawn, prev.r - uDT * uDecay);

  gl_FragColor = vec4(m, disp.x, disp.y, 1.0);
}
