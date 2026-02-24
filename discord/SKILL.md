---
name: discord
description: Social messaging with Discord friends. Send and receive messages in chat.
trigger: "@@"
user-invocable: true
allowed-tools: [Bash, Read]
argument-hint: "<friend_name> <message>"
tools:
  - name: discord_send
    description: Send a message to a Discord friend
    cmd: bash $SKILL_DIR/scripts/send_message.sh {{friend}} {{message}}
    args:
      friend:
        type: string
        required: true
        description: Friend name from discord.json config
      message:
        type: string
        required: true
        description: Message text to send
  - name: discord_poll
    description: Check for new messages from Discord friends
    cmd: bash $SKILL_DIR/scripts/poll_messages.sh {{friend}} {{limit}}
    args:
      friend:
        type: string
        required: false
        description: Friend name (omit for all friends)
      limit:
        type: string
        required: false
        default: "10"
        description: Max messages to fetch
  - name: discord_friends
    description: List configured Discord friends
    cmd: bash $SKILL_DIR/scripts/list_friends.sh
---

# Discord Skill

Send and receive messages with Discord friends using the `@@` trigger.

## Usage

Type `@@friend_name message` to send a message. For example:
- `@@tom hey, what's up?` — sends "hey, what's up?" to your friend "tom"
- `@@alice check out this code` — sends a message to "alice"

## How It Works

1. Parse the trigger input: the first word after `@@` is the friend name, the rest is the message.
2. Call `discord_send` with the friend name and message.
3. Optionally call `discord_poll` to fetch recent messages for context before replying.

## Setup

If the Discord config is missing, guide the user through setup:

1. **Bot Token**: Set `DISCORD_BOT_TOKEN` environment variable with a Discord bot token.
2. **Friends Config**: Create `.linggen/discord.json` (project-level) or `~/.linggen/discord.json` (global) with:

```json
{
  "friends": {
    "tom": {
      "channel_id": "123456789012345678",
      "note": "Tom from work"
    },
    "alice": {
      "channel_id": "987654321098765432",
      "note": "Alice - project partner"
    }
  }
}
```

The `channel_id` is the Discord DM channel ID. To find it:
- Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
- Right-click a DM conversation and select "Copy Channel ID"
