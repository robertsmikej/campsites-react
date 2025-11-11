import { useEffect, useState, useContext, useMemo } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';

import { CampsitesTable } from './CampsitesTable';
import { CampsitesCalendarParent } from './CampsitesCalendarParent';
import { checkForAvailabilityInArray } from '../utils/utils';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const SECTION_VIEWS_KEY = 'campground-section-views';
const SECTION_EXPANDED_KEY = 'campground-section-expanded';

const safeParse = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
};

const readMapFromStorage = (key) => {
    if (typeof window === 'undefined') return {};
    return safeParse(localStorage.getItem(key), {});
};

const writeMapToStorage = (key, value) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
};

const getCampgroundStorageId = (campground) => campground?.id ?? campground?.name ?? '';

export function Campground({ campground: campgroundProp, viewMode }) {
    const siteSettings = useContext(SiteSettings);

    const [campground, setCampground] = useState({});
    const [expandedSections, setExpandedSections] = useState({});
    const [sectionViews, setSectionViews] = useState({});

    useEffect(() => {
        setCampground(campgroundProp);
    }, [campgroundProp]);

    useEffect(() => {
        if (!campgroundProp?.sitesGroupedByFavorites) return;
        const campgroundId = getCampgroundStorageId(campgroundProp);
        const storedExpandedMap = readMapFromStorage(SECTION_EXPANDED_KEY);
        const storedViewsMap = readMapFromStorage(SECTION_VIEWS_KEY);

        const initialState = Object.keys(campgroundProp.sitesGroupedByFavorites || {}).reduce((acc, key) => {
            const saved = storedExpandedMap[campgroundId]?.[key];
            acc[key] = typeof saved === 'boolean' ? saved : true;
            return acc;
        }, {});
        setExpandedSections(initialState);
        setSectionViews(storedViewsMap[campgroundId] ?? {});
    }, [campgroundProp]);

    const effectiveView = useMemo(() => {
        return viewMode ?? siteSettings?.views?.type ?? 'calendar';
    }, [viewMode, siteSettings]);
    const overridesEnabled = effectiveView === 'calendar';


    const getMatchCount = (sites = []) => {
        return sites.reduce((acc, site) => acc + (site.matches?.length ?? 0), 0);
    };

    useEffect(() => {
        const storageId = getCampgroundStorageId(campground);
        if (!storageId || Object.keys(expandedSections).length === 0) return;
        const stored = readMapFromStorage(SECTION_EXPANDED_KEY);
        stored[storageId] = expandedSections;
        writeMapToStorage(SECTION_EXPANDED_KEY, stored);
    }, [expandedSections, campground?.id, campground?.name]);

    useEffect(() => {
        const storageId = getCampgroundStorageId(campground);
        if (!storageId) return;
        const stored = readMapFromStorage(SECTION_VIEWS_KEY);
        if (Object.keys(sectionViews).length === 0) {
            delete stored[storageId];
        } else {
            stored[storageId] = sectionViews;
        }
        writeMapToStorage(SECTION_VIEWS_KEY, stored);
    }, [sectionViews, campground?.id, campground?.name]);

    const toggleSection = (type) => () => {
        setExpandedSections(prev => {
            const next = {
                ...prev,
                [type]: !prev?.[type],
            };
            return next;
        });
    };

    const handleSectionViewChange = (type) => (_event, nextView) => {
        if (!nextView) return;
        setSectionViews(prev => ({
            ...prev,
            [type]: nextView,
        }));
    };

    if (!campground?.sitesGroupedByFavorites) {
        return null;
    }

    const renderView = (sectionView, group, typeIndex, type) => {
        if (!group || group.length === 0) {
            return (
                <Stack spacing={1.25}>
                    <Skeleton variant="rectangular" height={48} />
                    <Skeleton variant="rectangular" height={200} />
                </Stack>
            );
        }
        if (sectionView === 'table') {
            return (
                <CampsitesTable
                    key={`${campground.name}-${typeIndex}-table`}
                    data={group}
                    site={type}
                    campground={campground}
                />
            );
        }
        return (
            <CampsitesCalendarParent
                key={`${campground.name}-${typeIndex}-calendar`}
                data={group}
                type={type}
                campground={campground}
            />
        );
    };

    return (
        <Stack key={campground.name} spacing={2}>
            {Object.keys(campground.sitesGroupedByFavorites).map((type, typeIndex) => {
                const group = campground.sitesGroupedByFavorites[type];
                if (!campground.showOrHide[type]) {
                    return null;
                }
                const hasPreferenceAvailability = checkForAvailabilityInArray(group);
                if (!hasPreferenceAvailability) {
                    return null;
                }
                const matchCount = getMatchCount(group);
                const expanded = expandedSections[type] ?? hasPreferenceAvailability;
                const sectionView = overridesEnabled ? (sectionViews[type] ?? effectiveView) : effectiveView;
                return (
                    <Card
                        key={campground.name + typeIndex}
                        variant="outlined"
                    // sx={{ borderRadius: 2, borderColor: expanded ? 'primary.light' : 'divider' }}
                    >
                        <CardHeader
                            title={
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                    <Typography variant='h6'>{type}</Typography>
                                    <Chip size="small" label={`${matchCount} stays available`} color="primary" variant="outlined" />
                                </Stack>
                            }
                            action={
                                <Stack direction="row" spacing={1} alignItems="center">
                                    {overridesEnabled ? (
                                        <ToggleButtonGroup
                                            size="small"
                                            exclusive
                                            value={sectionView}
                                            onChange={handleSectionViewChange(type)}
                                        >
                                            <ToggleButton value="calendar">Calendar</ToggleButton>
                                            <ToggleButton value="table">Table</ToggleButton>
                                        </ToggleButtonGroup>
                                    ) : (
                                        <Chip size="small" label={`View: ${effectiveView}`} variant="outlined" />
                                    )}
                                    <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
                                        <IconButton
                                            onClick={toggleSection(type)}
                                            aria-label={`Toggle ${type}`}
                                            sx={{
                                                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                                transition: 'transform 0.2s ease',
                                            }}
                                            size="small"
                                        >
                                            <ExpandMoreIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            }
                            sx={{ pb: 0.5 }}
                        />
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <CardContent sx={{ pt: 1.5 }}>
                                <Stack spacing={1.5}>
                                    {renderView(sectionView, group, typeIndex, type)}
                                </Stack>
                            </CardContent>
                        </Collapse>
                    </Card>
                );
            })}
        </Stack>
    );
}
