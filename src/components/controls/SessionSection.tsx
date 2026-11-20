import { useRef, useState } from 'react';
import { ChevronDown, Download, UploadCloud } from 'lucide-react';
import { useBacktestStore } from '../../store/useBacktestStore';
import { downloadSession, importSession } from '../../services/session';

export function SessionSection() {
  const hasData = useBacktestStore(state => state.rawData.length > 0);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = importSession(await file.text());
    if (error) alert(error);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="mb-6 space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs text-slate-500 uppercase font-bold tracking-widest mb-3 hover:text-slate-300 transition-colors group"
      >
        Session Management
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>

      {isExpanded && (
        <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={downloadSession}
            disabled={!hasData}
            className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg transition-colors border border-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
          >
            <Download size={14} />
            Export
          </button>
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={inputRef}
            onChange={handleImport}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg transition-colors border border-slate-600/50 text-xs font-medium"
          >
            <UploadCloud size={14} />
            Import
          </button>
        </div>
      )}
    </div>
  );
}
