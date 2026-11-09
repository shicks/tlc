#!/usr/bin/env python3
"""
Extract attendance data from Trail Life meeting attendance spreadsheets (.xlsx inside a .zip).

Produces CSV format compatible with the Trail Life Connect userscript Attendance tracker:
    Group,Last Name,First Name

Features:
- Handles .zip files containing one or more .xlsx spreadsheets.
- By default, exports attendance for the most recent meeting date found.
- Supports selecting earlier meeting dates via --date / -d.
- Supports listing all available meeting dates via --list-dates / -l.
- Supports exporting all dates to individual CSV files via --all.
- Works with all Trail Life levels: Foxes, Hawks, Mountain Lions, Navigators, Adventurers.
- Zero external dependencies: uses Python standard library only.
"""

import argparse
import csv
import glob
from io import BytesIO, StringIO
import os
import re
import sys
from datetime import datetime, date
import xml.etree.ElementTree as ET
import zipfile


def parse_xlsx(xlsx_bytes):
    """
    Parses a single sheet from .xlsx bytes into a list of row dictionaries:
    [{'A': 'val', 'B': 'val', ...}, ...]
    Uses standard library zipfile + ElementTree (zero third-party dependencies).
    """
    zf = zipfile.ZipFile(BytesIO(xlsx_bytes))
    
    # 1. Parse shared strings if present
    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in root.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
            text = "".join(
                t.text or ""
                for t in si.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
            )
            shared_strings.append(text)
            
    # 2. Parse sheet1.xml
    sheet_xml = zf.read("xl/worksheets/sheet1.xml")
    root = ET.fromstring(sheet_xml)
    
    rows = []
    for row in root.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
        r_idx = int(row.attrib.get("r", len(rows) + 1))
        while len(rows) < r_idx:
            rows.append({})
        current_row = rows[r_idx - 1]
        for c in row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
            col_ref = "".join(filter(str.isalpha, c.attrib.get("r", "")))
            if not col_ref:
                continue
            val = ""
            v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
            if v is not None and v.text is not None:
                if c.attrib.get("t") == "s":
                    try:
                        val = shared_strings[int(v.text)]
                    except (IndexError, ValueError):
                        val = v.text
                else:
                    val = v.text
            current_row[col_ref] = val
    return rows


def parse_meeting_date(raw_header):
    """
    Extracts a datetime.date from header text like "9/14/2026 7:00 PM" or "10/26/2026".
    """
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw_header)
    if m:
        month = int(m.group(1))
        day = int(m.group(2))
        year = int(m.group(3))
        if year < 100:
            year += 2000
        return date(year, month, day)
    
    # Try YYYY-MM-DD
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw_header)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def clean_group_name(raw_name):
    """
    Cleans group titles from Row 2, e.g.:
      "Navigators - grade 6 (247)" -> "Navigators - Grade 6"
      "Navigators - grades 7 and 8 (597)" -> "Navigators - Grades 7-8"
      "Foxes (594)" -> "Foxes"
      "Adventurers (598)" -> "Adventurers"
    """
    # Remove trailing group ID like (594)
    name = re.sub(r"\s*\(\d+\)$", "", raw_name).strip()
    # Normalize grade strings for neatness
    name = re.sub(r"-\s*grade\s*6\b", "- Grade 6", name, flags=re.IGNORECASE)
    name = re.sub(r"-\s*grades\s*7\s*and\s*8\b", "- Grades 7-8", name, flags=re.IGNORECASE)
    return name


def is_attended(cell_value):
    """
    Returns True if the cell indicates attendance (check mark ✔, 'x', '1', etc.).
    """
    v = (cell_value or "").strip()
    return v in ("✔", "x", "X", "1", "yes", "Yes", "TRUE", "true")


