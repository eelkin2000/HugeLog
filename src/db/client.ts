import { Platform } from 'react-native';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _rawDb: ReturnType<typeof import('expo-sqlite').openDatabaseSync> | null = null;

function initDb() {
  if (_db) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { openDatabaseSync } = require('expo-sqlite') as typeof import('expo-sqlite');
  _rawDb = openDatabaseSync('hugelog.db', { enableChangeListener: true });
  _rawDb!.execSync('PRAGMA journal_mode = WAL;');
  _rawDb!.execSync('PRAGMA foreign_keys = ON;');
  _db = drizzle(_rawDb!, { schema });
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (Platform.OS === 'web') {
      // Return no-op stubs on web so the app doesn't crash
      if (prop === 'select') return () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }), limit: () => Promise.resolve([]) }), orderBy: () => ({ limit: () => Promise.resolve([]) }), limit: () => Promise.resolve([]), groupBy: () => ({ orderBy: () => Promise.resolve([]) }) }) });
      if (prop === 'insert') return () => ({ values: () => Promise.resolve() });
      if (prop === 'update') return () => ({ set: () => ({ where: () => Promise.resolve() }) });
      if (prop === 'delete') return () => ({ where: () => Promise.resolve() });
      return () => {};
    }
    initDb();
    return (_db as any)[prop];
  },
});

export const rawDb = new Proxy({} as any, {
  get(_target, prop) {
    if (Platform.OS === 'web') {
      if (prop === 'execSync') return () => {};
      return () => {};
    }
    initDb();
    return (_rawDb as any)[prop];
  },
});
