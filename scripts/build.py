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
import math
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
VENUE_BASE = "https://greatescapefestival.com/festival-venue/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_DELAY = 1.1  # Nominatim rate limit: max 1 req/sec
MAX_WORKERS = 5
WORKER_DELAY = 0.3  # seconds between requests per worker
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
TRACKS_CACHE = os.path.join(CACHE_DIR, "_tracks.json")
TRACKS_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4-6")

DAY_TO_DATE = {
    "wednesday": "2026-05-13",
    "thursday": "2026-05-14",
    "friday": "2026-05-15",
    "saturday": "2026-05-16",
    "sunday": "2026-05-17",
    # Also handle title-case from the HTML
    "Wednesday": "2026-05-13",
    "Thursday": "2026-05-14",
    "Friday": "2026-05-15",
    "Saturday": "2026-05-16",
    "Sunday": "2026-05-17",
}

# A "Thursday Night HH:MM" gig is calendar-Friday but belongs to Thursday's
# evening programming. NEXT_DAY maps the night-label day to its calendar day.
NEXT_DAY = {
    "wednesday": "thursday",
    "thursday": "friday",
    "friday": "saturday",
    "saturday": "sunday",
}

# Gigs before this hour belong to the previous day's festival programming.
NIGHT_CUTOFF_HOUR = 5

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


def get_artist_html(url, slug, force=False):
    cp = cache_path(slug)
    if not force and os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            return f.read()
    html = fetch(url)
    with open(cp, "w", encoding="utf-8") as f:
        f.write(html)
    return html


def slug_from_link(link):
    """Extract the artist slug from a /artists/<slug>/ URL."""
    if not link:
        return ""
    m = re.search(r"/artists/([^/]+)", link)
    return m.group(1) if m else ""


