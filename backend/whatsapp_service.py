import os
import json
import uuid
import urllib.request
import urllib.parse
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()

from database import get_db_connection

def get_whatsapp_config():
    mode = os.environ.get("WHATSAPP_MODE", "mock").lower()
    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    api_version = os.environ.get("WHATSAPP_API_VERSION", "v18.0")
    controller_number = os.environ.get("CONTROLLER_WHATSAPP_NUMBER", "")
    template_name = os.environ.get("WHATSAPP_TEMPLATE_NAME", "igl_unknown_person_alert")
    template_language = os.environ.get("WHATSAPP_TEMPLATE_LANG", "en_US")
    
    is_configured = bool(access_token and phone_number_id)
    
    return {
        "mode": mode,
        "is_configured": is_configured,
        "phone_number_id": phone_number_id,
        "api_version": api_version,
        "controller_number": controller_number,
        "template_name": template_name,
        "template_language": template_language
    }

def get_whatsapp_status_info():
    config = get_whatsapp_config()
    
    # Retrieve last log from DB
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notification_logs WHERE channel = 'WHATSAPP' ORDER BY timestamp DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    
    last_log = dict(row) if row else None
    
    if config["mode"] == "live":
        status_code = "CONNECTED" if config["is_configured"] else "ERROR"
    else:
        status_code = "MOCK MODE" if not config["is_configured"] else "MOCK MODE"
    
    return {
        "status": status_code,
        "mode": config["mode"].upper(),
        "is_configured": config["is_configured"],
        "controller_number": config["controller_number"],
        "last_notification": last_log.get("timestamp") if last_log else None,
        "last_status": last_log.get("status") if last_log else "NONE",
        "last_recipient": last_log.get("recipient") if last_log else None
    }

def format_unknown_person_message(event_data):
    zone = event_data.get("zone", event_data.get("zone_name", "Main Plant Area"))
    camera = event_data.get("camera", event_data.get("camera_name", "Camera-01"))
    time_str = event_data.get("time", event_data.get("timestamp", datetime.now().strftime("%I:%M %p")))
    
    expected = event_data.get("expectedCount", event_data.get("expected_count", 2))
    detected = event_data.get("detectedCount", event_data.get("observed_count", 5))
    additional = event_data.get("additionalCount", event_data.get("additional_count", max(0, detected - expected)))
    
    track_ids = event_data.get("involvedTrackIds", event_data.get("track_ids", []))
    if isinstance(track_ids, list):
        track_str = ", ".join(track_ids) if track_ids else "TRK-P103, TRK-P104, TRK-P105"
    else:
        track_str = str(track_ids)
        
    msg = (
        "[SAFETY ALERT] IGL SAFETY ALERT\n\n"
        "Unknown/Unaccounted Person Event Detected\n\n"
        f"Zone: {zone}\n"
        f"Camera: {camera}\n"
        f"Time: {time_str}\n\n"
        f"Expected Personnel: {expected}\n"
        f"Detected Personnel: {detected}\n"
        f"Additional Persons: {additional}\n\n"
        "Verification:\n"
        "REVIEW REQUIRED\n\n"
        "Track IDs:\n"
        f"{track_str}\n\n"
        "Please review the camera evidence."
    )
    return msg

def build_whatsapp_template_payload(event_data, recipient, config):
    """
    Template configuration layer for official WhatsApp Business API compliance.
    Renders structured parameters into approved template schema.
    """
    zone = event_data.get("zone", event_data.get("zone_name", "Main Plant Area"))
    camera = event_data.get("camera", event_data.get("camera_name", "Camera-01"))
    time_str = event_data.get("time", event_data.get("timestamp", datetime.now().strftime("%I:%M %p")))
    expected = str(event_data.get("expectedCount", event_data.get("expected_count", 2)))
    detected = str(event_data.get("detectedCount", event_data.get("observed_count", 5)))
    additional = str(event_data.get("additionalCount", event_data.get("additional_count", 3)))
    
    track_ids = event_data.get("involvedTrackIds", event_data.get("track_ids", []))
    track_str = ", ".join(track_ids) if isinstance(track_ids, list) else str(track_ids)

    to_number = "".join(filter(str.isdigit, recipient))

    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_number,
        "type": "template",
        "template": {
            "name": config["template_name"],
            "language": {"code": config["template_language"]},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": zone},
                        {"type": "text", "text": camera},
                        {"type": "text", "text": time_str},
                        {"type": "text", "text": expected},
                        {"type": "text", "text": detected},
                        {"type": "text", "text": additional},
                        {"type": "text", "text": track_str}
                    ]
                }
            ]
        }
    }

