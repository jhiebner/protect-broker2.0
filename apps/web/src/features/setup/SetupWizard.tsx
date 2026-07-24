import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import type {
  DashboardPreferencesInput,
  FarmProfileInput,
  ProtectConnectionInput,
  SetupAdminInput,
} from '@protect-broker/shared';

const setupSteps = [
  'Administrator',
  'UniFi Protect',
  'Farm Information',
  'Device Discovery',
  'Dashboard',
  'Finish',
] as const;

interface SetupWizardProps {
  onCreateAdministrator: (payload: SetupAdminInput) => Promise<void>;
  onTestProtectConnection: (
    payload: ProtectConnectionInput,
  ) => Promise<{ ok: boolean; message?: string }>;
  onSaveProtectConnection: (payload: ProtectConnectionInput) => Promise<void>;
  onSaveFarmProfile: (payload: FarmProfileInput) => Promise<void>;
  onSaveDashboardPreferences: (payload: DashboardPreferencesInput) => Promise<void>;
  onFinish: (credentials: { username: string; password: string }) => Promise<void>;
}

export function SetupWizard({
  onCreateAdministrator,
  onTestProtectConnection,
  onSaveProtectConnection,
  onSaveFarmProfile,
  onSaveDashboardPreferences,
  onFinish,
}: SetupWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const [admin, setAdmin] = useState<SetupAdminInput>({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [protect, setProtect] = useState<ProtectConnectionInput>({
    host: '',
    port: 443,
    username: '',
    password: '',
    allowSelfSignedCertificate: true,
  });
  const [farm, setFarm] = useState<FarmProfileInput>({
    farmName: '',
    owner: '',
    timezone: 'America/Chicago',
    location: '',
    logoUrl: '',
  });
  const [dashboard, setDashboard] = useState<DashboardPreferencesInput>({
    themeMode: 'dark',
    defaultLayout: 'operations',
  });

  const progressValue = useMemo(() => ((activeStep + 1) / setupSteps.length) * 100, [activeStep]);
  const showPasswordMismatch =
    activeStep === 0 && admin.confirmPassword.length > 0 && admin.password !== admin.confirmPassword;
  const adminStepValid =
    admin.username.trim().length >= 3 &&
    admin.password.length >= 12 &&
    admin.confirmPassword.length >= 12 &&
    admin.password === admin.confirmPassword;
  const disableContinue = busy || (activeStep === 0 && !adminStepValid);

  const runStep = async () => {
    if (activeStep === 0 && admin.password !== admin.confirmPassword) {
      setSeverity('error');
      setMessage('Passwords must match.');
      return;
    }

    if (activeStep === 0 && admin.password.length < 12) {
      setSeverity('error');
      setMessage('Administrator password must be at least 12 characters.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (activeStep === 0) {
        await onCreateAdministrator(admin);
        setSeverity('success');
        setMessage('Administrator account created.');
      }

      if (activeStep === 1) {
        await onSaveProtectConnection(protect);
        setSeverity('success');
        setMessage('Protect connection saved.');
      }

      if (activeStep === 2) {
        await onSaveFarmProfile(farm);
        setSeverity('success');
        setMessage('Farm profile saved.');
      }

      if (activeStep === 4) {
        await onSaveDashboardPreferences(dashboard);
        setSeverity('success');
        setMessage('Dashboard preferences saved.');
      }

      if (activeStep === 5) {
        await onFinish({ username: admin.username, password: admin.password });
        return;
      }

      setActiveStep((current) => Math.min(current + 1, setupSteps.length - 1));
    } catch (error) {
      setSeverity('error');
      setMessage(error instanceof Error ? error.message : 'Unable to continue setup.');
    } finally {
      setBusy(false);
    }
  };

  const testProtectConnection = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const result = await onTestProtectConnection(protect);
      setSeverity(result.ok ? 'success' : 'warning');
      setMessage(result.message ?? (result.ok ? 'Connected.' : 'Connection failed.'));
    } catch (error) {
      setSeverity('error');
      setMessage(error instanceof Error ? error.message : 'Protect connection test failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 4 } }}>
      <Paper sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <div>
            <Typography variant="h2">Initial Commissioning</Typography>
            <Typography color="text.secondary">
              Protect Broker is designed to be installed once and then managed entirely from the browser.
            </Typography>
            <Typography color="primary.main" sx={{ mt: 1, fontWeight: 700 }}>
              Setup progress: {Math.round(progressValue)}%
            </Typography>
          </div>

          <Stepper activeStep={activeStep} alternativeLabel>
            {setupSteps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {message ? <Alert severity={severity}>{message}</Alert> : null}

          {activeStep === 0 ? (
            <Stack spacing={2}>
              <TextField
                label="Administrator Username"
                value={admin.username}
                onChange={(event) => setAdmin((current) => ({ ...current, username: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={admin.password}
                onChange={(event) => setAdmin((current) => ({ ...current, password: event.target.value }))}
                error={admin.password.length > 0 && admin.password.length < 12}
                helperText={
                  admin.password.length > 0 && admin.password.length < 12
                    ? 'Use at least 12 characters.'
                    : undefined
                }
                fullWidth
              />
              <TextField
                label="Confirm Password"
                type="password"
                value={admin.confirmPassword}
                onChange={(event) =>
                  setAdmin((current) => ({ ...current, confirmPassword: event.target.value }))
                }
                error={showPasswordMismatch}
                helperText={showPasswordMismatch ? 'Passwords must match.' : undefined}
                fullWidth
              />
            </Stack>
          ) : null}

          {activeStep === 1 ? (
            <Stack spacing={2}>
              <TextField
                label="IP Address or Hostname"
                value={protect.host}
                onChange={(event) => setProtect((current) => ({ ...current, host: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Port"
                type="number"
                value={protect.port}
                onChange={(event) =>
                  setProtect((current) => ({ ...current, port: Number(event.target.value) || 443 }))
                }
                fullWidth
              />
              <TextField
                label="Protect Username"
                value={protect.username}
                onChange={(event) => setProtect((current) => ({ ...current, username: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Protect Password"
                type="password"
                value={protect.password}
                onChange={(event) => setProtect((current) => ({ ...current, password: event.target.value }))}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={protect.allowSelfSignedCertificate}
                    onChange={(event) =>
                      setProtect((current) => ({
                        ...current,
                        allowSelfSignedCertificate: event.target.checked,
                      }))
                    }
                  />
                }
                label="Allow self-signed certificate"
              />
              <Button variant="outlined" onClick={() => void testProtectConnection()} disabled={busy}>
                Test Connection
              </Button>
            </Stack>
          ) : null}

          {activeStep === 2 ? (
            <Stack spacing={2}>
              <TextField
                label="Farm Name"
                value={farm.farmName}
                onChange={(event) => setFarm((current) => ({ ...current, farmName: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Owner"
                value={farm.owner}
                onChange={(event) => setFarm((current) => ({ ...current, owner: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Timezone"
                value={farm.timezone}
                onChange={(event) => setFarm((current) => ({ ...current, timezone: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Location"
                value={farm.location}
                onChange={(event) => setFarm((current) => ({ ...current, location: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Logo URL (optional)"
                value={farm.logoUrl}
                onChange={(event) => setFarm((current) => ({ ...current, logoUrl: event.target.value }))}
                fullWidth
              />
            </Stack>
          ) : null}

          {activeStep === 3 ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h5">Device Discovery Placeholder</Typography>
                <Typography color="text.secondary">
                  Phase 2 will connect to UniFi Protect, discover devices automatically, and let you assign
                  them to farm zones from this step.
                </Typography>
                <Alert severity="info">The provider seam is in place. Discovery logic is next.</Alert>
              </Stack>
            </Paper>
          ) : null}

          {activeStep === 4 ? (
            <Stack spacing={2}>
              <TextField
                select
                label="Theme"
                value={dashboard.themeMode}
                onChange={(event) =>
                  setDashboard((current) => ({
                    ...current,
                    themeMode: event.target.value as DashboardPreferencesInput['themeMode'],
                  }))
                }
                fullWidth
              >
                <MenuItem value="dark">Dark Theme</MenuItem>
                <MenuItem value="light">Light Theme</MenuItem>
              </TextField>
              <TextField
                select
                label="Default Dashboard Layout"
                value={dashboard.defaultLayout}
                onChange={(event) =>
                  setDashboard((current) => ({
                    ...current,
                    defaultLayout: event.target.value as DashboardPreferencesInput['defaultLayout'],
                  }))
                }
                fullWidth
              >
                <MenuItem value="operations">Operations</MenuItem>
                <MenuItem value="overview">Overview</MenuItem>
                <MenuItem value="alerts">Alerts</MenuItem>
              </TextField>
            </Stack>
          ) : null}

          {activeStep === 5 ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h4">System Ready</Typography>
                <Typography color="text.secondary">
                  Finishing setup will mark the appliance as commissioned and sign in with the administrator
                  account you created.
                </Typography>
              </Stack>
            </Paper>
          ) : null}

          <Stack direction="row" spacing={2} justifyContent="space-between">
            <Button
              variant="text"
              disabled={activeStep === 0 || busy}
              onClick={() => setActiveStep((current) => Math.max(current - 1, 0))}
            >
              Back
            </Button>
            <Button variant="contained" disabled={disableContinue} onClick={() => void runStep()}>
              {activeStep === setupSteps.length - 1 ? 'Finish Setup' : 'Continue'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
