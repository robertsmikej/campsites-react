import { useEffect, useRef, useState, useCallback } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MapIcon from '@mui/icons-material/Map';
import TableChartIcon from '@mui/icons-material/TableChart';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { checkForGroupedAvailability } from '../utils/utils';
import { Campground } from './Campground';

const VIEW_MODE_STORAGE_KEY = 'campgrounds-view-mode';
const EXPANDED_GROUPS_STORAGE_KEY = 'campgrounds-expanded-groups';
const ALL_CAMPGROUNDS_KEY = 'all-campgrounds';

const safeParse = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
};

const readObjectFromStorage = (key, fallback = {}) => {
    if (typeof window === 'undefined') return fallback;
    return safeParse(localStorage.getItem(key), fallback);
};

const writeObjectToStorage = (key, value) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
};

export function CampgroundsGroups({ isLoading = false, ...props }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const storedViewRef = useRef(readObjectFromStorage(VIEW_MODE_STORAGE_KEY, null));
    const shouldSkipSettingsOverrideRef = useRef(storedViewRef.current !== null);

    const [campgrounds, setCampgrounds] = useState([]);
    const [viewMode, setViewMode] = useState(() => storedViewRef.current ?? props.settings?.views?.type ?? 'calendar');
    const [expandedCampgrounds, setExpandedCampgrounds] = useState(() => readObjectFromStorage(EXPANDED_GROUPS_STORAGE_KEY, {}));
    const [imagePreview, setImagePreview] = useState({ open: false, src: '', alt: '' });
    const [showExcludedMap, setShowExcludedMap] = useState({});

    // useEffect(() => {
    //     // console.log('props: ', props);
    // }, [props]);

    useEffect(() => {
        const flattenedCampgrounds = Array.isArray(props.campgrounds)
            ? props.campgrounds.filter(Boolean)
            : Object.values(props.campgrounds ?? {}).flat();
        setCampgrounds(flattenedCampgrounds);
        setExpandedCampgrounds(prev => {
            const next = { ...prev };
            const availableIds = flattenedCampgrounds
                .map(campground => (checkForGroupedAvailability(campground) ? getCampgroundId(campground) : null))
                .filter(id => id !== null);
            const existing = next[ALL_CAMPGROUNDS_KEY];
            if (!Array.isArray(existing) || existing.length === 0) {
                next[ALL_CAMPGROUNDS_KEY] = availableIds;
            } else {
                const cleaned = existing.filter(id => availableIds.includes(id));
                availableIds.forEach(id => {
                    if (!cleaned.includes(id)) {
                        cleaned.push(id);
                    }
                });
                next[ALL_CAMPGROUNDS_KEY] = cleaned;
            }
            return next;
        });
    }, [props.campgrounds]);

    useEffect(() => {
        if (!props.settings?.views?.type) return;
        if (shouldSkipSettingsOverrideRef.current) {
            shouldSkipSettingsOverrideRef.current = false;
            return;
        }
        setViewMode(props.settings.views.type);
    }, [props.settings?.views?.type]);

    const handleViewModeChange = (_event, nextView) => {
        if (nextView) {
            shouldSkipSettingsOverrideRef.current = false;
            storedViewRef.current = nextView;
            setViewMode(nextView);
        }
    };

    useEffect(() => {
        writeObjectToStorage(VIEW_MODE_STORAGE_KEY, viewMode);
    }, [viewMode]);

    useEffect(() => {
        writeObjectToStorage(EXPANDED_GROUPS_STORAGE_KEY, expandedCampgrounds);
    }, [expandedCampgrounds]);

    const isCampgroundExpanded = (groupKey, campgroundId, defaultExpanded = true) => {
        const expandedList = expandedCampgrounds[groupKey];
        if (!expandedList) {
            return defaultExpanded;
        }
        return expandedList.includes(campgroundId);
    };

    const toggleCampground = (groupKey, campgroundId) => (_event, expanded) => {
        setExpandedCampgrounds(prev => {
            const current = new Set(prev[groupKey] ?? []);
            if (expanded) {
                current.add(campgroundId);
            } else {
                current.delete(campgroundId);
            }
            return {
                ...prev,
                [groupKey]: Array.from(current),
            };
        });
    };

    const expandAllForGroup = (groupKey, campgroundsList) => {
        const ids = campgroundsList
            .map((campground) => (checkForGroupedAvailability(campground) ? getCampgroundId(campground) : null))
            .filter(id => id !== null);
        setExpandedCampgrounds(prev => ({
            ...prev,
            [groupKey]: ids,
        }));
    };

    const collapseAllForGroup = (groupKey) => {
        setExpandedCampgrounds(prev => ({
            ...prev,
            [groupKey]: [],
        }));
    };

    const handleImageOpen = (src, alt) => () => setImagePreview({ open: true, src, alt });
    const handleImageClose = () => setImagePreview({ open: false, src: '', alt: '' });

    const getCampgroundId = (campground) => campground?.id ?? campground?.name ?? `${campground?.area ?? 'camp'}-${campground?.description ?? ''}`;

    const getCampgroundUrl = (campground) => {
        if (campground.type === 'cabin') {
            return `https://www.recreation.gov/camping/campgrounds/${campground.id}`;
        }
        return `https://www.recreation.gov/camping/campgrounds/${campground.id}`;
    };

    const getCampgroundStats = (campground) => {
        const grouped = campground.sitesGroupedByFavorites ?? {};
        let totalMatches = 0;
        let favoriteMatches = 0;
        let totalExcluded = 0;
        Object.entries(grouped).forEach(([label, sites]) => {
            sites.forEach(site => {
                const matches = site.matches ?? [];
                totalMatches += matches.length;
                if (label === 'Favorites') {
                    favoriteMatches += matches.length;
                }
                totalExcluded += site.excludedMatches?.length ?? 0;
            });
        });
        return {
            totalMatches,
            favoriteMatches,
            totalExcluded,
        };
    };

    const toggleShowExcluded = (campgroundId) => (event) => {
        event.stopPropagation();
        const turningOn = !showExcludedMap[campgroundId];
        setShowExcludedMap(prev => ({
            ...prev,
            [campgroundId]: turningOn,
        }));
        // When toggling excluded ON, ensure this campground's accordion is expanded
        if (turningOn) {
            setExpandedCampgrounds(prev => {
                const current = new Set(prev[ALL_CAMPGROUNDS_KEY] ?? []);
                current.add(campgroundId);
                return { ...prev, [ALL_CAMPGROUNDS_KEY]: Array.from(current) };
            });
        }
    };

    const availableCampgroundCount = campgrounds.filter(checkForGroupedAvailability).length;

    const renderCampgroundCard = useCallback((campground, campgroundIndex) => {
        const hasCampgroundAvailability = checkForGroupedAvailability(campground);
        const campgroundImage = campground.image?.length > 0 ? '/images/sites/' + campground.image : '/images/sites/bg_default.jpg';
        const stats = getCampgroundStats(campground);
        const campgroundId = getCampgroundId(campground);
        const showingExcluded = !!showExcludedMap[campgroundId];
        const hasExcludedData = showingExcluded && stats.totalExcluded > 0;
        const isExpandable = hasCampgroundAvailability || hasExcludedData;
        const expanded = isExpandable && isCampgroundExpanded(ALL_CAMPGROUNDS_KEY, campgroundId, isExpandable);
        return (
            <Box
                key={`${campground.name}-${campgroundIndex}`}
            >
                <Accordion
                    expanded={expanded}
                    onChange={isExpandable ? toggleCampground(ALL_CAMPGROUNDS_KEY, campgroundId) : undefined}
                    disableGutters
                    sx={{
                        border: theme => `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        // overflow: 'visible',
                        '&::before': { display: 'none' },
                        '& .MuiCollapse-root': { overflow: 'visible !important' },
                        '& .MuiCollapse-wrapper': { overflow: 'visible' },
                        '& .MuiCollapse-wrapperInner': { overflow: 'visible' },
                    }}
                >
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{
                            px: 1.5,
                            py: 1,
                            position: 'sticky',
                            top: { xs: 60, sm: 64 },
                            zIndex: 2,
                            borderRadius: expanded ? '6px 6px 0 0' : 1,
                            borderBottom: expanded ? theme => `1px solid ${theme.palette.divider}` : 'none',
                            backgroundColor: isExpandable
                                ? 'background.paper'
                                : 'action.disabledBackground',
                        }}
                    >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                            <Stack spacing={1} sx={{ flexGrow: 1 }}>
                                <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    spacing={1}
                                    alignItems={{ xs: 'flex-start' }}
                                    justifyContent={'space-between'}
                                >
                                    <Stack spacing={0}>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography variant='h5'>{campground.name}</Typography>
                                            <Tooltip title="View on recreation.gov">
                                                <Box
                                                    component="a"
                                                    href={getCampgroundUrl(campground)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    sx={{ display: 'inline-flex', color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                                                >
                                                    <OpenInNewIcon sx={{ fontSize: '0.9rem' }} />
                                                </Box>
                                            </Tooltip>
                                        </Stack>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', letterSpacing: 0.5 }}>
                                            ID: {campground.id}
                                        </Typography>
                                    </Stack>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems={'center'}
                                        justifyContent={'space-between'}
                                        sx={{ flex: 1 }}
                                    >
                                        {!hasCampgroundAvailability ? (
                                            <Chip
                                                label="No availability"
                                                size="small"
                                                color="warning"
                                                variant="filled"
                                            />
                                        ) : (
                                            <span />
                                        )}
                                        <Stack direction="row" spacing={0.5}>
                                            {campground.notifyAll && (
                                                <Chip
                                                    label="Notify all"
                                                    size="small"
                                                    color="info"
                                                    variant="outlined"
                                                />
                                            )}
                                            <Chip
                                                label={campground.area}
                                                size="small"
                                                color="secondary"
                                                variant="outlined"
                                                sx={{ backgroundColor: 'white' }}
                                            />
                                        </Stack>
                                    </Stack>
                                </Stack>
                                <Typography variant='body2' color="text.secondary">
                                    {campground.description}
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                        label={`Total matches: ${stats.totalMatches}`}
                                        size="small"
                                    />
                                    <Chip
                                        label={`Favorites: ${stats.favoriteMatches}`}
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                    />
                                    {stats.totalExcluded > 0 && (
                                        <Chip
                                            label={showExcludedMap[campgroundId] ? `Hide ${stats.totalExcluded} excluded` : `Show ${stats.totalExcluded} excluded`}
                                            size="small"
                                            color="info"
                                            variant={showExcludedMap[campgroundId] ? 'filled' : 'outlined'}
                                            onClick={toggleShowExcluded(campgroundId)}
                                            sx={{ cursor: 'pointer' }}
                                        />
                                    )}
                                    {campground.validStartDays && campground.validStartDays.length < 7 && (
                                        <Tooltip title={`Only showing stays starting on: ${campground.validStartDays.join(', ')}`}>
                                            <Chip
                                                label={campground.validStartDays.map(d => d.slice(0, 3)).join(', ')}
                                                size="small"
                                                variant="outlined"
                                                sx={{ fontSize: '0.7rem' }}
                                            />
                                        </Tooltip>
                                    )}
                                    {campground.stayLengths && (
                                        <Tooltip title={`Custom stay length: ${Math.min(...campground.stayLengths)}–${Math.max(...campground.stayLengths)} nights`}>
                                            <Chip
                                                label={`${Math.min(...campground.stayLengths)}–${Math.max(...campground.stayLengths)}n`}
                                                size="small"
                                                variant="outlined"
                                                sx={{ fontSize: '0.7rem' }}
                                            />
                                        </Tooltip>
                                    )}
                                </Stack>
                            </Stack>
                            <Tooltip title="View map">
                                <Box
                                    component="img"
                                    src={campgroundImage}
                                    alt={campground.name}
                                    loading="lazy"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleImageOpen(campgroundImage, campground.name)();
                                    }}
                                    sx={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: 1.5,
                                        border: theme => `1px solid ${theme.palette.divider}`,
                                        objectFit: 'cover',
                                        display: { xs: 'none', md: 'block' },
                                        cursor: 'pointer',
                                    }}
                                />
                            </Tooltip>
                        </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 1.2, pb: 1.25 }}>
                        <Box
                            component="img"
                            src={campgroundImage}
                            alt={campground.name}
                            loading="lazy"
                            onClick={(event) => {
                                event.stopPropagation();
                                handleImageOpen(campgroundImage, campground.name)();
                            }}
                            sx={{
                                width: '100%',
                                height: 120,
                                borderRadius: 1.5,
                                border: theme => `1px solid ${theme.palette.divider}`,
                                objectFit: 'cover',
                                mb: 1.5,
                                display: { xs: 'block', md: 'none' },
                                cursor: 'pointer',
                            }}
                        />
                        <Campground
                            key={`${campground.name}-${viewMode}-${!!showExcludedMap[campgroundId]}`}
                            campground={campground}
                            viewMode={viewMode}
                            showExcluded={!!showExcludedMap[campgroundId]}
                        />
                    </AccordionDetails>
                </Accordion>
            </Box>
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campgrounds, expandedCampgrounds, showExcludedMap, viewMode]);

    return (
        <Stack spacing={3}>
            <Stack direction="row" justifyContent="flex-end">
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={viewMode}
                    onChange={handleViewModeChange}
                    color="primary"
                >
                    <ToggleButton value="calendar">
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <MapIcon fontSize="small" />
                            <Typography variant="caption">Calendar</Typography>
                        </Stack>
                    </ToggleButton>
                    <ToggleButton value="table">
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <TableChartIcon fontSize="small" />
                            <Typography variant="caption">Table</Typography>
                        </Stack>
                    </ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            {campgrounds.length === 0 ? (
                <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
                    {isLoading ? (
                        <Stack spacing={2}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <CircularProgress size={20} />
                                <Typography variant="body1">Loading campgrounds...</Typography>
                            </Stack>
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 1.5 }} />
                            ))}
                        </Stack>
                    ) : (
                        <Typography variant="body1">No campgrounds configured yet.</Typography>
                    )}
                </Paper>
            ) : (
                <Paper
                    variant="outlined"
                    sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}
                >
                    <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems="flex-start">
                            <Stack spacing={0.5}>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Typography variant='h3'>Campgrounds</Typography>
                                    {isLoading && <CircularProgress size={18} />}
                                </Stack>
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                    <Chip
                                        label={`Total Checked: ${campgrounds.length}`}
                                        variant="outlined"
                                        size="small"
                                    />
                                    <Chip
                                        label={`With Availability: ${availableCampgroundCount}`}
                                        color={availableCampgroundCount > 0 ? 'success' : 'default'}
                                        variant="outlined"
                                        size="small"
                                    />
                                </Stack>
                            </Stack>
                            {viewMode === 'calendar' && (
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        onClick={() => expandAllForGroup(ALL_CAMPGROUNDS_KEY, campgrounds)}
                                    >
                                        Expand all
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() => collapseAllForGroup(ALL_CAMPGROUNDS_KEY)}
                                    >
                                        Collapse all
                                    </Button>
                                </Stack>
                            )}
                        </Stack>
                        <Divider />
                        {viewMode === 'calendar' && (
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'green' }} />
                                    <Typography variant="caption" color="text.secondary">Matches filters</Typography>
                                </Stack>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#a5d6a7' }} />
                                    <Typography variant="caption" color="text.secondary">Available (wrong start day)</Typography>
                                </Stack>
                                {Object.values(showExcludedMap).some(Boolean) && (
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#e67e22' }} />
                                        <Typography variant="caption" color="text.secondary">Excluded</Typography>
                                    </Stack>
                                )}
                            </Stack>
                        )}
                        {viewMode === 'calendar' ? (
                            isDesktop ? (
                                <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                                    <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                                        {campgrounds.filter((_, i) => i % 2 === 0).map((campground, i) =>
                                            renderCampgroundCard(campground, i * 2)
                                        )}
                                    </Stack>
                                    <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                                        {campgrounds.filter((_, i) => i % 2 === 1).map((campground, i) =>
                                            renderCampgroundCard(campground, i * 2 + 1)
                                        )}
                                    </Stack>
                                </Stack>
                            ) : (
                                <Stack spacing={2}>
                                    {campgrounds.map((campground, i) => renderCampgroundCard(campground, i))}
                                </Stack>
                            )
                        ) : (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Campground</TableCell>
                                            <TableCell>Matches</TableCell>
                                            <TableCell>Favorites</TableCell>
                                            <TableCell>Excluded</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {campgrounds.map((campground) => {
                                            const campgroundId = getCampgroundId(campground);
                                            const stats = getCampgroundStats(campground);
                                            const hasCampgroundAvailability = checkForGroupedAvailability(campground);
                                            return (
                                                <TableRow
                                                    hover
                                                    key={campgroundId}
                                                >
                                                    <TableCell>
                                                        <Stack spacing={0.25}>
                                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                                <Typography variant="body1">{campground.name}</Typography>
                                                                <Box
                                                                    component="a"
                                                                    href={getCampgroundUrl(campground)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    sx={{ display: 'inline-flex', color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                                                                >
                                                                    <OpenInNewIcon sx={{ fontSize: '0.85rem' }} />
                                                                </Box>
                                                            </Stack>
                                                            <Typography variant="caption" color="text.secondary">{campground.area}</Typography>
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell>{stats.totalMatches}</TableCell>
                                                    <TableCell>{stats.favoriteMatches}</TableCell>
                                                    <TableCell>
                                                        {stats.totalExcluded > 0 ? (
                                                            <Chip
                                                                label={showExcludedMap[campgroundId] ? `Hide ${stats.totalExcluded}` : stats.totalExcluded}
                                                                size="small"
                                                                color="info"
                                                                variant={showExcludedMap[campgroundId] ? 'filled' : 'outlined'}
                                                                onClick={toggleShowExcluded(campgroundId)}
                                                                sx={{ cursor: 'pointer' }}
                                                            />
                                                        ) : '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {hasCampgroundAvailability ? (
                                                            <Chip size="small" color="success" label="Has matches" />
                                                        ) : (
                                                            <Chip size="small" label="No matches" />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Stack>
                </Paper>
            )}
            <Dialog
                open={imagePreview.open}
                onClose={handleImageClose}
                maxWidth="sm"
                fullWidth
            >
                <Box
                    component="img"
                    src={imagePreview.src}
                    alt={imagePreview.alt}
                    sx={{
                        width: '100%',
                        height: 'auto',
                    }}
                    loading="lazy"
                />
            </Dialog>
        </Stack>
    );
}
