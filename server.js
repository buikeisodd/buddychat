import http from "node:http";
import { analyzeContent } from "./contentSafety.js";

const PORT = Number(process.env.PORT || 4000);

const db = {
  users: [],
  sessions: new Map(),
  syncCodes: new Map(),
  contactsByChild: new Map(),
  messages: [],
  statuses: [],
  safetyReports: [],
  links: [],
};

function defaultContacts() {
  return [
    {
      id: 1,
      name: "Max",
      emoji: "M",
      color: "bg-amber-100 dark:bg-amber-900",
      online: true,
      unread: 3,
      lastMsg: "haha that was so funny!!",
      lastTime: "2m",
      approved: true,
    },
    {
      id: 2,
      name: "Lily",
      emoji: "L",
      color: "bg-pink-100 dark:bg-pink-900",
      online: true,
      unread: 0,
      lastMsg: "want to play after school?",
      lastTime: "15m",
      approved: true,
    },
    {
      id: 3,
      name: "Tommy",
      emoji: "T",
      color: "bg-green-100 dark:bg-green-900",
      online: false,
      unread: 1,
      lastMsg: "I got a new Lego set!!",
      lastTime: "1h",
      approved: true,
    },
    {
      id: 4,
      name: "Sara",
      emoji: "S",
      color: "bg-blue-100 dark:bg-blue-900",
      online: false,
      unread: 0,
      lastMsg: "did you finish the homework?",
      lastTime: "3h",
      approved: true,
    },
    {
      id: 5,
      name: "Jake",
      emoji: "J",
      color: "bg-orange-100 dark:bg-orange-900",
      online: true,
      unread: 0,
      lastMsg: "hey! want to be friends?",
      lastTime: "5h",
      approved: false,
    },
  ];
}

function childIdsForUser(user) {
  if (user.role === "child") return [user.id];
  return user.linkedChildIds || [];
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicUser(user) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.password;
  return safeUser;
}

function createSession(user) {
  const token = crypto.randomUUID();
  db.sessions.set(token, user.id);
  return token;
}

function userFromToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = db.sessions.get(token);
  return db.users.find((user) => user.id === userId) || null;
}

function requireUser(req, res) {
  const user = userFromToken(req);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  return user;
}

