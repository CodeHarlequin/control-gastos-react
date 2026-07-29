import { useState } from 'react';
import MetricCard from '../ui/MetricCard.jsx';

const actions = [
  { modal: 'salary', icon: '+', title: 'Nómina', detail: 'Registrar ingreso' },
  { modal: 'movement', icon: '−', title: 'Gasto', detail: 'Variable o puntual' },
  { modal: 'fixed', icon: '↻', title: 'Gasto fijo', detail: 'Nueva recurrencia' },
  { modal: 'salaryHistory', icon: '▦', title: 'Nóminas anuales', detail: 'Edición masiva' },
];

export default function DashboardOverview({
  accountName,
  currentBalance,
  currentMonthLabel,
  currentSummary,
  hasOpeningBalance,
  onOpenModal,
  openingDateLabel,
  periodLabel,
  todayLabel,
  totals,
  formatCurrency,
}) {
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);

  return (
    <>
      <section className="grid grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] items-stretch gap-4.5 max-lg:grid-cols-1">
        <article
          className={`relative flex min-h-67.5 flex-col justify-between overflow-hidden rounded-3xl border border-white/25 p-[clamp(24px,4vw,38px)] text-white shadow-2xl ${
            currentBalance !== null && currentBalance < 0
              ? 'bg-gradient-to-br from-rose-800 to-rose-500'
              : 'bg-gradient-to-br from-blue-800 via-blue-600 to-indigo-400'
          }`}
        >
          <div className="relative z-10">
            <span className="text-xs font-black uppercase tracking-[0.09em] text-white/80">
              Disponible ahora
            </span>
            <div className="my-2 flex items-center gap-3">
              <strong className="text-[clamp(2.5rem,6vw,4.7rem)] leading-none tracking-[-0.045em]">
                {isBalanceHidden
                  ? '********'
                  : currentBalance === null
                    ? 'Sin configurar'
                    : formatCurrency(currentBalance)}
              </strong>
            </div>
          </div>
          {/* <p className="relative z-10 mb-5 mt-2 text-white/80">
            {hasOpeningBalance
              ? `${accountName || 'Cuenta principal'} · nóminas desde ${openingDateLabel}, movimientos registrados y cuotas fijas hasta ${todayLabel}`
              : 'Configura el saldo inicial para empezar a calcular tu dinero real.'}
          </p> */}
          <div className="relative z-10 flex w-fit items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-white/35 bg-white/15 px-3.5 py-2.5 font-extrabold text-white backdrop-blur transition hover:bg-white/25"
              onClick={() => onOpenModal('opening')}
            >
              {hasOpeningBalance ? 'Editar cuenta y saldo inicial' : 'Configurar saldo inicial'}
            </button>
            <button
              type="button"
              className="grid size-10.5 shrink-0 place-items-center rounded-xl border border-white/35 bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              onClick={() => setIsBalanceHidden((current) => !current)}
              aria-label={isBalanceHidden ? 'Mostrar saldo disponible' : 'Ocultar saldo disponible'}
              title={isBalanceHidden ? 'Mostrar saldo' : 'Ocultar saldo'}
            >
              {isBalanceHidden ? (
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                  <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.5 4.2 9.5 6.4a3.8 3.8 0 0 1 0 3.2 13.7 13.7 0 0 1-2.1 3.1M6.2 6.2a13.8 13.8 0 0 0-3.7 4.2 3.8 3.8 0 0 0 0 3.2C3.5 15.8 7 20 12 20a10.8 10.8 0 0 0 3.1-.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                  <path d="M2.5 10.4C3.5 8.2 7 4 12 4s8.5 4.2 9.5 6.4a3.8 3.8 0 0 1 0 3.2C20.5 15.8 17 20 12 20S3.5 15.8 2.5 13.6a3.8 3.8 0 0 1 0-3.2Z" fill="none" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>
          </div>
          <div className="absolute -bottom-28 -right-18 size-72 rounded-full border-[54px] border-white/10" aria-hidden="true" />
        </article>

        <section className="rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]" aria-label="Acciones rápidas">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Acciones rápidas</h2>
            <p className="mt-1 text-sm text-slate-500">Añade información sin abandonar el panel.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
            {actions.map((action) => (
              <button
                type="button"
                className="grid min-h-23 grid-cols-[32px_minmax(0,1fr)] grid-rows-2 content-center gap-x-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-lg"
                onClick={() => onOpenModal(action.modal)}
                key={action.modal}
              >
                <span className="row-span-2 grid size-8 self-center place-items-center rounded-xl bg-blue-50 text-xl font-black text-blue-700">
                  {action.icon}
                </span>
                <strong className="self-end text-sm text-slate-900">{action.title}</strong>
                <small className="text-xs text-slate-500">{action.detail}</small>
              </button>
            ))}
          </div>
        </section>
      </section>

      {/* <div className="mx-0.5 mb-3 mt-7 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start max-md:gap-2">
        <div>
          <p className="mb-0.5 text-xs font-extrabold uppercase tracking-[0.08em] text-blue-700">
            Situación del mes actual
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{currentMonthLabel}</h2>
        </div>
        <p className="max-w-xl text-right text-sm leading-6 text-slate-500 max-md:text-left">
          La nómina se imputa al mes siguiente en las estadísticas; el disponible incluye las cobradas desde la fecha del saldo inicial.
        </p>
      </div>

      <section className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-live="polite">
        <MetricCard label="Ingreso imputado al mes" value={formatCurrency(currentSummary.salary)} detail="Nómina correspondiente al mes anterior" />
        <MetricCard
          label="Nómina cobrada este mes"
          value={formatCurrency(currentSummary.paidSalary)}
          detail={`${formatCurrency(currentSummary.extraSalary)} en pagas extras fuera del resumen`}
        />
        <MetricCard
          label="Gastos habituales del mes"
          value={formatCurrency(currentSummary.total)}
          detail={`${formatCurrency(currentSummary.oneoff)} puntuales fuera del resumen`}
        />
        <MetricCard
          label="Margen previsto del mes"
          value={formatCurrency(currentSummary.balance)}
          detail="Ingreso imputado menos gastos habituales"
          danger={currentSummary.balance < 0}
        />
      </section> */}

      {/* <section
        className={`my-4 rounded-2xl border px-4.5 py-3.5 ${
          totals.balance < 0
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : 'border-blue-200 bg-blue-50 text-slate-800'
        }`}
      >
        <strong>Periodo consultado · {periodLabel}:</strong>{' '}
        {totals.balance < 0
          ? `los gastos habituales superan los ingresos imputados en ${formatCurrency(Math.abs(totals.balance))}.`
          : `queda un margen de ${formatCurrency(totals.balance)} después de los gastos habituales.`}
      </section> */}
    </>
  );
}
