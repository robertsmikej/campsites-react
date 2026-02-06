import { useEffect, useRef, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
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

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MapIcon from '@mui/icons-material/Map';
import TableChartIcon from '@mui/icons-material/TableChart';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

import { checkForGroupedAvailability } from '../utils/utils';
import { Campground } from './Campground';

const VIEW_MODE_STORAGE_KEY = 'campgrounds-view-mode';
const EXPANDED_GROUPS_STORAGE_KEY = 'campgrounds-expanded-groups';
const GROUP_ORDER_STORAGE_KEY = 'campgrounds-order';
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

export function CampgroundsGroups(props) {
    const storedViewRef = useRef(readObjectFromStorage(VIEW_MODE_STORAGE_KEY, null));
    const shouldSkipSettingsOverrideRef = useRef(storedViewRef.current !== null);

    const [campgrounds, setCampgrounds] = useState([]);
    const [viewMode, setViewMode] = useState(() => storedViewRef.current ?? props.settings?.views?.type ?? 'calendar');
    const [expandedCampgrounds, setExpandedCampgrounds] = useState(() => readObjectFromStorage(EXPANDED_GROUPS_STORAGE_KEY, {}));
    const [groupOrders, setGroupOrders] = useState(() => readObjectFromStorage(GROUP_ORDER_STORAGE_KEY, {}));
    const [imagePreview, setImagePreview] = useState({ open: false, src: '', alt: '' });
    const [draggingCampground, setDraggingCampground] = useState(null);
    const [dragOverCampground, setDragOverCampground] = useState(null);

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
        setGroupOrders(prev => {
            const next = { ...prev };
            const ids = flattenedCampgrounds.map(getCampgroundId);
            if (!next[ALL_CAMPGROUNDS_KEY]) {
                next[ALL_CAMPGROUNDS_KEY] = ids;
            } else {
                next[ALL_CAMPGROUNDS_KEY] = next[ALL_CAMPGROUNDS_KEY].filter(id => ids.includes(id));
                ids.forEach(id => {
                    if (!next[ALL_CAMPGROUNDS_KEY].includes(id)) {
                        next[ALL_CAMPGROUNDS_KEY].push(id);
                    }
                });
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
        writeObjectToStorage(GROUP_ORDER_STORAGE_KEY, groupOrders);
    }, [groupOrders]);

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
    const resetDragState = () => {
        setDraggingCampground(null);
        setDragOverCampground(null);
    };

    const getCampgroundId = (campground) => campground?.id ?? campground?.name ?? `${campground?.area ?? 'camp'}-${campground?.description ?? ''}`;

    const getCampgroundStats = (campground) => {
        const grouped = campground.sitesGroupedByFavorites ?? {};
        let totalMatches = 0;
        let favoriteMatches = 0;
        Object.entries(grouped).forEach(([label, sites]) => {
            sites.forEach(site => {
                const matches = site.matches ?? [];
                totalMatches += matches.length;
                if (label === 'Favorites') {
                    favoriteMatches += matches.length;
                }
            });
        });
        const excluded = campground.excludedMatches ?? { byStayLength: 0, byStartDay: 0 };
        const totalExcluded = excluded.byStayLength + excluded.byStartDay;
        return {
            totalMatches,
            favoriteMatches,
            excludedByStayLength: excluded.byStayLength,
            excludedByStartDay: excluded.byStartDay,
            totalExcluded,
        };
    };

    const getOrderedCampgrounds = (groupKey, campgrounds = []) => {
        const order = groupOrders[groupKey];
        if (!order?.length) {
            return campgrounds;
        }
        const lookup = new Map(campgrounds.map(campground => [getCampgroundId(campground), campground]));
        const seen = new Set();
        const ordered = [];

        order.forEach(id => {
            const match = lookup.get(id);
            if (match) {
                ordered.push(match);
                seen.add(id);
            }
        });

        campgrounds.forEach(campground => {
            const id = getCampgroundId(campground);
            if (!seen.has(id)) {
                ordered.push(campground);
            }
        });

        return ordered;
    };

    const handleReorderCampground = (groupKey, orderedCampgrounds, sourceId, targetId) => {
        if (sourceId === targetId) return;
        setGroupOrders(prev => {
            const baseOrder = prev[groupKey] ?? orderedCampgrounds.map(getCampgroundId);
            const currentOrder = [...baseOrder];
            const fromIndex = currentOrder.indexOf(sourceId);
            if (fromIndex === -1) {
                return prev;
            }
            const [moved] = currentOrder.splice(fromIndex, 1);
            let insertIndex = typeof targetId === 'string' ? currentOrder.indexOf(targetId) : currentOrder.length;
            if (insertIndex === -1) {
                insertIndex = currentOrder.length;
            }
            currentOrder.splice(insertIndex, 0, moved);
            return {
                ...prev,
                [groupKey]: currentOrder,
            };
        });
    };

    const handleDragStart = (groupKey, campgroundId) => (event) => {
        setDraggingCampground({ groupKey, id: campgroundId });
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', campgroundId);
    };

    const handleDragEnter = (groupKey, targetId) => (event) => {
        if (draggingCampground?.groupKey !== groupKey) return;
        event.preventDefault();
        setDragOverCampground({ groupKey, id: targetId });
    };

    const handleDragOver = (groupKey) => (event) => {
        if (draggingCampground?.groupKey !== groupKey) return;
        event.preventDefault();
    };

    const handleDropOnRow = (groupKey, orderedCampgrounds, targetId) => (event) => {
        event.preventDefault();
        if (!draggingCampground || draggingCampground.groupKey !== groupKey) return;
        handleReorderCampground(groupKey, orderedCampgrounds, draggingCampground.id, targetId);
        resetDragState();
    };

    const handleDropAtEnd = (groupKey, orderedCampgrounds) => (event) => {
        event.preventDefault();
        if (!draggingCampground || draggingCampground.groupKey !== groupKey) return;
        handleReorderCampground(groupKey, orderedCampgrounds, draggingCampground.id, null);
        resetDragState();
    };

    const orderedCampgrounds = getOrderedCampgrounds(ALL_CAMPGROUNDS_KEY, campgrounds);
    const availableCampgroundCount = orderedCampgrounds.filter(checkForGroupedAvailability).length;

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
            {orderedCampgrounds.length === 0 ? (
                <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
                    <Typography variant="body1">No campgrounds configured yet.</Typography>
                </Paper>
            ) : (
                <Paper
                    variant="outlined"
                    sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}
                >
                    <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems="flex-start">
                            <Stack spacing={0.5}>
                                <Typography variant='h3'>Campgrounds</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                    <Chip
                                        label={`Total Checked: ${orderedCampgrounds.length}`}
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
                                        onClick={() => expandAllForGroup(ALL_CAMPGROUNDS_KEY, orderedCampgrounds)}
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
                        {viewMode === 'calendar' ? (
                            <Box
                                sx={{
                                    columnCount: { xs: 1, md: 2 },
                                    columnGap: 4,
                                }}
                            >
                                {orderedCampgrounds.map((campground, campgroundIndex) => {
                                    const hasCampgroundAvailability = checkForGroupedAvailability(campground);
                                    const campgroundImage = campground.image?.length > 0 ? '/images/sites/' + campground.image : '/images/sites/bg_default.jpg';
                                    const stats = getCampgroundStats(campground);
                                    const campgroundId = getCampgroundId(campground);
                                    const expanded = hasCampgroundAvailability && isCampgroundExpanded(ALL_CAMPGROUNDS_KEY, campgroundId, hasCampgroundAvailability);
                                    return (
                                        <Box
                                            key={`${campground.name}-${campgroundIndex}`}
                                            sx={{ breakInside: 'avoid', mb: 2 }}
                                        >
                                            <Accordion
                                                expanded={expanded}
                                                // disabled={!hasCampgroundAvailability}
                                                onChange={hasCampgroundAvailability ? toggleCampground(ALL_CAMPGROUNDS_KEY, campgroundId) : undefined}
                                                disableGutters
                                                sx={{
                                                    border: theme => `1px solid ${theme.palette.divider}`,
                                                    borderRadius: 1.5,
                                                    '&::before': { display: 'none' },
                                                }}
                                            >
                                                <AccordionSummary
                                                    expandIcon={<ExpandMoreIcon />}
                                                    sx={{
                                                        px: 1.5,
                                                        py: 1,
                                                        backgroundColor: hasCampgroundAvailability
                                                            ? (expanded ? 'action.hover' : 'transparent')
                                                            : 'action.disabledBackground',
                                                        // opacity: hasCampgroundAvailability ? 1 : 0.95,
                                                    }}
                                                >
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                                                        <Stack spacing={1} sx={{ flexGrow: 1 }}>
                                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                                                <Typography variant='h5'>{campground.name}</Typography>
                                                                <Chip
                                                                    label={campground.area}
                                                                    size="small"
                                                                    color="secondary"
                                                                    variant="outlined"
                                                                />
                                                            </Stack>

                                                            {!hasCampgroundAvailability && (
                                                                <Stack
                                                                    direction="row"
                                                                >
                                                                    <Chip
                                                                        label="No availability"
                                                                        size="small"
                                                                        color="warning"
                                                                        variant="filled"
                                                                    />
                                                                </Stack>
                                                            )}

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
                                                                    <Tooltip
                                                                        title={
                                                                            <span>
                                                                                {stats.excludedByStayLength > 0 && (
                                                                                    <>{stats.excludedByStayLength} excluded by stay length<br /></>
                                                                                )}
                                                                                {stats.excludedByStartDay > 0 && (
                                                                                    <>{stats.excludedByStartDay} excluded by start day</>
                                                                                )}
                                                                            </span>
                                                                        }
                                                                    >
                                                                        <Chip
                                                                            label={`${stats.totalExcluded} excluded by filters`}
                                                                            size="small"
                                                                            color="info"
                                                                            variant="outlined"
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
                                                        key={`${campground.name}-${viewMode}`}
                                                        campground={campground}
                                                        viewMode={viewMode}
                                                    />
                                                </AccordionDetails>
                                            </Accordion>
                                        </Box>
                                    );
                                })}
                            </Box>
                        ) : (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell width="90">Order</TableCell>
                                            <TableCell>Campground</TableCell>
                                            <TableCell>Matches</TableCell>
                                            <TableCell>Favorites</TableCell>
                                            <TableCell>Excluded</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {orderedCampgrounds.map((campground) => {
                                            const campgroundId = getCampgroundId(campground);
                                            const stats = getCampgroundStats(campground);
                                            const hasCampgroundAvailability = checkForGroupedAvailability(campground);
                                            const isDragging =
                                                draggingCampground?.groupKey === ALL_CAMPGROUNDS_KEY && draggingCampground?.id === campgroundId;
                                            const isDragOver =
                                                dragOverCampground?.groupKey === ALL_CAMPGROUNDS_KEY && dragOverCampground?.id === campgroundId;
                                            return (
                                                <TableRow
                                                    hover
                                                    key={campgroundId}
                                                    draggable
                                                    aria-label={`Reorder ${campground.name}`}
                                                    aria-grabbed={isDragging}
                                                    onDragStart={handleDragStart(ALL_CAMPGROUNDS_KEY, campgroundId)}
                                                    onDragEnd={resetDragState}
                                                    onDragEnter={handleDragEnter(ALL_CAMPGROUNDS_KEY, campgroundId)}
                                                    onDragOver={handleDragOver(ALL_CAMPGROUNDS_KEY)}
                                                    onDrop={handleDropOnRow(ALL_CAMPGROUNDS_KEY, orderedCampgrounds, campgroundId)}
                                                    sx={{
                                                        cursor: 'grab',
                                                        opacity: isDragging ? 0.5 : 1,
                                                        border: isDragOver ? (theme => `2px dashed ${theme.palette.primary.main}`) : undefined,
                                                    }}
                                                >
                                                    <TableCell>
                                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                                            <DragIndicatorIcon fontSize="small" color="action" />
                                                            <Typography variant="caption" color="text.secondary">
                                                                Drag
                                                            </Typography>
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Stack spacing={0.25}>
                                                            <Typography variant="body1">{campground.name}</Typography>
                                                            <Typography variant="caption" color="text.secondary">{campground.area}</Typography>
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell>{stats.totalMatches}</TableCell>
                                                    <TableCell>{stats.favoriteMatches}</TableCell>
                                                    <TableCell>
                                                        {stats.totalExcluded > 0 ? (
                                                            <Tooltip
                                                                title={
                                                                    <span>
                                                                        {stats.excludedByStayLength > 0 && (
                                                                            <>{stats.excludedByStayLength} by stay length<br /></>
                                                                        )}
                                                                        {stats.excludedByStartDay > 0 && (
                                                                            <>{stats.excludedByStartDay} by start day</>
                                                                        )}
                                                                    </span>
                                                                }
                                                            >
                                                                <span>{stats.totalExcluded}</span>
                                                            </Tooltip>
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
                                        {draggingCampground?.groupKey === ALL_CAMPGROUNDS_KEY && (
                                            <TableRow
                                                hover={false}
                                                key="drop-zone"
                                                onDragOver={handleDragOver(ALL_CAMPGROUNDS_KEY)}
                                                onDrop={handleDropAtEnd(ALL_CAMPGROUNDS_KEY, orderedCampgrounds)}
                                            >
                                                <TableCell colSpan={6}>
                                                    <Box
                                                        sx={{
                                                            py: 1,
                                                            border: theme => `1px dashed ${theme.palette.primary.light}`,
                                                            borderRadius: 1,
                                                            textAlign: 'center',
                                                        }}
                                                    >
                                                        <Typography variant="caption" color="text.secondary">
                                                            Drop here to move to end
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        )}
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
