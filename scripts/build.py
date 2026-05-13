#!/usr/bin/env python3
"""
Scraper for The Great Escape festival line-up.
Fetches artist list via admin-ajax.php, then scrapes individual artist pages.
Writes src/data.json.

Usage:
    python3 scripts/build.py [--force-rescrape]
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data.json")
LINEUP_URL = "https://greatescapefestival.com/wordpress/wp-admin/admin-ajax.php"
ARTIST_BASE = "https://greatescapefestival.com/artists/"
MAX_WORKERS = 5
WORKER_DELAY = 0.3  # seconds between requests per worker

DAY_TO_DATE = {
    "wednesday": "2026-05-13",
    "thursday": "2026-05-14",
    "friday": "2026-05-15",
    "saturday": "2026-05-16",
    # Also handle title-case from the HTML
    "Wednesday": "2026-05-13",
    "Thursday": "2026-05-14",
    "Friday": "2026-05-15",
    "Saturday": "2026-05-16",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; better-tge-scraper/1.0)",
    "Accept": "text/html,application/xhtml+xml,application/json,*/*",
}


def fetch(url, post_data=None, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            if post_data:
                data = urllib.parse.urlencode(post_data).encode()
                req = urllib.request.Request(url, data=data, headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, OSError) as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return None


def cache_path(slug):
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{slug}.html")


def get_artist_html(slug, force=False):
    cp = cache_path(slug)
    if not force and os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            return f.read()
    url = f"{ARTIST_BASE}{slug}/"
    html = fetch(url)
    with open(cp, "w", encoding="utf-8") as f:
        f.write(html)
    return html


def parse_time(time_str, day_str):
    """Parse "12:15pm Thursday" → ISO 8601 string with BST offset."""
    time_str = time_str.strip()
    day_str = day_str.strip()

    # Match "12:15pm" or "12pm"
    m = re.match(r"(\d{1,2})(?::(\d{2}))?(am|pm)", time_str, re.IGNORECASE)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    meridiem = m.group(3).lower()

    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0

    date_iso = DAY_TO_DATE.get(day_str)
    if not date_iso:
        return None

    return f"{date_iso}T{hour:02d}:{minute:02d}:00+01:00"


def parse_gigs(html):
    """Extract gig entries from artist HTML page."""
    gigs = []

    # Find the timetable section — ends at <div class="clear">
    tt_match = re.search(
        r'<div class="simple-timetable[^"]*">(.*?)<div class="clear">',
        html, re.DOTALL
    )
    if not tt_match:
        return gigs

    tt = tt_match.group(1)

    # Split into individual event blocks
    blocks = re.split(r'(?=<div class="event grid">)', tt)

    for block in blocks:
        if '<div class="event grid">' not in block:
            continue

        # Venue slug + name from link
        venue_m = re.search(
            r'href="[^"]*festival-venue/([^/"]+)/"[^>]*title="([^"]*)"',
            block
        )
        if not venue_m:
            # Try alternate: data-venue or plain text
            venue_m = re.search(r'class="venue[^"]*"[^>]*>([^<]+)<', block)
            if not venue_m:
                continue
            venue_slug = re.sub(r"[^a-z0-9]+", "-", venue_m.group(1).strip().lower()).strip("-")
            venue_name = venue_m.group(1).strip()
        else:
            venue_slug = venue_m.group(1)
            venue_name = venue_m.group(2)

        # Time cells: two .one-half cells — first is time, second is day
        cells = re.findall(
            r'<div class="grid__item float--left one-half">\s*(.*?)\s*</div>',
            block, re.DOTALL
        )
        if len(cells) < 2:
            continue

        time_raw = re.sub(r"<[^>]+>", "", cells[0]).strip()
        day_raw = re.sub(r"<[^>]+>", "", cells[1]).strip()

        start_iso = parse_time(time_raw, day_raw)
        if not start_iso:
            continue

        day_key = day_raw.lower()
        if day_key not in DAY_TO_DATE:
            continue

        gigs.append({
            "venue": venue_slug,
            "venue_name": venue_name,
            "start": start_iso,
            "day": day_key,
        })

    return gigs


def parse_bio(html):
    # Single-quoted class attribute — real site quirk
    m = re.search(r"<div class='cont isgigs'>(.*?)</div>", html, re.DOTALL)
    if not m:
        # Fallback: look for first substantial paragraph near artist name
        m = re.search(r'<div class="entry-content">(.*?)</div>', html, re.DOTALL)
    if not m:
        return ""
    raw = m.group(1)
    # Strip all tags, collapse whitespace
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_socials(html):
    socials = []
    # Find the social links section
    social_m = re.search(
        r'<ul[^>]*class="[^"]*social[^"]*"[^>]*>(.*?)</ul>',
        html, re.DOTALL
    )
    if not social_m:
        return socials

    links = re.findall(
        r'<a\b[^>]*\bhref="([^"]+)"[^>]*\bclass="([^"\s]+)"',
        social_m.group(1)
    )
    # Also try reversed attribute order
    links += re.findall(
        r'<a\b[^>]*\bclass="([^"\s]+)"[^>]*\bhref="([^"]+)"',
        social_m.group(1)
    )

    seen = set()
    for pair in links:
        # pair could be (href, class) or (class, href) depending on regex
        if pair[0].startswith("http"):
            url, cls = pair[0], pair[1]
        else:
            cls, url = pair[0], pair[1]
        if url in seen:
            continue
        seen.add(url)

        cls_lower = cls.lower()
        if "spotify" in cls_lower:
            service = "spotify"
        elif "facebook" in cls_lower:
            service = "facebook"
        elif "twitter" in cls_lower or "x-" in cls_lower:
            service = "twitter"
        elif "instagram" in cls_lower:
            service = "instagram"
        elif "youtube" in cls_lower:
            service = "youtube"
        elif "soundcloud" in cls_lower:
            service = "soundcloud"
        elif "tiktok" in cls_lower:
            service = "tiktok"
        elif "bandcamp" in cls_lower:
            service = "bandcamp"
        elif "web" in cls_lower or "website" in cls_lower or "link" in cls_lower:
            service = "web"
        else:
            service = cls_lower.split()[-1]

        socials.append({"service": service, "url": url})

    return socials


def parse_embeds(html):
    embeds = []
    found = re.findall(
        r'<iframe\b[^>]*\bdata-type="([^"]+)"[^>]*\btitle="([^"]*)"[^>]*\bsrc="([^"]+)"',
        html
    )
    # Also try without data-type
    if not found:
        found_plain = re.findall(
            r'<iframe\b[^>]*\bsrc="(https://(?:www\.youtube\.com|open\.spotify\.com|w\.soundcloud\.com)[^"]+)"',
            html
        )
        for src in found_plain:
            if "youtube" in src:
                embeds.append({"type": "youtube", "title": "", "src": src})
            elif "spotify" in src:
                embeds.append({"type": "spotify", "title": "", "src": src})
            elif "soundcloud" in src:
                embeds.append({"type": "soundcloud", "title": "", "src": src})
        return embeds

    for dtype, title, src in found:
        embeds.append({"type": dtype, "title": title, "src": src})
    return embeds


def parse_image(html):
    # Open Graph image first
    m = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]+)"', html)
    if m:
        return m.group(1)
    # Featured image
    m = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"', html)
    if m:
        return m.group(1)
    return ""


def slugify(s):
    s = s.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    return s.strip("-")


def decode_multivalue(val):
    """Double-underscore separated, URL-encoded values → list of strings."""
    if not val:
        return []
    parts = val.split("__")
    return [urllib.parse.unquote(p).lower() for p in parts if p]


def process_artist(raw, force_rescrape):
    slug = raw.get("slug", "")
    if not slug:
        slug = slugify(raw.get("name", "unknown"))

    time.sleep(WORKER_DELAY)
    try:
        html = get_artist_html(slug, force=force_rescrape)
    except Exception as e:
        print(f"  WARN: failed to fetch {slug}: {e}", file=sys.stderr)
        html = ""

    gigs = parse_gigs(html) if html else []
    bio = parse_bio(html) if html else ""
    socials = parse_socials(html) if html else []
    embeds = parse_embeds(html) if html else []
    image = parse_image(html) if html else raw.get("image", "")

    # Derive days/venues/locations from gigs (authoritative) or raw fallback
    days = sorted(set(g["day"] for g in gigs)) or decode_multivalue(raw.get("days", ""))
    locations = sorted(set(g["venue"] for g in gigs)) or decode_multivalue(raw.get("locations", ""))

    genres_raw = raw.get("genre", "") or raw.get("genres", "")
    genres = decode_multivalue(genres_raw)

    country_raw = raw.get("country", "") or ""
    countries = decode_multivalue(country_raw) if "__" in country_raw else ([country_raw.lower()] if country_raw else [])

    return {
        "slug": slug,
        "name": raw.get("name", slug),
        "country": raw.get("country_display", country_raw),
        "country_ids": countries,
        "days": days,
        "genres": genres,
        "locations": locations,
        "image": image or raw.get("image", ""),
        "link": f"{ARTIST_BASE}{slug}/",
        "slink": raw.get("slink", ""),
        "bio": bio,
        "socials": socials,
        "embeds": embeds,
        "gigs": gigs,
    }


def fetch_lineup(force_rescrape):
    lineup_cache = os.path.join(CACHE_DIR, "_lineup.json")
    if not force_rescrape and os.path.exists(lineup_cache):
        with open(lineup_cache, encoding="utf-8") as f:
            return json.load(f)

    print("Fetching line-up from admin-ajax.php …")
    post_data = {"action": "fetch_line_up"}
    raw = fetch(LINEUP_URL, post_data=post_data)
    data = json.loads(raw)

    # The endpoint returns either a bare list or {"artists": [...]}
    if isinstance(data, list):
        artists = data
    elif isinstance(data, dict):
        artists = data.get("artists") or data.get("data") or next(iter(data.values()))
    else:
        raise ValueError(f"Unexpected line-up payload type: {type(data)}")

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(lineup_cache, "w", encoding="utf-8") as f:
        json.dump(artists, f)
    return artists


def build_filter_options(artists):
    countries = {}
    days_seen = {}
    genres_seen = {}
    locations_seen = {}

    for a in artists:
        for cid in a["country_ids"]:
            if cid and cid not in countries:
                countries[cid] = a["country"] or cid.title()
        for d in a["days"]:
            if d:
                days_seen[d] = d.title()
        for g in a["genres"]:
            if g:
                genres_seen[g] = g.title()
        for loc in a["locations"]:
            if loc:
                locations_seen[loc] = loc.replace("-", " ").title()

    day_order = ["wednesday", "thursday", "friday", "saturday"]

    return {
        "country_options": sorted(
            [{"val": k, "txt": v} for k, v in countries.items()],
            key=lambda x: x["txt"]
        ),
        "day_options": [
            {"val": d, "txt": d.title()}
            for d in day_order if d in days_seen
        ],
        "genre_options": sorted(
            [{"val": k, "txt": v} for k, v in genres_seen.items()],
            key=lambda x: x["txt"]
        ),
        "location_options": sorted(
            [{"val": k, "txt": v} for k, v in locations_seen.items()],
            key=lambda x: x["txt"]
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-rescrape", action="store_true")
    args = parser.parse_args()

    raw_artists = fetch_lineup(args.force_rescrape)
    print(f"Found {len(raw_artists)} artists in line-up")

    processed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(process_artist, a, args.force_rescrape): a
            for a in raw_artists
        }
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            try:
                result = fut.result()
                processed.append(result)
                if done % 20 == 0:
                    print(f"  {done}/{len(raw_artists)} done …")
            except Exception as e:
                print(f"  ERROR processing artist: {e}", file=sys.stderr)

    filters = build_filter_options(processed)

    output = {
        "_built_at": datetime.now(timezone.utc).isoformat(),
        "filters": filters,
        "artists": processed,
    }

    out_path = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"Written {len(processed)} artists → {out_path}")


if __name__ == "__main__":
    main()
