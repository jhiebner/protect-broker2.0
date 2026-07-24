import {
  Box,
  Chip,
  Grid2 as Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

const widgets = [
  { title: 'System Status', value: 'Healthy' },
  { title: 'Sensor Grid', value: 'Waiting for Phase 2 data' },
  { title: 'Relay Controls', value: 'Control panel placeholder' },
  { title: 'Farm Zones', value: 'Zone mapping shell' },
  { title: 'Active Alerts', value: 'No alerts ingested yet' },
  { title: 'Recent Events', value: 'Event log feed placeholder' },
];

export function DashboardShell() {
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
