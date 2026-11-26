export function SidebarHeader() {
  return (
   
  <header className="mb-5 shrink-0 border-b border-dark-700 pb-4">
    <div className="flex min-h-10 items-center">
      <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" className="hidden size-10 object-contain md:block" />
      <h1 className="font-mono text-xl font-bold leading-none tracking-tight text-slate-50 md:text-2xl">
        OpenBackTest
      </h1>
    </div>

    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium tracking-wide text-emerald-500">
        DATA · STRATEGY · EXECUTION
      </p>

      <a
        href="https://github.com/BinaryMasc/OpenBackTest"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-1.5 rounded-md border border-dark-700/50 bg-dark-900/50 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-emerald-500/30 hover:bg-dark-900 hover:text-emerald-400"
      >
        {/* GitHub icon */}
        <span>GitHub</span>
      </a>
    </div>
  </header>

  );
}
