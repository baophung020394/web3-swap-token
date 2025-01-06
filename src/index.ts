import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as bs58 from "bs58";
import * as dotenv from "dotenv";
import { getCoinData } from "./services/api";
import {
  distributeTokensSequentially,
  getTokenBalance,
  pumpFunBuy,
  pumpFunSell,
  retryFunction,
  transferSol,
  transferToken,
} from "./services/tokenService";
import {
  connection,
  createWallets,
  getBalance,
  getSolBalance,
} from "./services/walletService";
import { TransactionMode } from "./types/types";
import { getKeyPairFromPrivateKey } from "./helper/utils";
import axios from "axios";

dotenv.config();

async function main() {
  console.log("Starting Solana transaction operations...");

  const privateKeyBase58 = `${process.env.PRIVATE_KEY}`;

  // Decode từ Base58 sang Uint8Array
  const privateKeyUint8Array = bs58.decode(privateKeyBase58);

  // Tạo Keypair từ private key
  const parentWallet = Keypair.fromSecretKey(privateKeyUint8Array);

  const wallets = createWallets();

  const txMode = TransactionMode.Execution;
  const solIn = 0.001;
  const priorityFeeInSol = 0.0001;
  const slippageDecimal = 0.25;
  const mintStr = "98NrBJsuU14gDjrXaoSmcUWkJGMpX2SCHXjsZrocpump";

  console.log("=== BEFORE OPERATIONS ===");
  console.log("=== parentWallet ===");
  const tokenBalenceParent = await getTokenBalance(
    parentWallet.publicKey,
    mintStr
  );
  const solBalanceParent = await getSolBalance(
    parentWallet.publicKey.toBase58(),
    connection
  );
  console.log("Token parent:", tokenBalenceParent);
  console.log("Sol parent:", solBalanceParent.toFixed(6));

  console.log("=== wallets ===");
  for (let i = 0; i < wallets.length; i++) {
    const tokenBalence = await getTokenBalance(wallets[i].publicKey, mintStr);
    const balanceChildWallet = await getSolBalance(
      wallets[i].publicKey.toBase58(),
      connection
    );
    console.log(`Token child wallet ${wallets[i].publicKey}:`, tokenBalence);
    console.log(
      `Sol child wallet ${wallets[i].publicKey}:`,
      balanceChildWallet.toFixed(6)
    );
  }

  /**
   * Step 1: Buy token on pump.fun
   */
  console.log("=== START BUY TOKEN ===");
  await retryFunction(
    () =>
      pumpFunBuy(
        txMode,
        privateKeyBase58,
        mintStr,
        solIn,
        priorityFeeInSol,
        slippageDecimal
      ),
    3,
    2000
  );

  console.log("=== BUY SUCCESS ===");

  console.log("Token parent:", tokenBalenceParent);
  console.log("Sol parent:", solBalanceParent.toFixed(6));

  console.log("=== START TRANSFER TOKEN TO CHILD WALLET ===");

  const tokenChild = Math.floor(tokenBalenceParent / 10);

  // await retryFunction(
  //   async () =>
  //     await distributeTokensSequentially(
  //       parentWallet,
  //       wallets.map((w) => w.publicKey),
  //       new PublicKey(mintStr),
  //       tokenChild
  //     ),
  //   3, // Số lần retry tối đa
  //   2000 // Thời gian chờ giữa mỗi lần retry (ms)
  // );

  console.log("=== END TRANSFER TOKEN TO CHILD WALLET SUCCESS ===");

  console.log("=== START TRANSFER SOL TO CHILD WALLET ===");
  // for (let i = 0; i < wallets.length; i++) {
  //   await transferSol(parentWallet, wallets[i].publicKey, 0.001);
  // }
  console.log("=== END TRANSFER SOL TO CHILD WALLET SUCCESS ===");

  /**
   * Step 4: Swap tokens to SOL for child wallets
   */

  // for (let i = 0; i < wallets.length; i++) {
  //   const secretKey = Uint8Array.from(wallets[i].secretKey);
  //   const walletChild = Keypair.fromSecretKey(secretKey);
  //   const privateKeyChild = bs58.encode(walletChild.secretKey);
  //   const tokenChildSwap = await getTokenBalance(wallets[i].publicKey, mintStr);

  //   await retryFunction(
  //     () =>
  //       pumpFunSell(
  //         txMode,
  //         privateKeyChild,
  //         mintStr,
  //         tokenChildSwap,
  //         priorityFeeInSol,
  //         slippageDecimal
  //       ),
  //     3,
  //     2000
  //   );
  // }

  console.log("=== AFTER OPERATIONS ===");
  console.log("=== parentWallet ===");
  console.log("Token parent:", tokenBalenceParent);
  console.log("Sol parent:", solBalanceParent.toFixed(6));

  console.log("=== wallets ===");
  for (let i = 0; i < wallets.length; i++) {
    const tokenBalence = await getTokenBalance(wallets[i].publicKey, mintStr);
    const balanceChildWallet = await getSolBalance(
      wallets[i].publicKey.toBase58(),
      connection
    );
    console.log(`Token child wallet ${wallets[i].publicKey}:`, tokenBalence);
    console.log(
      `Sol child wallet ${wallets[i].publicKey}:`,
      balanceChildWallet.toFixed(6)
    );
  }

  console.log("All operations completed!");
}

main().catch((error) => {
  // console.error(error);
  console.error("======================== ERROR LOG ========================");
  console.error(`Timestamp: ${new Date().toISOString()}`);
  console.error(`Error Message: ${error.message}`);
  console.error(`Stack Trace:\n${error.stack}`);
  console.error("==========================================================");
});
