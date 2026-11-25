import type { HighsSolverLike } from './exactSolver';

let cachedHighsPromise: Promise<HighsSolverLike | null> | null = null;

/**
 * Lazily loads and caches the HiGHS WebAssembly solver instance.
 * Safe in both Vite Web Workers and main thread; returns null on any load/init error.
 */
export function loadHighsSolver(): Promise<HighsSolverLike | null> {
  if (cachedHighsPromise) {
    return cachedHighsPromise;
  }

  cachedHighsPromise = (async (): Promise<HighsSolverLike | null> => {
    try {
      const highsMod = await import('highs');
      const factory = (highsMod.default ?? highsMod) as unknown as (
        options?: { locateFile?: (file: string) => string }
      ) => Promise<HighsSolverLike>;

      if (typeof factory !== 'function') {
        return null;
      }

      let wasmUrl = '';
      try {
        const wasmMod = await import('highs/runtime?url');
        wasmUrl = typeof wasmMod.default === 'string' ? wasmMod.default : '';
      } catch {
        wasmUrl = '';
      }

      const instance = await factory(
        wasmUrl
          ? {
              locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
            }
          : undefined
      );

      if (!instance || typeof instance.solve !== 'function') {
        return null;
      }

      return instance;
    } catch {
      return null;
    }
  })();

  return cachedHighsPromise;
}
