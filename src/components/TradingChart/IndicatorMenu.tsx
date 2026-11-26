import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChartNoAxesCombined, ChevronRight, Search } from 'lucide-react';
import { INDICATORS_LIST } from '../../lib/chart/constants';
import { getCustomIndicator } from '../../lib/chart/customIndicators';

const nativeLabels: Record<string, string> = {
  MA: 'Moving Average',
  EMA: 'Exponential Moving Average',
  MACD: 'Moving Average Convergence Divergence',
  VOL: 'Volume',
  RSI: 'Relative Strength Index',
};

const indicators = INDICATORS_LIST.map(name => {
  const label = getCustomIndicator(name)?.label ?? nativeLabels[name] ?? name;
  return { name, label, searchText: `${name} ${label}`.toLowerCase() };
});

export function IndicatorMenu({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const terms = query.trim().toLowerCase().split(/\s+/);
  const matches = indicators.filter(({ searchText }) => terms.every(term => searchText.includes(term)));

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function select(name: string) {
    close();
    onAdd(name);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    // Typing in the picker must not trigger the chart's playback or drawing shortcuts.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Enter':
        event.preventDefault();
        if (matches[activeIndex]) select(matches[activeIndex].name);
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        if (!matches.length) break;
        const step = event.key === 'ArrowUp' ? -1 : 1;
        const next = (activeIndex + step + matches.length) % matches.length;
        setActiveIndex(next);
        list.current?.children[next]?.scrollIntoView?.({ block: 'nearest' });
        break;
      }
    }
  }

  return (
    <div ref={root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" aria-label="Indicators" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setQuery('');
          setActiveIndex(0);
          setOpen(!open);
        }}
        className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[10px] font-medium leading-none transition-colors focus-visible:outline-blue-400 ${open
          ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
          : 'border-transparent text-slate-300 hover:bg-dark-700 hover:text-white'}`}>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <ChartNoAxesCombined size={18} /><ChevronRight size={10} />
        </span>
        
      </button>

      {open && (
        <div className="absolute left-full top-2 z-50 ml-1 flex max-h-[calc(100%-1rem)] w-[min(20rem,calc(100cqw-5rem))] flex-col overflow-hidden rounded-lg border border-slate-600 bg-dark-800 shadow-2xl">
          <label className="flex shrink-0 items-center gap-2 border-b border-dark-700 px-3 py-2.5 text-blue-300">
            <Search size={16} aria-hidden="true" />
            <input autoFocus role="combobox" aria-label="Search indicators" placeholder="Search indicators…"
              autoComplete="off" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
              aria-activedescendant={matches[activeIndex] ? `${listId}-${matches[activeIndex].name}` : undefined}
              value={query} onChange={event => {
                setQuery(event.target.value);
                setActiveIndex(0);
                if (list.current) list.current.scrollTop = 0;
              }} onKeyDown={navigate}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400" />
          </label>
          <ul ref={list} role="listbox" id={listId} aria-label="Indicators" className="min-h-0 max-h-72 overflow-y-auto p-1">
            {matches.map(({ name, label }, index) => (
              <li key={name} id={`${listId}-${name}`} role="option" aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()}
                onClick={() => select(name)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-sm ${activeIndex === index
                  ? 'bg-blue-500/15 text-blue-200' : 'text-slate-300'}`}>
                <span>{label}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">{name}</span>
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status" className="px-3 pb-3 text-sm text-slate-400">No matching indicators.</p>}
        </div>
      )}
    </div>
  );
}
