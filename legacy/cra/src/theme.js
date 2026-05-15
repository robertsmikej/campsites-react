import { createTheme } from '@mui/material/styles';

const basePalette = {
    primary: {
        light: '#63b3ff',
        main: '#3182ce',
        dark: '#225799',
        contrastText: '#ffffff',
    },
    secondary: {
        light: '#fbcfe8',
        main: '#ec4899',
        dark: '#be185d',
        contrastText: '#0f172a',
    },
    success: {
        light: '#4ade80',
        main: '#22c55e',
        dark: '#15803d',
        contrastText: '#0f172a',
    },
    warning: {
        light: '#facc15',
        main: '#f59e0b',
        dark: '#b45309',
        contrastText: '#0f172a',
    },
    error: {
        light: '#f87171',
        main: '#ef4444',
        dark: '#b91c1c',
        contrastText: '#ffffff',
    },
    info: {
        light: '#7dd3fc',
        main: '#38bdf8',
        dark: '#0ea5e9',
        contrastText: '#0f172a',
    },
};

const paletteByMode = {
    light: {
        background: {
            default: '#f8fafc',
            paper: '#ffffff',
        },
        text: {
            primary: '#0f172a',
            secondary: '#475569',
            disabled: 'rgba(71, 85, 105, 0.6)',
        },
        divider: 'rgba(148, 163, 184, 0.4)',
    },
    dark: {
        background: {
            default: '#0f172a',
            paper: '#111c33',
        },
        text: {
            primary: '#e2e8f0',
            secondary: '#94a3b8',
            disabled: 'rgba(148, 163, 184, 0.5)',
        },
        divider: 'rgba(148, 163, 184, 0.2)',
    },
};

const typography = {
    fontFamily: "'Inter', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
    fontSize: 13,
    h1: {
        fontSize: '2.4rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
    },
    h2: {
        fontSize: '2rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
    },
    h3: {
        fontSize: '1.6rem',
        fontWeight: 600,
    },
    h4: {
        fontSize: '1.3rem',
        fontWeight: 600,
    },
    h5: {
        fontSize: '1.1rem',
        fontWeight: 500,
    },
    h6: {
        fontSize: '1rem',
        fontWeight: 500,
    },
    body1: {
        fontSize: '0.95rem',
        lineHeight: 1.45,
    },
    body2: {
        fontSize: '0.85rem',
        lineHeight: 1.35,
    },
    button: {
        textTransform: 'none',
        fontWeight: 600,
    },
    caption: {
        fontSize: '0.75rem',
        letterSpacing: '0.02em',
    },
};

const shape = {
    borderRadius: 12,
};

const baseShadows = [
    'none',
    '0px 2px 8px rgba(15, 23, 42, 0.12)',
    '0px 4px 12px rgba(15, 23, 42, 0.16)',
    '0px 8px 24px rgba(15, 23, 42, 0.18)',
    ...Array(22).fill('0px 8px 24px rgba(15, 23, 42, 0.18)'),
];

const getComponents = (palette, shape) => ({
    MuiPickersLayout: {
        styleOverrides: {
            root: {
                minWidth: '220px !important',
                marginLeft: '10px',
            },
        },
    },
    MuiPickersDay: {
        styleOverrides: {
            root: {
                fontWeight: 500,
                '&.Mui-selected': {
                    backgroundColor: palette.primary.main,
                    color: palette.primary.contrastText,
                    '&:hover': {
                        backgroundColor: palette.primary.dark,
                    },
                },
            },
        },
    },
    MuiButton: {
        styleOverrides: {
            root: {
                borderRadius: shape.borderRadius,
                fontWeight: 600,
                boxShadow: 'none',
            },
            containedPrimary: {
                boxShadow: `0px 6px 16px ${palette.mode === 'light' ? 'rgba(49, 130, 206, 0.35)' : 'rgba(49, 130, 206, 0.55)'}`,
            },
        },
    },
    MuiPaper: {
        styleOverrides: {
            root: {
                backgroundImage: 'none',
            },
        },
    },
    MuiCard: {
        styleOverrides: {
            root: {
                borderRadius: shape.borderRadius + 4,
                border: `1px solid ${palette.divider}`,
            },
        },
    },
});

export const createAppTheme = (mode = 'light', overrides = {}) => {
    const palette = {
        ...basePalette,
        ...(paletteByMode[mode] ?? paletteByMode.dark),
        mode,
        ...(overrides.palette ?? {}),
    };

    const typographyConfig = {
        ...typography,
        ...(overrides.typography ?? {}),
    };

    const shapeConfig = overrides.shape ?? shape;
    const spacing = overrides.spacing ?? 8;
    const shadows = overrides.shadows ?? baseShadows;
    const components = {
        ...getComponents(palette, shapeConfig),
        ...(overrides.components ?? {}),
    };

    return createTheme({
        palette,
        typography: typographyConfig,
        shape: shapeConfig,
        spacing,
        shadows,
        components,
    });
};

const theme = createAppTheme();

export default theme;
