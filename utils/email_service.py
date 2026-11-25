import logging
import os

import httpx
from dotenv import load_dotenv

load_dotenv(override=False)

logger = logging.getLogger(__name__)

GMAIL_WEBHOOK_URL = os.getenv("GMAIL_WEBHOOK_URL", "")
GMAIL_WEBHOOK_SECRET = os.getenv("GMAIL_WEBHOOK_SECRET", "")


def send_otp_email(recipient_email: str, otp_code: str, purpose: str = "Verification") -> bool:
    """Sends a 6-digit OTP code via Google Apps Script HTTPS webhook (port 443)."""
    if not GMAIL_WEBHOOK_URL:
        logger.warning("GMAIL_WEBHOOK_URL not configured; running in simulation mode.")
        print(f"--- [MOCK EMAIL TO {recipient_email}] --- Code: {otp_code}", flush=True)
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

    payload = {
        "secret": GMAIL_WEBHOOK_SECRET,
        "to": recipient_email,
        "subject": f"Your Habit Tracker {purpose} Code",
        "text": email_body,
    }

    try:
        with httpx.Client(follow_redirects=True, timeout=15.0) as client:
            response = client.post(GMAIL_WEBHOOK_URL, json=payload)
            response.raise_for_status()
            result = response.json()
            if result.get("ok") is True:
                print(f"OTP email sent to {recipient_email} via Gmail webhook", flush=True)
                return True
            print(f"Gmail Webhook rejected request: {result}", flush=True)
            return False
    except Exception as exc:
        print(f"Gmail Webhook Error [{type(exc).__name__}]: {repr(exc)}", flush=True)
        return False