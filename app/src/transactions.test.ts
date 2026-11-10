import { bcs } from "@mysten/sui/bcs";
import { fromBase64 } from "@mysten/sui/utils";
import type { Transaction } from "@mysten/sui/transactions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMoveTx, signAndExecute } from "./transactions";
import { TxError, UNCONFIRMED_TEXT, WHOLE_UNITS_TEXT } from "./txOutcome";
import type { DAppKitSigner } from "./types";

// Invented variant ids (and the invented base type 4321): the packing rule
// is what is under test, not any real variant.
const SMALL_VARIANT = ((5n << 32n) | 77800n).toString();
const BIG_VARIANT = ((3_000_000n << 32n) | 4321n).toString(); // above 2^53

const UNIT = "0x" + "a".repeat(64);
const CHARACTER = "0x" + "b".repeat(64);
const CAP = "0x" + "c".repeat(64);

interface PureInput {
  Pure?: { bytes: string };
}
interface MoveCallCommand {
  MoveCall?: { module: string; function: string; arguments: { Input?: number }[] };
}

/** The u64 and u32 each claim call carries, decoded from the built transaction. */
function claimCalls(tx: Transaction): { fn: string; key: string; quantity: number }[] {
  const data = tx.getData();
  const inputs = data.inputs as PureInput[];
  const pure = (arg: { Input?: number }) => fromBase64(inputs[arg.Input!].Pure!.bytes);
  return (data.commands as MoveCallCommand[])
    .map((command) => command.MoveCall)
    .filter((call) => call?.module === "claim")
    .map((call) => {
      const args = call!.arguments;
      const [keyArg, quantityArg] = args.slice(-2);
      return {
        fn: call!.function,
        key: bcs.u64().parse(pure(keyArg)),
        quantity: bcs.u32().parse(pure(quantityArg)),
      };
    });
}

function moveTx(takes: { typeId: string; mainQuantity: number; openQuantity: number }[], shares: { typeId: string; quantity: number }[] = []) {
  return buildMoveTx({
    storageUnitId: UNIT,
    characterId: CHARACTER,
    characterOwnerCapId: CAP,
    takes,
    shares,
  });
}

describe("buildMoveTx", () => {
  it("carries the exact packed key into every claim argument", () => {
    const tx = moveTx(
      [
        { typeId: BIG_VARIANT, mainQuantity: 2, openQuantity: 1 },
        { typeId: "77800", mainQuantity: 4, openQuantity: 0 },
      ],
      [{ typeId: SMALL_VARIANT, quantity: 3 }],
    );
    expect(claimCalls(tx)).toEqual([
      { fn: "take", key: BIG_VARIANT, quantity: 2 },
      { fn: "claim_from_open", key: BIG_VARIANT, quantity: 1 },
      { fn: "take", key: "77800", quantity: 4 },
      { fn: "put", key: SMALL_VARIANT, quantity: 3 },
    ]);
  });

  it("keeps two live variants of one type apart in one transaction", () => {
    // Olivine variants 387 and 434 from a Stillness unit (2026-11-10): same
    // base type, same count, different items.
    const tx = moveTx(
      [
        { typeId: "1662152440263", mainQuantity: 152300, openQuantity: 0 },
        { typeId: "1864015903175", mainQuantity: 1, openQuantity: 0 },
      ],
      [{ typeId: "133144064611", quantity: 920 }],
    );
    expect(claimCalls(tx)).toEqual([
      { fn: "take", key: "1662152440263", quantity: 152300 },
      { fn: "take", key: "1864015903175", quantity: 1 },
      { fn: "put", key: "133144064611", quantity: 920 },
    ]);
  });

  it("takes one unit from each of three live variant stacks", () => {
    const keys = ["1864015903175", "1868310871756", "1872605837766"];
    const tx = moveTx(keys.map((typeId) => ({ typeId, mainQuantity: 1, openQuantity: 0 })));
    expect(claimCalls(tx)).toEqual(keys.map((key) => ({ fn: "take", key, quantity: 1 })));
  });

  it.each([0, -1, 0.5, 1.5, Number.NaN])("refuses a take of %s units", (quantity) => {
    expect(() => moveTx([{ typeId: "77800", mainQuantity: quantity, openQuantity: 0 }])).toThrow(
      WHOLE_UNITS_TEXT,
    );
  });

  it.each([0, -3, 0.25])("refuses a share of %s units", (quantity) => {
    expect(() => moveTx([], [{ typeId: "77800", quantity }])).toThrow(WHOLE_UNITS_TEXT);
  });

  it("refuses a key that is not a u64", () => {
    expect(() => moveTx([{ typeId: "1e21", mainQuantity: 1, openQuantity: 0 }])).toThrow(
      "Not a valid item key",
    );
  });
});

