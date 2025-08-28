import { useEffect, useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import { checkForAvailabilityInArray, checkForGroupedAvailability, getAllArraysFromParentObjects } from '../utils/utils';
import { Campground } from './Campground';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';

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
                        {index > 0 &&
                            <Divider

                                orientation="horizontal"
                                flexItem
                            />}
                        <Typography variant='h2'>{key}</Typography>
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
                                        <Grid
                                            container
                                            spacing={3}
                                        >
                                            <Grid
                                                size={{ xs: 12, md: 3, lg: 4 }}
                                            >
                                                <Stack spacing={1}>
                                                    <Divider>
                                                        <Typography variant='h4'>{campground.name}</Typography>
                                                    </Divider>
                                                    <Typography variant='body'>{campground.description}</Typography>
                                                    <Box
                                                        sx={{
                                                            maxWidth: '100%',
                                                            marginTop: '10px',
                                                            display: { xs: 'none', sm: 'block' },
                                                        }}
                                                    >
                                                        <img
                                                            src={`${campgroundImage}`}
                                                            alt={campground.name}
                                                            loading="lazy"
                                                            style={{
                                                                maxWidth: '100%',
                                                                maxHeight: '300px',
                                                            }}
                                                        />
                                                    </Box>
                                                </Stack>
                                            </Grid>
                                            <Grid
                                                size='grow'
                                            >
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
                                        <Divider
                                            sx={{
                                                marginTop: '12px !important',
                                            }}
                                        />
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