import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Grid2 as Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import { apiClient, type ApiDevice } from '../../api/client.js';

export function DashboardShell() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
            </Stack>
          </Stack>
        </Paper>

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
        </Grid>
      </Stack>
    </Box>
  );
}
