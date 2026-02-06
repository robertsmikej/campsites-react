import { useEffect, useMemo, useRef, useState } from 'react';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Slider from '@mui/material/Slider';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const DEFAULT_SHOW_HIDE = {
    'Favorites': true,
    'Worthwhile': true,
    'All Others': false,
};

const CUSTOM_CATALOG_OPTION = '__custom';

const parseList = (value = '') => value.split(',').map(entry => entry.trim()).filter(Boolean);

const createEmptyCampground = () => ({
    name: '',
    area: '',
    site: 'recreation.gov',
    type: 'campground',
    id: '',
    description: '',
    dates: {
        startDate: '',
        endDate: '',
    },
    image: '',
    sites: {
        favorites: [],
        worthwhile: [],
    },
    showOrHide: { ...DEFAULT_SHOW_HIDE },
    favoritesText: '',
    worthwhileText: '',
    catalogId: CUSTOM_CATALOG_OPTION,
});

const toEditableCampground = (campground = {}, validCatalogIds = new Set()) => {
    const base = createEmptyCampground();
    const merged = {
        ...base,
        ...campground,
        dates: {
            startDate: campground?.dates?.startDate ?? '',
            endDate: campground?.dates?.endDate ?? '',
        },
        site: campground?.site ?? base.site,
        type: campground?.type ?? base.type,
        image: campground?.image ?? '',
        sites: {
            favorites: campground?.sites?.favorites ?? [],
            worthwhile: campground?.sites?.worthwhile ?? [],
        },
        showOrHide: { ...DEFAULT_SHOW_HIDE, ...(campground?.showOrHide ?? {}) },
    };

    return {
        ...merged,
        favoritesText: merged.sites.favorites.join(', '),
        worthwhileText: merged.sites.worthwhile.join(', '),
        catalogId: validCatalogIds.has(merged.id) ? merged.id : CUSTOM_CATALOG_OPTION,
    };
};

const sanitizeCampground = (campground) => {
    const favorites = parseList(campground.favoritesText);
    const worthwhile = parseList(campground.worthwhileText);

    return {
        name: campground.name.trim(),
        area: campground.area.trim(),
        site: (campground.site || 'recreation.gov').trim() || 'recreation.gov',
        type: campground.type?.trim() || 'campground',
        id: campground.id.trim(),
        description: campground.description ?? '',
        dates: {
            startDate: campground.dates?.startDate || '',
            endDate: campground.dates?.endDate || '',
        },
        image: campground.image || '',
        sites: {
            favorites,
            worthwhile,
        },
        showOrHide: {
            'Favorites': campground.showOrHide?.['Favorites'] ?? DEFAULT_SHOW_HIDE['Favorites'],
            'Worthwhile': campground.showOrHide?.['Worthwhile'] ?? DEFAULT_SHOW_HIDE['Worthwhile'],
            'All Others': campground.showOrHide?.['All Others'] ?? DEFAULT_SHOW_HIDE['All Others'],
        },
    };
};

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_STAY_RANGE = [2, 5];
const STAY_MIN = 1;
const STAY_MAX = 14;

