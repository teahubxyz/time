"""office.py: Time's check-ins on the office bus are best effort and never fail a job."""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import office  # noqa: E402


class Answer:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class OfficeTest(unittest.TestCase):
    env = {"TIME_TOKEN": "t", "GITHUB_SERVER_URL": "https://teahub.xyz", "GITHUB_REPOSITORY": "teahubxyz/time",
           "GITHUB_RUN_ID": "42"}

    def test_checkin_posts_as_time_with_the_run_link(self):
        sent = []
        with mock.patch.dict(os.environ, self.env, clear=True), \
                mock.patch("urllib.request.urlopen", lambda req, timeout: sent.append(req) or Answer()):
            self.assertTrue(office.checkin("heartbeat", "heartbeat: running"))
        (req,) = sent
        body = json.loads(req.data)
        self.assertEqual((req.full_url, req.get_header("Authorization")), (office.DEFAULT_URL, "token t"))
        self.assertEqual((body["action"], body["name"], body["role"]), ("checkin", "time-heartbeat", "Time"))
        self.assertEqual(body["status"], "heartbeat: running (https://teahub.xyz/teahubxyz/time/actions/runs/42)")

    def test_off_without_a_token_or_when_turned_off(self):
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("must not post")):
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertFalse(office.checkin("astra", "x"))
            with mock.patch.dict(os.environ, {**self.env, "TIME_BUS": "off"}, clear=True):
                self.assertFalse(office.checkin("astra", "x"))

    def test_a_broken_bus_never_fails_the_job(self):
        with mock.patch.dict(os.environ, self.env, clear=True), \
                mock.patch("urllib.request.urlopen", side_effect=OSError("down")):
            self.assertFalse(office.checkin("astra", "x"))
            self.assertEqual(office.around("astra", lambda: 0), 0)

    def test_around_reports_start_end_and_failure(self):
        said = []
        with mock.patch.object(office, "checkin", lambda name, status, role="Time": said.append(status)):
            self.assertEqual(office.around("heartbeat", lambda: 0), 0)
            self.assertEqual(office.around("doctor", lambda: 2), 2)
            with self.assertRaises(ValueError):
                office.around("astra", lambda: (_ for _ in ()).throw(ValueError("x")))
        self.assertEqual(said, ["heartbeat: running", "heartbeat: done", "doctor: running",
                                "doctor: finished with code 2", "astra: running", "astra: failed (ValueError)"])


if __name__ == "__main__":
    unittest.main()
