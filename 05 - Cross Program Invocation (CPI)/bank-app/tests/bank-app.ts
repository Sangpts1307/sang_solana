import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankApp } from "../target/types/bank_app";
import { StakingApp } from "../target/types/staking_app";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo 
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("bank-app - Master Test (CPI & Staking Rewards)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const bankProgram = anchor.workspace.BankApp as Program<BankApp>;
  const stakingProgram = anchor.workspace.StakingApp as Program<StakingApp>;

  const admin = provider.wallet as anchor.Wallet;
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  
  let mint: PublicKey;
  let bankVaultPDA: PublicKey;
  let bankInfoPDA: PublicKey;
  let stakingVaultPDA: PublicKey;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  before(async () => {
    // 1. Chuyển SOL từ ví chính sang 2 User để làm phí giao dịch (Tăng lên 2 SOL cho thoải mái)
    const transferAmount = 2 * LAMPORTS_PER_SOL;
    
    const tx1 = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: user1.publicKey,
        lamports: transferAmount,
      })
    );
    await provider.sendAndConfirm(tx1);

    const tx2 = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: user2.publicKey,
        lamports: transferAmount,
      })
    );
    await provider.sendAndConfirm(tx2);

    console.log("Đã cấp SOL cho 2 ví test thành công!");

    // Tìm PDA
    [bankInfoPDA] = PublicKey.findProgramAddressSync([Buffer.from("BANK_INFO_SEED")], bankProgram.programId);
    [bankVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("BANK_VAULT_SEED")], bankProgram.programId);
    [stakingVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("STAKING_VAULT")], stakingProgram.programId);

    // Tạo Mint
    mint = await createMint(provider.connection, user1, user1.publicKey, null, 9);

    // QUAN TRỌNG: Tạo trước ATA cho bank_vault để tránh lỗi AccountNotInitialized
    await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, bankVaultPDA, true);
  });

  it("1. Khởi tạo và Nạp SOL (Kiểm tra Shares)", async () => {
    console.log("--- BƯỚC 1: KHỞI TẠO NGÂN HÀNG ---");
    try {
        await bankProgram.methods.initialize().accounts({
            bankInfo: bankInfoPDA,
            bankVault: bankVaultPDA,
            authority: admin.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();
        console.log("Initialize signature: thành công");
    } catch (e) {}

    console.log("User 1 nạp 1 SOL...");
    await bankProgram.methods.deposit(new anchor.BN(1 * LAMPORTS_PER_SOL)).accounts({
        user: user1.publicKey,
    }).signers([user1]).rpc();

    console.log("User 2 nạp 1 SOL...");
    await bankProgram.methods.deposit(new anchor.BN(1 * LAMPORTS_PER_SOL)).accounts({
        user: user2.publicKey,
    }).signers([user2]).rpc();

    console.log("🏦 --- BANK OVERVIEW (SOL) ---");
    const vaultBalance = await provider.connection.getBalance(bankVaultPDA);
    console.log("Total SOL in Vault: ", vaultBalance / LAMPORTS_PER_SOL, "SOL");
  });

  it("2. Nạp Token và Đầu tư (CPI - Bài tập Chương 05)", async () => {
    console.log("\n--- BƯỚC 2: NẠP TOKEN & ĐẦU TƯ (CPI) ---");

    const user1ATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, user1.publicKey);
    await mintTo(provider.connection, user1, mint, user1ATA.address, user1, 1000000000); // 1000 Token

    console.log("User 1 nạp 1000 Token vào Bank...");
    await bankProgram.methods.depositToken(new anchor.BN(1000000000)).accounts({
      tokenMint: mint,
      user: user1.publicKey,
    }).signers([user1]).rpc();

    console.log("Admin thực hiện mang Token đi đầu tư (CPI sang Staking App)...");
    const [stakingInfoPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("USER_INFO_TOKEN"), bankVaultPDA.toBuffer(), mint.toBuffer()],
      stakingProgram.programId
    );
    const bankATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, bankVaultPDA, true);
    const stakingATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, stakingVaultPDA, true);

    const txInvest = await bankProgram.methods.investToken(new anchor.BN(1000000000), true).accounts({
      tokenMint: mint,
      bankVault: bankVaultPDA,
      bankAta: bankATA.address,
      stakingVault: stakingVaultPDA,
      stakingAta: stakingATA.address,
      stakingInfo: stakingInfoPDA,
      stakingProgram: stakingProgram.programId,
      authority: admin.publicKey,
    }).rpc();
    console.log("Invest CPI Signature: ", txInvest);

    console.log("⏳ Đang chờ 30 giây để lãi suất nhảy (APR 5000%)...");
    await sleep(30000);

    console.log("User 1 yêu cầu rút tiền đầu tư (Unstaked qua CPI)...");
    const txUnstake = await bankProgram.methods.investToken(new anchor.BN(1000000000), false).accounts({
      tokenMint: mint,
      bankVault: bankVaultPDA,
      bankAta: bankATA.address,
      stakingVault: stakingVaultPDA,
      stakingAta: stakingATA.address,
      stakingInfo: stakingInfoPDA,
      stakingProgram: stakingProgram.programId,
      authority: admin.publicKey,
    }).rpc();
    console.log("Unstake CPI Signature: ", txUnstake);

    console.log("\n✅ HOÀN TẤT BÀI TẬP CHƯƠNG 05!");
    console.log("Hãy kiểm tra mã Signature Unstake trên Solscan để thấy dòng Log tính lãi suất.");
  });
});
