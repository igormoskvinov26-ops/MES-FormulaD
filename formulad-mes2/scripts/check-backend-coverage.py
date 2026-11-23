#!/usr/bin/env python3
"""Покрытие бэкенда строками из cobertura (без *.generated.cs) и проверка порога.
Использование: check-backend-coverage.py <папка с результатами dotnet test --collect "XPlat Code Coverage"> [мин_%]
Порог ставится чуть ниже текущего значения: он не даёт покрытию падать, а не требует «красивой цифры».
Слой Sql* пока не запускался на реальной базе (T-020/T-021) и почти не покрыт — это видно в разбивке."""
import glob, sys
import xml.etree.ElementTree as ET

folder = sys.argv[1]
minimum = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
files = glob.glob(f"{folder}/**/coverage.cobertura.xml", recursive=True)
if not files:
    sys.exit("coverage.cobertura.xml не найден")
root = ET.parse(files[0]).getroot()
tot = {"all": [0, 0], "sql": [0, 0], "rest": [0, 0]}
for cls in root.iter("class"):
    name = cls.get("filename", "")
    if name.endswith(".generated.cs"):
        continue
    for line in cls.findall("./lines/line"):
        hit = 1 if int(line.get("hits", "0")) > 0 else 0
        for key in ("all", "sql" if name.replace("\\", "/").split("/")[-1].startswith("Sql") else "rest"):
            tot[key][0] += hit
            tot[key][1] += 1
pct = {k: 100 * h / n if n else 0 for k, (h, n) in tot.items()}
print(f"Покрытие строк бэкенда: {pct['all']:.1f}% (Demo и остальное: {pct['rest']:.1f}%, слой Sql*: {pct['sql']:.1f}%)")
if pct["all"] < minimum:
    sys.exit(f"Ниже порога {minimum:.1f}%")
