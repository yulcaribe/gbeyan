from pathlib import Path

VERSION = "1.3.2beta"

index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")

index = index.replace("<!-- VERSION: 1.3.1beta -->", f"<!-- VERSION: {VERSION} -->", 1)
index = index.replace('<meta name="app-version" content="1.3.1beta">', f'<meta name="app-version" content="{VERSION}">', 1)
index = index.replace(
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/yulcaribe/gbeyan@main/style.css">',
    f'<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/yulcaribe/gbeyan@main/style.css?v={VERSION}">',
    1,
)

old_start = '''      <input type="search" class="search-input" id="searchInput"
        placeholder="Uçuş, REG veya meydan ara" oninput="onSearch(this.value)" disabled>
    </div>

    <div class="filter-panel is-disabled" id="flightFilters" aria-disabled="true">'''
new_start = '''      <input type="search" class="search-input" id="searchInput"
        placeholder="Uçuş, REG veya meydan ara" oninput="onSearch(this.value)" disabled>

      <div class="filter-panel is-disabled" id="flightFilters" aria-disabled="true">'''
if old_start not in index:
    raise SystemExit("toolbar/filter start not found")
index = index.replace(old_start, new_start, 1)

old_end = '''      <div class="filter-summary" id="filterSummary">CSV yüklendikten sonra filtreler aktif olacak.</div>
    </div>

    <!-- Table -->'''
new_end = '''        <div class="filter-summary" id="filterSummary">CSV yüklendikten sonra filtreler aktif olacak.</div>
      </div>
    </div>

    <!-- Table -->'''
if old_end not in index:
    raise SystemExit("toolbar/filter end not found")
index = index.replace(old_end, new_end, 1)
index = index.replace('<label for="processFilter">Süreç Durumu</label>', '<label for="processFilter">Süreç</label>', 1)
index = index.replace('        Filtreleri Temizle\n', '        Temizle\n', 1)
index_path.write_text(index, encoding="utf-8")

css_path = Path("style.css")
css = css_path.read_text(encoding="utf-8")
lines = css.splitlines()
if lines and lines[0].startswith("/* TGS HGSB UI styles | version:"):
    lines[0] = f"/* TGS HGSB UI styles | version: {VERSION} */"
    css = "\n".join(lines) + ("\n" if css.endswith("\n") else "")
else:
    css = f"/* TGS HGSB UI styles | version: {VERSION} */\n" + css

marker = "/* ── 1.3.2beta: filters integrated into toolbar ── */"
if marker in css:
    css = css.split(marker, 1)[0].rstrip() + "\n"

override = r'''
/* ── 1.3.2beta: filters integrated into toolbar ── */
.search-input {
  margin-left: auto;
  width: 210px;
  min-height: 34px;
}

.toolbar .filter-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transition: none;
}

.toolbar .filter-panel.is-disabled {
  background: transparent;
  border-color: transparent;
}

.toolbar .filter-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.toolbar .filter-group-wide { min-width: 0; }

.toolbar .filter-group label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}

.toolbar .filter-group select {
  min-height: 34px;
  height: 34px;
  padding: 6px 28px 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}

#directionFilter { width: 88px; }
#comparisonFilter { width: 118px; }
#processFilter { width: 150px; }

.toolbar .filter-reset-btn {
  min-height: 34px;
  height: 34px;
  padding: 6px 10px;
  white-space: nowrap;
}

.toolbar .filter-summary {
  min-height: 34px;
  margin-left: 0;
  gap: 4px 8px;
  color: #64748b;
  font-size: 11px;
  white-space: nowrap;
}

.toolbar .filter-summary strong { font-size: 12px; }
.toolbar .filter-summary span { padding-left: 7px; }
.toolbar .filter-panel.is-disabled .filter-summary { display: none; }

@media (max-width: 1250px) {
  .search-input { margin-left: 0; }
  .toolbar .filter-panel { flex: 1 1 100%; }
}

@media (max-width: 720px) {
  .toolbar { align-items: stretch; }
  .search-input { width: 100%; }
  .toolbar .filter-panel { width: 100%; align-items: stretch; }
  .toolbar .filter-group { flex: 1 1 145px; }
  .toolbar .filter-group select { width: 100% !important; }
  .toolbar .filter-summary { flex: 1 1 100%; white-space: normal; }
}
'''

css_path.write_text(css.rstrip() + "\n\n" + override.strip() + "\n", encoding="utf-8")
