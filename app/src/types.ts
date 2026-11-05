export type TxStatus =
  | "idle"
  | "building"
  | "awaiting-signature"
  | "submitted"
  | "done"
  | "failed";

export interface StatusState {
  state: TxStatus;
  message: string;
  digest?: string;
}

export interface ResolvedCharacter {
  id: string;
  name?: string;
  ownerCapId?: string;
}

export interface SmartObjectState {
  assembly?: unknown;
  character?: unknown;
  loading?: boolean;
  error?: unknown;
  refetch?: () => Promise<unknown>;
}

/** Wallets differ in what they resolve with; txOutcome.executedDigest reads it. */
export interface DAppKitSigner {
  signAndExecute?: (input: { transaction: unknown }) => Promise<unknown>;
  signAndExecuteTransaction?: (input: { transaction: unknown }) => Promise<unknown>;
}
