import { useEffect, useState, useContext } from 'react';

import SiteSettings from '../context/SiteSettingsContext';

import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
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

export function CampsitesTable(props) {
    const siteSettings = useContext(SiteSettings);

    const [sites, setSites] = useState([]);
    const [photoPreview, setPhotoPreview] = useState({ open: false, photos: [], siteName: '' });

    useEffect(() => {
        if (!props.data) return;
        setSites(Object.values(props.data));
    }, [props.data]);

    const openPhotoPreview = (site) => () => {
        const fallback = props.campground?.image ? `/images/sites/${props.campground.image}` : '/images/sites/bg_default.jpg';
        const sitePhotos = site.photos?.length ? site.photos : site.photo ? [site.photo] : [fallback];
        const resolvedPhotos = sitePhotos.map(photo => {
            if (photo.startsWith('http')) {
                return photo;
            }
            return photo.startsWith('/images/') ? photo : `/images/sites/${photo}`;
        });
        setPhotoPreview({
            open: true,
            photos: resolvedPhotos,
            siteName: site.siteName,
        });
    };

    const closePhotoPreview = () => setPhotoPreview({ open: false, photos: [], siteName: '' });

    const CampsiteCard = ({ match, site }) => {
        if (!match?.from) return null;
        const dayOfWeek = getDayOfWeek(match.from, true, true);
        const isPreferred = siteSettings.dates.preferredStartDays.includes(dayOfWeek);
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
                    borderColor: isPreferred ? 'primary.light' : 'divider',
                    borderWidth: isPreferred ? 2 : 1,
                }}
            >
                <CardContent>
                    <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                            <Stack spacing={0.25}>
                                <Typography variant="h6">{site.siteName}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {site?.loop ?? props.campground?.name}
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.5}>
                                <Chip label={`${match.nights} nights`} color="primary" variant="outlined" size="small" />
                                <Chip label={`Arrives ${shortedDayOfWeek}`} size="small" />
                                {isPreferred && <Chip label="Preferred start" color="success" size="small" />}
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
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
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
                    <Tooltip title="Preview campsite photos">
                        <span>
                            <Button
                                size="small"
                                color="inherit"
                                startIcon={<PhotoCameraIcon fontSize="small" />}
                                onClick={openPhotoPreview(site)}
                            >
                                Photos
                            </Button>
                        </span>
                    </Tooltip>
                </CardActions>
            </Card>
        );
    };

    const renderCards = () => {
        if (sites?.length === 0) {
            return (
                <Typography variant="body2" color="text.secondary">
                    No matching campsites were found.
                </Typography>
            );
        }
        const sitesWithMatches = getSitesWithMatches(sites);
        const sortedMatches = sortBySiteName(sitesWithMatches);
        const cards = [];
        sortedMatches.forEach(site => {
            const sortedMatchesByDate = sortByFromDate(site.matches);
            site.matches = sortedMatchesByDate;
            site.matches.forEach(match => {
                cards.push(
                    <CampsiteCard key={`${site.siteName}-${match.from}-${match.to}`} site={site} match={match} />
                );
            });
        });
        if (cards.length === 0) {
            return (
                <Typography variant="body2" color="text.secondary">
                    No matching campsites were found.
                </Typography>
            );
        }
        return cards;
    };

    return (
        <>
            <Stack spacing={2}>
                {renderCards()}
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
}
