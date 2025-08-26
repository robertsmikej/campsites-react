import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    components: {
        MuiPickersLayout: {
            styleOverrides: {
                root: {
                    minWidth: '220px !important', //important is stupid, but it wouldn't override without it
                    marginLeft: '10px',
                },
            },
        },
        MuiPickersDay: {
            styleOverrides: {
                root: {
                    fontWeight: 500,
                    '&.Mui-selected': {
                        backgroundColor: '#1976d2',
                        color: '#fff',
                        '&:hover': {
                            backgroundColor: '#115293',
                        },
                    },
                },
            },
        },
    },
    typography: {
        fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",

        // Global default font size
        fontSize: 12, // affects body1/body2, buttons, etc.

        // Override headers specifically
        h1: {
            fontSize: '2rem',
            fontWeight: 700,
        },
        h2: {
            fontSize: '1.8rem',
            fontWeight: 400,
        },
        h3: {
            fontSize: '1.6rem',
            fontWeight: 700,
        },
        h4: {
            fontSize: '1.3rem',
            fontWeight: 600,
        },
        h5: {
            fontSize: '1.2rem',

        },
        h6: {
            fontSize: '1.1rem',
        },
        body: {
            fontSize: '0.9rem',
            lineHeight: 1,
        },
    },
});

export default theme;