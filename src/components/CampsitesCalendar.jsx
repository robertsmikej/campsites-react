import { useMemo, useState, memo } from 'react';

// Import the dayjs plugins you need
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

import { styled } from "@mui/material/styles";
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';

import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { goToPage } from '../utils/utils';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const calendarColors = ['green', 'darkgreen'];
const softColors = ['#a5d6a7', '#81c784'];
const excludedColors = ['#e67e22', '#d35400'];

const getRangeStyles = (variant, colors, bgPaper) => {
    if (variant === 'single' || variant === 'excludedSingle' || variant === 'softSingle') {
        return {
            backgroundColor: colors[0],
            color: '#fff',
            borderRadius: '50%',
            "&:hover, &:focus": { backgroundColor: colors[1] },
        };
    }
    if (variant === 'rangeStart' || variant === 'excludedRangeStart' || variant === 'softRangeStart') {
        return {
            backgroundColor: colors[0],
            color: '#fff',
            borderTopLeftRadius: '50%',
            borderBottomLeftRadius: '50%',
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            "&:hover, &:focus": { backgroundColor: colors[1] },
        };
    }
    if (variant === 'rangeMiddle' || variant === 'excludedRangeMiddle' || variant === 'softRangeMiddle') {
        return {
            backgroundColor: colors[0],
            color: '#fff',
            borderRadius: 0,
            "&:hover, &:focus": { backgroundColor: colors[1] },
        };
    }
    if (variant === 'rangeEnd' || variant === 'excludedRangeEnd' || variant === 'softRangeEnd') {
        return {
            backgroundColor: colors[0],
            color: '#fff',
            borderTopRightRadius: '0%',
            borderBottomRightRadius: '0%',
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            backgroundImage: `linear-gradient(115deg, ${colors[0]} 65%, ${bgPaper} 45%)`,
            "&:hover, &:focus": {
                backgroundColor: colors[1],
                backgroundImage: `linear-gradient(125deg, ${colors[1]} 65%, ${bgPaper} 45%)`,
            },
        };
    }
    return {};
};

const RangeDay = styled(PickersDay, {
    shouldForwardProp: (prop) => prop !== "variant" && prop !== "selected"
})(({ theme, variant }) => ({
    width: '40px',
    height: '40px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    ...(variant?.startsWith('excluded')
        ? getRangeStyles(variant, excludedColors, theme.palette.background.paper)
        : variant?.startsWith('soft')
        ? getRangeStyles(variant, softColors, theme.palette.background.paper)
        : getRangeStyles(variant, calendarColors, theme.palette.background.paper)
    ),
}));

// Pre-compute a Map<'YYYY-MM-DD', variant> from highlighted values.
// This runs once per site when data changes, turning O(days × values) per render
// into O(values) for the build + O(1) per day cell lookup.
const buildVariantMap = (highlightedValues) => {
    const map = new Map();

    const addRangeToMap = (item, prefix) => {
        const startStr = item.from.format('YYYY-MM-DD');
        const endStr = item.to.format('YYYY-MM-DD');
        if (startStr === endStr) {
            map.set(startStr, `${prefix}Single`);
        } else {
            map.set(startStr, `${prefix}RangeStart`);
            map.set(endStr, `${prefix}RangeEnd`);
            let current = item.from.add(1, 'day');
            while (current.isBefore(item.to, 'day')) {
                map.set(current.format('YYYY-MM-DD'), `${prefix}RangeMiddle`);
                current = current.add(1, 'day');
            }
        }
    };

    // Process in ascending priority order so higher priority overwrites lower
    // 1. Excluded (lowest)
    for (const item of highlightedValues) {
        if (!item?.excluded) continue;
        if (item.from && item.to) addRangeToMap(item, 'excluded');
    }
    // 2. Soft (medium)
    for (const item of highlightedValues) {
        if (!item?.soft) continue;
        if (item.from && item.to) addRangeToMap(item, 'soft');
    }
    // 3. Regular matches (highest)
    for (const item of highlightedValues) {
        if (item?.excluded || item?.soft) continue;
        if (dayjs.isDayjs(item)) {
            map.set(item.format('YYYY-MM-DD'), 'single');
        } else if (item?.from && item?.to) {
            const startStr = item.from.format('YYYY-MM-DD');
            const endStr = item.to.format('YYYY-MM-DD');
            if (startStr === endStr) {
                map.set(startStr, 'single');
            } else {
                map.set(startStr, 'rangeStart');
                map.set(endStr, 'rangeEnd');
                let current = item.from.add(1, 'day');
                while (current.isBefore(item.to, 'day')) {
                    map.set(current.format('YYYY-MM-DD'), 'rangeMiddle');
                    current = current.add(1, 'day');
                }
            }
        }
    }

    return map;
};

