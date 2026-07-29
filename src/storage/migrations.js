import { isValidMonth } from '../domain/fixedExpenses.js';

function defaultIdFactory(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEndCondition(expense) {
  const source = expense.endCondition || {};
  const allowedTypes = ['none', 'date', 'amount', 'date_or_amount'];
  const inferredType = expense.endMonth ? 'date' : 'none';
  const type = allowedTypes.includes(source.type) ? source.type : inferredType;
  const includesDate = type === 'date' || type === 'date_or_amount';
  const includesAmount = type === 'amount' || type === 'date_or_amount';
  const targetAmount = Number(source.targetAmount);

  return {
    type,
    endMonth: includesDate && isValidMonth(source.endMonth || expense.endMonth)
      ? (source.endMonth || expense.endMonth)
      : null,
    targetAmount: includesAmount && Number.isFinite(targetAmount) && targetAmount > 0
      ? targetAmount
      : null,
    capLastPayment: source.capLastPayment !== false,
  };
}

function normalizeSeries(expense, context) {
  const { currentMonth, idFactory, timestamp } = context;
  const startMonth = isValidMonth(expense.startMonth) ? expense.startMonth : currentMonth;
  const legacyAmount = Number(expense.amount);
  const rawVersions = Array.isArray(expense.versions) && expense.versions.length
    ? expense.versions
    : [{
        id: `migrated-version-${expense.id || idFactory('fixed')}`,
        effectiveFrom: startMonth,
        amount: legacyAmount,
        createdAt: timestamp,
        note: 'Migrado desde el modelo anterior',
      }];

  const versions = rawVersions
    .filter((version) => version && isValidMonth(version.effectiveFrom) && Number(version.amount) > 0)
    .map((version) => ({
      id: typeof version.id === 'string' ? version.id : idFactory('version'),
      effectiveFrom: version.effectiveFrom,
      amount: Number(version.amount),
      createdAt: typeof version.createdAt === 'string' ? version.createdAt : timestamp,
      note: typeof version.note === 'string' ? version.note.trim() : '',
    }))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  if (!versions.length && Number.isFinite(legacyAmount) && legacyAmount > 0) {
    versions.push({
      id: idFactory('version'),
      effectiveFrom: startMonth,
      amount: legacyAmount,
      createdAt: timestamp,
      note: 'Migrado desde el modelo anterior',
    });
  }

  const exceptionsByMonth = new Map();
  (Array.isArray(expense.exceptions) ? expense.exceptions : []).forEach((exception) => {
    if (!exception || !isValidMonth(exception.month)) return;
    if (exception.type === 'skip') {
      exceptionsByMonth.set(exception.month, {
        month: exception.month,
        type: 'skip',
        amount: null,
        note: typeof exception.note === 'string' ? exception.note.trim() : '',
        createdAt: typeof exception.createdAt === 'string' ? exception.createdAt : timestamp,
      });
    } else if (exception.type === 'override' && Number(exception.amount) > 0) {
      exceptionsByMonth.set(exception.month, {
        month: exception.month,
        type: 'override',
        amount: Number(exception.amount),
        note: typeof exception.note === 'string' ? exception.note.trim() : '',
        createdAt: typeof exception.createdAt === 'string' ? exception.createdAt : timestamp,
      });
    }
  });

  const paymentDay = Number(expense.paymentDay);
  return {
    id: typeof expense.id === 'string' ? expense.id : idFactory('fixed'),
    name: typeof expense.name === 'string' && expense.name.trim() ? expense.name.trim() : 'Gasto fijo',
    category: typeof expense.category === 'string' && expense.category.trim() ? expense.category.trim() : 'Otros',
    paymentDay: Number.isFinite(paymentDay) ? Math.max(1, Math.min(31, Math.trunc(paymentDay))) : 1,
    startMonth,
    endCondition: normalizeEndCondition(expense),
    versions,
    exceptions: [...exceptionsByMonth.values()].sort((left, right) => left.month.localeCompare(right.month)),
    archivedAt: typeof expense.archivedAt === 'string' ? expense.archivedAt : null,
    createdAt: typeof expense.createdAt === 'string' ? expense.createdAt : timestamp,
    updatedAt: typeof expense.updatedAt === 'string' ? expense.updatedAt : timestamp,
  };
}

function migrateFixedExpensesV1ToV2(oldData, options = {}) {
  const source = oldData && typeof oldData === 'object' ? oldData : {};
  const timestamp = options.now || new Date().toISOString();
  const currentMonth = options.currentMonth || timestamp.slice(0, 7);
  const idFactory = options.idFactory || defaultIdFactory;
  const sourceSeries = Array.isArray(source.fixedExpenseSeries)
    ? source.fixedExpenseSeries
    : Array.isArray(source.fixedExpenses)
      ? source.fixedExpenses
      : [];

  return {
    ...source,
    schemaVersion: 2,
    fixedExpenseSeries: sourceSeries
      .filter((expense) => expense && typeof expense === 'object')
      .map((expense) => normalizeSeries(expense, { currentMonth, idFactory, timestamp })),
  };
}

export { migrateFixedExpensesV1ToV2 };
