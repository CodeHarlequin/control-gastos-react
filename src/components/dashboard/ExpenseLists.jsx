export default function ExpenseLists({
  activeFixedExpenses,
  formatCurrency,
  formatDate,
  formatMonth,
  isMonthClosed,
  movementFilter,
  onDeleteFixedExpense,
  onEditFixedExpense,
  onManageFixedExpenses,
  onMovementFilterChange,
  onRemoveMovement,
  visibleMovements,
}) {
  return (
    <section className="mt-4.5 grid grid-cols-2 gap-4.5 max-md:grid-cols-1">
      <section className="rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]">
        <div className="mb-4 flex items-end justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Movimientos del periodo</h2>
            <p className="mt-1 text-sm text-slate-500">{visibleMovements.length} movimientos visibles.</p>
          </div>
          <select className="w-auto min-w-35 max-sm:w-full" value={movementFilter} onChange={(event) => onMovementFilterChange(event.target.value)}>
            <option value="all">Todos</option>
            <option value="variable">Variables</option>
            <option value="oneoff">Puntuales</option>
          </select>
        </div>
        <div className="grid gap-2.5">
          {visibleMovements.length ? (
            visibleMovements.map((movement) => (
              <article className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3.5 rounded-2xl border border-slate-200 p-3 max-md:grid-cols-[minmax(0,1fr)_auto]" key={movement.id}>
                <div className="grid min-w-0 gap-1">
                  <strong className="truncate text-slate-900">{movement.description}</strong>
                  <span className="text-xs text-slate-500">
                    {movement.type === 'oneoff' ? 'Puntual' : 'Variable'} · {movement.category} · {formatDate(movement.date)}
                  </span>
                </div>
                <b>{formatCurrency(movement.amount)}</b>
                <button
                  type="button"
                  className="danger-button max-md:col-span-2 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isMonthClosed(movement.date.slice(0, 7))}
                  onClick={() => onRemoveMovement(movement.id)}
                  title={isMonthClosed(movement.date.slice(0, 7)) ? 'El mes está cerrado' : undefined}
                >
                  {isMonthClosed(movement.date.slice(0, 7)) ? 'Mes cerrado' : 'Eliminar'}
                </button>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4.5 text-center text-slate-500">
              No hay movimientos en este periodo.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]">
        <div className="mb-4 flex items-start justify-between gap-3 max-sm:flex-col">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Gastos fijos activos</h2>
            <p className="mt-1 text-sm text-slate-500">Obligaciones recurrentes que intervienen en el periodo seleccionado.</p>
          </div>
          <button type="button" className="secondary-button shrink-0" onClick={onManageFixedExpenses}>
            Configurar
          </button>
        </div>
        <div className="grid gap-2.5">
          {activeFixedExpenses.length ? (
            activeFixedExpenses.map((expense) => (
              <article className="rounded-2xl border border-slate-200 p-3" key={`${expense.id}-${expense.month}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5">
                  <div className="grid min-w-0 gap-1">
                    <strong className="truncate text-slate-900">{expense.name}</strong>
                    <span className="text-xs text-slate-500">
                      {expense.category} · día {expense.paymentDay} · {formatMonth(expense.month)}
                    </span>
                  </div>
                  <b>{expense.amount === null ? 'Sin cuota' : `${formatCurrency(expense.amount)}/mes`}</b>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="secondary-button disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isMonthClosed(expense.month)}
                    onClick={() => onEditFixedExpense(expense)}
                  >
                    Editar importe del mes
                  </button>
                  <button
                    type="button"
                    className="danger-button disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isMonthClosed(expense.month)}
                    onClick={() => onDeleteFixedExpense(expense)}
                  >
                    {isMonthClosed(expense.month) ? 'Mes cerrado' : 'Eliminar solo este mes'}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4.5 text-center text-slate-500">
              No hay gastos fijos activos.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
