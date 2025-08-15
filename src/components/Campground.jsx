import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CampsitesTable } from './CampsitesTable';
import { CampsitesCalendar } from './CampsitesCalendar';
import { checkForAvailabilityInArray } from '../utils/utils';

export function Campground(props) {
    const siteSettings = useContext(SiteSettings);

    const [campground, setCampground] = useState({});

    useEffect(() => {
        setCampground(props.campground);
    }, [props.campground]);
    return (
        <>
            {campground.sitesGroupedByFavorites &&
                <Stack key={campground.name} spacing={3}>
                    {Object.keys(campground.sitesGroupedByFavorites).map((type, typeIndex) => {
                        const group = campground.sitesGroupedByFavorites[type];
                        if (campground.showOrHide[type] === false) {
                            return null;
                        }
                        if (campground.showOrHide[type]) {
                            const hasPreferenceAvailability = checkForAvailabilityInArray(group);
                            return hasPreferenceAvailability ? (
                                <Stack spacing={1} key={campground.name + typeIndex}>
                                    <Typography variant='h5'>{type}</Typography>
                                    {siteSettings.views.type === 'table' &&
                                        <CampsitesTable
                                            key={campground.name + typeIndex}
                                            data={group}
                                            site={type}
                                            campground={campground}
                                        />}
                                    {siteSettings.views.type === 'calendar' &&

                                        <CampsitesCalendar
                                            key={campground.name + typeIndex}
                                            data={group}
                                            site={type}
                                            campground={campground}
                                        />}
                                </Stack>
                            ) : null;
                        }
                        return null;
                    })}
                </Stack>
            }
        </>
    )
}