const ServerDay = memo((props) => {
    const { variantMap, day, ...other } = props;
    const variant = variantMap?.get(day.format('YYYY-MM-DD')) ?? 'default';
    const isSelected = variant !== 'default';

    return (
        <RangeDay
            {...other}
            day={day}
            variant={variant}
            selected={isSelected}
            disableMargin
        />
    );
});

const buildDateDisplayArray = (site, includeExcluded) => {
    const { dates = [], matches = [], excludedMatches = [] } = site;

    const matchRanges = matches.map(m => {
        if (m.from === m.to) {
            return dayjs(m.from);
        } else {
            return {
                from: dayjs(m.from),
                to: dayjs(m.to)
            };
        }
    });

    // Always show startDay-excluded as soft (lighter green)
    const softRanges = excludedMatches
        .filter(m => m.reason === 'startDay')
        .map(m => ({ from: dayjs(m.from), to: dayjs(m.to), soft: true }));

    // Only show stayLength-excluded when toggled (orange)
    const excludedRanges = includeExcluded
        ? excludedMatches
            .filter(m => m.reason !== 'startDay')
            .map(m => ({ from: dayjs(m.from), to: dayjs(m.to), excluded: true }))
        : [];

    const allMatchDays = new Set();
    const addRange = (m) => {
        let current = dayjs(m.from);
        const end = dayjs(m.to);
        while (current.isBefore(end, 'day')) {
            allMatchDays.add(current.format('YYYY-MM-DD'));
            current = current.add(1, 'day');
        }
    };
    matches.forEach(addRange);
    excludedMatches.filter(m => m.reason === 'startDay').forEach(addRange);
    if (includeExcluded) {
        excludedMatches.filter(m => m.reason !== 'startDay').forEach(addRange);
    }

    // Single available dates not covered by any range — also soft
    const singles = dates
        .filter(d => !allMatchDays.has(d))
        .map(d => ({ from: dayjs(d), to: dayjs(d).add(1, 'day'), soft: true }));

    const combined = [...singles, ...matchRanges, ...softRanges, ...excludedRanges].sort((a, b) => {
        const aDate = dayjs(a.from ?? a);
        const bDate = dayjs(b.from ?? b);
        return aDate.diff(bDate);
    });

    return combined;
};

const getMonthsFromSiteData = (site, includeExcluded) => {
    const { dates = [], matches = [], excludedMatches = [] } = site;
    const startDayExcluded = excludedMatches.filter(m => m.reason === 'startDay');
    const stayLengthExcluded = includeExcluded ? excludedMatches.filter(m => m.reason !== 'startDay') : [];
    const allMatches = [...matches, ...startDayExcluded, ...stayLengthExcluded];

    const monthsSet = new Set();

    // Add months from single dates
    dates.forEach(dateStr => {
        monthsSet.add(dayjs(dateStr).startOf("month").format("YYYY-MM-DD"));
    });

    // Add months from match ranges
    allMatches.forEach(m => {
        let current = dayjs(m.from).startOf("month");
        const end = dayjs(m.to).startOf("month");

        // Loop through each month in the range
        while (current.isSameOrBefore(end, "month")) {
            monthsSet.add(current.format("YYYY-MM-DD"));
            current = current.add(1, "month");
        }
    });

    // Convert back to sorted array of dayjs
    return [...monthsSet]
        .map(m => dayjs(m))
        .sort((a, b) => a.diff(b));
};

