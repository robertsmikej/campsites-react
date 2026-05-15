import { useEffect, useState, useContext, useMemo, memo } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';

import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import LaunchIcon from '@mui/icons-material/Launch';

import { formatToMMDDYYYY, getDayOfWeek, getShortenedDayOfWeek, sortByFromDate, sortBySiteName } from '../utils/utils';
import { getSitesWithMatches, goToPage } from '../utils/utils';

export const CampsitesTable = memo(function CampsitesTable(props) {
    const siteSettings = useContext(SiteSettings);

    const [sites, setSites] = useState([]);
    const [photoPreview, setPhotoPreview] = useState({ open: false, photos: [], siteName: '' });

    useEffect(() => {
        if (!props.data) return;
        setSites(Object.values(props.data));
    }, [props.data]);

    const openPhotoPreview = (site) => () => {
        const campgroundId = props.campground?.id;
        const siteNumber = site.siteName?.replace(/^Site\s+/i, '');
        const fallback = props.campground?.image ? `/images/sites/${props.campground.image}` : '/images/sites/bg_default.jpg';

        // Check for photos in the campground's directory: /images/sites/{campgroundId}/{siteNumber}.jpg
        // Also support explicit photos array from data
        const sitePhotos = site.photos?.length ? site.photos : site.photo ? [site.photo] : [];
        const resolvedPhotos = sitePhotos.map(photo => {
            if (photo.startsWith('http')) return photo;
            return photo.startsWith('/images/') ? photo : `/images/sites/${photo}`;
        });

        // If no explicit photos, try the convention-based path, then fall back to campground map
        if (resolvedPhotos.length === 0 && campgroundId && siteNumber) {
            resolvedPhotos.push(`/images/sites/${campgroundId}/${siteNumber}.jpg`);
        }
        if (resolvedPhotos.length === 0) {
            resolvedPhotos.push(fallback);
        }

        setPhotoPreview({
            open: true,
            photos: resolvedPhotos,
            siteName: site.siteName,
        });
    };

    const closePhotoPreview = () => setPhotoPreview({ open: false, photos: [], siteName: '' });

    const CampsiteCard = ({ match, site }) => {
        if (!match?.from) return null;
        const isExcluded = !!match.excluded;
        const dayOfWeek = getDayOfWeek(match.from, true, true);
        const isPreferred = !isExcluded && siteSettings.dates.preferredStartDays.includes(dayOfWeek);
        const shortedDayOfWeek = getShortenedDayOfWeek(dayOfWeek);
        const rowProps = {
            row: match,
            site,
            sitesArr: props.data,
            campsite: props.campground,
        };
        return (
            <Card
                variant="outlined"
                sx={{
                    borderColor: isExcluded ? 'warning.main' : isPreferred ? 'primary.light' : 'divider',
                    borderWidth: isExcluded ? 2 : isPreferred ? 2 : 1,
                    opacity: isExcluded ? 0.75 : 1,
                }}
            >
                <CardContent>
                    <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                            <Stack spacing={0.25}>
                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: 'fit-content' }}>
                                    <Typography variant="h6">{site.siteName}</Typography>
                                    <Tooltip title="View photos">
                                        <IconButton
                                            size="small"
                                            color="default"
                                            onClick={openPhotoPreview(site)}
                                            sx={{ p: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}
                                        >
                                            <PhotoCameraIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                                <Typography variant="body2" color="text.secondary">
                                    {site?.loop ?? props.campground?.name}
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.5}>
                                <Chip label={`${match.nights} nights`} color={isExcluded ? 'warning' : 'primary'} variant="outlined" size="small" />
                                <Chip label={`Arrives ${shortedDayOfWeek}`} size="small" />
                                {isPreferred && <Chip label="Preferred start" color="success" size="small" />}
                                {isExcluded && <Chip label={match.reason === 'stayLength' ? 'Excluded: stay length' : 'Excluded: start day'} color="warning" size="small" />}
                            </Stack>
                        </Stack>
                        <Divider />
                        <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="overline" color="text.secondary">
                                    Arrival
                                </Typography>
                                <Typography variant="body1">{formatToMMDDYYYY(match.from)}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="overline" color="text.secondary">
                                    Departure
                                </Typography>
                                <Typography variant="body1">{formatToMMDDYYYY(match.to)}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="overline" color="text.secondary">
                                    Loop
                                </Typography>
                                <Typography variant="body1">{site.loop ?? 'Primary'}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="overline" color="text.secondary">
                                    Type
                                </Typography>
                                <Typography variant="body1">{site.campsite_type ?? 'Standard'}</Typography>
                            </Grid>
                        </Grid>
                    </Stack>
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2 }}>
                    <Tooltip title="View site on Recreation.gov">
                        <Button
                            size="small"
                            color="primary"
                            endIcon={<LaunchIcon fontSize="small" />}
                            onClick={() => goToPage(rowProps)}
                        >
                            Open Site
                        </Button>
                    </Tooltip>
                </CardActions>
            </Card>
        );
    };

    const cards = useMemo(() => {
        if (sites?.length === 0) return null;
        const sitesWithMatches = getSitesWithMatches(sites);
        const sortedMatches = sortBySiteName(sitesWithMatches);
        const result = [];
        sortedMatches.forEach(site => {
            const sortedMatchesByDate = sortByFromDate(site.matches);
            sortedMatchesByDate.forEach(match => {
                result.push({ site, match, key: `${site.siteName}-${match.from}-${match.to}` });
            });
            if (props.showExcluded && site.excludedMatches?.length > 0) {
                sortByFromDate(site.excludedMatches).forEach(match => {
                    result.push({ site, match, key: `${site.siteName}-excluded-${match.from}-${match.to}` });
                });
            }
        });
        if (props.showExcluded) {
            const sitesOnlyExcluded = sites.filter(s =>
                (!s.matches || s.matches.length === 0) && s.excludedMatches?.length > 0
            );
            sortBySiteName(sitesOnlyExcluded).forEach(site => {
                sortByFromDate(site.excludedMatches).forEach(match => {
                    result.push({ site, match, key: `${site.siteName}-excluded-${match.from}-${match.to}` });
                });
            });
        }
        return result.length > 0 ? result : null;
    }, [sites, props.showExcluded]);

    return (
        <>
            <Stack spacing={2}>
                {cards ? cards.map(({ site, match, key }) => (
                    <CampsiteCard key={key} site={site} match={match} />
                )) : (
                    <Typography variant="body2" color="text.secondary">
                        No matching campsites were found.
                    </Typography>
                )}
            </Stack>
            <Dialog
                open={photoPreview.open}
                onClose={closePhotoPreview}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{photoPreview.siteName}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        {photoPreview.photos.map((photo, index) => (
                            <Box
                                key={photo + index}
                                component="img"
                                src={photo}
                                alt={`Campsite photo ${index + 1}`}
                                loading="lazy"
                                sx={{
                                    width: '100%',
                                    borderRadius: 1.5,
                                    border: theme => `1px solid ${theme.palette.divider}`,
                                }}
                            />
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closePhotoPreview} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
});