export function SiteConfigDialog({
    open,
    onClose,
    onSave,
    onResetToDefaults,
    initialData,
    catalogOptions = [],
    globalSettings = {},
}) {
    const [campgrounds, setCampgrounds] = useState([createEmptyCampground()]);
    const [newCampgroundSelection, setNewCampgroundSelection] = useState('');
    const [draggingIndex, setDraggingIndex] = useState(null);
    const [viewMode, setViewMode] = useState('cards');
    const [expandedPanels, setExpandedPanels] = useState(new Set([0]));

    // Global settings state
    const getStayRange = (stayLengths) => {
        if (!stayLengths || stayLengths.length === 0) return DEFAULT_STAY_RANGE;
        return [Math.min(...stayLengths), Math.max(...stayLengths)];
    };
    const [stayRange, setStayRange] = useState(() => getStayRange(globalSettings.stayLengths));
    const [validStartDays, setValidStartDays] = useState(() => globalSettings.validStartDays ?? ALL_DAYS);

    const catalogLookup = useMemo(() => {
        return catalogOptions.reduce((acc, option) => {
            if (option?.id) acc[option.id] = option;
            return acc;
        }, {});
    }, [catalogOptions]);

    const catalogIds = useMemo(() => new Set(Object.keys(catalogLookup)), [catalogLookup]);

    const initialCampgrounds = useMemo(() => {
        return (initialData?.['recreation.gov'] ?? []).map(item =>
            toEditableCampground(item, catalogIds)
        );
    }, [initialData, catalogIds]);

    const selectedCatalogIds = useMemo(() => {
        return new Set(
            campgrounds
                .map(campground => (
                    campground.catalogId && campground.catalogId !== CUSTOM_CATALOG_OPTION
                        ? campground.catalogId
                        : null
                ))
                .filter(Boolean)
        );
    }, [campgrounds]);

    useEffect(() => {
        if (!open) return;

        if (initialCampgrounds.length > 0) {
            setCampgrounds(initialCampgrounds);
        } else {
            setCampgrounds([createEmptyCampground()]);
        }

        // Reset global settings state when dialog opens
        setStayRange(getStayRange(globalSettings.stayLengths));
        setValidStartDays(globalSettings.validStartDays ?? ALL_DAYS);
    }, [open, initialCampgrounds, globalSettings]);

    const updateCampground = (index, updater) => {
        setCampgrounds(prev =>
            prev.map((campground, idx) => (idx === index ? updater(campground) : campground))
        );
    };

    const handleFieldChange = (index, field, value) => {
        updateCampground(index, campground => ({
            ...campground,
            [field]: value,
        }));
    };

    const handleDateChange = (index, key, value) => {
        updateCampground(index, campground => ({
            ...campground,
            dates: {
                ...campground.dates,
                [key]: value,
            },
        }));
    };

    const handleToggleShow = (index, key, checked) => {
        updateCampground(index, campground => ({
            ...campground,
            showOrHide: {
                ...campground.showOrHide,
                [key]: checked,
            },
        }));
    };

    const buildCampgroundFromCatalog = (catalogId) => {
        const entry = catalogLookup[catalogId];
        if (!entry) return createEmptyCampground();
        return {
            ...createEmptyCampground(),
            catalogId,
            name: entry.name ?? '',
            area: entry.area ?? '',
            site: entry.site ?? entry.system ?? 'recreation.gov',
            type: entry.type ?? 'campground',
            description: entry.description ?? '',
            image: entry.image ?? '',
            id: entry.id ?? '',
        };
    };

    const handleRemoveCampground = (index) => {
        setCampgrounds(prev => {
            if (prev.length === 1) {
                return [createEmptyCampground()];
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const handleAddSelectedCampground = () => {
        if (!newCampgroundSelection) return;

        if (newCampgroundSelection === CUSTOM_CATALOG_OPTION) {
            setCampgrounds(prev => [...prev, createEmptyCampground()]);
        } else if (!selectedCatalogIds.has(newCampgroundSelection)) {
            const newCampground = buildCampgroundFromCatalog(newCampgroundSelection);
            setCampgrounds(prev => [...prev, newCampground]);
        }
        setNewCampgroundSelection('');
    };

    const handleDragStart = (index) => (event) => {
        event.dataTransfer.effectAllowed = 'move';
        setDraggingIndex(index);
    };

    const handleDragOver = (event, index) => {
        event.preventDefault();
        if (draggingIndex === null || draggingIndex === index) return;
    };

    const handleDrop = (event, index) => {
        event.preventDefault();
        if (draggingIndex === null || draggingIndex === index) return;
        setCampgrounds(prev => {
            const next = [...prev];
            const orderMap = prev.map((_, idx) => idx);
            const [removedItem] = next.splice(draggingIndex, 1);
            const [removedIndex] = orderMap.splice(draggingIndex, 1);
            next.splice(index, 0, removedItem);
            orderMap.splice(index, 0, removedIndex);
            setExpandedPanels(prevExpanded => {
                const mapped = new Set();
                orderMap.forEach((originalIdx, newIdx) => {
                    if (prevExpanded.has(originalIdx)) {
                        mapped.add(newIdx);
                    }
                });
                return mapped;
            });
            return next;
        });
        setDraggingIndex(null);
    };

    const handleDragEnd = () => setDraggingIndex(null);

    const handleAccordionChange = (index) => (_event, isExpanded) => {
        setExpandedPanels(prev => {
            const next = new Set(prev);
            if (isExpanded) {
                next.add(index);
            } else {
                next.delete(index);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        setExpandedPanels(new Set(campgrounds.map((_, idx) => idx)));
    };

    const handleCollapseAll = () => {
        setExpandedPanels(new Set());
    };

    const handleViewModeChange = (_event, nextView) => {
        if (nextView) {
            setViewMode(nextView);
        }
    };

    const openCampgroundInCards = (index) => {
        setViewMode('cards');
        setExpandedPanels(new Set([index]));
    };

    const previousViewMode = useRef(viewMode);

    useEffect(() => {
        if (previousViewMode.current === viewMode) return;

        if (viewMode === 'list') {
            setExpandedPanels(new Set());
        } else if (viewMode === 'cards') {
            setExpandedPanels(prev => {
                if (prev.size === 0 && campgrounds.length > 0) {
                    return new Set([0]);
                }
                return prev;
            });
        }
        previousViewMode.current = viewMode;
    }, [viewMode, campgrounds.length]);

    const handleStayRangeChange = (_event, newValue) => {
        setStayRange(newValue);
    };

    const handleValidStartDayToggle = (day) => () => {
        setValidStartDays(prev => {
            if (prev.includes(day)) {
                // Don't allow removing all days
                if (prev.length === 1) return prev;
                return prev.filter(d => d !== day);
            }
            return [...prev, day];
        });
    };

    const buildStayLengthsArray = (range) => {
        const lengths = [];
        for (let i = range[0]; i <= range[1]; i++) {
            lengths.push(i);
        }
        return lengths;
    };

    const handleSave = () => {
        const sanitizedCampgrounds = campgrounds.map(sanitizeCampground);
        const updatedConfig = { ...(initialData || {}) };
        updatedConfig['recreation.gov'] = sanitizedCampgrounds;

        const updatedGlobalSettings = {
            stayLengths: buildStayLengthsArray(stayRange),
            validStartDays: validStartDays,
        };

        onSave?.(updatedConfig, updatedGlobalSettings);
    };

    const isSaveDisabled = campgrounds.some(
        campground => !campground.name.trim() || !campground.id.trim()
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>Configure Campgrounds</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {/* Global Settings Section */}
                    <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}`, borderRadius: 1.5 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle1" fontWeight={500}>Search Settings</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={3}>
                                <Box>
                                    <Typography variant="body2" gutterBottom>
                                        Stay Length (nights): {stayRange[0]} – {stayRange[1]}
                                    </Typography>
                                    <Box sx={{ px: 1 }}>
                                        <Slider
                                            value={stayRange}
                                            onChange={handleStayRangeChange}
                                            valueLabelDisplay="auto"
                                            min={STAY_MIN}
                                            max={STAY_MAX}
                                            marks={[
                                                { value: 1, label: '1' },
                                                { value: 7, label: '7' },
                                                { value: 14, label: '14' },
                                            ]}
                                        />
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                        Only show stays between {stayRange[0]} and {stayRange[1]} nights
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" gutterBottom>
                                        Valid Start Days
                                    </Typography>
                                    <FormGroup row>
                                        {ALL_DAYS.map(day => (
                                            <FormControlLabel
                                                key={day}
                                                control={
                                                    <Checkbox
                                                        checked={validStartDays.includes(day)}
                                                        onChange={handleValidStartDayToggle(day)}
                                                        size="small"
                                                    />
                                                }
                                                label={day.slice(0, 3)}
                                            />
                                        ))}
                                    </FormGroup>
                                    <Typography variant="caption" color="text.secondary">
                                        Only show stays that start on these days
                                    </Typography>
                                </Box>
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Divider />

                    {/* Campground Configuration Section */}
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        alignItems={{ md: 'flex-start' }}
                        justifyContent="center"
                    >
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            flex={1}
                            justifyContent="center"
                            alignItems='flex-start'
                        >
                            <TextField
                                select
                                fullWidth
                                label="Add campground"
                                value={newCampgroundSelection}
                                onChange={(event) => setNewCampgroundSelection(event.target.value)}
                                helperText="Choose a campground to add to your watch list"
                                size="small"
                                margin="dense"
                            >
                                {catalogOptions.map(option => (
                                    <MenuItem
                                        key={option.id}
                                        value={option.id}
                                        disabled={selectedCatalogIds.has(option.id)}
                                    >
                                        {option.name} ({option.area})
                                    </MenuItem>
                                ))}
                                <MenuItem value={CUSTOM_CATALOG_OPTION}>
                                    Custom / Not listed
                                </MenuItem>
                            </TextField>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddSelectedCampground}
                                disabled={
                                    !newCampgroundSelection ||
                                    (
                                        newCampgroundSelection !== CUSTOM_CATALOG_OPTION &&
                                        selectedCatalogIds.has(newCampgroundSelection)
                                    )
                                }
                            >
                                Add
                            </Button>
                        </Stack>
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            size="small"
                            onChange={handleViewModeChange}
                        >
                            <ToggleButton value="cards">Cards</ToggleButton>
                            <ToggleButton value="list">List</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    {viewMode === 'cards' && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" onClick={handleExpandAll}>Expand all</Button>
                            <Button size="small" onClick={handleCollapseAll}>Collapse all</Button>
                        </Stack>
                    )}
                    {viewMode === 'list' && (
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell width="5%"></TableCell>
                                        <TableCell>Campground</TableCell>
                                        <TableCell>Area</TableCell>
                                        <TableCell>Facility ID</TableCell>
                                        <TableCell>Source</TableCell>
                                        <TableCell width="15%">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {campgrounds.map((campground, index) => {
                                        const nameLabel = campground.name || `Campground ${index + 1}`;
                                        const isDragging = draggingIndex === index;
                                        return (
                                            <TableRow
                                                key={`${campground.id}-${index}`}
                                                hover
                                                draggable
                                                onDragStart={handleDragStart(index)}
                                                onDragOver={(event) => handleDragOver(event, index)}
                                                onDrop={(event) => handleDrop(event, index)}
                                                onDragEnd={handleDragEnd}
                                                sx={{
                                                    opacity: isDragging ? 0.8 : 1,
                                                    cursor: 'grab',
                                                }}
                                            >
                                                <TableCell>
                                                    <DragIndicatorIcon fontSize="small" color="disabled" />
                                                </TableCell>
                                                <TableCell>{nameLabel}</TableCell>
                                                <TableCell>{campground.area || '—'}</TableCell>
                                                <TableCell>{campground.id || '—'}</TableCell>
                                                <TableCell>{campground.site || '—'}</TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={1}>
                                                        <Button
                                                            size="small"
                                                            onClick={() => openCampgroundInCards(index)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Tooltip title="Remove campground">
                                                            <span>
                                                                <IconButton
                                                                    aria-label="Remove campground"
                                                                    size="small"
                                                                    onClick={() => handleRemoveCampground(index)}
                                                                    disabled={campgrounds.length === 1}
                                                                >
                                                                    <DeleteOutlineIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                    {viewMode === 'cards' && campgrounds.map((campground, index) => {
                        const isCustom = campground.catalogId === CUSTOM_CATALOG_OPTION;
                        const isDragging = draggingIndex === index;
                        return (
                            <Accordion
                                key={index}
                                disableGutters
                                elevation={0}
                                sx={{
                                    border: theme => `1px solid ${isDragging ? theme.palette.primary.main : theme.palette.divider}`,
                                    borderRadius: 1.5,
                                    opacity: isDragging ? 0.9 : 1,
                                    cursor: 'grab',
                                    mb: 0.5,
                                }}
                                expanded={expandedPanels.has(index)}
                                onChange={handleAccordionChange(index)}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon />}
                                    onDragStart={handleDragStart(index)}
                                    onDragOver={(event) => handleDragOver(event, index)}
                                    onDrop={(event) => handleDrop(event, index)}
                                    onDragEnd={handleDragEnd}
                                    draggable
                                    sx={{
                                        minHeight: 42,
                                        px: 1.5,
                                        '& .MuiAccordionSummary-content': {
                                            m: 0,
                                        },
                                    }}
                                >
                                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1 }}>
                                        <DragIndicatorIcon fontSize="small" color="disabled" />
                                        <Typography variant="subtitle1">
                                            {campground.name ? campground.name : `Campground ${index + 1}`}
                                        </Typography>
                                    </Stack>
                                    <Tooltip title="Remove campground">
                                        <span>
                                            <IconButton
                                                aria-label="Remove campground"
                                                onClick={() => handleRemoveCampground(index)}
                                                disabled={campgrounds.length === 1}
                                                size="small"
                                                onClickCapture={(event) => event.stopPropagation()}
                                                component="span"
                                            >
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </AccordionSummary>
                                <AccordionDetails sx={{ pt: 0.75, pb: 1.25, px: 1.25 }}>
                                    <Stack spacing={2.5}>
                                        <Stack
                                            direction={{ xs: 'column', md: 'row' }}
                                            spacing={1}
                                            alignItems="stretch"
                                        >
                                            <Stack spacing={0.75} flex={1}>
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Campground Name"
                                                        value={campground.name}
                                                        onChange={(event) => handleFieldChange(index, 'name', event.target.value)}
                                                        required
                                                    />
                                                ) : null}
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Area / Region"
                                                        value={campground.area}
                                                        onChange={(event) => handleFieldChange(index, 'area', event.target.value)}
                                                    />
                                                ) : (
                                                    <DetailText label="Area / Region" value={campground.area} />
                                                )}
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Facility ID"
                                                        value={campground.id}
                                                        onChange={(event) => handleFieldChange(index, 'id', event.target.value)}
                                                        helperText="Matches the Recreation.gov facility ID"
                                                        required
                                                    />
                                                ) : null}
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Source"
                                                        value={campground.site}
                                                        onChange={(event) => handleFieldChange(index, 'site', event.target.value)}
                                                    />
                                                ) : (
                                                    <DetailText label="Source Site" value={campground.site} />
                                                )}
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Type"
                                                        value={campground.type}
                                                        onChange={(event) => handleFieldChange(index, 'type', event.target.value)}
                                                    />
                                                ) : (
                                                    <DetailText label="Type" value={campground.type} />
                                                )}
                                                {isCustom ? (
                                                    <TextField size="small"
                                                        fullWidth
                                                        label="Description"
                                                        value={campground.description}
                                                        onChange={(event) => handleFieldChange(index, 'description', event.target.value)}
                                                        multiline
                                                        minRows={3}
                                                    />
                                                ) : (
                                                    <DetailText
                                                        label="Description"
                                                        value={campground.description}
                                                        multiline
                                                    />
                                                )}
                                            </Stack>
                                            <ImagePreview image={campground.image} name={campground.name} />
                                        </Stack>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                            <TextField size="small"
                                                fullWidth
                                                type="date"
                                                label="Start Date"
                                                value={campground.dates.startDate}
                                                onChange={(event) => handleDateChange(index, 'startDate', event.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                                helperText="Optional. Leave blank to use global settings."
                                            />
                                            <TextField size="small"
                                                fullWidth
                                                type="date"
                                                label="End Date"
                                                value={campground.dates.endDate}
                                                onChange={(event) => handleDateChange(index, 'endDate', event.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Stack>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                            <TextField size="small"
                                                fullWidth
                                                label="Favorite Sites"
                                                value={campground.favoritesText}
                                                onChange={(event) => handleFieldChange(index, 'favoritesText', event.target.value)}
                                                helperText="Comma-separated list (e.g., 012, 014, 016)"
                                            />
                                            <TextField size="small"
                                                fullWidth
                                                label="Worthwhile Sites"
                                                value={campground.worthwhileText}
                                                onChange={(event) => handleFieldChange(index, 'worthwhileText', event.target.value)}
                                                helperText="Comma-separated list"
                                            />
                                        </Stack>
                                        <FormGroup row>
                                            {Object.keys(DEFAULT_SHOW_HIDE).map((key) => (
                                                <FormControlLabel
                                                    key={key}
                                                    control={
                                                        <Switch
                                                            checked={campground.showOrHide?.[key] ?? DEFAULT_SHOW_HIDE[key]}
                                                            onChange={(event) => handleToggleShow(index, key, event.target.checked)}
                                                        />
                                                    }
                                                    label={`Show ${key}`}
                                                />
                                            ))}
                                        </FormGroup>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button
                    color="error"
                    onClick={() => onResetToDefaults?.()}
                >
                    Reset to defaults
                </Button>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={isSaveDisabled}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog >
    );
}

const DetailText = ({ label, value, multiline = false }) => (
    <Stack spacing={0.25}>
        <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {label}
        </Typography>
        <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: multiline ? 'pre-line' : 'normal' }}
        >
            {value || '—'}
        </Typography>
    </Stack>
);

const ImagePreview = ({ image, name }) => {
    const hasImage = Boolean(image);
    const imageSrc = hasImage ? `/images/sites/${image}` : null;

    return (
        <Box
            sx={{
                width: { xs: '100%', md: 160 },
                maxWidth: 160,
                borderRadius: 1.5,
                border: theme => `1px solid ${theme.palette.divider}`,
                overflow: 'hidden',
                minHeight: 120,
                backgroundColor: theme => theme.palette.background.default,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {hasImage ? (
                <img
                    src={imageSrc}
                    alt={name || 'Campground map'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                />
            ) : (
                <Typography variant="body2" color="text.secondary">
                    No image available
                </Typography>
            )}
        </Box>
    );
};
