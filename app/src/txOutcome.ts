/**
 * What a wallet hands back after a transaction, and what to tell the player.
 *
 * Wallets differ in how they report the same three outcomes:
 *
 * - Success. The dapp-kit wraps it as `{ $kind: "Transaction", Transaction }`
 *   with the digest INSIDE `Transaction`; other builds return a plain
 *   `{ digest }`. The dapp-kit builds that variant only from effects that
 *   say the transaction succeeded, so it counts as a success even when the
 *   wallet left the digest out. Anything else that resolves without a digest
 *   is not proof the transaction ran, so it counts as unconfirmed.
 * - Declined. The game client's approval window rejects with code 4001; other
 *   wallets throw a sentence such as "Transaction rejected by user".
 * - Failed on chain. The game client rejects with code -32009 and the failed
 *   transaction as `data`; the dapp-kit can also resolve with
 *   `{ $kind: "FailedTransaction" }`.
 *
 * The game client throws `Error(JSON.stringify(error))`, so `Error.message` is
 * a JSON string. Players never see that JSON: every path below ends in a
 * short sentence.
 */

import { CLAIM_MODULE } from "./config";

/** JSON-RPC codes the game client's wallet uses. */
export const WALLET_REJECTED_CODE = 4001;
export const WALLET_CHAIN_FAILURE_CODE = -32009;

export type TxErrorKind = "declined" | "chain" | "unconfirmed" | "invalid-amount" | "other";

/** A failure whose message is already fit to show. */
export class TxError extends Error {
  readonly kind: TxErrorKind;

  constructor(kind: TxErrorKind, message: string) {
    super(message);
    this.name = "TxError";
    this.kind = kind;
  }
}

export const DECLINED_IN_GAME_TEXT = "You declined the request in the game's approval window.";
export const DECLINED_TEXT = "You declined the request in your wallet.";
export const CHAIN_FAILURE_TEXT = "The transaction failed on chain.";
export const UNCONFIRMED_TEXT =
  "The wallet did not confirm the transaction. Check the unit before you try again.";
export const WHOLE_UNITS_TEXT = "Amounts must be whole units, at least 1.";

const MAX_SHOWN = 140;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ─── Results ──────────────────────────────────────────────

/**
 * The digest of a transaction that ran successfully ("" when the wallet gave
 * none for a dapp-kit success), or a TxError. Accepts the dapp-kit union, a
 * plain `{ digest }`, and JSON-RPC style effects.
 */
export function executedDigest(result: unknown): string {
  const record = asRecord(result);
  if (record?.$kind === "FailedTransaction") throw chainFailure(record.FailedTransaction);

  const executed = record?.$kind === "Transaction" ? asRecord(record.Transaction) : record;
  const status = asRecord(executed?.status);
  const effectsStatus = asRecord(asRecord(executed?.effects)?.status);
  if (status?.success === false || effectsStatus?.status === "failure") {
    throw chainFailure(executed);
  }

  const digest = nonEmptyString(executed?.digest);
  if (digest) return digest;
  // The dapp-kit decoded successful effects but the wallet sent no digest
  // (the game client's wallet was seen doing this in 2026-07).
  if (record?.$kind === "Transaction" && status?.success === true) return "";
  throw new TxError("unconfirmed", UNCONFIRMED_TEXT);
}

// ─── Wallet errors ────────────────────────────────────────

interface WalletErrorBody {
  code?: number;
  /** The readable part: the JSON body's `message`, else the raw text. */
  text: string;
  data?: unknown;
  /** The raw text was JSON (never shown as is). */
  json: boolean;
}

function toCode(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

/** Unpacks a JSON error body from Error.message, an error object, or text. */
export function readWalletError(cause: unknown): WalletErrorBody {
  const record = asRecord(cause);
  const raw =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : (nonEmptyString(record?.message) ?? "");

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const body = asRecord(JSON.parse(trimmed));
      if (body) {
        return {
          code: toCode(body.code),
          text: typeof body.message === "string" ? body.message : "",
          data: body.data,
          json: true,
        };
      }
    } catch {
      // Not JSON after all: treat it as text.
    }
  }
  return { code: toCode(record?.code), text: raw, data: record?.data, json: false };
}

