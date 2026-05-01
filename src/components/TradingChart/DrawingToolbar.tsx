import { Square, Minus, Trash2, ChevronDown, Pen, Rows4, Undo2, Redo2 } from 'lucide-react';

interface DrawingToolbarProps {
  activeTool: string | null;
  onToolClick: (tool: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showIndicatorsMenu: boolean;
  activeIndicators: string[];
  onToggleIndicatorsMenu: () => void;
}

export function DrawingToolbar({
  activeTool,
  onToolClick,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showIndicatorsMenu,
  activeIndicators,
  onToggleIndicatorsMenu,
}: DrawingToolbarProps) {
  const indicatorBtnActive = showIndicatorsMenu || activeIndicators.length > 0;

  return (
    <div className="flex flex-col gap-2 p-2 border-r border-dark-700 bg-dark-800 shrink-0 relative">
      <button
        onClick={onToggleIndicatorsMenu}
        className={`p-2 rounded transition-colors flex items-center justify-center ${
          indicatorBtnActive
            ? 'bg-primary-500/20 text-primary-500 border border-primary-500/30'
            : 'hover:bg-dark-700 text-slate-400 border border-transparent'
        }`}
        title="Indicadores"
      >
        <span className="font-bold text-xs tracking-tighter">fx</span>
        <ChevronDown size={12} className="ml-0.5" />
      </button>

      <div className="w-full h-px bg-dark-700 my-1" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-2 rounded transition-colors border ${
          canUndo
            ? 'hover:bg-dark-700 text-slate-400 border-transparent'
            : 'text-slate-600 border-transparent cursor-not-allowed'
        }`}
        title="Undo"
      >
        <Undo2 size={20} />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-2 rounded transition-colors border ${
          canRedo
            ? 'hover:bg-dark-700 text-slate-400 border-transparent'
            : 'text-slate-600 border-transparent cursor-not-allowed'
        }`}
        title="Redo"
      >
        <Redo2 size={20} />
      </button>

      <div className="w-full h-px bg-dark-700 my-1" />

      <button
        onClick={() => onToolClick('segment')}
        className={`p-2 rounded transition-colors ${
          activeTool === 'segment'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'hover:bg-dark-700 text-slate-400 border border-transparent'
        }`}
        title="Línea de Tendencia"
      >
        <Minus size={20} />
      </button>

      <button
        onClick={() => onToolClick('rect')}
        className={`p-2 rounded transition-colors ${
          activeTool === 'rect'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'hover:bg-dark-700 text-slate-400 border border-transparent'
        }`}
        title="Rectángulo"
      >
        <Square size={20} />
      </button>

      <button
        onClick={() => onToolClick('fibonacciLine')}
        className={`p-2 rounded transition-colors ${
          activeTool === 'fibonacciLine'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'hover:bg-dark-700 text-slate-400 border border-transparent'
        }`}
        title="Retroceso de Fibonacci"
      >
        <Rows4 size={20} />
      </button>

      <button
        onClick={() => onToolClick('pencil')}
        className={`p-2 rounded transition-colors ${
          activeTool === 'pencil'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'hover:bg-dark-700 text-slate-400 border border-transparent'
        }`}
        title="Lápiz"
      >
        <Pen size={20} />
      </button>

      <div className="mt-auto">
        <button
          onClick={onClear}
          className="p-2 rounded transition-colors hover:bg-danger/20 hover:text-danger hover:border-danger/30 border border-transparent text-slate-400"
          title="Limpiar Herramientas"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
