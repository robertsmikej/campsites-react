import { useState } from 'react';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Top-level navigation bar for the application.
 * Provides a consistent place for the app title and high level actions.
 */
export function TopBar({
    title = 'Campground Availability',
    subtitle,
    logo,
    onRefresh,
    isRefreshing = false,
    actionItems,
    onMenuClick,
    menuItems = [],
    onMenuItemSelect,
    menuButtonLabel = 'Menu',
}) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [menuAnchor, setMenuAnchor] = useState(null);

    const hasMenu = Array.isArray(menuItems) && menuItems.length > 0;

    const handleMenuOpen = (event) => {
        setMenuAnchor(event.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
    };

    const handleMenuItemClick = (item) => () => {
        if (item?.action) {
            item.action();
        }
        if (item?.href && typeof window !== 'undefined') {
            const target = item.newTab === false ? '_self' : '_blank';
            window.open(item.href, target, 'noopener,noreferrer');
        }
        if (onMenuItemSelect) {
            onMenuItemSelect(item);
        }
        handleMenuClose();
    };

    const renderLogo = () => {
        if (!logo) return null;
        if (typeof logo === 'string') {
            return (
                <Box
                    component="img"
                    src={logo}
                    alt="Site logo"
                    sx={{ height: 36, width: 'auto' }}
                />
            );
        }
        if (logo?.src) {
            return (
                <Box
                    component="img"
                    src={logo.src}
                    alt={logo.alt ?? 'Site logo'}
                    sx={{
                        height: logo.height ?? 36,
                        width: logo.width ?? 'auto',
                        objectFit: 'contain',
                    }}
                />
            );
        }
        return logo;
    };

    return (
        <AppBar
            position="sticky"
            color="default"
            elevation={1}
            sx={{
                mb: 2,
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.text.primary,
            }}
        >
            <Toolbar>
                {isMobile && onMenuClick && (
                    <IconButton
                        size="large"
                        edge="start"
                        color="inherit"
                        aria-label="menu"
                        sx={{ mr: 2 }}
                        onClick={onMenuClick}
                    >
                        <MenuIcon />
                    </IconButton>
                )}
                <Stack direction="row" spacing={2} alignItems="center">
                    {renderLogo()}
                    <Box>
                        <Typography variant="h6" component="div">
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" color="text.secondary" component="div">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                <Box sx={{ flexGrow: 1 }} />
                <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ flexWrap: 'wrap', rowGap: 1 }}
                >
                    {hasMenu && (
                        <>
                            <Button
                                variant="outlined"
                                color="inherit"
                                onClick={handleMenuOpen}
                                startIcon={<MenuIcon />}
                                size="small"
                            >
                                {menuButtonLabel}
                            </Button>
                            <Menu
                                anchorEl={menuAnchor}
                                open={Boolean(menuAnchor)}
                                onClose={handleMenuClose}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            >
                                {menuItems.map((item) => (
                                    <MenuItem key={item.label} onClick={handleMenuItemClick(item)}>
                                        {item.label}
                                    </MenuItem>
                                ))}
                            </Menu>
                        </>
                    )}
                    {actionItems}
                    {onRefresh && (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? (
                                <CircularProgress color="inherit" size={20} thickness={5} />
                            ) : (
                                'Refresh'
                            )}
                        </Button>
                    )}
                </Stack>
            </Toolbar>
        </AppBar>
    );
}
