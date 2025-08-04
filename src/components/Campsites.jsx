import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Box from '@mui/material/Container'
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import { flattenData, formatToMMDDYYYY, getDayOfWeek, groupArrayOfObjectsByKey, sortByFromDate, sortBySiteName } from '../utils/tables/formatRows';
import { checkForAvailability, checkForAvailabilityInArray, getSitesWithMatches } from '../utils/utils';

export function Campsites(props) {
    const siteSettings = useContext(SiteSettings);

    const [hasSiteAvailability, setHasSiteAvailability] = useState(false);
    const [sites, setSites] = useState([]);
    const [rows, setRows] = useState([]);
    const [tableTypes, setTableTypes] = useState({
        'Favorites': {
            'headers': ['Site #', 'Start Day', 'From', 'To', 'Total Nights'],
            'rowKeys': ['']
        },
        'Worthwhile': {
            'headers': ['Site #', 'Start Day', 'From', 'To', 'Total Nights'],
            'rowKeys': ['']
        },
        'All Others': {
            'headers': ['Site #', 'Start Day', 'From', 'To', 'Total Nights'],
            'rowKeys': ['']
        }
    });


    useEffect(() => {
        if (!props.data) return;
        // console.log('props.data: ', props.data);
        setSites(Object.values(props.data));
    }, [props.data]);

    useEffect(() => {
        // if (sites?.length > 0) {
        //     console.log('sites', sites);
        // }
        const isThereAvailability = checkForAvailabilityInArray(sites);
        setHasSiteAvailability(isThereAvailability);
    }, [sites, props.data]);

    useEffect(() => {

        // console.log('hasAvailability: ', hasAvailability);

    }, [hasSiteAvailability]);

    const TableHeading = (props) => {
        return (
            <TableHead>
                <TableRow>
                    {tableTypes[props.site].headers.map((header, headerIndex) => (
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
        const dayOfWeek = getDayOfWeek(props.row.from);
        let isPreferred = siteSettings.dates.preferredStartDays.includes(dayOfWeek);
        return (
            <TableRow
                key={props.row.from + props.row.to + props.row.index}
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                selected={isPreferred}
                onClick={() => goToPage(props)}
            >
                <TableCell>{props.site.siteName}</TableCell>
                <TableCell>{dayOfWeek}</TableCell>
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
                    <TableHeading site={props.site ? props.site : 'all-types'} />
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