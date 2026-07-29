const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function createDomainId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidMonth(month) {
  if (!MONTH_PATTERN.test(month || '')) return false;
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber >= 1 && monthNumber <= 12;
}

function addMonths(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function getApplicableVersion(series, month) {
  return [...(series.versions || [])]
    .filter((version) => version.effectiveFrom <= month)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] || null;
}

function getExceptionForMonth(series, month) {
  return (series.exceptions || []).find((exception) => exception.month === month) || null;
}

function hasDateLimit(endCondition) {
  return endCondition?.type === 'date' || endCondition?.type === 'date_or_amount';
}

function hasAmountLimit(endCondition) {
  return endCondition?.type === 'amount' || endCondition?.type === 'date_or_amount';
}

function getPaymentDate(series, month) {
  const paymentDay = Math.max(
    1,
    Math.min(Math.trunc(Number(series.paymentDay)) || 1, daysInMonth(month)),
  );
  return `${month}-${String(paymentDay).padStart(2, '0')}`;
}

function getFixedExpenseOccurrence(series, month, previousOccurrences = []) {
  if (!series || !isValidMonth(month) || series.archivedAt || month < series.startMonth) return null;

  const endCondition = series.endCondition || { type: 'none' };
  if (hasDateLimit(endCondition) && endCondition.endMonth && month > endCondition.endMonth) return null;

  const exception = getExceptionForMonth(series, month);
  if (exception?.type === 'skip') return null;

  const version = getApplicableVersion(series, month);
  if (!version) return null;

  let amount = exception?.type === 'override' ? Number(exception.amount) : Number(version.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (hasAmountLimit(endCondition)) {
    const targetAmount = Number(endCondition.targetAmount);
    const accumulated = previousOccurrences
      .filter((occurrence) =>
        occurrence.seriesId === series.id
        && occurrence.month < month
        && occurrence.countsTowardTarget !== false)
      .reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);

    if (Number.isFinite(targetAmount) && targetAmount > 0) {
      const remaining = targetAmount - accumulated;
      if (remaining <= 0) return null;
      if (endCondition.capLastPayment !== false && amount > remaining) amount = remaining;
    }
  }

  return {
    seriesId: series.id,
    month,
    paymentDate: getPaymentDate(series, month),
    name: series.name,
    category: series.category,
    amount,
    source: exception?.type === 'override' ? 'exception' : 'version',
    versionId: version.id,
    exceptionType: exception?.type || null,
    countsTowardTarget: true,
  };
}

function getOccurrencesForRange(series, startMonth, endMonth) {
  if (!isValidMonth(startMonth) || !isValidMonth(endMonth) || startMonth > endMonth) return [];

  const occurrences = [];
  let cursor = startMonth;
  let guard = 0;

  while (cursor <= endMonth && guard < 2400) {
    const occurrence = getFixedExpenseOccurrence(series, cursor, occurrences);
    if (occurrence) occurrences.push(occurrence);
    cursor = addMonths(cursor, 1);
    guard += 1;
  }

  return occurrences;
}

function getAccumulatedPaidAmount(series, untilMonth) {
  if (!series?.startMonth || !isValidMonth(untilMonth) || untilMonth < series.startMonth) return 0;
  return getOccurrencesForRange(series, series.startMonth, untilMonth)
    .reduce((sum, occurrence) => sum + occurrence.amount, 0);
}

function changeFixedExpenseAmount(series, effectiveFrom, amount, note = '', options = {}) {
  const numericAmount = Number(amount);
  if (!isValidMonth(effectiveFrom) || effectiveFrom < series.startMonth) {
    throw new Error('El mes efectivo no es válido.');
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('El importe debe ser mayor que cero.');
  }

  const duplicate = (series.versions || []).some((version) => version.effectiveFrom === effectiveFrom);
  if (duplicate && !options.replace) {
    throw new Error('Ya existe una versión para ese mes.');
  }

  const now = options.now || new Date().toISOString();
  const versions = (series.versions || [])
    .filter((version) => version.effectiveFrom !== effectiveFrom)
    .concat({
      id: options.id || createDomainId('version'),
      effectiveFrom,
      amount: numericAmount,
      createdAt: now,
      note: note.trim(),
    })
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  return { ...series, versions, updatedAt: now };
}

function upsertException(series, nextException, now) {
  const exceptions = (series.exceptions || [])
    .filter((exception) => exception.month !== nextException.month)
    .concat(nextException)
    .sort((left, right) => left.month.localeCompare(right.month));
  return { ...series, exceptions, updatedAt: now };
}

function overrideFixedExpenseMonth(series, month, amount, note = '', options = {}) {
  const numericAmount = Number(amount);
  if (!isValidMonth(month) || month < series.startMonth || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('El mes y el importe de la excepción deben ser válidos.');
  }
  const now = options.now || new Date().toISOString();
  return upsertException(series, { month, type: 'override', amount: numericAmount, note: note.trim(), createdAt: now }, now);
}

function skipFixedExpenseMonth(series, month, note = '', options = {}) {
  if (!isValidMonth(month) || month < series.startMonth) throw new Error('El mes de la excepción no es válido.');
  const now = options.now || new Date().toISOString();
  return upsertException(series, { month, type: 'skip', amount: null, note: note.trim(), createdAt: now }, now);
}

function finishFixedExpenseFromMonth(series, month, options = {}) {
  if (!isValidMonth(month) || month <= series.startMonth) {
    throw new Error('La finalización debe ser posterior al mes inicial.');
  }

  const endMonth = addMonths(month, -1);
  const current = series.endCondition || { type: 'none', endMonth: null, targetAmount: null, capLastPayment: true };
  const targetAmount = hasAmountLimit(current) ? current.targetAmount : null;
  const type = targetAmount ? 'date_or_amount' : 'date';
  const nextEndMonth = hasDateLimit(current) && current.endMonth && current.endMonth < endMonth
    ? current.endMonth
    : endMonth;
  const now = options.now || new Date().toISOString();

  return {
    ...series,
    endCondition: {
      type,
      endMonth: nextEndMonth,
      targetAmount,
      capLastPayment: current.capLastPayment !== false,
    },
    updatedAt: now,
  };
}

function changeEntireFixedExpenseSeries(series, amount, note = '', options = {}) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('El importe debe ser mayor que cero.');
  const now = options.now || new Date().toISOString();
  return {
    ...series,
    versions: [{
      id: options.id || createDomainId('version'),
      effectiveFrom: series.startMonth,
      amount: numericAmount,
      createdAt: now,
      note: note.trim() || 'Corrección de toda la serie',
    }],
    updatedAt: now,
  };
}

function archiveFixedExpenseSeries(series, options = {}) {
  const now = options.now || new Date().toISOString();
  return { ...series, archivedAt: now, updatedAt: now };
}

export {
  addMonths,
  archiveFixedExpenseSeries,
  changeEntireFixedExpenseSeries,
  changeFixedExpenseAmount,
  finishFixedExpenseFromMonth,
  getAccumulatedPaidAmount,
  getApplicableVersion,
  getExceptionForMonth,
  getFixedExpenseOccurrence,
  getOccurrencesForRange,
  getPaymentDate,
  isValidMonth,
  overrideFixedExpenseMonth,
  skipFixedExpenseMonth,
};
