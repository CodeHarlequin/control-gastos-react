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

async function saveBudgetData(data) {
  const response = await fetch('/api/budget', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudieron guardar los datos en SQLite.');
  }
}

async function loadBudgetData() {
  const response = await fetch('/api/budget');
  if (!response.ok) throw new Error('No se pudo conectar con la base de datos SQLite.');
  const body = await response.json();
  if (!body.data) return createEmptyBudgetData();
  return {
    ...createEmptyBudgetData(),
    ...body.data,
    monthlyClosures: body.data.monthlyClosures || {},
  };
}

export {
  createEmptyBudgetData,
  loadBudgetData,
  saveBudgetData,
};