def record_notification_log(event_id, channel, recipient, status, provider_msg_id, message_text, error_msg=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO notification_logs (event_id, channel, recipient, status, provider_message_id, message_text, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (event_id, channel, recipient, status, provider_msg_id, message_text, error_msg))
    conn.commit()
    conn.close()

def send_whatsapp_alert(event_data):
    config = get_whatsapp_config()
    recipient = event_data.get("recipient", config["controller_number"])
    event_id = event_data.get("eventId", event_data.get("id", f"EVT-WA-{uuid.uuid4().hex[:6].upper()}"))
    message_text = format_unknown_person_message(event_data)
    
    mode = config["mode"]
    use_template = os.environ.get("WHATSAPP_USE_TEMPLATE", "false").lower() == "true"
    
    if mode == "mock" or not config["is_configured"]:
        # Simulated MOCK Mode
        mock_msg_id = f"MOCK-WA-{uuid.uuid4().hex[:8].upper()}"
        print("==================================================")
        print("[MOCK WHATSAPP NOTIFICATION SENT]")
        print(f"Recipient: {recipient}")
        print("--------------------------------------------------")
        print(message_text.encode('ascii', 'replace').decode('ascii'))
        print("==================================================")
        
        record_notification_log(event_id, "WHATSAPP", recipient, "SIMULATED", mock_msg_id, message_text, "")
        
        return {
            "success": True,
            "status": "SIMULATED",
            "mode": "MOCK",
            "message": "WhatsApp Notification Simulated (Mock Mode Active)",
            "recipient": recipient,
            "provider_message_id": mock_msg_id,
            "alert_text": message_text
        }
    
    # LIVE WhatsApp Cloud API Mode
    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN")
    phone_number_id = config["phone_number_id"]
    version = config["api_version"]
    
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    if use_template:
        payload = build_whatsapp_template_payload(event_data, recipient, config)
    else:
        to_number = "".join(filter(str.isdigit, recipient))
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_number,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message_text
            }
        }
    
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            
            wamid = res_json.get("messages", [{}])[0].get("id", f"WA-{uuid.uuid4().hex[:6].upper()}")
            record_notification_log(event_id, "WHATSAPP", recipient, "SUCCESS", wamid, message_text, "")
            
            return {
                "success": True,
                "status": "SUCCESS",
                "mode": "LIVE",
                "message": "WhatsApp notification sent via WhatsApp Business Platform API",
                "recipient": recipient,
                "provider_message_id": wamid
            }
    except Exception as err:
        err_msg = str(err)
        record_notification_log(event_id, "WHATSAPP", recipient, "FAILED", "", message_text, err_msg)
        print(f"[ERROR] WhatsApp API Call Error: {err_msg}")
        return {
            "success": False,
            "status": "FAILED",
            "mode": "LIVE",
            "message": f"WhatsApp API failed: {err_msg}",
            "error_details": err_msg
        }

def send_whatsapp_test(recipient_override=None):
    config = get_whatsapp_config()
    recipient = recipient_override or config["controller_number"]
    
    test_event = {
        "eventId": f"TEST-WA-{uuid.uuid4().hex[:6].upper()}",
        "zone_name": "Main Plant Area",
        "camera_name": "Gate Camera 01",
        "timestamp": datetime.now().strftime("%I:%M %p"),
        "expected_count": 2,
        "observed_count": 5,
        "additional_count": 3,
        "track_ids": ["TRK-P103", "TRK-P104", "TRK-P105"],
        "recipient": recipient
    }
    
    return send_whatsapp_alert(test_event)

