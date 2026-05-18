'use client'

import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { createPortal } from 'react-dom'
import { type ThemeMode, useTheme } from '@/contexts/ThemeContext'

// --- Hex color helpers ---

function hexToRgbNorm(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return [0.9, 0.9, 0.9]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

type OrbColors = {
  main: [number, number, number]
  low: [number, number, number]
  mid: [number, number, number]
  high: [number, number, number]
}

function deriveOrbColors(hex: string, isDarkBg: boolean): OrbColors {
  const [r, g, b] = hexToRgbNorm(hex)
  const [h, s, l] = rgbToHsl(r, g, b)

  if (isDarkBg) {
    const ml = Math.min(l + 0.2, 0.4)
    const sl = Math.min(l + 0.18, 0.36)
    return {
      main: hslToRgb(h, s * 0.8, ml),
      low: hslToRgb(h, s * 0.75, sl),
      mid: hslToRgb((h + 0.03) % 1, s * 0.75, (ml + sl) / 2 + 0.02),
      high: hslToRgb(h, s * 0.55, Math.min(ml + 0.08, 0.55)),
    }
  }
  // For very light/desaturated colors, add more depth
  const isNearWhite = l > 0.9 && s < 0.15
  const lowL = isNearWhite ? 0.78 : Math.max(l - 0.08, 0.55)
  const midL = isNearWhite ? 0.9 : Math.max(l - 0.02, 0.6)
  const mainL = isNearWhite ? 0.95 : Math.max(l, 0.7)
  return {
    main: hslToRgb(h, Math.min(s * 0.8, 0.7), mainL),
    low: hslToRgb(h, Math.min(s * 0.85, 0.75), lowL),
    mid: hslToRgb((h + 0.03) % 1, Math.min(s * 0.8, 0.7), midL),
    high: hslToRgb(h, Math.min(s * 0.3, 0.25), Math.min(l + 0.15, 0.95)),
  }
}

// --- Procedural noise texture ---

function generateNoiseTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  // Simple value noise with smoothing
  const rand = (x: number, y: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return n - Math.floor(n)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Two independent noise channels for R and G
      data[i] = Math.floor(
        (rand(x * 0.05, y * 0.05) * 0.5 +
          rand(x * 0.1 + 100, y * 0.1 + 100) * 0.3 +
          rand(x * 0.2 + 200, y * 0.2 + 200) * 0.2) *
          255,
      )
      data[i + 1] = Math.floor(
        (rand(x * 0.05 + 50, y * 0.05 + 50) * 0.5 +
          rand(x * 0.1 + 150, y * 0.1 + 150) * 0.3 +
          rand(x * 0.2 + 250, y * 0.2 + 250) * 0.2) *
          255,
      )
      data[i + 2] = Math.floor(rand(x * 0.03 + 300, y * 0.03 + 300) * 255)
      data[i + 3] = 255
    }
  }
  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

// --- Shaders ---

