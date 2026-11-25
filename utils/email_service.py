import json
import logging
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv(override=False)

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "Habit Tracker <onboarding@resend.dev>")


def send_otp_email(recipient_email: str, otp_code: str, purpose: str = "Verification") -> bool:
    """Sends a 6-digit OTP code via Resend's HTTPS API (port 443)."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured; running in simulation mode.")
        print(f"--- [MOCK EMAIL TO {recipient_email}] ---")
        print(f"Your {purpose} code is: {otp_code}")
        print("------------------------------------------")
        return True

    email_body = (
        f"Hello,\n\n"
        f"You requested a {purpose.lower()} code for your Habit Tracker account.\n"
        f"Your secure code is: {otp_code}\n\n"
        f"DO NOT SHARE THIS CODE WITH ANYONE.\n\n"
        f"This code expires in 10 minutes. If you did not request this, please ignore this email.\n\n"
        f"Best regards,\n"
        f"Habit Tracker Team"
    )

    payload = json.dumps({
        "from": FROM_EMAIL,
        "to": [recipient_email],
        "subject": f"Your Habit Tracker {purpose} Code",
        "text": email_body,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "habit-tracker-api/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.getcode()
            logger.info("OTP email sent to %s (HTTP %s)", recipient_email, status)
            return 200 <= status < 300
    except urllib.error.HTTPError as exc:
        error_detail = exc.read().decode("utf-8", errors="replace")
        print(f"Resend HTTP Error [{exc.code}]: {error_detail}")
        return False
    except Exception as exc:
        print(f"Resend Error [{type(exc).__name__}]: {repr(exc)}")
        return False