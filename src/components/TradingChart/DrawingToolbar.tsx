import { Square, Minus, Trash2, Pen, Rows4, Undo2, Redo2, Circle, ChartLine, Ruler, ChevronDown } from 'lucide-react';

interface DrawingToolbarProps {
  activeTool: string | null;
  onToolClick: (tool: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showIndicatorsMenu: boolean;
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
  onToggleIndicatorsMenu,
}: DrawingToolbarProps) {
  const indicatorBtnActive = showIndicatorsMenu;

  return (
    <div className="flex flex-col items-center gap-2 p-2 border-r border-dark-700 bg-dark-800 shrink-0 relative">
      <button
        onClick={onToggleIndicatorsMenu}
        className={`px-1 py-3 rounded transition-colors flex items-center justify-center ${indicatorBtnActive
          ? 'bg-primary-500/20 text-primary-500 border border-primary-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Indicators"
      >
        <ChartLine size={20} />
        <ChevronDown size={12} />
      </button>

      <div className="w-full h-px bg-dark-700 my-1" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-2 rounded transition-colors border ${canUndo
          ? 'hover:bg-dark-700 text-slate-400 border-transparent'
          : 'text-slate-600 border-transparent cursor-not-allowed'
          }`}
        title="Undo"
      >
        <Undo2 size={24} />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-2 rounded transition-colors border ${canRedo
          ? 'hover:bg-dark-700 text-slate-400 border-transparent'
          : 'text-slate-600 border-transparent cursor-not-allowed'
          }`}
        title="Redo"
      >
        <Redo2 size={24} />
      </button>

      <div className="w-full h-px bg-dark-700 my-1" />

      <button
        onClick={() => onToolClick('segment')}
        className={`p-2 rounded transition-colors ${activeTool === 'segment'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Trend Line"
      >
        <Minus size={24} style={{ transform: 'rotate(135deg)' }} />
      </button>

      <button
        onClick={() => onToolClick('rect')}
        className={`p-2 rounded transition-colors ${activeTool === 'rect'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Rectangle"
      >
        <Square size={24} />
      </button>

      <button
        onClick={() => onToolClick('fibonacciLine')}
        className={`p-2 rounded transition-colors ${activeTool === 'fibonacciLine'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Fibonacci Retracement"
      >
        <Rows4 size={24} />
      </button>

      <button
        onClick={() => onToolClick('pencil')}
        className={`p-2 rounded transition-colors ${activeTool === 'pencil'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Pencil"
      >
        <Pen size={24} />
      </button>

      <button
        onClick={() => onToolClick('circle')}
        className={`p-2 rounded transition-colors ${activeTool === 'circle'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Circle"
      >
        <Circle size={24} />
      </button>

      <button
        onClick={() => onToolClick('horizontalStraightLine')}
        className={`p-2 rounded transition-colors ${activeTool === 'horizontalStraightLine'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Horizontal Line"
      >
        <Minus size={24} />
      </button>

      <button
        onClick={() => onToolClick('verticalStraightLine')}
        className={`p-2 rounded transition-colors ${activeTool === 'verticalStraightLine'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Vertical Line"
      >
        <Minus size={24} style={{ transform: 'rotate(90deg)' }} />
      </button>

      <button
        onClick={() => onToolClick('text')}
        className={`p-2 rounded transition-colors font-bold text-lg ${activeTool === 'text'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Text"
      >
        T
      </button>

      <button
        onClick={() => onToolClick('measurement')}
        className={`p-2 rounded transition-colors ${activeTool === 'measurement'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'hover:bg-dark-700 text-slate-400 border border-transparent'
          }`}
        title="Measure (Ctrl+Shift)"
      >
        <Ruler size={24} />
      </button>

      <div className="mt-auto">
        <button
          onClick={onClear}
          className="p-2 rounded transition-colors hover:bg-danger/20 hover:text-danger hover:border-danger/30 border border-transparent text-slate-400"
          title="Clear Tools"
        >
          <Trash2 size={24} />
        </button>
      </div>
    </div>
  );
}
