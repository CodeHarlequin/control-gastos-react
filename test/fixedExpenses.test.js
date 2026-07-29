import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeFixedExpenseAmount,
  finishFixedExpenseFromMonth,
  getFixedExpenseOccurrence,
  getOccurrencesForRange,
  overrideFixedExpenseMonth,
  skipFixedExpenseMonth,
} from '../src/domain/fixedExpenses.js';
import { migrateFixedExpensesV1ToV2 } from '../src/storage/migrations.js';

function series(overrides = {}) {
  return {
    id: 'fixed-1',
    name: 'Comunidad',
    category: 'Vivienda',
    paymentDay: 31,
    startMonth: '2026-01',
    endCondition: { type: 'none', endMonth: null, targetAmount: null, capLastPayment: true },
    versions: [{
      id: 'v1',
      effectiveFrom: '2026-01',
      amount: 60,
      createdAt: '2026-01-01T00:00:00.000Z',
      note: 'Inicial',
    }],
    exceptions: [],
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('resuelve cambios de importe sin alterar meses anteriores', () => {
  const changed = changeFixedExpenseAmount(series(), '2026-04', 65, 'Subida', {
    id: 'v2',
    now: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(getFixedExpenseOccurrence(changed, '2026-01', []).amount, 60);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-03', []).amount, 60);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-04', []).amount, 65);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-12', []).amount, 65);
});

test('aplica una excepción solo al mes indicado', () => {
  const changed = overrideFixedExpenseMonth(series(), '2026-06', 120);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-05', []).amount, 60);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-06', []).amount, 120);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-07', []).amount, 60);
});

test('omite una cuota mensual sin afectar las demás', () => {
  const changed = skipFixedExpenseMonth(series(), '2026-08');
  assert.equal(getFixedExpenseOccurrence(changed, '2026-07', []).amount, 60);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-08', []), null);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-09', []).amount, 60);
});

test('finaliza desde un mes conservando el historial anterior', () => {
  const changed = finishFixedExpenseFromMonth(series(), '2026-10');
  assert.equal(getFixedExpenseOccurrence(changed, '2026-09', []).amount, 60);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-10', []), null);
  assert.equal(getFixedExpenseOccurrence(changed, '2026-11', []), null);
});

test('ajusta la última cuota al objetivo monetario', () => {
  const limited = series({
    endCondition: { type: 'amount', endMonth: null, targetAmount: 1000, capLastPayment: true },
    versions: [{ id: 'v1', effectiveFrom: '2026-01', amount: 150, createdAt: '', note: '' }],
  });
  const occurrences = getOccurrencesForRange(limited, '2026-01', '2026-12');
  assert.deepEqual(occurrences.map((item) => item.amount), [150, 150, 150, 150, 150, 150, 100]);
});

test('el objetivo usa importes versionados y excepciones reales', () => {
  let changed = series({
    endCondition: { type: 'amount', endMonth: null, targetAmount: 1200, capLastPayment: true },
    versions: [{ id: 'v1', effectiveFrom: '2026-01', amount: 200, createdAt: '', note: '' }],
  });
  changed = changeFixedExpenseAmount(changed, '2026-03', 250, '', { id: 'v2' });
  changed = overrideFixedExpenseMonth(changed, '2026-06', 100);
  const occurrences = getOccurrencesForRange(changed, '2026-01', '2026-12');
  assert.equal(occurrences.reduce((sum, item) => sum + item.amount, 0), 1200);
  assert.deepEqual(occurrences.map((item) => item.amount), [200, 200, 250, 250, 250, 50]);
});

test('ajusta el día de pago al último día válido del mes', () => {
  assert.equal(getFixedExpenseOccurrence(series(), '2026-02', []).paymentDate, '2026-02-28');
});

test('migra un gasto fijo antiguo a una serie versionada', () => {
  const migrated = migrateFixedExpensesV1ToV2({
    fixedExpenses: [{
      id: 'old-fixed-1',
      name: 'Hipoteca',
      amount: 720,
      paymentDay: 5,
      startMonth: '2024-01',
      endMonth: null,
    }],
    movements: [{ id: 'movement-1' }],
  }, {
    now: '2026-07-29T10:00:00.000Z',
    currentMonth: '2026-07',
    idFactory: (prefix) => `${prefix}-generated`,
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.fixedExpenseSeries[0].id, 'old-fixed-1');
  assert.equal(migrated.fixedExpenseSeries[0].versions[0].amount, 720);
  assert.equal(migrated.fixedExpenseSeries[0].versions[0].effectiveFrom, '2024-01');
  assert.deepEqual(migrated.movements, [{ id: 'movement-1' }]);
});
