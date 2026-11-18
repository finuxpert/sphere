"""Real Chromium offline demo QA: exercise the worker without any network target.

Runs as the dedicated sphere-remote-browser identity. Worker route guards abort
all HTTP and WebSocket requests; the page is a packaged data: HTML document.
"""
import os
import secrets
import unittest

os.environ.update({
    "JUMPHOST_ENV": "dev",
    "SPHERE_BROWSER_ALLOWED_ORIGIN": "https://10.14.33.64:8124",
    "SPHERE_BROWSER_WORKER_TOKEN": secrets.token_hex(32),
    "SPHERE_BROWSER_DEV_INSECURE_TLS": "0",
})

from fastapi.testclient import TestClient
import worker


class OfflineDemoTests(unittest.TestCase):
    def test_real_chromium_demo_screenshot_input_and_teardown(self):
        headers = {
            "X-Sphere-Worker-Token": os.environ["SPHERE_BROWSER_WORKER_TOKEN"],
            "X-Sphere-Owner": "a" * 64,
        }
        with TestClient(worker.app) as client:
            self.assertEqual(client.post("/v1/demo").status_code, 401)

            r = client.post("/v1/demo", headers=headers)
            self.assertEqual(r.status_code, 201, r.text)
            body = r.json()
            self.assertTrue(body["demo"])
            self.assertEqual((body["width"], body["height"]), (1280, 720))
            sid = body["session_id"]
            print("OFFLINE_CHROMIUM_START=PASS")

            busy = client.post("/v1/demo", headers=headers)
            self.assertEqual(busy.status_code, 429, busy.text)

            other = dict(headers, **{"X-Sphere-Owner": "b" * 64})
            self.assertEqual(
                client.get(f"/v1/sessions/{sid}/frame", headers=other).status_code,
                404,
            )
            print("OWNER_ISOLATION=PASS")

            img = client.get(f"/v1/sessions/{sid}/frame", headers=headers)
            self.assertEqual(img.status_code, 200, img.text[:100])
            self.assertTrue(img.content.startswith(b"\xff\xd8"))
            print("OFFLINE_SCREENSHOT=PASS")

            click = client.post(f"/v1/sessions/{sid}/actions", headers=headers,
                                json={"type": "click", "x": 320, "y": 200})
            self.assertEqual(click.status_code, 200, click.text)
            typing = client.post(f"/v1/sessions/{sid}/actions", headers=headers,
                                 json={"type": "text", "text": "hello demo"})
            self.assertEqual(typing.status_code, 200, typing.text)
            print("MOUSE_KEYBOARD=PASS")

            end = client.delete(f"/v1/sessions/{sid}", headers=headers)
            self.assertEqual(end.status_code, 204)
            self.assertEqual(
                client.get(f"/v1/sessions/{sid}/frame", headers=headers).status_code,
                404,
            )
            print("SESSION_STOP=PASS")
            print("NETWORK_TARGET=NOT_ACCESSED")


if __name__ == "__main__":
    unittest.main()
