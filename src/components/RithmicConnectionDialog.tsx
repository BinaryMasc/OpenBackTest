import { X } from 'lucide-react';
import { DEFAULT_RITHMIC_GATEWAY_ADDRESS, type RithmicCredentials } from '../services/rithmic';

interface RithmicConnectionDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  credentials: RithmicCredentials;
  error: string | null;
  rememberCredentials: boolean;
  onCredentialsChange: (field: keyof RithmicCredentials, value: string) => void;
  onRememberCredentialsChange: (remember: boolean) => void;
  onConnect: () => Promise<void>;
  onClose: () => void;
}

export function RithmicConnectionDialog({
  isOpen,
  isLoading,
  credentials,
  error,
  rememberCredentials,
  onCredentialsChange,
  onRememberCredentialsChange,
  onConnect,
  onClose
}: RithmicConnectionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-dark-800 p-5 shadow-2xl"
        onSubmit={event => { event.preventDefault(); void onConnect(); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rithmic-dialog-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="rithmic-dialog-title" className="text-lg font-semibold text-white">Connect to Rithmic</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Credentials are sent only to the local gateway. If enabled, they are encrypted before being stored in this browser.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close dialog"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-300">
            <span className="mb-1 block">Username</span>
            <input value={credentials.username} onChange={event => onCredentialsChange('username', event.target.value)} autoComplete="username" required className="w-full rounded-md border border-slate-700 bg-dark-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
          </label>
          <label className="block text-xs text-slate-300">
            <span className="mb-1 block">Password</span>
            <input type="password" value={credentials.password} onChange={event => onCredentialsChange('password', event.target.value)} autoComplete="current-password" required className="w-full rounded-md border border-slate-700 bg-dark-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
          </label>
        </div>

        <label className="mt-3 block text-xs text-slate-300">
          <span className="mb-1 block">Gateway address</span>
          <input
            value={credentials.gatewayUrl || DEFAULT_RITHMIC_GATEWAY_ADDRESS}
            onChange={event => onCredentialsChange('gatewayUrl', event.target.value)}
            placeholder={DEFAULT_RITHMIC_GATEWAY_ADDRESS}
            autoComplete="url"
            required
            className="w-full rounded-md border border-slate-700 bg-dark-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
          <span className="mt-1 block text-[11px] text-slate-500">HTTP, HTTPS, WS, and WSS addresses are accepted.</span>
        </label>

        <div className="mt-4 rounded-md border border-slate-700/70 bg-dark-900/60 p-3 text-xs text-slate-300">
          <div className="font-medium text-white">Phidias connection profile</div>
          <div className="mt-1 text-slate-400">Rithmic Paper Trading · Chicago Area · CME</div>
          <div className="mt-1 text-slate-500">The local gateway supplies the RAPI+ nameserver configuration.</div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={rememberCredentials}
            onChange={event => onRememberCredentialsChange(event.target.checked)}
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            <span className="block">Remember credentials on this device</span>
          </span>
        </label>

        <p className="mt-4 text-[11px] leading-5 text-slate-500">Start <code className="text-slate-300">dotnet run --project gateway</code> first. In Actual mode, this connection can read account data and route market orders through the local gateway.</p>
        {error && <div className="mt-3 text-xs text-red-400" role="alert">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-dark-700">Cancel</button>
          <button type="submit" disabled={isLoading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">{isLoading ? 'Connecting…' : 'Log in to Rithmic'}</button>
        </div>
      </form>
    </div>
  );
}
