#!/usr/bin/env python3

import argparse
import json
import math
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET


NAMESPACES = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}
CELL_RE = re.compile(r"([A-Z]+)(\d+)")
MONTH_LABELS = [f"{month}월" for month in range(1, 13)]
DEFAULT_SOURCE = (
    "/Users/jerry/Downloads/"
    "대시보드 화면 구성 "
    "data_부산운영팀_1_2026-03-13_이돈석.xlsx"
)
DEFAULT_OUTPUT = "/Users/jerry/raw-po-poc_codex/js/dashboard-data.js"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build a dashboard data bundle from the supplied workbook."
    )
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Path to the source xlsx")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Path to the generated js")
    return parser.parse_args()


def excel_serial_to_date(value):
    return datetime(1899, 12, 30) + timedelta(days=float(value))


def col_to_number(col_name):
    total = 0
    for char in col_name:
        total = total * 26 + (ord(char) - 64)
    return total


def round_number(value, digits=1):
    factor = 10**digits
    return math.floor(value * factor + 0.5) / factor


def percent(part, whole):
    return (part / whole * 100) if whole else 0


def compact_number(value):
    absolute = abs(value)
    if absolute >= 100_000_000:
        return f"{round_number(value / 100_000_000, 1):,.1f}억"
    if absolute >= 10_000:
        return f"{round_number(value / 10_000, 1):,.1f}만"
    return f"{round_number(value, 0):,.0f}"


def build_grade_for_supplier(performance_rate):
    if performance_rate >= 85:
        return "A"
    if performance_rate >= 80:
        return "A-"
    if performance_rate >= 75:
        return "B+"
    return "B"


def load_shared_strings(archive):
    shared_strings = []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    for string_item in root.findall("x:si", NAMESPACES):
        text = "".join(
            node.text or "" for node in string_item.findall(".//x:t", NAMESPACES)
        )
        shared_strings.append(text)
    return shared_strings


def read_sheet(archive, sheet_path, shared_strings):
    root = ET.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall(".//x:sheetData/x:row", NAMESPACES):
        values = {}
        for cell in row.findall("x:c", NAMESPACES):
            match = CELL_RE.match(cell.attrib["r"])
            col_num = col_to_number(match.group(1))
            cell_type = cell.attrib.get("t")
            value_node = cell.find("x:v", NAMESPACES)
            if value_node is None:
                value = ""
            elif cell_type == "s":
                value = shared_strings[int(value_node.text)]
            else:
                value = value_node.text
            values[col_num] = value
        rows.append(values)
    return rows


def series_from_row(row):
    return [float(row.get(col, 0) or 0) for col in range(6, 18)]


def build_grade_mapping(sheet_rows):
    category = None
    mapping = {}
    for row in sheet_rows[1:]:
        if row.get(7):
            category = row[7]
        if row.get(8):
            mapping[row[8]] = category
    return mapping


def build_transactions(sheet_rows, grade_mapping):
    transactions = []
    for row in sheet_rows[1:]:
        if not row.get(1):
            continue
        date_value = excel_serial_to_date(row[1])
        qty = float(row.get(4, 0) or 0)
        amount = float(row.get(5, 0) or 0)
        grade_name = row.get(3, "")
        transactions.append(
            {
                "date": date_value,
                "month": date_value.month,
                "supplier": row.get(2, ""),
                "grade": grade_name,
                "macro": grade_mapping.get(grade_name, "기타"),
                "qty": qty,
                "amount": amount,
            }
        )
    return transactions


def build_monthly_purchase_summary(transactions):
    monthly = defaultdict(lambda: {"qty": 0, "amount": 0, "suppliers": set()})
    for tx in transactions:
        bucket = monthly[tx["month"]]
        bucket["qty"] += tx["qty"]
        bucket["amount"] += tx["amount"]
        bucket["suppliers"].add(tx["supplier"])

    rows = []
    for month in range(1, 13):
        qty = monthly[month]["qty"]
        amount = monthly[month]["amount"]
        rows.append(
            {
                "month": MONTH_LABELS[month - 1],
                "qty": round_number(qty, 0),
                "amount": round_number(amount, 0),
                "avgUnitPrice": round_number(amount / qty, 1) if qty else 0,
                "supplierCount": len(monthly[month]["suppliers"]),
            }
        )
    return rows


