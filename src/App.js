import { useEffect, useMemo, useState } from 'react';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from './theme';

import { siteData } from './json/siteData';

import SiteSettings from './context/SiteSettingsContext';
import { getSitewideDefaultSettings } from './constants/settings';

import ProgressBar from './context/ProgressBarContext';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Typography from '@mui/material/Typography';

import { sites as defaultSites, getCampgroundOptions } from './json/sites';
import { fetchCampgrounds, clearCampgroundCache } from './calls/fetchCampgroundData';

import { CampgroundsGroups } from './components/CampgroundsGroups';
import { ProgressBarEl } from './components/ProgressBarEl';
import { formatGroupsByFavorites } from './utils/utils';
import { TopBar } from './components/TopBar';
import { SiteConfigDialog } from './components/SiteConfigDialog';
import { NotificationSubscribe } from './components/NotificationSubscribe';

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
    },
    appearance: {
        mode: 'light',
    },
    dev: {
        useMockData: false,
    }
};
const settingsObject = getSitewideDefaultSettings(settingsOverrides);
const USER_SITES_STORAGE_KEY = 'campsites-react-user-sites';
const USER_GLOBAL_SETTINGS_KEY = 'campsites-react-global-settings';
const COLOR_MODE_STORAGE_KEY = 'campgrounds-color-mode';
const catalogOptions = getCampgroundOptions();

const cloneSitesConfig = (config) => JSON.parse(JSON.stringify(config));

const getInitialGlobalSettings = () => {
    const defaults = {
        stayLengths: settingsObject?.dates?.stayLengths ?? [2, 3, 4, 5],
        validStartDays: settingsObject?.dates?.validStartDays ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    };
    if (typeof window === 'undefined') return defaults;
    try {
        const stored = localStorage.getItem(USER_GLOBAL_SETTINGS_KEY);
        if (stored) {
            return { ...defaults, ...JSON.parse(stored) };
        }
    } catch {
        // ignore parse errors
    }
    return defaults;
};

const getInitialColorMode = () => {
    if (typeof window === 'undefined') {
        return settingsObject?.appearance?.mode ?? 'light';
    }
    try {
        return localStorage.getItem(COLOR_MODE_STORAGE_KEY) ?? settingsObject?.appearance?.mode ?? 'light';
    } catch {
        return settingsObject?.appearance?.mode ?? 'light';
    }
};

