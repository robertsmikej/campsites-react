import { useEffect, useState, useContext } from 'react';

import ProgressBar from '../context/ProgressBarContext';

import LinearProgress from '@mui/material/LinearProgress';

export function ProgressBarEl(props) {
    const progressBar = useContext(ProgressBar);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!progressBar) return;
        setProgress(progressBar);
    }, [progressBar]);

    return progress?.progress > 0 && (
        <LinearProgress variant="determinate" value={progress.progress * 100} />
    );
}