import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

interface LoginViewProps {
  onSubmit: (credentials: { username: string; password: string }) => Promise<void>;
}

export function LoginView({ onSubmit }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await onSubmit({ username, password });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box display="grid" minHeight="100vh" sx={{ placeItems: 'center', p: 3 }}>
      <Paper sx={{ maxWidth: 520, width: '100%', p: 4 }}>
        <Stack spacing={3}>
          <div>
            <Typography variant="h2">Operator Login</Typography>
            <Typography color="text.secondary">
              Protect Broker keeps farm operations in one control surface.
            </Typography>
          </div>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          <TextField
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            fullWidth
            size="medium"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            fullWidth
            size="medium"
          />

          <Button variant="contained" size="large" onClick={() => void handleSubmit()} disabled={submitting}>
            Sign In
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
