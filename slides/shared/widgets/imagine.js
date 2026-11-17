// A robot that imagines before it acts. The robot arm (bottom left, the real world) has to push the box into the
// goal. Before moving, it tries candidate action sequences in its model of the world, drawn as a thought cloud:
// three steps up (the box stays), one step right (not far enough), three steps right (goal reached). Only then
// does it execute the plan that worked.
// The model of the world comes in two kinds:
//   model: "designed"  a simulation engine written by engineers: it is there from the start (a grid, wireframe bodies)
//   model: "learned"   there is no model at first. The robot moves about while a camera records it, the frames
//                      fill a dataset, a model is trained on them, and the thought cloud comes out of the training
//                      box (soft shapes, a strip of film). Then the robot plans with it, as in the designed case.
// The task, the candidates and the planning are the same in both, so that two slides can be compared.
// config: { model: "designed" | "learned", width: 1160 (the height follows: 460 at 1160),
//           still: ms (optional: no animation, the frame at that time) }
import { C, h, isPrint, loopPlayer, arrow } from './util.js';

// ---- the task, in world units (x to the right, y up, the floor at y = 0) ----
const SH = [0.6, 1.0], LINK = 1.6;                 // shoulder joint, length of both links
const PAD_HW = 0.09, PAD_HH = 0.3, BOX_H = 0.35;   // half sizes of the pusher pad and of the box
const EE0 = [1.9, 0.4], BOX0 = 2.6, GOAL = 3.84, STEP = 0.5, WORLD_W = 4.5;
const CANDS = [['up', 'up', 'up'], ['right'], ['right', 'right', 'right']];              // the plans tried in the model
const DEMOS = [['up', 'up', 'right'], ['right', 'left', 'right'], ['right', 'right']];   // what the robot does while it is recorded
const FRAMES_PER_STEP = 3;                                                               // frames the camera keeps per step

const ease = u => u * u * (3 - 2 * u);
const atGoal = box => Math.abs(box - GOAL) < 0.02;

// The state after p steps of a plan (p may be fractional): the pad moves, the box is pushed when the pad touches it.
function sim(actions, p) {
  let x = EE0[0], y = EE0[1], box = BOX0;
  for (let i = 0; i < actions.length && i < p; i++) {
    const f = Math.min(1, p - i) * STEP;
    if (actions[i] === 'up') y += f;
    else if (actions[i] === 'left') x -= f;
    else { x += f; if (y - PAD_HH < 2 * BOX_H) box = Math.max(box, x + PAD_HW + BOX_H); }
  }
  return { x, y, box };
}
const stepped = (actions, v) => sim(actions, Math.floor(v) + ease(v - Math.floor(v)));   // each step eased
const WIN = CANDS.findIndex(c => atGoal(sim(c, c.length).box));

// Elbow of the two-link arm for a wrist position (elbow up).
function elbow(wx, wy) {
  const dx = wx - SH[0], dy = wy - SH[1], d = Math.min(2 * LINK - 1e-3, Math.hypot(dx, dy));
  const a = Math.atan2(dy, dx) + Math.acos(d / (2 * LINK));
  return [SH[0] + LINK * Math.cos(a), SH[1] + LINK * Math.sin(a)];
}

// ---- layout, in the widget's own pixels (1160 x 460, scaled to the configured width) ----
const BW = 1160, BH = 460;
const REAL = { ox: 30, oy: 404, s: 95 };                       // the real scene: origin (floor level) and scale
const CLOUD = { x: 505, y: 12, w: 640, h: 292 };
const PANEL = { x: CLOUD.x + 218, y: CLOUD.y + 80, w: 390, h: 196 };
const MINI = { ox: PANEL.x + 40, oy: PANEL.y + PANEL.h - 12, s: 68 };
const ROWS = { x: CLOUD.x + 40, y: CLOUD.y + 80, w: 160, h: 44, gap: 10 };
const CAMERA = { x: 340, y: 50, w: 50, h: 32 };
const DATA = { x: 566, y: 24, w: 542, h: 164, sx: 580, sy: 58, tw: 58, th: 36, gap: 6, cols: 8 };   // the dataset: 3 rows of 8 frames
const TRAIN = { x: 716, y: 212, w: 242, h: 88 };
const FLY = 380;   // ms a recorded frame takes from the camera to its place in the dataset