/**
 * Narrow on purpose: a chain error that merely contains "rejected" (e.g. a
 * validator rejecting a transaction) is not the player saying no.
 */
const DECLINE_PATTERNS = [
  "user rejected",
  "rejected by user",
  "user denied",
  "denied by user",
  "user cancelled",
  "user canceled",
  "user dismissed",
];

function isDecline(text: string): boolean {
  const lower = text.toLowerCase();
  return DECLINE_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Known failures in plain words. Matched against error TEXT only, never `data`. */
const RULES: { match: string[]; text: string }[] = [
  {
    match: ["insufficient capacity", "einventoryinsufficientcapacity"],
    text: "Not enough room in the destination. Clear some space, then retry.",
  },
  {
    match: ["insufficient quantity", "einventoryinsufficientquantity", "item not found", "eitemdoesnotexist"],
    text: "Not enough of that item left. The list refreshes every few seconds.",
  },
  { match: ["not online", "enotonline"], text: "This unit is offline." },
  {
    // world storage_unit: EExtensionNotAuthorized / ENoExtensionToRevoke.
    match: [
      "eextensionnotauthorized",
      "access only authorized for the custom contract",
      "enoextensiontorevoke",
      "no extension authorization to revoke",
    ],
    text: "Shared access is not enabled on this unit.",
  },
  { match: ["gas"], text: "Your wallet needs a little testnet SUI to pay gas." },
];

/**
 * Drops where an abort happened ("in '0x…::storage_unit::authorize_extension'",
 * Identifier("…"), function_name: Some("…")) so a function's name never
 * matches a rule meant for the failure itself.
 */
function withoutLocation(text: string): string {
  return text
    .replace(/in '0x[0-9a-f]+::[^']*'/gi, "")
    .replace(/Identifier\("[^"]*"\)/g, "")
    .replace(/function_name: Some\("[^"]*"\)/g, "");
}

function ruleFor(text: string): string | undefined {
  const lower = withoutLocation(text).toLowerCase();
  return RULES.find((rule) => rule.match.some((needle) => lower.includes(needle)))?.text;
}

function isTimeout(text: string): boolean {
  return /timed out|timeout/i.test(text);
}

/** Clever `#[error]` aborts set bit 63; the raw number means nothing to a player. */
function isCleverCode(code: string): boolean {
  return /^\d+$/.test(code) && BigInt(code) >= 1n << 63n;
}

interface AbortInfo {
  text: string;
  code?: string;
  module?: string;
  functionName?: string;
  /** A `#[error]` constant's name and English message, when reported. */
  constantName?: string;
  constantValue?: string;
}

/** This package's own abort codes (claim.move). */
const CLAIM_ABORTS: Record<string, string> = {
  "0": "That character is not the one connected to your wallet.",
  "1": WHOLE_UNITS_TEXT,
};

/** Pulls the Move abort out of a failed transaction or an error message. */
function readAbort(failed: unknown, fallbackText = ""): AbortInfo {
  let parsed = failed;
  if (typeof failed === "string" && failed.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(failed);
    } catch {
      // Leave it as text.
    }
  }
  const record = asRecord(parsed);
  const nested = asRecord(record?.FailedTransaction) ?? asRecord(record?.Transaction) ?? record;
  const error = asRecord(nested?.status)?.error ?? asRecord(asRecord(nested?.effects)?.status)?.error;

  const info: AbortInfo = { text: fallbackText };
  if (typeof error === "string") info.text = error;
  const errorRecord = asRecord(error);
  if (errorRecord) {
    info.text = nonEmptyString(errorRecord.message) ?? info.text;
    const abort = asRecord(errorRecord.MoveAbort);
    const location = asRecord(abort?.location);
    const clever = asRecord(abort?.cleverError);
    if (abort?.abortCode !== undefined) info.code = String(abort.abortCode);
    info.module = nonEmptyString(location?.module);
    info.functionName = nonEmptyString(location?.functionName);
    info.constantName = nonEmptyString(clever?.constantName);
    info.constantValue = nonEmptyString(clever?.value);
  }

  // Fill gaps from the text: the SDK's "abort code: 1, in '0x…::claim::take'"
  // and the older "Identifier(\"claim\") … function_name: Some(\"take\") }, 1)".
  const text = info.text;
  info.code ??=
    /abort code:\s*(\d+)/i.exec(text)?.[1] ?? /\},\s*(\d+)\)\s*in command/i.exec(text)?.[1];
  const location = /in '0x[0-9a-f]+::(\w+)(?:::(\w+))?'/i.exec(text);
  info.module ??= location?.[1] ?? /Identifier\("(\w+)"\)/.exec(text)?.[1];
  info.functionName ??= location?.[2] ?? /function_name: Some\("(\w+)"\)/.exec(text)?.[1];
  const constant = /'(E\w+)'(?::\s*([^,]+))?/.exec(text);
  info.constantName ??= constant?.[1];
  info.constantValue ??= constant?.[2]?.trim();
  return info;
}

