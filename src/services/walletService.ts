import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const HELIUS_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=3d702a02-5adb-4985-a20b-728039d75ff7";
export const connection = new Connection(HELIUS_RPC_URL, "confirmed");

const walletsFile = path.resolve(__dirname, "../../wallets.json");

export async function checkWalletBalances() {
  const wallets = loadWallets();

  if (wallets.length === 0) {
    console.log("No wallets found. Please create wallets first.");
    return;
  }

  console.log("Checking balances of child wallets...");
  for (const wallet of wallets) {
    const balance = await getBalance(wallet.publicKey);
    console.log(
      `Wallet: ${wallet.publicKey.toBase58()}, Balance: ${balance} SOL`
    );
  }
}

/**
 * Load wallets from file
 * @returns
 */
export function loadWallets(): Keypair[] {
  if (fs.existsSync(walletsFile)) {
    const data = fs.readFileSync(walletsFile, "utf-8");
    return JSON.parse(data).map((key: number[]) =>
      Keypair.fromSecretKey(Uint8Array.from(key))
    );
  }
  return [];
}

/**
 * Save list wallets to file for checking
 * @param wallets
 */
export function saveWallets(wallets: Keypair[]) {
  const data = wallets.map((wallet) => Array.from(wallet.secretKey));
  fs.writeFileSync(walletsFile, JSON.stringify(data, null, 2));
}

/**
 * Create 10 wallets children
 * @returns
 */
export function createWallets(): Keypair[] {
  const wallets = loadWallets();
  if (wallets.length === 0) {
    console.log("Creating 10 new wallets...");
    for (let i = 0; i < 10; i++) {
      wallets.push(Keypair.generate());
    }
    saveWallets(wallets);
    console.log("Wallets created and saved!");
  } else {
    console.log("Wallets already exist!");
  }
  return wallets;
}

/**
 * Check balance of wallet
 * @param walletAddress
 * @returns
 */
export async function getBalance(walletAddress: PublicKey): Promise<number> {
  console.log("Using connection RPC:", connection.rpcEndpoint);
  const balance = await connection.getBalance(walletAddress);
  // console.log("balance", balance);
  console.log(
    `Balance of ${walletAddress.toBase58()}: ${balance / 1_000_000_000} SOL`
  );
  return balance / 1_000_000_000;
}

export async function getSolBalance(
  walletAddress: string,
  connection: Connection
): Promise<number> {
  try {
    const publicKey = new PublicKey(walletAddress);

    const lamports = await connection.getBalance(publicKey);

    const solBalance = lamports / LAMPORTS_PER_SOL;

    return solBalance;
  } catch (error) {
    console.error(`Error fetching balance for wallet ${walletAddress}:`, error);
    throw error;
  }
}
