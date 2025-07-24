import { useEffect, useState } from 'react';

import Box from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import { Campsites } from './Campsites';
import { checkForGroupAvailability } from '../utils/utils';

export function Campground(props) {
    const [campground, setCampground] = useState({});
    const [hasCampgroundAvailability, setHasCampgroundAvailability] = useState(false);

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
        <Stack key={campground.name}>
            <Campsites
                key={campground.name}
                data={campground}
                type='all-sites'
            />
        </Stack>
    )

}