def load_all_attendance(zip_or_dir_path):
    """
    Reads all .xlsx files in the zip file or directory.
    Returns:
      date_records: dict of date -> list of dict({'group': ..., 'lastname': ..., 'firstname': ..., 'id': ...})
      all_dates: sorted list of date objects
    """
    xlsx_files = {}  # filename -> bytes

    if os.path.isdir(zip_or_dir_path):
        for root, _, files in os.walk(zip_or_dir_path):
            for f in files:
                if f.lower().endswith(".xlsx") and not f.startswith("~$"):
                    p = os.path.join(root, f)
                    with open(p, "rb") as fp:
                        xlsx_files[f] = fp.read()
    elif zipfile.is_zipfile(zip_or_dir_path):
        with zipfile.ZipFile(zip_or_dir_path, "r") as zf:
            for name in zf.namelist():
                if name.lower().endswith(".xlsx") and not os.path.basename(name).startswith("~$"):
                    xlsx_files[name] = zf.read(name)
    else:
        raise ValueError(f"Path is neither a valid zip file nor a directory: {zip_or_dir_path}")

    if not xlsx_files:
        raise ValueError(f"No .xlsx files found in {zip_or_dir_path}")

    date_records = {}  # date -> list of dict

    for fname, data in sorted(xlsx_files.items()):
        rows = parse_xlsx(data)
        if len(rows) < 5:
            continue

        # Row 2 (index 1) typically contains the group name, e.g. "Foxes (594)"
        group_raw = rows[1].get("A", "")
        group = clean_group_name(group_raw) or os.path.splitext(os.path.basename(fname))[0]

        # Row 5 (index 4) contains column headers
        header_row = rows[4]
        date_cols = {}  # col_ref -> date
        for col, val in header_row.items():
            if col not in ("A", "B", "C", "D"):
                d = parse_meeting_date(val)
                if d:
                    date_cols[col] = d

        # Row 6+ (index 5+) contains attendee records
        for r in rows[5:]:
            first_name = r.get("B", "").strip()
            last_name = r.get("C", "").strip()
            person_id = r.get("A", "").strip()
            if not first_name and not last_name:
                continue

            for col, d in date_cols.items():
                if is_attended(r.get(col, "")):
                    date_records.setdefault(d, []).append({
                        "group": group,
                        "lastname": last_name,
                        "firstname": first_name,
                        "id": person_id,
                    })

    all_dates = sorted(date_records.keys())
    return date_records, all_dates


