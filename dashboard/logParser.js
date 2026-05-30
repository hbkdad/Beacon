// parseLogLine: extracts conversation turns from OpenClaw/Hermes log output
// Handles JSON structured logs, bracket channel format, and incoming/outgoing keywords.
function parseLogLine(line, backend, insertFn) {
  if (!line || line.length < 10) return false;

  // Pattern 1: JSON structured — {"role":"user","channel":"telegram","message":"..."}
  if (line.includes('"role"') && line.includes('"message"')) {
    try {
      const start = line.indexOf('{');
      const end = line.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const d = JSON.parse(line.slice(start, end + 1));
        if ((d.role === 'user' || d.role === 'assistant') && d.message) {
          insertFn({
            backend,
            channel: d.channel || null,
            user: d.user || d.from || null,
            message: String(d.message).slice(0, 4000),
            role: d.role,
            tokens: d.tokens || (d.usage && d.usage.total) || 0,
            model: d.model || null,
          });
          return true;
        }
      }
    } catch (_) {}
  }

  // Pattern 2: [channel:id] user: message  (OpenClaw channel gateway format)
  const m2 = line.match(/\[([a-z_-]+)(?::[^\]]+)?\]\s+([^:\r\n]{1,50}):\s+(.{3,})/i);
  if (m2) {
    const [, ch, who, msg] = m2;
    const isBot = /^(bot|assistant|openclaw|ai|system|claw|hermes)$/i.test(who.trim());
    insertFn({
      backend,
      channel: ch.toLowerCase(),
      user: isBot ? null : who.trim().slice(0, 64),
      message: msg.trim().slice(0, 4000),
      role: isBot ? 'assistant' : 'user',
      tokens: 0,
      model: null,
    });
    return true;
  }

  // Pattern 3: incoming/outgoing keyword lines
  const mIn = line.match(/\b(?:incoming|recv)\b.{0,60}?([a-z_-]{3,20})[|\s]+([^|]{5,200})/i);
  if (mIn) {
    insertFn({ backend, channel: mIn[1].toLowerCase(), message: mIn[2].trim().slice(0, 4000), role: 'user', tokens: 0, model: null });
    return true;
  }
  const mOut = line.match(/\b(?:outgoing|send|response)\b.{0,60}?([a-z_-]{3,20})[|\s]+([^|]{5,200})/i);
  if (mOut) {
    insertFn({ backend, channel: mOut[1].toLowerCase(), message: mOut[2].trim().slice(0, 4000), role: 'assistant', tokens: 0, model: null });
    return true;
  }

  return false;
}

module.exports = { parseLogLine };