export default function App() {
    const [globalSettings, setGlobalSettings] = useState(getInitialGlobalSettings);
    const [progressBarData, setProgressBarData] = useState({
        totalCalls: 0,
        currentCall: 0,
        progress: 0,
    });
    const [useMockData, setUseMockData] = useState(settingsObject?.dev?.useMockData ?? false);
    const [siteConfig, setSiteConfig] = useState(() => cloneSitesConfig(defaultSites));
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [colorMode, setColorMode] = useState(getInitialColorMode);

    const settings = useMemo(() => {
        if (!settingsObject) return {};
        return {
            ...settingsObject,
            dates: {
                ...settingsObject.dates,
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
            },
        };
    }, [globalSettings]);

    const theme = useMemo(() => createAppTheme(colorMode), [colorMode]);

    const [campgroundsData, setCampgroundsData] = useState({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState([]);
    const [isFetching, setIsFetching] = useState(true);

    const availableSitesByFacility = useMemo(() => {
        const map = {};
        for (const system in campgroundsData) {
            (campgroundsData[system] || []).forEach(campground => {
                if (campground.id && campground.siteAvailability) {
                    const siteNames = Object.values(campground.siteAvailability)
                        .map(site => site.siteName)
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                    map[campground.id] = [...new Set(siteNames)];
                }
            });
        }
        return map;
    }, [campgroundsData]);

    // useEffect(() => {
    //     console.clear();
    // }, []);

    useEffect(() => {
        const storedSites = localStorage.getItem(USER_SITES_STORAGE_KEY);
        if (storedSites) {
            try {
                const parsed = JSON.parse(storedSites);
                // Merge stored config with defaults to get updated dates
                // but preserve user's favorites/worthwhile/showOrHide settings
                for (const system in parsed) {
                    if (defaultSites[system]) {
                        parsed[system] = parsed[system].map(storedCampground => {
                            const defaultCampground = defaultSites[system].find(d => d.id === storedCampground.id);
                            if (defaultCampground) {
                                // Use dates from defaults (code), preserve user's other settings
                                return {
                                    ...storedCampground,
                                    dates: defaultCampground.dates,
                                };
                            }
                            return storedCampground;
                        });
                    }
                }
                console.log('[Config] Merged stored config with default dates');
                setSiteConfig(parsed);
            } catch (error) {
                console.error('Failed to parse stored site configuration', error);
                setSiteConfig(cloneSitesConfig(defaultSites));
            }
        }
    }, []);

    useEffect(() => {
        if (!settings || !siteConfig) return;

        setCampgroundsData({});
        setCampgroundsByAreas([]);
        setIsFetching(true);
        setProgressBarData({
            totalCalls: 0,
            currentCall: 0,
            progress: 0,
        });

        (async () => {
            const siteData = await fetchCampgrounds(
                siteConfig,
                settings,
                (current, total) => {
                    setProgressBarData({
                        currentCall: current,
                        totalCalls: total,
                        progress: total > 0 ? current / total : 0,
                    });
                },
                false,
                { useMockData }
            );
            setCampgroundsData(siteData ?? {});
            setIsFetching(false);
        })();
    }, [settings, useMockData, siteConfig]);

    useEffect(() => {
        if (Object.keys(campgroundsData)?.length > 0) {
            const groupedByFavorites = formatGroupsByFavorites(campgroundsData);
            setCampgroundsByAreas(groupedByFavorites ?? []);
        }
    }, [campgroundsData]);

    useEffect(() => {
        try {
            localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
        } catch {
            // ignore storage issues
        }
    }, [colorMode]);

    const refreshData = async () => {
        const storedSites = localStorage.getItem(USER_SITES_STORAGE_KEY);
        localStorage.clear();
        if (storedSites) {
            localStorage.setItem(USER_SITES_STORAGE_KEY, storedSites);
        }
        setCampgroundsByAreas([]);
        setCampgroundsData({});
        setIsFetching(true);
        setProgressBarData({
            totalCalls: 0,
            currentCall: 0,
            progress: 0,
        });
        const siteData = await fetchCampgrounds(
            siteConfig,
            settings,
            (current, total) => {
                setProgressBarData({
                    currentCall: current,
                    totalCalls: total,
                    progress: total > 0 ? current / total : 0,
                });
            },
            false,
            { useMockData }
        );
        setCampgroundsData(siteData ?? {});
        setIsFetching(false);
    };
    const isLoading = isFetching;

    const handleMockToggle = (event) => {
        setUseMockData(event.target.checked);
    };
    const handleOpenConfigDialog = () => setIsConfigDialogOpen(true);
    const handleCloseConfigDialog = () => setIsConfigDialogOpen(false);
    const handleColorModeChange = (_event, nextMode) => {
        if (nextMode) {
            setColorMode(nextMode);
        }
    };

    const handleSaveSitesConfig = (newConfig, newGlobalSettings) => {
        // Clear cache so new settings take effect immediately
        clearCampgroundCache();
        const cloned = cloneSitesConfig(newConfig);
        setSiteConfig(cloned);
        try {
            localStorage.setItem(USER_SITES_STORAGE_KEY, JSON.stringify(cloned));
        } catch (error) {
            console.error('Failed to store custom site configuration', error);
        }
        if (newGlobalSettings) {
            setGlobalSettings(newGlobalSettings);
            try {
                localStorage.setItem(USER_GLOBAL_SETTINGS_KEY, JSON.stringify(newGlobalSettings));
            } catch (error) {
                console.error('Failed to store global settings', error);
            }
        }
        setIsConfigDialogOpen(false);
    };

    const handleResetSitesConfig = () => {
        // Clear cache so default settings take effect immediately
        clearCampgroundCache();
        localStorage.removeItem(USER_SITES_STORAGE_KEY);
        localStorage.removeItem(USER_GLOBAL_SETTINGS_KEY);
        setSiteConfig(cloneSitesConfig(defaultSites));
        setGlobalSettings(getInitialGlobalSettings());
        setIsConfigDialogOpen(false);
    };

    const topBarMenuItems = [
        {
            type: 'toggle',
            label: 'Use mock data',
            checked: useMockData,
            onChange: handleMockToggle,
        },
        {
            label: 'Configure Sites',
            action: handleOpenConfigDialog,
        },
        {
            label: isLoading ? 'Refreshing…' : 'Refresh data',
            action: () => {
                refreshData();
            },
            disabled: isLoading,
        },
        {
            label: 'Clear cache',
            action: () => {
                clearCampgroundCache();
                refreshData();
            },
            disabled: isLoading,
        },
    ];

    const topBarActions = null;

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <SiteSettings.Provider value={settings}>
                <ProgressBar.Provider value={progressBarData}>
                    <TopBar
                        title={siteData.name ?? ''}
                        subtitle={siteData.tagline ?? ''}
                        logo={{ src: '/images/logos/CampWatch_Logo_trimmed.png', alt: 'Camp Watch logo', height: 36 }}
                        menuItems={topBarMenuItems}
                        isRefreshing={isLoading}
                        actionItems={topBarActions}
                    />
                    {progressBarData?.progress < 1 && <ProgressBarEl />}
                    <Container
                        maxWidth="xl"
                        sx={{ padding: "20px" }}
                    >
                        <Grid spacing={1} sx={{ justifyContent: "center" }}>
                            <CampgroundsGroups
                                campgrounds={campgroundsByAreas}
                                settings={settings}
                                isLoading={isLoading}
                            />
                        </Grid>
                        <Box
                            component="footer"
                            sx={{
                                mt: 4,
                                pt: 2,
                                borderTop: theme => `1px solid ${theme.palette.divider}`,
                            }}
                        >
                            <Stack spacing={2}>
                                <NotificationSubscribe />
                                <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    spacing={1.5}
                                    justifyContent="space-between"
                                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                                >
                                    <Typography variant="body2" color="text.secondary">
                                        {useMockData ? 'Mock Recreation.gov data' : 'Live Recreation.gov data'}
                                    </Typography>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="caption" color="text.secondary">
                                            Color mode
                                        </Typography>
                                        <ToggleButtonGroup
                                            size="small"
                                            exclusive
                                            value={colorMode}
                                            onChange={handleColorModeChange}
                                            color="primary"
                                        >
                                            <ToggleButton value="light">Light</ToggleButton>
                                            <ToggleButton value="dark">Dark</ToggleButton>
                                        </ToggleButtonGroup>
                                    </Stack>
                                </Stack>
                            </Stack>
                        </Box>
                    </Container>
                </ProgressBar.Provider>
            </SiteSettings.Provider>
            <SiteConfigDialog
                open={isConfigDialogOpen}
                onClose={handleCloseConfigDialog}
                onSave={handleSaveSitesConfig}
                onResetToDefaults={handleResetSitesConfig}
                initialData={siteConfig}
                catalogOptions={catalogOptions}
                globalSettings={globalSettings}
                availableSites={availableSitesByFacility}
            />
        </ThemeProvider>
    );
};