const VERTEX_SHADER = `#version 300 es
out vec2 out_uv;
const vec4 pos[6] = vec4[](
  vec4(-1,-1,0,1), vec4(3,-1,0,1), vec4(-1,3,0,1),
  vec4(-1,-1,0,1), vec4(3,-1,0,1), vec4(-1,3,0,1)
);
void main() {
  vec4 p = pos[gl_VertexID];
  out_uv = p.xy * 0.5 + 0.5;
  out_uv.y = 1.0 - out_uv.y;
  gl_Position = p;
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define NUM_OCTAVES 4

in vec2 out_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_stateTime;
uniform vec2 u_viewport;
uniform sampler2D uTextureNoise;
uniform vec3 u_bloopColorMain;
uniform vec3 u_bloopColorLow;
uniform vec3 u_bloopColorMid;
uniform vec3 u_bloopColorHigh;
uniform vec2 u_mouse;
uniform float u_mouseStrength;

float scaled(float e0, float e1, float x) { return clamp((x - e0) / (e1 - e0), 0.0, 1.0); }
float fixedSpring(float t, float d) {
  float s = mix(1.0 - exp(-2.71828 * 2.0 * t) * cos((1.0 - d) * 115.0 * t), 1.0, clamp(t, 0.0, 1.0));
  return s * (1.0 - t) + t;
}

vec3 blendSoftDarken(vec3 base, vec3 blend, float opacity) {
  vec3 result = base * blend;
  return result * opacity + base * (1.0 - opacity);
}

vec4 permute(vec4 x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }

float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return pow(mix(
    mix(rand(ip), rand(ip + vec2(1,0)), u.x),
    mix(rand(ip + vec2(0,1)), rand(ip + vec2(1,1)), u.x), u.y), 2.0);
}

float fbm(vec2 x) {
  float v = 0.0, a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float cnoise(vec3 P) {
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = vec4(Pi0.z); vec4 iz1 = vec4(Pi1.z);
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(vec4(0.0), gx0) - 0.5);
  gy0 -= sz0 * (step(vec4(0.0), gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(vec4(0.0), gx1) - 0.5);
  gy1 -= sz1 * (step(vec4(0.0), gy1) - 0.5);
  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000,Pf0); float n100 = dot(g100,vec3(Pf1.x,Pf0.yz));
  float n010 = dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)); float n110 = dot(g110,vec3(Pf1.xy,Pf0.z));
  float n001 = dot(g001,vec3(Pf0.xy,Pf1.z)); float n101 = dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z));
  float n011 = dot(g011,vec3(Pf0.x,Pf1.yz)); float n111 = dot(g111,Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000,n100,n010,n110), vec4(n001,n101,n011,n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  return 2.2 * mix(n_yz.x, n_yz.y, fade_xyz.x);
}

void main() {
  vec2 st = out_uv - 0.5;
  st.y *= u_viewport.y / u_viewport.x;

  float entryAnimation = fixedSpring(scaled(0.0, 2.0, u_stateTime), 0.92);
  float radius = 0.5 * mix(0.9, 1.0, entryAnimation);
  float scaleFactor = 1.0 / (2.0 * radius);
  vec2 uv = st * scaleFactor + 0.5;
  uv.y = 1.0 - uv.y;

  // Mouse warp: donut-shaped push (rounded hole, not a cone)
  vec2 mouseUv = u_mouse;
  mouseUv.y = 1.0 - mouseUv.y;
  vec2 awayFromMouse = uv - mouseUv;
  float mouseDist = length(awayFromMouse);
  // Ramp up from center, peak at ~0.12, then fade out — no sharp tip
  float innerRamp = smoothstep(0.0, 0.12, mouseDist);
  float outerFade = exp(-mouseDist * mouseDist * 6.0);
  vec2 pushDir = awayFromMouse / (mouseDist + 0.03);
  uv += pushDir * innerRamp * outerFade * u_mouseStrength * 0.35;

  float time = u_time * 0.85;
  float verticalOffset = 0.09;

  // Reduced noise scale (0.7x → smaller, smoother clouds)
  float noiseX = cnoise(vec3(uv * 0.7 + vec2(0.0, 74.857), time * 0.3));
  float noiseY = cnoise(vec3(uv * 0.7 + vec2(203.913, 10.0), time * 0.3));
  uv += vec2(noiseX * 2.0, noiseY) * 0.35;

  // Reduced watercolor noise scale (12 and 26 instead of 18 and 39.6)
  float noiseA = cnoise(vec3(uv * 12.0 + vec2(344.913, 0.0), time * 0.3))
               + cnoise(vec3(uv * 26.0 + vec2(723.937, 0.0), time * 0.4)) * 0.5;
  uv += noiseA * 0.015;
  uv.y -= verticalOffset;

  float texR0 = texture(uTextureNoise, uv * 0.7).r;
  float texG0 = texture(uTextureNoise, vec2(uv.x * 0.7, 1.0 - uv.y * 0.7)).g;
  float tDisp0 = mix(texR0 - 0.5, texG0 - 0.5, (sin(time) + 1.0) * 0.5) * 0.12;

  vec2 tuv1 = uv * 0.7 + vec2(63.861, 368.937);
  float tDisp1 = mix(texture(uTextureNoise, tuv1).r - 0.5,
                     texture(uTextureNoise, vec2(tuv1.x, 1.0 - tuv1.y)).g - 0.5,
                     (sin(time) + 1.0) * 0.5) * 0.12;

  vec2 tuv3 = uv * 0.7 + vec2(453.163, 1188.808);
  float tDisp3 = mix(texture(uTextureNoise, tuv3).r - 0.5,
                     texture(uTextureNoise, vec2(tuv3.x, 1.0 - tuv3.y)).g - 0.5,
                     (sin(time) + 1.0) * 0.5) * 0.12;
  uv += tDisp0;

  // Reduced fbm scale (0.85 instead of 1.25)
  vec2 sf = uv * 0.85;
  vec2 q = vec2(fbm(sf * 0.4 + 0.12 * time), fbm(sf * 0.4 + 0.12 * time));
  vec2 r = vec2(fbm(sf + q + vec2(0.3, 9.2) + 0.15 * time),
                fbm(sf + q + vec2(8.3, 0.8) + 0.126 * time));
  float f = fbm(sf + r - q);
  float fullFbm = pow((f + 0.6*f*f + 0.7*f + 0.5) * 0.5, 0.55) * 1.2;

  float blurR = 1.8;

  vec2 snUv = (uv + vec2((fullFbm - 0.5) * 1.2) + vec2(0, 0.025) + tDisp0);
  float sn = noise(snUv * 1.5 + vec2(0, time * 0.5)) * 3.0;
  float sn2 = pow(smoothstep(sn - 1.2*blurR, sn + 1.2*blurR, (snUv.y - 0.5) * 5.0 + 0.5), 0.8);

  vec2 snUvB = (uv + vec2((fullFbm - 0.5) * 0.85) + vec2(0, 0.025) + tDisp1);
  float snB = noise(snUvB * 3.0 + vec2(293, time)) * 2.8;
  float sn2B = pow(smoothstep(snB - 0.9*blurR, snB + 0.9*blurR, (snUvB.y - 0.6) * 5.0 + 0.5), 0.9);

  vec2 snUvC = (uv + vec2((fullFbm - 0.5) * 1.1) + tDisp3);
  float snC = noise(snUvC * 4.5 + vec2(153, time * 1.2)) * 2.6;
  float sn2C = smoothstep(snC - 0.7*blurR, snC + 0.7*blurR, (snUvC.y - 0.9) * 6.0 + 0.5);

  vec3 col = blendSoftDarken(u_bloopColorMain, u_bloopColorLow, 1.0 - sn2);
  col = blendSoftDarken(col, mix(u_bloopColorMain, u_bloopColorMid, 1.0 - sn2B), sn2);
  col = mix(col, mix(u_bloopColorMain, u_bloopColorHigh, 1.0 - sn2C), sn2 * sn2B);

  float dist = length(st);
  float clampedShape = smoothstep(0.0075, 0.0, dist - radius);
  fragColor = vec4(col * clampedShape, clampedShape);
}`

