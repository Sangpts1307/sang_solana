import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankApp } from "../target/types/bank_app";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "bn.js";
import { assert } from "chai";

describe("bank-app", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BankApp as Program<BankApp>;

  const BANK_APP_ACCOUNTS = {
    bankInfo: PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_INFO_SEED")],
      program.programId
    )[0],
    bankVault: PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_VAULT_SEED")],
      program.programId
    )[0],
    userReserve: (pubkey: PublicKey) => PublicKey.findProgramAddressSync(
      [
        Buffer.from("USER_RESERVE_SEED"),
        pubkey.toBuffer()
      ],
      program.programId
    )[0],
  }

  const otherUser = Keypair.generate();

  before(async () => {
    // Tạm tắt airdrop tự động vì server Devnet hay lỗi
    // const signature = await provider.connection.requestAirdrop(otherUser.publicKey, 2 * LAMPORTS_PER_SOL);
    // await provider.connection.confirmTransaction(signature);
  });

  it("Khởi tạo ngân hàng (Initialize)", async () => {
    try {
      await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
      console.log("Ngân hàng đã được khởi tạo trước đó.");
    } catch {
      const tx = await program.methods.initialize()
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          authority: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      console.log("Khởi tạo thành công. Signature: ", tx);
    }
  });

  it("Nạp tiền thành công (Deposit)", async () => {
    const amount = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
    const tx = await program.methods.deposit(amount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
        user: provider.publicKey,
        systemProgram: SystemProgram.programId
      }).rpc();
    console.log("Nạp tiền 0.1 SOL thành công. Signature: ", tx);

    const userReserve = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    assert.equal(userReserve.depositedAmount.toString(), amount.toString());
  });

  it("Lỗi khi nạp dưới mức tối thiểu (0.01 SOL)", async () => {
    const tooSmallAmount = new BN(1_000_000); // 0.001 SOL
    try {
      await program.methods.deposit(tooSmallAmount)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Nạp tiền quá nhỏ mà không báo lỗi!");
    } catch (err: any) {
      console.log("Đã chặn nạp tiền quá nhỏ (Dưới 0.01 SOL). Lỗi:", err.message);
      assert.include(err.message, "DepositTooSmall");
    }
  });

  it("Rút tiền thành công (Withdraw)", async () => {
    const withdrawAmount = new BN(0.05 * LAMPORTS_PER_SOL); // 0.05 SOL
    const tx = await program.methods.withdraw(withdrawAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
        user: provider.publicKey,
        systemProgram: SystemProgram.programId
      }).rpc();
    console.log("Rút tiền 0.05 SOL thành công. Signature: ", tx);

    const userReserve = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    // Còn lại 0.1 - 0.05 = 0.05 SOL
    assert.equal(userReserve.depositedAmount.toString(), (0.05 * LAMPORTS_PER_SOL).toString());
  });

  it("Lỗi khi rút quá số dư", async () => {
    const tooMuch = new BN(1 * LAMPORTS_PER_SOL); // 1 SOL (Trong khi chỉ có 0.05)
    try {
      await program.methods.withdraw(tooMuch)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Rút quá số dư mà không báo lỗi!");
    } catch (err: any) {
      console.log("Đã chặn rút quá số dư. Lỗi:", err.message);
      assert.include(err.message, "InsufficientFunds");
    }
  });

  it("Admin có thể tạm dừng ngân hàng (Pause)", async () => {
    const tx = await program.methods.pause(true)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        authority: provider.publicKey,
      }).rpc();
    console.log("Đã tạm dừng ngân hàng thành công. Signature: ", tx);

    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isTrue(bankInfo.isPaused);
  });

  it("Lỗi khi nạp tiền lúc đang Pause", async () => {
    try {
      await program.methods.deposit(new BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Nạp tiền khi đang pause mà không báo lỗi!");
    } catch (err: any) {
      console.log("Đã chặn nạp tiền thành công khi đang Pause. Lỗi:", err.message);
      assert.include(err.message, "BankAppPaused");
    }
  });

  it("Lỗi khi user bình thường cố tình Pause", async () => {
    try {
      await program.methods.pause(false)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          authority: otherUser.publicKey,
        })
        .signers([otherUser])
        .rpc();
      assert.fail("Người dùng lạ có thể pause/unpause!");
    } catch (err: any) {
      console.log("Người dùng lạ bị từ chối quyền Pause. Lỗi:", err.message);
      assert.include(err.message, "UnAuthorized");
    }
  });

  it("Admin mở lại ngân hàng (Unpause)", async () => {
    const tx = await program.methods.pause(false)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        authority: provider.publicKey,
      }).rpc();
    console.log("Đã mở lại ngân hàng thành công. Signature: ", tx);

    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isFalse(bankInfo.isPaused);
  });
});
