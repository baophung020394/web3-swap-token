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
  ComputeBudgetProgram,
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

// Token Mint for the specific token on Testnet
const tokenMint = new PublicKey("mntbSKLzJ3N75doUxS5kmeoPqRHqHFxn24noNPzs9NW");

const pumpProgramId = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

/**
 * Transfer SOL from parent wallet to child wallet.
 * @param parentWallet - Parent wallet (Keypair)
 * @param childWallet - Child wallet (PublicKey)
 * @param amountSol - Amount of SOL to transfer (e.g., 0.0001)
 */
export async function transferSol(
  parentWallet: Keypair,
  childWallet: PublicKey,
  amountSol: number,
  transaction: Transaction // Nhận transaction từ bên ngoài
): Promise<void> {
  try {
    console.log(
      `Preparing to transfer ${amountSol} SOL from ${parentWallet.publicKey.toBase58()} to ${childWallet.toBase58()}`
    );

    const lamports = amountSol * LAMPORTS_PER_SOL; // Convert SOL to Lamports

    // Check parent wallet balance
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

    // Add transfer instruction to the shared transaction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: parentWallet.publicKey,
        toPubkey: childWallet,
        lamports,
      })
    );

    console.log(`Transfer instruction added to transaction.`);
  } catch (error: any) {
    console.error(`Error adding transfer instruction: ${error.message}`);
    throw error;
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
  return 0; // Return 0 if no balance
}

/**
 * Buy tokens on pump.fun
 * @param transactionMode
 * @param payerPrivateKey
 * @param mintStr
 * @param solIn
 * @param priorityFeeInSol
 * @param slippageDecimal
 */
export async function pumpFunBuy(
  //   transaction: Transaction,
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

    const transactions = await createTransaction(
      connection,
      [instruction],
      payer.publicKey,
      priorityFeeInSol
    );

    if (transactionMode === TransactionMode.Execution) {
      const signature = await sendAndConfirmTransactionWrapper(
        connection,
        transactions,
        [payer]
      );
      console.log(`Buy transaction confirmed. Signature: ${signature}`);
    } else {
      const simulatedResult = await connection.simulateTransaction(
        transactions
      );
      console.log("Simulation Result:", simulatedResult);
    }
  } catch (error: any) {
    console.error(`Error in pumpFunBuy: ${error.message}`);
    throw error; // Ném lỗi ra ngoài để `retryFunction` xử lý
  }
}

/**
 * Transfer tokens from parent wallet to child wallet.
 */

export async function transferToken(
  transaction: Transaction,
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
  transaction: Transaction, // Pass the transaction object
  parentWallet: Keypair,
  wallets: PublicKey[],
  mintAddress: PublicKey,
  amount: number
): Promise<void> {
  console.log("Adding token distribution operations to the transaction...");

  // Get or create parent token account
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
        `Preparing transfer of ${amount} tokens to wallet ${index + 1}/${
          wallets.length
        }: ${wallet.toBase58()}`
      );

      // Get or create the child token account
      const childTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        parentWallet,
        mintAddress,
        wallet
      );

      console.log(
        `Child token account: ${childTokenAccount.address.toBase58()}`
      );

      // Add transfer instruction to the transaction
      transaction.add(
        createTransferInstruction(
          parentTokenAccount.address,
          childTokenAccount.address,
          parentWallet.publicKey,
          amount
        )
      );
    } catch (error: any) {
      console.error(
        `Error preparing transfer for wallet ${wallet.toBase58()}: ${
          error.message
        }`
      );
    }
  }
}

/**
 * Options function for transfer sol
 * @param connection
 * @param parentWallet
 * @param childWallets
 * @param amountSol
 */
