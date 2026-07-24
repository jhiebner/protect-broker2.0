import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid2 as Grid,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import { apiClient, type ApiDevice } from '../../api/client.js';

interface DashboardShellProps {
  onRestartSetup: () => Promise<void>;
}

export function DashboardShell({ onRestartSetup }: DashboardShellProps) {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraSnapshots, setCameraSnapshots] = useState<Record<string, string>>({});
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restartingSetup, setRestartingSetup] = useState(false);

  useEffect(() => {
    void apiClient
      .getDevices()
      .then((response) => {
        setDevices(response.devices);
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load devices.');
      });
  }, []);

  const onlineDevices = useMemo(
    () => devices.filter((device) => device.isOnline).length,
    [devices],
  );
  const sensors = useMemo(() => devices.filter((device) => device.kind === 'SENSOR').length, [devices]);
  const relays = useMemo(
    () => devices.filter((device) => device.kind === 'RELAY' || device.kind === 'LOCK').length,
    [devices],
  );
  const cameraDevices = useMemo(() => devices.filter((device) => device.kind === 'CAMERA'), [devices]);
  const sensorDevices = useMemo(() => devices.filter((device) => device.kind === 'SENSOR'), [devices]);

  useEffect(() => {
    if (cameraDevices.length === 0) {
      setCameraSnapshots({});
      return;
    }

    let cancelled = false;

    const loadSnapshots = async () => {
      const nextEntries = await Promise.all(
        cameraDevices.map(async (device) => {
          try {
            const snapshotBlob = await apiClient.getDeviceSnapshot(device.id);
            const objectUrl = URL.createObjectURL(snapshotBlob);
            return [device.id, objectUrl] as const;
          } catch {
            return [device.id, ''] as const;
          }
        }),
      );

      if (cancelled) {
        for (const [, objectUrl] of nextEntries) {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        }
        return;
      }

      setCameraSnapshots((current) => {
        for (const existing of Object.values(current)) {
          if (existing) {
            URL.revokeObjectURL(existing);
          }
        }

        return Object.fromEntries(nextEntries.filter((entry) => entry[1]));
      });
    };

    void loadSnapshots();
    const timerId = setInterval(() => {
      void loadSnapshots();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [cameraDevices]);

  const widgets = [
    {
      title: 'System Status',
      value: `Healthy. ${devices.length} discovered devices, ${onlineDevices} online.`,
    },
    {
      title: 'Sensor Grid',
      value: sensors > 0 ? `${sensors} sensor devices discovered.` : 'No sensor devices discovered yet.',
    },
    {
      title: 'Relay Controls',
      value: relays > 0 ? `${relays} relay-capable devices available.` : 'No relay-capable devices yet.',
    },
    {
      title: 'Farm Zones',
      value: `${onlineDevices}/${devices.length || 0} devices currently online.`,
    },
    { title: 'Active Alerts', value: 'No alerts ingested yet.' },
    {
      title: 'Recent Events',
      value:
        devices.length > 0
          ? `Most recent device: ${devices[devices.length - 1]?.name ?? 'Unknown'}.`
          : 'No device events recorded yet.',
    },
  ];

  const menuOpen = Boolean(menuAnchor);

  const handleRestartSetup = async () => {
    setRestartingSetup(true);
    setErrorMessage(null);

    try {
      await onRestartSetup();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to restart setup.');
    } finally {
      setRestartingSetup(false);
      setRestartDialogOpen(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 3 } }}>
      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
            <div>
              <Typography variant="h2">Operations Dashboard</Typography>
              <Typography color="text.secondary">
                Large, touch-friendly widgets will be connected to live Protect data in Phase 3.
              </Typography>
            </div>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip color="success" label="Broker Online" />
              <Chip color="warning" label="Protect Pending" />
              <Chip label="SCADA Layout Shell" />
              <Button
                variant="outlined"
                color="inherit"
                aria-controls={menuOpen ? 'dashboard-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={menuOpen ? 'true' : undefined}
                onClick={(event) => setMenuAnchor(event.currentTarget)}
                sx={{
                  minHeight: 36,
                  borderColor: 'divider',
                  color: 'text.primary',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                }}
              >
                Menu
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Menu
          id="dashboard-menu"
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setRestartDialogOpen(true);
            }}
          >
            Restart Setup
          </MenuItem>
        </Menu>

        <Dialog
          open={restartDialogOpen}
          onClose={() => {
            if (!restartingSetup) {
              setRestartDialogOpen(false);
            }
          }}
        >
          <DialogTitle>Restart setup wizard?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This returns the app to commissioning mode so you can rerun setup steps.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setRestartDialogOpen(false)}
              disabled={restartingSetup}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => void handleRestartSetup()}
              disabled={restartingSetup}
            >
              {restartingSetup ? 'Restarting…' : 'Restart Setup'}
            </Button>
          </DialogActions>
        </Dialog>

        {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

        <Grid container spacing={2}>
          {widgets.map((widget) => (
            <Grid size={{ xs: 12, md: 6, xl: 4 }} key={widget.title}>
              <Paper sx={{ p: 3, minHeight: 180 }}>
                <Stack spacing={2}>
                  <Typography variant="h5">{widget.title}</Typography>
                  <Typography variant="body1" color="text.secondary">
                    {widget.value}
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}

          <Grid size={{ xs: 12 }}>
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h5">Camera Feeds</Typography>
                {cameraDevices.length === 0 ? (
                  <Typography color="text.secondary">No camera devices discovered yet.</Typography>
                ) : (
                  <Grid container spacing={2}>
                    {cameraDevices.map((camera) => (
                      <Grid size={{ xs: 12, md: 6, xl: 4 }} key={camera.id}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Stack spacing={1}>
                            <Typography variant="subtitle1">{camera.name}</Typography>
                            <Typography color="text.secondary" variant="body2">
                              {camera.isOnline ? 'Online' : 'Offline'}
                            </Typography>
                            {cameraSnapshots[camera.id] ? (
                              <Box
                                component="img"
                                src={cameraSnapshots[camera.id]}
                                alt={`${camera.name} snapshot`}
                                sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                              />
                            ) : (
                              <Typography color="text.secondary" variant="body2">
                                Snapshot unavailable.
                              </Typography>
                            )}
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h5">Sensor Data</Typography>
                {sensorDevices.length === 0 ? (
                  <Typography color="text.secondary">No sensor devices discovered yet.</Typography>
                ) : (
                  <Grid container spacing={2}>
                    {sensorDevices.map((sensor) => (
                      <Grid size={{ xs: 12, md: 6, xl: 4 }} key={sensor.id}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Stack spacing={1}>
                            <Typography variant="subtitle1">{sensor.name}</Typography>
                            <Typography color="text.secondary" variant="body2">
                              State: {sensor.sensorState?.state ?? 'unknown'}
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                              Battery: {sensor.sensorState?.batteryLevel ?? 'n/a'}
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                              Signal: {sensor.sensorState?.signalLevel ?? 'n/a'}
                            </Typography>
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}
