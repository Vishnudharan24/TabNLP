const normalizeText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hasAnyToken = (text, tokens = []) => tokens.some(token => text.includes(token));

const findColumnByMatchers = (columns = [], matcherGroups = []) => {
    const safeCols = Array.isArray(columns) ? columns.filter(Boolean) : [];
    const normalized = safeCols.map((name) => ({ name, text: normalizeText(name) }));

    for (const matcher of matcherGroups) {
        const required = matcher.required || [];
        const optional = matcher.optional || [];

        const found = normalized.find((col) => {
            const hasRequired = required.length === 0 || required.every(token => col.text.includes(token));
            const hasOptional = optional.length === 0 || hasAnyToken(col.text, optional);
            return hasRequired && hasOptional;
        });

        if (found) return found.name;
    }

    return null;
};

const parseDateSafe = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number' && Number.isFinite(value)) {
        // Excel serial date fallback.
        if (value > 20000 && value < 60000) {
            const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/[^0-9.-]/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
};

const toExperienceYears = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const text = String(value).toLowerCase().trim();
    if (!text) return null;

    const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yr)\b/);
    const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo)\b/);

    if (yearMatch || monthMatch) {
        const years = yearMatch ? Number(yearMatch[1]) : 0;
        const months = monthMatch ? Number(monthMatch[1]) : 0;
        const computed = years + (months / 12);
        return Number.isFinite(computed) ? computed : null;
    }

    return toNumber(text);
};

const toStringSafe = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

const calcYearsBetween = (start, end = new Date()) => {
    if (!start || !end) return null;
    const ms = end.getTime() - start.getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return ms / (365.25 * 24 * 60 * 60 * 1000);
};

const buildColumnMap = (columns = []) => ({
    employeeId: findColumnByMatchers(columns, [
        { required: ['employee', 'id'] },
        { required: ['emp', 'id'] },
    ]),
    fullName: findColumnByMatchers(columns, [
        { required: ['full', 'name'] },
        { required: ['employee', 'name'] },
        { required: ['first', 'name'], optional: ['last'] },
    ]),
    firstName: findColumnByMatchers(columns, [
        { required: ['first', 'name'] },
    ]),
    middleName: findColumnByMatchers(columns, [
        { required: ['middle', 'name'] },
    ]),
    lastName: findColumnByMatchers(columns, [
        { required: ['last', 'name'] },
        { required: ['surname'] },
    ]),
    gender: findColumnByMatchers(columns, [
        { required: ['gender'] },
        { required: ['sex'] },
    ]),
    dob: findColumnByMatchers(columns, [
        { required: ['date', 'birth'] },
        { required: ['dob'] },
    ]),
    maritalStatus: findColumnByMatchers(columns, [
        { required: ['marital', 'status'] },
    ]),
    email: findColumnByMatchers(columns, [
        { required: ['email'], optional: ['official', 'work', 'company'] },
        { required: ['email'] },
    ]),
    city: findColumnByMatchers(columns, [
        { required: ['city'], optional: ['birth', 'location'] },
        { required: ['location', 'city'] },
    ]),
    location: findColumnByMatchers(columns, [
        { required: ['location'] },
        { required: ['work', 'location'] },
        { required: ['office', 'location'] },
    ]),
    department: findColumnByMatchers(columns, [
        { required: ['department'] },
        { required: ['dept'] },
    ]),
    businessUnit: findColumnByMatchers(columns, [
        { required: ['business', 'unit'] },
    ]),
    functionName: findColumnByMatchers(columns, [
        { required: ['function'] },
    ]),
    designation: findColumnByMatchers(columns, [
        { required: ['designation'] },
        { required: ['title'] },
        { required: ['position'] },
    ]),
    grade: findColumnByMatchers(columns, [
        { required: ['grade'] },
        { required: ['band'] },
    ]),
    manager: findColumnByMatchers(columns, [
        { required: ['manager', 'name'] },
        { required: ['reporting', 'manager'] },
        { required: ['manager'] },
    ]),
    joiningDate: findColumnByMatchers(columns, [
        { required: ['date', 'joining'] },
        { required: ['joining', 'date'] },
        { required: ['doj'] },
    ]),
    employmentStatus: findColumnByMatchers(columns, [
        { required: ['employment', 'status'] },
        { required: ['status'] },
    ]),
    probationStatus: findColumnByMatchers(columns, [
        { required: ['probation'] },
    ]),
    experienceYears: findColumnByMatchers(columns, [
        { required: ['experience'] },
        { required: ['exp'] },
    ]),
    salary: findColumnByMatchers(columns, [
        { required: ['ctc'] },
        { required: ['salary'] },
        { required: ['gross', 'pay'] },
        { required: ['annual', 'compensation'] },
    ]),
    highestQualification: findColumnByMatchers(columns, [
        { required: ['highest', 'qualification'] },
        { required: ['education', 'level'] },
        { required: ['qualification'] },
    ]),
    resignationDate: findColumnByMatchers(columns, [
        { required: ['resignation', 'date'] },
        { required: ['exit', 'date'] },
        { required: ['date', 'exit'] },
    ]),
    exitReason: findColumnByMatchers(columns, [
        { required: ['exit', 'reason'] },
        { required: ['reason', 'exit'] },
        { required: ['separation', 'reason'] },
    ]),
    exitStatus: findColumnByMatchers(columns, [
        { required: ['exit', 'status'] },
    ]),
});

