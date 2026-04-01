from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Callable


_CACHE_MAX_ITEMS = 120
_ANALYTICS_CACHE: dict[str, Any] = {}


def _trim_cache() -> None:
    while len(_ANALYTICS_CACHE) > _CACHE_MAX_ITEMS:
        first_key = next(iter(_ANALYTICS_CACHE.keys()))
        _ANALYTICS_CACHE.pop(first_key, None)


def _stable_payload_hash(data: list[dict[str, Any]], mapping: dict[str, str]) -> str:
    payload = json.dumps(
        {
            "mapping": mapping or {},
            "data": data or [],
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Any:
    return _ANALYTICS_CACHE.get(key)


def _cache_set(key: str, value: Any) -> None:
    _ANALYTICS_CACHE[key] = value
    _trim_cache()


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize(value: Any) -> str:
    return _to_text(value).lower()


def _to_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)

    text = _to_text(value)
    if not text:
        return None

    cleaned = (
        text.replace(",", "")
        .replace("₹", "")
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
    )
    try:
        return float(cleaned)
    except Exception:
        return None


def _to_experience_years(value: Any) -> float | None:
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)

    text = _to_text(value)
    if not text:
        return None

    lowered = text.lower()
    year_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yr|year\(s\))", lowered)
    month_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo|month\(s\))", lowered)

    if year_match or month_match:
        years = float(year_match.group(1)) if year_match else 0.0
        months = float(month_match.group(1)) if month_match else 0.0
        total_years = years + (months / 12.0)
        return total_years if math.isfinite(total_years) else None

    return _to_number(text)


def _to_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # Excel serial date fallback
        if 20000 <= value <= 70000:
            unix_seconds = (float(value) - 25569) * 86400
            try:
                return datetime.fromtimestamp(unix_seconds, tz=timezone.utc)
            except Exception:
                return None

    text = _to_text(value)
    if not text:
        return None

    known_formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d %b %Y",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ]
    for fmt in known_formats:
        try:
            return datetime.strptime(text, fmt)
        except Exception:
            continue

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _contains(text: str, *parts: str) -> bool:
    lower = _normalize(text)
    return any(part in lower for part in parts)


def _active_status_from_row(row: dict[str, Any], mapping: dict[str, str]) -> str:
    mapped_value = _row_get(
        row,
        mapping,
        "Active_Status",
        "active_status",
        "Active Status",
        "activeStatus",
    )
    if not _is_blank(mapped_value):
        return _to_text(mapped_value)

    for key in ("active_status", "Active_Status", "activeStatus", "Active Status"):
        if key in row and not _is_blank(row.get(key)):
            return _to_text(row.get(key))
    return ""


def _is_active_status(value: Any) -> bool:
    return _normalize(value) == "active"


def _is_inactive_status(value: Any) -> bool:
    return _normalize(value) == "inactive"


def _status_from_row(row: dict[str, Any], columns: dict[str, str]) -> str:
    status_value = _to_text(_row_get(row, columns, "Employment_Status", "Employment Status", "Status", "Employee_Status", "Employee Status"))
    resignation_date = _to_datetime(_row_get(row, columns, "Date_of_Resignation", "Resignation_Date", "Exit_Date"))

    if resignation_date:
        return "inactive"

    n = _normalize(status_value)
    if not n:
        return "active"
    if any(token in n for token in ["inactive", "exit", "resign", "terminated", "separated"]):
        return "inactive"
    return "active"


def _years_between(start: datetime | None, end: datetime | None = None) -> float | None:
    if not start:
        return None
    end_dt = end or datetime.now(timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=timezone.utc)
    diff = (end_dt - start).total_seconds()
    if diff < 0:
        return None
    return diff / (365.25 * 24 * 60 * 60)


def _average(values: list[float]) -> float:
    valid = [v for v in values if isinstance(v, (int, float)) and math.isfinite(v)]
    if not valid:
        return 0.0
    return float(sum(valid) / len(valid))


def _group_count(items: list[dict[str, Any]], key_fn: Callable[[dict[str, Any]], Any]) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for item in items:
        key = _to_text(key_fn(item)) or "Unknown"
        counter[key] += 1
    return [{"name": name, "value": value} for name, value in sorted(counter.items(), key=lambda x: (-x[1], x[0]))]


