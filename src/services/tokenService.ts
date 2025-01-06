import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { connection } from "./walletService";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import { getCoinData } from "./api";
import { TransactionMode } from "../types/types";
import {
  bufferFromUInt64,
  createTransaction,
  getKeyPairFromPrivateKey,
  sendAndConfirmTransactionWrapper,
} from "../helper/utils";
import {
  ASSOC_TOKEN_ACC_PROG,
  FEE_RECIPIENT,
  GLOBAL,
  PUMP_FUN_ACCOUNT,
  PUMP_FUN_PROGRAM,
  RENT,
  SYSTEM_PROGRAM_ID,
} from "../constants/constants";
import bs58 from "bs58";

// Program ID for the token transaction program (Testnet/Devnet)
// const programId = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Token Mint for the specific token on Testnet
const tokenMint = new PublicKey("mntbSKLzJ3N75doUxS5kmeoPqRHqHFxn24noNPzs9NW");

const pumpProgramId = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

/**
 * Transfer SOL từ ví cha sang ví con.
 * @param parentWallet - Ví cha (Keypair)
 * @param childWallet - Ví con (PublicKey)
 * @param amountSol - Số lượng SOL cần chuyển (vd: 0.0001)
 */
export async function transferSol(
  parentWallet: Keypair,
  childWallet: PublicKey,
  amountSol: number,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<void> {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      console.log(
        `Attempt ${retries + 1}/${maxRetries}: Transferring ${amountSol} SOL...`
      );

      const lamports = amountSol * LAMPORTS_PER_SOL; // Chuyển đổi từ SOL sang Lamports

      // Kiểm tra số dư ví cha
      const parentBalance = await connection.getBalance(parentWallet.publicKey);
      console.log(
        `Parent wallet balance: ${(parentBalance / LAMPORTS_PER_SOL).toFixed(
          6
        )} SOL`
      );

      if (parentBalance < lamports) {
        console.error(
          `Insufficient SOL in parent wallet. Required: ${amountSol} SOL, Available: ${
            parentBalance / LAMPORTS_PER_SOL
          } SOL`
        );
        return;
      }

      // Tạo giao dịch chuyển SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: parentWallet.publicKey,
          toPubkey: childWallet,
          lamports,
        })
      );

      // Gửi giao dịch
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [parentWallet]
      );
      console.log(
        `Successfully transferred ${amountSol} SOL to ${childWallet.toBase58()}. Signature: ${signature}`
      );
      return; // Kết thúc nếu thành công
    } catch (error: any) {
      retries++;
      console.error(
        `Error transferring SOL on attempt ${retries}/${maxRetries}:`,
        error.message
      );

      // Nếu đạt số lần retries tối đa, ném lỗi
      if (retries >= maxRetries) {
        console.error("Max retries reached. Transfer failed.");
        throw error;
      }

      // Đợi trước khi thử lại
      console.log(`Retrying after ${delayMs}ms...`);
      await delay(delayMs);
    }
  }
}

export async function getTokenBalance(
  wallet: PublicKey,
  mintAddress: string
): Promise<number> {
  const mintPublicKey = new PublicKey(mintAddress);
  const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, wallet);
  const accountInfo = await connection.getParsedAccountInfo(tokenAccount);

  if (accountInfo?.value) {
    const parsedData = accountInfo.value.data as ParsedAccountData;
    const amount = parsedData.parsed.info.tokenAmount.amount;
    return parseFloat(amount);
  }
  return 0; // Nếu không có số dư, trả về 0
}

export async function pumpFunSell(
  transactionMode: TransactionMode,
  payerPrivateKey: string,
  mintStr: string,
  tokenBalance: number,
  priorityFeeInSol: number = 0,
  slippageDecimal: number = 0.25
) {
  try {
    if (tokenBalance <= 0) {
      console.log(
        `Skipping token sell operation: Token balance is ${tokenBalance}.`
      );
      return; // Kết thúc sớm nếu tokenBalance <= 0
    }

    console.log(`Starting token sell operation...`);

    const coinData = await getCoinData(mintStr);
    if (!coinData) {
      throw new Error("Failed to retrieve coin data");
    }

    const payer = await getKeyPairFromPrivateKey(payerPrivateKey);
    const owner = payer.publicKey;
    const mint = new PublicKey(mintStr);

    const tokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      false
    );

    const tokenAccountInfo = await connection.getAccountInfo(
      tokenAccountAddress
    );

    if (!tokenAccountInfo) {
      throw new Error(
        `Token account ${tokenAccountAddress.toBase58()} does not exist`
      );
    }

    const minSolOutput = Math.floor(
      (tokenBalance *
        (1 - slippageDecimal) *
        coinData["virtual_sol_reserves"]) /
        coinData["virtual_token_reserves"]
    );

    const keys = [
      { pubkey: GLOBAL, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(coinData["bonding_curve"]),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(coinData["associated_bonding_curve"]),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: tokenAccountAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOC_TOKEN_ACC_PROG, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_ACCOUNT, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
    ];

    const data = Buffer.concat([
      bufferFromUInt64("12502976635542562355"),
      bufferFromUInt64(tokenBalance),
      bufferFromUInt64(minSolOutput),
    ]);

    const instruction = new TransactionInstruction({
      keys: keys,
      programId: PUMP_FUN_PROGRAM,
      data: data,
    });

    const transaction = await createTransaction(
      connection,
      [instruction],
      payer.publicKey,
      priorityFeeInSol
    );

    if (transactionMode === TransactionMode.Execution) {
      const signature = await sendAndConfirmTransactionWrapper(
        connection,
        transaction,
        [payer]
      );
      console.log(`Sell transaction confirmed. Signature: ${signature}`);
    } else {
      const simulatedResult = await connection.simulateTransaction(transaction);
      console.log("Simulation Result:", simulatedResult);
    }
  } catch (error: any) {
    console.error(`Error in pumpFunSell: ${error.message}`);
    throw error; // Ném lỗi ra ngoài để `retryFunction` xử lý
  }
}

