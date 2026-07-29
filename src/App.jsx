import React, { useEffect, useMemo, useState } from 'react';
import {
  archiveFixedExpenseSeries,
  changeEntireFixedExpenseSeries,
  changeFixedExpenseAmount,
  finishFixedExpenseFromMonth,
  getApplicableVersion,
  getOccurrencesForRange as getSeriesOccurrencesForRange,
  isValidMonth,
  overrideFixedExpenseMonth,
  skipFixedExpenseMonth,
} from './domain/fixedExpenses.js';
import {
  calculateBalanceAtDate,
  calculateCurrentBalance,
  calculateMonthlySummaryTotals,
  getBaseSalaryPaidTotalForMonth,
  getExtraSalaryPaidTotalForMonth,
} from './domain/balance.js';
import { migrateFixedExpensesV1ToV2 } from './storage/migrations.js';
import { createEmptyBudgetData, loadBudgetData, saveBudgetData } from './storage/budgetRepository.js';
import ChartSection from './components/dashboard/ChartSection.jsx';
import DashboardHeader from './components/dashboard/DashboardHeader.jsx';
import DashboardOverview from './components/dashboard/DashboardOverview.jsx';
import ExpenseLists from './components/dashboard/ExpenseLists.jsx';
import FixedExpensesManagerModal from './components/dashboard/FixedExpensesManagerModal.jsx';
import PeriodSelector from './components/dashboard/PeriodSelector.jsx';
import SummaryTable from './components/dashboard/SummaryTable.jsx';
import Field from './components/ui/Field.jsx';
import Modal from './components/ui/Modal.jsx';
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const currency = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const shortMonth = new Intl.DateTimeFormat('es-ES', {
  month: 'short',
  year: '2-digit',
});

const longMonth = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
});

const fullDate = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function monthKey(year, month) {
  return `${year}-${pad(month)}`;
}

function parseMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(value, amount) {
  const date = parseMonth(value);
  date.setMonth(date.getMonth() + amount);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

function monthsBetween(start, end) {
  let first = start;
  let last = end;
  if (first > last) [first, last] = [last, first];

  const result = [];
  let cursor = first;
  let guard = 0;

  while (cursor <= last && guard < 240) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
    guard += 1;
  }

  return result;
}

function daysInMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function lastDayOfMonth(value) {
  return `${value}-${pad(daysInMonth(value))}`;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = parseDate(value);
  return (
    date.getFullYear() === Number(value.slice(0, 4))
    && date.getMonth() + 1 === Number(value.slice(5, 7))
    && date.getDate() === Number(value.slice(8, 10))
  );
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayValues() {
  const now = new Date();
  const currentMonth = monthKey(now.getFullYear(), now.getMonth() + 1);
  const today = `${currentMonth}-${pad(now.getDate())}`;
  return { now, currentMonth, today };
}

function defaultData() {
  return createEmptyBudgetData();
}

function fixedExpenseIsActive(expense, month) {
  if (!expense?.startMonth || month < expense.startMonth) return false;
  return getSeriesOccurrencesForRange(expense, expense.startMonth, month)
    .some((occurrence) => occurrence.month === month);
}

function getEffectiveFixedExpenseDate(expense, month) {
  const occurrence = getSeriesOccurrencesForRange(expense, expense.startMonth, month)
    .find((item) => item.month === month);
  return occurrence?.paymentDate || null;
}

function getFixedExpenseOccurrences(fixedExpenseSeries, startDate, endDate) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) return [];

  return fixedExpenseSeries.flatMap((expense) =>
    getSeriesOccurrencesForRange(expense, expense.startMonth, endDate.slice(0, 7))
      .map((occurrence) => ({
        expense,
        occurrence,
        date: occurrence.paymentDate,
        amount: occurrence.amount,
      }))
      .filter((occurrence) => occurrence.date >= startDate && occurrence.date <= endDate),
  );
}

function salaryStatus(record, openingBalance) {
  const paymentDates = [
    record?.paymentDate,
    ...(record?.extraPayments || []).map((extraPayment) => extraPayment.paymentDate),
  ].filter(Boolean);
  if (!paymentDates.length || !openingBalance?.date) return 'unconfigured';
  return paymentDates.some((paymentDate) => paymentDate >= openingBalance.date)
    ? 'active'
    : 'historical';
}

function createSalaryYearDrafts(year, salaries) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = monthKey(Number(year), index + 1);
    const record = salaries[month];
    return {
      month,
      amount: record?.amount ?? '',
      paymentDate: record?.paymentDate || lastDayOfMonth(month),
      concept: record?.concept || '',
      extraPayments: (record?.extraPayments || []).map((extraPayment, extraIndex) => ({
        id: extraPayment.id || `extra-${month}-${extraIndex}`,
        amount: extraPayment.amount ?? '',
        paymentDate: extraPayment.paymentDate || lastDayOfMonth(month),
        concept: extraPayment.concept || 'Paga extra',
      })),
    };
  });
}

function monthlySummary(month, salaries, fixedExpenseSeries, movements) {
  // La nómina generada en un mes se considera disponible para financiar el mes siguiente.
  // Ejemplo: la nómina de junio se representa como ingreso de julio.
  const representedPayrollMonth = addMonths(month, -1);
  const salaryRecord = salaries[representedPayrollMonth];
  const salary = Number(salaryRecord?.amount || 0);
  const paidSalary = getBaseSalaryPaidTotalForMonth(salaries, month);
  const extraSalary = getExtraSalaryPaidTotalForMonth(salaries, month);
  const activeFixed = fixedExpenseSeries.flatMap((expense) => {
    if (!expense?.startMonth || month < expense.startMonth) return [];
    const occurrence = getSeriesOccurrencesForRange(expense, expense.startMonth, month)
      .find((item) => item.month === month);
    return occurrence
      ? [{
          ...occurrence,
          id: expense.id,
          paymentDay: Number(occurrence.paymentDate.slice(-2)),
        }]
      : [];
  });
  const fixed = activeFixed.reduce((sum, occurrence) => sum + Number(occurrence.amount), 0);
  const monthMovements = movements.filter((movement) => movement.date.startsWith(month));
  const variable = monthMovements
    .filter((movement) => movement.type === 'variable')
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const oneoff = monthMovements
    .filter((movement) => movement.type === 'oneoff')
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const { habitual, total, cashTotal, balance } = calculateMonthlySummaryTotals({
    salary,
    fixed,
    variable,
    oneoff,
  });

  return {
    month,
    salaryRecord,
    salary,
    paidSalary,
    extraSalary,
    fixed,
    variable,
    habitual,
    oneoff,
    total,
    cashTotal,
    balance,
    activeFixed,
    movements: monthMovements,
  };
}

function isMonthClosed(budgetData, month) {
  return budgetData.monthlyClosures?.[month]?.status === 'closed';
}

function salaryRecordTouchesClosedMonth(budgetData, record) {
  return [
    record?.paymentDate,
    ...(record?.extraPayments || []).map((payment) => payment.paymentDate),
  ]
    .filter(Boolean)
    .some((date) => isMonthClosed(budgetData, date.slice(0, 7)));
}

function hasClosedMonthFrom(budgetData, startMonth) {
  return Object.entries(budgetData.monthlyClosures || {})
    .some(([month, closure]) => closure?.status === 'closed' && month >= startMonth);
}

function describeEndCondition(series) {
  const condition = series.endCondition || { type: 'none' };
  if (condition.type === 'date') return `hasta ${condition.endMonth}`;
  if (condition.type === 'amount') return `hasta ${currency.format(condition.targetAmount)}`;
  if (condition.type === 'date_or_amount') {
    return `hasta ${condition.endMonth} o ${currency.format(condition.targetAmount)}`;
  }
  return 'sin finalización';
}

