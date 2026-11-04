"""Import the first worksheet of the verified drink workbook into the app."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = {
    "饮品 ID": "id", "产品名称": "name", "品类": "category",
    "公开原料": "ingredients", "原料证据": "evidence",
    "公开可选规格": "options", "官网推荐点单": "recommended",
    "主要来源": "url", "补充来源": "secondary",
}


def extract(file):
    with ZipFile(file) as workbook:
        strings = [
            "".join(text.text or "" for text in entry.findall(".//x:t", NS))
            for entry in ET.fromstring(workbook.read("xl/sharedStrings.xml"))
        ]
        source = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in source.findall("x:sheetData/x:row", NS):
        values = {}
        for cell in row.findall("x:c", NS):
            raw = cell.findtext("x:v", namespaces=NS)
            kind = cell.get("t")
            if kind == "inlineStr":
                raw = "".join(text.text or "" for text in cell.findall(".//x:t", NS))
            if raw and kind in ("s", "str", "inlineStr"):
                values[re.sub(r"[0-9]", "", cell.attrib["r"])] = strings[int(raw)] if kind == "s" else raw
        if values:
            rows.append(values)
    if not rows:
        raise ValueError("The drink worksheet has no readable rows.")
    columns = {FIELDS[title]: col for col, title in rows[0].items() if title in FIELDS}
    if set(columns) != set(FIELDS.values()):
        raise ValueError("The drink worksheet is missing one or more required headers.")
    cards = []
    for row in rows[1:]:
        card = {key: row[col] for key, col in columns.items() if row.get(col)}
        if not all(card.get(key) for key in ("id", "name", "ingredients", "url")):
            raise ValueError(f"Incomplete catalog row {row!r}")
        for key in ("url", "secondary"):
            if key in card and (urlsplit(card[key]).scheme != "https" or not urlsplit(card[key]).hostname):
                raise ValueError(f"Invalid source URL for {card['id']}")
        cards.append(card)
    if not cards or len({card["id"] for card in cards}) != len(cards):
        raise ValueError("Missing or duplicate catalog IDs.")
    return cards


if __name__ == "__main__":
    catalog = extract(sys.argv[1])
    target = Path(__file__).parent / "assets" / "public-data.js"
    lines = ",\n".join("  " + json.dumps(card, ensure_ascii=False) for card in catalog)
    target.write_text("const publicCards = [\n" + lines + "\n];\n", encoding="utf-8")
    print(f"Imported {len(catalog)} public ingredient cards")
