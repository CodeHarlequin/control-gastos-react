import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalanceAtDate,
  calculateCurrentBalance,
  calculateMonthlySummaryTotals,
  getBaseSalaryPaidTotalForMonth,
  getDeclaredSalaryTotal,
  getExtraSalaryPaidTotalForMonth,
  getPaidSalaryTotalForMonth,
} from '../src/domain/balance.js';

function fixedSeries(overrides = {}) {
  return {
    id: 'fixed-1',
    name: 'Comunidad',
    category: 'Vivienda',
    paymentDay: 5,
    startMonth: '2026-06',
    endCondition: { type: 'none', endMonth: null, targetAmount: null, capLastPayment: true },
    versions: [{
      id: 'version-1',
      effectiveFrom: '2026-06',
      amount: 50,
      createdAt: '2026-06-01T00:00:00.000Z',
      note: 'Inicial',
    }],
    exceptions: [],
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

test('suma solo las nóminas desde la fecha del saldo inicial', () => {
  const balance = calculateCurrentBalance({
    openingBalance: { date: '2026-07-29', amount: 1000 },
    salaries: {
      '2026-06': { amount: 500, paymentDate: '2026-06-30' },
      '2026-07': {
        amount: 300,
        paymentDate: '2026-07-29',
        extraPayments: [
          { amount: 50, paymentDate: '2026-07-15' },
          { amount: 100, paymentDate: '2026-07-29' },
          { amount: 200, paymentDate: '2026-08-15' },
        ],
      },
      '2026-08': { amount: 700, paymentDate: '2026-09-01' },
    },
    movements: [],
    fixedExpenseSeries: [],
  }, '2026-07-29');

  assert.equal(balance, 2300);
});

test('separa nómina base y pagas extras por mes', () => {
  const salaries = {
    '2026-06': {
      amount: 1000,
      paymentDate: '2026-06-30',
      extraPayments: [
        { amount: 500, paymentDate: '2026-07-15' },
        { amount: 250, paymentDate: '2026-08-01' },
      ],
    },
  };

  assert.equal(getDeclaredSalaryTotal(salaries['2026-06']), 1750);
  assert.equal(getBaseSalaryPaidTotalForMonth(salaries, '2026-06'), 1000);
  assert.equal(getExtraSalaryPaidTotalForMonth(salaries, '2026-07'), 500);
  assert.equal(getPaidSalaryTotalForMonth(salaries, '2026-07'), 500);
  assert.equal(getPaidSalaryTotalForMonth(salaries, '2026-08'), 250);
});

test('resta todos los movimientos sin filtrar por fecha', () => {
  const balance = calculateCurrentBalance({
    openingBalance: { date: '2026-07-29', amount: 1000 },
    salaries: {},
    movements: [
      { amount: 100, date: '2026-07-15', type: 'oneoff' },
      { amount: 75, date: '2026-09-01', type: 'variable' },
    ],
    fixedExpenseSeries: [],
  }, '2026-07-29');

  assert.equal(balance, 825);
});

test('resta cuotas fijas desde el inicio de la serie hasta hoy', () => {
  const balance = calculateCurrentBalance({
    openingBalance: { date: '2026-07-29', amount: 1000 },
    salaries: {},
    movements: [],
    fixedExpenseSeries: [fixedSeries()],
  }, '2026-07-29');

  assert.equal(balance, 900);
});

test('calcula el saldo histórico solo hasta la fecha de cierre', () => {
  const balance = calculateBalanceAtDate({
    openingBalance: { date: '2026-07-01', amount: 1000 },
    salaries: {
      julio: { amount: 500, paymentDate: '2026-07-30' },
      agosto: { amount: 700, paymentDate: '2026-08-30' },
    },
    movements: [
      { amount: 100, date: '2026-07-15', type: 'variable' },
      { amount: 75, date: '2026-08-01', type: 'variable' },
    ],
    fixedExpenseSeries: [fixedSeries()],
    monthlyClosures: {},
  }, '2026-07-31');

  assert.equal(balance, 1350);
});

test('arrastra al mes siguiente el ajuste del cierre bancario', () => {
  const data = {
    openingBalance: { date: '2026-07-01', amount: 1000 },
    salaries: {},
    movements: [{ amount: 100, date: '2026-08-10', type: 'variable' }],
    fixedExpenseSeries: [],
    monthlyClosures: {
      '2026-07': {
        status: 'closed',
        difference: -50,
      },
    },
  };

  assert.equal(calculateCurrentBalance(data, '2026-08-10'), 850);
  assert.equal(calculateBalanceAtDate(data, '2026-08-31'), 850);
});

test('excluye los gastos puntuales del resumen mensual', () => {
  const totals = calculateMonthlySummaryTotals({
    salary: 1000,
    fixed: 300,
    variable: 200,
    oneoff: 400,
  });

  assert.deepEqual(totals, {
    habitual: 500,
    total: 500,
    cashTotal: 900,
    balance: 500,
  });
});