function generateCode() {
  return `BK-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "buddychat-test-backend" });
  }

  if (req.method === "POST" && url.pathname === "/auth/signup") {
    const body = await parseBody(req);
    const { role, email, username, password, displayName } = body;
    if (!["child", "parent"].includes(role))
      return json(res, 400, { error: "role must be child or parent" });
    if (!password || (!email && !username))
      return json(res, 400, {
        error: "email or username and password are required",
      });

    const loginId = role === "parent" ? email : username;
    const existing = db.users.find(
      (user) => user.role === role && user.loginId === loginId,
    );
    if (existing) return json(res, 409, { error: "Account already exists" });

    const user = {
      id: crypto.randomUUID(),
      role,
      loginId,
      email: email || null,
      username: username || null,
      displayName: displayName || username || email,
      password,
      linkedParentId: null,
      linkedChildIds: [],
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);

    let syncCode = null;
    if (role === "child") {
      syncCode = generateCode();
      db.syncCodes.set(syncCode, user.id);
      db.contactsByChild.set(user.id, defaultContacts());
    }

    const token = createSession(user);
    return json(res, 201, { token, user: publicUser(user), syncCode });
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const body = await parseBody(req);
    const { role, email, username, password } = body;
    const loginId = role === "parent" ? email : username;
    const user = db.users.find(
      (item) =>
        item.role === role &&
        item.loginId === loginId &&
        item.password === password,
    );
    if (!user) return json(res, 401, { error: "Invalid credentials" });
    return json(res, 200, {
      token: createSession(user),
      user: publicUser(user),
    });
  }

  if (req.method === "GET" && url.pathname === "/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/parent/link-child") {
    const parent = requireUser(req, res);
    if (!parent) return;
    if (parent.role !== "parent")
      return json(res, 403, { error: "Only parents can link child accounts" });

    const { code } = await parseBody(req);
    const childId = db.syncCodes.get(
      String(code || "")
        .trim()
        .toUpperCase(),
    );
    const child = db.users.find(
      (user) => user.id === childId && user.role === "child",
    );
    if (!child) return json(res, 404, { error: "Sync code not found" });

    child.linkedParentId = parent.id;
    if (!parent.linkedChildIds.includes(child.id))
      parent.linkedChildIds.push(child.id);
    db.links.push({
      id: crypto.randomUUID(),
      parentId: parent.id,
      childId: child.id,
      linkedAt: new Date().toISOString(),
    });
    db.syncCodes.delete(String(code).trim().toUpperCase());

    return json(res, 200, {
      parent: publicUser(parent),
      child: publicUser(child),
    });
  }

  if (req.method === "POST" && url.pathname === "/moderate") {
    const user = requireUser(req, res);
    if (!user) return;
    const { text, surface = "message" } = await parseBody(req);
    const result = analyzeContent({ text, author: user.displayName, surface });
    if (result.report)
      db.safetyReports.unshift({ ...result.report, userId: user.id });
    return json(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/contacts") {
    const user = requireUser(req, res);
    if (!user) return;

    const childIds = childIdsForUser(user);
    const childId = childIds[0];
    if (!childId) return json(res, 200, { contacts: [] });

    if (!db.contactsByChild.has(childId))
      db.contactsByChild.set(childId, defaultContacts());
    return json(res, 200, {
      childId,
      contacts: db.contactsByChild.get(childId),
    });
  }

  if (req.method === "POST" && url.pathname === "/parent/approve-friend") {
    const parent = requireUser(req, res);
    if (!parent) return;
    if (parent.role !== "parent")
      return json(res, 403, { error: "Only parents can approve friends" });

    const { childId = parent.linkedChildIds[0], contactId } =
      await parseBody(req);
    if (!parent.linkedChildIds.includes(childId))
      return json(res, 403, { error: "Child is not linked to this parent" });
    if (!db.contactsByChild.has(childId))
      db.contactsByChild.set(childId, defaultContacts());

    const contacts = db.contactsByChild
      .get(childId)
      .map((contact) =>
        String(contact.id) === String(contactId)
          ? { ...contact, approved: true }
          : contact,
      );
    db.contactsByChild.set(childId, contacts);
    return json(res, 200, { childId, contacts });
  }

  if (req.method === "POST" && url.pathname === "/messages") {
    const user = requireUser(req, res);
    if (!user) return;
    const { toUserId, text, type = "text" } = await parseBody(req);
    const moderation = analyzeContent({
      text,
      author: user.displayName,
      surface: type === "voice" ? "voice note transcript" : "message",
    });
    const message = {
      id: crypto.randomUUID(),
      fromUserId: user.id,
      toUserId,
      text,
      type,
      moderationStatus: moderation.report
        ? moderation.report.severity
        : "clear",
      createdAt: new Date().toISOString(),
    };
    db.messages.unshift(message);
    if (moderation.report)
      db.safetyReports.unshift({
        ...moderation.report,
        userId: user.id,
        messageId: message.id,
      });
    return json(res, 201, { message, moderation });
  }

  if (req.method === "POST" && url.pathname === "/statuses") {
    const user = requireUser(req, res);
    if (!user) return;
    const { text, type = "text", mediaUrl = null } = await parseBody(req);
    const moderation = analyzeContent({
      text,
      author: user.displayName,
      surface: `${type} status`,
    });
    const status = {
      id: crypto.randomUUID(),
      userId: user.id,
      text,
      type,
      mediaUrl,
      moderationStatus: moderation.report
        ? moderation.report.severity
        : "clear",
      createdAt: new Date().toISOString(),
    };
    db.statuses.unshift(status);
    if (moderation.report)
      db.safetyReports.unshift({
        ...moderation.report,
        userId: user.id,
        statusId: status.id,
      });
    return json(res, 201, { status, moderation });
  }

  if (req.method === "GET" && url.pathname === "/parent/safety-reports") {
    const parent = requireUser(req, res);
    if (!parent) return;
    if (parent.role !== "parent")
      return json(res, 403, { error: "Only parents can view safety reports" });

    const childIds = new Set(parent.linkedChildIds);
    const reports = db.safetyReports.filter((report) =>
      childIds.has(report.userId),
    );
    return json(res, 200, { reports });
  }

  return json(res, 404, { error: "Route not found" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    json(res, 500, { error: error.message || "Server error" });
  });
});

server.listen(PORT, () => {
  console.log(`BuddyChat test backend running on http://localhost:${PORT}`);
});
