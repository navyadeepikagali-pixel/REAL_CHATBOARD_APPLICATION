const socket = io();

const connectionStatus = document.querySelector("#connection-status");
const joinScreen = document.querySelector("#join-screen");
const chatScreen = document.querySelector("#chat-screen");
const joinForm = document.querySelector("#join-form");
const joinError = document.querySelector("#join-error");
const usernameInput = document.querySelector("#username");
const roomInput = document.querySelector("#room");
const changeRoomButton = document.querySelector("#change-room");
const roomTitle = document.querySelector("#room-title");
const messagesList = document.querySelector("#messages");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const peopleList = document.querySelector("#people-list");
const peopleCount = document.querySelector("#people-count");
const typingIndicator = document.querySelector("#typing-indicator");

let currentUsername = "";
let currentRoom = "";
let typingTimeout;
let typingResetTimeout;

socket.on("connect", () => {
  connectionStatus.classList.add("connected");
  connectionStatus.lastChild.textContent = " Connected";
  if (currentUsername && currentRoom) {
    socket.emit("join-room", {
      username: currentUsername,
      room: currentRoom
    });
  }
});

socket.on("disconnect", () => {
  connectionStatus.classList.remove("connected");
  connectionStatus.lastChild.textContent = " Reconnecting";
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinError.textContent = "";
  socket.emit("join-room", {
    username: usernameInput.value,
    room: roomInput.value
  });
});

socket.on("join-error", ({ message }) => {
  joinError.textContent = message;
});

socket.on("room-joined", ({ username, room, users, messages }) => {
  currentUsername = username;
  currentRoom = room;
  roomTitle.textContent = `#${room}`;
  usernameInput.value = username;
  roomInput.value = room;
  messagesList.replaceChildren();
  messages.forEach(addMessage);
  renderUsers(users);
  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  messageInput.focus();
});

socket.on("new-message", addMessage);

socket.on("system-message", ({ text, timestamp }) => {
  const item = document.createElement("li");
  item.className = "system-message";
  item.textContent = `${text} · ${formatTime(timestamp)}`;
  messagesList.append(item);
  scrollMessagesToBottom();
});

socket.on("users-updated", ({ users }) => {
  renderUsers(users);
});

socket.on("typing-update", ({ username, isTyping }) => {
  if (isTyping) {
    typingIndicator.textContent = `${username} is typing…`;
    window.clearTimeout(typingResetTimeout);
    typingResetTimeout = window.setTimeout(() => {
      typingIndicator.textContent = "";
    }, 1800);
  } else if (typingIndicator.textContent.startsWith(username)) {
    typingIndicator.textContent = "";
  }
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  socket.emit("send-message", { text });
  messageInput.value = "";
  socket.emit("typing", { isTyping: false });
  window.clearTimeout(typingTimeout);
});

messageInput.addEventListener("input", () => {
  socket.emit("typing", { isTyping: messageInput.value.trim().length > 0 });
  window.clearTimeout(typingTimeout);
  typingTimeout = window.setTimeout(() => {
    socket.emit("typing", { isTyping: false });
  }, 1000);
});

changeRoomButton.addEventListener("click", () => {
  socket.emit("typing", { isTyping: false });
  socket.emit("leave-room");
  currentUsername = "";
  currentRoom = "";
  chatScreen.classList.add("hidden");
  joinScreen.classList.remove("hidden");
  joinError.textContent = "";
  roomInput.focus();
});

function addMessage(message) {
  const item = document.createElement("li");
  item.className = "message";
  if (message.username === currentUsername) {
    item.classList.add("own");
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.username;

  const time = document.createElement("time");
  time.dateTime = message.timestamp;
  time.textContent = formatTime(message.timestamp);

  const bubble = document.createElement("p");
  bubble.className = "message-bubble";
  bubble.textContent = message.text;

  meta.append(author, time);
  item.append(meta, bubble);
  messagesList.append(item);
  scrollMessagesToBottom();
}

function renderUsers(users) {
  peopleCount.textContent = String(users.length);
  peopleList.replaceChildren();

  users.forEach((username) => {
    const item = document.createElement("li");
    item.className = "person";

    const avatar = document.createElement("span");
    avatar.className = "person-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = username.slice(0, 2);

    const name = document.createElement("span");
    name.className = "person-name";
    name.textContent = username;

    item.append(avatar, name);
    peopleList.append(item);
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function scrollMessagesToBottom() {
  messagesList.scrollTop = messagesList.scrollHeight;
}
