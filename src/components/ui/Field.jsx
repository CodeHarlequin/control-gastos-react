export default function Field({ label, children, className = '' }) {
  return (
    <label className={`field grid gap-1.5 ${className}`}>
      <span className="text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
