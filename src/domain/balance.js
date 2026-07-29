import { getOccurrencesForRange } from './fixedExpenses.js';

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year
    && date.getMonth() + 1 === month
    && date.getDate() === day
  );
}

function getDeclaredSalaryTotal(record) {
  const baseAmount = Number(record?.amount) || 0;
  const extraAmount = (record?.extraPayments || [])
    .reduce((sum, extraPayment) => sum + (Number(extraPayment?.amount) || 0), 0);
  return baseAmount + extraAmount;
}

function getSalaryTotalFromDate(record, minimumPaymentDate) {
  const baseAmount = record?.paymentDate >= minimumPaymentDate
    ? Number(record?.amount) || 0
    : 0;
  const extraAmount = (record?.extraPayments || [])
    .filter((extraPayment) => extraPayment?.paymentDate >= minimumPaymentDate)
    .reduce((sum, extraPayment) => sum + (Number(extraPayment?.amount) || 0), 0);
  return baseAmount + extraAmount;
}

function getBaseSalaryPaidTotalForMonth(salaries, month) {
  return Object.values(salaries || {}).reduce((sum, record) => {
    return sum + (record?.paymentDate?.startsWith(month)
      ? Number(record.amount) || 0
      : 0);
  }, 0);
}

function getExtraSalaryPaidTotalForMonth(salaries, month) {
  return Object.values(salaries || {}).reduce((sum, record) => {
    return sum + (record?.extraPayments || [])
      .filter((extraPayment) => extraPayment?.paymentDate?.startsWith(month))
      .reduce((extraSum, extraPayment) => extraSum + (Number(extraPayment.amount) || 0), 0);
  }, 0);
}

function getPaidSalaryTotalForMonth(salaries, month) {
  return getBaseSalaryPaidTotalForMonth(salaries, month)
    + getExtraSalaryPaidTotalForMonth(salaries, month);
}

function getClosedAdjustmentTotal(monthlyClosures, referenceMonth, openingMonth) {
  return Object.entries(monthlyClosures || {})
    .filter(([month, closure]) => (
      closure?.status === 'closed'
      && month >= openingMonth
      && month < referenceMonth
    ))
    .reduce((sum, [, closure]) => sum + (Number(closure.difference) || 0), 0);
}

function calculateCurrentBalance(data, referenceDate) {
  const openingBalance = data.openingBalance;
  if (!openingBalance || !isIsoDate(openingBalance.date) || !isIsoDate(referenceDate)) return null;

  const salaryTotal = Object.values(data.salaries || {})
    .reduce(
      (sum, record) => sum + getSalaryTotalFromDate(record, openingBalance.date),
      0,
    );

  const movementTotal = (data.movements || [])
    .reduce((sum, movement) => sum + (Number(movement?.amount) || 0), 0);

  const referenceMonth = referenceDate.slice(0, 7);
  const fixedTotal = (data.fixedExpenseSeries || []).reduce((sum, series) => {
    if (!series?.startMonth || series.startMonth > referenceMonth) return sum;
    const occurrences = getOccurrencesForRange(series, series.startMonth, referenceMonth);
    return sum + occurrences
      .filter((occurrence) => occurrence.paymentDate <= referenceDate)
      .reduce((seriesTotal, occurrence) => seriesTotal + Number(occurrence.amount || 0), 0);
  }, 0);

  const closureAdjustmentTotal = getClosedAdjustmentTotal(
    data.monthlyClosures,
    referenceMonth,
    openingBalance.date.slice(0, 7),
  );

  return Number(openingBalance.amount || 0)
    + salaryTotal
    - movementTotal
    - fixedTotal
    + closureAdjustmentTotal;
}

function calculateBalanceAtDate(data, referenceDate) {
  const openingBalance = data.openingBalance;
  if (!openingBalance || !isIsoDate(openingBalance.date) || !isIsoDate(referenceDate)) return null;
  if (referenceDate < openingBalance.date) return null;

  const salaryTotal = Object.values(data.salaries || {}).reduce((sum, record) => {
    const baseAmount = record?.paymentDate >= openingBalance.date
      && record.paymentDate <= referenceDate
      ? Number(record.amount) || 0
      : 0;
    const extraAmount = (record?.extraPayments || [])
      .filter((payment) => (
        payment?.paymentDate >= openingBalance.date
        && payment.paymentDate <= referenceDate
      ))
      .reduce((extraSum, payment) => extraSum + (Number(payment.amount) || 0), 0);
    return sum + baseAmount + extraAmount;
  }, 0);

  const movementTotal = (data.movements || [])
    .filter((movement) => (
      movement?.date >= openingBalance.date
      && movement.date <= referenceDate
    ))
    .reduce((sum, movement) => sum + (Number(movement.amount) || 0), 0);

  const referenceMonth = referenceDate.slice(0, 7);
  const fixedTotal = (data.fixedExpenseSeries || []).reduce((sum, series) => {
    if (!series?.startMonth || series.startMonth > referenceMonth) return sum;
    return sum + getOccurrencesForRange(series, series.startMonth, referenceMonth)
      .filter((occurrence) => (
        occurrence.paymentDate >= openingBalance.date
        && occurrence.paymentDate <= referenceDate
      ))
      .reduce((seriesTotal, occurrence) => (
        seriesTotal + (Number(occurrence.amount) || 0)
      ), 0);
  }, 0);

  const closureAdjustmentTotal = getClosedAdjustmentTotal(
    data.monthlyClosures,
    referenceMonth,
    openingBalance.date.slice(0, 7),
  );

  return Number(openingBalance.amount || 0)
    + salaryTotal
    - movementTotal
    - fixedTotal
    + closureAdjustmentTotal;
}

function calculateMonthlySummaryTotals({ salary, fixed, variable, oneoff }) {
  const habitual = Number(fixed || 0) + Number(variable || 0);
  return {
    habitual,
    total: habitual,
    cashTotal: habitual + Number(oneoff || 0),
    balance: Number(salary || 0) - habitual,
  };
}

export {
  calculateBalanceAtDate,
  calculateCurrentBalance,
  calculateMonthlySummaryTotals,
  getBaseSalaryPaidTotalForMonth,
  getDeclaredSalaryTotal,
  getExtraSalaryPaidTotalForMonth,
  getPaidSalaryTotalForMonth,
  getSalaryTotalFromDate,
};
