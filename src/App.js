import './App.css';

import { useEffect, useState } from 'react';

import SiteSettings from './context/SiteSettingsContext';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';

import { sites } from './json/sites';
import { fetchCampgrounds } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import { formatGroups, formatGroupsByFavorites } from './utils/tables/formatRows';
import Button from '@mui/material/Button';

const settings = {
    dates: {
        startDate: '2025-08-01',
        endDate: '2025-10-01',
        validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], // Only include stays that start on these days
        preferredStartDays: ['Thurs', 'Fri', 'Sat'], //Has to be formatted this way
        stayLengths: [2, 3, 4, 5],
    },
    showOrHideOverride: {
        'Favorites': true,
        'Worthwhile': true,
        'All Others': true,
    },
    ignoreTypes: ['GROUP SHELTER NONELECTRIC', 'WALK TO', 'DAY USE'],
};

export default function App() {
    const [campgroundsData, setCampgroundsData] = useState({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState({});

    useEffect(() => {
        console.clear();
    }, []);

    useEffect(() => {
        (async () => {
            const siteData = await fetchCampgrounds(sites, settings);
            setCampgroundsData(siteData);
        })();
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
        const siteData = await fetchCampgrounds(sites, settings);
        setCampgroundsData(siteData);
    };

    return (
        <SiteSettings.Provider value={settings}>
            <Container
                maxWidth="false"
                sx={{
                    padding: "20px"
                }}
            >
                <Container>
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