const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const supabaseClient = window.supabase && window.PAUL_SUPABASE_URL
  ? window.supabase.createClient(window.PAUL_SUPABASE_URL, window.PAUL_SUPABASE_ANON_KEY)
  : null;
let deferredInstallPrompt = null;
const savedPosts = JSON.parse(localStorage.getItem("paulPosts") || "[]");
const oldDemoNames = ["Mpho Mokoena", "Thabo Nthunya", "Lineo Khasu"];
const realPosts = Array.isArray(savedPosts) ? savedPosts.filter(post => !oldDemoNames.includes(post.artist)) : [];
localStorage.setItem("paulPosts", JSON.stringify(realPosts));
let state = { role: null, user: JSON.parse(localStorage.getItem("paulUser") || "null"), posts: realPosts, chats: JSON.parse(localStorage.getItem("paulChats") || "[]"), view: "home", chatArtist: null };

function initials(name) { return name.split(" ").map(word => word[0]).slice(0, 2).join("").toUpperCase(); }
function save() { localStorage.setItem("paulUser", JSON.stringify(state.user)); localStorage.setItem("paulPosts", JSON.stringify(state.posts)); localStorage.setItem("paulChats", JSON.stringify(state.chats)); }
function toast(message) { const item = document.createElement("div"); item.className = "toast"; item.textContent = message; toastRegion.append(item); setTimeout(() => item.remove(), 3200); }
function tag(role) { return `<span class="tag">${role}</span>`; }
function announceNewArtist(artist) {
  const announcement = { name: artist.name, initials: artist.initials, district: artist.location || "", at: Date.now() };
  localStorage.setItem("paulArtistAnnouncement", JSON.stringify(announcement));
}
function notifyAboutNewArtist() {
  const announcement = JSON.parse(localStorage.getItem("paulArtistAnnouncement") || "null");
  if (!announcement || !state.user || state.user.role === "artist") return;
  const lastSeen = Number(state.user.lastArtistAnnouncement || 0);
  if (announcement.at > lastSeen) {
    state.user.lastArtistAnnouncement = announcement.at;
    state.user.notifications = (state.user.notifications || 0) + 1;
    save();
    toast(`${announcement.name} just joined as an artist. Check them out!`);
  }
}
function communityStats() {
  return {
    artworks: state.posts.length,
    artists: new Set(state.posts.map(post => post.artist)).size,
    likes: state.posts.reduce((total, post) => total + (Number(post.likes) || 0), 0)
  };
}
function shareLink(type, value) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const url = `${base}#${type}=${encodeURIComponent(value)}`;
  const text = type === "piece" ? `View this artwork on Paul Sketches: ${url}` : type === "account" ? `View this Paul Sketches account: ${url}` : `Join Paul Sketches: ${url}`;
  if (navigator.share) navigator.share({ title: "Paul Sketches", text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Browser-compatible share link copied."));
  else window.prompt("Copy this share link:", url);
}
function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
  } else toast("To install: open your browser menu and choose “Add to Home screen” or “Install app”.");
}
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; document.querySelectorAll("[data-install]").forEach(button => button.classList.remove("hidden")); });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; document.querySelectorAll("[data-install]").forEach(button => button.classList.add("hidden")); toast("Paul Sketches has been installed."); });
function openChat(artist) { state.chatArtist = artist; state.view = "chat"; renderApp(); }
async function loadSharedArtworks() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from("artworks").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("Supabase artwork feed unavailable:", error.message); return; }
  state.posts = data.map(post => ({ ...post, date: new Date(post.created_at).toLocaleDateString(), liked: false }));
  save();
  if (state.user) renderApp();
}
function subscribeToArtworks() {
  if (!supabaseClient) return;
  supabaseClient.channel("public-artworks").on("postgres_changes", { event: "INSERT", schema: "public", table: "artworks" }, payload => {
    if (!state.posts.some(post => post.id === payload.new.id)) {
      state.posts.unshift({ ...payload.new, date: "Just now", liked: false });
      save();
      if (state.user) { renderApp(); toast(`${payload.new.artist} uploaded new artwork to NTLONG.`); }
    }
  }).subscribe();
}

