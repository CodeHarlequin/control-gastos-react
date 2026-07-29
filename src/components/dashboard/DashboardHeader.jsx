export default function DashboardHeader({ dataStatus, toast }) {
  const hasError = dataStatus.includes('Error') || dataStatus.includes('No se pudo');

  return (
    <>
      {/* <header className="mb-5 flex items-center justify-between gap-6 max-md:flex-col max-md:items-start">
        <div>
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.08em] text-blue-700">
            Control financiero personal
          </p>
          <h1 className="mb-2 max-w-3xl text-[clamp(2rem,5vw,3.4rem)] font-black leading-[1.05] tracking-tight text-slate-950">
            Tu dinero, claro de un vistazo
          </h1>
          <p className="max-w-3xl leading-6 text-slate-500">
            Consulta lo que tienes hoy, registra movimientos desde acciones rápidas y analiza cualquier
            periodo sin llenar la pantalla de formularios.
          </p>
        </div>
        <span
          className={`inline-flex max-w-sm shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${
            hasError
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          <i className="size-2 rounded-full bg-current" aria-hidden="true" />
          {dataStatus}
        </span>
      </header> */}

      {toast ? (
        <div
          className="fixed left-1/2 top-4 z-[100] w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-extrabold text-emerald-800 shadow-xl"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
