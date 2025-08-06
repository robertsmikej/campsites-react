import './App.css';

import { useEffect, useState } from 'react';

import SiteSettings from './context/SiteSettingsContext';
import { sitewideDefaultSettings } from './constants/settings';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';

import { sites } from './json/sites';
import { fetchCampgrounds } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import { formatGroups, formatGroupsByFavorites } from './utils/tables/formatRows';
import Button from '@mui/material/Button';

//Override default settings here
const settingsOverrides = {
    dates: {
        // startDate: '2025-08-01',
        // endDate: '2025-10-01',
        validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], // Only include stays that start on these days
        // preferredStartDays: ['Thursday', 'Friday', 'Saturday'], //Has to be formatted this way
        stayLengths: [2, 3, 4, 5],
    },
};

export default function App() {
    const [settings, setSettings] = useState(null);

    const [campgroundsData, setCampgroundsData] = useState({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState({});

    useEffect(() => {
        console.clear();
    }, []);

    useEffect(() => {

        const setupSettings = sitewideDefaultSettings(settingsOverrides);
        if (!setupSettings) {
            return;
        }
        setSettings(sitewideDefaultSettings(settingsOverrides));

    }, []);

    // useEffect(() => {
    //     console.log('settings updated', settings)
    // }, [settings]);

    useEffect(() => {
        if (!settings) return;
        (async () => {
            const siteData = await fetchCampgrounds(sites, settings);
            console.log('siteData: ', siteData);
            setCampgroundsData(siteData);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (Object.keys(campgroundsData)?.length > 0) {
            const groupedByFavorites = formatGroupsByFavorites(campgroundsData);
            const formattedTableIntoGroups = formatGroups(groupedByFavorites, true, 'area');
            setCampgroundsByAreas(formattedTableIntoGroups);
        }
    }, [campgroundsData]);

    const refreshData = async () => {
        localStorage.clear();
        setSettings(sitewideDefaultSettings(settingsOverrides));
        const siteData = await fetchCampgrounds(sites, settings);
        setCampgroundsData(siteData);
    };

    return (
        <SiteSettings.Provider value={settings}>
            <Container
                maxWidth="xl"
                sx={{
                    padding: "20px"
                }}
            >
                <Container
                    maxWidth="xl"
                    disableGutters
                    sx={{
                        paddingBottom: "10px"
                    }}
                >
                    <Button
                        sx={{
                            justifySelf: "center",
                        }}
                        color="primary"
                        variant="contained"
                        onClick={refreshData}
                    >
                        Refresh
                    </Button>
                </Container>
                <Grid spacing={1} sx={{
                    justifyContent: "center",
                }}>
                    <CampgroundsGroups
                        groups={campgroundsByAreas}
                        settings={settings}
                    />
                </Grid>
            </Container>
        </SiteSettings.Provider >
    );
};