function getFixedExpenseHistory(series) {
  const entries = [
    {
      order: series.startMonth,
      label: `${series.startMonth}: serie creada`,
    },
    ...(series.versions || []).map((version) => ({
      order: version.effectiveFrom,
      label: `${version.effectiveFrom}: importe de ${currency.format(version.amount)}${version.note ? ` · ${version.note}` : ''}`,
    })),
    ...(series.exceptions || []).map((exception) => ({
      order: exception.month,
      label: exception.type === 'skip'
        ? `${exception.month}: cuota omitida${exception.note ? ` · ${exception.note}` : ''}`
        : `${exception.month}: cuota excepcional de ${currency.format(exception.amount)}${exception.note ? ` · ${exception.note}` : ''}`,
    })),
  ];

  if (series.endCondition?.endMonth) {
    entries.push({
      order: series.endCondition.endMonth,
      label: `${series.endCondition.endMonth}: último mes programado`,
    });
  }
  if (series.archivedAt) {
    entries.push({
      order: series.archivedAt.slice(0, 7),
      label: `${series.archivedAt.slice(0, 10)}: serie archivada`,
    });
  }
  return entries.sort((left, right) => left.order.localeCompare(right.order));
}

function MonthlyChart({ summaries, singleMonth }) {
  if (singleMonth) {
    return <DailyChart summary={summaries[0]} />;
  }

  const width = 980;
  const height = 420;
  const margin = { top: 28, right: 24, bottom: 68, left: 82 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(100, ...summaries.map((item) => Math.max(item.salary, item.cashTotal))) * 1.12;
  const y = (value) => margin.top + chartHeight - (value / maxValue) * chartHeight;
  const slot = chartWidth / Math.max(summaries.length, 1);
  const barWidth = Math.max(10, Math.min(46, slot * 0.64));
  const tickStep = Math.max(1, Math.ceil(summaries.length / 12));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparación mensual entre nómina y gastos">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (maxValue * tick) / 4;
          const position = y(value);
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={position}
                y2={position}
                className="grid-line"
              />
              <text x={margin.left - 10} y={position + 4} textAnchor="end" className="axis-text">
                {currency.format(value)}
              </text>
            </g>
          );
        })}

        {summaries.map((item, index) => {
          const center = margin.left + slot * index + slot / 2;
          const salaryHeight = Math.max(0, chartHeight - (y(item.salary) - margin.top));
          const fixedHeight = Math.max(0, chartHeight - (y(item.fixed) - margin.top));
          const variableTop = item.fixed + item.variable;
          const variableHeight = Math.max(0, y(item.fixed) - y(variableTop));
          const oneoffTop = item.cashTotal;
          const oneoffHeight = Math.max(0, y(item.habitual) - y(oneoffTop));
          const showLabel = index % tickStep === 0 || index === summaries.length - 1;

          return (
            <g key={item.month}>
              <rect
                x={center - barWidth / 2}
                y={y(item.salary)}
                width={barWidth}
                height={salaryHeight}
                rx="6"
                className="salary-column"
              />
              <rect
                x={center - barWidth * 0.34}
                y={y(item.fixed)}
                width={barWidth * 0.68}
                height={fixedHeight}
                rx="4"
                className="fixed-column"
              />
              <rect
                x={center - barWidth * 0.34}
                y={y(variableTop)}
                width={barWidth * 0.68}
                height={variableHeight}
                className="variable-column"
              />
              {item.oneoff > 0 ? (
                <rect
                  x={center - barWidth * 0.34}
                  y={y(oneoffTop)}
                  width={barWidth * 0.68}
                  height={oneoffHeight}
                  rx="4"
                  className="oneoff-column"
                />
              ) : null}
              {item.total > item.salary ? (
                <line
                  x1={center - barWidth / 2 - 2}
                  x2={center + barWidth / 2 + 2}
                  y1={y(item.salary)}
                  y2={y(item.salary)}
                  className="overrun-line"
                />
              ) : null}
              {showLabel ? (
                <text x={center} y={height - 34} textAnchor="middle" className="axis-text">
                  {shortMonth.format(parseMonth(item.month))}
                </text>
              ) : null}
              <title>
                {`${longMonth.format(parseMonth(item.month))}: nómina ${currency.format(item.salary)}, fijos ${currency.format(item.fixed)}, variables ${currency.format(item.variable)}, puntuales ${currency.format(item.oneoff)}`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DailyChart({ summary }) {
  const width = 980;
  const height = 420;
  const margin = { top: 28, right: 28, bottom: 62, left: 82 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const totalDays = daysInMonth(summary.month);
  const { currentMonth, today } = todayValues();
  const plottedDays = summary.month < currentMonth
    ? totalDays
    : summary.month === currentMonth
      ? Number(today.slice(-2))
      : 0;

  const dailyHabitual = new Map();
  summary.activeFixed.forEach((expense) => {
    const day = Math.min(Number(expense.paymentDay || 1), totalDays);
    dailyHabitual.set(day, (dailyHabitual.get(day) || 0) + Number(expense.amount));
  });
  summary.movements
    .filter((movement) => movement.type === 'variable')
    .forEach((movement) => {
      const day = Number(movement.date.slice(-2));
      dailyHabitual.set(day, (dailyHabitual.get(day) || 0) + Number(movement.amount));
    });

  const dailyOneoff = new Map();
  summary.movements
    .filter((movement) => movement.type === 'oneoff')
    .forEach((movement) => {
      const day = Number(movement.date.slice(-2));
      dailyOneoff.set(day, (dailyOneoff.get(day) || 0) + Number(movement.amount));
    });

  let accumulatedHabitual = 0;
  let accumulatedTotal = 0;
  const points = [];
  for (let day = 1; day <= plottedDays; day += 1) {
    accumulatedHabitual += dailyHabitual.get(day) || 0;
    accumulatedTotal += (dailyHabitual.get(day) || 0) + (dailyOneoff.get(day) || 0);
    points.push({ day, habitual: accumulatedHabitual, total: accumulatedTotal });
  }

  const visibleExpenseMax = points.reduce(
    (maximum, point) => Math.max(maximum, point.habitual, point.total),
    0,
  );
  const maxValue = Math.max(100, summary.salary, visibleExpenseMax) * 1.12;
  const x = (day) => margin.left + ((day - 1) / Math.max(totalDays - 1, 1)) * chartWidth;
  const y = (value) => margin.top + chartHeight - (value / maxValue) * chartHeight;
  const habitualPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.day)} ${y(point.habitual)}`)
    .join(' ');
  const totalPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.day)} ${y(point.total)}`)
    .join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución diaria de gastos habituales y gastos totales">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (maxValue * tick) / 4;
          const position = y(value);
          return (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={position} y2={position} className="grid-line" />
              <text x={margin.left - 10} y={position + 4} textAnchor="end" className="axis-text">
                {currency.format(value)}
              </text>
            </g>
          );
        })}

        {summary.salary > 0 ? (
          <g>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(summary.salary)}
              y2={y(summary.salary)}
              className="salary-line"
            />
            <text x={width - margin.right} y={Math.max(18, y(summary.salary) - 9)} textAnchor="end" className="salary-label">
              Nómina: {currency.format(summary.salary)}
            </text>
          </g>
        ) : null}

        <path d={totalPath} className="total-path" />
        <path d={habitualPath} className="habitual-path" />

        {Array.from({ length: totalDays }, (_, index) => index + 1)
          .map((day) => (
            <text key={day} x={x(day)} y={height - 24} textAnchor="middle" className="axis-text">
              {day}
            </text>
          ))}

        {summary.movements
          .filter((movement) => movement.type === 'oneoff')
          .filter((movement) => Number(movement.date.slice(-2)) <= plottedDays)
          .map((movement) => {
            const day = Number(movement.date.slice(-2));
            const point = points[day - 1];
            return (
              <g key={movement.id}>
                <rect
                  x={x(day) - 6}
                  y={y(point.total) - 6}
                  width="12"
                  height="12"
                  transform={`rotate(45 ${x(day)} ${y(point.total)})`}
                  className="oneoff-marker"
                />
                <title>{`${movement.description}: ${currency.format(movement.amount)}`}</title>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

export default function App() {
  const { now, currentMonth, today } = todayValues();
  const [data, setData] = useState(defaultData);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dataStatus, setDataStatus] = useState('Abriendo SQLite local…');
  const [activeModal, setActiveModal] = useState(null);
  const [toast, setToast] = useState('');
  const [viewMode, setViewMode] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [rangeStart, setRangeStart] = useState(`${now.getFullYear()}-01`);
  const [rangeEnd, setRangeEnd] = useState(`${now.getFullYear()}-12`);
  const [movementFilter, setMovementFilter] = useState('all');
  const [salaryMessage, setSalaryMessage] = useState('');
  const [openingMessage, setOpeningMessage] = useState('');
  const [salaryHistoryMessage, setSalaryHistoryMessage] = useState('');
  const [fixedMessage, setFixedMessage] = useState('');
  const [movementMessage, setMovementMessage] = useState('');
  const [salaryHistoryYear, setSalaryHistoryYear] = useState(String(now.getFullYear()));
  const [salaryYearDrafts, setSalaryYearDrafts] = useState(() =>
    createSalaryYearDrafts(now.getFullYear(), data.salaries),
  );

  const [salaryForm, setSalaryForm] = useState({
    month: currentMonth,
    amount: data.salaries[currentMonth]?.amount ?? '',
    paymentDate: data.salaries[currentMonth]?.paymentDate || lastDayOfMonth(currentMonth),
    concept: data.salaries[currentMonth]?.concept || '',
  });

  const [openingForm, setOpeningForm] = useState({
    date: data.openingBalance?.date || today,
    amount: data.openingBalance?.amount ?? '',
    accountName: data.openingBalance?.accountName || '',
  });

  const [fixedForm, setFixedForm] = useState({
    name: '',
    category: 'Vivienda',
    amount: '',
    paymentDay: '1',
    startMonth: currentMonth,
    endType: 'none',
    endMonth: '',
    targetAmount: '',
    capLastPayment: true,
    note: '',
  });
  const [fixedEditor, setFixedEditor] = useState(null);
  const [fixedDeleteTarget, setFixedDeleteTarget] = useState(null);
  const [historySeriesId, setHistorySeriesId] = useState(null);

  const [movementForm, setMovementForm] = useState({
    date: today,
    amount: '',
    type: 'variable',
    category: 'Alimentación',
    description: '',
  });
  const [reviewBankBalance, setReviewBankBalance] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [autoOpenedReviewMonth, setAutoOpenedReviewMonth] = useState(null);

  useEffect(() => {
    let active = true;
    loadBudgetData()
      .then((storedData) => {
        if (!active) return;
        setData(storedData);
        setSalaryForm({
          month: currentMonth,
          amount: storedData.salaries[currentMonth]?.amount ?? '',
          paymentDate: storedData.salaries[currentMonth]?.paymentDate || lastDayOfMonth(currentMonth),
          concept: storedData.salaries[currentMonth]?.concept || '',
        });
        setOpeningForm({
          date: storedData.openingBalance?.date || today,
          amount: storedData.openingBalance?.amount ?? '',
          accountName: storedData.openingBalance?.accountName || '',
        });
        setIsDataLoaded(true);
        setDataStatus('Datos cargados desde SQLite local.');
      })
      .catch((error) => {
        if (!active) return;
        console.warn(error);
        setDataStatus('No se pudo abrir SQLite local. Los cambios no se guardarán.');
      });
    return () => {
      active = false;
    };
  }, [currentMonth, today]);

  useEffect(() => {
    if (!isDataLoaded) return undefined;
    const timeout = window.setTimeout(() => {
      saveBudgetData(data)
        .then(() => setDataStatus('Datos guardados en SQLite local.'))
        .catch((error) => {
          console.warn(error);
          setDataStatus('Error al guardar en SQLite.');
        });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [data, isDataLoaded]);

  useEffect(() => {
    setSalaryYearDrafts(createSalaryYearDrafts(salaryHistoryYear, data.salaries));
  }, [salaryHistoryYear, data.salaries]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!activeModal && !fixedEditor && !fixedDeleteTarget) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (fixedDeleteTarget) setFixedDeleteTarget(null);
      else if (fixedEditor) setFixedEditor(null);
      else setActiveModal(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal, fixedEditor, fixedDeleteTarget]);

  const selectedMonths = useMemo(() => {
    if (viewMode === 'month') return [selectedMonth];
    if (viewMode === 'year') {
      return Array.from({ length: 12 }, (_, index) => monthKey(Number(selectedYear), index + 1));
    }
    return monthsBetween(rangeStart, rangeEnd);
  }, [viewMode, selectedMonth, selectedYear, rangeStart, rangeEnd]);

  const summaries = useMemo(
    () => selectedMonths.map((month) => ({
      ...monthlySummary(month, data.salaries, data.fixedExpenseSeries, data.movements),
      closureStatus: data.monthlyClosures?.[month]?.status || 'open',
      previousBalance: monthlySummary(
        addMonths(month, -1),
        data.salaries,
        data.fixedExpenseSeries,
        data.movements,
      ).balance,
    })),
    [selectedMonths, data],
  );

  const totals = useMemo(
    () =>
      summaries.reduce(
        (result, item) => ({
          salary: result.salary + item.salary,
          paidSalary: result.paidSalary + item.paidSalary,
          extraSalary: result.extraSalary + item.extraSalary,
          fixed: result.fixed + item.fixed,
          variable: result.variable + item.variable,
          habitual: result.habitual + item.habitual,
          oneoff: result.oneoff + item.oneoff,
          total: result.total + item.total,
          balance: result.balance + item.balance,
        }),
        { salary: 0, paidSalary: 0, extraSalary: 0, fixed: 0, variable: 0, habitual: 0, oneoff: 0, total: 0, balance: 0 },
      ),
    [summaries],
  );

  const visibleMovements = useMemo(() => {
    const monthSet = new Set(selectedMonths);
    return data.movements
      .filter((movement) => monthSet.has(movement.date.slice(0, 7)))
      .filter((movement) => movementFilter === 'all' || movement.type === movementFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.movements, selectedMonths, movementFilter]);

  const fixedForPeriod = useMemo(
    () =>
      data.fixedExpenseSeries.filter((expense) =>
        selectedMonths.some((month) => fixedExpenseIsActive(expense, month)),
      ),
    [data.fixedExpenseSeries, selectedMonths],
  );

  const currentBalance = useMemo(
    () => calculateCurrentBalance(data, today),
    [data, today],
  );

  const currentSummary = useMemo(
    () => monthlySummary(currentMonth, data.salaries, data.fixedExpenseSeries, data.movements),
    [currentMonth, data],
  );

  const reviewMonth = useMemo(() => {
    if (!data.openingBalance?.date) return null;
    const firstControlledMonth = data.openingBalance.date.slice(0, 7);
    const lastCompletedMonth = addMonths(currentMonth, -1);
    if (firstControlledMonth > lastCompletedMonth) return null;
    return monthsBetween(firstControlledMonth, lastCompletedMonth)
      .find((month) => !isMonthClosed(data, month)) || null;
  }, [currentMonth, data.openingBalance, data.monthlyClosures]);

  const reviewClosingDate = reviewMonth ? lastDayOfMonth(reviewMonth) : null;
  const calculatedReviewBalance = useMemo(
    () => reviewClosingDate ? calculateBalanceAtDate(data, reviewClosingDate) : null,
    [data, reviewClosingDate],
  );
  const parsedReviewBankBalance = reviewBankBalance === '' ? null : Number(reviewBankBalance);
  const reviewDifference = Number.isFinite(parsedReviewBankBalance)
    && calculatedReviewBalance !== null
    ? Math.round((parsedReviewBankBalance - calculatedReviewBalance) * 100) / 100
    : null;

  useEffect(() => {
    if (!isDataLoaded || !reviewMonth) return;
    const closure = data.monthlyClosures?.[reviewMonth];
    if (!closure) {
      setData((current) => ({
        ...current,
        monthlyClosures: {
          ...(current.monthlyClosures || {}),
          [reviewMonth]: {
            month: reviewMonth,
            status: 'pending_review',
            requestedAt: new Date().toISOString(),
          },
        },
      }));
    }
    if (autoOpenedReviewMonth === reviewMonth) return;
    setReviewBankBalance(closure?.bankClosingBalance ?? '');
    setReviewMessage('');
    setAutoOpenedReviewMonth(reviewMonth);
    setActiveModal('monthlyReview');
  }, [
    autoOpenedReviewMonth,
    data.monthlyClosures,
    isDataLoaded,
    reviewMonth,
  ]);

  const selectedSalaryStatus = salaryStatus(
    salaryForm.paymentDate ? { paymentDate: salaryForm.paymentDate } : null,
    data.openingBalance,
  );

  function loadSalaryForm(month) {
    const record = data.salaries[month];
    setSalaryForm({
      month,
      amount: record?.amount ?? '',
      paymentDate: record?.paymentDate || lastDayOfMonth(month),
      concept: record?.concept || '',
    });
  }

  function openMonthlyReview() {
    if (!reviewMonth) return;
    const closure = data.monthlyClosures?.[reviewMonth];
    setReviewBankBalance(closure?.bankClosingBalance ?? '');
    setReviewMessage('');
    setActiveModal('monthlyReview');
  }

  function closeReviewedMonth(event) {
    event.preventDefault();
    if (
      reviewMonth === null
      || calculatedReviewBalance === null
      || reviewBankBalance === ''
      || !Number.isFinite(parsedReviewBankBalance)
    ) {
      setReviewMessage('Introduce el saldo bancario al cierre del último día del mes.');
      return;
    }

    const closedAt = new Date().toISOString();
    setData((current) => ({
      ...current,
      monthlyClosures: {
        ...(current.monthlyClosures || {}),
        [reviewMonth]: {
          month: reviewMonth,
          status: 'closed',
          closingDate: reviewClosingDate,
          calculatedClosingBalance: calculatedReviewBalance,
          bankClosingBalance: parsedReviewBankBalance,
          difference: reviewDifference,
          requestedAt: current.monthlyClosures?.[reviewMonth]?.requestedAt || closedAt,
          closedAt,
        },
      },
    }));
    setReviewMessage('');
    setActiveModal(null);
    setToast(`${longMonth.format(parseMonth(reviewMonth))} cerrado y conciliado.`);
  }

  function saveOpeningBalance(event) {
    event.preventDefault();
    if (Object.values(data.monthlyClosures || {}).some((closure) => closure?.status === 'closed')) {
      setOpeningMessage('No se puede cambiar el saldo inicial mientras existan meses cerrados.');
      return;
    }
    const amount = Number(openingForm.amount);
    if (!isIsoDate(openingForm.date) || openingForm.amount === '' || !Number.isFinite(amount) || amount < 0) {
      setOpeningMessage('Introduce una fecha válida y un saldo inicial no negativo.');
      return;
    }

    setData((current) => ({
      ...current,
      openingBalance: {
        date: openingForm.date,
        amount,
        accountName: openingForm.accountName.trim(),
      },
    }));
    setOpeningMessage('Configuración inicial guardada.');
    setToast('Cuenta y saldo inicial actualizados.');
    setActiveModal(null);
  }

  function saveSalary(event) {
    event.preventDefault();
    const amount = Number(salaryForm.amount);
    if (
      !salaryForm.month
      || salaryForm.amount === ''
      || !Number.isFinite(amount)
      || amount < 0
      || !isIsoDate(salaryForm.paymentDate)
    ) {
      setSalaryMessage('Introduce un mes, un importe no negativo y una fecha de cobro válida.');
      return;
    }
    if (
      isMonthClosed(data, salaryForm.paymentDate.slice(0, 7))
      || isMonthClosed(data, data.salaries[salaryForm.month]?.paymentDate?.slice(0, 7))
    ) {
      setSalaryMessage('No se puede modificar una nómina cobrada en un mes cerrado.');
      return;
    }

    setData((current) => ({
      ...current,
      salaries: {
        ...current.salaries,
        [salaryForm.month]: {
          payrollMonth: salaryForm.month,
          amount,
          paymentDate: salaryForm.paymentDate,
          concept: salaryForm.concept.trim(),
          extraPayments: current.salaries[salaryForm.month]?.extraPayments || [],
        },
      },
    }));
    setSalaryMessage(`Nómina de ${longMonth.format(parseMonth(salaryForm.month))} guardada.`);
    setToast(`Nómina de ${longMonth.format(parseMonth(salaryForm.month))} guardada.`);
    setActiveModal(null);
  }

  function updateSalaryYearDraft(month, field, value) {
    setSalaryYearDrafts((current) =>
      current.map((draft) => (draft.month === month ? { ...draft, [field]: value } : draft)),
    );
  }

  function addSalaryExtraDraft(month) {
    setSalaryYearDrafts((current) =>
      current.map((draft) => (
        draft.month === month
          ? {
              ...draft,
              extraPayments: [
                ...(draft.extraPayments || []),
                {
                  id: createId('salary-extra'),
                  amount: '',
                  paymentDate: lastDayOfMonth(month),
                  concept: 'Paga extra',
                },
              ],
            }
          : draft
      )),
    );
  }

  function updateSalaryExtraDraft(month, extraPaymentId, field, value) {
    setSalaryYearDrafts((current) =>
      current.map((draft) => (
        draft.month === month
          ? {
              ...draft,
              extraPayments: (draft.extraPayments || []).map((extraPayment) =>
                extraPayment.id === extraPaymentId
                  ? { ...extraPayment, [field]: value }
                  : extraPayment,
              ),
            }
          : draft
      )),
    );
  }

  function removeSalaryExtraDraft(month, extraPaymentId) {
    setSalaryYearDrafts((current) =>
      current.map((draft) => (
        draft.month === month
          ? {
              ...draft,
              extraPayments: (draft.extraPayments || [])
                .filter((extraPayment) => extraPayment.id !== extraPaymentId),
            }
          : draft
      )),
    );
  }

  function saveSalaryYear(event) {
    event.preventDefault();
    const records = {};

    for (const draft of salaryYearDrafts) {
      const extraPayments = [];
      for (const extraPayment of draft.extraPayments || []) {
        if (extraPayment.amount === '') continue;
        const extraAmount = Number(extraPayment.amount);
        if (
          !Number.isFinite(extraAmount)
          || extraAmount <= 0
          || !isIsoDate(extraPayment.paymentDate)
        ) {
          setSalaryHistoryMessage(
            `Revisa la paga extra de ${longMonth.format(parseMonth(draft.month))}.`,
          );
          return;
        }
        extraPayments.push({
          id: extraPayment.id || createId('salary-extra'),
          amount: extraAmount,
          paymentDate: extraPayment.paymentDate,
          concept: extraPayment.concept.trim() || 'Paga extra',
        });
      }

      if (draft.amount === '' && !extraPayments.length) continue;
      const amount = draft.amount === '' ? 0 : Number(draft.amount);
      if (!Number.isFinite(amount) || amount < 0 || !isIsoDate(draft.paymentDate)) {
        setSalaryHistoryMessage(
          `Revisa el importe y la fecha de cobro de ${longMonth.format(parseMonth(draft.month))}.`,
        );
        return;
      }
      const nextRecord = {
        payrollMonth: draft.month,
        amount,
        paymentDate: draft.paymentDate,
        concept: draft.concept.trim(),
        extraPayments,
      };
      const currentRecord = data.salaries[draft.month];
      const recordChanged = JSON.stringify(currentRecord) !== JSON.stringify(nextRecord);
      if (
        recordChanged
        && (
          salaryRecordTouchesClosedMonth(data, currentRecord)
          || salaryRecordTouchesClosedMonth(data, nextRecord)
        )
      ) {
        setSalaryHistoryMessage(
          `No se puede modificar una nómina cobrada en un mes cerrado (${longMonth.format(parseMonth(draft.month))}).`,
        );
        return;
      }
      records[draft.month] = nextRecord;
    }

    setData((current) => ({
      ...current,
      salaries: { ...current.salaries, ...records },
    }));
    setSalaryHistoryMessage(`Nóminas de ${salaryHistoryYear} guardadas correctamente.`);
    setToast(`Nóminas de ${salaryHistoryYear} guardadas.`);
    setActiveModal(null);
  }

  function addFixedExpense(event) {
    event.preventDefault();
    const amount = Number(fixedForm.amount);
    const paymentDay = Number(fixedForm.paymentDay);
    const targetAmount = Number(fixedForm.targetAmount);
    const needsEndMonth = fixedForm.endType === 'date' || fixedForm.endType === 'date_or_amount';
    const needsTarget = fixedForm.endType === 'amount' || fixedForm.endType === 'date_or_amount';

    if (
      !fixedForm.name.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !fixedForm.startMonth ||
      !Number.isFinite(paymentDay) ||
      paymentDay < 1 ||
      paymentDay > 31 ||
      (needsEndMonth && (!fixedForm.endMonth || fixedForm.endMonth < fixedForm.startMonth)) ||
      (needsTarget && (!Number.isFinite(targetAmount) || targetAmount <= 0))
    ) {
      setFixedMessage('Revisa el nombre, el importe, el día de cobro y las condiciones de finalización.');
      return;
    }
    if (isMonthClosed(data, fixedForm.startMonth)) {
      setFixedMessage('No se puede crear un gasto fijo dentro de un mes cerrado.');
      return;
    }

    const timestamp = new Date().toISOString();
    const expense = {
      id: createId('fixed'),
      name: fixedForm.name.trim(),
      category: fixedForm.category,
      paymentDay,
      startMonth: fixedForm.startMonth,
      endCondition: {
        type: fixedForm.endType,
        endMonth: needsEndMonth ? fixedForm.endMonth : null,
        targetAmount: needsTarget ? targetAmount : null,
        capLastPayment: fixedForm.capLastPayment,
      },
      versions: [{
        id: createId('version'),
        effectiveFrom: fixedForm.startMonth,
        amount,
        createdAt: timestamp,
        note: fixedForm.note.trim() || 'Importe inicial',
      }],
      exceptions: [],
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({
      ...current,
      fixedExpenseSeries: [...current.fixedExpenseSeries, expense],
    }));
    setFixedForm((current) => ({
      ...current,
      name: '',
      amount: '',
      targetAmount: '',
      note: '',
    }));
    setFixedMessage('Gasto fijo añadido con historial versionado.');
    setToast('Gasto fijo añadido.');
    setActiveModal(null);
  }

  function addMovement(event) {
    event.preventDefault();
    const amount = Number(movementForm.amount);
    if (!movementForm.date || !Number.isFinite(amount) || amount <= 0) {
      setMovementMessage('Introduce una fecha y un importe superior a cero.');
      return;
    }
    if (isMonthClosed(data, movementForm.date.slice(0, 7))) {
      setMovementMessage('No se pueden añadir gastos a un mes cerrado.');
      return;
    }

    const movement = {
      id: createId('movement'),
      date: movementForm.date,
      amount,
      type: movementForm.type,
      category: movementForm.category,
      description: movementForm.description.trim() || 'Sin concepto',
    };

    setData((current) => ({
      ...current,
      movements: [...current.movements, movement],
    }));
    setMovementForm((current) => ({ ...current, amount: '', description: '' }));
    setMovementMessage(
      movement.type === 'oneoff'
        ? 'Gasto puntual añadido. Afecta al saldo, pero queda separado del gasto habitual.'
        : 'Gasto variable añadido al consumo habitual del mes.',
    );
    setToast(movement.type === 'oneoff' ? 'Gasto puntual añadido.' : 'Gasto variable añadido.');
    setActiveModal(null);
  }

  function getEditingMonth(expense) {
    return selectedMonths.find((month) => month >= expense.startMonth) || expense.startMonth;
  }

  function openFixedEditor(expense, options = {}) {
    const month = options.month || getEditingMonth(expense);
    const occurrence = getSeriesOccurrencesForRange(expense, expense.startMonth, month)
      .find((item) => item.month === month);
    const version = getApplicableVersion(expense, month);
    setActiveModal(null);
    setFixedEditor({
      seriesId: expense.id,
      month,
      amount: occurrence?.amount ?? version?.amount ?? '',
      note: '',
      scope: 'month',
      monthOnly: Boolean(options.monthOnly),
    });
  }

  function openFixedMonthEditor(expense) {
    const series = data.fixedExpenseSeries.find((item) => item.id === expense.id);
    if (series) openFixedEditor(series, { month: expense.month, monthOnly: true });
  }

  function saveFixedExpenseEdit(event) {
    event.preventDefault();
    const amount = Number(fixedEditor.amount);
    const editingSeries = data.fixedExpenseSeries.find((series) => series.id === fixedEditor.seriesId);
    if (
      !editingSeries
      || !isValidMonth(fixedEditor.month)
      || fixedEditor.month < editingSeries.startMonth
      || !Number.isFinite(amount)
      || amount <= 0
    ) {
      setFixedMessage('El mes y el nuevo importe deben ser válidos.');
      return;
    }
    if (
      isMonthClosed(data, fixedEditor.month)
      || (fixedEditor.scope === 'all' && hasClosedMonthFrom(data, editingSeries.startMonth))
    ) {
      setFixedMessage('No se puede modificar un gasto fijo que afecte a meses cerrados.');
      return;
    }

    const replacesExistingVersion = fixedEditor.scope === 'future'
      && editingSeries.versions.some((version) => version.effectiveFrom === fixedEditor.month);
    if (
      replacesExistingVersion
      && !window.confirm('Ya existe un cambio de importe para ese mes. ¿Quieres reemplazarlo?')
    ) {
      return;
    }

    if (
      fixedEditor.scope === 'all'
      && !window.confirm(
        'Esta acción cambiará también los meses anteriores. Úsala solo para corregir un dato que siempre fue incorrecto. ¿Continuar?',
      )
    ) {
      return;
    }

    setData((current) => ({
      ...current,
      fixedExpenseSeries: current.fixedExpenseSeries.map((series) => {
        if (series.id !== fixedEditor.seriesId) return series;
        if (fixedEditor.scope === 'month') {
          return overrideFixedExpenseMonth(series, fixedEditor.month, amount, fixedEditor.note);
        }
        if (fixedEditor.scope === 'all') {
          return changeEntireFixedExpenseSeries(series, amount, fixedEditor.note);
        }
        const duplicate = series.versions.some((version) => version.effectiveFrom === fixedEditor.month);
        return changeFixedExpenseAmount(series, fixedEditor.month, amount, fixedEditor.note, {
          replace: duplicate,
        });
      }),
    }));
    setFixedEditor(null);
    setFixedMessage('Cambio guardado sin modificar otros meses fuera del alcance elegido.');
    setToast('Cambio del gasto fijo guardado.');
  }

  function openFixedDeleteDialog(expense, options = {}) {
    setActiveModal(null);
    setFixedDeleteTarget({
      seriesId: expense.id,
      month: options.month || getEditingMonth(expense),
      monthOnly: Boolean(options.monthOnly),
    });
  }

  function openFixedMonthDeleteDialog(expense) {
    const series = data.fixedExpenseSeries.find((item) => item.id === expense.id);
    if (series) openFixedDeleteDialog(series, { month: expense.month, monthOnly: true });
  }

  function applyFixedDelete(action) {
    const target = fixedDeleteTarget;
    if (!target) return;
    const series = data.fixedExpenseSeries.find((item) => item.id === target.seriesId);
    const changesHistory = action === 'archive' || action === 'permanent';
    if (
      isMonthClosed(data, target.month)
      || (changesHistory && series && hasClosedMonthFrom(data, series.startMonth))
    ) {
      setFixedDeleteTarget(null);
      setToast('No se puede eliminar un gasto fijo que afecte a meses cerrados.');
      return;
    }

    if (
      action === 'permanent'
      && !window.confirm(
        'Esta acción borra definitivamente la serie porque fue creada por error. ¿Quieres continuar?',
      )
    ) {
      return;
    }

    setData((current) => ({
      ...current,
      fixedExpenseSeries: action === 'permanent'
        ? current.fixedExpenseSeries.filter((series) => series.id !== target.seriesId)
        : current.fixedExpenseSeries.map((series) => {
            if (series.id !== target.seriesId) return series;
            if (action === 'month') {
              return skipFixedExpenseMonth(series, target.month, 'Cuota omitida por el usuario');
            }
            if (action === 'future') {
              return target.month <= series.startMonth
                ? archiveFixedExpenseSeries(series)
                : finishFixedExpenseFromMonth(series, target.month);
            }
            return archiveFixedExpenseSeries(series);
          }),
    }));
    setFixedDeleteTarget(null);
    setToast('Gasto fijo actualizado.');
    setFixedMessage(
      action === 'month'
        ? 'Solo se ha omitido la cuota del mes seleccionado.'
        : action === 'future'
          ? 'La serie se ha finalizado desde el mes seleccionado.'
          : action === 'permanent'
            ? 'La serie creada por error se ha borrado definitivamente.'
            : 'La serie completa se ha archivado.',
    );
  }

  function removeMovement(id) {
    const movement = data.movements.find((item) => item.id === id);
    if (movement && isMonthClosed(data, movement.date.slice(0, 7))) {
      setToast('No se puede eliminar un movimiento de un mes cerrado.');
      return;
    }
    setData((current) => ({
      ...current,
      movements: current.movements.filter((movement) => movement.id !== id),
    }));
    setToast('Movimiento eliminado.');
  }

  function openMonth(month) {
    setViewMode('month');
    setSelectedMonth(month);
    loadSalaryForm(month);
  }

  const currentMonthLabel = longMonth.format(parseMonth(currentMonth));
  const periodLabel =
    summaries.length === 1
      ? longMonth.format(parseMonth(summaries[0].month))
      : `${shortMonth.format(parseMonth(summaries[0].month))} – ${shortMonth.format(parseMonth(summaries[summaries.length - 1].month))}`;
  const activeFixedExpenses = fixedForPeriod.map((expense) => {
    const effectiveMonth = [...selectedMonths]
      .reverse()
      .find((month) => fixedExpenseIsActive(expense, month));
    const occurrence = effectiveMonth
      ? getSeriesOccurrencesForRange(expense, expense.startMonth, effectiveMonth)
          .find((item) => item.month === effectiveMonth)
      : null;

    return {
      id: expense.id,
      name: expense.name,
      category: expense.category,
      paymentDay: expense.paymentDay,
      month: effectiveMonth,
      amount: occurrence?.amount ?? null,
    };
  });

  return (
    <main className="mx-auto w-[calc(100%_-_2rem)] max-w-[77.5rem] py-8 max-md:w-[calc(100%_-_1.25rem)] max-md:pt-5">
      <DashboardHeader dataStatus={dataStatus} toast={toast} />
      <DashboardOverview
        accountName={data.openingBalance?.accountName}
        currentBalance={currentBalance}
        currentMonthLabel={currentMonthLabel}
        currentSummary={currentSummary}
        hasOpeningBalance={Boolean(data.openingBalance)}
        onOpenModal={setActiveModal}
        openingDateLabel={data.openingBalance ? fullDate.format(parseDate(data.openingBalance.date)) : ''}
        periodLabel={periodLabel}
        todayLabel={fullDate.format(parseDate(today))}
        totals={totals}
        formatCurrency={(value) => currency.format(value)}
      />

      {reviewMonth ? (
        <section className="mt-4.5 flex items-center justify-between gap-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4.5 max-sm:flex-col max-sm:items-stretch">
          <div>
            <strong className="text-amber-950">Cierre mensual pendiente</strong>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Revisa {longMonth.format(parseMonth(reviewMonth))} con el saldo bancario al cierre del {fullDate.format(parseDate(reviewClosingDate))}.
            </p>
          </div>
          <button type="button" className="primary-button shrink-0" onClick={openMonthlyReview}>
            Continuar revisión
          </button>
        </section>
      ) : null}

      {activeModal === 'monthlyReview' && reviewMonth ? (
        <Modal
          title={`Revisar ${longMonth.format(parseMonth(reviewMonth))}`}
          description={`Introduce el saldo que mostraba el banco al cierre del ${fullDate.format(parseDate(reviewClosingDate))}, no el saldo actual.`}
          onClose={() => setActiveModal(null)}
        >
          <form className="form-grid" onSubmit={closeReviewedMonth}>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Saldo calculado</span>
                <strong className="mt-1 block text-xl text-slate-900">
                  {calculatedReviewBalance === null ? '—' : currency.format(calculatedReviewBalance)}
                </strong>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Diferencia</span>
                <strong className={`mt-1 block text-xl ${
                  reviewDifference === null || reviewDifference === 0
                    ? 'text-slate-700'
                    : reviewDifference > 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                }`}>
                  {reviewDifference === null ? '—' : currency.format(reviewDifference)}
                </strong>
              </div>
            </div>
            <Field label={`Saldo según el banco al cierre del ${fullDate.format(parseDate(reviewClosingDate))} (€)`}>
              <input
                type="number"
                step="0.01"
                value={reviewBankBalance}
                onChange={(event) => setReviewBankBalance(event.target.value)}
                placeholder="Saldo al final de ese día"
                required
              />
            </Field>
            <p className="helper-box">
              Al cerrar el mes, la diferencia se aplicará como ajuste de conciliación y el saldo corregido será la referencia para el mes siguiente.
            </p>
            <p className="form-message" aria-live="polite">{reviewMessage}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  openMonth(reviewMonth);
                  setActiveModal(null);
                }}
              >
                Revisar movimientos
              </button>
              <button type="submit" className="primary-button">Cerrar mes y aplicar diferencia</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'fixedManager' ? (
        <FixedExpensesManagerModal
          expenses={data.fixedExpenseSeries}
          fixedMessage={fixedMessage}
          formatCurrency={(value) => currency.format(value)}
          formatEndCondition={describeEndCondition}
          formatStartMonth={(month) => shortMonth.format(parseMonth(month))}
          historySeriesId={historySeriesId}
          onAdd={() => setActiveModal('fixed')}
          onClose={() => setActiveModal(null)}
          onDelete={openFixedDeleteDialog}
          onEdit={openFixedEditor}
          onToggleHistory={(expenseId) => setHistorySeriesId((current) => current === expenseId ? null : expenseId)}
          resolveCurrentAmount={(expense) => {
            const version = getApplicableVersion(expense, currentMonth) || expense.versions.at(-1);
            return version?.amount ?? null;
          }}
          resolveHistory={getFixedExpenseHistory}
        />
      ) : null}

      {fixedEditor ? (
        <Modal
          title={fixedEditor.monthOnly ? 'Editar importe del mes' : 'Editar cuota'}
          description={fixedEditor.monthOnly
            ? `El cambio se aplicará únicamente a ${fixedEditor.month}.`
            : 'Elige el mes y el alcance del cambio antes de guardar.'}
          onClose={() => setFixedEditor(null)}
        >
          <form className="form-grid" onSubmit={saveFixedExpenseEdit}>
            {fixedEditor.monthOnly ? (
              <div className="helper-box">
                Mes seleccionado: <strong>{fixedEditor.month}</strong>. Los demás meses conservarán su importe.
              </div>
            ) : (
              <Field label="Mes seleccionado">
                <input type="month" value={fixedEditor.month} onChange={(event) => setFixedEditor((current) => ({ ...current, month: event.target.value }))} />
              </Field>
            )}
            <Field label="Importe nuevo (€)">
              <input type="number" min="0.01" step="0.01" value={fixedEditor.amount} onChange={(event) => setFixedEditor((current) => ({ ...current, amount: event.target.value }))} />
            </Field>
            {!fixedEditor.monthOnly ? (
              <>
                <Field label="Motivo o nota">
                  <input type="text" value={fixedEditor.note} onChange={(event) => setFixedEditor((current) => ({ ...current, note: event.target.value }))} />
                </Field>
                <Field label="Alcance del cambio">
                  <select value={fixedEditor.scope} onChange={(event) => setFixedEditor((current) => ({ ...current, scope: event.target.value }))}>
                    <option value="month">Solo este mes</option>
                    <option value="future">Este mes y los siguientes</option>
                    <option value="all">Toda la serie</option>
                  </select>
                </Field>
              </>
            ) : null}
            {fixedEditor.scope === 'all' ? (
              <p className="warning-box">Esta acción también cambiará los meses anteriores. Úsala solo para corregir un dato que siempre fue incorrecto.</p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setFixedEditor(null)}>Cancelar</button>
              <button type="submit" className="primary-button">Guardar cambio</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {fixedDeleteTarget ? (
        <Modal
          title={fixedDeleteTarget.monthOnly ? 'Eliminar gasto de este mes' : 'Eliminar gasto fijo'}
          description={`Mes seleccionado: ${fixedDeleteTarget.month}`}
          onClose={() => setFixedDeleteTarget(null)}
        >
          <div className="delete-options modal-body">
            {fixedDeleteTarget.monthOnly ? (
              <>
                <p className="warning-box">Se omitirá únicamente esta cuota. La serie continuará activa en los demás meses.</p>
                <button type="button" className="danger-button" onClick={() => applyFixedDelete('month')}>Eliminar solo este mes</button>
              </>
            ) : (
              <>
                <button type="button" className="secondary-button" onClick={() => applyFixedDelete('month')}>Solo la cuota de este mes</button>
                <button type="button" className="secondary-button" onClick={() => applyFixedDelete('future')}>Esta cuota y todas las siguientes</button>
                <button type="button" className="danger-button" onClick={() => applyFixedDelete('archive')}>Toda la serie, incluidos meses anteriores</button>
                <button type="button" className="danger-link" onClick={() => applyFixedDelete('permanent')}>Eliminar definitivamente porque fue creada por error</button>
              </>
            )}
            <button type="button" className="secondary-button" onClick={() => setFixedDeleteTarget(null)}>Cancelar</button>
          </div>
        </Modal>
      ) : null}

      {activeModal === 'opening' ? (
        <Modal
          title="Cuenta y saldo inicial"
          description="Indica el dinero real disponible en la fecha desde la que quieres empezar el control."
          onClose={() => setActiveModal(null)}
        >
          <form className="form-grid" onSubmit={saveOpeningBalance}>
            <Field label="Fecha de inicio del control">
              <input
                type="date"
                value={openingForm.date}
                onChange={(event) => setOpeningForm((current) => ({ ...current, date: event.target.value }))}
                required
              />
            </Field>
            <Field label="Saldo disponible en esa fecha (€)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingForm.amount}
                onChange={(event) => setOpeningForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="8500"
                required
              />
            </Field>
            <Field label="Nombre de la cuenta (opcional)">
              <input
                type="text"
                value={openingForm.accountName}
                onChange={(event) => setOpeningForm((current) => ({ ...current, accountName: event.target.value }))}
                placeholder="Cuenta principal"
              />
            </Field>
            <p className="form-message" aria-live="polite">{openingMessage}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="primary-button" type="submit">Guardar configuración</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'salary' ? (
        <Modal
          title="Registrar nómina"
          description="Guarda el mes al que corresponde y la fecha real en la que se cobró."
          onClose={() => setActiveModal(null)}
        >
          <form className="form-grid" onSubmit={saveSalary}>
            <div className="form-grid form-grid--two">
              <Field label="Mes de la nómina">
                <input type="month" value={salaryForm.month} onChange={(event) => loadSalaryForm(event.target.value)} required />
              </Field>
              <Field label="Fecha de cobro">
                <input
                  type="date"
                  value={salaryForm.paymentDate}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, paymentDate: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Importe neto (€)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salaryForm.amount}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="1850"
                  required
                />
              </Field>
              <Field label="Concepto (opcional)">
                <input
                  type="text"
                  value={salaryForm.concept}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, concept: event.target.value }))}
                  placeholder="Nómina de junio"
                />
              </Field>
            </div>
            <div className="helper-box salary-effect-message" aria-live="polite">
              {selectedSalaryStatus === 'historical'
                ? 'No se sumará al saldo disponible porque su fecha de cobro es anterior al saldo inicial.'
                : selectedSalaryStatus === 'active'
                  ? 'Se sumará al saldo disponible porque su fecha de cobro es igual o posterior al saldo inicial.'
                  : 'Configura primero el saldo inicial para calcular el saldo disponible.'}
            </div>
            <p className="form-message" aria-live="polite">{salaryMessage}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="primary-button" type="submit">Guardar nómina</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'movement' ? (
        <Modal
          title="Añadir gasto"
          description="Registra un gasto variable habitual o un gasto puntual extraordinario."
          onClose={() => setActiveModal(null)}
        >
          <form className="form-grid" onSubmit={addMovement}>
            <div className="form-grid form-grid--two">
              <Field label="Fecha">
                <input
                  type="date"
                  value={movementForm.date}
                  onChange={(event) => setMovementForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Importe (€)">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movementForm.amount}
                  onChange={(event) => setMovementForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="95"
                  required
                />
              </Field>
              <Field label="Tipo">
                <select value={movementForm.type} onChange={(event) => setMovementForm((current) => ({ ...current, type: event.target.value }))}>
                  <option value="variable">Variable habitual</option>
                  <option value="oneoff">Puntual / extraordinario</option>
                </select>
              </Field>
              <Field label="Categoría">
                <select value={movementForm.category} onChange={(event) => setMovementForm((current) => ({ ...current, category: event.target.value }))}>
                  <option>Alimentación</option><option>Transporte</option><option>Vehículo</option><option>Ocio</option>
                  <option>Salud</option><option>Compra importante</option><option>Otros</option>
                </select>
              </Field>
              <Field label="Concepto" className="field--wide">
                <input
                  type="text"
                  value={movementForm.description}
                  onChange={(event) => setMovementForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Cambio de aceite"
                />
              </Field>
            </div>
            <div className="helper-box">
              {movementForm.type === 'oneoff'
                ? 'El gasto puntual afecta al saldo real, pero se muestra separado del consumo habitual.'
                : 'El gasto variable se añade al consumo habitual del mes.'}
            </div>
            <p className="form-message" aria-live="polite">{movementMessage}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="primary-button" type="submit">Añadir gasto</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'fixed' ? (
        <Modal
          title="Añadir gasto fijo"
          description="Crea una obligación recurrente y define cuándo comienza y cómo termina."
          onClose={() => setActiveModal(null)}
          wide
        >
          <form className="form-grid modal-fixed-form" onSubmit={addFixedExpense}>
            <Field label="Nombre">
              <input type="text" value={fixedForm.name} onChange={(event) => setFixedForm((current) => ({ ...current, name: event.target.value }))} placeholder="Hipoteca" required />
            </Field>
            <Field label="Categoría">
              <select value={fixedForm.category} onChange={(event) => setFixedForm((current) => ({ ...current, category: event.target.value }))}>
                <option>Vivienda</option><option>Suministros</option><option>Seguros</option>
                <option>Suscripciones</option><option>Préstamos</option><option>Otros</option>
              </select>
            </Field>
            <Field label="Importe mensual (€)">
              <input type="number" min="0.01" step="0.01" value={fixedForm.amount} onChange={(event) => setFixedForm((current) => ({ ...current, amount: event.target.value }))} placeholder="720" required />
            </Field>
            <Field label="Día de cobro">
              <input type="number" min="1" max="31" value={fixedForm.paymentDay} onChange={(event) => setFixedForm((current) => ({ ...current, paymentDay: event.target.value }))} required />
            </Field>
            <Field label="Desde">
              <input type="month" value={fixedForm.startMonth} onChange={(event) => setFixedForm((current) => ({ ...current, startMonth: event.target.value }))} required />
            </Field>
            <Field label="Finalización">
              <select value={fixedForm.endType} onChange={(event) => setFixedForm((current) => ({ ...current, endType: event.target.value }))}>
                <option value="none">Sin finalización</option><option value="date">Hasta una fecha</option>
                <option value="amount">Hasta alcanzar un importe</option><option value="date_or_amount">Fecha o importe</option>
              </select>
            </Field>
            {fixedForm.endType === 'date' || fixedForm.endType === 'date_or_amount' ? (
              <Field label="Mes final">
                <input type="month" min={fixedForm.startMonth} value={fixedForm.endMonth} onChange={(event) => setFixedForm((current) => ({ ...current, endMonth: event.target.value }))} />
              </Field>
            ) : null}
            {fixedForm.endType === 'amount' || fixedForm.endType === 'date_or_amount' ? (
              <>
                <Field label="Importe total objetivo (€)">
                  <input type="number" min="0.01" step="0.01" value={fixedForm.targetAmount} onChange={(event) => setFixedForm((current) => ({ ...current, targetAmount: event.target.value }))} />
                </Field>
                <label className="check-field">
                  <input type="checkbox" checked={fixedForm.capLastPayment} onChange={(event) => setFixedForm((current) => ({ ...current, capLastPayment: event.target.checked }))} />
                  Ajustar la última cuota al importe restante
                </label>
              </>
            ) : null}
            <Field label="Nota (opcional)" className="field--wide">
              <input type="text" value={fixedForm.note} onChange={(event) => setFixedForm((current) => ({ ...current, note: event.target.value }))} placeholder="Importe inicial" />
            </Field>
            <p className="form-message field--wide" aria-live="polite">{fixedMessage}</p>
            <div className="modal-actions field--wide">
              <button type="button" className="secondary-button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="primary-button" type="submit">Añadir gasto fijo</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'salaryHistory' ? (
        <Modal
          title="Nóminas del año"
          description="Carga las nóminas y añade las pagas extras correspondientes a cada mes."
          onClose={() => setActiveModal(null)}
          wide
        >
          <div className="history-modal-toolbar">
            <Field label="Año">
              <input type="number" min="2000" max="2100" value={salaryHistoryYear} onChange={(event) => setSalaryHistoryYear(event.target.value)} />
            </Field>
          </div>
          <form onSubmit={saveSalaryYear}>
            <div className="table-scroll salary-history-table">
              <table>
                <thead><tr><th>Mes</th><th>Importe (€)</th><th>Concepto</th><th>Fecha de cobro</th><th>Estado</th><th>Paga extra</th></tr></thead>
                <tbody>
                  {salaryYearDrafts.map((draft) => {
                    const status = salaryStatus(draft.paymentDate ? { paymentDate: draft.paymentDate } : null, data.openingBalance);
                    return (
                      <React.Fragment key={draft.month}>
                        <tr>
                          <td>{MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}</td>
                          <td><input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => updateSalaryYearDraft(draft.month, 'amount', event.target.value)} aria-label={`Importe de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`} placeholder="Sin nómina" /></td>
                          <td><input type="text" value={draft.concept} onChange={(event) => updateSalaryYearDraft(draft.month, 'concept', event.target.value)} aria-label={`Concepto de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`} placeholder={`Nómina de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1].toLowerCase()}`} /></td>
                          <td><input type="date" value={draft.paymentDate} onChange={(event) => updateSalaryYearDraft(draft.month, 'paymentDate', event.target.value)} aria-label={`Fecha de cobro de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`} /></td>
                          <td><span className={`salary-badge salary-badge--${status}`}>{status === 'historical' ? 'Fuera del saldo' : status === 'active' ? 'Incluida en saldo' : 'Sin configurar'}</span></td>
                          <td>
                            <button
                              type="button"
                              className="grid size-9 place-items-center rounded-xl bg-blue-50 text-xl font-black text-blue-700 transition hover:bg-blue-100"
                              onClick={() => addSalaryExtraDraft(draft.month)}
                              aria-label={`Añadir paga extra de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`}
                              title="Añadir paga extra"
                            >
                              +
                            </button>
                          </td>
                        </tr>
                        {(draft.extraPayments || []).map((extraPayment) => {
                          const extraStatus = salaryStatus(
                            extraPayment.paymentDate
                              ? { paymentDate: extraPayment.paymentDate }
                              : null,
                            data.openingBalance,
                          );
                          return (
                            <tr className="bg-blue-50/50" key={extraPayment.id}>
                              <td>
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-blue-700">
                                  ↳ Paga extra
                                </span>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={extraPayment.amount}
                                  onChange={(event) => updateSalaryExtraDraft(draft.month, extraPayment.id, 'amount', event.target.value)}
                                  aria-label={`Importe de paga extra de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`}
                                  placeholder="Importe"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={extraPayment.concept}
                                  onChange={(event) => updateSalaryExtraDraft(draft.month, extraPayment.id, 'concept', event.target.value)}
                                  aria-label={`Concepto de paga extra de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`}
                                  placeholder="Paga extra"
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  value={extraPayment.paymentDate}
                                  onChange={(event) => updateSalaryExtraDraft(draft.month, extraPayment.id, 'paymentDate', event.target.value)}
                                  aria-label={`Fecha de paga extra de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`}
                                />
                              </td>
                              <td>
                                <span className={`salary-badge salary-badge--${extraStatus}`}>
                                  {extraStatus === 'historical' ? 'Fuera del saldo' : extraStatus === 'active' ? 'Incluida en saldo' : 'Sin configurar'}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="danger-button"
                                  onClick={() => removeSalaryExtraDraft(draft.month, extraPayment.id)}
                                  aria-label={`Eliminar paga extra de ${MONTH_NAMES[Number(draft.month.slice(5, 7)) - 1]}`}
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="history-legend">Usa el botón + para añadir una o varias pagas extras. Cada paga se incluye en el saldo si su fecha de cobro es igual o posterior a la fecha del saldo inicial.</p>
            <p className="form-message" aria-live="polite">{salaryHistoryMessage}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="primary-button" type="submit">Guardar nóminas del año</button>
            </div>
          </form>
        </Modal>
      ) : null}

      <PeriodSelector
        rangeEnd={rangeEnd}
        rangeStart={rangeStart}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        setRangeEnd={setRangeEnd}
        setRangeStart={setRangeStart}
        setSelectedMonth={setSelectedMonth}
        setSelectedYear={setSelectedYear}
        setViewMode={setViewMode}
        viewMode={viewMode}
      />

      <ChartSection singleMonth={summaries.length === 1}>
        <MonthlyChart summaries={summaries} singleMonth={summaries.length === 1} />
      </ChartSection>

      <SummaryTable
        formatCurrency={(value) => currency.format(value)}
        formatMonth={(month) => longMonth.format(parseMonth(month))}
        getSalaryStatus={(record) => salaryStatus(record, data.openingBalance)}
        onOpenMonth={openMonth}
        summaries={summaries}
      />

      <ExpenseLists
        activeFixedExpenses={activeFixedExpenses}
        formatCurrency={(value) => currency.format(value)}
        formatDate={(date) => fullDate.format(parseDate(date))}
        formatMonth={(month) => longMonth.format(parseMonth(month))}
        isMonthClosed={(month) => isMonthClosed(data, month)}
        movementFilter={movementFilter}
        onDeleteFixedExpense={openFixedMonthDeleteDialog}
        onEditFixedExpense={openFixedMonthEditor}
        onManageFixedExpenses={() => setActiveModal('fixedManager')}
        onMovementFilterChange={setMovementFilter}
        onRemoveMovement={removeMovement}
        visibleMovements={visibleMovements}
      />
    </main>
  );
}

export {
  calculateCurrentBalance,
  getEffectiveFixedExpenseDate,
  getFixedExpenseOccurrences,
  migrateFixedExpensesV1ToV2 as migrateData,
  monthlySummary,
};
