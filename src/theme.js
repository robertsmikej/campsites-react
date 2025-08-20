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
});

export default theme;