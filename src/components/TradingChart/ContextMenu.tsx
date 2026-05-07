import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'danger' | 'success' | 'primary' | 'default';
}

export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  price: number;
  groups: MenuGroup[];
  onClose: () => void;
}

/**
 * A highly extensible (aggregable) context menu for the trading chart.
 * Displays various actions based on the right-click location.
 */
export function ContextMenu({ x, y, price, groups, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay binding to avoid immediate closure from the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Adjust position if menu goes off-screen
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      className="fixed bg-dark-800/95 backdrop-blur-md border border-dark-700/50 rounded-xl shadow-2xl z-[100] w-52 overflow-hidden animate-in fade-in zoom-in-95 duration-150 py-1.5"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="px-3 py-1.5 border-b border-dark-700/30 mb-1.5">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Price At Point</div>
        <div className="text-sm font-mono text-primary-400 font-bold">{price.toFixed(2)}</div>
      </div>

      {groups.map((group, gIdx) => (
        <div key={gIdx} className={gIdx > 0 ? "border-t border-dark-700/30 mt-1.5 pt-1.5" : ""}>
          {group.label && (
            <div className="px-3 py-1 text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
              {group.label}
            </div>
          )}
          {group.items.map((item, iIdx) => (
            <button
              key={iIdx}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs transition-all
                ${item.disabled
                  ? 'opacity-30 cursor-not-allowed grayscale'
                  : 'hover:bg-primary-500/10 active:scale-[0.98]'
                }
                ${item.type === 'danger' ? 'text-red-400 hover:text-red-300' :
                  item.type === 'success' ? 'text-emerald-400 hover:text-emerald-300' :
                    'text-slate-300 hover:text-white'}
              `}
            >
              <span className="shrink-0 opacity-70 group-hover:opacity-100">
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
