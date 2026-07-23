import { useEffect, useRef } from 'react';

import type { Viewport } from '../ipc/types';

/**
 * Grid infinito desenhado na GPU.
 *
 * Camada de fundo do canvas hibrido: aqui entram tambem as arestas entre nos (M4).
 * Um quad de tela inteira; o fragment shader calcula a coordenada de mundo de cada
 * pixel, entao nao ha geometria proporcional ao zoom.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec3 u_background;
uniform vec3 u_line;

out vec4 outColor;

// Intensidade da grade de passo "step", com anti-aliasing por derivada.
float grid(vec2 world, float step) {
  vec2 g = abs(fract(world / step - 0.5) - 0.5) / fwidth(world / step);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 world = screen / u_zoom + u_pan;

  // Duas escalas: a grossa some no zoom-out, a fina no zoom-in.
  float fina = grid(world, 32.0) * clamp(u_zoom, 0.0, 1.0) * 0.35;
  float grossa = grid(world, 160.0) * 0.55;

  outColor = vec4(mix(u_background, u_line, max(fina, grossa)), 1.0);
}`;

type Rgb = [number, number, number];

/** Lê uma variável CSS de cor (hex) da raiz como rgb em 0..1, para alimentar o shader. */
function corDaRaiz(nome: string, fallback: Rgb): Rgb {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(valor);
  if (!m || m[1] === undefined) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('shader:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function CanvasBackground({ viewport }: { viewport: Viewport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(v: Viewport) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) {
      // ponytail: sem WebGL2 o app continua utilizavel, so perde o grid.
      console.warn('WebGL2 indisponivel; canvas sem grid');
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('programa webgl:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posicao = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posicao);
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uPan = gl.getUniformLocation(program, 'u_pan');
    const uZoom = gl.getUniformLocation(program, 'u_zoom');
    const uBackground = gl.getUniformLocation(program, 'u_background');
    const uLine = gl.getUniformLocation(program, 'u_line');

    // Cores lidas do tema atual, atualizadas a cada draw para acompanhar light/dark.
    const aplicarCores = () => {
      gl.uniform3fv(uBackground, corDaRaiz('--bg', [0.055, 0.06, 0.07]));
      gl.uniform3fv(uLine, corDaRaiz('--border', [0.22, 0.24, 0.28]));
    };

    drawRef.current = (v: Viewport) => {
      const dpr = window.devicePixelRatio || 1;
      const largura = Math.round(canvas.clientWidth * dpr);
      const altura = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== largura || canvas.height !== altura) {
        canvas.width = largura;
        canvas.height = altura;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      aplicarCores();
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform2f(uPan, v.pan.x, v.pan.y);
      // O shader trabalha em pixels do dispositivo; o zoom acompanha o DPR.
      gl.uniform1f(uZoom, v.zoom * dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const aoRedimensionar = () => drawRef.current(viewport);
    window.addEventListener('resize', aoRedimensionar);
    // Redesenha quando o tema muda (data-theme na raiz).
    const observer = new MutationObserver(() => drawRef.current(viewport));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    aoRedimensionar();

    return () => {
      window.removeEventListener('resize', aoRedimensionar);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      drawRef.current = () => {};
    };
    // Recriar o contexto a cada pan seria absurdo: o desenho usa drawRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawRef.current(viewport);
  }, [viewport]);

  return <canvas ref={canvasRef} className="canvas-background" />;
}
