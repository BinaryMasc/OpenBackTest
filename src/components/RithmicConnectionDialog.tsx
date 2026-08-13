import { X } from 'lucide-react';
import type { RithmicCredentials } from '../services/rithmic';

interface RithmicConnectionDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  credentials: RithmicCredentials;
  error: string | null;
  onCredentialsChange: (field: keyof RithmicCredentials, value: string) => void;
  onConnect: () => Promise<void>;
  onClose: () => void;
}

const credentialFields: Array<{
  key: keyof RithmicCredentials;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  autoComplete?: string;
}> = [
  { key: 'username', label: 'Username', placeholder: 'Rithmic username', autoComplete: 'username' },
  { key: 'password', label: 'Password', placeholder: 'Rithmic password', type: 'password', autoComplete: 'current-password' }
];

export function RithmicConnectionDialog({
  isOpen,
  isLoading,
  credentials,
  error,
  onCredentialsChange,
  onConnect,
  onClose
}: RithmicConnectionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <form
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-dark-800 p-5 shadow-2xl"
        onSubmit={event => {
          event.preventDefault();
          void onConnect();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rithmic-dialog-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="rithmic-dialog-title" className="text-lg font-semibold text-white">Connect to Rithmic</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Credentials are sent to the local OpenBackTest gateway and are not saved by the app.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {credentialFields.map(field => (
            <label key={field.key} className="block text-xs text-slate-300">
              <span className="mb-1 block">{field.label}</span>
              <input
                type={field.type || 'text'}
                value={credentials[field.key]}
                onChange={event => onCredentialsChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                required
                className="w-full rounded-md border border-slate-700 bg-dark-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-slate-700/70 bg-dark-900/60 p-3 text-xs text-slate-300">
          <div className="font-medium text-white">Phidias connection profile</div>
          <div className="mt-1 text-slate-400">Rithmic Paper Trading · Chicago Area · CME</div>
          <div className="mt-1 text-slate-500">The server, system, and front-month contract are configured automatically.</div>
        </div>

        <p className="mt-4 text-[11px] leading-5 text-slate-500">
          Start the gateway first with <code className="text-slate-300">python gateway/rithmic_gateway.py</code>.
          Use the Rithmic credentials from your Phidias payment email, not your Phidias website password.
        </p>

        {error && <div className="mt-3 text-xs text-red-400" role="alert">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-dark-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Connecting…' : 'Log in to Rithmic'}
          </button>
        </div>
      </form>
    </div>
  );
}
