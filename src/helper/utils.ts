import { ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

function isValidBase58(str: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(str);
}

export async function getKeyPairFromPrivateKey(key: string) {
    return Keypair.fromSecretKey(
        new Uint8Array(bs58.decode(key))
    );
}


// export async function getKeyPairFromPrivateKey(key: string) {
//   let decodedKey: Uint8Array;

//   // Kiểm tra nếu chuỗi là Base58
//   if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(key)) {
//     console.log("Detected Base58 private key format.");
//     decodedKey = bs58.decode(key);
//   }
//   // Kiểm tra nếu chuỗi là Base64
//   else if (/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
//     console.log("Detected Base64 private key format.");
//     decodedKey = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
//   }
//   // Nếu không khớp định dạng
//   else {
//     throw new Error(
//       "Invalid private key format. Only Base58 or Base64 is supported."
//     );
//   }

//   // Kiểm tra chiều dài của secret key
//   if (decodedKey.length !== 64) {
//     throw new Error(
//       `Invalid private key length. Expected 64 bytes, got ${decodedKey.length}.`
//     );
//   }

//   return Keypair.fromSecretKey(decodedKey);
// }

export async function createTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  priorityFeeInSol: number = 0
): Promise<Transaction> {
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1000000,
  });

  const transaction = new Transaction().add(modifyComputeUnits);

  if (priorityFeeInSol > 0) {
    const microLamports = priorityFeeInSol * 1_000_000_000; // convert SOL to microLamports
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports,
    });
    transaction.add(addPriorityFee);
  }

  transaction.add(...instructions);

  transaction.feePayer = payer;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  return transaction;
}

export async function sendAndConfirmTransactionWrapper(
  connection: Connection,
  transaction: Transaction,
  signers: any[]
) {
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      signers,
      { skipPreflight: true, preflightCommitment: "confirmed" }
    );
    console.log("Transaction confirmed with signature:", signature);
    return signature;
  } catch (error) {
    console.error("Error sending transaction:", error);
    return null;
  }
}

export function bufferFromUInt64(value: number | string) {
  let buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}
