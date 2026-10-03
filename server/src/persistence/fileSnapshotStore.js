import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Snapshot хадгалалтын файл хувилбар. DATABASE_URL байхгүй (эсвэл DB унасан) үед ашиглана.
 * Dev-д `node --watch` сервер дахин асаах бүрт өрөө алга болохоос сэргийлнэ.
 */
export function createFileSnapshotStore(file) {
  let cache = null; // Map<code, snapshot>

  return {
    kind: 'file',

    async load() {
      try {
        cache = new Map(Object.entries(JSON.parse(await readFile(file, 'utf8'))));
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn('[snapshot] файл уншиж чадсангүй, хоосноор эхэлнэ:', err.message);
        cache = new Map();
      }
      return [...cache.values()];
    },

    async apply({ upserts, deletes }) {
      cache ??= new Map();
      for (const [code, snap] of upserts) cache.set(code, snap);
      for (const code of deletes) cache.delete(code);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(Object.fromEntries(cache)));
      await rename(tmp, file); // атом солилт: дундаа тасарсан ч файл эвдрэхгүй
    },
  };
}
