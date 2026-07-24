import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';

import type { BootstrapState } from '@protect-broker/shared';

import { apiClient } from './api/client.js';
import { DashboardShell } from './features/dashboard/DashboardShell.js';
import { LoginView } from './features/auth/LoginView.js';
import { SetupWizard } from './features/setup/SetupWizard.js';

const AUTH_STORAGE_KEY = 'protect-broker.auth-token';

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    void apiClient
      .getBootstrapState()
      .then(setBootstrapState)
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load Protect Broker.');
      });
  }, []);

  useEffect(() => {
    apiClient.setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!bootstrapState) {
      return;
    }

    if (!bootstrapState.setupComplete || !token) {
      setAuthReady(true);
      return;
    }

    let isCancelled = false;
    setAuthReady(false);

    void apiClient
      .getCurrentUser()
      .catch(() => {
        if (isCancelled) {
          return;
        }

        localStorage.removeItem(AUTH_STORAGE_KEY);
        setToken(null);
      })
      .finally(() => {
        if (!isCancelled) {
          setAuthReady(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [bootstrapState, token]);

  const refreshBootstrap = async () => {
    const nextState = await apiClient.getBootstrapState();
    setBootstrapState(nextState);
  };

  const login = async (credentials: { username: string; password: string }) => {
    const response = await apiClient.login(credentials);
    localStorage.setItem(AUTH_STORAGE_KEY, response.token);
    apiClient.setAuthToken(response.token);
    setToken(response.token);
  };

  if (errorMessage) {
    return (
      <Box display="grid" minHeight="100vh" sx={{ placeItems: 'center', p: 3 }}>
        <Alert severity="error">{errorMessage}</Alert>
      </Box>
    );
  }

  if (!bootstrapState) {
    return (
      <Box display="grid" minHeight="100vh" sx={{ placeItems: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="primary" />
          <Alert severity="info">Starting Protect Broker…</Alert>
        </Stack>
      </Box>
    );
  }

  if (bootstrapState.setupComplete && !authReady) {
    return (
      <Box display="grid" minHeight="100vh" sx={{ placeItems: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="primary" />
          <Alert severity="info">Verifying operator session…</Alert>
        </Stack>
      </Box>
    );
  }

  if (!bootstrapState.setupComplete) {
    return (
      <SetupWizard
        bootstrapState={bootstrapState}
        onCreateAdministrator={async (payload) => {
          await apiClient.createAdministrator(payload);
        }}
        onTestProtectConnection={(payload) => apiClient.testProtectConnection(payload)}
        onSaveProtectConnection={(payload) => apiClient.saveProtectConnection(payload)}
        onSaveFarmProfile={(payload) => apiClient.saveFarmProfile(payload)}
        onSaveDashboardPreferences={(payload) => apiClient.saveDashboardPreferences(payload)}
        onDiscoverDevices={() => apiClient.discoverDevices()}
        onFinish={async (credentials) => {
          await apiClient.finishSetup();
          await refreshBootstrap();

          if (credentials) {
            await login(credentials);
          }
        }}
      />
    );
  }

  if (!token) {
    return <LoginView onSubmit={login} />;
  }

  return (
    <DashboardShell
      onRestartSetup={async () => {
        await apiClient.restartSetup();
        localStorage.removeItem(AUTH_STORAGE_KEY);
        apiClient.setAuthToken(null);
        setToken(null);
        await refreshBootstrap();
      }}
    />
  );
}
