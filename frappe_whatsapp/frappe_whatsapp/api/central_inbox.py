import re
import frappe
from frappe import _


def check_access(permission="read"):
    if frappe.session.user == "Guest":
        frappe.throw(_("Login required"), frappe.PermissionError)

    if "System Manager" not in frappe.get_roles():
        frappe.throw(_("Only System Manager can access WhatsApp Inbox"), frappe.PermissionError)

    if not frappe.has_permission("WhatsApp Message", ptype=permission):
        frappe.throw(_("You do not have permission to access WhatsApp Messages"), frappe.PermissionError)


def get_contact_number(message):
    return (message.get("from") if message.get("type") == "Incoming"
            else message.get("to")) or ""


def normalize_phone(phone):
    phone = str(phone or "").strip()

    if phone.startswith("+"):
        phone = phone[1:]

    phone = re.sub(r"[\s().-]", "", phone)

    if not phone.isdigit() or not 8 <= len(phone) <= 15:
        frappe.throw(_("Enter a valid international phone number (8-15 digits)"))

    return phone


@frappe.whitelist()
def get_conversations(search=None):
    check_access("read")

    rows = frappe.get_list(
        "WhatsApp Message",
        fields=[
            "name", "type", "to", "from", "message", "status",
            "creation", "profile_name", "content_type"
        ],
        order_by="creation desc",
        page_length=1000
    )

    conversations = {}
    for row in rows:
        phone = get_contact_number(row)
        if not phone:
            continue

        if phone not in conversations:
            conversations[phone] = {
                "phone": phone,
                "profile_name": row.get("profile_name") or phone,
                "last_message": row.get("message") or "",
                "last_message_type": row.get("content_type") or "text",
                "last_message_time": row.get("creation"),
                "last_status": row.get("status"),
                "last_direction": row.get("type"),
            }

    result = list(conversations.values())

    if search:
        term = str(search).strip().lower()
        result = [
            c for c in result
            if term in c["phone"].lower()
            or term in c["profile_name"].lower()
            or term in c["last_message"].lower()
        ]

    return result


@frappe.whitelist()
def get_messages(phone, limit=200):
    check_access("read")

    phone = normalize_phone(phone)

    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 200

    rows = frappe.get_list(
        "WhatsApp Message",
        fields=[
            "name", "type", "to", "from", "message", "status",
            "creation", "profile_name", "content_type",
            "message_id", "reply_to_message_id",
            "template", "message_type", "attach"
        ],
        or_filters=[
            {"from": phone},
            {"to": phone}
        ],
        order_by="creation desc",
        page_length=limit
    )

    rows.reverse()

    # Read-only template display metadata for Central Inbox.
    template_cache = {}

    for row in rows:
        if row.get("message_type") != "Template" or not row.get("template"):
            continue

        template_name = row.get("template")

        if template_name not in template_cache:
            if frappe.db.exists("WhatsApp Templates", template_name):
                template = frappe.get_cached_doc(
                    "WhatsApp Templates", template_name
                )

                template_cache[template_name] = {
                    "name": template.template_name or template.actual_name,
                    "body": template.template or "",
                    "footer": template.footer or "",
                    "header_type": template.header_type or "",
                    "sample": template.sample or "",
                    "buttons": [
                        {
                            "label": button.button_label or "",
                            "type": button.button_type or "",
                        }
                        for button in (template.buttons or [])
                    ],
                }
            else:
                template_cache[template_name] = None

        row["template_display"] = template_cache[template_name]

    return rows


@frappe.whitelist()
def send_message(phone, message):
    check_access("create")

    phone = normalize_phone(phone)
    message = str(message or "").strip()

    if not message:
        frappe.throw(_("Message cannot be empty"))

    if len(message) > 4096:
        frappe.throw(_("Message cannot exceed 4096 characters"))

    doc = frappe.get_doc({
        "doctype": "WhatsApp Message",
        "type": "Outgoing",
        "to": phone,
        "message": message,
        "message_type": "Manual",
        "content_type": "text"
    })

    # Existing before_insert() sends through the existing Meta engine.
    # Do not call send_outgoing() separately.
    doc.insert()

    return {
        "name": doc.name,
        "status": doc.status,
        "message_id": doc.message_id
    }
