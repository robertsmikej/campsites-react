import { useEffect, useState } from 'react';

// Import the dayjs plugins you need
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

import { styled } from "@mui/material/styles";
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
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
// 1. Create a styled component that handles different variants for the range
const RangeDay = styled(PickersDay, {
    shouldForwardProp: (prop) => prop !== "variant" && prop !== "selected"
})(({ theme, variant }) => ({
    // Default styling for a selected day
    width: '40px',
    height: '40px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    ...(variant === 'single' && {
        backgroundColor: calendarColors[0],
        color: theme.palette.primary.contrastText,
        borderRadius: '50%',
        "&:hover, &:focus": {
            backgroundColor: calendarColors[1]
        },
    }),
    // Styling for a day at the start of a range
    ...(variant === 'rangeStart' && {
        backgroundColor: calendarColors[0],
        color: theme.palette.primary.contrastText,
        borderTopLeftRadius: '50%',
        borderBottomLeftRadius: '50%',
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        "&:hover, &:focus": {
            backgroundColor: calendarColors[1]
        },
    }),
    // Styling for a day in the middle of a range
    ...(variant === 'rangeMiddle' && {
        backgroundColor: calendarColors[0],
        color: theme.palette.primary.contrastText,
        borderRadius: 0,
        "&:hover, &:focus": {
            backgroundColor: calendarColors[1]
        },

    }),
    // Styling for a day at the end of a range
    ...(variant === 'rangeEnd' && {
        backgroundColor: calendarColors[0],
        color: theme.palette.primary.contrastText,
        borderTopRightRadius: '0%',
        borderBottomRightRadius: '0%',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        backgroundImage: `linear-gradient(115deg, ${calendarColors[0]} 65%, ${theme.palette.background.paper} 45%)`,
        "&:hover, &:focus": {
            backgroundColor: calendarColors[1],
            backgroundImage: `linear-gradient(125deg, ${calendarColors[1]} 65%, ${theme.palette.background.paper} 45%)`,
        },
    }),
}));

const ServerDay = (props) => {
    const { highlightedValues = [], day, ...other } = props;

    let variant = 'default';

    // Loop through the values to determine the variant for the day
    for (let item of highlightedValues) {
        // Case 1: Single date (Dayjs object)
        if (dayjs.isDayjs(item) && item.isSame(day, 'day')) {
            variant = 'single';
            break;
        }

        // Case 2: Date range ({ from, to })
        if (item?.from && item?.to) {
            const isStart = day.isSame(item.from, 'day');
            const isEnd = day.isSame(item.to, 'day');
            const isMiddle = day.isBetween(item.from, item.to, 'day', '()');

            if (isStart && isEnd) {
                // If the range is only one day long, treat it as a single date
                variant = 'single';
                break;
            } else if (isStart) {
                variant = 'rangeStart';
                break;
            } else if (isEnd) {
                variant = 'rangeEnd';
                break;
            } else if (isMiddle) {
                variant = 'rangeMiddle';
                break;
            }
        }
    }

    // Determine the 'selected' prop based on the variant
    const isSelected = variant !== 'default';

    return (
        <RangeDay
            {...other}
            day={day}
            variant={variant}
            selected={isSelected} // Pass the boolean selected state
            disableMargin
        />
    );
};

export function CampsitesCalendar(props) {
    const [site, setSite] = useState([]);
    const [monthsToShow, setMonthsToShow] = useState([dayjs('2025-08-01'), dayjs('2025-09-01')]);
    const [values, setValues] = useState([
        dayjs('2025-08-23'),
        { from: dayjs('2025-08-25'), to: dayjs('2025-08-27') },
        dayjs('2025-08-29'),
        { from: dayjs('2025-09-02'), to: dayjs('2025-09-05') },
        dayjs('2025-09-12')
    ]);
    const [photoPreview, setPhotoPreview] = useState({ open: false, photos: [], siteName: '' });


    useEffect(() => {
        if (!props.site) return;
        setSite(props.site);
    }, [props.site]);

    const buildDateDisplayArray = (site) => {
        const { dates = [], matches = [] } = site;

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

        const allMatchDays = new Set();
        matches.forEach(m => {
            let current = dayjs(m.from);
            const end = dayjs(m.to);
            while (current.isBefore(end, 'day')) {
                allMatchDays.add(current.format('YYYY-MM-DD'));
                current = current.add(1, 'day');
            }
        });

        const singles = dates
            .filter(d => !allMatchDays.has(d))
            .map(d => ({ from: dayjs(d), to: dayjs(d).add(1, 'day') }));

        const combined = [...singles, ...matchRanges].sort((a, b) => {
            const aDate = dayjs(a.from ?? a);
            const bDate = dayjs(b.from ?? b);
            return aDate.diff(bDate);
        });

        return combined;
    };

    const getMonthsFromSiteData = (site) => {
        const { dates = [], matches = [] } = site;

        const monthsSet = new Set();

        // Add months from single dates
        dates.forEach(dateStr => {
            monthsSet.add(dayjs(dateStr).startOf("month").format("YYYY-MM-DD"));
        });

        // Add months from match ranges
        matches.forEach(m => {
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

    useEffect(() => {
        if (!site) return;
        const formattedDates = buildDateDisplayArray(site);
        setValues(formattedDates);
        const formattedMonths = getMonthsFromSiteData(site);
        setMonthsToShow(formattedMonths);
    }, [site]);

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
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
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
                                    key={month}
                                    displayStaticWrapperAs="desktop"
                                    value={month}
                                    slots={{
                                        day: ServerDay
                                    }}
                                    slotProps={{
                                        day: { highlightedValues: values },
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
                                            height: '190px',
                                            width: '230px',
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
}
