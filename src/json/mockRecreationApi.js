const buildAvailability = (dates) => {
    return dates.reduce((acc, date) => {
        acc[`${date}T00:00:00Z`] = 'Available';
        return acc;
    }, {});
};

const createCampsite = (siteNumber, availableDates, overrides = {}) => {
    return {
        availabilities: buildAvailability(availableDates),
        campsite_id: `${siteNumber}`,
        campsite_reserve_type: 'INDIVIDUAL',
        campsite_type: 'STANDARD NONELECTRIC',
        loop: 'PRIMARY LOOP',
        max_num_people: 8,
        max_vehicle_length: 45,
        min_num_people: 1,
        site: siteNumber,
        ...overrides,
    };
};

const createResponse = (campsites) => {
    return {
        campsites,
        count: Object.keys(campsites).length,
        next_available_date: null,
    };
};

export const mockRecreationApiResponses = {
    '232358-2025-09': createResponse({
        '232358-013': createCampsite('013', ['2025-09-06', '2025-09-07', '2025-09-08', '2025-09-11', '2025-09-12']),
        '232358-015': createCampsite('015', ['2025-09-14', '2025-09-15', '2025-09-16']),
        '232358-021': createCampsite('021', ['2025-09-03', '2025-09-04']),
    }),
    '232358-2025-10': createResponse({
        '232358-013': createCampsite('013', ['2025-10-02', '2025-10-03']),
        '232358-015': createCampsite('015', ['2025-10-10', '2025-10-11']),
    }),
    '232050-2025-10': createResponse({
        '232050-016': createCampsite('016', ['2025-10-02', '2025-10-03']),
        '232050-012': createCampsite('012', ['2025-10-10', '2025-10-11']),
    }),
    '233858-2025-09': createResponse({
        '233858-014': createCampsite('014', ['2025-09-09', '2025-09-10', '2025-09-11']),
        '233858-010': createCampsite('010', ['2025-09-20', '2025-09-21']),
        '233858-033': createCampsite('033', ['2025-09-27']),
    }),
    '233858-2025-10': createResponse({
        '233858-014': createCampsite('014', ['2025-10-04', '2025-10-05']),
        '233858-018': createCampsite('018', ['2025-10-18', '2025-10-19']),
    }),
    '232085-2025-09': createResponse({}),
    '232085-2025-10': createResponse({}),
    '234150-2025-09': createResponse({
        '234150-026': createCampsite('026', ['2025-09-05', '2025-09-06']),
        '234150-027': createCampsite('027', ['2025-09-12', '2025-09-13']),
    }),
    '232087-2025-09': createResponse({
        '232087-007': createCampsite('007', ['2025-09-08', '2025-09-09']),
    }),
    '232169-2025-09': createResponse({
        '232169-014': createCampsite('014', ['2025-09-03', '2025-09-05']),
        '232169-015': createCampsite('015', ['2025-09-10', '2025-09-11']),
        '232169-012': createCampsite('012', ['2025-09-16', '2025-09-17']),
    }),
    '232098-2025-09': createResponse({
        '232098-010': createCampsite('010', ['2025-09-07', '2025-09-08']),
        '232098-013': createCampsite('013', ['2025-09-14', '2025-09-15']),
        '232098-025': createCampsite('025', ['2025-09-21', '2025-09-22']),
    }),
    '233348-2025-10': createResponse({
        '233348-RF01': createCampsite('RF01', ['2025-10-04', '2025-10-05']),
    }),
};

export const getMockApiResponse = (facilityId, month) => {
    return mockRecreationApiResponses[`${facilityId}-${month}`] ?? null;
};
