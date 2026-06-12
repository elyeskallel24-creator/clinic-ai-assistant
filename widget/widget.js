(function () {
  // ---------- Prevent double-loading ----------
  if (window.__clinicWidgetLoaded) return;
  window.__clinicWidgetLoaded = true;
  const SERVER_URL = "https://silver-lamp-7v6rg4q9w749cxrrx-3000.app.github.dev";
  const history = []; // conversation memory: {role, text}

  // ---------- Styles ----------
  const style = document.createElement("style");
  style.textContent = `
    .cw-bubble {
      position: fixed; bottom: 24px; right: 24px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #0e7490; color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; cursor: pointer; border: none;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      z-index: 99999; transition: transform 0.2s;
    }
    .cw-bubble:hover { transform: scale(1.08); }

    .cw-panel {
      position: fixed; bottom: 100px; right: 24px;
      width: 350px; height: 480px; max-width: calc(100vw - 32px);
      background: white; border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.25);
      display: none; flex-direction: column;
      overflow: hidden; z-index: 99999;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .cw-panel.open { display: flex; }

    .cw-header {
      background: #0e7490; color: white;
      padding: 14px 18px; font-weight: 600; font-size: 15px;
    }
    .cw-header small { display: block; font-weight: 400; opacity: 0.85; font-size: 12px; }

    .cw-messages {
      flex: 1; padding: 14px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 8px;
      background: #f8fafc;
    }
    .cw-msg {
      max-width: 80%; padding: 9px 13px; border-radius: 14px;
      font-size: 14px; line-height: 1.45;
    }
    .cw-msg.bot { background: #e2e8f0; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; }
    .cw-msg.user { background: #0e7490; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }

    .cw-input-row {
      display: flex; border-top: 1px solid #e2e8f0; background: white;
    }
    .cw-input-row input {
      flex: 1; border: none; padding: 13px 14px; font-size: 14px; outline: none;
    }
    .cw-input-row button {
      border: none; background: none; color: #0e7490;
      font-size: 20px; padding: 0 16px; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // ---------- Elements ----------
  const bubble = document.createElement("button");
  bubble.className = "cw-bubble";
  bubble.innerHTML = "💬";

  const panel = document.createElement("div");
  panel.className = "cw-panel";
  panel.innerHTML = `
    <div class="cw-header">
      Assistant BrightSmile
      <small>Répond en quelques secondes</small>
    </div>
    <div class="cw-messages" id="cw-messages"></div>
    <div class="cw-input-row">
      <input id="cw-input" type="text" placeholder="Écrivez votre message..." />
      <button id="cw-send">➤</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  // ---------- Behavior ----------
  const messages = panel.querySelector("#cw-messages");
  const input = panel.querySelector("#cw-input");
  const sendBtn = panel.querySelector("#cw-send");

  function addMessage(text, who) {
    const div = document.createElement("div");
    div.className = "cw-msg " + who;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  bubble.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open") && messages.children.length === 0) {
      addMessage("Bonjour ! 👋 Je suis l'assistant de la clinique BrightSmile. Comment puis-je vous aider ?", "bot");
    }
    input.focus();
  });

  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, "user");
    history.push({ role: "user", text: text });
    input.value = "";

    // typing indicator
    const typing = document.createElement("div");
    typing.className = "cw-msg bot";
    typing.textContent = "...";
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(SERVER_URL + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      typing.remove();

      const reply = data.reply || "Désolé, une erreur s'est produite. Réessayez.";
      addMessage(reply, "bot");
      history.push({ role: "assistant", text: reply });
    } catch (err) {
      typing.remove();
      addMessage("Connexion impossible. Veuillez réessayer.", "bot");
    }
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSend(); });
})();