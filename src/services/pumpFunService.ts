import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// Thông tin từ repository (ví dụ)
const PUMP_FUN_PROGRAM_ID = new PublicKey("YourProgramIdHere");

// Tạo lệnh mua token
export async function createPumpBuyInstruction(
  buyer: PublicKey,
  amount: number,
  programAccount: PublicKey,
  tokenMint: PublicKey
): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: programAccount, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(new Uint8Array([0, ...Array.from(toBuffer(amount))])), // '0' là mã lệnh mua
  });
}

function toBuffer(num: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(num));
  return buffer;
}