function abortReason(info: AbortInfo): string | undefined {
  const known = ruleFor([info.text, info.constantName ?? "", info.constantValue ?? ""].join(" "));
  if (known) return known;
  if (info.module === CLAIM_MODULE && info.code !== undefined && CLAIM_ABORTS[info.code]) {
    return CLAIM_ABORTS[info.code];
  }
  if (info.constantValue) return `${info.constantValue.replace(/\.$/, "")}.`;
  const where = [info.module, info.functionName].filter(Boolean).join("::");
  if (info.code !== undefined && !isCleverCode(info.code)) {
    return `Abort code ${info.code}${where ? ` in ${where}` : ""}.`;
  }
  if (info.code !== undefined && where) return `It stopped in ${where}.`;
  return undefined;
}

function chainFailureText(failed: unknown, fallbackText = ""): string {
  const reason = abortReason(readAbort(failed, fallbackText));
  return reason ? `${CHAIN_FAILURE_TEXT} ${reason}` : CHAIN_FAILURE_TEXT;
}

function chainFailure(failed: unknown): TxError {
  return new TxError("chain", chainFailureText(failed));
}

function looksLikeAbort(text: string): boolean {
  return /moveabort|abort code/i.test(text);
}

/**
 * The dapp-kit could not decode what the wallet returned. The client's
 * current signer sends empty effects when a transaction failed on chain, and
 * decoding those throws; since the result is unknown, say so rather than
 * guess.
 */
function isUndecodableResult(text: string): boolean {
  return /uleb decode error|not correctly encoded/i.test(text);
}

/**
 * Any failure from building, signing or sending, as a kind plus one short
 * sentence. Never returns raw JSON.
 */
export function describeTxError(cause: unknown): { kind: TxErrorKind; message: string } {
  if (cause instanceof TxError) return { kind: cause.kind, message: cause.message };

  const error = readWalletError(cause);
  if (error.code === WALLET_REJECTED_CODE) {
    return { kind: "declined", message: DECLINED_IN_GAME_TEXT };
  }
  if (error.code === WALLET_CHAIN_FAILURE_CODE) {
    return { kind: "chain", message: chainFailureText(error.data, error.text) };
  }
  if (isDecline(error.text)) return { kind: "declined", message: DECLINED_TEXT };
  // Undecodable or timed out: it may or may not have run.
  if (isUndecodableResult(error.text) || isTimeout(error.text)) {
    return { kind: "unconfirmed", message: UNCONFIRMED_TEXT };
  }
  if (looksLikeAbort(error.text)) {
    return { kind: "chain", message: chainFailureText(undefined, error.text) };
  }

  const known = ruleFor(error.text);
  if (known) return { kind: "other", message: known };

  const text = error.text.trim();
  if (!text || /^[[{]|\{"/.test(text)) {
    const code = error.code !== undefined ? ` (code ${error.code})` : "";
    return { kind: "other", message: `The wallet reported a problem${code}. Try again.` };
  }
  return {
    kind: "other",
    message: text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text,
  };
}