// ---- timeline ----
function timeline(learned) {
  const segs = []; let T = 0;
  const seg = (kind, dur, i) => { segs.push({ kind, dur, i, t0: T }); T += dur; };
  const q = learned ? 0.8 : 1;   // the planning runs a little faster where recording and training come first
  if (learned) {
    seg('intro', 500);
    DEMOS.forEach((d, i) => { seg('rec', d.length * 430, i); seg('reset', 320, i); });
    seg('train', 2400); seg('birth', 900);
  } else seg('intro', 800);
  CANDS.forEach((c, i) => { seg('select', 450 * q, i); seg('roll', c.length * 560 * q, i); seg('verdict', (i === WIN ? 1300 : 850) * q, i); });
  seg('handoff', 900); seg('exec', CANDS[WIN].length * 680); seg('done', 1900);
  // the frames the camera records: time of capture and what it shows
  const frames = [];
  segs.filter(s => s.kind === 'rec').forEach(s => {
    const d = DEMOS[s.i], n = d.length * FRAMES_PER_STEP;
    for (let j = 0; j < n; j++) { const f = (j + 0.5) / n; frames.push({ t: s.t0 + f * s.dur, st: stepped(d, f * d.length) }); }
  });
  return { segs, T, frames, tPrint: segs.find(s => s.kind === 'handoff').t0 - 50 };   // the still for the PDF: the plan that works, imagined
}