function renderAuth() {
  const stats = communityStats();
  app.innerHTML = `<main class="landing"><section class="landing-visual"><div class="brand"><span class="brand-mark">P</span><span>PAUL SKETCHES</span></div><div class="landing-copy"><div class="eyebrow">The Lesotho art network</div><h1 class="serif">Where local art finds its people.</h1><p>Discover, collect and connect with artists shaping the visual story of Lesotho.</p></div><div class="visual-note"><div><strong>${stats.artworks}</strong>artworks shared</div><div><strong>${stats.artists}</strong>artists represented</div><div><strong>${stats.likes}</strong>community likes</div></div><div class="landing-links"><button class="install-btn hidden" data-install>⇩ Install app</button><button class="landing-share" id="landing-share">↗ Share link</button><a href="https://paulapporg.com" target="_blank" rel="noreferrer">PAUL APPORG ↗</a></div></section><section class="auth-panel"><div class="eyebrow">Welcome to the community</div><h2 class="serif">How will you join us?</h2><p>Choose your space. You can explore as a viewer or share your work as a Lesotho artist.</p><div class="role-grid"><button class="role-card ${state.role === "artist" ? "active" : ""}" data-role="artist"><div class="role-icon">✦</div><strong>I'm an artist</strong><small>Share your work and build your audience.</small></button><button class="role-card ${state.role === "viewer" ? "active" : ""}" data-role="viewer"><div class="role-icon">◌</div><strong>I'm a viewer</strong><small>Discover, value and connect with artists.</small></button></div><div id="auth-form">${state.role ? authForm() : '<p class="hint">Select a role above to begin. Artists must be 15 years or older.</p>'}</div></section></main>`;
  document.querySelectorAll("[data-role]").forEach(button => button.onclick = () => { state.role = button.dataset.role; renderAuth(); });
  const form = document.querySelector("#login-form");
  if (form) form.onsubmit = handleAuth;
  document.querySelector("#landing-share").onclick = () => shareLink("app", "paul-sketches");
  document.querySelectorAll("[data-install]").forEach(button => button.onclick = installApp);
}

function authForm() {
  return `<form id="login-form"><div class="form-grid"><div class="field"><label for="name">Full name</label><input id="name" name="name" required placeholder="e.g. 'Mpho Mokoena'" /></div><div class="field"><label for="dob">Date of birth</label><input id="dob" name="dob" type="date" required /></div><div class="field"><label for="gender">Gender</label><select id="gender" name="gender" required><option value="">Select one</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select></div>${state.role === "artist" ? '<div class="field"><label for="location">District</label><select id="location" name="location" required><option value="">Select district</option><option>Maseru</option><option>Leribe</option><option>Berea</option><option>Mafeteng</option><option>Mohale’s Hoek</option><option>Qacha’s Nek</option><option>Quthing</option><option>Mokhotlong</option><option>Thaba-Tseka</option><option>Butha-Buthe</option></select></div><div class="field full"><label for="statement">Artist statement</label><textarea id="statement" name="statement" required placeholder="What is the story behind your practice?"></textarea></div><div class="field full"><label for="bio">Short bio</label><textarea id="bio" name="bio" required placeholder="Tell the community about yourself..."></textarea></div>' : ""}</div><p class="hint">${state.role === "artist" ? "Artist access is available to people aged 15 and above." : "Your viewer profile lets you follow artists, value pieces and send messages."}</p><button class="primary-btn" type="submit">Enter Paul Sketches →</button></form>`;
}

function handleAuth(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (state.role === "artist") { const age = new Date().getFullYear() - new Date(data.dob).getFullYear(); if (age < 15) { toast("Artists must be 15 years or older."); return; } }
  state.user = { ...data, role: state.role, initials: initials(data.name), notifications: 0 };
  save(); if (state.role === "artist") announceNewArtist(state.user); renderApp(); toast(`Welcome to Paul Sketches, ${data.name.split(" ")[0]}!`);
}

