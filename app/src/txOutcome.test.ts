import { describe, expect, it } from "vitest";
import {
  CHAIN_FAILURE_TEXT,
  DECLINED_IN_GAME_TEXT,
  DECLINED_TEXT,
  describeTxError,
  readWalletError,
  TxError,
  UNCONFIRMED_TEXT,
  WHOLE_UNITS_TEXT,
} from "./txOutcome";

/** The game client throws Error(JSON.stringify(error)). */
const gameError = (body: unknown) => new Error(JSON.stringify(body));

const NOT_ENOUGH = "Not enough of that item left. The list refreshes every few seconds.";

describe("describeTxError: game client wallet", () => {
  it("turns a Reject (4001) into plain words", () => {
    const cause = gameError({ code: 4001, message: "User rejected the request" });
    expect(describeTxError(cause)).toEqual({ kind: "declined", message: DECLINED_IN_GAME_TEXT });
  });

  it("reads -32009 as a chain failure with the Move abort from data", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        digest: "D9",
        status: {
          success: false,
          error: {
            $kind: "MoveAbort",
            message:
              "MoveAbort in 1st command, 'EInventoryInsufficientQuantity': Insufficient quantity in inventory, in '0xabc::inventory::withdraw_item' (line 384)",
            MoveAbort: {
              abortCode: "13835058055282163713",
              location: { module: "inventory", functionName: "withdraw_item" },
              cleverError: {
                constantName: "EInventoryInsufficientQuantity",
                value: "Insufficient quantity in inventory",
              },
            },
          },
        },
      },
    });
    expect(describeTxError(cause)).toEqual({
      kind: "chain",
      message: `${CHAIN_FAILURE_TEXT} ${NOT_ENOUGH}`,
    });
  });

  it("maps this package's own aborts (claim.move EInvalidQuantity)", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        status: {
          success: false,
          error: {
            message: "MoveAbort in 1st command, abort code: 1, in '0x1234::claim::take' (instruction 10)",
            MoveAbort: { abortCode: "1", location: { module: "claim", functionName: "take" } },
          },
        },
      },
    });
    expect(describeTxError(cause).message).toBe(`${CHAIN_FAILURE_TEXT} ${WHOLE_UNITS_TEXT}`);
  });

  it("reads a JSON-RPC style failure string in data", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        effects: {
          status: {
            status: "failure",
            error:
              'MoveAbort(MoveLocation { module: ModuleId { address: 0x1234, name: Identifier("claim") }, function: 4, instruction: 12, function_name: Some("put") }, 1) in command 2',
          },
        },
      },
    });
    expect(describeTxError(cause).message).toBe(`${CHAIN_FAILURE_TEXT} ${WHOLE_UNITS_TEXT}`);
  });

  it("names an unknown abort by code and place", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        status: {
          success: false,
          error: {
            message: "MoveAbort in 2nd command, abort code: 7, in '0xabc::other::thing' (instruction 3)",
            MoveAbort: { abortCode: "7", location: { module: "other", functionName: "thing" } },
          },
        },
      },
    });
    expect(describeTxError(cause).message).toBe(
      `${CHAIN_FAILURE_TEXT} Abort code 7 in other::thing.`,
    );
  });

  it("never reads gas or extension out of data or out of where it stopped", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        status: {
          success: false,
          error: {
            message:
              "MoveAbort in 1st command, 'EExtensionConfigFrozen': Extension configuration is frozen, in '0xabc::storage_unit::authorize_extension' (line 76)",
            MoveAbort: {
              abortCode: "13835339530258874381",
              location: { module: "storage_unit", functionName: "authorize_extension" },
            },
          },
        },
        effects: { gasUsed: { computationCost: "1000" }, gasObject: { owner: "0xgas" } },
      },
    });
    expect(describeTxError(cause).message).toBe(
      `${CHAIN_FAILURE_TEXT} Extension configuration is frozen.`,
    );
  });

  it("does not show a clever abort's raw number", () => {
    const cause = gameError({
      code: -32009,
      message: "Server Error",
      data: {
        status: {
          success: false,
          error: {
            message: "MoveAbort in 1st command, abort code: 13835339530258874381, in '0xabc::other::thing' (instruction 9)",
            MoveAbort: { abortCode: "13835339530258874381", location: { module: "other", functionName: "thing" } },
          },
        },
      },
    });
    expect(describeTxError(cause).message).toBe(`${CHAIN_FAILURE_TEXT} It stopped in other::thing.`);
  });

  it("parses data that arrives as a JSON string", () => {
    const failed = {
      status: {
        success: false,
        error: {
          message: "MoveAbort in 1st command, abort code: 1, in '0x1234::claim::take' (instruction 10)",
          MoveAbort: { abortCode: "1", location: { module: "claim", functionName: "take" } },
        },
      },
    };
    const cause = gameError({ code: -32009, message: "Server Error", data: JSON.stringify(failed) });
    expect(describeTxError(cause).message).toBe(`${CHAIN_FAILURE_TEXT} ${WHOLE_UNITS_TEXT}`);
  });

  it("still says it failed on chain when data cannot be parsed", () => {
    expect(describeTxError(gameError({ code: -32009, message: "Server Error" }))).toEqual({
      kind: "chain",
      message: CHAIN_FAILURE_TEXT,
    });
    expect(
      describeTxError(gameError({ code: -32009, message: "Server Error", data: "opaque" })).message,
    ).toBe(CHAIN_FAILURE_TEXT);
  });

  it("never shows raw JSON for anything else", () => {
    const methodMissing = describeTxError(gameError({ code: -32601, message: "Method not found" }));
    expect(methodMissing).toEqual({ kind: "other", message: "Method not found" });

    for (const body of [{ code: -32000 }, { code: -32603, message: "" }, { code: 5, message: '{"x":1}' }]) {
      const { message } = describeTxError(gameError(body));
      expect(message).not.toMatch(/[{}]/);
      expect(message).toMatch(/^The wallet reported a problem/);
    }
    expect(describeTxError(gameError({ code: -32000 })).message).toBe(
      "The wallet reported a problem (code -32000). Try again.",
    );
    // JSON part way through the text is not shown either.
    expect(describeTxError(new Error('Dry run error: {"code":12,"detail":"x"}')).message).toBe(
      "The wallet reported a problem. Try again.",
    );
  });
});

