import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import dayjs, { Dayjs } from 'dayjs';

import { styled } from "@mui/material/styles";
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import TextField from '@mui/material/TextField';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

import Stack from '@mui/material/Stack';

// import Paper from '@mui/material/Paper';

// import { formatToMMDDYYYY, getDayOfWeek, getShortenedDayOfWeek, sortByFromDate, sortBySiteName } from '../utils/tables/formatRows';
// import { getSitesWithMatches, goToPage } from '../utils/utils';

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

    const isInRange = (date, range) => {
        // The date and range dates are now already normalized by the caller
        return date.isBetween(range.from, range.to, 'day', '[]');
    };

    const CustomPickersDay = styled(PickersDay, {
        shouldForwardProp: (prop) => prop !== "selected"
    })(({ theme, selected }) => ({
        ...(selected && {
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.common.white,
            "&:hover, &:focus": {
                backgroundColor: theme.palette.primary.dark
            },
            borderRadius: "50%"
        })
    }));

    const renderPickerDay = (date, selectedDates, pickersDayProps) => {
        let selected = false;

        // Normalize the date from the picker to ensure reliable comparisons
        const normalizedDate = date.startOf('day');

        for (let item of values) {
            if (dayjs.isDayjs(item)) {
                // Normalize the item date and compare
                if (item.startOf('day').isSame(normalizedDate, 'day')) {
                    selected = true;
                    console.log(`Single date match for: ${normalizedDate.format('YYYY-MM-DD')}`);
                    break;
                }
            }
            if (item?.from && item?.to) {
                // Check if the normalized date is within the normalized range
                if (isInRange(normalizedDate, { from: item.from.startOf('day'), to: item.to.startOf('day') })) {
                    selected = true;
                    console.log(`Range match for: ${normalizedDate.format('YYYY-MM-DD')}`);
                    break;
                }
            }
        }

        return (
            <CustomPickersDay
                {...pickersDayProps}
                disableMargin
                selected={selected}
            />
        );
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Stack direction="row" spacing={2}>
                {monthsToShow.map((month) => (
                    <StaticDatePicker
                        key={month.format('YYYY-MM')}
                        displayStaticWrapperAs="desktop"
                        value={month}
                        onChange={() => { }}
                        renderDay={renderPickerDay}
                        readOnly
                        disableHighlightToday
                    />
                ))}
            </Stack>
        </LocalizationProvider>
    );
}