export async function pumpFunBuy(
  transactionMode: TransactionMode,
  payerPrivateKey: string,
  mintStr: string,
  solIn: number,
  priorityFeeInSol: number = 0,
  slippageDecimal: number = 0.25
): Promise<void> {
  try {
    console.log(`Attempting to buy tokens...`);

    const coinData = await getCoinData(mintStr);
    if (!coinData) {
      throw new Error("Failed to retrieve coin data");
    }

    const payer = await getKeyPairFromPrivateKey(payerPrivateKey);
    const owner = payer.publicKey;
    const mint = new PublicKey(mintStr);

    const tokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      false
    );

    const tokenAccountInfo = await connection.getAccountInfo(
      tokenAccountAddress
    );

    if (!tokenAccountInfo) {
      throw new Error(
        `Token account ${tokenAccountAddress.toBase58()} does not exist`
      );
    }

    const solInLamports = solIn * LAMPORTS_PER_SOL;
    const tokenOut = Math.floor(
      (solInLamports * coinData["virtual_token_reserves"]) /
        coinData["virtual_sol_reserves"]
    );

    const solInWithSlippage = solIn * (1 + slippageDecimal);
    const maxSolCost = Math.floor(solInWithSlippage * LAMPORTS_PER_SOL);

    const keys = [
      { pubkey: GLOBAL, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(coinData["bonding_curve"]),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(coinData["associated_bonding_curve"]),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: tokenAccountAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_ACCOUNT, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
    ];

    const data = Buffer.concat([
      bufferFromUInt64("16927863322537952870"),
      bufferFromUInt64(tokenOut),
      bufferFromUInt64(maxSolCost),
    ]);

    const instruction = new TransactionInstruction({
      keys,
      programId: PUMP_FUN_PROGRAM,
      data,
    });

    const transaction = await createTransaction(
      connection,
      [instruction],
      payer.publicKey,
      priorityFeeInSol
    );

    if (transactionMode === TransactionMode.Execution) {
      const signature = await sendAndConfirmTransactionWrapper(
        connection,
        transaction,
        [payer]
      );
      console.log(`Buy transaction confirmed. Signature: ${signature}`);
    } else {
      const simulatedResult = await connection.simulateTransaction(transaction);
      console.log("Simulation Result:", simulatedResult);
    }
  } catch (error: any) {
    console.error(`Error in pumpFunBuy: ${error.message}`);
    throw error; // Ném lỗi ra ngoài để `retryFunction` xử lý
  }
}

export async function transferToken(
  parentWallet: Keypair,
  childWallet: PublicKey,
  mintAddress: string,
  amount: number
) {
  console.log(
    `Attempting to transfer ${amount} tokens to wallet: ${childWallet.toBase58()}`
  );

  const mintPublicKey = new PublicKey(mintAddress);

  const parentTokenAccount = await getAssociatedTokenAddress(
    mintPublicKey,
    parentWallet.publicKey
  );

  const childTokenAccount = await getAssociatedTokenAddress(
    mintPublicKey,
    childWallet
  );

  const transaction = new Transaction();

  const childTokenAccountInfo = await connection.getAccountInfo(
    childTokenAccount
  );
  if (!childTokenAccountInfo) {
    console.log("Child token account does not exist. Creating it...");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        parentWallet.publicKey,
        childTokenAccount,
        childWallet,
        mintPublicKey
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      parentTokenAccount,
      childTokenAccount,
      parentWallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    parentWallet,
  ]);

  console.log(
    `Successfully transferred ${amount} tokens to ${childWallet.toBase58()}. Transaction signature: ${signature}`
  );
}

export async function distributeTokensSequentially(
  parentWallet: Keypair,
  wallets: PublicKey[],
  mintAddress: PublicKey,
  amount: number
): Promise<void> {
  console.log("Starting token distribution sequentially...");

  const parentTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    parentWallet,
    mintAddress,
    parentWallet.publicKey
  );

  console.log(`Parent token account: ${parentTokenAccount.address.toBase58()}`);

  for (const [index, wallet] of wallets.entries()) {
    try {
      console.log(
        `Transferring ${amount} tokens to wallet ${index + 1}/${
          wallets.length
        }: ${wallet.toBase58()}`
      );

      const childTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        parentWallet,
        mintAddress,
        wallet
      );

      console.log(
        `Child token account: ${childTokenAccount.address.toBase58()}`
      );

      const transaction = new Transaction().add(
        createTransferInstruction(
          parentTokenAccount.address,
          childTokenAccount.address,
          parentWallet.publicKey,
          amount
        )
      );

      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [parentWallet]
      );

      console.log(
        `Successfully transferred ${amount} tokens to wallet ${wallet.toBase58()}. Signature: ${signature}`
      );
    } catch (error: any) {
      console.error(
        `Error transferring tokens to wallet ${wallet.toBase58()}: ${
          error.message
        }`
      );
    }
  }

  console.log("Token distribution process completed.");
}

export async function retryFunction<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<T> {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempts++;
      console.error(
        `Error: ${error.message}. Attempt ${attempts}/${maxRetries}.`
      );
      if (attempts >= maxRetries) {
        throw new Error(
          `Function failed after ${maxRetries} attempts. Last error: ${error.message}`
        );
      }
      console.log(`Retrying after ${delayMs}ms...`);
      await delay(delayMs);
    }
  }
  throw new Error("Unexpected error in retryFunction");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
