import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Campsites } from './Campsites';
import { checkForAvailabilityInArray } from '../utils/utils';

export function Campground(props) {
    const siteSettings = useContext(SiteSettings);

    const [campground, setCampground] = useState({});

    useEffect(() => {
        // console.log('props.data: ', props.data);
        setCampground(props.campground);
    }, [props.campground]);


    useEffect(() => {
        if (Object.keys(campground).length > 0) {
            // console.log('campground: ', campground);
        }
    }, [campground]);

    return (
        <>
            {campground.sitesGroupedByFavorites &&
                <Stack key={campground.name} spacing={3}>
                    {Object.keys(campground.sitesGroupedByFavorites).map((type, typeIndex) => {
                        if (siteSettings.showOrHideOverride && !siteSettings.showOrHideOverride[type]) {
                            return null;
                        }
                        if (!campground.showOrHide[type]) {
                            return null;
                        }
                        const group = campground.sitesGroupedByFavorites[type];
                        const hasPreferenceAvailability = checkForAvailabilityInArray(group);
                        return hasPreferenceAvailability ? (
                            <Stack spacing={1} key={campground.name + typeIndex}>
                                <Typography variant='h5'>{type}</Typography>
                                <Campsites
                                    key={campground.name + typeIndex}
                                    data={group}
                                    site={type}
                                    campground={campground}
                                />
                            </Stack>
                        ) : null;
                    })}
                </Stack>
            }
        </>
    )
}