describe("describeTxError: today's wallets keep working", () => {
  it("maps the old in-game wallet's JSON errors by their message", () => {
    const cause = gameError({ code: -32603, message: "Insufficient capacity in the inventory" });
    expect(describeTxError(cause).message).toBe(
      "Not enough room in the destination. Clear some space, then retry.",
    );
  });

  it("reads a dry-run abort text as a chain failure", () => {
    const cause = gameError({
      code: -32603,
      message:
        "Dry run failed: MoveAbort in 1st command, 'ENotOnline': Storage Unit is not online, in '0xabc::storage_unit::withdraw_item' (line 61)",
    });
    expect(describeTxError(cause)).toEqual({
      kind: "chain",
      message: `${CHAIN_FAILURE_TEXT} This unit is offline.`,
    });
  });

  it("reads an undecodable wallet result as unconfirmed, not as raw text", () => {
    // What the dapp-kit throws on the empty effects today's signer sends for a failure.
    expect(describeTxError(new Error("ULEB decode error: buffer overflow"))).toEqual({
      kind: "unconfirmed",
      message: UNCONFIRMED_TEXT,
    });
  });

  it("recognises EVE Vault's decline sentence", () => {
    expect(describeTxError(new Error("Transaction rejected by user"))).toEqual({
      kind: "declined",
      message: DECLINED_TEXT,
    });
  });

  it("does not mistake a validator or server rejection for the player declining", () => {
    expect(describeTxError(new Error("Transaction was rejected by validators: object locked")).kind).not.toBe(
      "declined",
    );
    expect(describeTxError(new Error("Server rejected the request")).kind).not.toBe("declined");
  });

  it("treats a timeout as unconfirmed, since it may have run", () => {
    expect(describeTxError(new Error("Transaction approval timed out"))).toEqual({
      kind: "unconfirmed",
      message: UNCONFIRMED_TEXT,
    });
  });

  it("says shared access is off only for the real extension aborts", () => {
    const off = gameError({
      code: -32603,
      message:
        "MoveAbort in 1st command, 'EExtensionNotAuthorized': Access only authorized for the custom contract of the registered type, in '0xabc::storage_unit::withdraw_item' (line 56)",
    });
    expect(describeTxError(off).message).toBe(
      `${CHAIN_FAILURE_TEXT} Shared access is not enabled on this unit.`,
    );
  });

  it("passes plain text through, trimmed to a readable length", () => {
    expect(describeTxError(new Error("storage unit not found on chain")).message).toBe(
      "storage unit not found on chain",
    );
    const long = "x".repeat(300);
    expect(describeTxError(new Error(long)).message).toBe(`${"x".repeat(140)}…`);
  });

  it("keeps a TxError's own message", () => {
    expect(describeTxError(new TxError("invalid-amount", WHOLE_UNITS_TEXT))).toEqual({
      kind: "invalid-amount",
      message: WHOLE_UNITS_TEXT,
    });
  });

  it("handles non-Error causes", () => {
    expect(describeTxError(undefined).message).toMatch(/^The wallet reported a problem/);
    expect(describeTxError({ code: 4001, message: "User rejected the request" }).kind).toBe("declined");
    expect(describeTxError("Transaction rejected by user").kind).toBe("declined");
  });
});

describe("readWalletError", () => {
  it("unpacks the exact Reject shape", () => {
    expect(readWalletError(gameError({ code: 4001, message: "User rejected the request" }))).toEqual({
      code: 4001,
      text: "User rejected the request",
      data: undefined,
      json: true,
    });
  });
});
