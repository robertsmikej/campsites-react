// Change detection: compare current matches against previous state
// to identify NEW availability that should trigger a notification.

// Generate a deterministic signature string for a match
export const generateSignature = (campgroundId, siteId, match) => {
    return `${campgroundId}:${siteId}:${match.from}:${match.to}:${match.nights}`;
};

// Build a Set of all match signatures from current results
export const buildSignatureSet = (results) => {
    const signatures = new Set();
    for (const result of results) {
        for (const [siteId, site] of Object.entries(result.sites)) {
            for (const match of site.matches || []) {
                signatures.add(generateSignature(result.campgroundId, siteId, match));
            }
        }
    }
    return signatures;
};

// Find matches in current results that weren't in the previous signature set
export const findNewMatches = (currentResults, previousSignatures, siteConfigurations) => {
    const newMatches = [];

    for (const result of currentResults) {
        const config = siteConfigurations.find((c) => c.id === result.campgroundId);
        const favorites = new Set(config?.sites?.favorites || []);
        const worthwhile = new Set(config?.sites?.worthwhile || []);

        for (const [siteId, site] of Object.entries(result.sites)) {
            for (const match of site.matches || []) {
                const signature = generateSignature(result.campgroundId, siteId, match);
                if (!previousSignatures.has(signature)) {
                    let group = 'all-others';
                    if (favorites.has(site.siteName)) group = 'favorites';
                    else if (worthwhile.has(site.siteName)) group = 'worthwhile';

                    newMatches.push({
                        campgroundId: result.campgroundId,
                        campgroundName: result.campgroundName,
                        campgroundArea: result.campgroundArea,
                        campgroundDescription: result.campgroundDescription,
                        siteId,
                        siteName: site.siteName,
                        match,
                        group,
                    });
                }
            }
        }
    }

    return newMatches;
};