describe("signAndExecute", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const tx = () => moveTx([{ typeId: "77800", mainQuantity: 1, openQuantity: 0 }]);
  const signer = (result: unknown): DAppKitSigner => ({
    signAndExecuteTransaction: async () => result,
  });

  it("reads the digest from the dapp-kit result", async () => {
    const result = { $kind: "Transaction", Transaction: { digest: "D1", status: { success: true, error: null } } };
    await expect(signAndExecute(signer(result), tx())).resolves.toBe("D1");
  });

  it("accepts a plain { digest } result", async () => {
    await expect(signAndExecute(signer({ digest: "D2" }), tx())).resolves.toBe("D2");
  });

  it("accepts a dapp-kit success whose wallet sent no digest", async () => {
    const result = { $kind: "Transaction", Transaction: { status: { success: true, error: null } } };
    await expect(signAndExecute(signer(result), tx())).resolves.toBe("");
  });

  it.each([
    ["nothing", undefined],
    ["an empty object", {}],
    ["a dapp-kit result with no status", { $kind: "Transaction", Transaction: {} }],
    ["an empty digest", { digest: "" }],
  ])("counts %s as unconfirmed", async (_label, result) => {
    const sent = signAndExecute(signer(result), tx());
    await expect(sent).rejects.toBeInstanceOf(TxError);
    await expect(sent).rejects.toThrow(UNCONFIRMED_TEXT);
  });

  it("reports a FailedTransaction result as a chain failure", async () => {
    const result = {
      $kind: "FailedTransaction",
      FailedTransaction: {
        digest: "D3",
        status: {
          success: false,
          error: {
            $kind: "MoveAbort",
            message: `MoveAbort in 1st command, abort code: 1, in '0x1234::claim::take' (instruction 10)`,
            MoveAbort: { abortCode: "1", location: { module: "claim", functionName: "take" } },
          },
        },
      },
    };
    await expect(signAndExecute(signer(result), tx())).rejects.toMatchObject({
      kind: "chain",
      message: `The transaction failed on chain. ${WHOLE_UNITS_TEXT}`,
    });
  });

  it("waits as long as the player takes in the approval window", async () => {
    vi.useFakeTimers();
    const slow: DAppKitSigner = {
      signAndExecuteTransaction: () =>
        new Promise((resolve) => setTimeout(() => resolve({ digest: "LATE" }), 30 * 60_000)),
    };
    const sent = signAndExecute(slow, tx());
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await expect(sent).resolves.toBe("LATE");
  });

  it("passes a wallet rejection through unchanged", async () => {
    const declined = new Error(JSON.stringify({ code: 4001, message: "User rejected the request" }));
    const failing: DAppKitSigner = { signAndExecuteTransaction: async () => Promise.reject(declined) };
    await expect(signAndExecute(failing, tx())).rejects.toBe(declined);
  });

  it("prefers signAndExecute and keeps the wallet bound", async () => {
    const wallet = {
      digest: "BOUND",
      async signAndExecute(this: { digest: string }) {
        return { digest: this.digest };
      },
    };
    await expect(signAndExecute(wallet, tx())).resolves.toBe("BOUND");
  });
});
