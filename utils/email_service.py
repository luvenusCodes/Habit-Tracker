import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv(override=False)

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

_PLACEHOLDERS = {"", "your_email@gmail.com", "your_email_app_password"}


def send_otp_email(recipient_email: str, otp_code: str, purpose: str = "Verification") -> bool:
    """Sends a 6-digit OTP code to the user's email via SMTP."""
    if SMTP_USER in _PLACEHOLDERS or SMTP_PASSWORD in _PLACEHOLDERS:
        logger.warning("SMTP credentials not configured; running in simulation mode.")
        print(f"--- [MOCK EMAIL TO {recipient_email}] ---")
        print(f"Your {purpose} code is: {otp_code}")
        print("------------------------------------------")
        return True

    msg = EmailMessage()
    msg["Subject"] = f"Your Habit Tracker {purpose} Code"
    msg["From"] = SMTP_USER
    msg["To"] = recipient_email

    email_body = (
        f"Hello,\n\n"
        f"You requested a {purpose.lower()} code for your Habit Tracker account.\n"
        f"Your secure code is: {otp_code}\n\n"
        f"DO NOT SHARE THIS CODE WITH ANYONE.\n\n"
        f"This code expires in 10 minutes. If you did not request this, please ignore this email.\n\n"
        f"Best regards,\n"
        f"Habit Tracker Team"
    )
    msg.set_content(email_body)

    context = ssl.create_default_context()

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=15) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.starttls(context=context)
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        return True
    except Exception as exc:
        print(f"SMTP Error [{type(exc).__name__}]: {repr(exc)}")
        return False