import { useEffect, useState } from 'react';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';

import SiteSettings from './context/SiteSettingsContext';
import { getSitewideDefaultSettings } from './constants/settings';

import ProgressBar from './context/ProgressBarContext';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';

import { sites } from './json/sites';
import { fetchCampgrounds } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import Button from '@mui/material/Button';
import { ProgressBarEl } from './components/ProgressBarEl';
import { formatGroupsByFavorites, formatGroups } from './utils/utils';

// Override default settings here, default settings are in constants/settings.js
const settingsOverrides = {
    dates: {
        // startDate: '2025-08-01',
        // endDate: '2025-10-01',
        validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        // preferredStartDays: ['Thursday', 'Friday', 'Saturday'],
        stayLengths: [2, 3, 4, 5],
    },
    views: {
        type: 'calendar', //'table' or 'calendar'
    }
};
const settingsObject = getSitewideDefaultSettings(settingsOverrides);

export default function App() {
    const [settings] = useState(settingsObject ?? {});
    const [progressBarData, setProgressBarData] = useState({
        totalCalls: 0,
        currentCall: 0,
        progress: 0,
    });

    const [campgroundsData, setCampgroundsData] = useState({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState({});

    // useEffect(() => {
    //     console.clear();
    // }, []);

    useEffect(() => {
        if (!settings) return;

        (async () => {
            const siteData = await fetchCampgrounds(
                sites,
                settings,
                (current, total) => {
                    setProgressBarData(prev => ({
                        ...prev,
                        currentCall: current,
                        totalCalls: total,
                        progress: total > 0 ? current / total : 0,
                    }));
                }
            );
            setCampgroundsData(siteData);
        })();
    }, [settings]);

    useEffect(() => {
        if (Object.keys(campgroundsData)?.length > 0) {
            const groupedByFavorites = formatGroupsByFavorites(campgroundsData);
            const formattedIntoGroups = formatGroups(groupedByFavorites, true, 'area');
            setCampgroundsByAreas(formattedIntoGroups);
        }
    }, [campgroundsData]);

    const refreshData = async () => {
        localStorage.clear();
        setCampgroundsByAreas({});
        const siteData = await fetchCampgrounds(
            sites,
            settings,
            (current, total) => {
                setProgressBarData(prev => ({
                    ...prev,
                    currentCall: current,
                    totalCalls: total,
                    progress: total > 0 ? current / total : 0,
                }));
            }
        );
        setCampgroundsData(siteData);
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <SiteSettings.Provider value={settings}>
                <ProgressBar.Provider value={progressBarData}>
                    {progressBarData?.progress < 1 && <ProgressBarEl />}
                    <Container
                        maxWidth="xl"
                        sx={{ padding: "20px" }}
                    >
                        <Container
                            maxWidth="xl"
                            disableGutters
                            sx={{ paddingBottom: "10px" }}
                        >
                            <Button
                                sx={{ justifySelf: "center" }}
                                color="primary"
                                variant="contained"
                                onClick={refreshData}
                            >
                                Refresh
                            </Button>
                        </Container>
                        <Grid spacing={1} sx={{ justifyContent: "center" }}>
                            <CampgroundsGroups
                                groups={campgroundsByAreas}
                                settings={settings}
                            />
                        </Grid>
                    </Container>
                </ProgressBar.Provider>
            </SiteSettings.Provider>
        </ThemeProvider>
    );
};