import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMarketDataStore } from '../../store/useMarketDataStore';

interface SidebarSectionProps {
  title: string;
  summary?: string;
  initiallyOpen?: boolean;
  collapseOnConnect?: boolean;
  children: ReactNode;
}

export function SidebarSection({ title, summary, initiallyOpen = true, collapseOnConnect = false, children }: SidebarSectionProps) {
  const contentId = useId();
  const autoCollapse = useMarketDataStore(state => collapseOnConnect && state.isConnected);
  const [expanded, setExpanded] = useState(initiallyOpen && !autoCollapse);
  const [previousAutoCollapse, setPreviousAutoCollapse] = useState(autoCollapse);

  if (previousAutoCollapse !== autoCollapse) {
    setPreviousAutoCollapse(autoCollapse);
    if (autoCollapse) setExpanded(false);
  }

  return (
    <section className={expanded ? 'mb-6' : 'mb-2'}>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(open => !open)}
          className="flex min-h-8 w-full items-center gap-2 rounded text-left text-xs font-bold tracking-wider text-slate-400 uppercase hover:text-slate-200 focus-visible:outline-primary-500"
        >
          <span className="mr-auto">{title}</span>
          {!expanded && summary && (
            <span className="truncate text-xs font-medium tracking-normal text-slate-300 normal-case">{summary}</span>
          )}
          <ChevronDown size={14} aria-hidden="true" className={`shrink-0 motion-safe:transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>
      </h3>
      <div id={contentId} hidden={!expanded} className="mt-2 space-y-2">
        {children}
      </div>
    </section>
  );
}
