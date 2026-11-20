import { useEffect, useState } from 'react';
import { useMarketDataStore } from '../../store/useMarketDataStore';
import { DEFAULT_RITHMIC_GATEWAY_ADDRESS, RITHMIC_SOURCE_ID, type RithmicCredentials } from '../../services/rithmic';
import {
  clearStoredRithmicCredentials,
  loadStoredRithmicCredentials,
  saveRithmicCredentials,
} from '../../services/rithmicCredentialStorage';

/** Dialog state and actions for connecting with Rithmic credentials. */
export function useRithmicConnection() {
  const sourceId = useMarketDataStore(state => state.sourceId);
  const isLoading = useMarketDataStore(state => state.isLoading);
  const connectSource = useMarketDataStore(state => state.connectSource);
  const disconnectSource = useMarketDataStore(state => state.disconnectSource);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<RithmicCredentials>({
    username: '',
    password: '',
    gatewayUrl: DEFAULT_RITHMIC_GATEWAY_ADDRESS,
  });
  const [rememberCredentials, setRememberCredentials] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void loadStoredRithmicCredentials().then(stored => {
      if (!isMounted || !stored) return;
      setCredentials({ ...stored, gatewayUrl: stored.gatewayUrl || DEFAULT_RITHMIC_GATEWAY_ADDRESS });
      setRememberCredentials(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateCredential = (field: keyof RithmicCredentials, value: string) => {
    setCredentials(current => ({ ...current, [field]: value }));
  };

  const changeRememberCredentials = (remember: boolean) => {
    setRememberCredentials(remember);
    if (!remember) void clearStoredRithmicCredentials();
  };

  const connect = async () => {
    await connectSource(RITHMIC_SOURCE_ID, { credentials: { ...credentials } });
    const state = useMarketDataStore.getState();
    if (state.sourceId !== RITHMIC_SOURCE_ID || !state.isConnected) return;
    if (rememberCredentials) {
      await saveRithmicCredentials(credentials);
    } else {
      await clearStoredRithmicCredentials();
    }
    setIsDialogOpen(false);
  };

  const closeDialog = () => {
    // Closing the dialog cancels an in-flight sign-in.
    if (isLoading && sourceId === RITHMIC_SOURCE_ID) disconnectSource();
    setIsDialogOpen(false);
  };

  return {
    isDialogOpen,
    openDialog: () => setIsDialogOpen(true),
    closeDialog,
    isConnecting: isLoading && sourceId === RITHMIC_SOURCE_ID,
    credentials,
    updateCredential,
    rememberCredentials,
    changeRememberCredentials,
    connect,
  };
}
