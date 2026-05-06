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

describe("bank-app - Share-based Vault Test", () => {
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
  let stakingGlobalStatePDA: PublicKey;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  before(async () => {
    // Cấp SOL cho ví test
    for (let user of [user1, user2]) {
        await provider.sendAndConfirm(new anchor.web3.Transaction().add(
            anchor.web3.SystemProgram.transfer({
                fromPubkey: admin.publicKey,
                toPubkey: user.publicKey,
                lamports: 2 * LAMPORTS_PER_SOL,
            })
        ));
    }

    [bankInfoPDA] = PublicKey.findProgramAddressSync([Buffer.from("BANK_INFO_SEED")], bankProgram.programId);
    [bankVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("BANK_VAULT_SEED")], bankProgram.programId);
    [stakingVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("STAKING_VAULT")], stakingProgram.programId);
    [stakingGlobalStatePDA] = PublicKey.findProgramAddressSync([Buffer.from("GLOBAL_STATE")], stakingProgram.programId);

    mint = await createMint(provider.connection, user1, user1.publicKey, null, 9);
    await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, bankVaultPDA, true);

    // Khởi tạo Global State cho Staking App
    try {
        await stakingProgram.methods.initializeGlobal().accounts({
            globalState: stakingGlobalStatePDA,
            payer: admin.publicKey,
        }).rpc();
        console.log("Staking Global State initialized!");
    } catch (e) {}
  });

  it("Kịch bản: Kiểm chứng tỷ giá Share (Người đến trước hưởng lợi hơn)", async () => {
    console.log("\n--- BẮT ĐẦU KỊCH BẢN SHARE-BASED ---");

    // 1. USER 1 NẠP 100 TOKEN VÀO BANK
    const user1ATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, user1.publicKey);
    await mintTo(provider.connection, user1, mint, user1ATA.address, user1, 100 * 1e9);
    await bankProgram.methods.depositToken(new anchor.BN(100 * 1e9)).accounts({ tokenMint: mint, user: user1.publicKey }).signers([user1]).rpc();

    // 2. ADMIN MANG 100 TOKEN ĐI ĐẦU TƯ (Lúc này tỷ giá đang là 1)
    const [stakingInfoPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("USER_INFO_TOKEN"), bankVaultPDA.toBuffer(), mint.toBuffer()],
      stakingProgram.programId
    );
    const bankATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, bankVaultPDA, true);
    const stakingATA = await getOrCreateAssociatedTokenAccount(provider.connection, user1, mint, stakingVaultPDA, true);

    console.log("Admin đầu tư 100 Token đầu tiên (Tỷ giá = 1)...");
    await bankProgram.methods.investToken(new anchor.BN(100 * 1e9), true).accounts({
      tokenMint: mint,
      bankVault: bankVaultPDA,
      bankAta: bankATA.address,
      stakingVault: stakingVaultPDA,
      stakingAta: stakingATA.address,
      stakingInfo: stakingInfoPDA,
      stakingGlobalState: stakingGlobalStatePDA,
      stakingProgram: stakingProgram.programId,
      authority: admin.publicKey,
    }).rpc();

    // 3. ĐỢI 30 GIÂY ĐỂ LÃI SUẤT TĂNG (Làm tăng giá trị tài sản trong kho Staking)
    console.log("⏳ Đang chờ 30 giây để lãi suất làm tăng giá trị Shares...");
    await sleep(30000);

    // 4. KIỂM TRA TỶ GIÁ VÀ RÚT TIỀN
    console.log("Admin rút tiền đầu tư (Lúc này tỷ giá đã > 1)...");
    const tx = await bankProgram.methods.investToken(new anchor.BN(100 * 1e9), false).accounts({
        tokenMint: mint,
        bankVault: bankVaultPDA,
        bankAta: bankATA.address,
        stakingVault: stakingVaultPDA,
        stakingAta: stakingATA.address,
        stakingInfo: stakingInfoPDA,
        stakingGlobalState: stakingGlobalStatePDA,
        stakingProgram: stakingProgram.programId,
        authority: admin.publicKey,
    }).rpc();

    console.log("✅ HOÀN TẤT! Hãy xem Log trên Solscan để thấy số tiền nhận về > 100 Token nhờ cơ chế Shares.");
    console.log("Signature: ", tx);
  });
});
