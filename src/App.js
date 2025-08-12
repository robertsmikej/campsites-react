import { useEffect, useState } from 'react';

import SiteSettings from './context/SiteSettingsContext';
import { sitewideDefaultSettings } from './constants/settings';

import ProgressBar from './context/ProgressBarContext';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';


import { sites } from './json/sites';
import { fetchCampgrounds, getAllCallsNeeded, getSiteFetchMap } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import { formatGroups, formatGroupsByFavorites } from './utils/tables/formatRows';
import Button from '@mui/material/Button';
import { ProgressBarEl } from './components/ProgressBarEl';
import { getTotalGroups } from './utils/utils';

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
    const [progressBarData, setProgressBarData] = useState({
        totalCalls: 0,
        currentCall: 0,
        progress: 0,
    });

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

    useEffect(() => {
        //This useEffect is just to set the # of calls that need to be made when gathering data
        const totalCallsToBeMade = getSiteFetchMap(sites, settings);
        if (totalCallsToBeMade?.length > 0) {
            setProgressBarData({
                ...progressBarData,
                totalCalls: totalCallsToBeMade.length
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        //IF Nothing loads on first load, this settings check is the issue, we need to provide 'default' dates, need to build that in
        if (!settings) return;
        setCampgroundsByAreas({});
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // useEffect(() => {
    //     if (!progressBarData) return;
    //     console.log('progressBarData: ', progressBarData);
    // }, [progressBarData]);

    useEffect(() => {
        if (Object.keys(campgroundsData)?.length > 0) {
            const groupedByFavorites = formatGroupsByFavorites(campgroundsData);
            const formattedTableIntoGroups = formatGroups(groupedByFavorites, true, 'area');
            setCampgroundsByAreas(formattedTableIntoGroups);
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
        <SiteSettings.Provider value={settings}>
            <ProgressBar.Provider value={progressBarData}>
                {progressBarData?.progress < 1 && <ProgressBarEl />}
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
            </ProgressBar.Provider>
        </SiteSettings.Provider>
    );
};