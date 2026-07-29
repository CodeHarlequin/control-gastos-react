export default function Modal({ title, description, onClose, wide = false, children }) {
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6 backdrop-blur-sm max-sm:items-end max-sm:p-0"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`modal-card max-h-[calc(100vh-48px)] w-full overflow-x-hidden overflow-y-auto rounded-[22px] border border-white/70 bg-white shadow-[0_34px_90px_rgba(11,18,34,0.35)] max-sm:max-h-[92vh] max-sm:rounded-b-none ${
          wide ? 'modal-card--wide max-w-5xl' : 'max-w-xl'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur-xl max-sm:px-4.5 max-sm:py-4">
          <div>
            <h3 className="m-0 text-xl font-bold text-slate-900">{title}</h3>
            {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl leading-none text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
