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
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

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
const USE_LOCAL_CONFIG_KEY = 'campsites-react-use-local-config';
const catalogOptions = getCampgroundOptions();

const cloneSitesConfig = (config) => JSON.parse(JSON.stringify(config));

const fetchRemoteConfig = async () => {
    const configKey = process.env.REACT_APP_CONFIG_KEY || '';
    const headers = {};
    if (configKey) {
        headers['Authorization'] = `Bearer ${configKey}`;
    }
    try {
        const response = await fetch('/api/config', { headers });
        if (!response.ok) {
            if (response.status !== 404) {
                console.error(`[Config Load] API returned ${response.status}`);
            }
            return null;
        }
        const data = await response.json();
        if (!data?.campgrounds) return null;
        return data;
    } catch (error) {
        console.error('[Config Load] Failed:', error.message);
        return null;
    }
};

const syncConfigToApi = async (campgroundConfig, globalSettings) => {
    const configKey = process.env.REACT_APP_CONFIG_KEY || '';
    const headers = { 'Content-Type': 'application/json' };
    if (configKey) {
        headers['Authorization'] = `Bearer ${configKey}`;
    }
    try {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                campgrounds: campgroundConfig,
                globalSettings: globalSettings || {},
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[Config Sync] API returned ${response.status}: ${text}`);
            return { ok: false };
        }
        console.log('[Config Sync] Synced to notification API');
        return { ok: true };
    } catch (error) {
        console.error('[Config Sync] Failed:', error.message);
        return { ok: false };
    }
};

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

const getInitialUseLocalConfig = () => {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(USE_LOCAL_CONFIG_KEY) === 'true';
    } catch {
        return false;
    }
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
    const [syncStatus, setSyncStatus] = useState(null); // 'success' | 'error' | null
    const [useLocalConfig, setUseLocalConfig] = useState(getInitialUseLocalConfig);
    const [isConfigHydrating, setIsConfigHydrating] = useState(true);

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
        let cancelled = false;

        const loadFromLocalStorage = () => {
            const storedSites = localStorage.getItem(USER_SITES_STORAGE_KEY);
            if (!storedSites) return false;
            try {
                const parsed = JSON.parse(storedSites);
                if (cancelled) return true;
                setSiteConfig(parsed);
                return true;
            } catch (error) {
                console.error('Failed to parse stored site configuration', error);
                return false;
            }
        };

        const hydrate = async () => {
            setIsConfigHydrating(true);

            if (useLocalConfig) {
                loadFromLocalStorage();
                if (!cancelled) setIsConfigHydrating(false);
                return;
            }

            const remote = await fetchRemoteConfig();
            if (cancelled) return;

            if (remote?.campgrounds) {
                setSiteConfig(remote.campgrounds);
                if (remote.globalSettings && Object.keys(remote.globalSettings).length > 0) {
                    setGlobalSettings(prev => ({ ...prev, ...remote.globalSettings }));
                }
                console.log('[Config] Hydrated from shared KV config');
            } else if (!loadFromLocalStorage()) {
                console.log('[Config] Using static defaults');
            }
            if (!cancelled) setIsConfigHydrating(false);
        };

        hydrate();
        return () => {
            cancelled = true;
        };
    }, [useLocalConfig]);

    useEffect(() => {
        if (!settings || !siteConfig) return;
        if (isConfigHydrating) return;

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
    }, [settings, useMockData, siteConfig, isConfigHydrating]);

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

        // Fire-and-forget sync to shared KV config (skipped when this device is in local-only mode)
        if (!useLocalConfig) {
            syncConfigToApi(cloned, newGlobalSettings || globalSettings).then(({ ok, skipped }) => {
                if (skipped) return;
                setSyncStatus(ok ? 'success' : 'error');
            });
        }
    };

    const handleResetSitesConfig = () => {
        // Clear cache so default settings take effect immediately
        clearCampgroundCache();
        localStorage.removeItem(USER_SITES_STORAGE_KEY);
        localStorage.removeItem(USER_GLOBAL_SETTINGS_KEY);
        const defaults = cloneSitesConfig(defaultSites);
        const defaultGlobal = getInitialGlobalSettings();
        setSiteConfig(defaults);
        setGlobalSettings(defaultGlobal);
        setIsConfigDialogOpen(false);

        // Sync defaults to shared KV config (skipped when this device is in local-only mode)
        if (!useLocalConfig) {
            syncConfigToApi(defaults, defaultGlobal).then(({ ok, skipped }) => {
                if (skipped) return;
                setSyncStatus(ok ? 'success' : 'error');
            });
        }
    };

    const handleToggleUseLocalConfig = (event) => {
        const next = !!event.target.checked;
        setUseLocalConfig(next);
        try {
            localStorage.setItem(USE_LOCAL_CONFIG_KEY, String(next));
        } catch (error) {
            console.error('Failed to persist local-config preference', error);
        }
        // The hydration effect re-runs on useLocalConfig change and will re-fetch
        // from KV when switching back to shared mode.
    };

    const topBarMenuItems = [
        {
            type: 'toggle',
            label: 'Use mock data',
            checked: useMockData,
            onChange: handleMockToggle,
        },
        {
            type: 'toggle',
            label: 'Use my own settings (this device only)',
            checked: useLocalConfig,
            onChange: handleToggleUseLocalConfig,
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
            <Snackbar
                open={syncStatus !== null}
                autoHideDuration={4000}
                onClose={() => setSyncStatus(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    severity={syncStatus === 'success' ? 'success' : 'warning'}
                    onClose={() => setSyncStatus(null)}
                    variant="filled"
                >
                    {syncStatus === 'success'
                        ? 'Settings synced to notifications'
                        : 'Settings saved locally but failed to sync to notifications'}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
};
