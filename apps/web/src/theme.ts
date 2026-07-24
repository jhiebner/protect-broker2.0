import { createTheme } from '@mui/material';
import { scadaTokens } from '@protect-broker/ui';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: scadaTokens.palette.primary,
    },
    warning: {
      main: scadaTokens.palette.warning,
    },
    error: {
      main: scadaTokens.palette.danger,
    },
    background: {
      default: scadaTokens.palette.background,
      paper: scadaTokens.palette.panel,
    },
    text: {
      primary: scadaTokens.palette.text,
      secondary: scadaTokens.palette.textMuted,
    },
  },
  shape: {
    borderRadius: scadaTokens.radius,
  },
  typography: {
    fontFamily: 'Avenir Next, Trebuchet MS, sans-serif',
    h1: {
      fontFamily: 'Avenir Next Condensed, Trebuchet MS, sans-serif',
      fontWeight: 800,
      letterSpacing: '0.04em',
    },
    h2: {
      fontFamily: 'Avenir Next Condensed, Trebuchet MS, sans-serif',
      fontWeight: 800,
      letterSpacing: '0.04em',
    },
    button: {
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'none',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${scadaTokens.palette.border}`,
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 52,
        },
      },
    },
  },
});
