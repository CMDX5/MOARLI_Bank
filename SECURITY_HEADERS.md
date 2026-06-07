# Security Headers Configuration

**Status:** ✅ Implemented in `next.config.ts`

## Headers Applied to All Routes

### 1. X-Content-Type-Options: nosniff
- **Purpose:** Prevents MIME type sniffing attacks
- **Value:** `nosniff`
- **Impact:** Browsers won't attempt to guess content type

### 2. Referrer-Policy: strict-origin-when-cross-origin
- **Purpose:** Controls referrer information sent to external sites
- **Value:** `strict-origin-when-cross-origin`
- **Impact:** Only sends origin (not full URL) to cross-origin sites

### 3. Strict-Transport-Security (HSTS)
- **Purpose:** Forces HTTPS connections only
- **Value:** `max-age=63072000; includeSubDomains; preload`
- **Max Age:** 2 years (63,072,000 seconds)
- **Impact:** Prevents downgrade attacks to HTTP
- **Note:** Can be added to HSTS preload list at https://hstspreload.org/

### 4. X-Frame-Options: DENY
- **Purpose:** Prevents clickjacking by blocking iframe embedding
- **Value:** `DENY`
- **Impact:** App cannot be embedded in iframes anywhere

### 5. X-XSS-Protection: 1; mode=block
- **Purpose:** Enables XSS protection in legacy browsers
- **Value:** `1; mode=block`
- **Impact:** Stops page loading if XSS detected (legacy)
- **Note:** Modern browsers use CSP instead

### 6. X-DNS-Prefetch-Control: off
- **Purpose:** Prevents DNS prefetching to untrusted domains
- **Value:** `off`
- **Impact:** Blocks speculative DNS lookups

## Route-Specific Headers

### QR Scanner Route (`/scan`)
```
Permissions-Policy: camera=(self), microphone=(), geolocation=()
```
- **Purpose:** Allow camera access only on `/scan` page
- **Protection:** Principle of least privilege

### All Other Routes (`/`...except `/scan`)
```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
- **Purpose:** Disable all device access by default
- **Protection:** Users can't be tracked or have camera/mic accessed

## Content Security Policy (CSP)

**Status:** Managed by `src/middleware.ts` (per-request nonce)

### Why CSP in Middleware?
- Generates unique nonce for each request
- Supports inline React styles
- Prevents XSS attacks with script-src directive
- See `src/middleware.ts` for implementation

## Testing Security Headers

### 1. Test locally with curl:
```bash
curl -I https://localhost:3000/
# Look for security headers in response
```

### 2. Test in production:
```bash
curl -I https://moarli-bank.vercel.app/
```

### 3. Use online tools:
- https://securityheaders.com/
- https://observatory.mozilla.org/

## Implementation Notes

1. **No CSP header in config:** CSP is set per-request in middleware with nonce
2. **HSTS preload:** Can be submitted at https://hstspreload.org/ (2+ year commitment)
3. **Permissions-Policy:** Replaces deprecated Feature-Policy header
4. **X-Frame-Options:** Replaced by CSP `frame-ancestors` but kept for backward compatibility

## Related Security Files

- `next.config.ts` - This configuration
- `src/middleware.ts` - CSP with per-request nonce
- `firestore.rules` - Database access control
- `.secrets-rotation.md` - Secret rotation schedule
- `SECURITY.md` - Overall security policy

## Future Enhancements

- [ ] Add CORS headers for API routes
- [ ] Implement rate limiting headers
- [ ] Add X-Powered-By header validation
- [ ] Implement Subresource Integrity (SRI) for external scripts