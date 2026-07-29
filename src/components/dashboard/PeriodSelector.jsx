import Field from '../ui/Field.jsx';

export default function PeriodSelector({
  rangeEnd,
  rangeStart,
  selectedMonth,
  selectedYear,
  setRangeEnd,
  setRangeStart,
  setSelectedMonth,
  setSelectedYear,
  setViewMode,
  viewMode,
}) {
  return (
    <section className="mt-4.5 rounded-[20px] border border-slate-200 bg-white p-5.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Periodo de visualización</h2>
        <p className="mt-1 text-sm text-slate-500">Consulta un mes, un año completo o un rango personalizado.</p>
      </div>
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        <Field label="Vista">
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
            <option value="month">Un mes</option>
            <option value="year">Año completo</option>
            <option value="range">Rango de meses</option>
          </select>
        </Field>
        {viewMode === 'month' ? (
          <Field label="Mes">
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </Field>
        ) : null}
        {viewMode === 'year' ? (
          <Field label="Año">
            <input type="number" min="2000" max="2100" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} />
          </Field>
        ) : null}
        {viewMode === 'range' ? (
          <>
            <Field label="Desde">
              <input type="month" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
            </Field>
            <Field label="Hasta">
              <input type="month" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
            </Field>
          </>
        ) : null}
      </div>
    </section>
  );
}