function renderApp() {
  const user = state.user;
  notifyAboutNewArtist();
  const heading = state.view === "home" ? "NTLONG." : state.view === "news" ? "The newsroom." : state.view === "chat" ? "Chatbox." : "Your profile.";
  const subheading = state.view === "home" ? "Discover every artwork shared by artists in the community." : state.view === "news" ? "Stories, opportunities and updates from the art world." : state.view === "chat" ? "Talk directly with artists and viewers." : "Your creative space in the network.";
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">P</span><span class="brand-name">PAUL<br>SKETCHES</span></div><nav class="nav"><button class="${state.view === "home" ? "active" : ""}" data-view="home" aria-label="Open NTLONG home"><span class="nav-icon">⌂</span><span class="nav-label">NTLONG</span></button><button class="${state.view === "news" ? "active" : ""}" data-view="news"><span class="nav-icon">◫</span><span class="nav-label">Newsroom</span></button><button class="${state.view === "chat" ? "active" : ""}" data-view="chat" aria-label="Open Chatbox"><span class="nav-icon chat-nav-icon" aria-hidden="true"></span><span class="nav-label">Chatbox</span></button><button class="${state.view === "profile" ? "active" : ""}" data-view="profile"><span class="nav-icon">◎</span><span class="nav-label">My profile</span></button></nav><div class="sidebar-bottom"><button class="install-btn hidden" data-install>⇩ Install app</button><small>Signed in as <strong>${user.name.split(" ")[0]}</strong></small><button class="logout" id="logout">Log out</button></div></aside><main class="main"><header class="topbar"><div><h1 class="serif">${heading}</h1><p>${subheading}</p></div><div class="top-actions"><button class="icon-btn" id="share-app" aria-label="Share Paul Sketches">↗</button><button class="icon-btn install-top hidden" data-install aria-label="Install app">⇩</button><button class="icon-btn" id="notifications" aria-label="Notifications">♧<span class="badge">${user.notifications || 0}</span></button><div class="avatar">${user.initials}</div></div></header>${state.view === "home" ? homeView() : state.view === "news" ? newsView() : state.view === "chat" ? chatView() : profileView()}</main></div>`;
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => { state.view = button.dataset.view; renderApp(); });
  document.querySelector("#logout").onclick = () => { state.user = null; state.role = null; save(); renderAuth(); };
  document.querySelector("#notifications").onclick = () => toast(user.notifications ? "You have new activity on your artwork." : "You're all caught up.");
  document.querySelector("#share-app").onclick = () => shareLink("app", "paul-sketches");
  document.querySelectorAll("[data-install]").forEach(button => button.onclick = installApp);
  bindView();
}

function homeView() {
  const feed = state.posts.length ? state.posts.map(postCard).join("") : `<div class="empty-state"><div class="empty-icon">✦</div><h3>No artwork has been uploaded yet</h3><p>The community feed will show real artwork here after an artist publishes their first piece.</p>${state.user.role === "artist" ? '<button id="open-upload" class="primary-btn">Upload the first artwork</button>' : ""}</div>`;
  return `<div class="dashboard-grid"><section><div class="section-head"><h2>NTLONG · Discover art</h2><span>${state.posts.length} uploaded ${state.posts.length === 1 ? "work" : "works"}</span></div><div class="feed">${feed}</div></section><aside class="side-col"><div class="side-card"><h3>About NTLONG</h3><p style="color:var(--muted);font-size:.8rem;line-height:1.5">A home for discovering every real artwork shared by artists on Paul Sketches.</p><button class="text-btn" data-view="news">Open newsroom →</button></div><div class="side-card"><h3>Quick converter</h3><p style="color:var(--muted);font-size:.78rem;margin-top:-8px">Guide rate: 1 GBP ≈ 23.50 LSL</p><div class="converter-row"><input id="amount" type="number" value="100" min="0"><select id="currency"><option value="lsl">Maloti → GBP</option><option value="gbp">GBP → Maloti</option></select></div><div id="conversion-result" class="conversion-result">≈ £4.26</div></div>${state.user.role === "artist" ? '<div class="side-card"><h3>Share your work</h3><p style="color:var(--muted);font-size:.8rem;line-height:1.5">Have something new for the community?</p><button id="open-upload" class="primary-btn upload-btn">＋ Upload artwork</button></div>' : ""}</aside></div>`;
}

function postCard(post) {
  return `<article class="post-card"><div class="post-head"><div class="person"><div class="avatar">${post.initials}</div><div><div class="person-name">${post.artist} ${tag(post.tag)}</div><span class="post-date">${post.date}</span></div></div><button class="more">•••</button></div><div class="artwork"><img src="${post.image}" alt="${post.title} by ${post.artist}" /><span class="art-label">Fan valuation · M ${post.price.toLocaleString()}</span></div><div class="post-body"><h3>${post.title}</h3><p>${post.description}</p><div class="post-actions"><button class="action-btn like-btn ${post.liked ? "liked" : ""}" data-id="${post.id}"><span>${post.liked ? "♥" : "♡"}</span>${post.likes} likes</button><button class="action-btn contact-btn" data-artist="${post.artist}"><span>✉</span> Contact artist</button><button class="action-btn value-btn" data-id="${post.id}"><span>◈</span> Value piece</button><button class="action-btn share-piece-btn" data-id="${post.id}"><span>↗</span> Share</button></div></div></article>`;
}