def build_supplier_summary(transactions):
    supplier_map = defaultdict(
        lambda: {
            "qty": 0,
            "amount": 0,
            "months": defaultdict(float),
            "macro": defaultdict(float),
        }
    )

    for tx in transactions:
        supplier = supplier_map[tx["supplier"]]
        supplier["qty"] += tx["qty"]
        supplier["amount"] += tx["amount"]
        supplier["months"][tx["month"]] += tx["qty"]
        supplier["macro"][tx["macro"]] += tx["qty"]

    total_qty = sum(tx["qty"] for tx in transactions)
    suppliers = []
    for name, info in supplier_map.items():
        peak_month_qty = max(info["months"].values()) if info["months"] else 0
        months_active = len(info["months"])
        performance_rate = percent(info["qty"], peak_month_qty * months_active)
        dominant_macro = max(info["macro"].items(), key=lambda item: item[1])[0]
        suppliers.append(
            {
                "supplier": name,
                "totalQty": round_number(info["qty"], 0),
                "totalAmount": round_number(info["amount"], 0),
                "avgUnitPrice": round_number(info["amount"] / info["qty"], 1)
                if info["qty"]
                else 0,
                "share": round_number(percent(info["qty"], total_qty), 2),
                "performanceRate": round_number(performance_rate, 1),
                "trustGrade": build_grade_for_supplier(performance_rate),
                "dominantMacro": dominant_macro,
                "monthsActive": months_active,
                "peakMonthQty": round_number(peak_month_qty, 0),
                "monthlySeries": [
                    round_number(info["months"].get(month, 0), 0) for month in range(1, 13)
                ],
            }
        )

    suppliers.sort(key=lambda item: item["totalQty"], reverse=True)
    return suppliers


def build_macro_mix(transactions):
    total_qty = sum(tx["qty"] for tx in transactions)
    by_macro = defaultdict(float)
    for tx in transactions:
        by_macro[tx["macro"]] += tx["qty"]

    rows = []
    for macro, qty in sorted(by_macro.items(), key=lambda item: item[1], reverse=True):
        rows.append(
            {
                "name": macro,
                "qty": round_number(qty, 0),
                "share": round_number(percent(qty, total_qty), 2),
            }
        )
    return rows


def build_macro_ratio_by_month(transactions):
    monthly = defaultdict(lambda: {"total": 0, "focused": 0})
    for tx in transactions:
        bucket = monthly[tx["month"]]
        bucket["total"] += tx["qty"]
        if tx["macro"] in {"국고하", "선반설"}:
            bucket["focused"] += tx["qty"]

    rows = []
    for month in range(1, 13):
        total = monthly[month]["total"]
        rows.append(
            {
                "month": MONTH_LABELS[month - 1],
                "ratio": round_number(percent(monthly[month]["focused"], total), 2),
            }
        )
    return rows


def build_category_comparison(mix_2024, mix_2023):
    rows_2024 = {row["name"]: row for row in mix_2024}
    rows_2023 = {row["name"]: row for row in mix_2023}
    categories = sorted(set(rows_2024) | set(rows_2023))
    comparison = []
    for category in categories:
        row_2024 = rows_2024.get(category, {"qty": 0, "share": 0})
        row_2023 = rows_2023.get(category, {"qty": 0, "share": 0})
        comparison.append(
            {
                "category": category,
                "qty2024": row_2024["qty"],
                "share2024": row_2024["share"],
                "qty2023": row_2023["qty"],
                "share2023": row_2023["share"],
                "diffShare": round_number(row_2024["share"] - row_2023["share"], 2),
            }
        )
    comparison.sort(key=lambda item: item["qty2024"], reverse=True)
    return comparison


