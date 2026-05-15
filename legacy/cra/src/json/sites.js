import { deepMerge } from '../utils/utils';
import { campgroundCatalog } from './campgroundCatalog';
import { defaultCampgroundConfigurations } from './siteConfigurations';

const clone = (value) => JSON.parse(JSON.stringify(value));

const indexById = (entries = []) => {
    return entries.reduce((acc, entry) => {
        if (entry?.id) {
            acc[entry.id] = entry;
        }
        return acc;
    }, {});
};

const mergeCatalogWithConfigurations = (
    catalog = campgroundCatalog,
    configs = defaultCampgroundConfigurations
) => {
    const merged = {};

    Object.entries(catalog).forEach(([system, campgrounds]) => {
        const systemConfigs = indexById(configs[system] ?? []);

        merged[system] = campgrounds.map(campground => {
            const base = clone(campground);
            const overrides = systemConfigs[campground.id];

            if (!overrides) {
                return base;
            }

            return deepMerge(base, clone(overrides));
        });
    });

    return merged;
};

export const sites = mergeCatalogWithConfigurations();

export const getCampgroundOptions = () => {
    return Object.entries(campgroundCatalog).flatMap(([system, camps]) =>
        camps.map(campground => ({
            system,
            ...campground,
        }))
    );
};

export { campgroundCatalog };
