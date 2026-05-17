import json
import sys
import os
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import build
from build import (
    decode_entities,
    parse_bio,
    parse_embeds,
    parse_gigs,
    parse_time,
    parse_venue_address,
    process_artist,
    slug_from_link,
)


def make_html(time_day_text, venue_slug="test-venue", venue_name="Test Venue"):
    """Wrap a time/day string in the minimal HTML that parse_gigs accepts."""
    return (
        '<div class="simple-timetable">'
        '<div class="event grid">'
        '<div class="grid__item float--left one-half">'
        f'<a href="https://greatescapefestival.com/festival-venue/{venue_slug}/" '
        f'title="{venue_name}">{venue_name}</a>'
        '</div>'
        '<div class="grid__item float--left one-half">'
        f'{time_day_text}'
        '</div>'
        '</div>'
        '<div class="clear"></div>'
        '</div>'
    )


class TestParseTime(unittest.TestCase):
    def test_pm_time(self):
        self.assertEqual(parse_time("8:00pm", "thursday"), "2026-05-14T20:00:00+01:00")

    def test_noon(self):
        self.assertEqual(parse_time("12:00pm", "friday"), "2026-05-15T12:00:00+01:00")

    def test_midnight_am(self):
        # Midnight: 12:00am → hour 0
        self.assertEqual(parse_time("12:00am", "friday"), "2026-05-15T00:00:00+01:00")

    def test_early_am(self):
        self.assertEqual(parse_time("12:30am", "friday"), "2026-05-15T00:30:00+01:00")

    def test_bare_24h(self):
        self.assertEqual(parse_time("00:15", "thursday"), "2026-05-14T00:15:00+01:00")

    def test_unknown_day_returns_none(self):
        self.assertIsNone(parse_time("8:00pm", "monday"))