def parse_time(time_str, calendar_day):
    """Parse a time string + calendar day name → ISO 8601 with BST offset.

    Accepts both 12h with meridiem ("12:15pm") and bare 24h ("00:15").
    """
    time_str = time_str.strip()
    calendar_day = calendar_day.strip()

    m = re.match(r"(\d{1,2})(?::(\d{2}))?(am|pm)?", time_str, re.IGNORECASE)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    meridiem = (m.group(3) or "").lower()

    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    # No meridiem → already 24h, use as-is

    date_iso = DAY_TO_DATE.get(calendar_day)
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

        # Time cells: two .one-half divs — first is venue link, second is "12:15pm Thursday"
        cells = re.findall(
            r'<div class="grid__item float--left one-half">\s*(.*?)\s*</div>',
            block, re.DOTALL
        )
        if len(cells) < 2:
            continue

        time_day_raw = re.sub(r"<[^>]+>", "", cells[1]).strip()

        # Both formats use the night-of label (festival day) as the day name.
        # Format A: "8:00pm Thursday" or "12:30am Friday"
        td_m = re.match(r'(\d{1,2}(?::\d{2})?(?:am|pm))\s+(\w+)', time_day_raw, re.IGNORECASE)
        if td_m:
            time_str = td_m.group(1)
            night_label = td_m.group(2).lower()
        else:
            # Format B: "Thursday Night 00:15"
            td_m = re.match(r'(\w+)\s+[Nn]ight\s+(\d{1,2}:\d{2})', time_day_raw)
            if not td_m:
                continue
            time_str = td_m.group(2)
            night_label = td_m.group(1).lower()

        if night_label not in DAY_TO_DATE:
            continue

        # Provisional parse against the night-of date to learn the hour.
        provisional_iso = parse_time(time_str, night_label)
        if not provisional_iso:
            continue

        # Post-midnight gigs belong to the next calendar day but the same festival night.
        if int(provisional_iso[11:13]) < NIGHT_CUTOFF_HOUR:
            calendar_day = NEXT_DAY.get(night_label)
            if not calendar_day or calendar_day not in DAY_TO_DATE:
                continue
            start_iso = parse_time(time_str, calendar_day)
            if not start_iso:
                continue
        else:
            calendar_day = night_label
            start_iso = provisional_iso

        gigs.append({
            "venue": venue_slug,
            "venue_name": venue_name,
            "start": start_iso,
            "day": calendar_day,
            "festival_day": night_label,
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
    link = raw.get("link", "")
    slug = slug_from_link(link) or raw.get("slug", "") or slugify(raw.get("name", "unknown"))
    url = link or f"{ARTIST_BASE}{urllib.parse.quote(slug, safe='-')}/"

    time.sleep(WORKER_DELAY)
    try:
        html = get_artist_html(url, slug, force=force_rescrape)
    except Exception as e:
        print(f"  WARN: failed to fetch {slug}: {e}", file=sys.stderr)
        html = ""

    gigs = parse_gigs(html) if html else []
    bio = parse_bio(html) if html else ""
    socials = parse_socials(html) if html else []
    embeds = parse_embeds(html) if html else []
    image = parse_image(html) if html else raw.get("image", "")

    # Derive days from each gig's festival_day (so "Thursday Night" gigs count
    # as Thursday even though their calendar date is Friday).
    days = sorted(set(g["festival_day"] for g in gigs)) or decode_multivalue(raw.get("days", ""))
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
        "link": url,
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


def parse_venue_address(html):
    """Extract a street address from a venue page."""
    # Schema.org address
    m = re.search(r'"streetAddress"\s*:\s*"([^"]+)"', html)
    if m:
        return m.group(1).strip()
    # <address> tag
    m = re.search(r'<address[^>]*>(.*?)</address>', html, re.DOTALL)
    if m:
        return re.sub(r'<[^>]+>', ' ', m.group(1)).strip()
    # Common WordPress venue field patterns
    for pat in [
        r'class="[^"]*address[^"]*"[^>]*>(.*?)</[^>]+>',
        r'class="[^"]*location[^"]*"[^>]*>(.*?)</[^>]+>',
        r'<p[^>]*>\s*([\w\s]+,\s*Brighton[^<]*)</p>',
    ]:
        m = re.search(pat, html, re.DOTALL | re.IGNORECASE)
        if m:
            text = re.sub(r'<[^>]+>', ' ', m.group(1)).strip()
            if text:
                return text
    return ""


def geocode_venue(name, address, city="Brighton"):
    """Geocode a venue using Nominatim. Returns (lat, lng) or None."""
    query = f"{address or name}, {city}, UK"
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "gb",
    })
    url = f"{NOMINATIM_URL}?{params}"
    headers = {
        "User-Agent": "better-tge-scraper/1.0 (github.com/andrewbridge/better-tge)",
        "Accept": "application/json",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  WARN: geocode failed for {name}: {e}", file=sys.stderr)
    return None


def haversine_m(lat1, lng1, lat2, lng2):
    """Walking-distance approximation (straight-line) in metres."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return round(2 * R * math.asin(math.sqrt(a)))


def scrape_venues(artists, force_rescrape):
    """
    Collect unique venues from gig data, scrape their pages for addresses,
    geocode via Nominatim, and return a dict of venue metadata + distance matrix.
    """
    venue_cache = os.path.join(CACHE_DIR, "_venues.json")
    if not force_rescrape and os.path.exists(venue_cache):
        with open(venue_cache, encoding="utf-8") as f:
            return json.load(f)

    # Collect unique venues from all gigs
    seen = {}
    for a in artists:
        for g in a.get("gigs", []):
            slug = g["venue"]
            if slug and slug not in seen:
                seen[slug] = g.get("venue_name") or slug.replace("-", " ").title()

    venues = {}
    print(f"Geocoding {len(seen)} venues …")
    for slug, name in sorted(seen.items()):
        cp = os.path.join(CACHE_DIR, f"_venue_{slug}.html")
        if not force_rescrape and os.path.exists(cp):
            with open(cp, encoding="utf-8") as f:
                html = f.read()
        else:
            try:
                url = f"{VENUE_BASE}{urllib.parse.quote(slug, safe='-')}/"
                html = fetch(url)
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(cp, "w", encoding="utf-8") as f:
                    f.write(html)
            except Exception as e:
                print(f"  WARN: venue page failed for {slug}: {e}", file=sys.stderr)
                html = ""

        address = parse_venue_address(html) if html else ""

        time.sleep(NOMINATIM_DELAY)
        coords = geocode_venue(name, address)

        venues[slug] = {"name": name, "address": address}
        if coords:
            venues[slug]["lat"] = coords[0]
            venues[slug]["lng"] = coords[1]
        print(f"  {name}: {coords}")

    # Build pairwise distance matrix for venues that have coordinates
    geocoded = {s: v for s, v in venues.items() if "lat" in v}
    distances = {}
    for s1, v1 in geocoded.items():
        distances[s1] = {}
        for s2, v2 in geocoded.items():
            if s1 != s2:
                distances[s1][s2] = haversine_m(v1["lat"], v1["lng"], v2["lat"], v2["lng"])

    result = {"venues": venues, "distances": distances}
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(venue_cache, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    return result


def compact_artist_for_tracks(a):
    """Compact artist summary for the tracks generation prompt."""
    genres = f" [{'/'.join(a['genres'])}]" if a.get("genres") else ""
    bio = (a.get("bio") or "")[:200].replace("\n", " ").strip()
    return f"{a['name']}{genres}: {bio}"


def generate_tracks(artists, force=False):
    """Call OpenRouter to generate thematic artist groupings. Returns list of track objects."""
    if not force and os.path.exists(TRACKS_CACHE):
        print("Tracks: loading from cache")
        with open(TRACKS_CACHE, encoding="utf-8") as f:
            return json.load(f)

    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("WARN: OPENROUTER_API_KEY not set — skipping tracks generation", file=sys.stderr)
        return []

    print(f"Tracks: generating via {TRACKS_MODEL} …")
    artist_list = "\n".join(compact_artist_for_tracks(a) for a in artists)

    prompt = f"""Create 6–8 thematic "tracks" grouping the festival artists below by vibe, sound, or mood.

Respond with valid JSON only — an array of objects with no markdown fences:
[{{"id":"kebab-id","name":"Track Name","description":"One sentence vibe.","slugs":["slug1","slug2"]}}]

Rules:
- 4–10 artists per track
- Tracks must be meaningfully distinct; use evocative names, not bare genre labels
- An artist may appear in more than one track
- Every artist should appear in at least one track

ARTISTS:
{artist_list}"""

    body = json.dumps({
        "model": TRACKS_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OPENROUTER_BASE}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/andrewbridge/better-tge",
            "X-Title": "better-tge",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        raw = data["choices"][0]["message"]["content"].strip()
        # Strip accidental markdown fences
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        tracks = json.loads(raw)
        if not isinstance(tracks, list):
            raise ValueError("Expected a JSON array")
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(TRACKS_CACHE, "w", encoding="utf-8") as f:
            json.dump(tracks, f, ensure_ascii=False, indent=2)
        print(f"Tracks: generated {len(tracks)} tracks")
        return tracks
    except Exception as e:
        print(f"WARN: tracks generation failed: {e}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-rescrape", action="store_true")
    parser.add_argument("--skip-tracks", action="store_true", help="Skip AI track generation")
    parser.add_argument("--force-tracks", action="store_true", help="Bypass tracks cache and regenerate")
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
    venue_data = scrape_venues(processed, args.force_rescrape)
    tracks = [] if args.skip_tracks else generate_tracks(processed, force=args.force_tracks)

    output = {
        "_built_at": datetime.now(timezone.utc).isoformat(),
        "filters": filters,
        "venues": venue_data["venues"],
        "distances": venue_data["distances"],
        "artists": processed,
        "tracks": tracks,
    }

    out_path = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"Written {len(processed)} artists + {len(venue_data['venues'])} venues → {out_path}")


if __name__ == "__main__":
    main()
