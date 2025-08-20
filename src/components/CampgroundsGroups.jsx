import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import { checkForAvailabilityInArray, checkForGroupedAvailability, getAllArraysFromParentObjects } from '../utils/utils';
import { Campground } from './Campground';
import Grid from '@mui/material/Grid';

export function CampgroundsGroups(props) {
    const [groups, setGroups] = useState({});

    // useEffect(() => {
    //     // console.log('props: ', props);
    // }, [props]);

    useEffect(() => {
        // console.log('props.data: ', props.data);
        setGroups(props.groups);
    }, [props.groups]);

    return (
        <>
            {Object.keys(groups).map((key, index) => {
                const parentGroup = groups[key];
                const flattenedParentGroup = getAllArraysFromParentObjects(parentGroup, 'siteAvailability');
                let hasGroupAvailability = checkForAvailabilityInArray(Object.values(flattenedParentGroup));
                return hasGroupAvailability ? (
                    <Stack
                        key={key + index} spacing={1}
                    >
                        {index > 0 && <Divider orientation="horizontal" flexItem />}
                        <Typography variant='h3'>{key}</Typography>
                        <Typography variant='span' gutterBottom>
                            Campgrounds W/ Availabilty: {parentGroup.length}
                        </Typography>
                        {parentGroup.map((campground, campgroundIndex) => {
                            let hasCampgroundAvailability = checkForGroupedAvailability(campground);
                            const campgroundImage = campground.image?.length > 0 ? '/images/sites/' + campground.image : '/images/sites/bg_default.jpg';
                            if (hasCampgroundAvailability) {
                                return (
                                    <Stack
                                        spacing={4}
                                        key={campground + campgroundIndex}
                                    >
                                        <Grid container spacing={2}>
                                            <Grid size={4}>
                                                <Typography variant='h4'>{campground.name}</Typography>
                                                <Typography variant='subtitle1'>{campground.description}</Typography>
                                                <img
                                                    src={`${campgroundImage}`}
                                                    alt={campground.name}
                                                    loading="lazy"
                                                    style={{
                                                        maxWidth: '100%',
                                                        maxHeight: '300px',
                                                        marginTop: '10px',
                                                    }}
                                                />
                                            </Grid>
                                            <Grid size={8}>
                                                {hasCampgroundAvailability ?
                                                    <Campground
                                                        key={key}
                                                        campground={campground}
                                                        site='all-sites'
                                                    /> :
                                                    <Typography key={campground + campgroundIndex} variant='h5'>No Availability In Set Range</Typography>
                                                }
                                            </Grid>
                                        </Grid>
                                        <Divider />
                                    </Stack>
                                )
                            } else {
                                return null;
                            }
                        })}
                    </Stack >
                ) : null;
            })}
        </>
    );
}