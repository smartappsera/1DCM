/**
 * Low-level pure helpers and zero-allocation DP solver for 1D linear cutting.
 */

export const PALETTE: Readonly<Record<number, string>> = {
  5230: '#F87171',
  810: '#38BDF8',
  800: '#E879F9',
  320: '#6366F1',
  280: '#FACC15',
  150: '#4ADE80',
};

export const RICH_DYNAMIC_COLORS: readonly string[] = [
  '#38BDF8',
  '#E879F9',
  '#FACC15',
  '#4ADE80',
  '#F87171',
  '#6366F1',
  '#FB923C',
  '#2DD4BF',
  '#A78BFA',
  '#F472B6',
  '#34D399',
  '#60A5FA',
  '#FBBF24',
  '#C084FC',
  '#F43F5E',
  '#14B8A6',
  '#818CF8',
  '#FB7185',
  '#A3E635',
  '#06B6D4',
  '#E11D48',
  '#0EA5E9',
  '#D946EF',
  '#84CC16',
  '#F97316',
  '#8B5CF6',
  '#10B981',
  '#D97706',
  '#64748B',
  '#EC4899',
  '#059669',
  '#7C3AED',
  '#B45309',
  '#2563EB',
  '#0284C7',
  '#475569',
];

export function getDefaultDemandColor(index: number, len?: number): string {
  if (len && PALETTE[len]) return PALETTE[len];
  return RICH_DYNAMIC_COLORS[index % RICH_DYNAMIC_COLORS.length];
}

export function getColorForLength(len: number): string {
  if (PALETTE[len]) return PALETTE[len];
  const hash = Math.abs(Math.round(len * 9973));
  return RICH_DYNAMIC_COLORS[hash % RICH_DYNAMIC_COLORS.length];
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
  };
}

export function getMemoryUsageMb(): number | undefined {
  if (typeof performance !== 'undefined') {
    const perf = performance as PerformanceWithMemory;
    if (perf.memory?.usedJSHeapSize) {
      return Number((perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2));
    }
  }
  return undefined;
}

export function myGcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  if (x < y) {
    const t = x;
    x = y;
    y = t;
  }
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * In-place sorting heuristic on a slice arr[0..len-1] to avoid array allocations in hot loops.
 */