def build_dashboard_data(source_path):
    with zipfile.ZipFile(source_path) as archive:
        shared_strings = load_shared_strings(archive)
        plan_sheet = read_sheet(archive, "xl/worksheets/sheet3.xml", shared_strings)
        raw_2024 = read_sheet(archive, "xl/worksheets/sheet4.xml", shared_strings)
        raw_2023 = read_sheet(archive, "xl/worksheets/sheet5.xml", shared_strings)

    incheon_plan = series_from_row(plan_sheet[6])
    incheon_actual = series_from_row(plan_sheet[7])
    pohang_plan = series_from_row(plan_sheet[12])
    pohang_actual = series_from_row(plan_sheet[13])
    total_plan = [left + right for left, right in zip(incheon_plan, pohang_plan)]
    total_actual = [left + right for left, right in zip(incheon_actual, pohang_actual)]

    plan_rows = []
    cumulative_plan = 0
    cumulative_actual = 0
    for index, month_label in enumerate(MONTH_LABELS):
        cumulative_plan += total_plan[index]
        cumulative_actual += total_actual[index]
        plan_rows.append(
            {
                "month": month_label,
                "plan": round_number(total_plan[index], 0),
                "actual": round_number(total_actual[index], 0),
                "cumulativePlan": round_number(cumulative_plan, 0),
                "cumulativeActual": round_number(cumulative_actual, 0),
                "achievementRate": round_number(percent(cumulative_actual, cumulative_plan), 2),
            }
        )

    grade_mapping = build_grade_mapping(raw_2024)
    tx_2024 = build_transactions(raw_2024, grade_mapping)
    tx_2023 = build_transactions(raw_2023, grade_mapping)

    suppliers = build_supplier_summary(tx_2024)
    supplier_performance_avg = round_number(
        sum(item["performanceRate"] for item in suppliers) / len(suppliers), 1
    )
    top_supplier_series = suppliers[:3]
    purchase_monthly = build_monthly_purchase_summary(tx_2024)
    mix_2024 = build_macro_mix(tx_2024)
    mix_2023 = build_macro_mix(tx_2023)
    low_turning_2024 = round_number(
        sum(row["share"] for row in mix_2024 if row["name"] in {"국고하", "선반설"}), 2
    )
    low_turning_2023 = round_number(
        sum(row["share"] for row in mix_2023 if row["name"] in {"국고하", "선반설"}), 2
    )

    allocation_grade_labels = ["국고 상", "국고 중", "국고 하", "선반설"]
    allocation = {
        "incheon": {
            "planTotal": round_number(sum(incheon_plan), 0),
            "actualTotal": round_number(sum(incheon_actual), 0),
            "achievementRate": round_number(percent(sum(incheon_actual), sum(incheon_plan)), 2),
            "gradeMix": [
                {
                    "name": label,
                    "qty": round_number(sum(series_from_row(plan_sheet[row_index])), 0),
                }
                for label, row_index in zip(allocation_grade_labels, [2, 3, 4, 5])
            ],
        },
        "pohang": {
            "planTotal": round_number(sum(pohang_plan), 0),
            "actualTotal": round_number(sum(pohang_actual), 0),
            "achievementRate": round_number(percent(sum(pohang_actual), sum(pohang_plan)), 2),
            "gradeMix": [
                {
                    "name": label,
                    "qty": round_number(sum(series_from_row(plan_sheet[row_index])), 0),
                }
                for label, row_index in zip(allocation_grade_labels, [8, 9, 10, 11])
            ],
        },
        "monthly": [
            {
                "month": row["month"],
                "incheonPlan": round_number(incheon_plan[index], 0),
                "incheonActual": round_number(incheon_actual[index], 0),
                "incheonRate": round_number(percent(incheon_actual[index], incheon_plan[index]), 2),
                "pohangPlan": round_number(pohang_plan[index], 0),
                "pohangActual": round_number(pohang_actual[index], 0),
                "pohangRate": round_number(percent(pohang_actual[index], pohang_plan[index]), 2),
            }
            for index, row in enumerate(plan_rows)
        ],
    }

    for plant_name in ["incheon", "pohang"]:
        total_qty = sum(item["qty"] for item in allocation[plant_name]["gradeMix"])
        for item in allocation[plant_name]["gradeMix"]:
            item["share"] = round_number(percent(item["qty"], total_qty), 2)

    total_qty_2024 = round_number(sum(tx["qty"] for tx in tx_2024), 0)
    total_amount_2024 = round_number(sum(tx["amount"] for tx in tx_2024), 0)
    avg_unit_price_2024 = round_number(total_amount_2024 / total_qty_2024, 1)

    data = {
        "meta": {
            "sourceFile": str(source_path),
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "displayNote": "원본 엑셀 값 기준으로 가공했으며, 금액/수량 단위는 파일 값을 그대로 사용합니다.",
            "labels": {
                "amount": "입고금액",
                "quantity": "입고량",
            },
        },
        "overview": {
            "annualTarget": round_number(sum(total_plan), 0),
            "cumulativeActual": round_number(sum(total_actual), 0),
            "attainmentRate": round_number(percent(sum(total_actual), sum(total_plan)), 2),
            "supplierPerformanceAvg": supplier_performance_avg,
            "annualTargetDisplay": compact_number(sum(total_plan)),
            "cumulativeActualDisplay": compact_number(sum(total_actual)),
            "attainmentRateDisplay": f"{round_number(percent(sum(total_actual), sum(total_plan)), 1):.1f}%",
            "supplierPerformanceAvgDisplay": f"{supplier_performance_avg:.1f}%",
        },
        "plan": {
            "monthly": plan_rows,
            "chart": {
                "labels": MONTH_LABELS,
                "plan": [row["plan"] for row in plan_rows],
                "actual": [row["actual"] for row in plan_rows],
            },
        },
        "suppliers": {
            "averagePerformance": supplier_performance_avg,
            "shareChart": [
                {"label": item["supplier"], "value": item["totalQty"]}
                for item in suppliers
            ],
            "trendChart": {
                "labels": MONTH_LABELS,
                "series": [
                    {"name": item["supplier"], "data": item["monthlySeries"]}
                    for item in top_supplier_series
                ],
            },
            "table": suppliers,
        },
        "purchases": {
            "totalQty": total_qty_2024,
            "totalAmount": total_amount_2024,
            "avgUnitPrice": avg_unit_price_2024,
            "totalQtyDisplay": compact_number(total_qty_2024),
            "totalAmountDisplay": compact_number(total_amount_2024),
            "avgUnitPriceDisplay": f"{avg_unit_price_2024:,.1f}",
            "monthly": purchase_monthly,
        },
        "allocation": allocation,
        "gradeImport": {
            "lowTurningRatio2024": low_turning_2024,
            "lowTurningRatio2023": low_turning_2023,
            "deltaShare": round_number(low_turning_2024 - low_turning_2023, 2),
            "mix2024": mix_2024,
            "mix2023": mix_2023,
            "monthlyFocusedRatio2024": build_macro_ratio_by_month(tx_2024),
            "monthlyFocusedRatio2023": build_macro_ratio_by_month(tx_2023),
            "comparisonTable": build_category_comparison(mix_2024, mix_2023),
        },
    }
    return data


def main():
    args = parse_args()
    source_path = Path(args.source).expanduser()
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    dashboard_data = build_dashboard_data(source_path)
    output = "window.dashboardData = " + json.dumps(
        dashboard_data, ensure_ascii=False, indent=2
    ) + ";\n"
    output_path.write_text(output, encoding="utf-8")
    print(f"Generated {output_path}")


if __name__ == "__main__":
    main()
