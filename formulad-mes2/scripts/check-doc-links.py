#!/usr/bin/env python3
"""Проверяет относительные ссылки и якоря во всех *.md репозитория. Выход 1, если есть битые."""
import glob, os, re, sys

def slug(h: str) -> str:
    h = re.sub(r"`", "", h.strip().lower())
    h = re.sub(r"[^\w\s-]", "", h, flags=re.U)
    return re.sub(r"\s", "-", h)

def strip_code(text: str) -> str:
    return re.sub(r"```.*?```", "", text, flags=re.S)

files = [f for f in glob.glob("**/*.md", recursive=True) if "node_modules" not in f]
heads = {}
for f in files:
    heads[os.path.normpath(f)] = {slug(m.group(1)) for m in re.finditer(r"^#{1,6}\s+(.+?)\s*$", strip_code(open(f, encoding="utf-8").read()), flags=re.M)}

bad = []
for f in files:
    for target in re.findall(r"\]\(([^)\s]+)\)", strip_code(open(f, encoding="utf-8").read())):
        if target.startswith(("http", "mailto:")):
            continue
        path, _, anchor = target.partition("#")
        dest = os.path.normpath(os.path.join(os.path.dirname(f), path)) if path else os.path.normpath(f)
        if not os.path.exists(dest):
            bad.append((f, target, "нет файла"))
        elif anchor and dest.endswith(".md") and anchor not in heads.get(dest, set()):
            bad.append((f, target, "нет якоря"))

for item in bad:
    print("битая ссылка:", *item)
print(f"проверено файлов: {len(files)}, битых ссылок: {len(bad)}")
sys.exit(1 if bad else 0)
