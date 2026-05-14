import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from build import parse_time, parse_gigs


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


if __name__ == "__main__":
    unittest.main()
