import { useEffect, useState } from 'react';

// Import the dayjs plugins you need
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

import { styled } from "@mui/material/styles";
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { goToPage } from '../utils/utils';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

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
        backgroundColor: 'red',
        color: theme.palette.primary.contrastText,
        borderRadius: '50%',
        "&:hover, &:focus": {
            backgroundColor: 'darkred'
        },
    }),
    // Styling for a day at the start of a range
    ...(variant === 'rangeStart' && {
        backgroundColor: 'red',
        color: theme.palette.primary.contrastText,
        borderTopLeftRadius: '50%',
        borderBottomLeftRadius: '50%',
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        "&:hover, &:focus": {
            backgroundColor: 'darkred'
        },
    }),
    // Styling for a day in the middle of a range
    ...(variant === 'rangeMiddle' && {
        backgroundColor: 'red',
        color: theme.palette.primary.contrastText,
        borderRadius: 0,
        "&:hover, &:focus": {
            backgroundColor: 'darkred'
        },

    }),
    // Styling for a day at the end of a range
    ...(variant === 'rangeEnd' && {
        backgroundColor: 'red',
        color: theme.palette.primary.contrastText,
        borderTopRightRadius: '0%',
        borderBottomRightRadius: '0%',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        backgroundImage: 'linear-gradient(115deg, #ff0000 65%, #fff 45%)',
        "&:hover, &:focus": {
            backgroundColor: 'darkred',
            backgroundImage: 'linear-gradient(125deg, darkred 65%, #fff 45%)',
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


    useEffect(() => {
        if (!props.site) return;
        setSite(props.site);
    }, [props.data]);

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

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
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
                                    marginTop: '6px',
                                    marginBottom: 0,
                                    minHeight: '20px',
                                    paddingLeft: '12px'
                                },
                                '.MuiDateCalendar-root': {
                                    height: '220px',
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
        </LocalizationProvider>
    );
}