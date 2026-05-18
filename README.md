# BuddyChat Test Backend

Small in-memory backend for testing auth, parent-child linking, messages, statuses, and content moderation.

No database and no npm dependencies are required. Data resets when the server restarts.

## Run

```bash
cd backend
npm run dev
```

Default URL:

```text
http://localhost:4000
```

## Test Flow

Create a child:

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"child\",\"username\":\"emma\",\"password\":\"pass123\",\"displayName\":\"Emma\"}"
```

Create a parent:

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"parent\",\"email\":\"parent@example.com\",\"password\":\"pass123\",\"displayName\":\"Parent\"}"
```

Link the child from the parent account:

```bash
curl -X POST http://localhost:4000/parent/link-child \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PARENT_TOKEN" \
  -d "{\"code\":\"SYNC_CODE_FROM_CHILD_SIGNUP\"}"
```

Moderate text:

```bash
curl -X POST http://localhost:4000/moderate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CHILD_TOKEN" \
  -d "{\"text\":\"meet me at the park after school and don't tell anyone\",\"surface\":\"message\"}"
```

Send a message:

```bash
curl -X POST http://localhost:4000/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CHILD_TOKEN" \
  -d "{\"toUserId\":\"friend-id\",\"text\":\"meet me at the park after school\",\"type\":\"text\"}"
```

Create a status:

```bash
curl -X POST http://localhost:4000/statuses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CHILD_TOKEN" \
  -d "{\"type\":\"video\",\"text\":\"going to the mall at 7pm\"}"
```

View parent safety reports:

```bash
curl http://localhost:4000/parent/safety-reports \
  -H "Authorization: Bearer PARENT_TOKEN"
```