export function sortLongArrayInPlace(arr: number[], len: number, sortMode = 1): void {
  if (len <= 1) return;

  if (sortMode === 1 || (sortMode >= 3 && sortMode <= 7) || sortMode < 0 || sortMode === 0) {
    // Sort descending first (using partial slice when len === arr.length, or full sort)
    if (len === arr.length) {
      arr.sort((a, b) => b - a);
    } else {
      const sub = arr.slice(0, len).sort((a, b) => b - a);
      for (let i = 0; i < len; i++) arr[i] = sub[i];
    }

    if (sortMode === 3) {
      const half = Math.floor(len / 2);
      for (let i = 1; i < half; i += 2) {
        const j = len - 1 - i;
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
    } else if (sortMode === 4) {
      const copy = arr.slice(0, len);
      for (let i = 0; i < len; i++) {
        arr[i] = i % 2 === 0 ? copy[Math.floor(i / 2)] : copy[len - 1 - Math.floor(i / 2)];
      }
    } else if (sortMode === 5) {
      const sub = arr.slice(0, len).sort((a, b) => (6000 % a) - (6000 % b) || b - a);
      for (let i = 0; i < len; i++) arr[i] = sub[i];
    } else if (sortMode === 6) {
      const copy = arr.slice(0, len);
      let left = 0;
      let right = len - 1;
      let idx = 0;
      while (left <= right) {
        if (left <= right) arr[idx++] = copy[left++];
        if (left <= right) arr[idx++] = copy[left++];
        if (left <= right) arr[idx++] = copy[right--];
      }
    } else if (sortMode === 7) {
      const copy = arr.slice(0, len);
      const mid = Math.floor(len / 2);
      let l = mid;
      let r = mid + 1;
      let idx = 0;
      while (l >= 0 || r < len) {
        if (l >= 0) arr[idx++] = copy[l--];
        if (r < len) arr[idx++] = copy[r++];
      }
    }
    return;
  }

  if (sortMode === 2) {
    if (len === arr.length) {
      arr.sort((a, b) => a - b);
    } else {
      const sub = arr.slice(0, len).sort((a, b) => a - b);
      for (let i = 0; i < len; i++) arr[i] = sub[i];
    }
    return;
  }

  // Deterministic pseudo-random shuffle for sortMode >= 8
  let seed = sortMode * 16807;
  for (let i = len - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = Math.floor((seed / 2147483647) * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

export function sortLongArray(arr: readonly number[], sortMode = 1): number[] {
  const result = arr.slice();
  sortLongArrayInPlace(result, result.length, sortMode);
  return result;
}

/**
 * Reusable DP scratch buffer holder to eliminate Int32Array allocations inside hot loops.
 */
export class DpScratchBuffer {
  private buf: Int32Array;

  constructor(initialSize = 16384) {
    this.buf = new Int32Array(initialSize);
  }

  acquire(minLength: number): Int32Array {
    if (this.buf.length < minLength) {
      this.buf = new Int32Array(Math.max(minLength, this.buf.length * 2));
    }
    this.buf.fill(-1, 0, minLength);
    this.buf[0] = 0;
    return this.buf;
  }
}

/**
 * Zero-allocation DP Subset-Sum solver writing chosen values into `outBuf` and returning count.
 */
export function longSumElIntoBuffer(
  arr: readonly number[],
  arrLen: number,
  sm: number,
  ds: number,
  scratch: DpScratchBuffer,
  outBuf: number[]
): number {
  outBuf.length = 0;
  if (sm <= 0 || sm > 80000000 || arrLen <= 0) return 0;

  const sm1 = sm - ds;
  const a = scratch.acquire(sm + 1);
  let maxReach = 0;

  outerLoop: for (let i = 0; i < arrLen; i++) {
    const itemVal = arr[i];
    if (itemVal <= 0 || itemVal > sm) continue;

    const jStart = maxReach < sm - itemVal ? maxReach : sm - itemVal;
    for (let j = jStart; j >= 0; j--) {
      if (a[j] >= 0) {
        const k = j + itemVal;
        if (a[k] === -1) {
          a[k] = j;
          if (k > maxReach) maxReach = k;
          if (k >= sm1) {
            break outerLoop;
          }
        }
      }
    }
  }

  for (let i = sm; i >= 1; i--) {
    if (a[i] >= 0) {
      let k = i;
      while (k > 0) {
        const prev = a[k];
        outBuf.push(k - prev);
        k = prev;
      }
      return outBuf.length;
    }
  }

  return 0;
}

/**
 * Public Subset-Sum solver (kept for external callers / backward compatibility).
 */
export function longSumEl(arr: number[], sm: number, ds = 0): number[] | null {
  if (sm <= 0 || sm > 80000000) return null;
  const scratch = new DpScratchBuffer(sm + 1);
  const out: number[] = [];
  const count = longSumElIntoBuffer(arr, arr.length, sm, ds, scratch, out);
  return count > 0 ? out : null;
}

export function greedyAlgoIntoBuffer(
  arr: readonly number[],
  arrLen: number,
  sm: number,
  outBuf: number[]
): number {
  outBuf.length = 0;
  let s = sm;
  for (let i = 0; i < arrLen; i++) {
    const val = arr[i];
    if (val <= s) {
      outBuf.push(val);
      s -= val;
    }
  }
  return s < sm ? outBuf.length : 0;
}

export function greedyAlgo(arr: number[], sm: number): number[] | null {
  const out: number[] = [];
  const count = greedyAlgoIntoBuffer(arr, arr.length, sm, out);
  return count > 0 ? out : null;
}
