function createData(name, calories, fat, carbs, protein, price) {
    return {
        name,
        calories,
        fat,
        carbs,
        protein,
        price,
        history: [
            {
                date: '2020-01-05',
                customerId: '11091700',
                amount: 3,
            },
            {
                date: '2020-01-02',
                customerId: 'Anonymous',
                amount: 1,
            },
        ],
    };
}


const rows = [
    createData('Frozen yoghurt', 159, 6.0, 24, 4.0),
    createData('Ice cream sandwich', 237, 9.0, 37, 4.3),
    createData('Eclair', 262, 16.0, 24, 6.0),
    createData('Cupcake', 305, 3.7, 67, 4.3),
    createData('Gingerbread', 356, 16.0, 49, 3.9),
];

export const flattenData = (data) => {
    return Object.values(data).flat();
};

const groupArrayOfObjectsByKey = (arr, key) => {
    if (!arr || !key) return;
    return arr.reduce((acc, obj) => {
        acc[obj[key]] = acc[obj[key]] || [];
        acc[obj[key]].push(obj);
        return acc;
    }, {});
}

export const formatRows = (data) => {
    console.log('group data: ', data);

    return data;
}

export const formatGroups = (data, removeParent = false, groupByKey = 'area') => {
    //Remove parent from object if needed and flattens all objects into one array
    if (removeParent) {
        data = flattenData(data);
        // data = formatRows(data);
    }

    //Groups data by a key provided, so by 'area of state' for example
    data = groupArrayOfObjectsByKey(data, groupByKey);



    return data;
}

export const formatToMMDDYYYY = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
};