def _row_get(row: dict[str, Any], mapping: dict[str, str], *canonical_fields: str) -> Any:
    for field in canonical_fields:
        col = mapping.get(field)
        if col and col in row:
            return row.get(col)
    return None


def _build_record(row: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    join_date = _to_datetime(_row_get(row, mapping, "Date_of_Joining", "Joining_Date", "DOJ"))
    resignation_date = _to_datetime(_row_get(row, mapping, "Date_of_Resignation", "Resignation_Date", "Exit_Date", "DOR"))
    dob = _to_datetime(_row_get(row, mapping, "DOB", "Date_of_Birth", "Birth_Date"))

    experience_value = _to_experience_years(_row_get(row, mapping, "Experience_Years", "Experience"))
    tenure_experience = _years_between(join_date, resignation_date or datetime.now(timezone.utc))
    normalized_experience_years = experience_value if experience_value is not None else tenure_experience
    normalized_experience_months = (normalized_experience_years * 12) if normalized_experience_years is not None else None

    employee_id = _to_text(_row_get(row, mapping, "Employee_ID", "Employee ID", "EmpID", "EmployeeCode"))
    active_status_raw = _active_status_from_row(row, mapping)
    employment_status_raw = _to_text(_row_get(row, mapping, "Employment_Status", "Employment Status", "Status", "Employee_Status", "Employee Status"))
    department = _to_text(_row_get(row, mapping, "Department", "Dept")) or "Unknown"
    location = _to_text(_row_get(row, mapping, "Location", "Office_Location", "Work_Location")) or "Unknown"
    city = _to_text(_row_get(row, mapping, "City"))
    state = _to_text(_row_get(row, mapping, "State"))

    if location == "Unknown":
        location = city or state or "Unknown"

    manager_name = _to_text(_row_get(row, mapping, "Manager_Name", "Manager Name", "Manager", "Reporting_Manager")) or "Unassigned"

    return {
        "employee_id": employee_id,
        "active_status_raw": active_status_raw,
        "employment_status_raw": employment_status_raw,
        "department": department,
        "business_unit": _to_text(_row_get(row, mapping, "Business_Unit", "Business Unit", "BU")) or "Unknown",
        "location": location,
        "workforce_category": _to_text(_row_get(row, mapping, "Workforce_Category", "Workforce Category")) or "Unknown",
        "gender": _to_text(_row_get(row, mapping, "Gender", "Sex")) or "Unknown",
        "marital_status": _to_text(_row_get(row, mapping, "Marital_Status", "Marital Status")) or "Unknown",
        "nationality": _to_text(_row_get(row, mapping, "Nationality")) or "Unknown",
        "manager": manager_name,
        "manager_name": manager_name,
        "manager_id": _to_text(_row_get(row, mapping, "Manager_ID", "Manager ID")),
        "join_date": join_date,
        "resignation_date": resignation_date,
        "dob": dob,
        "status": _status_from_row(row, mapping),
        "experience_years": normalized_experience_years,
        "experience_months": normalized_experience_months,
        "payment_mode": _to_text(_row_get(row, mapping, "Payment_Mode", "Payroll_Mode")) or "Unknown",
        "bank_name": _to_text(_row_get(row, mapping, "Bank_Name", "Bank")) or "Unknown",
        "ifsc_code": _to_text(_row_get(row, mapping, "IFSC_Code", "IFSC Code")) or "Unknown",
        "qualification": _to_text(_row_get(row, mapping, "Qualification", "Highest_Qualification")) or "Unknown",
        "specialization": _to_text(_row_get(row, mapping, "Specialization", "Major")) or "Unknown",
        "course_type": _to_text(_row_get(row, mapping, "Course_Type", "Course Type")) or "Unknown",
        "city": city or "Unknown",
        "state": state or "Unknown",
        "transfer_count": _to_number(_row_get(row, mapping, "Transfer_Count")) or 0,
        "transfer_flag": _contains(_to_text(_row_get(row, mapping, "Transfer_Flag", "Transferred")), "yes", "true", "1"),
        "transfer_from": _to_text(_row_get(row, mapping, "Transfer_From", "Transfer From")) or "Unknown",
        "movement_reason": _to_text(_row_get(row, mapping, "Reason_For_Movement", "Reason For Movement", "Movement_Reason")) or "Unknown",
        "exit_reason": _to_text(_row_get(row, mapping, "Exit_Reason", "Resignation_Reason")) or "Unknown",
        "exit_type": _to_text(_row_get(row, mapping, "Exit_Type", "Separation_Type")) or "Unknown",
        "probation_status": _to_text(_row_get(row, mapping, "Probation_Status")) or "Unknown",
        "probation_end_date": _to_datetime(_row_get(row, mapping, "Probation_End_Date", "Probation End Date")),
        "current_experience_years": _to_experience_years(_row_get(row, mapping, "Current_Experience", "Current Experience")),
        "group_experience_years": _to_experience_years(_row_get(row, mapping, "Group_Experience", "Group Experience")),
        "pan": _to_text(_row_get(row, mapping, "PAN", "PAN_Number")),
        "aadhar": _to_text(_row_get(row, mapping, "Aadhar", "Aadhaar", "Aadhar_Number")),
        "pf": _to_text(_row_get(row, mapping, "PF_Number", "PF")),
        "uan": _to_text(_row_get(row, mapping, "UAN")),
        "emergency_contact": _to_text(_row_get(row, mapping, "Emergency_Contact", "Emergency_Phone")),
        "emergency_relationship": _to_text(_row_get(row, mapping, "Emergency_Relationship")) or "Unknown",
        "raw": row,
    }


def _prepare(data: list[dict[str, Any]], mapping: dict[str, str]) -> dict[str, Any]:
    payload_hash = _stable_payload_hash(data, mapping)
    cache_key = f"prepared::{payload_hash}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    records = [_build_record(row or {}, mapping or {}) for row in (data or [])]
    prepared = {
        "hash": payload_hash,
        "records": records,
        "mapping": mapping or {},
        "data": data or [],
    }
    _cache_set(cache_key, prepared)
    return prepared


def _month_key(date_value: datetime | None) -> str | None:
    if not date_value:
        return None
    return f"{date_value.year:04d}-{date_value.month:02d}"


def _list_counter(counter: dict[str, int]) -> list[dict[str, Any]]:
    return [{"name": k, "value": v} for k, v in sorted(counter.items(), key=lambda x: x[0])]


def _type_match(sample_values: list[Any], expected: str, field_name: str = "") -> bool:
    samples = [s for s in sample_values if not _is_blank(s)][:40]
    if not samples:
        return True

    if expected == "number":
        if "experience" in _normalize(field_name):
            return all(_to_experience_years(v) is not None for v in samples)
        return all(_to_number(v) is not None for v in samples)
    if expected == "date":
        return all(_to_datetime(v) is not None for v in samples)
    return True


def validate_mapping(data: list[dict[str, Any]], mapping: dict[str, str]) -> dict[str, Any]:
    columns = set()
    for row in data or []:
        columns.update((row or {}).keys())

    expected = {
        "Employee_ID": "string",
        "Active_Status": "string",
        "Department": "string",
        "Date_of_Joining": "date",
        "Date_of_Resignation": "date",
        "DOB": "date",
        "Experience_Years": "number",
    }

    missing_fields = []
    missing_columns = []
    type_warnings = []

    for field, ftype in expected.items():
        mapped_col = (mapping or {}).get(field)
        if not mapped_col:
            missing_fields.append(field)
            continue
        if mapped_col not in columns:
            missing_columns.append({"field": field, "column": mapped_col})
            continue

        sample_values = [row.get(mapped_col) for row in (data or []) if isinstance(row, dict)]
        if not _type_match(sample_values, ftype, field):
            type_warnings.append({
                "field": field,
                "column": mapped_col,
                "expected": ftype,
                "message": f"Column '{mapped_col}' may not match expected type '{ftype}'",
            })

    return {
        "missingFields": missing_fields,
        "missingColumns": missing_columns,
        "typeWarnings": type_warnings,
        "isValid": len(missing_columns) == 0,
    }


def workforce_overview(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    total = sum(1 for r in records if _to_text(r.get("employee_id")))
    active = sum(1 for r in records if _is_active_status(r.get("active_status_raw")))
    inactive = sum(1 for r in records if _is_inactive_status(r.get("active_status_raw")))

    headcount_by_department = _group_count(records, lambda r: r["department"])
    headcount_by_business_unit = _group_count(records, lambda r: r["business_unit"])
    headcount_by_location = _group_count(records, lambda r: r["location"])
    workforce_category_distribution = _group_count(records, lambda r: r["workforce_category"])
    gender_ratio = _group_count(records, lambda r: r["gender"])
    marital_status_distribution = _group_count(records, lambda r: r["marital_status"])

    kpis = {
        "totalEmployees": total,
        "activeEmployees": active,
        "inactiveEmployees": inactive,
    }

    charts = {
        "headcount_by_department": headcount_by_department,
        "headcount_by_business_unit": headcount_by_business_unit,
        "headcount_by_location": headcount_by_location,
        "workforce_category_distribution": workforce_category_distribution,
        "gender_ratio": gender_ratio,
        "marital_status_distribution": marital_status_distribution,
        # Aliases for lightweight frontend bindings.
        "department": headcount_by_department,
        "businessUnit": headcount_by_business_unit,
        "location": headcount_by_location,
        "workforceCategory": workforce_category_distribution,
        "gender": gender_ratio,
        "maritalStatus": marital_status_distribution,
    }

    return {
        "kpis": kpis,
        "charts": charts,
        # Backward compatibility with existing dashboard fields.
        "totalEmployees": kpis["totalEmployees"],
        "activeEmployees": kpis["activeEmployees"],
        "inactiveEmployees": kpis["inactiveEmployees"],
        "headcountByDepartment": headcount_by_department,
        "headcountByBusinessUnit": headcount_by_business_unit,
        "headcountByLocation": headcount_by_location,
        "workforceCategoryDistribution": workforce_category_distribution,
        "genderRatio": gender_ratio,
        "maritalStatusDistribution": marital_status_distribution,
    }


def demographics(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    bins = [
        {"name": "18-24", "min": 18, "max": 24, "value": 0},
        {"name": "25-34", "min": 25, "max": 34, "value": 0},
        {"name": "35-44", "min": 35, "max": 44, "value": 0},
        {"name": "45-54", "min": 45, "max": 54, "value": 0},
        {"name": "55+", "min": 55, "max": 200, "value": 0},
    ]

    for r in records:
        age = _years_between(r["dob"], datetime.now(timezone.utc))
        if age is None:
            continue
        for b in bins:
            if b["min"] <= age <= b["max"]:
                b["value"] += 1
                break

    dept_gender: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for r in records:
        dept_gender[r["department"]][r["gender"]] += 1

    gender_by_department = []
    for dept, counter in dept_gender.items():
        for gender, value in sorted(counter.items(), key=lambda x: x[0]):
            gender_by_department.append({
                "department": dept,
                "gender": gender,
                "value": value,
            })

    age_distribution = [{"name": b["name"], "value": b["value"]} for b in bins]
    nationality_distribution = _group_count(records, lambda r: r["nationality"])
    location_distribution = _group_count(records, lambda r: r["city"] if r["city"] != "Unknown" else r["location"])

    return {
        "charts": {
            "age_distribution": age_distribution,
            "gender_by_department": gender_by_department,
            "nationality_distribution": nationality_distribution,
            "location_distribution": location_distribution,
        },
        "ageDistribution": age_distribution,
        "genderDiversityByDepartment": gender_by_department,
        "nationalityDistribution": nationality_distribution,
        "locationDistribution": location_distribution,
    }


def hiring(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    monthly = Counter()
    yearly = Counter()
    by_department = Counter()
    by_location = Counter()

    for r in records:
        dt = r["join_date"]
        if dt:
            monthly[_month_key(dt)] += 1
            yearly[str(dt.year)] += 1
        by_department[r["department"]] += 1
        by_location[r["location"]] += 1

    monthly_hiring_trend = _list_counter({k: v for k, v in monthly.items() if k})
    yearly_hiring_trend = _list_counter(dict(yearly))
    hiring_by_department = _list_counter(dict(by_department))
    hiring_by_location = _list_counter(dict(by_location))

    return {
        "charts": {
            "monthly_hiring_trend": monthly_hiring_trend,
            "yearly_hiring_trend": yearly_hiring_trend,
            "hiring_by_department": hiring_by_department,
            "hiring_by_location": hiring_by_location,
        },
        "monthlyHiringTrend": monthly_hiring_trend,
        "yearlyHiringTrend": yearly_hiring_trend,
        "hiringByDepartment": hiring_by_department,
        "hiringByLocation": hiring_by_location,
    }


def attrition(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    total = len(records)
    exits = [r for r in records if r["resignation_date"] or r["status"] == "inactive"]
    exit_count = len(exits)
    attrition_rate = (exit_count / total) if total else 0

    voluntary = 0
    involuntary = 0
    for r in exits:
        t = _normalize(r["exit_type"])
        reason = _normalize(r["exit_reason"])
        if any(token in t or token in reason for token in ["voluntary", "resign", "personal", "higher studies"]):
            voluntary += 1
        else:
            involuntary += 1

    manager_counter = Counter(r["manager"] for r in exits)
    reason_counter = Counter(r["exit_reason"] for r in exits)

    exp_bins = {
        "0-2": 0,
        "2-5": 0,
        "5-10": 0,
        "10+": 0,
    }
    for r in exits:
        exp = r["experience_years"]
        if exp is None:
            continue
        if exp < 2:
            exp_bins["0-2"] += 1
        elif exp < 5:
            exp_bins["2-5"] += 1
        elif exp < 10:
            exp_bins["5-10"] += 1
        else:
            exp_bins["10+"] += 1

    exits_by_department = _group_count(exits, lambda r: r["department"])
    exits_by_manager = [{"name": k, "value": v} for k, v in manager_counter.most_common(10)]
    top_exit_reasons = [{"name": k, "value": v} for k, v in reason_counter.most_common(10)]
    attrition_by_experience = [{"name": k, "value": v} for k, v in exp_bins.items()]
    voluntary_vs_involuntary = [
        {"name": "Voluntary", "value": voluntary},
        {"name": "Involuntary", "value": involuntary},
    ]

    return {
        "kpis": {
            "attrition_rate": round(attrition_rate, 4),
            "attrition_rate_percentage": round(attrition_rate * 100, 2),
        },
        "charts": {
            "voluntary_vs_involuntary": voluntary_vs_involuntary,
            "exits_by_department": exits_by_department,
            "exits_by_manager": exits_by_manager,
            "top_exit_reasons": top_exit_reasons,
            "attrition_by_experience": attrition_by_experience,
        },
        "attritionRate": round(attrition_rate * 100, 2),
        "voluntaryExits": voluntary,
        "involuntaryExits": involuntary,
        "exitsByDepartment": exits_by_department,
        "exitsByManager": exits_by_manager,
        "topExitReasons": top_exit_reasons,
        "attritionByExperience": attrition_by_experience,
    }


def experience(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    exps = [r["experience_years"] for r in records if r["experience_years"] is not None]

    bins = {
        "0-2": 0,
        "2-5": 0,
        "5-10": 0,
        "10+": 0,
    }
    senior = 0
    junior = 0
    for exp in exps:
        if exp < 2:
            bins["0-2"] += 1
            junior += 1
        elif exp < 5:
            bins["2-5"] += 1
            junior += 1
        elif exp < 10:
            bins["5-10"] += 1
            senior += 1
        else:
            bins["10+"] += 1
            senior += 1

    experience_distribution = [{"name": k, "value": v} for k, v in bins.items()]
    senior_vs_junior_ratio = round((senior / junior), 2) if junior else None

    return {
        "kpis": {
            "avg_experience": round(_average(exps), 2),
        },
        "charts": {
            "experience_distribution": experience_distribution,
            "senior_vs_junior_ratio": [
                {"name": "Senior", "value": senior},
                {"name": "Junior", "value": junior},
            ],
        },
        "averageExperience": round(_average(exps), 2),
        "experienceDistribution": experience_distribution,
        "seniorEmployees": senior,
        "juniorEmployees": junior,
        "seniorJuniorRatio": senior_vs_junior_ratio,
    }


def org(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    manager_teams = Counter(
        (r["manager_id"] or r["manager_name"]) for r in records if (r["manager_id"] or r["manager_name"]) and r["manager_name"] != "Unassigned"
    )
    team_sizes = [{"name": k, "value": v} for k, v in sorted(manager_teams.items(), key=lambda x: (-x[1], x[0]))]

    span_values = list(manager_teams.values())
    span_of_control = {
        "average": round(_average([float(v) for v in span_values]), 2) if span_values else 0,
        "max": max(span_values) if span_values else 0,
        "min": min(span_values) if span_values else 0,
    }

    nodes_by_id: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []

    for idx, r in enumerate(records):
        employee_id = r["employee_id"] or f"employee-{idx + 1}"
        employee_name = _to_text(r["raw"].get(prepared["mapping"].get("Employee_Name", ""))) or employee_id
        nodes_by_id[employee_id] = {
            "id": employee_id,
            "name": employee_name,
            "department": r["department"],
            "manager_id": r["manager_id"] or "",
            "children": [],
        }

    for r in records:
        employee_id = r["employee_id"] or ""
        if employee_id not in nodes_by_id:
            continue

        manager_id = r["manager_id"] or ""
        manager_ref = manager_id if manager_id in nodes_by_id else ""

        if manager_ref:
            nodes_by_id[manager_ref]["children"].append(nodes_by_id[employee_id])
        else:
            roots.append(nodes_by_id[employee_id])

    if not roots and nodes_by_id:
        roots = [next(iter(nodes_by_id.values()))]

    hierarchy = {
        "id": "organization-root",
        "name": "Organization",
        "children": roots[:200],
    }

    return {
        "charts": {
            "org_tree": hierarchy,
            "manager_team_size": team_sizes,
        },
        "managerWiseTeamSize": team_sizes,
        "spanOfControl": span_of_control,
        "hierarchy": hierarchy,
    }


def payroll(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    payment_mode_distribution = _group_count(records, lambda r: r["payment_mode"])
    bank_distribution = _group_count(records, lambda r: r["bank_name"])
    return {
        "charts": {
            "payment_mode_distribution": payment_mode_distribution,
            "bank_distribution": bank_distribution,
        },
        "paymentModeDistribution": payment_mode_distribution,
        "bankDistribution": bank_distribution,
    }


def education(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    qualification_distribution = _group_count(records, lambda r: r["qualification"])
    specialization_distribution = _group_count(records, lambda r: r["specialization"])
    course_type_distribution = _group_count(records, lambda r: r["course_type"])
    return {
        "charts": {
            "qualification_distribution": qualification_distribution,
            "specialization_distribution": specialization_distribution,
            "course_type_distribution": course_type_distribution,
        },
        "qualificationDistribution": qualification_distribution,
        "specializationDistribution": specialization_distribution,
        "courseTypeDistribution": course_type_distribution,
    }


def location(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    transfers = sum(1 for r in records if r["transfer_flag"] or (r["transfer_count"] and r["transfer_count"] > 0))
    transfer_trends_counter = Counter()
    movement_reason_counter = Counter()

    for r in records:
        has_transfer = r["transfer_flag"] or (r["transfer_count"] and r["transfer_count"] > 0)
        if not has_transfer:
            continue
        transfer_key = f"{r['transfer_from']} -> {r['location']}"
        transfer_trends_counter[transfer_key] += 1
        movement_reason_counter[r["movement_reason"]] += 1

    location_distribution = _group_count(records, lambda r: r["location"])
    transfer_trends = [{"name": k, "value": v} for k, v in transfer_trends_counter.most_common(20)]
    movement_reasons = [{"name": k, "value": v} for k, v in movement_reason_counter.most_common(20)]

    return {
        "charts": {
            "location_distribution": location_distribution,
            "transfer_trends": transfer_trends,
            "movement_reasons": movement_reasons,
        },
        "transfers": transfers,
        "locationDistribution": location_distribution,
        "transferTrends": transfer_trends,
        "movementReasons": movement_reasons,
    }


def department(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    exits = [r for r in records if r["status"] == "inactive" or r["resignation_date"]]
    headcount_per_department = _group_count(records, lambda r: r["department"])
    attrition_per_department = _group_count(exits, lambda r: r["department"])
    return {
        "charts": {
            "headcount_per_department": headcount_per_department,
            "attrition_per_department": attrition_per_department,
        },
        "headcountPerDepartment": headcount_per_department,
        "attritionPerDepartment": attrition_per_department,
    }


def lifecycle(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    probation_records = [r for r in records if r["probation_end_date"] is not None or _to_text(r["probation_status"]) not in ["", "Unknown"]]

    successful = 0
    for r in probation_records:
        status = _normalize(r["probation_status"])
        if any(token in status for token in ["confirm", "pass", "completed"]):
            successful += 1
            continue

        if r["probation_end_date"] and (not r["resignation_date"] or r["resignation_date"] >= r["probation_end_date"]):
            successful += 1

    probation_success_rate = (successful / len(probation_records) * 100) if probation_records else 0

    early_attrition = 0
    lifecycle_months = []
    lifecycle_duration = []
    for r in records:
        if r["join_date"] and r["resignation_date"]:
            years = _years_between(r["join_date"], r["resignation_date"])
            if years is not None:
                months = years * 12
                lifecycle_months.append(months)
                lifecycle_duration.append({
                    "name": r["employee_id"] or "Unknown",
                    "value": round(months, 2),
                })
                if years < 0.5:
                    early_attrition += 1

    early_attrition_rate = (early_attrition / len(records) * 100) if records else 0

    return {
        "kpis": {
            "probation_success_rate": round(probation_success_rate, 2),
            "early_attrition": round(early_attrition_rate, 2),
        },
        "charts": {
            "lifecycle_duration": sorted(lifecycle_duration, key=lambda x: x["value"], reverse=True)[:300],
        },
        "probationSuccessRate": round(probation_success_rate, 2),
        "earlyAttritionCount": early_attrition,
        "averageLifecycleDurationMonths": round(_average(lifecycle_months), 2),
    }


def compliance(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]

    missing_pan = sum(1 for r in records if _is_blank(r["pan"]))
    missing_aadhar = sum(1 for r in records if _is_blank(r["aadhar"]))
    missing_pf = sum(1 for r in records if _is_blank(r["pf"]))
    missing_uan = sum(1 for r in records if _is_blank(r["uan"]))

    return {
        "missingPAN": missing_pan,
        "missingAadhar": missing_aadhar,
        "missingPF": missing_pf,
        "missingUAN": missing_uan,
    }


def contact(prepared: dict[str, Any]) -> dict[str, Any]:
    records = prepared["records"]
    missing_emergency_contact = sum(1 for r in records if _is_blank(r["emergency_contact"]))
    return {
        "missingEmergencyContact": missing_emergency_contact,
        "relationshipDistribution": _group_count(records, lambda r: r["emergency_relationship"]),
    }


def data_quality(prepared: dict[str, Any]) -> dict[str, Any]:
    rows = prepared["data"]
    mapping = prepared["mapping"]

    all_columns: set[str] = set()
    for row in rows:
        all_columns.update((row or {}).keys())

    null_counts = {}
    non_null_cells = 0
    total_cells = max(len(rows), 1) * max(len(all_columns), 1)

    for col in sorted(all_columns):
        count_null = 0
        for row in rows:
            value = (row or {}).get(col)
            if _is_blank(value):
                count_null += 1
            else:
                non_null_cells += 1
        null_counts[col] = count_null

    employee_col = mapping.get("Employee_ID")
    duplicate_employees = []
    if employee_col:
        counter = Counter(_to_text((row or {}).get(employee_col)) for row in rows)
        duplicate_employees = [{"employeeId": k, "count": v} for k, v in counter.items() if k and v > 1]

    completeness = (non_null_cells / total_cells * 100) if total_cells else 0

    null_distribution_per_column = [{"name": k, "value": v} for k, v in null_counts.items()]
    total_null_values = sum(v for v in null_counts.values())

    return {
        "kpis": {
            "total_null_values": total_null_values,
            "duplicate_employees": len(duplicate_employees),
            "completeness_percentage": round(completeness, 2),
        },
        "charts": {
            "null_distribution_per_column": null_distribution_per_column,
        },
        "nullCountsPerColumn": null_distribution_per_column,
        "duplicateEmployees": duplicate_employees,
        "completenessPercentage": round(completeness, 2),
    }


MODULE_HANDLERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "summary": workforce_overview,
    "demographics": demographics,
    "hiring": hiring,
    "attrition": attrition,
    "experience": experience,
    "org": org,
    "payroll": payroll,
    "education": education,
    "location": location,
    "department": department,
    "lifecycle": lifecycle,
    "compliance": compliance,
    "contact": contact,
    "data-quality": data_quality,
}


def compute_module(module: str, data: list[dict[str, Any]], mapping: dict[str, str]) -> dict[str, Any]:
    if module not in MODULE_HANDLERS:
        raise ValueError(f"Unknown HR analytics module: {module}")

    payload_hash = _stable_payload_hash(data, mapping)
    cache_key = f"module::{module}::{payload_hash}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    prepared = _prepare(data, mapping)
    validation = validate_mapping(data, mapping)

    handler = MODULE_HANDLERS[module]
    result = {
        "module": module,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "validation": validation,
        "data": handler(prepared),
    }
    _cache_set(cache_key, result)
    return result
