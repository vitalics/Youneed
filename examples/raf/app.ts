// Bouncing ball rendered with WebGL, driven by the scheduler's game loop.
//
// Physics advances every frame via this.onFrame(dt); the ball is drawn
// imperatively to a <canvas> WebGL context (no reactive props — rendering is
// the GL draw, not the component's template re-render). Two balls at different
// FPS show the scheduler cadence: 60 fps is smooth, 8 fps visibly choppy.

import { Component, html, css, createFpsScheduler } from "@youneed/dom";

const W = 320;
const H = 180;
const R = 16; // ball radius (px)

const ballStyles = css`
  :host {
    display: inline-block;
    margin: 8px;
    font-family: system-ui, sans-serif;
  }
  .label {
    font-weight: 600;
    margin-bottom: 4px;
  }
  canvas {
    display: block;
    border-radius: 10px;
    background: #eceaf4;
  }
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

// Returns a `draw(x, y)` that paints the ball, or null if WebGL is unavailable.
function createRenderer(canvas: HTMLCanvasElement): ((x: number, y: number) => void) | null {
  const gl = canvas.getContext("webgl");
  if (!gl) return null;

  // One point sprite, positioned by a uniform; the fragment shader carves a
  // circle out of the square point.
  const program = gl.createProgram()!;
  gl.attachShader(
    program,
    compile(
      gl,
      gl.VERTEX_SHADER,
      `uniform vec2 u_pos;
       uniform float u_size;
       void main() {
         gl_Position = vec4(u_pos, 0.0, 1.0);
         gl_PointSize = u_size;
       }`,
    ),
  );
  gl.attachShader(
    program,
    compile(
      gl,
      gl.FRAGMENT_SHADER,
      `precision mediump float;
       uniform vec3 u_color;
       void main() {
         vec2 c = gl_PointCoord - vec2(0.5);
         if (dot(c, c) > 0.25) discard;        // outside the circle
         float edge = smoothstep(0.25, 0.2, dot(c, c));
         gl_FragColor = vec4(u_color, edge);    // soft edge
       }`,
    ),
  );
  gl.linkProgram(program);
  gl.useProgram(program);

  const uPos = gl.getUniformLocation(program, "u_pos");
  const uSize = gl.getUniformLocation(program, "u_size");
  const uColor = gl.getUniformLocation(program, "u_color");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(uSize, R * 2);
  gl.uniform3f(uColor, 0.84, 0.25, 0.62);
  gl.viewport(0, 0, canvas.width, canvas.height);

  return (x: number, y: number) => {
    gl.clearColor(0.925, 0.918, 0.957, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // pixels -> clip space [-1, 1] (y flipped)
    gl.uniform2f(uPos, (x / canvas.width) * 2 - 1, 1 - (y / canvas.height) * 2);
    gl.drawArrays(gl.POINTS, 0, 1);
  };
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number; // reactive — visible in devtools (history of wall hits)
  shadowRoot: ShadowRoot | null;
  onFrame(cb: (dt: number) => void): () => void;
}

function startBall(self: Ball): void {
  const canvas = self.shadowRoot!.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const draw = createRenderer(canvas);
  if (!draw) return; // no WebGL (e.g. headless) — nothing to animate

  const w = canvas.width;
  const h = canvas.height;
  self.onFrame((dt) => {
    const s = dt / 1000;
    self.x += self.vx * s;
    self.y += self.vy * s;
    let bounced = false;
    if (self.x < R) (self.x = R), (self.vx = Math.abs(self.vx)), (bounced = true);
    else if (self.x > w - R) (self.x = w - R), (self.vx = -Math.abs(self.vx)), (bounced = true);
    if (self.y < R) (self.y = R), (self.vy = Math.abs(self.vy)), (bounced = true);
    else if (self.y > h - R) (self.y = h - R), (self.vy = -Math.abs(self.vy)), (bounced = true);
    if (bounced) self.bounces++; // reactive prop -> devtools records the change
    draw(self.x, self.y);
  });
}

@Component.define()
class SmoothBall extends Component("smooth-ball", { scheduler: createFpsScheduler(60) }) {
  static styles = ballStyles;
  x = 40;
  y = 30;
  vx = 150;
  vy = 105;
  @Component.prop() bounces = 0;
  onMount() {
    startBall(this);
  }
  render() {
    return html`
      <div class="label">WebGL · createFpsScheduler(60) — smooth</div>
      <canvas width=${W} height=${H}></canvas>
    `;
  }
}

@Component.define()
class ChoppyBall extends Component("choppy-ball", { scheduler: createFpsScheduler(8) }) {
  static styles = ballStyles;
  x = 40;
  y = 30;
  vx = 150;
  vy = 105;
  @Component.prop() bounces = 0;
  onMount() {
    startBall(this);
  }
  render() {
    return html`
      <div class="label">WebGL · createFpsScheduler(8) — choppy</div>
      <canvas width=${W} height=${H}></canvas>
    `;
  }
}
