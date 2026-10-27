# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-10 [P3] open - Host ports with leading zeros bypass install-wide host uniqueness

**File:** packages/db/src/sites.ts:7
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security, quality)
**Why it matters:** `HOST` captures `:(\d{1,5})` and only range-checks the numeric value, so `acme.com:08080` and `acme.com:080` are accepted and stored verbatim (confirmed by a probe of the regex and range check). `domains_host_key` compares text, so one site can hold `acme.com:8080` while another holds `acme.com:08080`, which defeats the spec's "unique across the install" rule for the same host and port. If Feature 23 parses the port numerically, host resolution becomes ambiguous; if it matches strings, the zero-padded entry is unreachable data. Feature 3 will expose `addDomain` to user input.
**Suggested fix:** Reject leading zeros in the port (`(?::([1-9]\d{0,4}))?`) or store the canonical `String(port)`, and add `acme.com:08080` to the malformed-host test.
**Resolution:**