function newsView() {
  return `<section class="newsroom"><div class="section-head"><h2>Latest from the scene</h2><span>Publisher updates</span></div><div class="empty-state"><div class="empty-icon">◫</div><h3>No newsroom updates yet</h3><p>Verified artist news and opportunities will appear here when published by PAUL APPORG.</p><a class="primary-btn" href="https://paulapporg.com" target="_blank" rel="noreferrer">Visit PAUL APPORG ↗</a><a class="admin-link" href="https://supabase.com/dashboard/project/cneexpeuohusulhksmaa" target="_blank" rel="noreferrer">PAUL APPORG Admin · Publish or update news ↗</a></div></section>`;
}

function profileView() {
  const user = state.user;
  return `<section class="profile-card"><div class="profile-banner"><div class="avatar">${user.initials}</div><div><h2>${user.name}</h2><p>${tag(user.role === "artist" ? "Artist" : "Viewer")} ${user.location ? "· " + user.location : ""}</p></div></div><div class="profile-actions"><button class="primary-btn" id="share-account">↗ Share my account</button><button class="secondary-btn" id="open-account-chat">✉ Open Chatbox</button></div><form id="profile-form"><div class="form-grid">${user.role === "artist" ? `<div class="field full"><label for="profile-statement">Artist statement</label><textarea id="profile-statement" name="statement">${user.statement || ""}</textarea></div><div class="field full"><label for="profile-bio">Bio</label><textarea id="profile-bio" name="bio">${user.bio || ""}</textarea></div>` : `<div class="field full"><label for="profile-bio">About you</label><textarea id="profile-bio" name="bio">${user.bio || ""}</textarea></div>`}</div><button class="primary-btn" style="margin-top:18px" type="submit">Save profile changes</button></form></section>`;
}

function chatView() {
  const names = [...new Set(state.chats.map(chat => chat.artist))];
  const selected = state.chatArtist || names[0];
  const messages = state.chats.filter(chat => chat.artist === selected);
  return `<section class="chatbox"><div class="chat-list"><div class="section-head"><h2>Chatbox</h2><span>${names.length} conversations</span></div>${names.length ? names.map(name => `<button class="chat-contact ${name === selected ? "active" : ""}" data-chat-artist="${name}"><span class="avatar">${initials(name)}</span><span><strong>${name}</strong><small>Message thread</small></span></button>`).join("") : '<div class="chat-empty">No conversations yet.<br>Contact an artist from the feed to start one.</div>'}</div><div class="chat-panel">${selected ? `<div class="chat-panel-head"><div class="person"><div class="avatar">${initials(selected)}</div><div><strong>${selected}</strong><span class="post-date">Paul Sketches member</span></div></div></div><div class="messages">${messages.map(message => `<div class="message ${message.from === state.user.name ? "mine" : ""}">${message.text}<small>${message.time}</small></div>`).join("") || '<p class="chat-placeholder">Start a conversation with this artist.</p>'}</div><form id="chat-form" class="chat-compose"><input name="message" required placeholder="Write a message..." autocomplete="off"><button class="primary-btn" type="submit">Send</button></form>` : '<div class="chat-placeholder large">Your conversations will appear here.</div>'}</div></section>`;
}

