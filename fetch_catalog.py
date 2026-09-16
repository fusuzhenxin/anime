# -*- coding: utf-8 -*-
"""Pull a real anime catalog from public pages into data.js.

Bangumi: /v0 subjects + calendar + HTML rank browser as fallback.
Douban: Top250 + weekly chart HTML only (robots Disallow /search and /j/;
the published sitemaps are mostly books, not usable as an anime crawl).
MAL: topanime.php HTML (sitemap is allowed, used as a title seed).
Scores on cards stay Bangumi; Douban overlay is exact-title animation only.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COVER_DIR = ROOT / "covers"
DATA_JS = ROOT / "data.js"
CACHE_PATH = COVER_DIR / "_catalog_cache.json"
META_PATH = COVER_DIR / "_meta.json"

UA = "DongmanjiCatalog/1.0 (local; 2201219073@qq.com)"
HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
}
SLEEP = 0.85

SEASON_MONTHS = {
    "summer-2026": [(2026, 7), (2026, 8), (2026, 9)],
    "spring-2026": [(2026, 4), (2026, 5), (2026, 6)],
    "fall-2025": [(2025, 10), (2025, 11), (2025, 12)],
    "summer-2025": [(2025, 7), (2025, 8), (2025, 9)],
}
YEAR_2026_MONTHS = [
    (2026, 1), (2026, 2), (2026, 3),
    (2026, 4), (2026, 5), (2026, 6),
    (2026, 7), (2026, 8), (2026, 9),
    (2026, 10), (2026, 11), (2026, 12),
]

ORDER_WALK = {
    "order-aot": 55770,
    "order-kimetsu": 245665,
    "order-jojo": 43558,
}
ORDER_FIXED = {
    "order-eva": [265, 6049],
    "order-fate": [10639, 95225, 109386, 109375, 175599, 175600],
    "order-gundam": [286, 1010, 3113],
    "order-naruto": [3425, 2782],
    "order-db": [9565, 9005, 240287],
    "order-monogatari": [1671, 23161, 56117, 68812, 115932, 82322, 138829, 7707, 148036, 148037, 175596, 233926],
    "order-madoka": [9717, 44693, 334105],
    "order-rezero": [140001, 278826, 316247, 425998, 510728, 547888, 633836],
    "order-mushoku": [277554, 325585, 373247, 444557, 501963],
    "order-bunny": [240038, 260680, 402656, 426239, 467930, 589284],
    "order-fma": [1428, 315, 1935],
}

CLASSIC_SEEDS = {
    "ghibli": [311, 302, 312, 295],
    "miyazaki": [311, 302, 312, 295],
    "shinkai": [160209, 269235, 362577],
    "kon": [839, 840, 841],
    "kyoani": [183878, 1424, 3774, 876, 51],
    "mappa": [294993, 321885],
    "ufotable": [245665, 10639, 95225, 109375],
    "pixar": [1104, 209925],
    "us-high": [1104, 209925, 133860],
    "cn-high": [231261, 383308, 204863, 305515, 13603],
    "_pool": [
        311, 302, 312, 295, 160209, 269235, 362577, 839, 840, 841,
        183878, 1424, 3774, 876, 51, 294993, 321885, 240386, 1104,
        209925, 133860, 400602, 1428, 328609, 253, 10380, 231261,
        383308, 204863, 13603, 326, 324, 1728,
    ],
}

EXTRA_QUERIES = []  # classics come from CLASSIC_SEEDS, not fuzzy search
CN_QUERIES = [
    "哪吒之魔童降世",
    "哪吒之魔童闹海",
    "大鱼海棠",
    "雾山五行",
    "一人之下",
    "全职高手",
    "西游记之大圣归来",
    "白蛇：缘起",
    "长安三万里",
    "深海",
    "中国奇谭",
    "罗小黑战记",
    "雾山五行 恒",
]

JUNK_RE = re.compile(
    r"(毕业|春晚|汇报|联展|优秀作品|特报|预告|宣传片|卡酷|演唱会|朗诵|朗読|"
    r"舞台剧|舞台劇|音乐会|総集編|总集篇|编年史|Q版|关西腔|4D|IN THE DOME|"
    r"Remix|cafe|鬼灭学园|兄妹的羁绊|那田蜘蛛|curtain raiser|配音演员|"
    r"短片集|泡面番|手游|LEGO|Bricktoons|Stop Motion|爆米花时间|特别编集)",
    re.I,
)
TAG_KEEP = [
    "热血", "恋爱", "爱情", "治愈", "日常", "异世界", "转生", "校园", "科幻",
    "悬疑", "推理", "奇幻", "冒险", "搞笑", "喜剧", "百合", "少女", "音乐",
    "机战", "赛博朋克", "战争", "运动", "家庭", "剧情", "武侠", "战斗", "历史",
    "超能力", "惊悚",
]
STUDIO_CN = {
    "サンライズ": "Sunrise",
    "京都アニメーション": "京都动画",
    "スタジオジブリ": "吉卜力",
    "ユーフォーテーブル": "ufotable",
    "ボンズ": "BONES",
    "マッドハウス": "Madhouse",
    "ピクサー・アニメーション・スタジオ": "皮克斯",
    "ピクサー": "皮克斯",
    "ウォルト・ディズニー・アニメーション・スタジオ": "迪士尼",
    "コミックス・ウェーブ・フィルム": "CoMix Wave",
}
DIR_CN = {
    "宮崎駿": "宫崎骏",
    "新海誠": "新海诚",
    "今敏": "今敏",
    "庵野秀明": "庵野秀明",
    "渡辺信一郎": "渡边信一郎",
}

CACHE: dict = {"subjects": {}, "characters": {}, "related": {}, "browse": {}, "persons": {}, "douban": {}, "mal": {}}
DOUBAN_SLEEP = 5.2
MAL_SLEEP = 2.0
SKIP_DOUBAN_TITLES = {
    "音乐之声", "怦然心动", "猫鼠游戏", "七武士", "新世界", "海街日记",
    "黑客帝国", "告白", "大鱼",
}
RANK_N = 1500
HEAT_N = 200
MAL_TOP_N = 150
KEEP_VOTES = 50
POOL_MONTHS = [
    (y, m) for y in (2023, 2024, 2025) for m in range(1, 13)
]


def wid(sid: int) -> str:
    return f"b{sid}"


def load_cache():
    global CACHE
    if CACHE_PATH.exists():
        try:
            CACHE = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            CACHE = {"subjects": {}, "characters": {}, "related": {}}
    CACHE.setdefault("subjects", {})
    CACHE.setdefault("characters", {})
    CACHE.setdefault("related", {})
    CACHE.setdefault("browse", {})
    CACHE.setdefault("persons", {})
    CACHE.setdefault("douban", {})
    CACHE.setdefault("mal", {})


def save_cache():
    COVER_DIR.mkdir(exist_ok=True)
    CACHE_PATH.write_text(json.dumps(CACHE, ensure_ascii=False), encoding="utf-8")


def http_json(url, data=None, retries=8):
    headers = dict(HEADERS)
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    last = None
    for i in range(retries):
        try:
            time.sleep(SLEEP)
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 502, 503, 504):
                time.sleep(6 * (i + 1))
                continue
            if e.code == 404:
                return None
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, ConnectionAbortedError, OSError) as e:
            last = e
            time.sleep(3 * (i + 1))
            continue
    raise last


def browse_month(year, month):
    cache_key = f"{year}-{month}"
    if cache_key in CACHE["browse"]:
        return CACHE["browse"][cache_key]
    out = []
    offset = 0
    while True:
        url = (
            f"https://api.bgm.tv/v0/subjects?type=2&year={year}&month={month}"
            f"&limit=50&offset={offset}"
        )
        data = http_json(url) or {}
        chunk = data.get("data") or []
        out.extend(chunk)
        if len(chunk) < 50 or len(out) >= 200:
            break
        offset += 50
    CACHE["browse"][cache_key] = out
    save_cache()
    return out


def browse_rank(max_n=RANK_N):
    cache_key = f"rank-{max_n}"
    if cache_key in CACHE["browse"]:
        return CACHE["browse"][cache_key]
    out = []
    reused = 0
    for n in sorted(
        (int(k.split("-", 1)[1]) for k in CACHE["browse"] if re.fullmatch(r"rank-\d+", k)),
        reverse=True,
    ):
        if n <= max_n:
            out = list(CACHE["browse"][f"rank-{n}"])
            reused = n
            break
    offset = len(out)
    while len(out) < max_n:
        url = f"https://api.bgm.tv/v0/subjects?type=2&sort=rank&limit=50&offset={offset}"
        data = http_json(url) or {}
        chunk = data.get("data") or []
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < 50:
            break
        offset += 50
        print(f"  rank browse {len(out)}/{max_n} (reuse {reused})", flush=True)
    out = out[:max_n]
    CACHE["browse"][cache_key] = out
    save_cache()
    return out


def http_text(url, delay=DOUBAN_SLEEP):
    time.sleep(delay)
    headers = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as resp:
        return resp.read().decode("utf-8", "replace")


def similar_title(a, b):
    def norm(s):
        return re.sub(r"[\s　:：·・\-—。！!？?\(\)（）\[\]第季部篇]", "", str(s or ""))
    na, nb = norm(a), norm(b)
    return len(na) >= 2 and na == nb


def fetch_douban_top250():
    cached = CACHE.get("douban", {}).get("top250")
    if cached:
        return cached
    rows = []
    for start in range(0, 250, 25):
        html = http_text(f"https://movie.douban.com/top250?start={start}&filter=")
        for block in re.split(r'<div class="item">', html)[1:]:
            mid = re.search(r"subject/(\d+)/", block)
            title = re.search(r'<span class="title">([^<&]+)</span>', block)
            rate = re.search(r'rating_num"[^>]*>([\d.]+)', block)
            if not (mid and title and rate):
                continue
            rows.append({
                "id": mid.group(1),
                "title": title.group(1).strip(),
                "rate": rate.group(1),
            })
        print(f"  douban top250 start={start} got={len(rows)}", flush=True)
    CACHE.setdefault("douban", {})["top250"] = rows
    save_cache()
    return rows


def match_douban_rows(rows):
    hits = []
    for row in rows:
        if row["title"] in SKIP_DOUBAN_TITLES:
            continue
        data = search_subjects(keyword=row["title"], sort="match", limit=5)
        best = None
        for item in data.get("data") or []:
            name = item.get("name_cn") or item.get("name") or ""
            if similar_title(row["title"], name):
                best = item
                break
        if not best:
            continue
        sid = best.get("id")
        if not sid:
            continue
        hits.append((sid, row))
        print(f"  douban {row['title']} {row['rate']} -> {best.get('name_cn') or best.get('name')} {sid}", flush=True)
    return hits


def prune_douban_cache():
    hits = []
    rate = {}
    for h in CACHE.setdefault("douban", {}).get("hits") or []:
        if h.get("title") in SKIP_DOUBAN_TITLES:
            continue
        sid = h.get("sid")
        if not sid or not h.get("rate"):
            continue
        hits.append(h)
        rate[str(sid)] = h["rate"]
    CACHE["douban"]["hits"] = hits
    CACHE["douban"]["rate"] = rate


def fetch_douban_chart():
    cached = CACHE.get("douban", {}).get("chart")
    if cached:
        return cached
    html = http_text("https://movie.douban.com/chart")
    rows = []
    seen = set()
    for m in re.finditer(
        r'href="https://movie\.douban\.com/subject/(\d+)/"[^>]*>\s*([^<]+?)\s*</a>',
        html,
    ):
        title = re.sub(r"\s+", " ", m.group(2)).strip()
        if len(title) < 2 or title in seen or title in SKIP_DOUBAN_TITLES:
            continue
        seen.add(title)
        rows.append({"id": m.group(1), "title": title, "rate": ""})
    CACHE.setdefault("douban", {})["chart"] = rows
    save_cache()
    print(f"  douban chart titles={len(rows)}", flush=True)
    return rows


def fetch_mal_top(n=MAL_TOP_N):
    key = f"top{n}"
    cached = CACHE.get("mal", {}).get(key)
    if cached:
        return cached
    titles = []
    seen = set()
    for start in range(0, n, 50):
        html = http_text(f"https://myanimelist.net/topanime.php?limit={start}", delay=MAL_SLEEP)
        for m in re.finditer(r'href="https://myanimelist\.net/anime/\d+/[^"]*"[^>]*>\s*([^<]+)\s*</a>', html):
            title = re.sub(r"\s+", " ", html_unescape(m.group(1))).strip()
            if len(title) < 2 or title in seen or title in ("More", "Details", "Add to list"):
                continue
            seen.add(title)
            titles.append(title)
            if len(titles) >= n:
                break
        print(f"  mal top start={start} got={len(titles)}", flush=True)
        if len(titles) >= n:
            break
    CACHE.setdefault("mal", {})[key] = titles[:n]
    save_cache()
    return CACHE["mal"][key]


def html_unescape(s):
    return (
        s.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )


def match_mal_titles(titles):
    cached = CACHE.get("mal", {}).get("hits")
    if cached:
        return cached
    sids = []
    seen = set()
    for title in titles:
        data = search_subjects(keyword=title, sort="match", limit=5)
        items = data.get("data") or []
        best = None
        for item in items:
            names = [item.get("name_cn") or "", item.get("name") or ""]
            if any(similar_title(title, n) for n in names if n):
                best = item
                break
        if not best and items and re.search(r"[A-Za-z]{4,}", title):
            best = items[0]
        if not best:
            continue
        sid = best.get("id")
        if not sid or sid in seen:
            continue
        seen.add(sid)
        sids.append(sid)
        CACHE["subjects"].setdefault(str(sid), best)
        print(f"  mal {title} -> {best.get('name_cn') or best.get('name')} {sid}", flush=True)
    CACHE.setdefault("mal", {})["hits"] = sids
    save_cache()
    return sids


def search_subjects(keyword="", sort="rank", tag=None, rank=None, rating_count=None, limit=20, offset=0):
    filt = {"type": [2]}
    if tag:
        filt["tag"] = tag if isinstance(tag, list) else [tag]
    if rank:
        filt["rank"] = rank
    if rating_count:
        filt["rating_count"] = rating_count
    return http_json(
        "https://api.bgm.tv/v0/search/subjects",
        {"keyword": keyword, "sort": sort, "filter": filt, "limit": limit, "offset": offset},
    ) or {}


def get_subject(sid):
    key = str(sid)
    if key in CACHE["subjects"]:
        return CACHE["subjects"][key]
    data = http_json(f"https://api.bgm.tv/v0/subjects/{sid}")
    if data:
        CACHE["subjects"][key] = data
    return data


def get_characters(sid):
    key = str(sid)
    if key in CACHE["characters"]:
        return CACHE["characters"][key]
    data = http_json(f"https://api.bgm.tv/v0/subjects/{sid}/characters")
    CACHE["characters"][key] = data or []
    return CACHE["characters"][key]


def get_persons(sid):
    key = str(sid)
    if key in CACHE["persons"]:
        return CACHE["persons"][key]
    data = http_json(f"https://api.bgm.tv/v0/subjects/{sid}/persons")
    CACHE["persons"][key] = data or []
    return CACHE["persons"][key]


def get_related(sid):
    key = str(sid)
    if key in CACHE["related"]:
        return CACHE["related"][key]
    data = http_json(f"https://api.bgm.tv/v0/subjects/{sid}/subjects")
    CACHE["related"][key] = data or []
    return CACHE["related"][key]


def is_junk(name, platform=""):
    text = f"{name} {platform}"
    if JUNK_RE.search(text):
        return True
    if platform in ("其他",):
        return True
    return False


def walk_sequels(start, maxn=12):
    chain = [start]
    seen = {start}
    cur = start
    for _ in range(maxn):
        rels = get_related(cur)
        nxt = None
        for item in rels:
            if item.get("type") != 2:
                continue
            if item.get("relation") != "续集":
                continue
            sid = item.get("id")
            name = item.get("name_cn") or item.get("name") or ""
            if not sid or sid in seen or is_junk(name):
                continue
            nxt = item
            break
        if not nxt:
            break
        chain.append(nxt["id"])
        seen.add(nxt["id"])
        cur = nxt["id"]
    return chain


def infobox_map(ibox):
    out = {}
    for item in ibox or []:
        key = item.get("key") or ""
        val = item.get("value")
        if isinstance(val, list):
            parts = []
            for x in val:
                if isinstance(x, dict) and "v" in x:
                    parts.append(str(x["v"]))
                elif x:
                    parts.append(str(x))
            val = "、".join(parts)
        out[key] = str(val or "").strip()
    return out


def first_name(s):
    s = (s or "").replace("\n", "、").replace("/", "、").replace(",", "、")
    for sep in ("、", "，", "&"):
        if sep in s:
            s = s.split(sep)[0]
    return s.strip()


def studio_of(info, sid):
    raw = info.get("动画制作") or ""
    parts = re.split(r"[、,/]", raw)
    for part in parts:
        part = part.strip()
        if part and "委員会" not in part and "著作" not in part:
            return STUDIO_CN.get(part, part)
    persons = CACHE["persons"].get(str(sid))
    if not persons:
        return ""
    for person in persons:
        if person.get("relation") == "动画制作":
            name = (person.get("name") or "").strip()
            if name and "委員会" not in name:
                return STUDIO_CN.get(name, name)
    return ""


def season_label(date):
    if not date or len(date) < 7:
        return ""
    try:
        year = int(date[:4])
        month = int(date[5:7])
    except ValueError:
        return ""
    if month in (1, 2, 3):
        season = "冬"
    elif month in (4, 5, 6):
        season = "春"
    elif month in (7, 8, 9):
        season = "夏"
    else:
        season = "秋"
    return f"{year}{season}"


def format_of(platform, eps):
    p = platform or ""
    if p in ("剧场版", "电影"):
        return "movie"
    if p in ("OVA", "OAD", "WEB"):
        return "ova"
    return "tv"


def source_of(info, tags):
    orig = info.get("原作") or ""
    blob = orig + " " + " ".join(tags)
    if any(x in blob for x in ("轻小说", "ライトノベル", "小说")):
        return "轻小说改"
    if any(x in blob for x in ("游戏", "ゲーム", "GAL")):
        return "游戏改"
    if any(x in blob for x in ("漫画", "コミック", "漫画改")):
        return "漫画改"
    if "原创" in tags or orig in ("", "オリジナル", "原创"):
        return "原创"
    return "原创"


def region_of(tags, info, platform):
    blob = " ".join(tags) + " " + (info.get("国家") or "") + " " + (info.get("版权") or "")
    if any(x in blob for x in ("中国", "国产", "国漫", "大陆")):
        return "中国大陆"
    if any(x in blob for x in ("美国", "欧美", "Pixar", "Disney", "迪士尼", "皮克斯")):
        return "美国"
    return "日本"


def fmt_count(n):
    n = int(n or 0)
    if n >= 10000:
        v = n / 10000
        if v >= 10:
            return f"{int(v)}万"
        return f"{v:.1f}万".replace(".0", "")
    return str(n) if n else ""


def pick_tags(raw):
    names = [t.get("name") for t in (raw or []) if t.get("name")]
    kept = []
    for name in names:
        if name in TAG_KEEP and name not in kept:
            kept.append(name)
        if len(kept) >= 4:
            break
    if not kept:
        for name in names:
            if name.isdigit() or name in ("TV", "日本", "原创", "剧场版", "神作"):
                continue
            if len(name) <= 6 and name not in kept:
                kept.append(name)
            if len(kept) >= 3:
                break
    return kept


def seiyuu_of(chars):
    names = []
    mains = [c for c in chars if c.get("relation") in ("主角", "主演")]
    extras = [c for c in chars if c.get("relation") == "配角"]
    for char in mains + extras:
        for actor in char.get("actors") or []:
            name = actor.get("name") or ""
            if not name or name in names:
                continue
            if re.search(r"[A-Za-z]{3,}", name) and not re.search(r"[\u3040-\u9fff]", name):
                continue
            names.append(name)
            if len(names) >= 3:
                return names
    return names


def syn_of(summary, title, year, tags):
    text = re.sub(r"<[^>]+>", "", summary or "")
    text = re.sub(r"\s+", " ", text).strip()
    if text:
        return text[:120]
    bits = [title]
    if year:
        bits.append(str(year))
    if tags:
        bits.append("、".join(tags[:3]))
    return "。".join(bits) + "。"


def badge_of(title, score, total, rank):
    if score and score >= 8.8 and (total or 0) >= 3000:
        return "神作"
    if re.search(r"(第.季|第二季|第三季|最终季|续作)", title):
        return "续作"
    return ""


def dump_meta():
    COVER_DIR.mkdir(exist_ok=True)
    script = (
        "const fs=require('fs');const vm=require('vm');const ctx={window:{}};"
        "vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);"
        "const d=ctx.window.DIEFAN_DATA;"
        "const lists=d.lists.map(({id,category,name,keywords,desc})=>({id,category,name,keywords,desc}));"
        "fs.writeFileSync('covers/_meta.json', JSON.stringify({site:d.site,categories:d.categories,lists},null,2));"
    )
    subprocess.check_call(["node", "-e", script], cwd=ROOT)
    return json.loads(META_PATH.read_text(encoding="utf-8"))


def pick_browse_ids(items, cap=None):
    cleaned = []
    for item in items:
        name = item.get("name_cn") or item.get("name") or ""
        plat = item.get("platform") or ""
        if is_junk(name, plat) or not item.get("id"):
            continue
        cleaned.append(item)
    tv = [x for x in cleaned if (x.get("platform") or "") == "TV"]
    rest = [x for x in cleaned if (x.get("platform") or "") != "TV"]
    if cap is None:
        return [x["id"] for x in tv + rest]
    picked = tv[:cap]
    if len(picked) < cap:
        picked += rest[: cap - len(picked)]
    return [x["id"] for x in picked]


def collect_ids():
    buckets = defaultdict(list)

    def add(list_id, sid):
        if sid and sid not in buckets[list_id]:
            buckets[list_id].append(sid)

    def ingest(items, *list_ids):
        n = 0
        for item in items:
            sid = item.get("id")
            name = item.get("name_cn") or item.get("name") or ""
            if not sid or is_junk(name, item.get("platform") or ""):
                continue
            CACHE["subjects"].setdefault(str(sid), item)
            add("_pool", sid)
            for lid in list_ids:
                add(lid, sid)
            n += 1
        return n

    print("collect seasons", flush=True)
    for list_id, months in SEASON_MONTHS.items():
        raw = []
        for year, month in months:
            raw.extend(browse_month(year, month))
        ingest(raw)
        for sid in pick_browse_ids(raw):
            add(list_id, sid)
        print(f"  {list_id}: {len(buckets[list_id])}", flush=True)

    print("collect year-2026", flush=True)
    raw_year = []
    for year, month in YEAR_2026_MONTHS:
        raw_year.extend(browse_month(year, month))
    ingest(raw_year)
    for sid in pick_browse_ids(raw_year):
        add("year-2026", sid)
    print(f"  year-2026: {len(buckets['year-2026'])}", flush=True)

    print("collect archive months", flush=True)
    for year, month in POOL_MONTHS:
        ingest(browse_month(year, month))
        print(f"  pool {year}-{month}: {len(buckets['_pool'])}", flush=True)

    print("collect weekly calendar", flush=True)
    cal = http_json("https://api.bgm.tv/calendar") or []
    weekly_raw = []
    for day in cal:
        for item in day.get("items") or []:
            if item.get("type") != 2:
                continue
            weekly_raw.append(item)
    ingest(weekly_raw)
    for sid in pick_browse_ids(weekly_raw):
        add("weekly", sid)
    print(f"  weekly: {len(buckets['weekly'])}", flush=True)

    print("collect rank", flush=True)
    for offset in range(0, 200, 20):
        data = search_subjects(sort="rank", rank=[">=1", "<=250"], rating_count=[">=80"], limit=20, offset=offset)
        ingest(data.get("data") or [], "bangumi-top")
        for item in data.get("data") or []:
            if (item.get("platform") or "") in ("剧场版", "电影"):
                add("movie-top", item.get("id"))
    print("collect bangumi rank browse", flush=True)
    rank_items = browse_rank(RANK_N)
    ingest(rank_items)
    for item in rank_items:
        plat = item.get("platform") or ""
        if plat in ("剧场版", "电影"):
            add("movie-top", item.get("id"))
    print(f"  pool after rank: {len(buckets['_pool'])}", flush=True)

    print("collect heat", flush=True)
    try:
        for offset in range(0, HEAT_N, 20):
            data = search_subjects(sort="heat", limit=20, offset=offset)
            ingest(data.get("data") or [])
    except Exception as e:
        print(f"  heat skip: {e}", flush=True)
    print("collect cn tag", flush=True)
    try:
        for offset in range(0, 80, 20):
            data = search_subjects(tag="国产", sort="rank", limit=20, offset=offset)
            ingest(data.get("data") or [], "cn-high")
    except Exception as e:
        print(f"  cn tag skip: {e}", flush=True)

    print("collect douban top250 + chart", flush=True)
    try:
        prune_douban_cache()
        douban_rows = fetch_douban_top250()
        if not (CACHE.get("douban") or {}).get("hits"):
            CACHE.setdefault("douban", {})["rate"] = {}
            CACHE["douban"]["hits"] = []
            for sid, row in match_douban_rows(douban_rows):
                CACHE["douban"]["rate"][str(sid)] = row["rate"]
                CACHE["douban"]["hits"].append({"sid": sid, **row})
            save_cache()
        prune_douban_cache()
        for sid_s in (CACHE.get("douban", {}).get("rate") or {}):
            try:
                add("_pool", int(sid_s))
            except ValueError:
                pass
        chart_rows = fetch_douban_chart()
        if not (CACHE.get("douban") or {}).get("chart_hits"):
            chart_hits = []
            for sid, row in match_douban_rows(chart_rows):
                chart_hits.append({"sid": sid, **row})
                add("_pool", sid)
            CACHE.setdefault("douban", {})["chart_hits"] = chart_hits
            save_cache()
        else:
            for h in CACHE["douban"]["chart_hits"]:
                add("_pool", h.get("sid"))
        print(f"  douban overlays: {len(CACHE['douban'].get('rate') or {})} chart hits: {len(CACHE['douban'].get('chart_hits') or [])}", flush=True)
    except Exception as e:
        print(f"  douban skip: {e}", flush=True)

    print("collect mal top html", flush=True)
    try:
        mal_titles = fetch_mal_top()
        for sid in match_mal_titles(mal_titles):
            add("_pool", sid)
        print(f"  mal matched: {len(CACHE.get('mal', {}).get('hits') or [])}", flush=True)
    except Exception as e:
        print(f"  mal skip: {e}", flush=True)

    print("collect extra queries", flush=True)
    for q in CN_QUERIES:
        data = search_subjects(keyword=q, sort="rank", limit=4)
        for item in (data.get("data") or [])[:2]:
            name = item.get("name_cn") or item.get("name") or ""
            if is_junk(name, item.get("platform") or ""):
                continue
            add("cn-high", item.get("id"))

    print("collect classic seeds", flush=True)
    for list_id, ids in CLASSIC_SEEDS.items():
        for sid in ids:
            add(list_id, sid)
            add("_pool", sid)

    print("collect watch orders", flush=True)
    for list_id, start in ORDER_WALK.items():
        chain = walk_sequels(start)
        print(f"  {list_id}: {chain}", flush=True)
        for sid in chain:
            add(list_id, sid)
            add("_pool", sid)
    for list_id, ids in ORDER_FIXED.items():
        print(f"  {list_id}: {ids}", flush=True)
        for sid in ids:
            add(list_id, sid)
            add("_pool", sid)

    all_ids = []
    seen = set()
    for sids in buckets.values():
        for sid in sids:
            if sid not in seen:
                seen.add(sid)
                all_ids.append(sid)
    print(f"unique ids={len(all_ids)}", flush=True)
    return buckets, all_ids


def hydrate(sid):
    sub = get_subject(sid)
    if not sub or sub.get("nsfw"):
        return None
    name = sub.get("name_cn") or sub.get("name") or ""
    orig = sub.get("name") or ""
    if not name or is_junk(name, sub.get("platform") or ""):
        return None
    info = infobox_map(sub.get("infobox"))
    tags_raw = sub.get("tags") or []
    tags = pick_tags(tags_raw)
    rating = sub.get("rating") or {}
    score = rating.get("score")
    total = rating.get("total") or 0
    rank = rating.get("rank")
    date = sub.get("date") or ""
    year = int(date[:4]) if date[:4].isdigit() else 0
    director = DIR_CN.get(first_name(info.get("导演") or ""), first_name(info.get("导演") or ""))
    if "委員会" in director or "『" in director:
        director = first_name(re.split(r"[『／/]", director)[0])
        director = DIR_CN.get(director, director)
    studio = studio_of(info, sid)
    cached_chars = CACHE["characters"].get(str(sid))
    seiyuu = seiyuu_of(cached_chars) if cached_chars else []
    images = sub.get("images") or {}
    cover_url = images.get("large") or images.get("common") or ""
    work = {
        "id": wid(sid),
        "bgm": sid,
        "title": name,
        "orig": orig if orig != name else "",
        "year": year,
        "region": region_of([t.get("name") for t in tags_raw if t.get("name")], info, sub.get("platform") or ""),
        "rate": f"{score:.1f}" if score else "",
        "count": fmt_count(total),
        "tags": tags,
        "director": director,
        "seiyuu": seiyuu,
        "studio": studio,
        "format": format_of(sub.get("platform") or "", sub.get("eps")),
        "episodes": sub.get("eps") or 0,
        "season": season_label(date),
        "source": source_of(info, [t.get("name") for t in tags_raw if t.get("name")]),
        "badge": badge_of(name, score, total, rank),
        "syn": syn_of(sub.get("summary") or "", name, year, tags),
        "cover_url": cover_url,
        "rank": rank or 9999,
        "score": float(score) if score else 0,
        "total": total,
        "date": date,
        "platform": sub.get("platform") or "",
        "douban": (CACHE.get("douban", {}).get("rate") or {}).get(str(sid) or ""),
    }
    return work


def score_key(work):
    return (work.get("score") or 0, work.get("total") or 0)


def cap_ids(sids, works, cap=None, prefer_tv=False):
    items = [works[s] for s in sids if s in works]
    if prefer_tv:
        tv = [w for w in items if w["format"] == "tv"]
        rest = [w for w in items if w["format"] != "tv"]
        tv.sort(key=lambda w: (-(w.get("total") or 0), w.get("date") or ""))
        rest.sort(key=lambda w: (-(w.get("total") or 0), w.get("date") or ""))
        if cap is None:
            return [w["bgm"] for w in tv + rest]
        picked = tv[:cap]
        if len(picked) < cap:
            picked += rest[: cap - len(picked)]
        return [w["bgm"] for w in picked]
    items.sort(key=score_key, reverse=True)
    if cap is None:
        return [w["bgm"] for w in items]
    return [w["bgm"] for w in items[:cap]]


def fill_from_pool(works, pred, cap=None, exclude=None):
    exclude = exclude or set()
    items = [w for w in works.values() if pred(w) and w["bgm"] not in exclude]
    items.sort(key=score_key, reverse=True)
    ids = [w["bgm"] for w in items]
    return ids if cap is None else ids[:cap]


def assign_lists(buckets, works):
    items = {}

    for key in ("summer-2026", "spring-2026", "fall-2025", "summer-2025"):
        items[key] = cap_ids(buckets.get(key, []), works, prefer_tv=True)
    items["year-2026"] = cap_ids(buckets.get("year-2026", []), works, prefer_tv=True)
    items["weekly"] = cap_ids(buckets.get("weekly", []), works, prefer_tv=True)

    items["bangumi-top"] = fill_from_pool(
        works,
        lambda w: (w.get("total") or 0) >= 500
        and w.get("score", 0) >= 7.8
        and (w.get("year") or 0) >= 1988
        and "猫和老鼠" not in (w.get("title") or ""),
    )
    items["movie-top"] = fill_from_pool(
        works,
        lambda w: w["format"] == "movie" and w.get("score", 0) >= 7.5 and (w.get("total") or 0) >= 80,
    )

    for key in ORDER_WALK:
        items[key] = [s for s in buckets.get(key, []) if s in works]
    for key, ids in ORDER_FIXED.items():
        items[key] = [s for s in ids if s in works]

    items["jp-high"] = fill_from_pool(
        works, lambda w: w["region"] == "日本" and w["score"] >= 8.0 and (w.get("total") or 0) >= 200
    )
    items["cn-high"] = list(dict.fromkeys(
        [s for s in buckets.get("cn-high", []) if s in works]
        + fill_from_pool(works, lambda w: w["region"] == "中国大陆")
    ))
    items["cn-high"] = [
        s for s in items["cn-high"]
        if works.get(s)
        and (works[s].get("year") or 0) >= 1980
        and (works[s].get("score") or 0) >= 5.0
    ]
    seen_titles = set()
    deduped = []
    for sid in items["cn-high"]:
        title = re.sub(r"[·・\s]", "", works[sid]["title"])[:10]
        if title in seen_titles:
            continue
        seen_titles.add(title)
        deduped.append(sid)
    items["cn-high"] = deduped
    items["us-high"] = list(dict.fromkeys(
        [s for s in buckets.get("us-high", []) if s in works and w_region_us(works[s])]
        + fill_from_pool(works, lambda w: w["region"] == "美国")
    ))
    items["tv-high"] = fill_from_pool(
        works, lambda w: w["format"] == "tv" and w["score"] >= 8.0 and (w.get("total") or 0) >= 200
    )
    items["movie-high"] = fill_from_pool(
        works, lambda w: w["format"] == "movie" and w["score"] >= 7.5 and (w.get("total") or 0) >= 80
    )
    items["ova-web"] = fill_from_pool(works, lambda w: w["format"] == "ova")

    def has_tag(*needles):
        def pred(w):
            blob = " ".join(w.get("tags") or []) + w.get("title", "") + w.get("syn", "")
            return any(n in blob for n in needles) and (w.get("total") or 0) >= 40
        return pred

    items["shonen"] = fill_from_pool(works, has_tag("热血", "战斗"))
    items["romance"] = fill_from_pool(works, has_tag("恋爱", "爱情"))
    items["heal"] = fill_from_pool(works, has_tag("治愈", "日常"))
    items["isekai"] = fill_from_pool(works, has_tag("异世界", "转生"))
    items["school"] = fill_from_pool(works, has_tag("校园"))
    items["scifi"] = fill_from_pool(works, has_tag("科幻", "机战", "赛博朋克"))
    items["mystery"] = fill_from_pool(works, has_tag("悬疑", "推理", "惊悚"))
    items["fantasy"] = fill_from_pool(works, has_tag("奇幻", "冒险", "魔法"))
    items["comedy"] = fill_from_pool(works, has_tag("搞笑", "喜剧"))
    items["female"] = fill_from_pool(works, has_tag("百合", "少女"))

    items["manga"] = fill_from_pool(works, lambda w: w.get("source") == "漫画改")
    items["ln"] = fill_from_pool(works, lambda w: w.get("source") == "轻小说改")
    items["game"] = fill_from_pool(works, lambda w: w.get("source") == "游戏改")
    items["original"] = fill_from_pool(works, lambda w: w.get("source") == "原创")

    def studio_is(*needles):
        def pred(w):
            blob = f"{w.get('studio') or ''} {w.get('director') or ''}"
            return any(n in blob for n in needles)
        return pred

    items["kyoani"] = list(dict.fromkeys(
        [s for s in buckets.get("kyoani", []) if s in works]
        + fill_from_pool(works, studio_is("京都动画", "京都アニメーション", "Kyoto Animation"))
    ))
    items["mappa"] = list(dict.fromkeys(
        [s for s in buckets.get("mappa", []) if s in works]
        + fill_from_pool(works, lambda w: "MAPPA" in (w.get("studio") or "") and w.get("score", 0) >= 6.5)
    ))
    items["ufotable"] = list(dict.fromkeys(
        [s for s in buckets.get("ufotable", []) if s in works]
        + fill_from_pool(works, studio_is("ufotable", "ユーフォーテーブル"))
    ))
    items["ghibli"] = list(dict.fromkeys(
        [s for s in buckets.get("ghibli", []) if s in works]
        + fill_from_pool(works, studio_is("吉卜力", "ジブリ"))
    ))
    items["pixar"] = list(dict.fromkeys(
        [s for s in buckets.get("pixar", []) if s in works]
        + fill_from_pool(works, studio_is("皮克斯", "Pixar"))
    ))
    items["miyazaki"] = list(dict.fromkeys(
        [s for s in buckets.get("miyazaki", []) if s in works]
        + fill_from_pool(works, studio_is("宫崎骏", "宮崎駿"))
    ))
    items["shinkai"] = list(dict.fromkeys(
        [s for s in buckets.get("shinkai", []) if s in works]
        + fill_from_pool(works, studio_is("新海诚", "新海誠"))
    ))
    items["kon"] = list(dict.fromkeys(
        [s for s in buckets.get("kon", []) if s in works]
        + fill_from_pool(works, studio_is("今敏"))
    ))

    return items


def w_region_us(work):
    return work.get("region") == "美国"


def used_ids(list_items):
    seen = []
    for sids in list_items.values():
        for sid in sids:
            if sid not in seen:
                seen.append(sid)
    return seen


def download_cover(url, dest_stem: Path):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://bgm.tv/"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        blob = resp.read()
        ctype = (resp.headers.get_content_type() or "").lower()
    ext = ".jpg"
    if "png" in ctype or url.lower().endswith(".png"):
        ext = ".png"
    elif "webp" in ctype or url.lower().endswith(".webp"):
        ext = ".webp"
    path = dest_stem.with_suffix(ext)
    path.write_bytes(blob)
    if path.stat().st_size < 800:
        path.unlink(missing_ok=True)
        raise RuntimeError("tiny cover")
    return path


def existing_cover(stem: Path):
    for ext in (".jpg", ".png", ".webp"):
        p = stem.with_suffix(ext)
        if p.exists() and p.stat().st_size > 800:
            return p
    return None


def write_data_js(meta, works, list_items):
    public_works = []
    for work in works:
        row = {
            "id": work["id"],
            "cover": work.get("cover") or "",
            "title": work["title"],
            "orig": work.get("orig") or "",
            "year": work.get("year") or 0,
            "region": work.get("region") or "",
            "rate": work.get("rate") or "",
            "count": work.get("count") or "",
            "tags": work.get("tags") or [],
            "director": work.get("director") or "",
            "seiyuu": work.get("seiyuu") or [],
            "studio": work.get("studio") or "",
            "format": work.get("format") or "tv",
            "episodes": work.get("episodes") or 0,
            "season": work.get("season") or "",
            "source": work.get("source") or "",
            "badge": work.get("badge") or "",
            "syn": work.get("syn") or "",
        }
        if work.get("douban"):
            row["douban"] = work["douban"]
        if not row["cover"]:
            del row["cover"]
        public_works.append(row)

    bind = {lid: [wid(s) for s in sids] for lid, sids in list_items.items()}
    payload = {
        "site": meta["site"],
        "categories": meta["categories"],
        "lists": meta["lists"],
        "works": public_works,
    }
    lists_js = json.dumps(payload["lists"], ensure_ascii=False, indent=2)
    works_js = json.dumps(public_works, ensure_ascii=False, indent=2)
    site_js = json.dumps(payload["site"], ensure_ascii=False, indent=2)
    cats_js = json.dumps(payload["categories"], ensure_ascii=False, indent=2)
    items_js = json.dumps(bind, ensure_ascii=False, indent=2)
    text = (
        "/* 动漫集 · Bangumi 真实目录（fetch_catalog.py 生成，勿手改 works）\n"
        " * site.baseUrl 为正式域名，改域名后请运行 node build.js\n"
        " */\n"
        "window.DIEFAN_DATA = {\n"
        f"  site: {site_js},\n"
        f"  categories: {cats_js},\n"
        f"  lists: {lists_js},\n"
        f"  works: {works_js}\n"
        "};\n\n"
        "(function bindListItems(data){\n"
        f"  const items = {items_js};\n"
        "  data.lists.forEach(list => {\n"
        "    const ids = items[list.id] || [];\n"
        "    list.items = [...new Set(ids)];\n"
        "  });\n"
        "})(window.DIEFAN_DATA);\n"
    )
    DATA_JS.write_text(text, encoding="utf-8")


def prune_old_pages(valid_ids):
    wdir = ROOT / "w"
    if not wdir.exists():
        return
    keep = {f"{i}.html" for i in valid_ids}
    for path in wdir.glob("*.html"):
        if path.name not in keep:
            path.unlink()


def parse_count(s):
    s = str(s or "").strip()
    if not s:
        return 0
    if s.endswith("万"):
        try:
            return int(float(s[:-1]) * 10000)
        except ValueError:
            return 0
    try:
        return int(s)
    except ValueError:
        return 0


def load_public_payload():
    script = (
        "const fs=require('fs');const vm=require('vm');const ctx={window:{}};"
        "vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);"
        "const d=ctx.window.DIEFAN_DATA;"
        "fs.writeFileSync('_tmp_bind.json', JSON.stringify({"
        "works:d.works,"
        "items:Object.fromEntries(d.lists.map(l=>[l.id,l.items||[]]))"
        "}));"
    )
    subprocess.check_call(["node", "-e", script], cwd=ROOT)
    path = ROOT / "_tmp_bind.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    path.unlink(missing_ok=True)
    return payload


def rebind_lists():
    load_cache()
    meta = dump_meta()
    payload = load_public_payload()
    works = {}
    public = []
    for w in payload["works"]:
        sid = int(str(w["id"])[1:])
        row = dict(w)
        row["bgm"] = sid
        try:
            row["score"] = float(w.get("rate") or 0)
        except ValueError:
            row["score"] = 0.0
        row["total"] = parse_count(w.get("count"))
        works[sid] = row
        public.append(row)

    buckets = defaultdict(list)
    for lid, ids in (payload.get("items") or {}).items():
        for wid_s in ids or []:
            try:
                buckets[lid].append(int(str(wid_s)[1:]))
            except ValueError:
                pass

    for list_id, months in SEASON_MONTHS.items():
        raw = []
        for year, month in months:
            raw.extend(browse_month(year, month))
        buckets[list_id] = pick_browse_ids(raw)
    raw_year = []
    for year, month in YEAR_2026_MONTHS:
        raw_year.extend(browse_month(year, month))
    buckets["year-2026"] = pick_browse_ids(raw_year)

    list_items = assign_lists(buckets, works)
    write_data_js(meta, public, list_items)
    print("list sizes", {k: len(v) for k, v in list_items.items()})
    subprocess.check_call(["node", "build.js"], cwd=ROOT)
    print("done")


def main():
    COVER_DIR.mkdir(exist_ok=True)
    load_cache()
    meta = dump_meta()
    buckets, all_ids = collect_ids()
    save_cache()

    works = {}
    dirty = 0
    for i, sid in enumerate(all_ids, 1):
        sub_cached = CACHE["subjects"].get(str(sid))
        cached = bool(sub_cached)
        if not cached:
            print(f"hydrate [{i}/{len(all_ids)}] {sid}", flush=True)
        try:
            work = hydrate(sid)
        except Exception as e:
            print(f"  skip {sid}: {e}", flush=True)
            continue
        if work:
            works[sid] = work
        if not cached:
            dirty += 1
            if dirty % 8 == 0:
                save_cache()
    save_cache()
    print(f"hydrated {len(works)}", flush=True)

    list_items = assign_lists(buckets, works)
    keep = used_ids(list_items)
    for sid, work in works.items():
        if sid in keep:
            continue
        if (work.get("total") or 0) >= KEEP_VOTES or work.get("douban"):
            keep.append(sid)
    final_works = [works[s] for s in keep if s in works]

    print("download covers", flush=True)
    for i, work in enumerate(final_works, 1):
        stem = COVER_DIR / work["id"]
        exist = existing_cover(stem)
        if exist:
            work["cover"] = f"covers/{exist.name}"
            continue
        url = work.get("cover_url") or ""
        if not url:
            continue
        print(f"  cover [{i}/{len(final_works)}] {work['id']} {work['title']}", flush=True)
        try:
            path = download_cover(url, stem)
            work["cover"] = f"covers/{path.name}"
        except Exception as e:
            print(f"  cover fail {work['id']}: {e}", flush=True)

    write_data_js(meta, final_works, list_items)
    prune_old_pages([w["id"] for w in final_works])
    empty = [lid for lid, sids in list_items.items() if not sids]
    print("empty lists:", empty)
    print("works", len(final_works), "list sizes", {k: len(v) for k, v in list_items.items()})
    subprocess.check_call(["node", "build.js"], cwd=ROOT)
    print("done")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--rebind":
        rebind_lists()
    else:
        main()
