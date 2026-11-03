/* Johnny Semaan — bounded Liquid Light adaptation (local exploratory study).
 * Solver shaders are copied from the user's AL000Studio/src/reel/scenes/02-fluid.js.
 * Original source is preserved, with a byte-identical snapshot in assets/02-fluid-source.js.
 * Curl, confinement, free-slip divergence, Jacobi pressure projection and RK2 dye advection
 * remain the Liquid Light implementation. Choreography/compositing below are this study's
 * proposals, not approved brand behavior. No timers, event listeners, audio or artwork warp.
 * Caller supplies seconds and CSS-pixel pointer coordinates/velocities (vx/vy in px/sec).
 * Input image canvases are full viewport. Endpoints sample them directly and opaquely.
 */
(function (global) {
  'use strict';
  global.makePigment = function makePigment(canvas, options) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('Pigment: WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Pigment: float render targets unavailable');
    const shaders = new Set(), programs = new Set(), textures = new Set(), framebuffers = new Set();
    let vao = null, destroyed = false, initialized = false;
    let width = 1, height = 1, ratio = 1, shortSide = 1, dims = [1, 1];
    let vel, dye, pressure, divergence, curl, trail, front, back;
    let pCurl, pVort, pDiv, pScale, pJac, pGrad, pAdv, pTrail, pDisplay;
    let frames = 0, steps = 0, lastPhase = '', lastProgress = 0, previousAuto = null;
    let previousPointer = null, origin = [0.34, 0.43], lastTime = 0;
    const sources = new Float32Array(128);
    let sourceCount = 0;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    // Light strength of the ivory/petrol material over the dark field. 1 = original study; lower = softer.
    let glow = clamp(Number(options.glow ?? 1) || 0, 0, 1);
    // The flood's light path in CSS px: from the fish back to the menu side (Alaa, 3 Nov 2026: the left-to-right sweep
    // took the eye away from the sketch; "one light will make the black menu"). Without it, the authored sweep is used.
    const flood = options.flood || null;
    // The menu's rectangle in CSS px ({ x0, y0, x1, y1 }); kept free of the flood's light.
    const menu = options.menu || null;
    // The flood's light swims like a fish (Alaa, 3 Nov 2026: no fish is drawn; the liquid light itself moves the way
    // water moves with one). One S-shaped line from the logo's fish to the sketch, in BURSTS bursts and glides; a thin
    // undulating body of light BODY long; each tail beat (BEAT_HZ) throws a swirl to alternate sides, the wake a real
    // fish leaves behind it. The swim ends at SWIM_END of the flood; what it poured lingers after. The black stays dark
    // water: the light is a window in it onto the page and Johnny's drawings, the water stays a little clearer where it
    // has been, and all of it clears after the swim (the light felt like smoke, apart from the sketches).
    const SWIM_END = .72, BODY = .16, BEAT_HZ = 3.2, BURSTS = 3, BURST_DEPTH = .55, TAIL_SWING = .03;
    let swimPhase = 0;

    // Verbatim Liquid Light shader core is inserted here at build time.
    const HEAD = '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n';
    const VS = `#version 300 es
uniform vec2 uTexel;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  vL = p - vec2(uTexel.x, 0.0); vR = p + vec2(uTexel.x, 0.0);
  vT = p + vec2(0.0, uTexel.y); vB = p - vec2(0.0, uTexel.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
    const NB = 'in vec2 vUv, vL, vR, vT, vB;\nout vec4 o;\n';

    const FS_CURL = NB + `uniform sampler2D uVel;
void main() {
  float L = texture(uVel, vL).y, R = texture(uVel, vR).y, T = texture(uVel, vT).x, B = texture(uVel, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;
    // Vorticity confinement: push along N x w, N = normalised gradient of |curl|, to restore small eddies.
    const FS_VORT = NB + `uniform sampler2D uVel, uCurl; uniform float uK, uDt;
void main() {
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x, T = texture(uCurl, vT).x, B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f *= uK * C / (length(f) + 1e-4);
  f.y = -f.y;
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  o = vec4(clamp(v, -6.0, 6.0), 0.0, 1.0);
}`;
    // Divergence with free-slip walls (mirror the normal component outside the box).
    const FS_DIV = NB + `uniform sampler2D uVel;
void main() {
  float L = texture(uVel, vL).x, R = texture(uVel, vR).x, T = texture(uVel, vT).y, B = texture(uVel, vB).y;
  vec2 C = texture(uVel, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;
    const FS_SCALE = `in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform float uK;
void main() { o = texture(uSrc, vUv) * uK; }`;
    const FS_JACOBI = NB + `uniform sampler2D uP, uDiv;
void main() {
  float L = texture(uP, vL).x, R = texture(uP, vR).x, T = texture(uP, vT).x, B = texture(uP, vB).x;
  o = vec4(0.25 * (L + R + T + B - texture(uDiv, vUv).x), 0.0, 0.0, 1.0);
}`;
    const FS_GRAD = NB + `uniform sampler2D uP, uVel;
void main() {
  float L = texture(uP, vL).x, R = texture(uP, vR).x, T = texture(uP, vT).x, B = texture(uP, vB).x;
  o = vec4(texture(uVel, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`;
    // Semi-Lagrangian advection; RK2 back-trace for the dye keeps filaments crisp.
    // Extra dissipation near the walls keeps ink from piling up against the frame.
    // The sources are applied in the same pass (saves a full-resolution read/write per field):
    // up to 8 capsule splats, each 4 vec4:
    // A (segment a.xy, b.xy) | B (target vel.xy, radius, grip) | D (ink A,B,C,heat concentration) | E (radial, swirl, ink grip, -)
    // Both fields relax toward the nozzle target, so a source can never pump in unbounded energy or ink.
    const FS_ADV = `in vec2 vUv; out vec4 o;
uniform sampler2D uVel, uSrc; uniform vec2 uV2Uv, uDims; uniform float uDt, uEdge, uMax; uniform vec4 uDiss;
uniform int uMode, uCount; uniform vec4 uS[32];
void main() {
  vec2 v = texture(uVel, vUv).xy;
  if (uMode == 1) v = texture(uVel, vUv - 0.5 * uDt * v * uV2Uv).xy;
  vec4 c = texture(uSrc, vUv - uDt * v * uV2Uv);
  vec2 e = min(vUv, 1.0 - vUv) * uDims;
  float edge = 1.0 - smoothstep(0.0, 0.16, min(e.x, e.y));
  c /= 1.0 + (uDiss + edge * uEdge) * uDt;
  vec2 p = vUv * uDims;
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 A = uS[i * 4], B = uS[i * 4 + 1], D = uS[i * 4 + 2], E = uS[i * 4 + 3];
    vec2 ab = A.zw - A.xy;
    float h = clamp(dot(p - A.xy, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
    vec2 q = p - A.xy - ab * h;                         // offset from the capsule spine
    float g = exp(-dot(q, q) / (B.z * B.z));
    if (uMode == 0) c.xy = mix(c.xy, B.xy + (E.x * q + E.y * vec2(-q.y, q.x)) / B.z, clamp(g * B.w, 0.0, 1.0));
    else c = mix(c, D, clamp(g * E.z, 0.0, 1.0));
  }
  o = clamp(c, -uMax, uMax);
}`;
    const FS_COPY = `in vec2 vUv; out vec4 o; uniform sampler2D uSrc; void main() { o = texture(uSrc, vUv); }`;

    // Where the light has been during the swim: the most light each spot has held (r).
    const FS_TRAIL = `in vec2 vUv; out vec4 o;
uniform sampler2D uTrail, uDye;
float heightOf(vec4 d) { return 1.0 - exp(-max(d.r + d.g + d.b, 0.0) * .7); }
void main() { o = vec4(max(texture(uTrail, vUv).r, heightOf(max(texture(uDye, vUv), 0.))), 0., 0., 1.); }`;

    const FS_DISPLAY = `in vec2 vUv; out vec4 o;
uniform sampler2D uDye, uVel, uFront, uBack, uTrail;
uniform vec2 uDyeTexel, uDims, uOrigin;
uniform vec4 uMenu;   // the menu's rectangle (UV, y up): the flood never puts its light there
uniform float uSwim;  // 1: the flood's swim (the black stays until the light has swum); 0: the black clears as it goes
uniform float uProgress;
uniform float uGlow;
uniform int uPhase;
float heightOf(vec4 d) { return 1.0 - exp(-max(d.r + d.g + d.b, 0.0) * .7); }
void main() {
  vec3 bg = vec3(8., 7., 6.) / 255.;
  vec3 front = texture(uFront, vUv).rgb;
  vec3 back = texture(uBack, vUv).rgb;
  float p = clamp(uProgress, 0., 1.);
  // Exact supplied image at phase endpoints; no light, blur, tint, noise or UV distortion.
  if (uPhase != 1 && p >= 1.) { o = vec4(uPhase == 0 ? front : back, 1.); return; }
  if (uPhase == 0 && p <= 0.) { o = vec4(bg, 1.); return; }
  if (uPhase == 2 && p <= 0.) { o = vec4(front, 1.); return; }
  vec4 d = max(texture(uDye, vUv), 0.);
  vec2 flow = texture(uVel, vUv).xy;
  float density = heightOf(d);
  vec2 t = uDyeTexel * 1.5;
  float l = heightOf(texture(uDye, vUv - vec2(t.x, 0.)));
  float r = heightOf(texture(uDye, vUv + vec2(t.x, 0.)));
  float b = heightOf(texture(uDye, vUv - vec2(0., t.y)));
  float a = heightOf(texture(uDye, vUv + vec2(0., t.y)));
  vec3 normal = normalize(vec3((l-r)*9., (b-a)*9., 1.));
  vec3 light = normalize(vec3(-.45, .62, .64));
  float diffuse = max(dot(normal, light), 0.);
  float specular = pow(max(dot(normal, normalize(light + vec3(0.,0.,1.))), 0.), 52.);
  // Two restrained material species: warm ivory and deep petrol, not the reel's neon palette.
  vec2 cover = 1. - exp(-d.rg * d.rg * .4);
  float total = max(cover.x + cover.y, .0001);
  vec3 ivory = mix(vec3(.42,.40,.34), vec3(.886,.871,.831), cover.x * cover.x);
  vec3 petrol = mix(vec3(.025,.085,.09), vec3(.13,.30,.31), cover.y * cover.y);
  vec3 pigment = (ivory * cover.x + petrol * cover.y) / total;
  pigment *= .72 + .45 * diffuse;
  float glow = uPhase == 2 ? max(uGlow, .7) : uGlow;   // the flood carries more light than the signature reveal
  pigment += vec3(.91,.88,.8) * specular * smoothstep(.05,.5,density) * .76 * glow;
  pigment = clamp(pigment, 0., 1.);
  if (uPhase == 2) pigment = clamp((pigment - .45) * 1.4 + .45, 0., 1.);   // the flood's light: more contrast, black to white

  // The boundary is transported by the actual velocity/dye fields. Scene UVs stay vUv.
  vec2 q = (vUv - uOrigin) * uDims;
  float farthest = max(max(length(uOrigin*uDims), length((vec2(1.,0.)-uOrigin)*uDims)),
                       max(length((vec2(0.,1.)-uOrigin)*uDims), length((vec2(1.)-uOrigin)*uDims)));
  float bend = dot(flow, normalize(q + vec2(.001))) * .055 + (d.r-d.g) * .035;
  float distanceToFront = length(q) + bend;
  float radius = mix(-.14, farthest+.22, p);
  float edgeWidth = .035 + density * .045;
  float revealed = 1. - smoothstep(radius-edgeWidth, radius+edgeWidth, distanceToFront);
  float finish = 1. - smoothstep(.60, 1., p);
  vec3 base = uPhase == 0 ? mix(bg, front, revealed) : front;
  if (uPhase == 1) { base = front; finish = 1.; }
  if (uPhase == 2) {
    // Painting: the liquid light is the brush, the dark field the unpainted ground. Where the liquid has passed,
    // the page is painted (canvas transparent); the brush glows over the page as it travels and is gone by the end.
    float threshold = mix(.55, -.25, smoothstep(0., .5, p));   // the black goes faster (was by 80% of the flood)
    float painted = smoothstep(threshold, threshold + .2, density);
    // Swim: the dark water opens only where the light is (a window onto the page and its drawings), stays a little
    // clearer where the light has been, and clears everywhere from 60% of the flood, after the swim.
    float been = texture(uTrail, vUv).r;
    painted = mix(painted, max(max(smoothstep(.12, .45, density), smoothstep(.3, .8, been) * .22), smoothstep(.6, .85, p)), uSwim);
    // Nothing of the light goes on top of the menu (Alaa, 3 Nov 2026): there the dark field is only uncovered.
    if (all(greaterThanEqual(vUv, uMenu.xy)) && all(lessThanEqual(vUv, uMenu.zw))) { o = vec4(base, 1. - painted); return; }
    float brush = clamp((1.-exp(-total*1.4)) * glow, 0., .92) * (1. - smoothstep(.85, 1., p));   // the light lingers (was from 72%)
    // The light over what is left of the dark field.
    float cover = 1. - painted;
    float alpha = brush + cover * (1. - brush);
    o = vec4((pigment * brush + base * cover * (1. - brush)) / max(alpha, .0001), alpha);
    return;
  }
  float materialAlpha = (1.-exp(-total*1.4)) * finish * glow;
  o = vec4(mix(base, pigment, clamp(materialAlpha,0.,.92)), 1.);
}`;

    function assertAlive() {
      if (destroyed) throw new Error('Pigment: engine destroyed');
      if (gl.isContextLost()) throw new Error('Pigment: WebGL context lost');
    }
    function checkError(label) {
      const code = gl.getError();
      if (code !== gl.NO_ERROR) throw new Error('Pigment: ' + label + ' GL error 0x' + code.toString(16));
    }
    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Pigment: shader allocation failed');
      shaders.add(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Pigment: shader compile: ' + gl.getShaderInfoLog(shader));
      return shader;
    }
    function program(fragment, vertex) {
      const p = gl.createProgram();
      if (!p) throw new Error('Pigment: program allocation failed');
      programs.add(p);
      gl.attachShader(p, vertex); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + fragment));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Pigment: program link: ' + gl.getProgramInfoLog(p));
      const u = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return {p, u};
    }
    function newTexture() {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Pigment: texture allocation failed');
      textures.add(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    function target(w, h, filter) {
      const tex = newTexture();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fb = gl.createFramebuffer();
      if (!fb) throw new Error('Pigment: framebuffer allocation failed');
      framebuffers.add(fb);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Pigment: incomplete float framebuffer');
      return {tex, fb, w, h};
    }
    function pair(w, h, filter) {
      return {r: target(w,h,filter), w: target(w,h,filter), swap() { const t=this.r; this.r=this.w; this.w=t; }};
    }
    function releaseTarget(t) {
      if (!t) return;
      gl.deleteTexture(t.tex); textures.delete(t.tex);
      gl.deleteFramebuffer(t.fb); framebuffers.delete(t.fb);
    }
    function simulationTargets() {
      return [vel?.r,vel?.w,dye?.r,dye?.w,pressure?.r,pressure?.w,divergence,curl,trail?.r,trail?.w].filter(Boolean);
    }
    function imageTexture(image, existing) {
      if (!image || !image.width || !image.height) throw new Error('Pigment: a nonempty frontCanvas and backCanvas are required');
      const texture = existing || newTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return texture;
    }
    function use(pr, target) {
      gl.useProgram(pr.p);
      if (target && pr.u.uTexel != null) gl.uniform2f(pr.u.uTexel,1/target.w,1/target.h);
      return pr.u;
    }
    function tex(unit, texture) {
      gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,texture.tex || texture); return unit;
    }
    function draw(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,t ? t.fb : null);
      gl.viewport(0,0,t ? t.w : canvas.width,t ? t.h : canvas.height);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function clearFields() {
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
      gl.clearColor(0,0,0,0);
      for (const t of simulationTargets()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb); gl.viewport(0,0,t.w,t.h); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      sourceCount=0; sources.fill(0); previousAuto=null; previousPointer=null; swimPhase=0;
      origin=[.34,.43]; lastPhase=''; lastProgress=0; lastTime=0;
    }
    function resize(next) {
      assertAlive();
      if (!(next.w>0 && next.h>0 && Number.isFinite(next.w) && Number.isFinite(next.h))) throw new Error('Pigment: invalid viewport dimensions');
      width=next.w; height=next.h; ratio=clamp(Number(next.dpr)||1,.5,4);
      const maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const pw=Math.max(1,Math.round(width*ratio)), ph=Math.max(1,Math.round(height*ratio));
      if (pw>maxSize || ph>maxSize) throw new Error('Pigment: viewport exceeds texture size limit');
      canvas.width=pw; canvas.height=ph;
      shortSide=Math.max(1,Math.min(width,height)); dims=[width/shortSide,height/shortSide];
      gl.bindVertexArray(vao);
      front=imageTexture(next.frontCanvas,front); back=imageTexture(next.backCanvas,back);
      for (const t of simulationTargets()) releaseTarget(t);
      vel=dye=pressure=divergence=curl=trail=null;
      const simShort=Math.min(144,Math.max(64,Math.round(shortSide*.4)));
      const dyeShort=Math.min(640,Math.round(shortSide*ratio),Math.floor(1600/Math.max(...dims)));
      const sw=Math.max(1,Math.round(simShort*dims[0])), sh=Math.max(1,Math.round(simShort*dims[1]));
      const dw=Math.max(1,Math.round(dyeShort*dims[0])), dh=Math.max(1,Math.round(dyeShort*dims[1]));
      vel=pair(sw,sh,gl.LINEAR); dye=pair(dw,dh,gl.LINEAR); trail=pair(dw,dh,gl.LINEAR);
      pressure=pair(sw,sh,gl.NEAREST); divergence=target(sw,sh,gl.NEAREST); curl=target(sw,sh,gl.NEAREST);
      clearFields(); checkError('resize/upload');
    }
    // ink scales how much light a source pours relative to how hard it pushes the water (1 = as much).
    function addSplat(ax,ay,bx,by,vx,vy,radius,energy,ivory,petrol,dt,swirl,ink=1) {
      if (sourceCount>=8 || energy<=0) return;
      const o=sourceCount++*16, grip=1-Math.exp(-dt*35*energy);
      sources.set([ax,ay,bx,by,clamp(vx,-4,4),clamp(vy,-4,4),radius,grip,
        ivory*2.8,petrol*2.8,0,energy*.2,0,swirl,1-Math.exp(-dt*48*energy*ink),0],o);
    }
    /** The swim line at u in [0,1]: an S-curve from the fish to the sketch, in short-side units with y up. */
    function swimPoint(u) {
      const ax=flood.from[0]/shortSide, ay=(height-flood.from[1])/shortSide;
      const bx=flood.to[0]/shortSide, by=(height-flood.to[1])/shortSide, dx=bx-ax, dy=by-ay, bend=.28;
      const p1=[ax+dx/3-dy*bend,ay+dy/3+dx*bend], p2=[ax+dx*2/3+dy*bend,ay+dy*2/3-dx*bend], v=1-u;
      return [v*v*v*ax+3*v*v*u*p1[0]+3*v*u*u*p2[0]+u*u*u*bx, v*v*v*ay+3*v*v*u*p1[1]+3*v*u*u*p2[1]+u*u*u*by];
    }
    function swim(p,dt) {
      const energy=smooth(0,.05,p)*(1-smooth(SWIM_END-.06,SWIM_END+.04,p));
      if (energy<=0) { previousAuto=null; return; }
      const tau=clamp(p/SWIM_END,0,1), w=2*Math.PI*BURSTS;
      const u=clamp(tau-BURST_DEPTH/w*Math.sin(w*tau),0,1);   // speed 1 -/+ BURST_DEPTH: bursts and glides
      const beat=Math.max(0,Math.sin(w*tau-.6));                // the tail beats as it speeds up and rests in the glide
      swimPhase+=2*Math.PI*BEAT_HZ*dt*(.25+.75*beat);
      const head=swimPoint(u), ahead=swimPoint(Math.min(1,u+.01)), behind=swimPoint(Math.max(0,u-.01));
      const hl=Math.hypot(ahead[0]-behind[0],ahead[1]-behind[1])||1, hx=(ahead[0]-behind[0])/hl, hy=(ahead[1]-behind[1])/hl;
      const nx=-hy, ny=hx, swing=TAIL_SWING*(.35+.65*beat);
      // A wave runs down the body from head to tail, growing toward the tail.
      const along=x => { const s=swing*(x/BODY)**2*Math.sin(swimPhase-2*Math.PI*x/BODY); return [head[0]-hx*x+nx*s, head[1]-hy*x+ny*s]; };
      const mid=along(BODY*.5), tail=along(BODY), fin=along(BODY*1.3);
      const prev=previousAuto || head;
      const vx=clamp((head[0]-prev[0])/Math.max(dt,.001),-3,3), vy=clamp((head[1]-prev[1])/Math.max(dt,.001),-3,3);
      const lateral=.6*swing*2*Math.PI*BEAT_HZ*Math.cos(swimPhase), thrust=.25*beat;
      const band=.42+.58*Math.pow(.5+.5*Math.sin(tau*35),2);
      // Light is poured per distance swum, not per second: a glide does not pool light where the fish slows.
      const ink=clamp(Math.hypot(vx,vy)/.6,.15,1);
      addSplat(head[0],head[1],mid[0],mid[1],vx*.35,vy*.35,.02,energy,band,.15,dt,0,ink);
      addSplat(mid[0],mid[1],tail[0],tail[1],vx*.2,vy*.2,.022,energy,band*.8,.2,dt,0,ink*.7);
      // The tail pushes the water hard but leaves only a trace of light: the wake shows as thin swirls, not a cloud.
      addSplat(tail[0],tail[1],fin[0],fin[1],nx*lateral-hx*thrust,ny*lateral-hy*thrust,.025,energy*(.4+.6*beat),.12,band,dt,
        .8*Math.sign(Math.cos(swimPhase)),.12);
      previousAuto=head;
    }
    function prepareSources(phase,p,pointer,dt) {
      sourceCount=0; sources.fill(0);
      const pointerDown=pointer && pointer.down && pointer.active && Number.isFinite(pointer.x) && Number.isFinite(pointer.y);
      if (pointerDown) {
        const x=clamp(pointer.x/shortSide,0,dims[0]), y=clamp((height-pointer.y)/shortSide,0,dims[1]);
        const prev=previousPointer || [x,y];
        const vx=Number.isFinite(pointer.vx) ? pointer.vx/shortSide : (x-prev[0])/Math.max(dt,.001);
        const vy=Number.isFinite(pointer.vy) ? -pointer.vy/shortSide : (y-prev[1])/Math.max(dt,.001);
        const speed=Math.hypot(vx,vy), energy=clamp(.28+speed*.5,.28,1);
        addSplat(prev[0],prev[1],x,y,vx,vy,.028+.013*energy,energy,.55,.85,dt,1.15);
        addSplat(x+.018,y-.014,x+.024,y-.008,vx*.65,vy*.65,.018,energy*.65,1,.12,dt,-.8);
        previousPointer=[x,y]; origin=[x/dims[0],y/dims[1]];
      } else previousPointer=null;
      if (phase==='gesture') { previousAuto=null; return; }
      if (phase==='reveal' && flood) { swim(p,dt); return; }
      // One authored stroke, gated by supplied progress. No internal timeline or perpetual emitters.
      const energy=smooth(0,.08,p)*(1-smooth(.32,.58,p));
      if (energy<=0) { previousAuto=null; return; }
      const t=clamp(p/.58,0,1);
      const x=dims[0]*(.20+.57*t);
      const y=dims[1]*(.43+.085*Math.sin(t*Math.PI*1.7));
      const prev=previousAuto || [x-.012,y-.008];
      const vx=clamp((x-prev[0])/Math.max(dt,.001),-3,3), vy=clamp((y-prev[1])/Math.max(dt,.001),-3,3);
      const band=.42+.58*Math.pow(.5+.5*Math.sin(t*35),2);
      addSplat(prev[0],prev[1],x,y,vx+.8,vy+.13,.032,energy,band,.18,dt,1.6);
      addSplat(x-.025,y+.027,x+.006,y+.038,vx*.45,vy-.35,.038,energy,.12,band,dt,-1.8);
      previousAuto=[x,y];
    }
    function step(dt) {
      let u=use(pCurl,vel.r); gl.uniform1i(u.uVel,tex(0,vel.r)); draw(curl);
      u=use(pVort,vel.r); gl.uniform1i(u.uVel,tex(0,vel.r)); gl.uniform1i(u.uCurl,tex(1,curl));
      gl.uniform1f(u.uK,15); gl.uniform1f(u.uDt,dt); draw(vel.w); vel.swap();
      u=use(pDiv,vel.r); gl.uniform1i(u.uVel,tex(0,vel.r)); draw(divergence);
      u=use(pScale); gl.uniform1i(u.uSrc,tex(0,pressure.r)); gl.uniform1f(u.uK,.8); draw(pressure.w); pressure.swap();
      u=use(pJac,pressure.r); gl.uniform1i(u.uDiv,tex(1,divergence));
      for(let i=0;i<20;i++) { gl.uniform1i(u.uP,tex(0,pressure.r)); draw(pressure.w); pressure.swap(); }
      u=use(pGrad,pressure.r); gl.uniform1i(u.uP,tex(0,pressure.r)); gl.uniform1i(u.uVel,tex(1,vel.r)); draw(vel.w); vel.swap();
      u=use(pAdv); gl.uniform2f(u.uV2Uv,1/dims[0],1/dims[1]); gl.uniform2f(u.uDims,...dims);
      gl.uniform1f(u.uDt,dt); gl.uniform1i(u.uVel,tex(0,vel.r)); gl.uniform1i(u.uSrc,tex(1,vel.r));
      gl.uniform4f(u.uDiss,.2,.2,0,0); gl.uniform1f(u.uEdge,0); gl.uniform1f(u.uMax,6);
      gl.uniform1i(u.uMode,0); gl.uniform1i(u.uCount,sourceCount); gl.uniform4fv(u.uS,sources); draw(vel.w); vel.swap();
      gl.uniform1i(u.uVel,tex(0,vel.r)); gl.uniform1i(u.uSrc,tex(1,dye.r));
      gl.uniform4f(u.uDiss,.62,.62,.62,2.6); gl.uniform1f(u.uEdge,1.6); gl.uniform1f(u.uMax,10);
      gl.uniform1i(u.uMode,1); draw(dye.w); dye.swap(); steps++;
    }
    function remember() {
      const u=use(pTrail);
      gl.uniform1i(u.uTrail,tex(0,trail.r)); gl.uniform1i(u.uDye,tex(1,dye.r)); draw(trail.w); trail.swap();
    }
    function render(phase,p) {
      const u=use(pDisplay);
      gl.uniform1i(u.uDye,tex(0,dye.r)); gl.uniform1i(u.uVel,tex(1,vel.r));
      gl.uniform1i(u.uFront,tex(2,front)); gl.uniform1i(u.uBack,tex(3,back)); gl.uniform1i(u.uTrail,tex(4,trail.r));
      gl.uniform1f(u.uSwim,flood ? 1 : 0);
      gl.uniform2f(u.uDyeTexel,1/dye.r.w,1/dye.r.h); gl.uniform2f(u.uDims,...dims); gl.uniform2f(u.uOrigin,...origin);
      gl.uniform4f(u.uMenu, ...(menu ? [menu.x0/width, 1-menu.y1/height, menu.x1/width, 1-menu.y0/height] : [-1,-1,-1,-1]));
      gl.uniform1f(u.uProgress,p); gl.uniform1f(u.uGlow,glow); gl.uniform1i(u.uPhase,phase==='intro' ? 0 : phase==='gesture' ? 1 : 2); draw(null);
    }
    function frame(input) {
      assertAlive();
      const phase=input.phase;
      if (!['intro','gesture','reveal'].includes(phase)) throw new Error('Pigment: invalid phase');
      if (!Number.isFinite(input.progress) || !Number.isFinite(input.time) || !Number.isFinite(input.dt)) throw new Error('Pigment: finite time, dt and progress required');
      const p=clamp(input.progress,0,1), dt=clamp(input.dt,0,1/30);
      gl.bindVertexArray(vao); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      // A new intro/gesture starts clean. Gesture -> reveal deliberately carries its current fluid.
      // Phase-local clocks are allowed; only rewinding the same phase triggers an implicit reset.
      if ((phase==='intro' && lastPhase && lastPhase!=='intro') ||
          (phase==='gesture' && lastPhase==='intro') ||
          (phase==='reveal' && lastPhase==='intro' && flood) ||   // the swim starts in clean dark water
          (phase===lastPhase && (p<lastProgress-.02 || input.time<lastTime))) clearFields();
      if (phase!==lastPhase) previousAuto=null;
      if (dt>0 && !(p>=1 && phase!=='gesture')) {
        prepareSources(phase,p,input.pointer,dt); step(dt);
        if (phase==='reveal' && flood) remember();
      }
      render(phase,p); checkError('frame');
      lastPhase=phase; lastProgress=p; lastTime=input.time; frames++;
    }
    function reset() {
      assertAlive(); clearFields(); frames=0; steps=0; render('intro',0); checkError('reset');
    }
    function destroy() {
      if (destroyed) return;
      destroyed=true;
      for (const f of framebuffers) gl.deleteFramebuffer(f);
      for (const t of textures) gl.deleteTexture(t);
      for (const p of programs) gl.deleteProgram(p);
      for (const s of shaders) gl.deleteShader(s);
      if (vao) gl.deleteVertexArray(vao);
      framebuffers.clear(); textures.clear(); programs.clear(); shaders.clear();
      vel=dye=pressure=divergence=curl=trail=front=back=null;
    }
    function stats() {
      return {engine:'Liquid Light adaptation',webgl:2,initialized,destroyed,frames,steps,
        viewport:{w:width,h:height,dpr:ratio},simulation:vel ? [vel.r.w,vel.r.h] : null,
        dye:dye ? [dye.r.w,dye.r.h] : null,pressureIterations:20,phase:lastPhase,progress:lastProgress,glow,
        resources:{textures:textures.size,framebuffers:framebuffers.size,programs:programs.size,shaders:shaders.size,vertexArrays:vao&&!destroyed?1:0},
        artworkUV:'unwarped',internalTimers:0,internalListeners:0};
    }
    try {
      const vertex=compile(gl.VERTEX_SHADER,VS);
      pCurl=program(FS_CURL,vertex); pVort=program(FS_VORT,vertex); pDiv=program(FS_DIV,vertex);
      pScale=program(FS_SCALE,vertex); pJac=program(FS_JACOBI,vertex); pGrad=program(FS_GRAD,vertex);
      pAdv=program(FS_ADV,vertex); pTrail=program(FS_TRAIL,vertex); pDisplay=program(FS_DISPLAY,vertex);
      vao=gl.createVertexArray();
      if (!vao) throw new Error('Pigment: vertex array allocation failed');
      resize(options); reset(); initialized=true;
      return {frame,resize,reset,destroy,stats};
    } catch(error) { destroy(); throw error; }
  };
})(window);
