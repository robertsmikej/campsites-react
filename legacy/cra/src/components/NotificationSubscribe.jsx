import { useState } from 'react';

import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

export function NotificationSubscribe() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'already' | 'error'
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setStatus('error');
            setErrorMessage('Please enter a valid email address');
            return;
        }

        setStatus('loading');
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed }),
            });
            const data = await response.json();

            if (!response.ok) {
                setStatus('error');
                setErrorMessage(data.error || 'Something went wrong');
                return;
            }

            if (data.message === 'Already subscribed') {
                setStatus('already');
            } else {
                setStatus('success');
                setEmail('');
            }
        } catch {
            setStatus('error');
            setErrorMessage('Could not connect to the server');
        }
    };

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={0.5} alignItems="center">
                <NotificationsActiveIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                    Get emailed when new campsites in our curated list open up
                </Typography>
            </Stack>
            <form onSubmit={handleSubmit}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                    <TextField
                        size="small"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (status && status !== 'loading') setStatus(null);
                        }}
                        disabled={status === 'loading'}
                        sx={{ minWidth: 220 }}
                    />
                    <Button
                        type="submit"
                        variant="outlined"
                        size="small"
                        disabled={status === 'loading'}
                        sx={{ whiteSpace: 'nowrap', height: 40 }}
                    >
                        {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
                    </Button>
                </Stack>
            </form>
            <Collapse in={status === 'success' || status === 'already' || status === 'error'}>
                {status === 'success' && (
                    <Alert severity="success" variant="outlined" sx={{ py: 0 }}>
                        Subscribed! You'll get an email when new availability is found.
                    </Alert>
                )}
                {status === 'already' && (
                    <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
                        That email is already subscribed.
                    </Alert>
                )}
                {status === 'error' && (
                    <Alert severity="error" variant="outlined" sx={{ py: 0 }}>
                        {errorMessage}
                    </Alert>
                )}
            </Collapse>
        </Stack>
    );
}
