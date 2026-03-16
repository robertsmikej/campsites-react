import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { CampsitesCalendar } from './CampsitesCalendar';

export function CampsitesCalendarParent(props) {
    const [sites, setSites] = useState([]);

    useEffect(() => {
        if (!props.data) return;
        const sitesData = Object.values(props.data);
        if (sitesData.length > 0) {
            setSites(sitesData);
        }
    }, [props.data]);

    return (
        <Stack spacing={2}>
            {sites.filter(site => site.matches?.length > 0 || site.excludedMatches?.some(m => m.reason === 'startDay') || (props.showExcluded && site.excludedMatches?.length > 0)).map((site, siteIndex) => {
                const hasMatches = site.matches?.length > 0;
                return (
                    <Accordion
                        key={site.siteId + siteIndex ?? siteIndex}
                        defaultExpanded={hasMatches}
                        disableGutters
                        variant="outlined"
                        sx={{
                            borderRadius: '8px !important',
                            border: theme => `1px solid ${theme.palette.divider}`,
                            '&:before': { display: 'none' },
                            overflow: 'hidden',
                        }}
                    >
                        <AccordionSummary
                            expandIcon={<ExpandMoreIcon />}
                            sx={{ px: { xs: 1.5, md: 2 }, py: 0.5 }}
                        >
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ width: '100%', mr: 1 }}>
                                <Stack spacing={0.25}>
                                    <Typography variant="h6">Site: {site.siteName}</Typography>
                                    <Typography variant="body2" color="text.secondary">{site.loop ?? 'Primary loop'}</Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.5} alignItems="center">
                                    {!hasMatches && (
                                        <Chip size="small" label="No matching days" color="default" variant="outlined" />
                                    )}
                                    {hasMatches && (
                                        <Chip size="small" label={`${site.matches.length} match${site.matches.length === 1 ? '' : 'es'}`} color="success" variant="outlined" />
                                    )}
                                    <Chip size="small" label={site.campsite_type ?? 'Standard'} />
                                    {site.max_num_people && <Chip size="small" label={`Up to ${site.max_num_people} people`} />}
                                    {site.max_vehicle_length && <Chip size="small" label={`Vehicle ${site.max_vehicle_length} ft`} />}
                                </Stack>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: { xs: 1.5, md: 2 }, pt: 0 }}>
                            <CampsitesCalendar site={site} campground={props.campground} showExcluded={props.showExcluded} />
                            {props.showExcluded && site.excludedMatches?.length > 0 && (
                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                    {site.excludedMatches.map((m, i) => (
                                        <Chip
                                            key={i}
                                            size="small"
                                            color="warning"
                                            variant="outlined"
                                            label={`${m.from} → ${m.nights}n (${m.reason === 'stayLength' ? 'stay too short' : 'wrong start day'})`}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </AccordionDetails>
                    </Accordion>
                )
            })}
        </Stack>
    );
}
