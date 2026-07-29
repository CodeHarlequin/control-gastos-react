import Modal from '../ui/Modal.jsx';

export default function FixedExpensesManagerModal({
  expenses,
  fixedMessage,
  formatCurrency,
  formatEndCondition,
  formatStartMonth,
  historySeriesId,
  onAdd,
  onClose,
  onDelete,
  onEdit,
  onToggleHistory,
  resolveCurrentAmount,
  resolveHistory,
}) {
  return (
    <Modal
      title="Configurar gastos fijos"
      description="Administra las series, sus cambios futuros y el historial completo."
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="mb-4 flex items-start justify-between gap-4 max-sm:flex-col">
          <p className="m-0 max-w-2xl text-sm leading-6 text-slate-500">
            Hipoteca, suministros, seguros, suscripciones y demás obligaciones recurrentes.
          </p>
          <button type="button" className="primary-button shrink-0" onClick={onAdd}>
            Añadir gasto fijo
          </button>
        </div>

        <p className="form-message form-message--compact" aria-live="polite">{fixedMessage}</p>

        <div className="grid gap-2.5">
          {expenses.length ? (
            expenses.map((expense) => {
              const currentAmount = resolveCurrentAmount(expense);
              return (
                <article
                  className={`rounded-2xl border border-slate-200 p-4 ${expense.archivedAt ? 'bg-slate-50 opacity-70' : 'bg-white'}`}
                  key={expense.id}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 max-sm:grid-cols-1">
                    <div className="grid min-w-0 gap-1">
                      <strong className="text-slate-900">
                        {expense.name}{expense.archivedAt ? ' · Archivado' : ''}
                      </strong>
                      <span className="text-sm leading-5 text-slate-500">
                        {expense.category} · día {expense.paymentDay} · desde {formatStartMonth(expense.startMonth)}
                        {' · '}{formatEndCondition(expense)}
                      </span>
                    </div>
                    <b>{currentAmount === null ? 'Sin importe' : `${formatCurrency(currentAmount)}/mes`}</b>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!expense.archivedAt ? (
                      <>
                        <button type="button" className="secondary-button" onClick={() => onEdit(expense)}>
                          Editar serie
                        </button>
                        <button type="button" className="danger-button" onClick={() => onDelete(expense)}>
                          Eliminar…
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="secondary-button" onClick={() => onToggleHistory(expense.id)}>
                      {historySeriesId === expense.id ? 'Ocultar historial' : 'Historial'}
                    </button>
                  </div>

                  {historySeriesId === expense.id ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <strong className="text-sm text-slate-800">Historial de cambios</strong>
                      <ol className="mt-1 list-decimal pl-5 text-sm leading-7 text-slate-500">
                        {resolveHistory(expense).map((entry, index) => (
                          <li key={`${entry.order}-${index}`}>{entry.label}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4.5 text-center text-slate-500">
              No hay gastos fijos registrados.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