// --- Component ---

export default function CloudShader({
  size = 100,
  pickerAlign = 'right',
}: {
  size?: number
  pickerAlign?: 'left' | 'center' | 'right'
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const startTimeRef = useRef(performance.now())
  const sizeRef = useRef({ width: 0, height: 0 })
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const mouseStrengthRef = useRef(0)
  const targetMouseStrengthRef = useRef(0)
  const colorsRef = useRef<OrbColors>({
    main: [0.9, 0.9, 0.9],
    low: [0.7, 0.7, 0.7],
    mid: [0.8, 0.8, 0.8],
    high: [1, 1, 1],
  })

  const [showPicker, setShowPicker] = useState(false)
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({})
  const { themeState, updateTheme, shouldUseDarkText, isHydrated } = useTheme()

  // Keep colors ref in sync
  useEffect(() => {
    const isDark = !shouldUseDarkText()
    colorsRef.current = deriveOrbColors(themeState.color, isDark)
  }, [themeState.color, shouldUseDarkText])

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.orb-picker-area')) setShowPicker(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPicker])

  // WebGL setup + render loop
  // biome-ignore lint/correctness/useExhaustiveDependencies: isHydrated gates canvas rendering, so the WebGL setup must rerun after hydration.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(size * dpr)
    canvas.height = Math.floor(size * dpr)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    sizeRef.current = { width: canvas.width, height: canvas.height }

    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true })
    if (!gl) return

    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)

    const vs = gl.createShader(gl.VERTEX_SHADER)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    if (!vs || !fs) return

    gl.shaderSource(vs, VERTEX_SHADER)
    gl.compileShader(vs)

    gl.shaderSource(fs, FRAGMENT_SHADER)
    gl.compileShader(fs)

    if (
      !gl.getShaderParameter(vs, gl.COMPILE_STATUS) ||
      !gl.getShaderParameter(fs, gl.COMPILE_STATUS)
    ) {
      return
    }

    const program = gl.createProgram()
    if (!program) return

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

    // biome-ignore lint/correctness/useHookAtTopLevel: this is WebGLRenderingContext.useProgram, not a React hook.
    gl.useProgram(program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    const uloc = (n: string) => gl.getUniformLocation(program, n)
    const uTime = uloc('u_time')
    const uStateTime = uloc('u_stateTime')
    const uViewport = uloc('u_viewport')
    const uTexNoise = uloc('uTextureNoise')
    const uMain = uloc('u_bloopColorMain')
    const uLow = uloc('u_bloopColorLow')
    const uMid = uloc('u_bloopColorMid')
    const uHigh = uloc('u_bloopColorHigh')
    const uMouse = uloc('u_mouse')
    const uMouseStrength = uloc('u_mouseStrength')

    const noiseTexture = generateNoiseTexture(gl)

    startTimeRef.current = performance.now()
    phaseRef.current = 0

    let lastTime = performance.now()

    const render = () => {
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      phaseRef.current += dt * 0.95
      const stateTime = (now - startTimeRef.current) / 1000

      const { width, height } = sizeRef.current
      gl.viewport(0, 0, width, height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform1f(uTime, phaseRef.current)
      gl.uniform1f(uStateTime, stateTime)
      gl.uniform2f(uViewport, width, height)

      // Smooth mouse strength toward target
      const targetStr = targetMouseStrengthRef.current
      const curStr = mouseStrengthRef.current
      mouseStrengthRef.current += (targetStr - curStr) * Math.min(dt * 6, 1)

      const c = colorsRef.current
      gl.uniform3fv(uMain, c.main)
      gl.uniform3fv(uLow, c.low)
      gl.uniform3fv(uMid, c.mid)
      gl.uniform3fv(uHigh, c.high)
      gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y)
      gl.uniform1f(uMouseStrength, mouseStrengthRef.current)

      if (noiseTexture) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, noiseTexture)
        gl.uniform1i(uTexNoise, 0)
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      animRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animRef.current)
      if (noiseTexture) gl.deleteTexture(noiseTexture)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      if (vao) gl.deleteVertexArray(vao)
    }
  }, [size, isHydrated])

  if (!isHydrated) return null

  const isDark = !shouldUseDarkText()
  const pickerBg = isDark ? 'bg-white/10' : 'bg-neutral-950/[4%]'
  const buttonBg = isDark ? 'bg-white/10 text-white' : 'bg-neutral-950/[6%] text-neutral-950'

  return (
    <div className="orb-picker-area relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!showPicker && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            const spaceAbove = rect.top
            const pickerHeight = 240
            const pickerWidth = 240

            const horizontal: React.CSSProperties =
              pickerAlign === 'left'
                ? { left: Math.max(8, rect.left) }
                : pickerAlign === 'center'
                  ? { left: Math.max(8, rect.left + rect.width / 2 - pickerWidth / 2) }
                  : { right: Math.max(8, window.innerWidth - rect.right) }

            if (spaceAbove > pickerHeight) {
              setPickerStyle({
                bottom: window.innerHeight - rect.top + 8,
                ...horizontal,
              })
            } else {
              setPickerStyle({
                top: rect.bottom + 8,
                ...horizontal,
              })
            }
          }
          setShowPicker(!showPicker)
        }}
        className="cursor-pointer block rounded-full focus-visible:outline-none focus-visible:opacity-60"
        aria-label="Change theme color"
      >
        <canvas
          ref={canvasRef}
          className="rounded-full hover:scale-110 transition-transform duration-500"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            mouseRef.current = {
              x: (e.clientX - rect.left) / rect.width,
              y: (e.clientY - rect.top) / rect.height,
            }
            targetMouseStrengthRef.current = 1
          }}
          onMouseLeave={() => {
            targetMouseStrengthRef.current = 0
          }}
        />
      </button>

      {showPicker &&
        createPortal(
          <div
            style={pickerStyle}
            className={`orb-picker-area fixed p-3 ${pickerBg} backdrop-blur-xl rounded-xl w-60 z-50`}
          >
            <HexColorPicker
              color={themeState.color}
              onChange={(color) => updateTheme({ mode: 'custom', color })}
              className="!w-full !h-44"
            />
            <div className="flex gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => updateTheme({ mode: 'light' as ThemeMode, color: '#fafafa' })}
                className={`flex-1 px-3 h-8 pb-0.5 flex items-center justify-center rounded-lg font-[450] text-sm ${buttonBg} hover:opacity-60 transition-opacity cursor-pointer`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => updateTheme({ mode: 'dark' as ThemeMode, color: '#0a0a0a' })}
                className={`flex-1 px-3 h-8 pb-0.5 flex items-center justify-center rounded-lg font-[450] text-sm ${buttonBg} hover:opacity-60 transition-opacity cursor-pointer`}
              >
                Dark
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