def deduplicate_and_sort(records):
    """
    Deduplicates members by (Last Name, First Name) and sorts alphabetically.
    """
    seen = set()
    unique = []
    for r in records:
        key = (r["lastname"].lower(), r["firstname"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    unique.sort(key=lambda r: (r["lastname"].lower(), r["firstname"].lower()))
    return unique


def format_csv(records):
    """
    Formats attendee records into CSV text:
      Group,Last Name,First Name
    """
    out = StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["Group", "Last Name", "First Name"])
    for r in records:
        writer.writerow([r["group"], r["lastname"], r["firstname"]])
    return out.getvalue()


def parse_target_date(user_str, available_dates):
    """
    Matches user date input to one of available_dates.
    Supports:
      2026-10-26, 10/26/2026, 10/26/26, 10/26, 20261026
    """
    target = None
    # 1. Try ISO YYYY-MM-DD
    try:
        target = datetime.strptime(user_str, "%Y-%m-%d").date()
    except ValueError:
        pass

    # 2. Try MM/DD/YYYY
    if not target:
        try:
            target = datetime.strptime(user_str, "%m/%d/%Y").date()
        except ValueError:
            pass

    # 3. Try MM/DD/YY
    if not target:
        try:
            target = datetime.strptime(user_str, "%m/%d/%y").date()
        except ValueError:
            pass

    # 4. Try YYYYMMDD
    if not target:
        try:
            target = datetime.strptime(user_str, "%Y%m%d").date()
        except ValueError:
            pass

    # 5. Try MM/DD (assume current or matching available year)
    if not target:
        m = re.match(r"^(\d{1,2})/(\d{1,2})$", user_str)
        if m:
            mo, dy = int(m.group(1)), int(m.group(2))
            matches = [d for d in available_dates if d.month == mo and d.day == dy]
            if len(matches) == 1:
                return matches[0]
            elif len(matches) > 1:
                return matches[-1]  # Most recent

    if target:
        if target in available_dates:
            return target
        # Check if year was omitted or mismatch
        for d in available_dates:
            if d.month == target.month and d.day == target.day:
                return d

    return None


def find_default_zip():
    """
    Searches current directory for attendance zip files.
    """
    # Prefer files starting with traillife
    tl_zips = glob.glob("traillife*.zip") + glob.glob("*attendance*.zip")
    if tl_zips:
        return sorted(tl_zips)[-1]
    all_zips = glob.glob("*.zip")
    if all_zips:
        return sorted(all_zips)[-1]
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract meeting attendance CSV from Trail Life attendance spreadsheet zip."
    )
    parser.add_argument(
        "zip_path",
        nargs="?",
        default=None,
        help="Path to the attendance .zip file or folder of .xlsx files (default: auto-detect *.zip in current dir)",
    )
    parser.add_argument(
        "-d", "--date",
        dest="date",
        help="Meeting date to export (e.g. 2026-10-26, 10/26/2026). Default: most recent meeting.",
    )
    parser.add_argument(
        "-l", "--list-dates",
        action="store_true",
        help="List all meeting dates found in the spreadsheets with attendee counts.",
    )
    parser.add_argument(
        "-a", "--all", "--all-dates",
        dest="all_dates",
        action="store_true",
        help="Export all meeting dates to individual CSV files.",
    )
    parser.add_argument(
        "-o", "--output",
        help="Output file path (default: stdout).",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory to save CSV files when using --all (default: current directory).",
    )

    args = parser.parse_args()

    # Determine input path
    input_path = args.zip_path
    if not input_path:
        input_path = find_default_zip()
        if not input_path:
            sys.stderr.write("Error: No zip file specified and no .zip file found in current directory.\n")
            sys.exit(1)
        sys.stderr.write(f"Using zip file: {input_path}\n")

    if not os.path.exists(input_path):
        sys.stderr.write(f"Error: File not found: {input_path}\n")
        sys.exit(1)

    try:
        date_records, available_dates = load_all_attendance(input_path)
    except Exception as e:
        sys.stderr.write(f"Error reading spreadsheets: {e}\n")
        sys.exit(1)

    if not available_dates:
        sys.stderr.write("Error: No meeting date columns found in spreadsheets.\n")
        sys.exit(1)

    # 1. Handle --list-dates
    if args.list_dates:
        print(f"Available meeting dates in {os.path.basename(input_path)}:")
        for idx, d in enumerate(available_dates, 1):
            unique = deduplicate_and_sort(date_records[d])
            tag = " [LATEST]" if d == available_dates[-1] else ""
            print(f"  {idx:2d}. {d.isoformat()} ({d.strftime('%m/%d/%Y')}) - {len(unique):3d} attendees{tag}")
        return

    # 2. Handle --all-dates
    if args.all_dates:
        os.makedirs(args.output_dir, exist_ok=True)
        print(f"Exporting {len(available_dates)} meeting dates to '{args.output_dir}':")
        for d in available_dates:
            unique = deduplicate_and_sort(date_records[d])
            csv_text = format_csv(unique)
            filename = os.path.join(args.output_dir, f"attendance_{d.isoformat()}.csv")
            with open(filename, "w", encoding="utf-8") as fp:
                fp.write(csv_text)
            print(f"  - {filename} ({len(unique)} attendees)")
        return

    # 3. Handle single date (default to latest or user specified)
    if args.date:
        selected_date = parse_target_date(args.date, available_dates)
        if not selected_date:
            sys.stderr.write(f"Error: Date '{args.date}' not found in spreadsheets.\n")
            sys.stderr.write("Available dates:\n")
            for d in available_dates:
                sys.stderr.write(f"  - {d.isoformat()} ({d.strftime('%m/%d/%Y')})\n")
            sys.exit(1)
    else:
        selected_date = available_dates[-1]

    unique_attendees = deduplicate_and_sort(date_records[selected_date])
    csv_text = format_csv(unique_attendees)

    sys.stderr.write(
        f"Exported attendance for {selected_date.isoformat()} ({selected_date.strftime('%m/%d/%Y')}): "
        f"{len(unique_attendees)} attendees.\n"
    )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fp:
            fp.write(csv_text)
        sys.stderr.write(f"Wrote to {args.output}\n")
    else:
        # Write CSV to stdout
        sys.stdout.write(csv_text)


if __name__ == "__main__":
    main()
