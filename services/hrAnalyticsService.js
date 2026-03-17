const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
};

const toDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatMonth = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const addMonths = (date, months) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const monthRange = (start, end) => {
    const result = [];
    const cursor = startOfMonth(start);
    const last = startOfMonth(end);
    while (cursor <= last) {
        result.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
};

const countBy = (rows, getter) => {
    const map = new Map();
    rows.forEach((row) => {
        const key = getter(row) || 'Unknown';
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

const CANDIDATES = {
    employeeId: ['employeeid', 'empid', 'employeecode', 'staffid'],
    employeeName: ['employeename', 'name', 'fullname'],
    activeStatus: ['activestatus', 'statusactive', 'activestate'],
    dateOfJoining: ['dateofjoining', 'joiningdate', 'doj', 'hiredate'],
    dateOfResignation: ['dateofresignation', 'resignationdate', 'exitdate'],
    lwd: ['lwd', 'lastworkingday', 'lastworkingdate'],
    totalExperience: ['totalexperience', 'experienceyears', 'yearsofexperience'],
    dateOfBirth: ['dateofbirth', 'dob', 'birthdate'],
    gender: ['gender', 'sex'],
    maritalStatus: ['maritalstatus'],
    nationality: ['nationality', 'country'],
    religion: ['religion'],
    highestQualification: ['highestqualification', 'qualification'],
    state: ['state', 'province'],
    city: ['city', 'town'],
    legalEntity: ['legalentity', 'entity'],
    businessUnit: ['businessunit', 'bu'],
    functionName: ['function', 'functionalarea'],
    department: ['department', 'dept'],
    grade: ['grade', 'band'],
    designation: ['designation', 'title', 'jobtitle'],
    workforceCategory: ['workforcecategory', 'employeecategory'],
    natureOfEmployment: ['natureofemployment', 'employmenttype', 'contracttype'],
    managerId: ['managerid', 'reportingmanagerid'],
    managerName: ['managername', 'reportingmanager'],
    transferFrom: ['transferfrom'],
    reasonForMovement: ['reasonformovement', 'movementreason'],
    effectiveFrom: ['effectivefrom', 'movementdate'],
    probationEndDate: ['probationenddate'],
    employmentStatus: ['employmentstatus'],
    exitType: ['exittype'],
    exitReason1: ['exitreason1', 'exitreasonprimary'],
    exitReason2: ['exitreason2', 'exitreasonsecondary'],
    exitReason3: ['exitreason3', 'exitreasontertiary'],
    location: ['location', 'worklocation', 'office'],
    contact: ['contactnumber', 'phone', 'mobile', 'email'],
    emergencyContact: ['emergencycontact', 'emergencyphone', 'emergencyname'],
};

const findField = (keys, candidateList) => {
    const normalized = keys.map((key) => ({ key, norm: normalize(key) }));

    for (const candidate of candidateList) {
        const direct = normalized.find(({ norm }) => norm === candidate);
        if (direct) return direct.key;
    }

    for (const candidate of candidateList) {
        const partial = normalized.find(({ norm }) => norm.includes(candidate));
        if (partial) return partial.key;
    }

    return null;
};

const inferFieldMap = (rows) => {
    const first = rows[0] || {};
    const keys = Object.keys(first);
    const map = {};

    Object.entries(CANDIDATES).forEach(([field, candidateList]) => {
        map[field] = findField(keys, candidateList);
    });

    map.qualificationFields = keys.filter((key) => {
        const norm = normalize(key);
        return norm.includes('qualification') || norm.includes('education') || norm.includes('degree');
    });

    map.contactFields = keys.filter((key) => {
        const norm = normalize(key);
        return norm.includes('phone') || norm.includes('mobile') || norm.includes('email') || norm.includes('contact');
    });

    map.emergencyFields = keys.filter((key) => normalize(key).includes('emergency'));

    return map;
};

const valueFor = (row, field) => {
    if (!field) return null;
    return row[field];
};

const dateInRange = (date, fromDate, toDate) => {
    if (!date) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
};

const matchFilter = (row, field, filterValue) => {
    if (!field || !filterValue || filterValue === 'ALL') return true;
    return String(valueFor(row, field) || '').toLowerCase() === String(filterValue).toLowerCase();
};

const uniqueValues = (rows, field) => {
    if (!field) return [];
    return Array.from(new Set(rows.map((row) => valueFor(row, field)).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
};

const getExitDate = (row, fields) => toDate(valueFor(row, fields.dateOfResignation) || valueFor(row, fields.lwd));

const ageBandFor = (dob) => {
    if (!dob) return 'Unknown';
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 25) return '<25';
    if (age <= 34) return '25-34';
    if (age <= 44) return '35-44';
    if (age <= 54) return '45-54';
    return '55+';
};

const buildHierarchy = (rows, fields) => {
    const root = { name: 'Organization', children: [] };
    const levels = [fields.legalEntity, fields.businessUnit, fields.functionName, fields.department];

    rows.forEach((row) => {
        let node = root;
        levels.forEach((levelField, idx) => {
            const name = valueFor(row, levelField) || ['Legal Entity', 'Business Unit', 'Function', 'Department'][idx];
            let child = (node.children || []).find((c) => c.name === name);
            if (!child) {
                child = { name, children: [], value: 0 };
                node.children = node.children || [];
                node.children.push(child);
            }
            child.value = (child.value || 0) + 1;
            node = child;
        });
    });

    return root.children || [];
};

const buildManagerTree = (rows, fields) => {
    const byEmployeeId = new Map();
    rows.forEach((row) => {
        const id = String(valueFor(row, fields.employeeId) || '');
        if (!id) return;
        byEmployeeId.set(id, row);
    });

    const nodes = new Map();
    const ensureNode = (id, name) => {
        if (!nodes.has(id)) nodes.set(id, { id, name: name || id, children: [] });
        return nodes.get(id);
    };

    rows.forEach((row) => {
        const employeeId = String(valueFor(row, fields.employeeId) || '');
        if (!employeeId) return;
        const employeeName = valueFor(row, fields.employeeName) || employeeId;
        const managerId = String(valueFor(row, fields.managerId) || '');
        const managerName = valueFor(row, fields.managerName) || managerId;

        const child = ensureNode(employeeId, employeeName);
        if (managerId && managerId !== employeeId) {
            const parent = ensureNode(managerId, managerName);
            if (!parent.children.find((n) => n.id === child.id)) {
                parent.children.push(child);
            }
        }
    });

    const roots = [];
    nodes.forEach((node) => {
        const hasParent = Array.from(nodes.values()).some((candidate) => candidate.children.some((n) => n.id === node.id));
        if (!hasParent) roots.push(node);
    });

    return roots.slice(0, 5);
};

const buildTimeline = (row, fields) => {
    const events = [];
    const joiningDate = toDate(valueFor(row, fields.dateOfJoining));
    if (joiningDate) events.push({ date: joiningDate, label: 'Joined organization' });

    const movementDate = toDate(valueFor(row, fields.effectiveFrom));
    if (movementDate) {
        const transferFrom = valueFor(row, fields.transferFrom) || 'Internal movement';
        const reason = valueFor(row, fields.reasonForMovement) || 'Not specified';
        events.push({ date: movementDate, label: `Moved from ${transferFrom} (${reason})` });
    }

    const resignationDate = toDate(valueFor(row, fields.dateOfResignation));
    if (resignationDate) events.push({ date: resignationDate, label: 'Resignation submitted' });

    const lwdDate = toDate(valueFor(row, fields.lwd));
    if (lwdDate) events.push({ date: lwdDate, label: 'Last working day' });

    return events.sort((a, b) => a.date - b.date).map((event) => ({ ...event, month: formatMonth(event.date) }));
};

const buildAttritionByDeptLocation = (rows, fields) => {
    const exits = rows.filter((row) => getExitDate(row, fields));
    const map = new Map();
    exits.forEach((row) => {
        const department = valueFor(row, fields.department) || 'Unknown';
        const location = valueFor(row, fields.location) || valueFor(row, fields.city) || 'Unknown';
        const key = `${department}__${location}`;
        const current = map.get(key) || { department, location, value: 0 };
        current.value += 1;
        map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 25);
};

export const getHrFilterOptions = (rows, fields) => ({
    activeStatus: uniqueValues(rows, fields.activeStatus),
    legalEntity: uniqueValues(rows, fields.legalEntity),
    businessUnit: uniqueValues(rows, fields.businessUnit),
    functionName: uniqueValues(rows, fields.functionName),
    department: uniqueValues(rows, fields.department),
    location: uniqueValues(rows, fields.location) || uniqueValues(rows, fields.city),
    grade: uniqueValues(rows, fields.grade),
    gender: uniqueValues(rows, fields.gender),
});

export const createDefaultHrFilters = () => ({
    activeStatus: 'ALL',
    legalEntity: 'ALL',
    businessUnit: 'ALL',
    functionName: 'ALL',
    department: 'ALL',
    location: 'ALL',
    grade: 'ALL',
    gender: 'ALL',
    fromDate: '',
    toDate: '',
});

export const buildHrAnalytics = (rows = [], filters = {}, selectedEmployeeId = null) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            fields: {},
            filters: createDefaultHrFilters(),
            filterOptions: {},
            filteredRows: [],
            workforce: {},
            demographics: {},
            organization: {},
            movement: {},
            attrition: {},
            employees: [],
            employee360: null,
        };
    }

    const fields = inferFieldMap(rows);
    const normalizedFilters = { ...createDefaultHrFilters(), ...filters };
    const fromDate = toDate(normalizedFilters.fromDate);
    const toDateValue = toDate(normalizedFilters.toDate);
    const toDateSafe = toDateValue ? endOfMonth(toDateValue) : null;

    const filterOptions = getHrFilterOptions(rows, fields);

    const filteredRows = rows.filter((row) => {
        if (!matchFilter(row, fields.activeStatus, normalizedFilters.activeStatus)) return false;
        if (!matchFilter(row, fields.legalEntity, normalizedFilters.legalEntity)) return false;
        if (!matchFilter(row, fields.businessUnit, normalizedFilters.businessUnit)) return false;
        if (!matchFilter(row, fields.functionName, normalizedFilters.functionName)) return false;
        if (!matchFilter(row, fields.department, normalizedFilters.department)) return false;
        if (!matchFilter(row, fields.grade, normalizedFilters.grade)) return false;
        if (!matchFilter(row, fields.gender, normalizedFilters.gender)) return false;

        const locationField = fields.location || fields.city;
        if (!matchFilter(row, locationField, normalizedFilters.location)) return false;

        const joiningDate = toDate(valueFor(row, fields.dateOfJoining));
        if (normalizedFilters.fromDate || normalizedFilters.toDate) {
            if (!dateInRange(joiningDate, fromDate, toDateSafe)) return false;
        }

        return true;
    });

    const now = new Date();
    const thisMonth = formatMonth(now);
    const periodStart = startOfMonth(addMonths(now, -11));
    const periodMonths = monthRange(periodStart, now);

    const employees = filteredRows
        .map((row) => ({
            id: String(valueFor(row, fields.employeeId) || ''),
            name: valueFor(row, fields.employeeName) || valueFor(row, fields.employeeId) || 'Unknown',
            row,
        }))
        .filter((item) => item.id)
        .sort((a, b) => a.name.localeCompare(b.name));

    const exitsInPeriod = filteredRows.filter((row) => {
        const exitDate = getExitDate(row, fields);
        return dateInRange(exitDate, periodStart, endOfMonth(now));
    }).length;

    const averageHeadcount = periodMonths.length === 0
        ? 0
        : periodMonths.reduce((sum, monthDate) => {
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);
            const headcountForMonth = filteredRows.filter((row) => {
                const joinDate = toDate(valueFor(row, fields.dateOfJoining));
                const exitDate = getExitDate(row, fields);
                if (!joinDate || joinDate > monthEnd) return false;
                if (exitDate && exitDate < monthStart) return false;
                return true;
            }).length;
            return sum + headcountForMonth;
        }, 0) / periodMonths.length;

    const workforce = {
        totalEmployees: filteredRows.length,
        activeEmployees: filteredRows.filter((row) => String(valueFor(row, fields.activeStatus) || '').toLowerCase() === 'active').length,
        newJoinersMonth: filteredRows.filter((row) => formatMonth(toDate(valueFor(row, fields.dateOfJoining))) === thisMonth).length,
        exitsMonth: filteredRows.filter((row) => formatMonth(getExitDate(row, fields)) === thisMonth).length,
        attritionRate: averageHeadcount > 0 ? (exitsInPeriod / averageHeadcount) * 100 : 0,
        avgExperience: (() => {
            const values = filteredRows.map((row) => toNumber(valueFor(row, fields.totalExperience))).filter((val) => val !== null);
            if (values.length === 0) return 0;
            return values.reduce((a, b) => a + b, 0) / values.length;
        })(),
    };

    const demographics = {
        genderSplit: countBy(filteredRows, (row) => valueFor(row, fields.gender)),
        ageBands: countBy(filteredRows, (row) => ageBandFor(toDate(valueFor(row, fields.dateOfBirth)))),
        maritalStatus: countBy(filteredRows, (row) => valueFor(row, fields.maritalStatus)),
        nationality: countBy(filteredRows, (row) => valueFor(row, fields.nationality)),
        religion: countBy(filteredRows, (row) => valueFor(row, fields.religion)),
        qualification: countBy(filteredRows, (row) => valueFor(row, fields.highestQualification)),
        stateCity: countBy(filteredRows, (row) => valueFor(row, fields.city) || valueFor(row, fields.state)),
    };

    const movementTrend = countBy(
        filteredRows.filter((row) => toDate(valueFor(row, fields.effectiveFrom))),
        (row) => formatMonth(toDate(valueFor(row, fields.effectiveFrom)))
    );

    const joiningTrend = countBy(
        filteredRows.filter((row) => toDate(valueFor(row, fields.dateOfJoining))),
        (row) => formatMonth(toDate(valueFor(row, fields.dateOfJoining)))
    );

    const probation = {
        completed: 0,
        ongoing: 0,
        overdue: 0,
    };

    filteredRows.forEach((row) => {
        const probationEnd = toDate(valueFor(row, fields.probationEndDate));
        if (!probationEnd) return;
        if (probationEnd < now) probation.completed += 1;
        else if (probationEnd > addMonths(now, 1)) probation.ongoing += 1;
        else probation.overdue += 1;
    });

    const organization = {
        hierarchy: buildHierarchy(filteredRows, fields),
        gradeDesignation: (() => {
            const map = new Map();
            filteredRows.forEach((row) => {
                const grade = valueFor(row, fields.grade) || 'Unknown';
                const designation = valueFor(row, fields.designation) || 'Unknown';
                const key = `${grade}__${designation}`;
                const current = map.get(key) || { grade, designation, value: 0 };
                current.value += 1;
                map.set(key, current);
            });
            return Array.from(map.values());
        })(),
        workforceCategoryMix: countBy(filteredRows, (row) => valueFor(row, fields.workforceCategory)),
        natureOfEmploymentMix: countBy(filteredRows, (row) => valueFor(row, fields.natureOfEmployment)),
        managerHierarchy: buildManagerTree(filteredRows, fields),
    };

    const attritionRows = filteredRows.filter((row) => getExitDate(row, fields));

    const attrition = {
        exitTrend: countBy(attritionRows, (row) => formatMonth(getExitDate(row, fields))),
        exitTypeMix: countBy(attritionRows, (row) => valueFor(row, fields.exitType)),
        exitReasons: countBy(
            attritionRows.flatMap((row) => [
                valueFor(row, fields.exitReason1),
                valueFor(row, fields.exitReason2),
                valueFor(row, fields.exitReason3),
            ]).filter(Boolean).map((reason) => ({ reason })),
            (row) => row.reason
        ),
        byDepartment: countBy(attritionRows, (row) => valueFor(row, fields.department)),
        byLocation: countBy(attritionRows, (row) => valueFor(row, fields.location) || valueFor(row, fields.city)),
        byManager: countBy(attritionRows, (row) => valueFor(row, fields.managerName) || valueFor(row, fields.managerId)),
        deptLocationHeatmap: buildAttritionByDeptLocation(filteredRows, fields),
    };

    const movement = {
        joiningTrend,
        internalMovementTrend: movementTrend,
        movementReason: countBy(filteredRows, (row) => valueFor(row, fields.reasonForMovement)),
        probation,
        statusPipeline: countBy(filteredRows, (row) => valueFor(row, fields.employmentStatus) || valueFor(row, fields.activeStatus)),
    };

    const pickedEmployeeId = selectedEmployeeId || employees[0]?.id;
    const selectedEmployee = employees.find((emp) => emp.id === pickedEmployeeId)?.row || null;

    const employee360 = selectedEmployee ? {
        id: String(valueFor(selectedEmployee, fields.employeeId) || ''),
        name: valueFor(selectedEmployee, fields.employeeName) || 'Unknown',
        designation: valueFor(selectedEmployee, fields.designation) || 'Unknown',
        department: valueFor(selectedEmployee, fields.department) || 'Unknown',
        manager: valueFor(selectedEmployee, fields.managerName) || valueFor(selectedEmployee, fields.managerId) || 'Unknown',
        joiningDate: valueFor(selectedEmployee, fields.dateOfJoining) || 'Unknown',
        location: valueFor(selectedEmployee, fields.location) || valueFor(selectedEmployee, fields.city) || 'Unknown',
        timeline: buildTimeline(selectedEmployee, fields),
        qualifications: fields.qualificationFields
            .map((field) => ({ field, value: valueFor(selectedEmployee, field) }))
            .filter((item) => item.value),
        contactSummary: {
            primary: fields.contactFields.map((field) => ({ label: field, value: valueFor(selectedEmployee, field) })).filter((item) => item.value),
            emergency: fields.emergencyFields.map((field) => ({ label: field, value: valueFor(selectedEmployee, field) })).filter((item) => item.value),
        },
    } : null;

    return {
        fields,
        filters: normalizedFilters,
        filterOptions,
        filteredRows,
        workforce,
        demographics,
        organization,
        movement,
        attrition,
        employees,
        employee360,
    };
};
