export default function MetricCard({ label, value, detail, danger = false }) {
  return (
    <article
      className={[
        'grid min-h-31 content-center gap-1.5 rounded-[20px] border bg-white p-4.5 shadow-[0_12px_35px_rgba(23,32,51,0.08)]',
        danger ? 'border-rose-200 bg-rose-50' : 'border-slate-200',
      ].join(' ')}
    >
      <span className="text-sm text-slate-500">{label}</span>
      <strong className={`text-2xl tracking-tight ${danger ? 'text-rose-700' : 'text-slate-900'}`}>
        {value}
      </strong>
      {detail ? <small className="text-slate-500">{detail}</small> : null}
    </article>
  );
}
