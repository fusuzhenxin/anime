# -*- coding: utf-8 -*-
"""Download local poster files from Bangumi, with AniList as fallback."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COVER_DIR = ROOT / "covers"
DATA_JS = ROOT / "data.js"
UA = "DieFanCoverBot/0.1 (local catalog; 2201219073@qq.com)"
HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
}

# Extra search strings when orig/title would miss the right subject.
ALIASES = {
    "bocchi": "ぼっち・ざ・ろっく！",
    "violetm": "ヴァイオレット・エヴァーガーデン 劇場版",
    "mugen": "劇場版 鬼滅の刃 無限列車編",
    "yuukaku": "鬼滅の刃 遊郭編",
    "hf": "Fate/stay night Heaven's Feel I. presage flower",
    "jojo1": "ジョジョの奇妙な冒険",
    "aot3": "進撃の巨人 Season 3",
    "aot3p2": "進撃の巨人 Season 3 Part.2",
    "aotf": "進撃の巨人 The Final Season",
    "bleach26": "BLEACH 千年血戦篇-禍進譚-",
    "mushoku3": "無職転生 第3期",
    "gitsh26": "攻殻機動隊 THE GHOST IN THE SHELL",
    "opposite": "正反対な君と僕",
    "drawdie": "これ描いて死ね",
    "mew": "ヤニねこ",
    "walle": "WALL·E",
    "coco": "Coco",
    "zootopia": "Zootopia",
    "nezha": "哪吒之魔童降世",
    "daji": "大鱼海棠",
    "wushan": "雾山五行",
    "yiren": "一人之下",
    "qwgs": "全职高手",
    "clannad": "CLANNAD",
    "ghost": "GHOST IN THE SHELL",
    "gundamuc": "機動戦士ガンダムUC",
    "millennium": "千年女優",
    "perfectblue": "パーフェクトブルー",
}


def load_works():
    import subprocess
    COVER_DIR.mkdir(exist_ok=True)
    dump = COVER_DIR / "_works.json"
    script = (
        "const fs=require('fs');const vm=require('vm');const ctx={window:{}};"
        "vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);"
        "fs.writeFileSync('covers/_works.json', JSON.stringify(ctx.window.DIEFAN_DATA.works));"
    )
    subprocess.check_call(["node", "-e", script], cwd=ROOT)
    return json.loads(dump.read_text(encoding="utf-8"))


def http_json(url, data=None, extra=None, retries=4):
    headers = dict(HEADERS)
    if extra:
        headers.update(extra)
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 502, 503, 504):
                time.sleep(1.5 * (i + 1))
                continue
            raise
        except Exception as e:
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def search_bgm(keyword):
    return http_json(
        "https://api.bgm.tv/v0/search/subjects",
        {"keyword": keyword, "filter": {"type": [2]}, "limit": 10},
    ).get("data") or []


def bgm_subject(sid):
    return http_json(f"https://api.bgm.tv/v0/subjects/{sid}")


def score_hit(work, hit):
    title = work.get("title") or ""
    orig = work.get("orig") or ""
    year = str(work.get("year") or "")
    name = hit.get("name") or ""
    name_cn = hit.get("name_cn") or ""
    date = str(hit.get("date") or "")
    score = 0
    if year and date.startswith(year):
        score += 12
    elif year and year in date:
        score += 6
    if name_cn and (name_cn == title or name_cn == orig):
        score += 10
    if name and orig and name == orig:
        score += 10
    if title and title in (name_cn + name):
        score += 5
    if orig and orig not in ("劇場版", "") and orig in (name + name_cn):
        score += 5
    if work.get("format") == "movie" and ("劇場版" in name or "剧场" in name_cn or hit.get("platform") == "剧场版"):
        score += 2
    return score


def pick_bgm(work, queries):
    best = None
    best_score = -1
    seen = set()
    for q in queries:
        if not q:
            continue
        time.sleep(0.7)
        for hit in search_bgm(q):
            sid = hit.get("id")
            if not sid or sid in seen:
                continue
            seen.add(sid)
            s = score_hit(work, hit)
            if s > best_score:
                best_score = s
                best = hit
        if best_score >= 16:
            break
    if not best:
        return None, -1
    images = best.get("images") or {}
    url = images.get("large") or images.get("common") or images.get("medium")
    if not url:
        time.sleep(0.5)
        sub = bgm_subject(best["id"])
        images = sub.get("images") or {}
        url = images.get("large") or images.get("common")
        best = sub
    return {"source": "bangumi", "id": best.get("id"), "name": best.get("name"), "name_cn": best.get("name_cn"), "date": best.get("date"), "url": url, "score": best_score}, best_score


def search_anilist(keyword):
    query = """
    query ($s: String) {
      Media(search: $s, type: ANIME) {
        id
        seasonYear
        title { romaji english native }
        coverImage { extraLarge large }
      }
    }
    """
    data = http_json(
        "https://graphql.anilist.co",
        {"query": query, "variables": {"s": keyword}},
        extra={"Accept": "application/json"},
    )
    return ((data or {}).get("data") or {}).get("Media")


def pick_anilist(work, queries):
    for q in queries:
        if not q:
            continue
        time.sleep(0.4)
        media = search_anilist(q)
        if not media:
            continue
        cover = (media.get("coverImage") or {})
        url = cover.get("extraLarge") or cover.get("large")
        if not url:
            continue
        return {
            "source": "anilist",
            "id": media.get("id"),
            "name": (media.get("title") or {}).get("native") or (media.get("title") or {}).get("romaji"),
            "url": url,
            "score": 8,
        }
    return None


def queries_for(work):
    q = []
    alias = ALIASES.get(work["id"])
    if alias:
        q.append(alias)
    orig = (work.get("orig") or "").strip()
    if orig and orig not in ("劇場版", "劇場版"):
        q.append(orig)
    title = (work.get("title") or "").strip()
    if title:
        q.append(title)
    out = []
    for item in q:
        if item not in out:
            out.append(item)
    return out


def download(url, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://bgm.tv/"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        blob = resp.read()
        ctype = (resp.headers.get_content_type() or "").lower()
    ext = ".jpg"
    if "png" in ctype:
        ext = ".png"
    elif "webp" in ctype:
        ext = ".webp"
    elif url.lower().endswith(".png"):
        ext = ".png"
    elif url.lower().endswith(".webp"):
        ext = ".webp"
    path = dest.with_suffix(ext)
    path.write_bytes(blob)
    if path.stat().st_size < 800:
        path.unlink(missing_ok=True)
        raise RuntimeError("tiny file")
    return path


def patch_data_js(covers: dict[str, str]):
    text = DATA_JS.read_text(encoding="utf-8")
    text = re.sub(r'\s*cover:"covers/[^"]+"\s*,', "", text)

    def add_cover(m):
        wid = m.group(1)
        rel = covers.get(wid)
        if not rel:
            return m.group(0)
        return f'{{ id:"{wid}", cover:"{rel}",'

    new = re.sub(r'\{ id:"([a-z0-9]+)",', add_cover, text)
    DATA_JS.write_text(new, encoding="utf-8")


def main():
    COVER_DIR.mkdir(exist_ok=True)
    works = load_works()
    manifest = []
    covers = {}
    misses = []
    for i, work in enumerate(works, 1):
        wid = work["id"]
        qs = queries_for(work)
        print(f"[{i}/{len(works)}] {wid} <- {qs[0]}", flush=True)
        picked, score = pick_bgm(work, qs)
        if not picked or not picked.get("url") or score < 8:
            alt = pick_anilist(work, qs)
            if alt:
                picked = alt
                score = alt.get("score", 0)
        if not picked or not picked.get("url"):
            misses.append(wid)
            manifest.append({"id": wid, "ok": False})
            continue
        try:
            path = download(picked["url"], COVER_DIR / wid)
        except Exception as e:
            misses.append(wid)
            manifest.append({"id": wid, "ok": False, "error": str(e), "picked": picked})
            continue
        rel = f"covers/{path.name}"
        covers[wid] = rel
        manifest.append({"id": wid, "ok": True, "file": rel, **picked})
        print(f"    -> {rel} ({picked.get('source')} #{picked.get('id')} score={score})", flush=True)

    (COVER_DIR / "manifest.json").write_text(
        json.dumps({"covers": covers, "misses": misses, "items": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    patch_data_js(covers)
    print(f"done covers={len(covers)} misses={misses}")


if __name__ == "__main__":
    main()