export async function transferSolToParent(
  connection: Connection,
  parentWallet: PublicKey,
  childWallets: PublicKey[],
  amountSol: number,
  transaction: Transaction
): Promise<void> {
  const lamports = amountSol * LAMPORTS_PER_SOL;
  const transactionFee = 0.000005 * LAMPORTS_PER_SOL; // 0.000005 SOL as fee
  const rentExemptMinimum = 0.002039 * LAMPORTS_PER_SOL; // Example rent-exempt minimum

  for (const childWallet of childWallets) {
    const childBalance = await connection.getBalance(childWallet);

    console.log(
      `Child wallet ${childWallet.toBase58()} balance: ${
        childBalance / LAMPORTS_PER_SOL
      } SOL`
    );

    if (childBalance < lamports + transactionFee + rentExemptMinimum) {
      console.log(
        `Skipping transfer for wallet ${childWallet.toBase58()}: Insufficient funds.`
      );
      continue;
    }

    try {
      console.log(
        `Adding transfer of ${amountSol} SOL from wallet ${childWallet.toBase58()} to parent wallet ${parentWallet.toBase58()}.`
      );

      // Add transfer instruction to the shared transaction
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: childWallet,
          toPubkey: parentWallet,
          lamports,
        })
      );
    } catch (error: any) {
      console.error(
        `Error adding transfer instruction for wallet ${childWallet.toBase58()}: ${
          error.message
        }`
      );
    }
  }

  if (transaction.instructions.length > 0) {
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        []
      );
      console.log(`Successfully executed transaction. Signature: ${signature}`);
    } catch (error: any) {
      console.error(`Error executing transaction: ${error.message}`);
    }
  } else {
    console.log("No valid instructions to send. Transaction skipped.");
  }
}

/**
 * SWAP TOKENS to SOL
 */

export async function pumpFunSell(
  transactionMode: TransactionMode,
  payerPrivateKey: string,
  mintStr: string,
  tokenBalance: number,
  priorityFeeInSol: number = 0,
  slippageDecimal: number = 0.25
) {
  try {
    const coinData = await getCoinData(mintStr);
    if (!coinData) {
      console.error("Failed to retrieve coin data...");
      return;
    }

    const payer = await getKeyPairFromPrivateKey(payerPrivateKey);
    const owner = payer.publicKey;
    const mint = new PublicKey(mintStr);
    const txBuilder = new Transaction();

    const tokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      false
    );

    const tokenAccountInfo = await connection.getAccountInfo(
      tokenAccountAddress
    );

    let tokenAccount: PublicKey;
    if (!tokenAccountInfo) {
      txBuilder.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          tokenAccountAddress,
          payer.publicKey,
          mint
        )
      );
      tokenAccount = tokenAccountAddress;
    } else {
      tokenAccount = tokenAccountAddress;
    }

    const minSolOutput = Math.floor(
      (tokenBalance! *
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
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
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
    txBuilder.add(instruction);

    const transaction = await createTransaction(
      connection,
      txBuilder.instructions,
      payer.publicKey,
      priorityFeeInSol
    );

    if (transactionMode == TransactionMode.Execution) {
      const signature = await sendAndConfirmTransactionWrapper(
        connection,
        transaction,
        [payer]
      );
      console.log("Sell transaction confirmed:", signature);
    } else if (transactionMode == TransactionMode.Simulation) {
      const simulatedResult = await connection.simulateTransaction(transaction);
      console.log(simulatedResult);
    }
  } catch (error) {
    console.log(error);
  }
}

export async function pumpFunSellForMultipleWallets(
  wallets: Keypair[],
  transactionMode: TransactionMode,
  mintStr: string,
  slippageDecimal: number = 0.25,
  priorityFeeInSol: number = 0
): Promise<void> {
  console.log("Starting pumpFunSell for multiple wallets...");

  for (const [index, wallet] of wallets.entries()) {
    try {
      const secretKey = Uint8Array.from(wallets[0].secretKey);
      const walletChild = Keypair.fromSecretKey(secretKey);
      const privateKeyChild = bs58.encode(walletChild.secretKey);
      const tokenChildSwap = await getTokenBalance(
        wallets[0].publicKey,
        mintStr
      );

      // Skip wallets with zero balance
      if (tokenChildSwap <= 0) {
        console.log(
          `Skipping wallet ${wallet.publicKey.toBase58()} with zero token balance.`
        );
        continue;
      }

      console.log(
        `Processing wallet ${index + 1}/${
          wallets.length
        }: ${wallet.publicKey.toBase58()} with balance ${tokenChildSwap}`
      );

      // Execute pumpFunSell for the current wallet
      await pumpFunSell(
        transactionMode,
        privateKeyChild,
        mintStr,
        tokenChildSwap,
        priorityFeeInSol,
        slippageDecimal
      );
    } catch (error: any) {
      console.error(
        `Error processing wallet ${wallet.publicKey.toBase58()}: ${
          error.message
        }. Skipping to next wallet.`
      );
    }
  }

  console.log("Completed pumpFunSell for all wallets.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
