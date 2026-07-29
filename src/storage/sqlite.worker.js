import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let databasePromise;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = sqlite3InitModule().then((sqlite3) => {
      if (!sqlite3.oo1.OpfsDb) {
        throw new Error(
          'SQLite no puede usar OPFS. Comprueba las cabeceras COOP y COEP del servidor.',
        );
      }

      const database = new sqlite3.oo1.OpfsDb('/control-gastos.sqlite3', 'c');
      database.exec(`
        CREATE TABLE IF NOT EXISTS budget_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return database;
    });
  }

  return databasePromise;
}

async function loadBudgetData() {
  const database = await getDatabase();
  const rows = database.exec({
    sql: 'SELECT payload FROM budget_state WHERE id = 1',
    rowMode: 'object',
    returnValue: 'resultRows',
  });

  return rows[0]?.payload ? JSON.parse(rows[0].payload) : null;
}

async function saveBudgetData(data) {
  const database = await getDatabase();
  database.exec({
    sql: `
      INSERT INTO budget_state (id, payload, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `,
    bind: [JSON.stringify(data), new Date().toISOString()],
  });
}

self.addEventListener('message', async (event) => {
  const { id, operation, data } = event.data;

  try {
    const result = operation === 'load'
      ? await loadBudgetData()
      : await saveBudgetData(data);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Error desconocido de SQLite.',
    });
  }
});