export const CampsitesCalendar = memo(function CampsitesCalendar(props) {
    const site = props.site || {};
    const [photoPreview, setPhotoPreview] = useState({ open: false, photos: [], siteName: '' });

    const values = useMemo(() => {
        if (!props.site) return [];
        return buildDateDisplayArray(props.site, props.showExcluded);
    }, [props.site, props.showExcluded]);

    const variantMap = useMemo(() => buildVariantMap(values), [values]);

    const monthsToShow = useMemo(() => {
        if (!props.site) return [];
        return getMonthsFromSiteData(props.site, props.showExcluded);
    }, [props.site, props.showExcluded]);

    const openPhotoPreview = (currentSite) => () => {
        const fallback = props.campground?.image ? `/images/sites/${props.campground.image}` : '/images/sites/bg_default.jpg';
        const sitePhotos = currentSite.photos?.length ? currentSite.photos : currentSite.photo ? [currentSite.photo] : [fallback];
        const resolvedPhotos = sitePhotos.map(photo => {
            if (photo.startsWith('http')) return photo;
            return photo.startsWith('/images/') ? photo : `/images/sites/${photo}`;
        });
        setPhotoPreview({ open: true, photos: resolvedPhotos, siteName: currentSite.siteName });
    };

    const closePhotoPreview = () => setPhotoPreview({ open: false, photos: [], siteName: '' });

    return (
        <>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Stack spacing={1.5} sx={{ p: { xs: 1, md: 1.5 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-start" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.5}>
                            <Chip size="small" label={site.campsite_type ?? 'Standard'} />
                            {site.max_num_people && <Chip size="small" label={`Up to ${site.max_num_people} people`} />}
                            {site.max_vehicle_length && <Chip size="small" label={`Vehicle ${site.max_vehicle_length} ft`} />}
                        </Stack>
                        <Tooltip title="Preview campsite photos">
                            <span>
                                <Button
                                    size="small"
                                    color="inherit"
                                    startIcon={<PhotoCameraIcon fontSize="small" />}
                                    onClick={openPhotoPreview(site)}
                                >
                                    Photos
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                    <Stack
                        direction="row"
                        spacing={0}
                        sx={{ flexWrap: 'wrap' }}
                    >
                        {monthsToShow.map((month) => {
                            return (
                                <StaticDatePicker
                                    key={month.format('YYYY-MM')}
                                    displayStaticWrapperAs="desktop"
                                    value={month}
                                    slots={{
                                        day: ServerDay
                                    }}
                                    slotProps={{
                                        day: { variantMap },
                                        actionBar: {
                                            actions: []
                                        }
                                    }}
                                    sx={{
                                        '& .MuiPickersArrowSwitcher-root': {
                                            display: 'none',
                                        },
                                        '.MuiPickersCalendarHeader-switchViewButton': {
                                            display: 'none',
                                        },
                                        '.MuiPickersCalendarHeader-root': {
                                            marginTop: '0px',
                                            marginBottom: 0,
                                            minHeight: '20px',
                                            paddingLeft: '10px'
                                        },
                                        '.MuiDateCalendar-root': {
                                            height: 'auto',
                                            width: { xs: '100%', sm: '230px' },
                                            maxWidth: '230px',
                                        },
                                        '.MuiDayCalendar-weekDayLabel': {
                                            height: '26px',
                                        },
                                        '.MuiPickersDay-root': {
                                            height: '26px',
                                        },
                                        '.MuiDayCalendar-slideTransition': {
                                            minHeight: '170px',
                                        },
                                        '& .MuiPickersLayout-root': {
                                            minWidth: '220px',
                                        }
                                    }}
                                    onChange={(e) => goToPage(site, month)}
                                />
                            )
                        })}
                    </Stack>
                </Stack>
            </LocalizationProvider>
            <Dialog
                open={photoPreview.open}
                onClose={closePhotoPreview}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{photoPreview.siteName}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        {photoPreview.photos.map((photo, index) => (
                            <Box
                                key={photo + index}
                                component="img"
                                src={photo}
                                alt={`Campsite photo ${index + 1}`}
                                loading="lazy"
                                sx={{
                                    width: '100%',
                                    borderRadius: 1.5,
                                    border: theme => `1px solid ${theme.palette.divider}`,
                                }}
                            />
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closePhotoPreview} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
});
