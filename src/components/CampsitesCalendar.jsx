import { useEffect, useState } from 'react';

// Import the dayjs plugins you need
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

import { styled } from "@mui/material/styles";
import Stack from '@mui/material/Stack';

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

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
        borderTopRightRadius: '50%',
        borderBottomRightRadius: '50%',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        "&:hover, &:focus": {
            backgroundColor: 'darkred'
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
    const [sites, setSites] = useState([]);
    const [monthsToShow, setMonthsToShow] = useState([dayjs('2025-08-01'), dayjs('2025-09-01')]);

    const [values, setValues] = useState([
        dayjs('2025-08-17'),
        { from: dayjs('2025-08-10'), to: dayjs('2025-08-15') },
        dayjs('2025-08-25'),
        { from: dayjs('2025-09-02'), to: dayjs('2025-09-05') },
        dayjs('2025-09-12')
    ]);

    useEffect(() => {
        if (!props.data) return;
        setSites(Object.values(props.data));
    }, [props.data]);

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Stack direction="row" spacing={2}>
                {monthsToShow.map((month) => (
                    <StaticDatePicker
                        key={month.format('YYYY-MM')}
                        displayStaticWrapperAs="desktop"
                        value={month}
                        onChange={() => { }}
                        readOnly
                        slots={{ day: ServerDay }}
                        slotProps={{ day: { highlightedValues: values } }}
                    />
                ))}
            </Stack>
        </LocalizationProvider>
    );
}