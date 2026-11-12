frappe.pages["whatsapp-inbox"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("WhatsApp Inbox"),
        single_column: true
    });

    const root = $(`
        <div class="sproflow-wa-inbox">
            <div class="wa-sidebar">
                <div class="wa-search">
                    <input type="text" class="form-control wa-search-input"
                        placeholder="${__("Search contacts or messages")}">
                </div>
                <div class="wa-conversations"></div>
            </div>
            <div class="wa-chat">
                <div class="wa-empty">
                    <h4>${__("WhatsApp Inbox")}</h4>
                    <p>${__("Select a conversation to view messages")}</p>
                </div>
                <div class="wa-chat-header hidden"></div>
                <div class="wa-messages hidden"></div>
                <div class="wa-compose hidden">
                    <textarea class="form-control wa-message-input"
                        rows="2" placeholder="${__("Type a message...")}"></textarea>
                    <button class="btn btn-primary wa-send">${__("Send")}</button>
                </div>
            </div>
        </div>
    `).appendTo(page.main);

    $("<style>").text(`
        .sproflow-wa-inbox {
            display:flex; height:calc(100vh - 145px); min-height:480px;
            border:1px solid var(--border-color); border-radius:8px;
            overflow:hidden; background:var(--card-bg);
        }
        .wa-sidebar { width:320px; min-width:260px; border-right:1px solid var(--border-color); display:flex; flex-direction:column; }
        .wa-search { padding:12px; border-bottom:1px solid var(--border-color); }
        .wa-conversations { overflow-y:auto; flex:1; }
        .wa-contact { padding:13px; border-bottom:1px solid var(--border-color); cursor:pointer; }
        .wa-contact:hover, .wa-contact.active { background:var(--subtle-fg); }
        .wa-contact-name { font-weight:600; }
        .wa-contact-preview { font-size:12px; color:var(--text-muted); margin-top:5px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
        .wa-chat { flex:1; min-width:0; display:flex; flex-direction:column; }
        .wa-empty { margin:auto; text-align:center; color:var(--text-muted); }
        .wa-chat-header { padding:15px; font-weight:600; border-bottom:1px solid var(--border-color); }
        .wa-messages { flex:1; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:10px; }
        .wa-bubble { max-width:75%; padding:10px 13px; border-radius:10px; white-space:pre-wrap; overflow-wrap:anywhere; }
        .wa-incoming { align-self:flex-start; background:var(--subtle-fg); }
        .wa-outgoing { align-self:flex-end; background:var(--blue-100); color:var(--text-color); }
        .wa-time { font-size:10px; color:var(--text-muted); text-align:right; margin-top:5px; }
        .wa-template-bubble { width:min(460px, 90%); }
        .wa-template-image { display:block; width:100%; max-height:230px; object-fit:cover; border-radius:7px; margin-bottom:10px; }
        .wa-template-name { font-weight:700; margin-bottom:8px; }
        .wa-template-body { white-space:pre-wrap; overflow-wrap:anywhere; }
        .wa-template-footer { color:var(--text-muted); font-size:12px; border-top:1px solid var(--border-color); margin-top:10px; padding-top:8px; }
        .wa-template-button { text-align:center; color:var(--text-color); border-top:1px solid var(--border-color); margin-top:8px; padding-top:8px; font-weight:600; }
        .wa-compose { display:flex; gap:10px; padding:12px; border-top:1px solid var(--border-color); align-items:flex-end; }
        .wa-compose textarea { flex:1; resize:vertical; }
        @media(max-width:700px) {
            .wa-sidebar { width:38%; min-width:120px; }
            .wa-bubble { max-width:90%; }
        }
    `).appendTo(root);

    const conversations = root.find(".wa-conversations");
    const messages = root.find(".wa-messages");
    const header = root.find(".wa-chat-header");
    const empty = root.find(".wa-empty");
    const compose = root.find(".wa-compose");
    const input = root.find(".wa-message-input");
    let selectedPhone = null;
    let searchTimer = null;

    function call(method, args, callback, errorCallback) {
        frappe.call({
            method: "frappe_whatsapp.frappe_whatsapp.api.central_inbox." + method,
            args: args || {},
            callback: function (r) {
                if (callback) callback(r.message);
            },
            error: function (r) {
                if (errorCallback) errorCallback(r);
            }
        });
    }

    function loadConversations(search) {
        call("get_conversations", {search: search || ""}, function (data) {
            conversations.empty();

            if (!data || !data.length) {
                conversations.text(__("No conversations found"));
                return;
            }

            data.forEach(function (item) {
                const row = $(`
                    <div class="wa-contact">
                        <div class="wa-contact-name"></div>
                        <div class="wa-contact-preview"></div>
                    </div>
                `);

                row.find(".wa-contact-name").text(item.profile_name || item.phone);
                row.find(".wa-contact-preview").text(item.last_message || item.last_message_type || "");
                row.attr("data-phone", item.phone);

                if (selectedPhone === item.phone) row.addClass("active");

                row.on("click", function () {
                    selectedPhone = item.phone;
                    conversations.find(".wa-contact").removeClass("active");
                    row.addClass("active");
                    loadMessages();
                });

                conversations.append(row);
            });
        });
    }

    function loadMessages() {
        if (!selectedPhone) return;

        empty.addClass("hidden");
        header.removeClass("hidden").text(selectedPhone);
        messages.removeClass("hidden").empty();
        compose.removeClass("hidden");

        call("get_messages", {phone: selectedPhone}, function (data) {
            messages.empty();

            (data || []).forEach(function (item) {
                const outgoing = item.type === "Outgoing";
                const bubble = $('<div class="wa-bubble"></div>')
                    .addClass(outgoing ? "wa-outgoing" : "wa-incoming");

                const template = item.template_display;

                if (item.message_type === "Template" && template) {
                    bubble.addClass("wa-template-bubble");

                    if (template.header_type === "IMAGE" && template.sample) {
                        const image = $("<img>")
                            .addClass("wa-template-image")
                            .attr("src", template.sample)
                            .attr("alt", __("Template image preview"));
                        bubble.append(image);
                    }

                    const templateName = $("<div></div>")
                        .addClass("wa-template-name")
                        .text(template.name || __("WhatsApp Template"));
                    bubble.append(templateName);

                    const body = $("<div></div>")
                        .addClass("wa-template-body")
                        .text(template.body || item.message || __("Template body unavailable"));
                    bubble.append(body);

                    if (template.footer) {
                        bubble.append(
                            $("<div></div>")
                                .addClass("wa-template-footer")
                                .text(template.footer)
                        );
                    }

                    (template.buttons || []).forEach(function (button) {
                        if (button.label) {
                            bubble.append(
                                $("<div></div>")
                                    .addClass("wa-template-button")
                                    .text(button.label)
                            );
                        }
                    });
                } else {
                    bubble.text(item.message || "[" + (item.content_type || "message") + "]");
                }

                const time = $('<div class="wa-time"></div>');
                time.text(frappe.datetime.str_to_user(item.creation) +
                    (outgoing && item.status ? " · " + item.status : ""));

                bubble.append(time);
                messages.append(bubble);
            });

            messages.scrollTop(messages[0].scrollHeight);
        });
    }

    function sendMessage() {
        const text = input.val().trim();
        if (!selectedPhone || !text) return;

        const sendButton = root.find(".wa-send");
        sendButton.prop("disabled", true);

        call("send_message", {
            phone: selectedPhone,
            message: text
        }, function (result) {
            sendButton.prop("disabled", false);

            if (result) {
                input.val("");
                frappe.show_alert({
                    message: __("Message submitted: ") + (result.status || "Sent"),
                    indicator: result.status === "Success" ? "green" : "orange"
                });
                loadMessages();
                loadConversations(root.find(".wa-search-input").val());
            }
        }, function () {
            sendButton.prop("disabled", false);
            frappe.show_alert({
                message: __("Message request failed. Check the message status before retrying."),
                indicator: "red"
            });
        });
    }

    root.find(".wa-send").on("click", sendMessage);

    input.on("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    root.find(".wa-search-input").on("input", function () {
        clearTimeout(searchTimer);
        const value = this.value;
        searchTimer = setTimeout(function () {
            loadConversations(value);
        }, 300);
    });

    page.set_primary_action(__("Refresh"), function () {
        loadConversations(root.find(".wa-search-input").val());
        if (selectedPhone) loadMessages();
    }, "refresh");

    loadConversations();
};
