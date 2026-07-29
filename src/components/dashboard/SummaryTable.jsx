function SalaryBadge({ status }) {
  const styles = {
    historical: 'border-slate-300 bg-slate-100 text-slate-600',
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    unconfigured: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  const labels = {
    historical: 'Fuera del saldo',
    active: 'Incluida en saldo',
    unconfigured: 'Sin configurar',
  };

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-extrabold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function BalanceTrend({ balance, previousBalance }) {
  const trend = balance === previousBalance ? 'equal' : balance > previousBalance ? 'up' : 'down';
  const indicators = {
    up: { symbol: '↑', label: 'Ha subido respecto al mes anterior', className: 'text-emerald-600' },
    equal: { symbol: '=', label: 'Sin cambios respecto al mes anterior', className: 'text-slate-500' },
    down: { symbol: '↓', label: 'Ha bajado respecto al mes anterior', className: 'text-red-600' },
  };
  const indicator = indicators[trend];

  return (
    <span
      aria-label={indicator.label}
      className={`inline-flex w-5 shrink-0 justify-center text-base font-black ${indicator.className}`}
      title={indicator.label}
    >
      {indicator.symbol}
    </span>
  );
}

export default function SummaryTable({
  formatCurrency,
  formatMonth,
  getSalaryStatus,
  onOpenMonth,
  summaries,
}) {
  return (
    <section className="mt-4.5 rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Resumen mensual</h2>
        <p className="mt-1 text-sm text-slate-500">Selecciona una fila para abrir el detalle diario de ese mes.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-250 border-collapse">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Nómina imputada al mes</th>
              <th>Cobrado realmente</th>
              <th>Pagas extras (informativo)</th>
              <th>Estado nómina</th>
              <th>Fijos</th>
              <th>Variables</th>
              <th>Puntuales (informativo)</th>
              <th>Total</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((item) => {
              const status = item.salaryRecord ? getSalaryStatus(item.salaryRecord) : null;
              return (
                <tr
                  key={item.month}
                  onClick={() => onOpenMonth(item.month)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenMonth(item.month);
                    }
                  }}
                  tabIndex="0"
                >
                  <td>
                    <span className="flex flex-col items-start gap-1">
                      {formatMonth(item.month)}
                      {item.closureStatus === 'closed' ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-slate-700">
                          Cerrado
                        </span>
                      ) : item.closureStatus === 'pending_review' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-amber-800">
                          Revisar
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>{formatCurrency(item.salary)}</td>
                  <td>{formatCurrency(item.paidSalary)}</td>
                  <td>{formatCurrency(item.extraSalary)}</td>
                  <td>{status ? <SalaryBadge status={status} /> : '—'}</td>
                  <td>{formatCurrency(item.fixed)}</td>
                  <td>{formatCurrency(item.variable)}</td>
                  <td>{formatCurrency(item.oneoff)}</td>
                  <td>{formatCurrency(item.total)}</td>
                  <td className={item.balance < 0 ? 'negative' : 'positive'}>
                    <span className="inline-flex items-center gap-2">
                      {formatCurrency(item.balance)}
                      <BalanceTrend balance={item.balance} previousBalance={item.previousBalance} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Las pagas extras y los gastos puntuales se muestran como información, pero no forman parte de los totales ni del saldo mensual.
      </p>
    </section>
  );
}