export function mount(el, cfg) {
  const learned = cfg.model === 'learned';
  const { segs: SEGS, T: T_RUN, frames: FRAMES, tPrint: T_PRINT } = timeline(learned);
  const W = cfg.width || BW, k = W / BW, H = Math.round(BH * k);
  const MC = learned ? C.green : C.blue, mrgb = learned ? '95,211,141' : '90,176,255';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas', { width: Math.round(W * dpr), height: Math.round(H * dpr), style: `width:${W}px; height:${H}px` });
  const main = canvas.getContext('2d');
  const layer = h('canvas', { width: canvas.width, height: canvas.height }), lg = layer.getContext('2d');
  let g = main;   // the context the drawing helpers below write to: the canvas, or the cloud's layer
  const FONT = 'Inter, "Segoe UI", Arial, sans-serif';
  const STAGES = learned
    ? [['Record', 'a camera records what the robot does'], ['Train', 'a model learns to predict what will happen'], ['Imagine', 'try candidate actions in the learned model'], ['Act', 'execute the plan that reaches the goal']]
    : [['Imagine', 'try candidate actions in the model of the world'], ['Act', 'execute the plan that reaches the goal']];

  // One scene (robot, box, goal, floor). look: 'real' | 'model'. ghost: only the moving parts, faint.
  function scene({ ox, oy, s }, st, look, ghost = false, alpha = 1) {
    const X = x => ox + x * s, Y = y => oy - y * s;
    const reached = atGoal(st.box), model = look === 'model', soft = model && learned;
    g.save(); g.globalAlpha *= alpha; g.lineJoin = 'round'; g.lineCap = 'round';
    if (!ghost) {
      g.strokeStyle = model ? `rgba(${mrgb},0.55)` : C.dim; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(WORLD_W), Y(0)); g.stroke();
      const gs = BOX_H + 0.07;
      g.setLineDash(reached ? [] : [6, 5]); g.strokeStyle = reached ? C.green : (model ? `rgba(${mrgb},0.8)` : C.fg); g.lineWidth = reached ? 3 : 2;
      g.beginPath(); g.roundRect(X(GOAL - gs), Y(2 * gs), 2 * gs * s, 2 * gs * s, 6); g.stroke(); g.setLineDash([]);
      if (!model) { g.fillStyle = reached ? C.green : C.dim; g.font = `600 15px ${FONT}`; g.textAlign = 'center'; g.fillText(reached ? 'goal reached' : 'goal', X(GOAL), Y(2 * gs) - 9); }
    }
    if (soft) { g.shadowColor = `rgba(${mrgb},0.9)`; g.shadowBlur = ghost ? 4 : 9; }
    // the box
    const bx = X(st.box - BOX_H), by = Y(2 * BOX_H), bs = 2 * BOX_H * s;
    g.beginPath(); g.roundRect(bx, by, bs, bs, 5);
    if (!model) { g.fillStyle = '#c98500'; g.fill(); g.strokeStyle = 'rgba(21,23,28,0.6)'; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(231,233,238,0.4)'; g.fillRect(bx + bs * 0.42, by + 1, bs * 0.16, bs * 0.3); }
    else if (soft) { g.fillStyle = `rgba(${mrgb},${ghost ? 0.16 : 0.62})`; g.fill(); }
    else { g.fillStyle = `rgba(${mrgb},${ghost ? 0.05 : 0.14})`; g.fill(); g.strokeStyle = ghost ? `rgba(${mrgb},0.35)` : C.blue; g.lineWidth = 2; g.stroke(); }
    // the arm
    const wr = [st.x, st.y + PAD_HH], el = elbow(wr[0], wr[1]);
    if (!ghost) {
      const lw = 0.17 * s, jr = 0.11 * s;
      g.beginPath(); g.roundRect(X(0.25), Y(0.82), 0.7 * s, 0.82 * s, 6);
      if (!model) { g.fillStyle = '#5a606c'; g.fill(); }
      else if (soft) { g.fillStyle = `rgba(${mrgb},0.3)`; g.fill(); }
      else { g.fillStyle = C.bg3; g.fill(); g.strokeStyle = C.fg; g.lineWidth = 2; g.stroke(); }
      const links = () => { g.beginPath(); g.moveTo(X(SH[0]), Y(SH[1])); g.lineTo(X(el[0]), Y(el[1])); g.lineTo(X(wr[0]), Y(wr[1])); g.stroke(); };
      if (!model) { g.strokeStyle = '#c9ccd4'; g.lineWidth = lw; links(); }
      else if (soft) { g.strokeStyle = `rgba(${mrgb},0.5)`; g.lineWidth = lw; links(); }
      else { g.strokeStyle = C.bg3; g.lineWidth = lw; links(); g.strokeStyle = C.fg; g.lineWidth = 2; links(); }
      for (const [jx, jy] of [SH, el, wr]) {
        g.beginPath(); g.arc(X(jx), Y(jy), jr, 0, 7);
        if (!model) { g.fillStyle = C.purple; g.fill(); }
        else if (soft) { g.fillStyle = `rgba(${mrgb},0.9)`; g.fill(); }
        else { g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.fg; g.lineWidth = 2; g.stroke(); }
      }
    }
    // the pusher pad
    g.beginPath(); g.roundRect(X(st.x - PAD_HW), Y(st.y + PAD_HH), 2 * PAD_HW * s, 2 * PAD_HH * s, 4);
    if (!model) { g.fillStyle = C.fg; g.fill(); }
    else if (soft) { g.fillStyle = `rgba(${mrgb},${ghost ? 0.18 : 0.9})`; g.fill(); }
    else { g.fillStyle = ghost ? 'rgba(0,0,0,0)' : C.bg3; g.fill(); g.strokeStyle = ghost ? `rgba(${mrgb},0.35)` : C.fg; g.lineWidth = 2; g.stroke(); }
    g.restore();
  }

  // A recorded frame: a small picture of the scene.
  function thumb(x, y, st, alpha = 1) {
    const w = DATA.tw, th = DATA.th, s = (w - 6) / WORLD_W, X = v => x + 3 + v * s, Y = v => y + th - 4 - v * s;
    g.save(); g.globalAlpha *= alpha; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.roundRect(x, y, w, th, 4); g.fillStyle = C.bg; g.fill(); g.strokeStyle = `rgba(${mrgb},0.6)`; g.lineWidth = 1; g.stroke(); g.clip();
    g.strokeStyle = C.dim; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(WORLD_W), Y(0)); g.stroke();
    g.fillStyle = '#c98500'; g.fillRect(X(st.box - BOX_H), Y(2 * BOX_H), 2 * BOX_H * s, 2 * BOX_H * s);
    const wr = [st.x, st.y + PAD_HH], el = elbow(wr[0], wr[1]);
    g.strokeStyle = '#c9ccd4'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(X(SH[0]), Y(SH[1])); g.lineTo(X(el[0]), Y(el[1])); g.lineTo(X(wr[0]), Y(wr[1])); g.stroke();
    g.fillStyle = C.fg; g.fillRect(X(st.x - PAD_HW) - 0.5, Y(st.y + PAD_HH), 2 * PAD_HW * s + 1, 2 * PAD_HH * s);
    g.restore();
  }
  const slot = i => [DATA.sx + (i % DATA.cols) * (DATA.tw + DATA.gap), DATA.sy + Math.floor(i / DATA.cols) * (DATA.th + DATA.gap)];

  // The camera that watches the robot, the dataset its frames go into, and the training box below it.
  function recording(ms, kind, u) {
    const { x, y, w, h: ch } = CAMERA, lens = [x - 14, y + ch / 2];
    g.save(); g.lineJoin = 'round';
    g.strokeStyle = 'rgba(154,161,174,0.4)'; g.lineWidth = 1.5; g.setLineDash([5, 6]);   // what the camera sees
    g.beginPath(); g.moveTo(lens[0], lens[1]); g.lineTo(52, 228); g.moveTo(lens[0], lens[1]); g.lineTo(452, 398); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.bg3; g.strokeStyle = C.fg; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 1, y + 9); g.lineTo(lens[0], y + 2); g.lineTo(lens[0], y + ch - 2); g.lineTo(x + 1, y + ch - 9); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(x, y, w, ch, 6); g.fill(); g.stroke();
    if (kind === 'rec' && ms % 600 < 380) { g.fillStyle = C.red; g.beginPath(); g.arc(x + w - 12, y + 11, 5, 0, 7); g.fill(); }
    g.fillStyle = C.dim; g.font = `600 13px ${FONT}`; g.textAlign = 'center'; g.fillText('CAMERA', x + w / 2 - 6, y + ch + 19);
    // the dataset
    g.beginPath(); g.roundRect(DATA.x, DATA.y, DATA.w, DATA.h, 10); g.fillStyle = C.bg3; g.fill(); g.strokeStyle = C.line; g.lineWidth = 1.5; g.stroke();
    const landed = FRAMES.filter(f => ms >= f.t + FLY).length;
    g.textAlign = 'left'; g.fillStyle = C.dim; g.font = `600 13px ${FONT}`; g.fillText('RECORDED DATA', DATA.sx, DATA.y + 24);
    g.textAlign = 'right'; g.fillStyle = landed ? C.fg : C.dim; g.fillText(`${landed} frames`, DATA.x + DATA.w - 14, DATA.y + 24);
    FRAMES.forEach((f, i) => {
      const [sx, sy] = slot(i);
      if (ms >= f.t + FLY) thumb(sx, sy, f.st);
      else { g.beginPath(); g.roundRect(sx, sy, DATA.tw, DATA.th, 4); g.strokeStyle = 'rgba(154,161,174,0.18)'; g.lineWidth = 1; g.stroke(); }
    });
    FRAMES.forEach((f, i) => {   // frames on their way from the camera
      if (ms < f.t || ms >= f.t + FLY) return;
      const [sx, sy] = slot(i), p = ease((ms - f.t) / FLY);
      thumb(x + (sx - x) * p, y + (sy - y) * p, f.st, 0.5 + 0.5 * p);
    });
    // training
    const on = kind === 'train' || kind === 'birth', p = kind === 'train' ? u : kind === 'birth' ? 1 : 0;
    g.globalAlpha *= on ? 1 : 0.4;
    arrow(g, DATA.x + DATA.w / 2, DATA.y + DATA.h + 3, DATA.x + DATA.w / 2, TRAIN.y - 3, on ? MC : C.dim, 3);
    g.beginPath(); g.roundRect(TRAIN.x, TRAIN.y, TRAIN.w, TRAIN.h, 10); g.fillStyle = C.bg3; g.fill(); g.strokeStyle = on ? MC : C.line; g.lineWidth = on ? 2.5 : 1.5; g.stroke();
    g.textAlign = 'left'; g.font = `600 13px ${FONT}`; g.fillStyle = on ? MC : C.dim; g.fillText(p >= 1 ? 'TRAINED' : 'TRAINING', TRAIN.x + 14, TRAIN.y + 23);
    g.textAlign = 'right'; g.fillStyle = C.dim; g.fillText('prediction error', TRAIN.x + TRAIN.w - 14, TRAIN.y + 23);
    const cx0 = TRAIN.x + 16, cx1 = TRAIN.x + TRAIN.w - 16, cy0 = TRAIN.y + 34, cy1 = TRAIN.y + TRAIN.h - 12;
    g.strokeStyle = 'rgba(154,161,174,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0, cy1); g.lineTo(cx1, cy1); g.stroke();
    if (p > 0) {
      g.strokeStyle = MC; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
      for (let j = 0; j <= 60; j++) { const v = j / 60 * p, px = cx0 + 4 + v * (cx1 - cx0 - 8), py = cy1 - 4 - (cy1 - cy0 - 6) * (0.06 + 0.94 * Math.exp(-5 * v)); (j ? g.lineTo : g.moveTo).call(g, px, py); }
      g.stroke();
    }
    g.restore();
  }

  // A cloud: bumps along a rectangle. Stroke every bump, then fill them all: only the outer outline survives.
  function cloud({ x, y, w, h: ch }) {
    const r = 48, cs = [], nx = Math.ceil((w - 2 * r) / (1.45 * r)) + 1, ny = Math.ceil((ch - 2 * r) / (1.45 * r)) + 1;
    for (let i = 0; i < nx; i++) { const cx = x + r + (w - 2 * r) * i / (nx - 1), d = i % 2 ? 5 : -3; cs.push([cx, y + r, r + d], [cx, y + ch - r, r - d]); }
    for (let j = 1; j < ny - 1; j++) { const cy = y + r + (ch - 2 * r) * j / (ny - 1), d = j % 2 ? 4 : -2; cs.push([x + r, cy, r + d], [x + w - r, cy, r - d]); }
    g.strokeStyle = MC; g.lineWidth = 5;
    for (const [cx, cy, cr] of cs) { g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.stroke(); }
    g.fillStyle = C.bg3;
    for (const [cx, cy, cr] of cs) { g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill(); }
    g.fillRect(x + r * 0.7, y + r * 0.7, w - 1.4 * r, ch - 1.4 * r);
  }
  function bubble(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = C.bg3; g.fill(); g.strokeStyle = MC; g.lineWidth = 2.5; g.stroke(); }

  function glyph(dir, cx, cy, color, size = 20) {
    if (dir === 'up') arrow(g, cx, cy + size / 2, cx, cy - size / 2, color, 3);
    else arrow(g, cx - size / 2, cy, cx + size / 2, cy, color, 3);
  }
  function mark(ok, cx, cy) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = ok ? C.green : C.red; g.beginPath();
    if (ok) { g.moveTo(cx - 8, cy); g.lineTo(cx - 2, cy + 7); g.lineTo(cx + 9, cy - 7); }
    else { g.moveTo(cx - 7, cy - 7); g.lineTo(cx + 7, cy + 7); g.moveTo(cx + 7, cy - 7); g.lineTo(cx - 7, cy + 7); }
    g.stroke(); g.restore();
  }
  function pill(text, x, y, color, fill) {
    g.font = `600 14px ${FONT}`; const w = g.measureText(text).width + 22;
    g.beginPath(); g.roundRect(x - w, y - 13, w, 26, 13); g.fillStyle = fill; g.fill(); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x - w / 2, y + 1); g.textBaseline = 'alphabetic';
  }
  // The stages in a row, the current one lit, and one line on what happens in it.
  function stages(cur) {
    g.save(); g.textBaseline = 'middle';
    let x = CLOUD.x + 36; const y = 352;
    STAGES.forEach(([name], i) => {
      const on = i === cur;
      g.globalAlpha = on ? 1 : 0.42;
      if (i) { arrow(g, x, y, x + 22, y, C.dim, 2); x += 36; }
      g.beginPath(); g.arc(x + 15, y, 15, 0, 7); if (on) { g.fillStyle = MC; g.fill(); } else { g.strokeStyle = C.dim; g.lineWidth = 2; g.stroke(); }
      g.textAlign = 'center'; g.font = `700 16px ${FONT}`; g.fillStyle = on ? C.bg : C.dim; g.fillText(String(i + 1), x + 15, y + 1);
      g.textAlign = 'left'; g.font = `700 20px ${FONT}`; g.fillStyle = C.fg; g.fillText(name, x + 39, y + 1);
      x += 39 + g.measureText(name).width + 14;
    });
    g.globalAlpha = 1; g.textAlign = 'left'; g.font = `18px ${FONT}`; g.fillStyle = C.dim; g.fillText(STAGES[cur][1], CLOUD.x + 36, 400);
    g.restore();
  }

  function draw(ms) {
    let s = SEGS[0]; for (const q of SEGS) if (q.t0 <= ms) s = q;
    const u = Math.max(0, Math.min(1, (ms - s.t0) / s.dur)), kind = s.kind;
    const thinking = kind === 'select' || kind === 'roll' || kind === 'verdict';
    const acting = kind === 'exec' || kind === 'done', after = acting || kind === 'handoff';
    const pre = !thinking && !after;   // nothing has been tried in the model yet
    g = main; g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.fillStyle = C.bg2; g.fillRect(0, 0, BW, BH);

    // ---- the real world ----
    const win = CANDS[WIN];
    g.textAlign = 'left'; g.font = `600 15px ${FONT}`; g.fillStyle = C.dim;
    g.fillText(kind === 'rec' || kind === 'reset' ? `THE REAL WORLD · recording ${s.i + 1} of ${DEMOS.length}` : 'THE REAL WORLD', REAL.ox, 150);
    if (kind === 'reset') {   // cut to the next recording
      const d = DEMOS[s.i];
      scene(REAL, sim(d, d.length), 'real', false, 1 - ease(u)); scene(REAL, sim(win, 0), 'real', false, ease(u));
    } else {
      scene(REAL, kind === 'rec' ? stepped(DEMOS[s.i], u * DEMOS[s.i].length) : kind === 'exec' ? stepped(win, u * win.length) : kind === 'done' ? sim(win, win.length) : sim(win, 0), 'real');
    }
    if (after) {   // the chosen plan, under the floor
      const a = kind === 'handoff' ? ease(u) : 1, n = win.length, doneN = kind === 'exec' ? u * n : kind === 'done' ? n : 0;
      g.save(); g.globalAlpha = a; g.font = `600 15px ${FONT}`; g.fillStyle = C.dim; g.textAlign = 'right'; g.textBaseline = 'middle';
      const px = REAL.ox + 2.2 * REAL.s, py = REAL.oy + 30; g.fillText('executing the plan', px - 12, py + 1);
      win.forEach((d, i) => glyph(d, px + 16 + i * 34, py, i < doneN ? MC : C.dim, 22));
      g.restore();
    }

    // ---- learned: the camera, the dataset and the training, until the model exists ----
    if (learned && pre) { g.save(); g.globalAlpha = kind === 'birth' ? 1 - ease(u) : 1; recording(ms, kind, u); g.restore(); }

    // ---- the model of the world: a thought cloud ----
    const hasModel = !learned || kind === 'birth' || !pre;
    if (hasModel) {
      const growing = kind === 'birth' || (kind === 'intro' && !learned);
      const ca = growing ? ease(u) : kind === 'handoff' ? 1 - 0.72 * ease(u) : acting ? 0.28 : 1;
      const sc = kind === 'birth' ? 0.2 + 0.8 * ease(u) : 1;   // the learned model grows out of the training box
      g = lg; g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0); g.clearRect(0, 0, BW, BH);
      bubble(228, 190, 7); bubble(304, 147, 11); bubble(398, 110, 17);
      cloud(CLOUD);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `700 19px ${FONT}`; g.fillStyle = MC; g.fillText(learned ? 'Learned model of the world' : 'Designed model of the world', ROWS.x, CLOUD.y + 44);
      g.font = `16px ${FONT}`; g.fillStyle = C.dim; g.textAlign = 'right';
      g.fillText(learned ? 'trained on the recorded data' : 'a simulation engine, written by engineers', PANEL.x + PANEL.w, CLOUD.y + 44);
      g.textAlign = 'left'; g.font = `600 13px ${FONT}`; g.fillStyle = C.dim; g.fillText('CANDIDATE ACTIONS', ROWS.x, ROWS.y - 9);

      const active = thinking ? s.i : after ? WIN : -1;
      CANDS.forEach((c, i) => {
        const y = ROWS.y + i * (ROWS.h + ROWS.gap), judged = after || (thinking && (i < s.i || (i === s.i && kind === 'verdict')));
        g.beginPath(); g.roundRect(ROWS.x, y, ROWS.w, ROWS.h, 9); g.fillStyle = C.bg2; g.fill();
        g.strokeStyle = i === active ? MC : C.line; g.lineWidth = i === active ? 2.5 : 1.5; g.stroke();
        const prog = thinking && i === s.i && kind === 'roll' ? u * c.length : judged ? c.length : 0;
        c.forEach((d, j) => glyph(d, ROWS.x + 26 + j * 34, y + ROWS.h / 2, j < prog ? (i === active ? MC : C.fg) : C.dim, 20));
        if (judged) mark(i === WIN, ROWS.x + ROWS.w - 22, y + ROWS.h / 2);
      });

      // the imagined rollout
      const cand = CANDS[Math.max(0, active)], n = cand.length;
      const v = kind === 'roll' ? u * n : (kind === 'verdict' || after) ? n : 0;
      const st = stepped(cand, v);
      g.save(); g.beginPath(); g.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10); g.clip();
      g.fillStyle = learned ? `rgba(${mrgb},0.09)` : C.bg; g.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
      if (learned) {   // a strip of film: the model predicts what the camera would see
        g.fillStyle = `rgba(${mrgb},0.28)`;
        for (let x = PANEL.x + 9; x < PANEL.x + PANEL.w - 12; x += 26) { g.fillRect(x, PANEL.y + 6, 13, 6); g.fillRect(x, PANEL.y + PANEL.h - 12, 13, 6); }
        const wob = (ph) => 0.012 * Math.sin(ms / 95 + ph);
        for (let q = 3; q >= 1; q--) if (v - 0.3 * q > 0) scene(MINI, stepped(cand, v - 0.3 * q), 'model', true);
        scene(MINI, { x: st.x + wob(0), y: st.y + wob(2), box: st.box + (kind === 'roll' ? wob(4) : 0) }, 'model');
      } else {         // a grid: every quantity is a number the engine computes
        g.strokeStyle = 'rgba(154,161,174,0.13)'; g.lineWidth = 1; g.beginPath();
        for (let x = MINI.ox; x < PANEL.x + PANEL.w; x += MINI.s / 2) { g.moveTo(x + 0.5, PANEL.y); g.lineTo(x + 0.5, PANEL.y + PANEL.h); }
        for (let y = MINI.oy; y > PANEL.y; y -= MINI.s / 2) { g.moveTo(PANEL.x, y + 0.5); g.lineTo(PANEL.x + PANEL.w, y + 0.5); }
        g.stroke();
        scene(MINI, st, 'model');
      }
      g.restore();
      g.beginPath(); g.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10); g.strokeStyle = learned ? `rgba(${mrgb},0.55)` : C.line; g.lineWidth = 1.5; g.stroke();
      g.font = `600 13px ${FONT}`; g.fillStyle = C.dim; g.textAlign = 'left';
      g.fillText(learned ? 'IMAGINED FUTURE' : 'SIMULATED FUTURE', PANEL.x, PANEL.y - 9);
      if (kind === 'verdict' || after) {
        const ok = active === WIN;
        pill(ok ? 'goal reached' : 'goal not reached', PANEL.x + PANEL.w - 10, PANEL.y + (learned ? 30 : 21), ok ? C.green : C.red, C.bg2);
      }
      g = main; g.save(); g.globalAlpha = ca;
      if (sc !== 1) { const cx = TRAIN.x + TRAIN.w / 2, cy = TRAIN.y + TRAIN.h / 2; g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy); }
      g.drawImage(layer, 0, 0, BW, BH); g.restore();
    }

    // ---- what is happening ----
    const n = STAGES.length;
    stages(after ? n - 1 : thinking ? n - 2 : learned && (kind === 'train' || kind === 'birth') ? 1 : 0);
  }

  let last = 0;
  const step = t => { last = t; draw(t * T_RUN); };
  const loop = loopPlayer({ dur: T_RUN, hold: 300, hold0: 300, alive: () => canvas.isConnected, step });
  const setBtn = () => { btn.textContent = loop.playing ? '⏸' : '▶'; };
  const btn = h('button', { style: 'min-width:2.4em; position:absolute; top:8px; left:8px; opacity:0.85', onclick: () => { if (loop.playing) loop.stop(); else loop.start(last >= 1 ? 0 : last); setBtn(); } }, '⏸');
  el.classList.add('widget'); el.style.position = 'relative'; el.style.width = `${W}px`;
  el.append(canvas, h('span', { class: 'interactive-only' }, btn));
  if (isPrint() || cfg.still !== undefined) { draw(typeof cfg.still === 'number' ? cfg.still : T_PRINT); return; }   // still: a time in ms
  draw(0);
  const sec = el.closest('section');
  const run = () => { loop.stop(); loop.start(0); setBtn(); };
  el.closest('.reveal')?.addEventListener('slidechanged', ev => { if (!canvas.isConnected) return; if (ev.currentSlide?.contains(el)) run(); else { loop.stop(); setBtn(); } });
  if (sec?.classList.contains('present')) run();
}
