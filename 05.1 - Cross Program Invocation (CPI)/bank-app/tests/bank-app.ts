import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankApp } from "../target/types/bank_app";
import { StakingApp } from "../target/types/staking_app";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

const solscanTx = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=devnet`;
const solscanAcc = (addr: string) =>
  `https://solscan.io/account/${addr}?cluster=devnet`;

describe("bank-app - Integrated Tests (SHARE + ALT)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const bankProgram = anchor.workspace.BankApp as Program<BankApp>;
  const stakingProgram = anchor.workspace.StakingApp as Program<StakingApp>;

  const admin = (provider.wallet as any).payer as Keypair;
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();
  const users = [user1, user2, user3];

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ── PDAs ──────────────────────────────────────────────────────────────────
  let bankInfoPDA: PublicKey;
  let bankVaultPDA: PublicKey;
  let stakingVaultPDA: PublicKey;
  let stakingGlobalStatePDA: PublicKey;

  // ── Mints ─────────────────────────────────────────────────────────────────
  // mainMint   → dùng cho test 05.1 và Scenario B
  // extraMints → thêm 3 cái cho Scenario A (tổng 4 token)
  let mainMint: PublicKey;
  let extraMints: PublicKey[] = [];
  let allMints: PublicKey[] = []; // [mainMint, ...extraMints]

  // ── Shared ALT ────────────────────────────────────────────────────────────
  let sharedAlt: PublicKey;

  // ── ATAs ──────────────────────────────────────────────────────────────────
  // key: `${mint}-bank`  | `${mint}-${userPubkey}`
  let ataMap: Map<string, PublicKey> = new Map();

  // ── Reserve PDAs (user × mint) ────────────────────────────────────────────
  let reserveMap: Map<string, PublicKey> = new Map(); // key: `${user}-${mint}`

  // ── Staking Info PDA (cho 05.1) ───────────────────────────────────────────
  let stakingInfoPDA: PublicKey;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function bankKey(mint: PublicKey) {
    return `${mint.toBase58()}-bank`;
  }
  function userKey(user: PublicKey, mint: PublicKey) {
    return `${user.toBase58()}-${mint.toBase58()}`;
  }

  /** Tạo ALT, dùng slot đã confirmed - 1 để tránh stale slot */
  async function createALT(authority: Keypair): Promise<PublicKey> {
    const slot = await provider.connection.getSlot("confirmed");
    const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
      authority: authority.publicKey,
      payer: authority.publicKey,
      recentSlot: slot - 1,
    });
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createIx),
      [authority]
    );
    console.log(`\n📋 ALT tạo thành công: ${solscanAcc(altAddress.toBase58())}`);
    return altAddress;
  }

  /** Mở rộng ALT, tối đa 20 địa chỉ mỗi batch */
  async function extendALT(
    authority: Keypair,
    altAddress: PublicKey,
    addresses: PublicKey[]
  ) {
    const BATCH = 20;
    for (let i = 0; i < addresses.length; i += BATCH) {
      const batch = addresses.slice(i, i + BATCH);
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: authority.publicKey,
        authority: authority.publicKey,
        lookupTable: altAddress,
        addresses: batch,
      });
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(extendIx),
        [authority]
      );
    }
    console.log(
      `   ↳ Extended ALT với ${addresses.length} địa chỉ (${Math.ceil(
        addresses.length / BATCH
      )} batch)`
    );
  }

  /** Lấy ALT account object để dùng trong VersionedTransaction */
  async function getALTAccount(altAddress: PublicKey) {
    const res = await provider.connection.getAddressLookupTable(altAddress);
    return res.value!;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // BEFORE – Khởi tạo tất cả tài nguyên + 1 Shared ALT
  // ═════════════════════════════════════════════════════════════════════════
  before(async () => {
    console.log("\n🔧 ===== SETUP BẮT ĐẦU =====");

    // 1. Chuyển SOL từ admin (tránh airdrop rate-limit của Devnet)
    for (const user of users) {
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: user.publicKey,
          lamports: 2 * LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(tx, [admin]);
    }
    console.log("✅ Chuyển 2 SOL → mỗi user (user1, user2, user3)");

    // 2. Tính PDAs
    [bankInfoPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_INFO_SEED_V3")],
      bankProgram.programId
    );
    [bankVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_VAULT_SEED_V3")],
      bankProgram.programId
    );
    [stakingVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("STAKING_VAULT_V3")],
      stakingProgram.programId
    );
    [stakingGlobalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("GLOBAL_STATE_V3")],
      stakingProgram.programId
    );

    // 3. Tạo Mints: 1 mainMint + 3 extraMints (Scenario A cần 4 token)
    mainMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      9
    );
    for (let i = 0; i < 3; i++) {
      extraMints.push(
        await createMint(provider.connection, admin, admin.publicKey, null, 9)
      );
    }
    allMints = [mainMint, ...extraMints];
    console.log(`✅ Tạo ${allMints.length} mint: mainMint + ${extraMints.length} extraMints`);

    // 4. Tạo ATAs cho bank và mỗi user, tính reserve PDAs
    for (const mint of allMints) {
      // Bank ATA (bankVault owns it)
      const bATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        admin,
        mint,
        bankVaultPDA,
        true
      );
      ataMap.set(bankKey(mint), bATA.address);

      // User ATAs + reserve PDAs
      for (const user of [user1, user2, user3]) {
        const uATA = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          admin,
          mint,
          user.publicKey
        );
        ataMap.set(userKey(user.publicKey, mint), uATA.address);

        const [resPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("USER_RESERVE_SEED_V3"),
            user.publicKey.toBuffer(),
            mint.toBuffer(),
          ],
          bankProgram.programId
        );
        reserveMap.set(userKey(user.publicKey, mint), resPDA);
      }
    }

    // Staking ATA cho stakingVault (chỉ cần mainMint cho 05.1)
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      mainMint,
      stakingVaultPDA,
      true
    );

    // Staking Info PDA (bank là "user" stake tại staking app)
    [stakingInfoPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("USER_INFO_TOKEN_V3"),
        bankVaultPDA.toBuffer(),
        mainMint.toBuffer(),
      ],
      stakingProgram.programId
    );

    // 5. Mint token cho tất cả user × tất cả mint (500 token mỗi người)
    for (const mint of allMints) {
      // Mint thêm vào staking vault để có lãi (dùng cho 05.1)
      if (mint.equals(mainMint)) {
        await mintTo(
          provider.connection,
          admin,
          mint,
          ataMap.get(bankKey(mint))!,
          admin,
          1000 * 1e9
        );
      }
      for (const user of [user1, user2, user3]) {
        await mintTo(
          provider.connection,
          admin,
          mint,
          ataMap.get(userKey(user.publicKey, mint))!,
          admin,
          500 * 1e9
        );
      }
    }
    console.log("✅ Mint 500 token mỗi user × 4 mints + 1000 token vào bank vault");

    // 6. Khởi tạo chương trình
    try {
      await bankProgram.methods
        .initialize()
        .accounts({
          bankInfo: bankInfoPDA,
          bankVault: bankVaultPDA,
          authority: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Bank App initialized!");
    } catch (_) {}

    try {
      await stakingProgram.methods
        .initializeGlobal()
        .accounts({
          globalState: stakingGlobalStatePDA,
          payer: admin.publicKey,
        })
        .rpc();
      console.log("✅ Staking Global State initialized!");
    } catch (_) {}

    // 7. Tạo 1 Shared ALT dùng chung cho tất cả scenario
    console.log("\n📋 Tạo Shared ALT...");
    sharedAlt = await createALT(admin);

    // Thu thập TẤT CẢ địa chỉ cần thiết cho cả 3 test
    const allAddresses: PublicKey[] = [
      // Chương trình & hệ thống
      SystemProgram.programId,
      TOKEN_PROGRAM_ID,
      bankProgram.programId,
      stakingProgram.programId,
      // PDAs chung
      bankInfoPDA,
      bankVaultPDA,
      stakingVaultPDA,
      stakingGlobalStatePDA,
      stakingInfoPDA,
    ];

    // Thêm tất cả mint, bank ATA, user ATAs, reserve PDAs
    for (const mint of allMints) {
      allAddresses.push(mint);
      allAddresses.push(ataMap.get(bankKey(mint))!);
      for (const user of [user1, user2, user3]) {
        allAddresses.push(user.publicKey);
        allAddresses.push(ataMap.get(userKey(user.publicKey, mint))!);
        allAddresses.push(reserveMap.get(userKey(user.publicKey, mint))!);
      }
    }

    await extendALT(admin, sharedAlt, allAddresses);

    // Warmup: chờ 2 giây để ALT được index
    await sleep(2000);
    console.log("✅ Shared ALT sẵn sàng!\n");
    console.log("🔧 ===== SETUP HOÀN TẤT =====\n");
  });

  // ═════════════════════════════════════════════════════════════════════════
  // TEST 05.1: Kiểm chứng tỷ giá Share (người đến trước hưởng lợi hơn)
  // ═════════════════════════════════════════════════════════════════════════
  it("05.1: Kiểm chứng tỷ giá Share (Người đến trước hưởng lợi hơn)", async () => {
    console.log("--- BẮT ĐẦU KỊCH BẢN SHARE-BASED ---");

    const u1ATA = ataMap.get(userKey(user1.publicKey, mainMint))!;
    const bATA = ataMap.get(bankKey(mainMint))!;
    const u1Reserve = reserveMap.get(userKey(user1.publicKey, mainMint))!;

    // Lấy số dư ban đầu của user1
    const beforeBalance = await provider.connection.getTokenAccountBalance(u1ATA);
    console.log(`User1 số dư ban đầu: ${beforeBalance.value.uiAmount} token`);

    // 1. User1 nạp 100 token vào Bank
    const sig1 = await bankProgram.methods
      .depositToken(new anchor.BN(100 * 1e9))
      .accounts({
        tokenMint: mainMint,
        user: user1.publicKey,
        userAta: u1ATA,
        bankAta: bATA,
        userReserve: u1Reserve,
        stakingGlobalState: null,
        stakingInfo: null,
      })
      .signers([user1])
      .rpc();
    console.log(`✅ User1 nạp 100 token | ${solscanTx(sig1)}`);

    // 2. Admin đầu tư 100 token vào Staking (tỷ giá = 1:1 lúc đầu)
    const stakingATA = await provider.connection
      .getTokenAccountsByOwner(stakingVaultPDA, { mint: mainMint })
      .then((r) => r.value[0]?.pubkey);

    const sig2 = await bankProgram.methods
      .investToken(new anchor.BN(100 * 1e9), true)
      .accounts({
        tokenMint: mainMint,
        bankVault: bankVaultPDA,
        bankAta: bATA,
        stakingVault: stakingVaultPDA,
        stakingAta: stakingATA,
        stakingInfo: stakingInfoPDA,
        stakingGlobalState: stakingGlobalStatePDA,
        stakingProgram: stakingProgram.programId,
        authority: admin.publicKey,
      })
      .rpc();
    console.log(`✅ Admin đầu tư 100 token (tỷ giá = 1) | ${solscanTx(sig2)}`);

    // 3. Chờ 10 giây để lãi suất tăng
    console.log("⏳ Chờ 10 giây để lãi suất tăng...");
    await sleep(10000);

    // 4. Admin rút tiền đầu tư về (lúc này lãi đã cộng)
    const sig3 = await bankProgram.methods
      .investToken(new anchor.BN(100 * 1e9), false)
      .accounts({
        tokenMint: mainMint,
        bankVault: bankVaultPDA,
        bankAta: bATA,
        stakingVault: stakingVaultPDA,
        stakingAta: stakingATA,
        stakingInfo: stakingInfoPDA,
        stakingGlobalState: stakingGlobalStatePDA,
        stakingProgram: stakingProgram.programId,
        authority: admin.publicKey,
      })
      .rpc();
    console.log(`✅ Admin rút đầu tư về (tỷ giá > 1) | ${solscanTx(sig3)}`);

    // 5. User1 rút về bằng số shares (100 * 1e9 shares = 100 token ban đầu)
    const sig4 = await bankProgram.methods
      .withdrawToken(new anchor.BN(100 * 1e9))
      .accounts({
        tokenMint: mainMint,
        user: user1.publicKey,
        userAta: u1ATA,
        bankAta: bATA,
        userReserve: u1Reserve,
        stakingGlobalState: stakingGlobalStatePDA,
        stakingInfo: stakingInfoPDA,
      })
      .signers([user1])
      .rpc();
    console.log(`✅ User1 rút tiền | ${solscanTx(sig4)}`);

    const afterBalance = await provider.connection.getTokenAccountBalance(u1ATA);
    console.log(`\n💰 Số dư sau: ${afterBalance.value.uiAmount} token`);
    console.log(`💰 Số dư trước: ${beforeBalance.value.uiAmount} token`);
    console.log(
      `📈 Lời: ${afterBalance.value.uiAmount! - beforeBalance.value.uiAmount!} token`
    );

    assert.isAbove(
      afterBalance.value.uiAmount!,
      beforeBalance.value.uiAmount! - 100,
      "Số dư sau khi rút phải lớn hơn số dư trước khi nạp - 100"
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // TEST 05.2 – Scenario A: 1 người gửi 4 loại token trong 1 Versioned TX
  // ═════════════════════════════════════════════════════════════════════════
  it("05.2 - Scenario A: 1 người gửi 4 token cùng lúc dùng Shared ALT", async () => {
    console.log("--- BẮT ĐẦU SCENARIO A: 1 USER - 4 TOKEN ---");

    // Xây dựng 4 instructions depositToken cho user1 × allMints
    const instructions: anchor.web3.TransactionInstruction[] = [];

    for (const mint of allMints) {
      const uATA = ataMap.get(userKey(user1.publicKey, mint))!;
      const bATA = ataMap.get(bankKey(mint))!;
      const resPDA = reserveMap.get(userKey(user1.publicKey, mint))!;

      instructions.push(
        await bankProgram.methods
          .depositToken(new anchor.BN(10 * 1e9))
          .accounts({
            tokenMint: mint,
            user: user1.publicKey,
            userAta: uATA,
            bankAta: bATA,
            userReserve: resPDA,
            stakingGlobalState: null,
            stakingInfo: null,
          })
          .instruction()
      );
    }

    // Dùng Shared ALT để nén địa chỉ
    const altAccount = await getALTAccount(sharedAlt);
    const { blockhash } = await provider.connection.getLatestBlockhash();

    const msgV0 = new TransactionMessage({
      payerKey: user1.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([altAccount]);

    const txV0 = new VersionedTransaction(msgV0);
    txV0.sign([user1]);

    const sig = await provider.connection.sendTransaction(txV0, {
      skipPreflight: false,
    });
    await provider.connection.confirmTransaction(sig, "confirmed");

    console.log(
      `\n🎉 Scenario A thành công! 1 user gửi ${allMints.length} token trong 1 TX`
    );
    console.log(`👉 Xem trên Solscan: ${solscanTx(sig)}`);
    console.log(`   ALT Address:      ${solscanAcc(sharedAlt.toBase58())}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // TEST 05.2 – Scenario B: 3 người gửi 1 loại token cùng lúc
  // ═════════════════════════════════════════════════════════════════════════
  it("05.2 - Scenario B: 3 người gửi 1 token cùng lúc dùng Shared ALT", async () => {
    console.log("--- BẮT ĐẦU SCENARIO B: 3 USERS - 1 TOKEN ---");

    // 3 users cùng deposit mainMint trong 1 Versioned Transaction
    const bATA = ataMap.get(bankKey(mainMint))!;
    const instructions: anchor.web3.TransactionInstruction[] = [];

    for (const user of users) {
      const uATA = ataMap.get(userKey(user.publicKey, mainMint))!;
      const resPDA = reserveMap.get(userKey(user.publicKey, mainMint))!;

      instructions.push(
        await bankProgram.methods
          .depositToken(new anchor.BN(10 * 1e9))
          .accounts({
            tokenMint: mainMint,
            user: user.publicKey,
            userAta: uATA,
            bankAta: bATA,
            userReserve: resPDA,
            stakingGlobalState: null,
            stakingInfo: null,
          })
          .instruction()
      );
    }

    // Dùng CÙNG 1 Shared ALT
    const altAccount = await getALTAccount(sharedAlt);
    const { blockhash } = await provider.connection.getLatestBlockhash();

    // Payer là admin (trả phí), nhưng 3 users là signer của instruction
    const msgV0 = new TransactionMessage({
      payerKey: admin.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([altAccount]);

    const txV0 = new VersionedTransaction(msgV0);
    txV0.sign([admin, user1, user2, user3]);

    const sig = await provider.connection.sendTransaction(txV0, {
      skipPreflight: false,
    });
    await provider.connection.confirmTransaction(sig, "confirmed");

    console.log(
      `\n🎉 Scenario B thành công! 3 users gửi cùng 1 token trong 1 TX`
    );
    console.log(`👉 Xem trên Solscan: ${solscanTx(sig)}`);
    console.log(`   ALT Address:      ${solscanAcc(sharedAlt.toBase58())}`);

    // Kiểm tra số dư của từng user
    for (const user of users) {
      const bals = await provider.connection.getTokenAccountBalance(
        ataMap.get(userKey(user.publicKey, mainMint))!
      );
      console.log(
        `   ${user.publicKey.toBase58().slice(0, 8)}... còn ${bals.value.uiAmount} token`
      );
    }
  });
});
