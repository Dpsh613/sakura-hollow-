import * as THREE from 'three';
import { rand } from '../core/noise.js';
import { onIsland, isWater, BRIDGE } from '../world/island.js';

/**
 * Walkability grid + A*. Obstacles: { x, z, r } circles or { box: [x0,z0,x1,z1] }.
 * Extra walkable rectangles (dock, bridge) can override water.
 */
export function createNav({ obstacles = [], walkable = [] }) {
  const MIN = -10.5, CELL = 0.25, N = 84;
  const grid = new Uint8Array(N * N);
  const inRect = (x, z, r) => {
    const dx = x - r.x, dz = z - r.z;
    const u = dx * r.dir[0] + dz * r.dir[1], v = -dx * r.dir[1] + dz * r.dir[0];
    return Math.abs(u) < r.len / 2 && Math.abs(v) < r.wid / 2;
  };
  const rects = [{ ...BRIDGE, wid: BRIDGE.wid * 0.8 }, ...walkable];
  const blockedAt = (x, z) => {
    if (!onIsland(x, z, 0.5)) return true;
    for (const r of rects) if (inRect(x, z, r)) return false;
    if (isWater(x, z, 0.12)) return true;
    for (const o of obstacles) {
      if (o.box) { if (x > o.box[0] - 0.2 && x < o.box[2] + 0.2 && z > o.box[1] - 0.2 && z < o.box[3] + 0.2) return true; }
      else if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.2) ** 2) return true;
    }
    return false;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j * N + i] = blockedAt(MIN + (i + 0.5) * CELL, MIN + (j + 0.5) * CELL) ? 0 : 1;

  const cellOf = (x, z) => [Math.floor((x - MIN) / CELL), Math.floor((z - MIN) / CELL)];
  const ok = (i, j) => i >= 0 && j >= 0 && i < N && j < N && grid[j * N + i] === 1;
  const walkableAt = (x, z) => { const [i, j] = cellOf(x, z); return ok(i, j); };
  const centre = (i, j) => new THREE.Vector3(MIN + (i + 0.5) * CELL, 0, MIN + (j + 0.5) * CELL);

  function nearestOpen(x, z, maxR = 12) {
    const [ci, cj] = cellOf(x, z);
    if (ok(ci, cj)) return [ci, cj];
    for (let r = 1; r < maxR; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (ok(ci + di, cj + dj)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [ci + di, cj + dj]; } }
      }
      if (best) return best;
    }
    return null;
  }

  function lineClear(a, b) {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!walkableAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  // binary-heap A*
  const g = new Float32Array(N * N), from = new Int32Array(N * N), closed = new Uint8Array(N * N);
  function find(start, goal) {
    const s = nearestOpen(start.x, start.z), e = nearestOpen(goal.x, goal.z);
    if (!s || !e) return null;
    const S = s[1] * N + s[0], E = e[1] * N + e[0];
    g.fill(1e9); from.fill(-1); closed.fill(0);
    const heap = [];
    const push = (idx, f) => { heap.push([f, idx]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    g[S] = 0; push(S, h(s[0], s[1]));
    let iter = 0;
    while (heap.length && iter++ < 9000) {
      const [, cur] = pop();
      if (cur === E) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % N, cj = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!ok(ni, nj)) continue;
        if (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj))) continue;
        const nIdx = nj * N + ni;
        const cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[nIdx]) { g[nIdx] = cost; from[nIdx] = cur; push(nIdx, cost + h(ni, nj)); }
      }
    }
    if (from[E] === -1 && S !== E) return null;
    const cells = [];
    for (let c = E; c !== -1; c = from[c]) { cells.push(c); if (c === S) break; }
    cells.reverse();
    const pts = cells.map((c) => centre(c % N, (c / N) | 0));
    // string pulling
    const out = [start.clone().setY(0)];
    let anchor = out[0];
    for (let k = 1; k < pts.length; k++) {
      if (!lineClear(anchor, pts[k])) { out.push(pts[k - 1]); anchor = pts[k - 1]; }
    }
    out.push(goal.clone().setY(0));
    return out.slice(1);
  }

  function randomPoint(cx = 0, cz = 0, radius = 9, minR = 0) {
    for (let k = 0; k < 40; k++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(minR * minR, radius * radius));
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (walkableAt(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(cx, 0, cz);
  }

  return { find, walkableAt, randomPoint, lineClear, grid, N, MIN, CELL };
}
