import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

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
        <>
            {sites.map((site, siteIndex) => {
                return (
                    <Stack key={site.siteId + siteIndex ?? siteIndex}>
                        <Typography variant="body">
                            Site: {site.siteName}
                        </Typography>
                        <CampsitesCalendar site={site} />
                    </Stack>
                )
            })}
        </>
    );
}