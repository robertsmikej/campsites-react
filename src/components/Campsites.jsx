import { useEffect, useState } from 'react';

import Box from '@mui/material/Container';
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
import { formatToMMDDYYYY } from '../utils/tables/formatRows';
import { checkForAvailability } from '../utils/utils';

export function Campsites(props) {
    const [hasSiteAvailability, setHasSiteAvailability] = useState(false);
    const [sites, setSites] = useState([]);
    const [rows, setRows] = useState([]);
    const [tableTypes, setTableTypes] = useState({
        'all-sites': {
            'headers': ['Site #', 'site id', 'From', 'To', 'Total Nights'],
            'rowKeys': ['']
        }
    });


    useEffect(() => {
        // console.log('props.data: ', props.data);
        if (!props.data?.siteAvailability) return;
        setSites(Object.values(props.data.siteAvailability));
    }, [props.data]);

    useEffect(() => {
        if (sites?.length > 0) {
            // console.log('sites', sites);
        }
        const isThereAvailability = checkForAvailability(props.data);
        // console.log('isThereAvailability: ', isThereAvailability, props.data);
        setHasSiteAvailability(isThereAvailability);
    }, [sites, props.data]);

    useEffect(() => {

        // console.log('hasAvailability: ', hasAvailability);

    }, [hasSiteAvailability]);

    const TableHeading = (props) => {
        return (
            <TableHead>
                <TableRow>
                    {tableTypes[props.type].headers.map((header, headerIndex) => (
                        <TableCell key={header + headerIndex}>{header}</TableCell>
                    ))}
                </TableRow>
            </TableHead>
        );
    };

    const TableContents = (props) => {
        if (props.rows?.length === 0) return;
        return (
            <TableBody>
                {props.rows.map((row, rowIndex) => {
                    return (
                        <TableRow
                            key={row.from + row.to + row.index}
                            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                        >
                            <TableCell>{props.parent.siteName}</TableCell>
                            <TableCell>{props.parent.siteId}</TableCell>
                            <TableCell>{formatToMMDDYYYY(row.from)}</TableCell>
                            <TableCell>{formatToMMDDYYYY(row.to)}</TableCell>
                            <TableCell>{row.nights}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        );

    };



    // console.log('hasAvailability', hasAvailability);

    return (
        <>
            {/* {hasAvailability.toString()} */}
            {hasSiteAvailability &&
                <Stack spacing={1}>

                    <Typography variant='h6'>{props.data.name}</Typography>
                    {sites.map((campsite, siteIndex) => {
                        // console.log('campsite: ', campsite);
                        // console.log('props', props);
                        const isThereSiteAvailability = checkForAvailability(campsite);
                        // console.log('isThereSiteAvailability: ', isThereSiteAvailability, campsite);
                        if (isThereSiteAvailability) {
                            return (
                                <Box sx={{ p: 1 }} key={campsite.siteId + siteIndex}>
                                    {/* <Typography variant='p'>Site {campsite.siteName}</Typography> */}
                                    <TableContainer component={Paper}>
                                        <Table size="small" sx={{ minWidth: 750 }}>
                                            <TableHeading type={props.type ? props.type : 'all-types'} />
                                            <TableContents parent={campsite} rows={campsite.matches} />
                                        </Table>
                                    </TableContainer>
                                </Box>
                            )
                        } else {
                            return null;
                        }
                    })}
                </Stack>
            }
        </>
    );
}