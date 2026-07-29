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

async function loadLegacyServerData() {
  try {
    const response = await fetch('/api/budget');
    if (!response.ok) return null;
    const body = await response.json();
    return body.data || null;
  } catch {
    return null;
  }
}

async function saveBudgetData(data) {
  await runSqliteOperation('save', data);
}

async function loadBudgetData() {
  const storedData = await runSqliteOperation('load');
  if (storedData) return normalizeBudgetData(storedData);

  const legacyData = await loadLegacyServerData();
  if (legacyData) {
    await saveBudgetData(legacyData);
    return normalizeBudgetData(legacyData);
  }

  return createEmptyBudgetData();
}

export {
  createEmptyBudgetData,
  loadBudgetData,
  saveBudgetData,
};