function bindView() {
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => { state.view = button.dataset.view; renderApp(); });
  const amount = document.querySelector("#amount"), currency = document.querySelector("#currency"), result = document.querySelector("#conversion-result");
  if (amount) { const update = () => { const value = Number(amount.value) || 0; result.textContent = currency.value === "lsl" ? `≈ £${(value / 23.5).toFixed(2)}` : `≈ M ${(value * 23.5).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }; amount.oninput = update; currency.onchange = update; }
  document.querySelectorAll(".like-btn").forEach(button => button.onclick = () => { const post = state.posts.find(item => item.id === Number(button.dataset.id)); post.liked = !post.liked; post.likes += post.liked ? 1 : -1; if (post.liked) { state.user.notifications = (state.user.notifications || 0) + 1; toast("Added to your likes — the artist will see your support."); } save(); renderApp(); });
  document.querySelectorAll(".contact-btn").forEach(button => button.onclick = () => openChat(button.dataset.artist));
  document.querySelectorAll(".share-piece-btn").forEach(button => button.onclick = () => { const post = state.posts.find(item => item.id === Number(button.dataset.id)); shareLink("piece", post.id); });
  document.querySelectorAll(".chat-contact").forEach(button => button.onclick = () => openChat(button.dataset.chatArtist));
  const chatForm = document.querySelector("#chat-form");
  if (chatForm) chatForm.onsubmit = event => { event.preventDefault(); const text = new FormData(chatForm).get("message").trim(); if (!text) return; state.chats.push({ artist: state.chatArtist, from: state.user.name, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }); save(); renderApp(); };
  const shareAccount = document.querySelector("#share-account"); if (shareAccount) shareAccount.onclick = () => shareLink("account", state.user.name);
  const accountChat = document.querySelector("#open-account-chat"); if (accountChat) accountChat.onclick = () => { state.view = "chat"; renderApp(); };
  document.querySelectorAll(".value-btn").forEach(button => button.onclick = () => { const post = state.posts.find(item => item.id === Number(button.dataset.id)); const value = prompt("What do you think this piece is worth in Maloti?", post.price); if (value && Number(value) > 0) { post.price = Number(value); save(); renderApp(); toast("Your fan valuation has been added."); } });
  const upload = document.querySelector("#open-upload"); if (upload) upload.onclick = openUpload;
  const profile = document.querySelector("#profile-form"); if (profile) profile.onsubmit = event => { event.preventDefault(); const data = Object.fromEntries(new FormData(profile)); Object.assign(state.user, data); save(); toast("Your profile has been updated."); };
}

function openUpload() {
  const modal = document.createElement("div"); modal.className = "modal-backdrop"; modal.innerHTML = `<div class="modal"><div class="modal-head"><div><div class="eyebrow">Artist studio</div><h2>Share a new piece</h2></div><button class="close">×</button></div><form id="upload-form"><div class="form-grid"><div class="field full"><label for="piece-title">Title</label><input id="piece-title" name="title" required placeholder="Name your work" /></div><div class="field full"><label for="piece-file">Artwork image</label><input id="piece-file" name="file" type="file" accept="image/*" required /></div><div class="field"><label for="piece-price">Starting valuation (M)</label><input id="piece-price" name="price" type="number" min="1" required placeholder="1200" /></div><div class="field"><label for="piece-medium">Medium</label><input id="piece-medium" name="medium" required placeholder="Oil on canvas" /></div><div class="field full"><label for="piece-description">Description</label><textarea id="piece-description" name="description" required placeholder="Tell the community about this piece..."></textarea></div></div><button class="primary-btn" style="margin-top:18px;width:100%" type="submit">Publish artwork</button></form></div>`; document.body.append(modal); modal.querySelector(".close").onclick = () => modal.remove(); modal.onclick = event => { if (event.target === modal) modal.remove(); };   modal.querySelector("#upload-form").onsubmit = async event => { event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form)); const file = form.querySelector("#piece-file").files[0]; if (!supabaseClient) { toast("The shared artwork service is not available."); return; } const path = `${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "-")}`; const { error: uploadError } = await supabaseClient.storage.from("artworks").upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) { toast(`Image upload failed: ${uploadError.message}`); return; } const { data: imageData } = supabaseClient.storage.from("artworks").getPublicUrl(path); const { error: insertError } = await supabaseClient.from("artworks").insert({ artist: state.user.name, initials: state.user.initials, title: data.title, description: `${data.description} · ${data.medium}`, image: imageData.publicUrl, likes: 0, price: Number(data.price) }); if (insertError) { toast(`Artwork could not be published: ${insertError.message}`); return; } modal.remove(); toast("Artwork published to NTLONG for everyone."); }; }

window.addEventListener("storage", event => {
  if (event.key === "paulArtistAnnouncement" && state.user && state.user.role !== "artist") {
    const announcement = JSON.parse(event.newValue || "null");
    if (announcement) {
      state.user.lastArtistAnnouncement = announcement.at;
      state.user.notifications = (state.user.notifications || 0) + 1;
      save();
      toast(`${announcement.name} just joined as an artist. Check them out!`);
    }
  }
});
subscribeToArtworks();
loadSharedArtworks();
if (state.user) renderApp(); else renderAuth();
