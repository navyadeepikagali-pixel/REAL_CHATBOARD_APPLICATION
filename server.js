const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_USERNAME_LENGTH = 24;
const MAX_ROOM_LENGTH = 32;
const HISTORY_LIMIT = 50;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const roomHistories = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function getRoomUsers(room) {
  const users = [];

  for (const socket of io.sockets.adapter.rooms.get(room) || []) {
    const member = io.sockets.sockets.get(socket);
    if (member?.data.username) {
      users.push(member.data.username);
    }
  }

  return users.sort((a, b) => a.localeCompare(b));
}

function broadcastUsers(room) {
  io.to(room).emit("users-updated", { users: getRoomUsers(room) });
}

function leaveCurrentRoom(socket, announce = true) {
  const { room, username } = socket.data;
  if (!room) {
    return;
  }

  socket.leave(room);
  delete socket.data.room;
  delete socket.data.username;

  if (announce && username) {
    io.to(room).emit("system-message", {
      text: `${username} left the room.`,
      timestamp: new Date().toISOString()
    });
  }

  broadcastUsers(room);
}

io.on("connection", (socket) => {
  socket.on("join-room", (payload = {}) => {
    const username = cleanText(payload.username, MAX_USERNAME_LENGTH);
    const room = cleanText(payload.room, MAX_ROOM_LENGTH);

    if (!username || !room) {
      socket.emit("join-error", {
        message: "Enter a username and room name to join."
      });
      return;
    }

    const duplicate = Array.from(io.sockets.adapter.rooms.get(room) || []).some(
      (socketId) => {
        if (socketId === socket.id) {
          return false;
        }

        const member = io.sockets.sockets.get(socketId);
        return (
          member?.data.username?.toLocaleLowerCase() ===
          username.toLocaleLowerCase()
        );
      }
    );

    if (duplicate) {
      socket.emit("join-error", {
        message: "That username is already in use in this room."
      });
      return;
    }

    const previousRoom = socket.data.room;
    if (previousRoom === room && socket.data.username === username) {
      socket.emit("room-joined", {
        username,
        room,
        users: getRoomUsers(room),
        messages: roomHistories.get(room) || []
      });
      return;
    }

    if (previousRoom) {
      leaveCurrentRoom(socket);
    }

    socket.data.username = username;
    socket.data.room = room;
    socket.join(room);

    const messages = roomHistories.get(room) || [];
    socket.emit("room-joined", {
      username,
      room,
      users: getRoomUsers(room),
      messages
    });

    if (!previousRoom || previousRoom !== room) {
      io.to(room).emit("system-message", {
        text: `${username} joined the room.`,
        timestamp: new Date().toISOString()
      });
    }

    broadcastUsers(room);
  });

  socket.on("send-message", (payload = {}) => {
    const { room, username } = socket.data;
    const text = cleanText(payload.text, MAX_MESSAGE_LENGTH);

    if (!room || !username || !text) {
      return;
    }

    const message = {
      username,
      text,
      timestamp: new Date().toISOString()
    };
    const history = roomHistories.get(room) || [];
    history.push(message);
    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }
    roomHistories.set(room, history);
    io.to(room).emit("new-message", message);
  });

  socket.on("typing", (payload = {}) => {
    const { room, username } = socket.data;
    if (!room || !username || typeof payload.isTyping !== "boolean") {
      return;
    }

    socket.to(room).emit("typing-update", {
      username,
      isTyping: payload.isTyping
    });
  });

  socket.on("leave-room", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Chat server is running at http://localhost:${PORT}`);
});
