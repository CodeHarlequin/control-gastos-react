export default function ChartSection({ children, singleMonth }) {
  return (
    <section className="mt-4.5 overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]">
      <div className="mb-3.5 flex items-start justify-between gap-5 max-md:flex-col">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gráfico de ingresos y gastos</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            {singleMonth
              ? 'La línea habitual incluye gastos fijos y variables. La línea total añade los gastos puntuales.'
              : 'La barra clara es la nómina del mes anterior imputada al mes mostrado. Los gastos fijos, variables y puntuales se apilan delante.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-5.5 rounded bg-blue-700/25" /> Nómina</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-5.5 rounded bg-indigo-500" /> Fijos</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-5.5 rounded bg-emerald-500" /> Variables</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-5.5 rounded bg-amber-500" /> Puntuales</span>
        </div>
      </div>
      {children}
    </section>
  );
}
