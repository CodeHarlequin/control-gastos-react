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

async function loadServerData() {
  const response = await fetch('/api/budget');
  if (!response.ok) {
    throw new Error(`No se pudieron cargar los datos del servidor (${response.status}).`);
  }
  const body = await response.json();
  return body.data || null;
}

async function saveServerData(data) {
  const response = await fetch('/api/budget', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    throw new Error(`No se pudieron guardar los datos en el servidor (${response.status}).`);
  }
}

async function saveBudgetData(data) {
  const results = await Promise.allSettled([
    saveServerData(data),
    runSqliteOperation('save', data),
  ]);

  if (results.every(({ status }) => status === 'rejected')) {
    throw new AggregateError(
      results.map(({ reason }) => reason),
      'No se pudieron guardar los datos.',
    );
  }
}

async function loadBudgetData() {
  const [serverResult, localResult] = await Promise.allSettled([
    loadServerData(),
    runSqliteOperation('load'),
  ]);

  if (serverResult.status === 'fulfilled' && serverResult.value) {
    return normalizeBudgetData(serverResult.value);
  }

  if (localResult.status === 'fulfilled' && localResult.value) {
    const localData = normalizeBudgetData(localResult.value);
    if (serverResult.status === 'fulfilled') {
      await saveServerData(localData);
    }
    return localData;
  }

  if (serverResult.status === 'fulfilled' || localResult.status === 'fulfilled') {
    return createEmptyBudgetData();
  }

  throw new AggregateError(
    [serverResult.reason, localResult.reason],
    'No se pudo abrir ningún almacenamiento.',
  );
}

export {
  createEmptyBudgetData,
  loadBudgetData,
  saveBudgetData,
};