class TestParseGigs(unittest.TestCase):
    def test_daytime_format_a(self):
        gigs = parse_gigs(make_html("8:00pm Thursday"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["start"], "2026-05-14T20:00:00+01:00")
        self.assertEqual(g["day"], "thursday")
        self.assertEqual(g["festival_day"], "thursday")

    def test_late_night_format_a_friday(self):
        # Bug-regression: "12:30am Friday" must land on Saturday calendar.
        gigs = parse_gigs(make_html("12:30am Friday"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["start"], "2026-05-16T00:30:00+01:00")
        self.assertEqual(g["day"], "saturday")
        self.assertEqual(g["festival_day"], "friday")

    def test_late_night_format_a_thursday(self):
        gigs = parse_gigs(make_html("12:30am Thursday"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["start"], "2026-05-15T00:30:00+01:00")
        self.assertEqual(g["day"], "friday")
        self.assertEqual(g["festival_day"], "thursday")

    def test_format_b_thursday_night(self):
        gigs = parse_gigs(make_html("Thursday Night 00:15"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["start"], "2026-05-15T00:15:00+01:00")
        self.assertEqual(g["day"], "friday")
        self.assertEqual(g["festival_day"], "thursday")

    def test_saturday_late_night_produces_sunday(self):
        gigs = parse_gigs(make_html("2:00am Saturday"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["start"], "2026-05-17T02:00:00+01:00")
        self.assertEqual(g["day"], "sunday")
        self.assertEqual(g["festival_day"], "saturday")

    def test_cutoff_boundary_stays_same_day(self):
        # 5:00am is at the cutoff — should NOT be bumped to the next day.
        gigs = parse_gigs(make_html("5:00am Friday"))
        self.assertEqual(len(gigs), 1)
        g = gigs[0]
        self.assertEqual(g["day"], "friday")
        self.assertEqual(g["festival_day"], "friday")

    def test_missing_time_cell_skipped(self):
        html = (
            '<div class="simple-timetable">'
            '<div class="event grid">'
            '<div class="grid__item float--left one-half">'
            '<a href="https://greatescapefestival.com/festival-venue/test/" title="Test">Test</a>'
            '</div>'
            '</div>'
            '<div class="clear"></div>'
            '</div>'
        )
        self.assertEqual(parse_gigs(html), [])

    def test_malformed_time_skipped(self):
        gigs = parse_gigs(make_html("TBA"))
        self.assertEqual(gigs, [])

    def test_venue_fields(self):
        gigs = parse_gigs(make_html("6:00pm Friday", "chalk", "Chalk"))
        self.assertEqual(gigs[0]["venue"], "chalk")
        self.assertEqual(gigs[0]["venue_name"], "Chalk")


class TestSlugFromLink(unittest.TestCase):
    def test_extracts_slug(self):
        self.assertEqual(
            slug_from_link("https://greatescapefestival.com/artists/1000-rabbits/"),
            "1000-rabbits",
        )

    def test_extracts_slug_without_trailing_slash(self):
        self.assertEqual(
            slug_from_link("https://greatescapefestival.com/artists/odd-name"),
            "odd-name",
        )

    def test_preserves_url_encoded_chars(self):
        # The website's real slug may contain url-encoded characters that
        # slugify(name) would not produce — we must keep them as-is.
        self.assertEqual(
            slug_from_link("https://greatescapefestival.com/artists/me%26you/"),
            "me%26you",
        )

    def test_empty_input(self):
        self.assertEqual(slug_from_link(""), "")

    def test_no_match(self):
        self.assertEqual(slug_from_link("https://example.com/foo/bar/"), "")


class TestProcessArtistUsesLineupLink(unittest.TestCase):
    """Regression: previously the URL was rebuilt from slugify(name), which
    failed for any artist whose canonical slug differed from the slugified
    name. We must fetch the link the lineup feed gives us."""

    def _run(self, raw):
        captured = {}

        def fake_get_artist_html(url, slug, force=False):
            captured["url"] = url
            captured["slug"] = slug
            return ""

        with mock.patch.object(build, "get_artist_html", side_effect=fake_get_artist_html), \
             mock.patch.object(build.time, "sleep"):
            result = process_artist(raw, force_rescrape=False)
        return captured, result

    def test_uses_raw_link_verbatim(self):
        raw = {
            "name": "Mé & You!",  # slugify would mangle this
            "link": "https://greatescapefestival.com/artists/me-and-you/",
        }
        captured, result = self._run(raw)
        self.assertEqual(captured["url"], "https://greatescapefestival.com/artists/me-and-you/")
        self.assertEqual(captured["slug"], "me-and-you")
        # The output link must echo the URL we actually fetched, not a rebuild.
        self.assertEqual(result["link"], "https://greatescapefestival.com/artists/me-and-you/")
        self.assertEqual(result["slug"], "me-and-you")

    def test_falls_back_when_link_missing(self):
        raw = {"name": "Test Artist"}
        captured, _ = self._run(raw)
        self.assertEqual(captured["slug"], "test-artist")
        self.assertEqual(
            captured["url"],
            "https://greatescapefestival.com/artists/test-artist/",
        )


class TestFetchLiveData(unittest.TestCase):
    def test_returns_parsed_json_on_success(self):
        payload = {"artists": [], "tracks": [{"id": "t1"}], "venues": {}, "distances": {}, "filters": {}}
        with mock.patch.object(build, "fetch", return_value='{"artists":[],"tracks":[{"id":"t1"}],"venues":{},"distances":{},"filters":{}}'):
            result = build.fetch_live_data()
        self.assertEqual(result["tracks"][0]["id"], "t1")

    def test_sanitises_entities_from_live_cache(self):
        # Regression: the previously-published data.json has mangled entities
        # (e.g. `R&#038;B`). The live-cache build path must decode them on
        # the way in so we don't republish them.
        raw_json = json.dumps({
            "artists": [{
                "name": "Foo &amp; Bar",
                "bio": "22 year-old R&#038;B cool girl",
                "country": "C&#244;te d&#039;Ivoire",
                "embeds": [{"title": "Foo &amp; Bar"}],
                "gigs": [{"venue_name": "Hope &amp; Ruin"}],
            }],
            "venues": {"hr": {"name": "Hope &amp; Ruin", "address": "11&#8211;12 Queens Rd"}},
            "tracks": [], "distances": {}, "filters": {},
        })
        with mock.patch.object(build, "fetch", return_value=raw_json):
            result = build.fetch_live_data()
        a = result["artists"][0]
        self.assertEqual(a["name"], "Foo & Bar")
        self.assertEqual(a["bio"], "22 year-old R&B cool girl")
        self.assertEqual(a["country"], "Côte d'Ivoire")
        self.assertEqual(a["embeds"][0]["title"], "Foo & Bar")
        self.assertEqual(a["gigs"][0]["venue_name"], "Hope & Ruin")
        self.assertEqual(result["venues"]["hr"]["name"], "Hope & Ruin")
        self.assertEqual(result["venues"]["hr"]["address"], "11–12 Queens Rd")

    def test_returns_none_on_network_error(self):
        with mock.patch.object(build, "fetch", side_effect=Exception("network error")):
            result = build.fetch_live_data()
        self.assertIsNone(result)

    def test_returns_none_on_invalid_json(self):
        with mock.patch.object(build, "fetch", return_value="not json"):
            result = build.fetch_live_data()
        self.assertIsNone(result)


class TestMainLiveCachePath(unittest.TestCase):
    """Verify that main() uses live data wholesale when --rescrape/--regen-tracks are absent."""

    _LIVE_STUB = {
        "_built_at": "2026-01-01T00:00:00+00:00",
        "artists": [{"slug": "a1", "name": "Artist One", "gigs": []}],
        "filters": {"day_options": []},
        "venues": {"v1": {"name": "Venue One"}},
        "distances": {"v1": {"v2": 100}},
        "tracks": [{"id": "track-1", "name": "Track One", "slugs": ["a1"]}],
    }

    def test_uses_live_data_with_no_flags(self):
        mock_scrape = mock.MagicMock()
        mock_regen = mock.MagicMock()

        with mock.patch.object(build, "fetch_live_data", return_value=self._LIVE_STUB), \
             mock.patch.object(build, "scrape_all_artists", mock_scrape), \
             mock.patch.object(build, "generate_tracks", mock_regen), \
             mock.patch("builtins.open", mock.mock_open()), \
             mock.patch("os.makedirs"), \
             mock.patch("sys.argv", ["build.py"]):
            build.main()

        mock_scrape.assert_not_called()
        mock_regen.assert_not_called()

    def test_falls_back_to_fresh_build_when_live_fails(self):
        raw_artists = [{"name": "Test", "link": "https://greatescapefestival.com/artists/test/"}]
        processed = [{"slug": "test", "name": "Test", "gigs": [], "days": [], "genres": [],
                      "locations": [], "country": "", "country_ids": [], "image": "",
                      "link": "", "slink": "", "bio": "", "socials": [], "embeds": []}]
        venue_data = {"venues": {}, "distances": {}}

        mock_lineup = mock.MagicMock(return_value=raw_artists)
        mock_scrape = mock.MagicMock(return_value=processed)
        mock_regen = mock.MagicMock(return_value=[])

        with mock.patch.object(build, "fetch_live_data", return_value=None), \
             mock.patch.object(build, "fetch_lineup", mock_lineup), \
             mock.patch.object(build, "scrape_all_artists", mock_scrape), \
             mock.patch.object(build, "build_filter_options", return_value={}), \
             mock.patch.object(build, "scrape_venues", return_value=venue_data), \
             mock.patch.object(build, "generate_tracks", mock_regen), \
             mock.patch("builtins.open", mock.mock_open()), \
             mock.patch("os.makedirs"), \
             mock.patch("sys.argv", ["build.py"]):
            build.main()

        mock_lineup.assert_called_once()
        mock_scrape.assert_called_once()
        mock_regen.assert_called_once()


class TestDecodeEntities(unittest.TestCase):
    def test_numeric_entity(self):
        # Real-world case from the festival site: `R&#038;B` should become `R&B`.
        self.assertEqual(decode_entities("R&#038;B cool girl"), "R&B cool girl")

    def test_named_entity(self):
        self.assertEqual(decode_entities("Hope &amp; Ruin"), "Hope & Ruin")

    def test_double_encoded(self):
        # WordPress sometimes emits `&amp;#038;` — encoded twice. One pass of
        # unescape would leave `&#038;` behind; we must collapse fully.
        self.assertEqual(decode_entities("R&amp;#038;B"), "R&B")

    def test_nbsp_normalised(self):
        # NBSP (U+00A0) becomes a regular space so collapse-whitespace works.
        self.assertEqual(decode_entities("foo bar"), "foo bar")

    def test_nbsp_named_entity(self):
        self.assertEqual(decode_entities("foo&nbsp;bar"), "foo bar")

    def test_empty_passthrough(self):
        self.assertEqual(decode_entities(""), "")
        self.assertIsNone(decode_entities(None))


class TestParseBioDecodesEntities(unittest.TestCase):
    def test_bio_entities_are_decoded(self):
        html_doc = (
            "<div class='cont isgigs'>"
            "<p>22 year-old &#8220;R&#038;B cool girl&#8221; "
            "Ebony Osailah is a rising Brighton based artist.</p>"
            "</div>"
        )
        bio = parse_bio(html_doc)
        self.assertNotIn("&#038;", bio)
        self.assertNotIn("&#8220;", bio)
        self.assertIn("R&B cool girl", bio)
        # Smart quotes survive as actual unicode characters.
        self.assertIn("“", bio)
        self.assertIn("”", bio)


class TestParseGigsDecodesVenueName(unittest.TestCase):
    def test_venue_name_entities_are_decoded(self):
        gigs = parse_gigs(make_html("6:00pm Friday", "hope-and-ruin", "Hope &amp; Ruin"))
        self.assertEqual(gigs[0]["venue_name"], "Hope & Ruin")


class TestParseEmbedsDecodesTitle(unittest.TestCase):
    def test_embed_title_entities_are_decoded(self):
        html_doc = (
            '<iframe data-type="youtube" '
            'title="Foo &amp; Bar" '
            'src="https://www.youtube.com/embed/xyz"></iframe>'
        )
        embeds = parse_embeds(html_doc)
        self.assertEqual(embeds, [
            {"type": "youtube", "title": "Foo & Bar", "src": "https://www.youtube.com/embed/xyz"},
        ])


class TestParseVenueAddressDecodesEntities(unittest.TestCase):
    def test_schema_address_entities_are_decoded(self):
        html_doc = '<script>{"streetAddress":"11&#8211;12 Queens Road"}</script>'
        # U+2013 is the en-dash that `&#8211;` encodes.
        self.assertEqual(parse_venue_address(html_doc), "11–12 Queens Road")


class TestProcessArtistDecodesPayloadFields(unittest.TestCase):
    def test_name_and_country_decoded(self):
        raw = {
            "name": "M&#233;tronome &amp; Co",
            "country_display": "C&#244;te d&#039;Ivoire",
            "link": "https://greatescapefestival.com/artists/metronome/",
        }

        def fake_get_artist_html(url, slug, force=False):
            return ""

        with mock.patch.object(build, "get_artist_html", side_effect=fake_get_artist_html), \
             mock.patch.object(build.time, "sleep"):
            result = process_artist(raw, force_rescrape=False)

        self.assertEqual(result["name"], "Métronome & Co")
        self.assertEqual(result["country"], "Côte d'Ivoire")


if __name__ == "__main__":
    unittest.main()
