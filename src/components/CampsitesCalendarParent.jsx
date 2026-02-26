import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';

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
            {sites.filter(site => site.matches?.length > 0 || (props.showExcluded && site.excludedMatches?.length > 0)).map((site, siteIndex) => {
                return (
                    <Card key={site.siteId + siteIndex ?? siteIndex} variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                                <Stack spacing={0.25}>
                                    <Typography variant="h6">Site: {site.siteName}</Typography>
                                    <Typography variant="body2" color="text.secondary">{site.loop ?? 'Primary loop'}</Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.5}>
                                    <Chip size="small" label={site.campsite_type ?? 'Standard'} />
                                    {site.max_num_people && <Chip size="small" label={`Up to ${site.max_num_people} people`} />}
                                    {site.max_vehicle_length && <Chip size="small" label={`Vehicle ${site.max_vehicle_length} ft`} />}
                                </Stack>
                            </Stack>
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
                        </CardContent>
                    </Card>
                )
            })}
        </Stack>
    );
}
