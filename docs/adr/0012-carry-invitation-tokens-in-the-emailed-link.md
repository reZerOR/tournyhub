# Carry invitation tokens in the emailed link

An Auction Invitation is delivered by email, so the raw single-use token travels in the link the invitee opens. The database stores only the token's SHA-256 digest, the token expires after seven days, and acceptance requires the signed-in User's exact verified email. A leaked database row therefore cannot be replayed, and a newer invitation for the Team supersedes every older pending one.

This intentionally places a secret in a URL, which the security policy otherwise avoids. The alternative — emailing a short code the invitee types in — adds a step without removing the bearer-link risk, because the link is the delivery channel. Keeping the raw token out of the URL would only move it into the email body, which is also a bearer artifact.

Consequences:

- Invitation links are secrets. They must never be logged, added to audit or feedback records, or attached to any other URL.
- Only the token digest is stored, and acceptance marks a pending invitation accepted, so a link cannot be used twice.
- Do not add a query parameter, referrer, or analytics field that carries the token.
