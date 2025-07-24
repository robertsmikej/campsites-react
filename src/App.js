import './App.css';

import { useEffect, useState } from 'react';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

import { sites } from './json/sites';
import { fetchCampgrounds } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import { formatGroups, formatRows } from './utils/tables/formatRows';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';

export default function App() {

    const [settings] = useState({
        startDate: '2025-08-01',
        endDate: '2025-10-01',
        stayLengths: [2, 3, 4],
        show: {
            all: false,
            favorites: true,
            worthwhile: true,
            allOthers: true,
        },
        validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], // Only include stays that start on these days
    });

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
    }, [settings]);

    useEffect(() => {
        if (Object.keys(campgroundsData)?.length > 0) {
            const formattedTableIntoGroups = formatGroups(campgroundsData, true, 'area');
            console.log('formattedTableIntoGroups: ', formattedTableIntoGroups);
            setCampgroundsByAreas(formattedTableIntoGroups);
        }

        // console.log('campgroundsData', campgroundsData);
    }, [campgroundsData]);

    return (
        <Container maxWidth="false" sx={{
            padding: "20px"
        }}>
            <Grid container spacing={2} sx={{
                justifyContent: "center",
                alignItems: "center",
            }}>
                <Grid size="grow">

                </Grid>
                <Grid container size={9} spacing={3}>
                    <CampgroundsGroups
                        groups={campgroundsByAreas}
                        settings={settings}
                    />
                </Grid>
            </Grid>
        </Container>
    );
};