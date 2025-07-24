import { useEffect, useState } from 'react';

import Box from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import { checkForGroupAvailability } from '../utils/utils';
import { Campground } from './Campground';

export function CampgroundsGroups(props) {
    const [groups, setGroups] = useState({});
    const [hasGroupAvailability, setHasGroupAvailability] = useState(false);


    useEffect(() => {
        // console.log('props: ', props);
    }, [props]);

    useEffect(() => {
        // console.log('props.data: ', props.data);
        setGroups(props.groups);
    }, [props.groups]);

    useEffect(() => {
        let groupAvailability = checkForGroupAvailability(groups);
        setHasGroupAvailability(groupAvailability);
    }, [groups]);

    useEffect(() => {
        console.log('hasGroupAvailability: ', hasGroupAvailability)
    }, [hasGroupAvailability]);

    // console.log('hasAvailability', hasAvailability);

    return (
        <>
            {Object.keys(groups).map((key, index) => {
                const parentGroup = groups[key];
                return (
                    <Stack key={key} spacing={1}>
                        {index > 0 && <Divider orientation="horizontal" flexItem />}
                        <Typography variant='h4'>{key}</Typography>
                        <Typography variant='span' gutterBottom>
                            Campgrounds In Area: {parentGroup.length}
                        </Typography>
                        {parentGroup.map((campground, campgroundIndex) => {
                            // let hasGroupAvailability = checkForGroupAvailability(campground);
                            // console.log('hasGroupAvailability: ', hasGroupAvailability);
                            return (
                                <Stack key={campground + campgroundIndex}>
                                    <Campground
                                        key={key}
                                        campground={campground}
                                        type='all-sites'
                                    />
                                </Stack>
                            )
                        })}
                    </Stack>
                )
            })}
        </>
    );
}