const normalizeEducation = (row, mappedColumns, allColumns) => {
    const primary = toStringSafe(row[mappedColumns.highestQualification]);
    if (primary) return primary;

    const educationCols = allColumns.filter((col) => {
        const text = normalizeText(col);
        return text.includes('education') || text.includes('qualification') || text.includes('degree');
    });

    const values = educationCols
        .map((col) => toStringSafe(row[col]))
        .filter(Boolean);

    return values[0] || 'Not Specified';
};

const normalizeAddress = (row, allColumns) => {
    const addressCols = allColumns.filter((col) => normalizeText(col).includes('address'));
    const parts = addressCols
        .map((col) => toStringSafe(row[col]))
        .filter(Boolean)
        .slice(0, 3);
    return parts.join(', ');
};

const normalizeStatus = (value, exitDate) => {
    const text = normalizeText(value);
    if (exitDate) return 'Exited';
    if (!text) return 'Unknown';

    if (text.includes('active') || text.includes('confirm')) return 'Active';
    if (text.includes('exit') || text.includes('resign') || text.includes('terminated') || text.includes('inactive')) return 'Exited';
    if (text.includes('probation')) return 'Probation';
    return value;
};

const percentile = (values, p = 0.95) => {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[index];
};

export const processHrDataset = (dataset) => {
    const rows = Array.isArray(dataset?.data) ? dataset.data : [];
    const columns = Array.isArray(dataset?.columns) ? dataset.columns.map(c => c.name) : (rows[0] ? Object.keys(rows[0]) : []);

    if (rows.length === 0 || columns.length === 0) {
        return {
            employees: [],
            dimensions: { departments: [], genders: [], locations: [], statuses: [] },
            salaryP95: null,
        };
    }

    const map = buildColumnMap(columns);

    const employees = rows.map((row, index) => {
        const employeeId = toStringSafe(row[map.employeeId]) || `row-${index + 1}`;
        const firstName = toStringSafe(row[map.firstName]);
        const middleName = toStringSafe(row[map.middleName]);
        const lastName = toStringSafe(row[map.lastName]);
        const fullName = toStringSafe(row[map.fullName]) || [firstName, middleName, lastName].filter(Boolean).join(' ') || employeeId;

        const dob = parseDateSafe(row[map.dob]);
        const joiningDate = parseDateSafe(row[map.joiningDate]);
        const resignationDate = parseDateSafe(row[map.resignationDate]);

        const age = calcYearsBetween(dob, new Date());
        const tenureYears = calcYearsBetween(joiningDate, resignationDate || new Date());

        const experienceRaw = toExperienceYears(row[map.experienceYears]);
        const experienceYears = experienceRaw ?? tenureYears;

        const salary = toNumber(row[map.salary]);

        const department = toStringSafe(row[map.department]) || 'Unknown';
        const location = toStringSafe(row[map.location] || row[map.city]) || 'Unknown';
        const gender = toStringSafe(row[map.gender]) || 'Unknown';
        const status = normalizeStatus(row[map.employmentStatus] || row[map.exitStatus], resignationDate);

        return {
            employeeId,
            fullName,
            firstName,
            middleName,
            lastName,
            gender,
            dob,
            age,
            maritalStatus: toStringSafe(row[map.maritalStatus]),
            email: toStringSafe(row[map.email]),
            department,
            businessUnit: toStringSafe(row[map.businessUnit]),
            functionName: toStringSafe(row[map.functionName]),
            designation: toStringSafe(row[map.designation]),
            grade: toStringSafe(row[map.grade]),
            manager: toStringSafe(row[map.manager]),
            location,
            joiningDate,
            resignationDate,
            status,
            probationStatus: toStringSafe(row[map.probationStatus]),
            experienceYears,
            tenureYears,
            salary,
            educationLevel: normalizeEducation(row, map, columns),
            normalizedAddress: normalizeAddress(row, columns),
            exitReason: toStringSafe(row[map.exitReason]),
            raw: row,
        };
    });

    const salaryValues = employees.map(e => e.salary).filter(v => Number.isFinite(v));

    const dimensions = {
        departments: Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(),
        genders: Array.from(new Set(employees.map(e => e.gender).filter(Boolean))).sort(),
        locations: Array.from(new Set(employees.map(e => e.location).filter(Boolean))).sort(),
        statuses: Array.from(new Set(employees.map(e => e.status).filter(Boolean))).sort(),
    };

    return {
        employees,
        dimensions,
        salaryP95: percentile(salaryValues, 0.95),
    };
};

export const formatMonthKey = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
};

export const monthLabel = (monthKey) => {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, 1);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
};

export const average = (values = []) => {
    const valid = values.filter(v => Number.isFinite(v));
    if (valid.length === 0) return 0;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
};

export const groupCount = (items = [], accessor) => {
    const map = new Map();
    items.forEach((item) => {
        const key = accessor(item) || 'Unknown';
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};
