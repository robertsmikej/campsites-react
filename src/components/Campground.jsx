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

const getInitialExpandedState = (campground) => {
    if (!campground?.sitesGroupedByFavorites) return {};
    const campgroundId = getCampgroundStorageId(campground);
    const storedExpandedMap = readMapFromStorage(SECTION_EXPANDED_KEY);
    return Object.keys(campground.sitesGroupedByFavorites || {}).reduce((acc, key) => {
        const saved = storedExpandedMap[campgroundId]?.[key];
        const isHiddenBySetting = !campground.showOrHide?.[key];
        // If hidden by setting, always start collapsed; otherwise use saved state or default to expanded
        acc[key] = isHiddenBySetting ? false : (typeof saved === 'boolean' ? saved : true);
        return acc;
    }, {});
};

const getInitialSectionViews = (campground) => {
    if (!campground) return {};
    const campgroundId = getCampgroundStorageId(campground);
    const storedViewsMap = readMapFromStorage(SECTION_VIEWS_KEY);
    return storedViewsMap[campgroundId] ?? {};
};

export function Campground({ campground: campgroundProp, viewMode }) {
    const siteSettings = useContext(SiteSettings);

    // Initialize state synchronously to avoid flash of wrong expanded state
    const [expandedSections, setExpandedSections] = useState(() => getInitialExpandedState(campgroundProp));
    const [sectionViews, setSectionViews] = useState(() => getInitialSectionViews(campgroundProp));

    // Update state when campgroundProp changes (e.g., settings updated)
    useEffect(() => {
        setExpandedSections(getInitialExpandedState(campgroundProp));
        setSectionViews(getInitialSectionViews(campgroundProp));
    }, [campgroundProp]);

    const effectiveView = useMemo(() => {
        return viewMode ?? siteSettings?.views?.type ?? 'calendar';
    }, [viewMode, siteSettings]);
    const overridesEnabled = effectiveView === 'calendar';


    const getMatchCount = (sites = []) => {
        return sites.reduce((acc, site) => acc + (site.matches?.length ?? 0), 0);
    };

    useEffect(() => {
        const storageId = getCampgroundStorageId(campgroundProp);
        if (!storageId || Object.keys(expandedSections).length === 0) return;
        const stored = readMapFromStorage(SECTION_EXPANDED_KEY);
        stored[storageId] = expandedSections;
        writeMapToStorage(SECTION_EXPANDED_KEY, stored);
    }, [expandedSections, campgroundProp?.id, campgroundProp?.name]);

    useEffect(() => {
        const storageId = getCampgroundStorageId(campgroundProp);
        if (!storageId) return;
        const stored = readMapFromStorage(SECTION_VIEWS_KEY);
        if (Object.keys(sectionViews).length === 0) {
            delete stored[storageId];
        } else {
            stored[storageId] = sectionViews;
        }
        writeMapToStorage(SECTION_VIEWS_KEY, stored);
    }, [sectionViews, campgroundProp?.id, campgroundProp?.name]);

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

    if (!campgroundProp?.sitesGroupedByFavorites) {
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
                    key={`${campgroundProp.name}-${typeIndex}-table`}
                    data={group}
                    site={type}
                    campground={campgroundProp}
                />
            );
        }
        return (
            <CampsitesCalendarParent
                key={`${campgroundProp.name}-${typeIndex}-calendar`}
                data={group}
                type={type}
                campground={campgroundProp}
            />
        );
    };

    return (
        <Stack key={campgroundProp.name} spacing={2}>
            {Object.keys(campgroundProp.sitesGroupedByFavorites).map((type, typeIndex) => {
                const group = campgroundProp.sitesGroupedByFavorites[type];
                const hasPreferenceAvailability = checkForAvailabilityInArray(group);
                if (!hasPreferenceAvailability) {
                    return null;
                }
                const isHiddenBySetting = !campgroundProp.showOrHide?.[type];
                const matchCount = getMatchCount(group);
                // Default to collapsed if hidden by setting, otherwise use stored state or default to expanded
                const expanded = isHiddenBySetting
                    ? (expandedSections[type] ?? false)
                    : (expandedSections[type] ?? hasPreferenceAvailability);
                const sectionView = overridesEnabled ? (sectionViews[type] ?? effectiveView) : effectiveView;
                return (
                    <Card
                        key={campgroundProp.name + typeIndex}
                        variant="outlined"
                    // sx={{ borderRadius: 2, borderColor: expanded ? 'primary.light' : 'divider' }}
                    >
                        <CardHeader
                            title={
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                    <Typography variant='h6'>{type}</Typography>
                                    <Chip size="small" label={`${matchCount} stays available`} color="primary" variant="outlined" />
                                    {isHiddenBySetting && (
                                        <Chip size="small" label="Hidden by settings" color="default" variant="outlined" sx={{ opacity: 0.7 }} />
                                    )}
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
                            sx={{ pb: expanded ? 0.5 : 1.5 }}
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
