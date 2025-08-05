import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Campsites } from './Campsites';
import { checkForAvailabilityInArray } from '../utils/utils';

export function Campground(props) {
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
                                    <Campsites
                                        key={campground.name + typeIndex}
                                        data={group}
                                        site={type}
                                        campground={campground}
                                    />
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
