function createEmptyBudgetData() {
  return {
    schemaVersion: 2,
    openingBalance: null,
    salaries: {},
    fixedExpenseSeries: [],
    movements: [],
    monthlyClosures: {},
  };
}

let sqliteWorker;
let requestId = 0;
const pendingRequests = new Map();
const indexedDbName = 'control-gastos';
const indexedDbStore = 'budget_state';
const localStorageKey = 'control-gastos-budget';

function getSqliteWorker() {
  if (!sqliteWorker) {
    sqliteWorker = new Worker(new URL('./sqlite.worker.js', import.meta.url), {
      type: 'module',
    });
    sqliteWorker.addEventListener('message', (event) => {
      const pending = pendingRequests.get(event.data.id);
      if (!pending) return;
      pendingRequests.delete(event.data.id);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
      } else {
        pending.resolve(event.data.result);
      }
    });
    sqliteWorker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'No se pudo iniciar SQLite.');
      pendingRequests.forEach(({ reject }) => reject(error));
      pendingRequests.clear();
    });
  }

  return sqliteWorker;
}

function runSqliteOperation(operation, data) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    getSqliteWorker().postMessage({ id, operation, data });
  });
}

function normalizeBudgetData(data) {
  return {
    ...createEmptyBudgetData(),
    ...data,
    monthlyClosures: data.monthlyClosures || {},
  };
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB no está disponible.'));
      return;
    }

    const request = globalThis.indexedDB.open(indexedDbName, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(indexedDbStore)) {
        request.result.createObjectStore(indexedDbStore, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => {
      reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    });
    request.addEventListener('blocked', () => {
      reject(new Error('La apertura de IndexedDB está bloqueada.'));
    });
  });
}

async function loadIndexedDbData() {
  const database = await openIndexedDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(indexedDbStore, 'readonly')
        .objectStore(indexedDbStore)
        .get(1);
      request.addEventListener('success', () => resolve(request.result?.payload || null));
      request.addEventListener('error', () => {
        reject(request.error || new Error('No se pudo leer IndexedDB.'));
      });
    });
  } finally {
    database.close();
  }
}

async function saveIndexedDbData(data) {
  const database = await openIndexedDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(indexedDbStore, 'readwrite');
      transaction.objectStore(indexedDbStore).put({
        id: 1,
        payload: data,
        updatedAt: new Date().toISOString(),
      });
      transaction.addEventListener('complete', resolve);
      transaction.addEventListener('error', () => {
        reject(transaction.error || new Error('No se pudo guardar en IndexedDB.'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error || new Error('Se canceló el guardado en IndexedDB.'));
      });
    });
  } finally {
    database.close();
  }
}

function loadLocalStorageData() {
  const storedData = globalThis.localStorage.getItem(localStorageKey);
  return storedData ? JSON.parse(storedData) : null;
}

function saveLocalStorageData(data) {
  globalThis.localStorage.setItem(localStorageKey, JSON.stringify(data));
}

async function saveBudgetData(data) {
  const results = await Promise.allSettled([
    saveIndexedDbData(data),
    Promise.resolve().then(() => saveLocalStorageData(data)),
  ]);

  if (results.every(({ status }) => status === 'rejected')) {
    throw new AggregateError(
      results.map(({ reason }) => reason),
      'No se pudieron guardar los datos en el dispositivo.',
    );
  }
}

async function migrateLegacyData() {
  try {
    const legacyData = await runSqliteOperation('load');
    if (!legacyData) return null;

    const normalizedData = normalizeBudgetData(legacyData);
    await saveBudgetData(normalizedData);
    return normalizedData;
  } catch {
    return null;
  }
}

async function loadBudgetData() {
  const [indexedDbResult, localStorageResult] = await Promise.allSettled([
    loadIndexedDbData(),
    Promise.resolve().then(() => loadLocalStorageData()),
  ]);

  if (indexedDbResult.status === 'fulfilled' && indexedDbResult.value) {
    return normalizeBudgetData(indexedDbResult.value);
  }

  if (localStorageResult.status === 'fulfilled' && localStorageResult.value) {
    const localData = normalizeBudgetData(localStorageResult.value);
    if (indexedDbResult.status === 'fulfilled') {
      await saveIndexedDbData(localData);
    }
    return localData;
  }

  const legacyData = await migrateLegacyData();
  if (legacyData) return legacyData;

  if (
    indexedDbResult.status === 'fulfilled'
    || localStorageResult.status === 'fulfilled'
  ) {
    return createEmptyBudgetData();
  }

  throw new AggregateError(
    [indexedDbResult.reason, localStorageResult.reason],
    'No se pudo abrir el almacenamiento local del dispositivo.',
  );
}

export {
  createEmptyBudgetData,
  loadBudgetData,
  saveBudgetData,
};
