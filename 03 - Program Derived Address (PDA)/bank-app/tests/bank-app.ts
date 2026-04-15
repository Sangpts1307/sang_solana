import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankApp } from "../target/types/bank_app";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "bn.js";
import { assert, expect } from "chai";

describe("bank-app detailed tests", () => {
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

  it("Khởi tạo ngân hàng (Initialize)", async () => {
    try {
      const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
      console.log("✓ Ngân hàng đã được khởi tạo: ", bankInfo.authority.toString());
    } catch {
      console.log("Đang khởi tạo ngân hàng mới...");
      const tx = await program.methods.initialize()
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          authority: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      console.log("✓ Khởi tạo thành công. Signature: ", tx);
      
      const bankInfoAfter = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
      assert.isFalse(bankInfoAfter.isPaused);
      assert.equal(bankInfoAfter.authority.toString(), provider.publicKey.toString());
    }
  });

  it("Nạp tiền thành công (Deposit)", async () => {
    const depositAmount = new BN(0.2 * LAMPORTS_PER_SOL); // 0.2 SOL
    
    // Lấy số dư trước khi nạp (nếu đã có account)
    let balanceBefore = new BN(0);
    try {
      const reserve = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
      balanceBefore = reserve.depositedAmount;
    } catch (e) {
      console.log("Tài khoản UserReserve mới sẽ được tạo.");
    }

    const tx = await program.methods.deposit(depositAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
        user: provider.publicKey,
        systemProgram: SystemProgram.programId
      }).rpc();
    console.log("✓ Nạp 0.2 SOL thành công. Signature: ", tx);

    const userReserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    const expectedBalance = balanceBefore.add(depositAmount);
    
    expect(userReserveAfter.depositedAmount.toString()).to.equal(expectedBalance.toString());
    console.log(`✓ Xác minh số dư: Trước (${balanceBefore}) + Nạp (${depositAmount}) = Sau (${userReserveAfter.depositedAmount})`);
  });

  it("Lỗi khi nạp dưới mức tối thiểu (0.01 SOL)", async () => {
    const tooSmallAmount = new BN(0.005 * LAMPORTS_PER_SOL);
    try {
      await program.methods.deposit(tooSmallAmount)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Lẽ ra phải báo lỗi DepositTooSmall!");
    } catch (err: any) {
      assert.include(err.message, "DepositTooSmall", "Lỗi nạp tiền quá nhỏ không đúng message");
      console.log("✓ Đã chặn nạp tiền nhỏ hơn 0.01 SOL thành công.");
    }
  });

  it("Rút tiền thành công (Withdraw)", async () => {
    const withdrawAmount = new BN(0.1 * LAMPORTS_PER_SOL);
    
    const reserveBefore = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    const balanceBefore = reserveBefore.depositedAmount;

    const tx = await program.methods.withdraw(withdrawAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
        user: provider.publicKey,
        systemProgram: SystemProgram.programId
      }).rpc();
    console.log("✓ Rút 0.1 SOL thành công. Signature: ", tx);

    const reserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    const expectedBalance = balanceBefore.sub(withdrawAmount);
    
    assert.equal(reserveAfter.depositedAmount.toString(), expectedBalance.toString());
    console.log(`✓ Xác minh số dư sau khi rút: ${reserveAfter.depositedAmount.toString()} lamports`);
  });

  it("Lỗi khi rút quá số dư (InsufficientFunds)", async () => {
    const tooMuch = new BN(5 * LAMPORTS_PER_SOL);
    try {
      await program.methods.withdraw(tooMuch)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Lẽ ra phải báo lỗi InsufficientFunds!");
    } catch (err: any) {
      assert.include(err.message, "InsufficientFunds");
      console.log("✓ Đã chặn rút tiền quá số dư thành công.");
    }
  });

  it("Admin tạm dừng hoạt động (Pause)", async () => {
    await program.methods.pause(true)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        authority: provider.publicKey,
      }).rpc();

    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isTrue(bankInfo.isPaused);
    console.log("✓ Ngân hàng đã được chuyển sang trạng thái PAUSED.");
  });

  it("Lỗi khi nạp/rút tiền lúc đang Pause", async () => {
    // Test nạp tiền bị chặn
    try {
      await program.methods.deposit(new BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Không được phép nạp tiền khi đang pause!");
    } catch (err: any) {
      assert.include(err.message, "BankAppPaused");
      console.log("✓ Đã chặn Nạp tiền khi đang Pause.");
    }

    // Test rút tiền bị chặn
    try {
      await program.methods.withdraw(new BN(0.01 * LAMPORTS_PER_SOL))
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      assert.fail("Không được phép rút tiền khi đang pause!");
    } catch (err: any) {
      assert.include(err.message, "BankAppPaused");
      console.log("✓ Đã chặn Rút tiền khi đang Pause.");
    }
  });

  it("Lỗi khi người lạ cố tình Pause", async () => {
    try {
      await program.methods.pause(false)
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          authority: otherUser.publicKey,
        })
        .signers([otherUser])
        .rpc();
      assert.fail("Người lạ không được quyền sử dụng hàm Pause!");
    } catch (err: any) {
      assert.include(err.message, "UnAuthorized");
      console.log("✓ Bảo mật tốt: Người lạ không thể đổi trạng thái ngân hàng.");
    }
  });

  it("Admin mở lại hoạt động (Unpause)", async () => {
    await program.methods.pause(false)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        authority: provider.publicKey,
      }).rpc();

    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isFalse(bankInfo.isPaused);
    console.log("✓ Ngân hàng đã hoạt động trở lại bình thường.");
  });
});

