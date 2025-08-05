import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

import { formatToMMDDYYYY, getDayOfWeek, getShortenedDayOfWeek, sortByFromDate, sortBySiteName } from '../utils/tables/formatRows';
import { getSitesWithMatches } from '../utils/utils';

export function Campsites(props) {
    const siteSettings = useContext(SiteSettings);

    // const [hasSiteAvailability, setHasSiteAvailability] = useState(false);
    const [sites, setSites] = useState([]);

    const tableHeaders = ['Site #', 'Start Day', 'From', 'To', 'Total Nights'];


    useEffect(() => {
        if (!props.data) return;
        // console.log('props.data: ', props.data);
        setSites(Object.values(props.data));
    }, [props.data]);

    // useEffect(() => {
    //     const isThereAvailability = checkForAvailabilityInArray(sites);
    //     setHasSiteAvailability(isThereAvailability);
    // }, [sites, props.data]);


    const TableHeading = (props) => {
        return (
            <TableHead>
                <TableRow>
                    {props.headings.map((header, headerIndex) => (
                        <TableCell key={header + headerIndex}>{header}</TableCell>
                    ))}
                </TableRow>
            </TableHead>
        );
    };

    const buildReservationLink = (siteId, fromDate, nights) => {
        const from = new Date(fromDate);
        const to = new Date(from);
        to.setDate(from.getDate() + nights);
        const arrival = from.toISOString().split('T')[0];
        const departure = to.toISOString().split('T')[0];
        return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
    };

    const goToPage = (data) => {
        const siteId = data.site.siteId;
        const fromDate = data.row.from;
        const nights = data.row.nights;
        const url = buildReservationLink(siteId, fromDate, nights);
        window.open(url, "_blank", "noreferrer");
    };

    const TableRowEl = (props) => {
        if (!props.row.from) return;
        const dayOfWeek = getDayOfWeek(props.row.from, true, true);
        let isPreferred = siteSettings.dates.preferredStartDays.includes(dayOfWeek);
        const shortedDayOfWeek = getShortenedDayOfWeek(dayOfWeek);
        return (
            <TableRow
                key={props.row.from + props.row.to + props.row.index}
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                selected={isPreferred}
                onClick={() => goToPage(props)}
            >
                <TableCell>{props.site.siteName}</TableCell>
                <TableCell>{shortedDayOfWeek}</TableCell>
                <TableCell>{formatToMMDDYYYY(props.row.from)}</TableCell>
                <TableCell>{formatToMMDDYYYY(props.row.to)}</TableCell>
                <TableCell>{props.row.nights}</TableCell>
            </TableRow >
        );
    }

    const TableContents = (props) => {
        if (props.rows?.length === 0) return;
        const sitesWithMatches = getSitesWithMatches(props.rows);
        const sortedMatches = sortBySiteName(sitesWithMatches);
        return (
            <TableBody>
                {sortedMatches.map((site, rowIndex) => {
                    const sortedMatchesByDate = sortByFromDate(site.matches);
                    site.matches = sortedMatchesByDate;
                    return site.matches.map((row, rowIndex) => {
                        return (
                            <TableRowEl
                                key={rowIndex + row.from + row.to}
                                row={row}
                                site={site}
                                sitesArr={props.sitesArr}
                                campsite={props.campsite}
                            />
                        )
                    });
                })}
            </TableBody>
        );
    };



    return (
        <Stack spacing={2}>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHeading headings={tableHeaders} />
                    <TableContents
                        rows={sites}
                        sitesArr={props.data}
                        campsite={props.campground}
                    />
                </Table>
            </TableContainer>
        </Stack>
    );
}