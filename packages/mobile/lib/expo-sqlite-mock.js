// Web stub — expo-sqlite is native only
module.exports = {
  openDatabaseAsync: () => Promise.resolve({
    execAsync: () => Promise.resolve(),
    runAsync: () => Promise.resolve({ lastInsertRowId: 0, changes: 0 }),
    getAllAsync: () => Promise.resolve([]),
    getFirstAsync: () => Promise.resolve(null),
    closeAsync: () => Promise.resolve(),
  }),
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => ({ lastInsertRowId: 0, changes: 0 }),
    getAllSync: () => [],
    getFirstSync: () => null,
    closeSync: () => {},
  }),
};
