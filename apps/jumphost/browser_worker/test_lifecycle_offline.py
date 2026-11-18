"""Offline real-Chromium lifecycle test.

Uses an in-memory HTML data: page. The original target IP is NEVER contacted.
Run only as the dedicated non-root sphere-remote-browser account with
Playwright sandbox enabled. No listening socket, Nginx, or service is modified.
"""
from __future__ import annotations

import os
import secrets
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import quote
import unittest

# A deliberately synthetic test configuration inside this process only.
os.environ.update({
    "JUMPHOST_ENV": "dev",
    "SPHERE_BROWSER_ALLOWED_ORIGIN": "https://10.14.33.64:8124",
    "SPHERE_BROWSER_WORKER_TOKEN": secrets.token_hex(32),
    "SPHERE_BROWSER_DEV_INSECURE_TLS": "0",
})

from fastapi.testclient import TestClient
from playwright.async_api import Page
import worker

DUMMY_ORIGIN = "https://10.14.33.64:8124"
FIXTURE_HTML = (
    '<!doctype html><html><head><title>SPHERE Offline QA</title></head>'
    '<body><input id="qa" style="position:absolute;left:40px;top:40px;'
    'width:400px;height:42px" autofocus></body></html>'
)
ORIGINAL_GOTO = Page.goto


async def no_network_navigation(self: Page, url: str, **kwargs):
    # No network URL can reach Playwright from a worker navigation call in QA.
    if url != DUMMY_ORIGIN + "/":
        raise AssertionError("Unexpected network navigation: " + url)
    await ORIGINAL_GOTO(
        self,
        "data:text/html;charset=utf-8," + quote(FIXTURE_HTML),
        **kwargs,
    )
    return SimpleNamespace(status=200)


class ChromiumLifecycleOfflineTests(unittest.TestCase):
    def test_session_lifecycle_and_owner_binding(self):
        primary = {
            "X-Sphere-Worker-Token": os.environ["SPHERE_BROWSER_WORKER_TOKEN"],
            "X-Sphere-Owner": "a" * 64,
        }
        other = {**primary, "X-Sphere-Owner": "b" * 64}

        with patch.object(Page, "goto", no_network_navigation):
            with TestClient(worker.app) as client:
                self.assertEqual(client.get("/health").status_code, 200)

                start = client.post(
                    "/v1/sessions",
                    json={"url": DUMMY_ORIGIN + "/"},
                    headers=primary,
                )
                self.assertEqual(start.status_code, 201, start.text)
                sid = start.json()["session_id"]
                self.assertEqual(start.json()["width"], 1280)
                self.assertEqual(start.json()["height"], 720)
                print("CHROMIUM_SESSION=PASS")

                second = client.post(
                    "/v1/sessions",
                    json={"url": DUMMY_ORIGIN + "/"},
                    headers=primary,
                )
                self.assertEqual(second.status_code, 429, second.text)
                print("ONE_SESSION_LIMIT=PASS")

                frame = client.get(f"/v1/sessions/{sid}/frame", headers=primary)
                self.assertEqual(frame.status_code, 200, frame.text[:250])
                self.assertEqual(frame.headers.get("content-type"), "image/jpeg")
                self.assertTrue(frame.content.startswith(b"\xff\xd8"))
                print("SCREENSHOT_JPEG=PASS")

                denied = client.get(f"/v1/sessions/{sid}/frame", headers=other)
                self.assertEqual(denied.status_code, 404, denied.text)
                print("OWNER_ISOLATION=PASS")

                click = client.post(
                    f"/v1/sessions/{sid}/actions",
                    json={"type": "click", "x": 60, "y": 60},
                    headers=primary,
                )
                self.assertEqual(click.status_code, 200, click.text)

                typing = client.post(
                    f"/v1/sessions/{sid}/actions",
                    json={"type": "text", "text": "SPHERE_QA"},
                    headers=primary,
                )
                self.assertEqual(typing.status_code, 200, typing.text)
                print("MOUSE_KEYBOARD=PASS")

                closed = client.delete(f"/v1/sessions/{sid}", headers=primary)
                self.assertEqual(closed.status_code, 204, closed.text)
                self.assertEqual(
                    client.get(f"/v1/sessions/{sid}/frame", headers=primary).status_code,
                    404,
                )
                print("SESSION_CLEANUP=PASS")
                print("NETWORK_TARGET=NOT_ACCESSED")


if __name__ == "__main__":
    unittest.main()
