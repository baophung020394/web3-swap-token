import { PublicKey } from "@solana/web3.js";

export function logError(
  functionName: string,
  wallet: PublicKey | undefined,
  retryCount: number,
  error: Error
) {
  console.error("======================== ERROR LOG ========================");
  console.error(`Timestamp: ${new Date().toISOString()}`);
  console.error(`Function: ${functionName}`);
  if (wallet) {
    console.error(`Wallet: ${wallet.toBase58()}`);
  }
  console.error(`Retry: ${retryCount}`);
  console.error(`Error Message: ${error.message}`);
  console.error(`Stack Trace:\n${error.stack}`);
  console.error("==========================================================");
}
