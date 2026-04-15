import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankApp } from "../target/types/bank_app";
import { PublicKey, SystemProgram, TransactionInstruction, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "bn.js";
import { 
  createAssociatedTokenAccountInstruction,  // Tạo lệnh khởi tạo ATA mới
  getAssociatedTokenAddressSync,             // Tính địa chỉ ATA mà không cần gọi lên chain
  TOKEN_PROGRAM_ID,                          // ID của chương trình SPL Token trên Solana
  createMint,                                // Tạo một loại token mới (Mint account)
  mintTo,                                    // In thêm token vào một ATA
  getOrCreateAssociatedTokenAccount          // Lấy ATA nếu có, tạo mới nếu chưa có
} from "@solana/spl-token";
import { assert, expect } from "chai"; // Thư viện kiểm tra điều kiện đúng/sai trong test

describe("bank-app detailed tests", () => {
  // Lấy provider từ biến môi trường - Anchor tự inject URL cluster và ví vào đây
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider); // Đặt provider này làm mặc định cho toàn bộ file test

  // Lấy instance của Program đã được deploy, dùng để gọi các instruction
  const program = anchor.workspace.BankApp as Program<BankApp>;

  // Tính toán trước địa chỉ PDA - không cần gọi lên chain vì PDA là Deterministic
  const BANK_APP_ACCOUNTS = {
    // BankInfo PDA: tính từ seed cố định "BANK_INFO_SEED" + programId
    bankInfo: PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_INFO_SEED")],
      program.programId
    )[0],

    // BankVault PDA: "két sắt" chứa SOL, tính từ seed "BANK_VAULT_SEED" + programId
    bankVault: PublicKey.findProgramAddressSync(
      [Buffer.from("BANK_VAULT_SEED")],
      program.programId
    )[0],

    // Hàm tính địa chỉ UserReserve (sổ cái) của một ví.
    // Nếu có tokenMint → sổ cái cho token đó. Nếu không → sổ cái cho SOL.
    userReserve: (pubkey: PublicKey, tokenMint?: PublicKey) => {
      let SEEDS = [
        Buffer.from("USER_RESERVE_SEED"),
        pubkey.toBuffer(), // Mỗi ví có sổ cái riêng nhờ thêm địa chỉ ví vào seed
      ]
      if (tokenMint != undefined) {
        SEEDS.push(tokenMint.toBuffer()) // Thêm mint address để phân biệt sổ cái từng loại token
      }
      return PublicKey.findProgramAddressSync(SEEDS, program.programId)[0]
    }
  }

  const otherUser = Keypair.generate(); // Ví phụ (dự phòng để test multi-user sau)
  let tokenMint: PublicKey;  // Địa chỉ của token giả tạo ra để test
  let userAta: PublicKey;    // Địa chỉ hòm chứa token của người dùng (user)
  let bankAta: PublicKey;    // Địa chỉ hòm chứa token của ngân hàng (BankVault)

  // Hook before(): chạy một lần duy nhất TRƯỚC tất cả các bài test
  // Mục đích: chuẩn bị môi trường token để các test bên dưới dùng được
  before(async () => {
    // Tạo một Mock Token Mint hoàn toàn mới (giống như "đăng ký phát hành tiền tệ mới")
    // Người tạo cũng là Mint Authority: người duy nhất có quyền in thêm token
    tokenMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer, // Trả phí tạo tài khoản Mint
      provider.publicKey,             // Mint Authority: ai được phép in token
      null,                           // Freeze Authority: null = không ai được đóng băng
      9                               // Số chữ số thập phân (9 = như lamports của SOL)
    );

    // Tạo ATA cho User (nếu chưa có) để chứa loại token vừa tạo ở trên
    // ATA = Associated Token Account: hòm token cố định theo công thức (owner + mint)
    const userAtaAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer, // Trả phí tạo ATA nếu chưa có
      tokenMint,                       // Loại token mà hòm này sẽ chứa
      provider.publicKey               // Chủ của hòm này là ví của user đang test
    );
    userAta = userAtaAccount.address; // Lưu lại địa chỉ để dùng trong các test sau

    // In ("mint") 10 token vào ATA của user để có vốn test
    // Đây là quyền đặc biệt chỉ có Mint Authority mới làm được
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      tokenMint,
      userAta,            // In token vào hòm của user
      provider.publicKey, // Phải là Mint Authority
      10_000_000_000      // 10 tokens (vì 9 decimals: 10 * 10^9 = 10_000_000_000)
    );

    // Tính sẵn địa chỉ ATA của BankVault cho loại token này
    // true = cho phép tài khoản off-curve (PDA) làm chủ ATA
    bankAta = getAssociatedTokenAddressSync(tokenMint, BANK_APP_ACCOUNTS.bankVault, true);
  });

  // ================================================================
  // TEST 1: Khởi tạo hệ thống ngân hàng lần đầu tiên
  // ================================================================
  it("Initialize system", async () => {
    try {
      // Thử đọc BankInfo - nếu đọc được tức là đã khởi tạo rồi, bỏ qua
      await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
      console.log("✓ System was already initialized.");
    } catch {
      // BankInfo chưa tồn tại → gọi lệnh initialize để tạo mới
      const tx = await program.methods.initialize()
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,   // PDA sẽ được tạo để lưu trạng thái
          bankVault: BANK_APP_ACCOUNTS.bankVault, // PDA két sắt sẽ được tạo để chứa SOL
          authority: provider.publicKey,          // Người gọi này trở thành Admin của ngân hàng
          systemProgram: SystemProgram.programId  // Cần để tạo các tài khoản mới trên chain
        }).rpc();
      console.log("✓ Initialization successful. Signature: ", tx);
    }
  });

  // ================================================================
  // TEST 2: Nạp 1 SOL vào ngân hàng, kiểm tra sổ cái tăng đúng số
  // ================================================================
  it("Deposit SOL", async () => {
    const depositAmount = new BN(1 * LAMPORTS_PER_SOL); // 1 SOL = 1_000_000_000 lamports

    // Đọc số dư hiện tại trước khi nạp
    // fetchNullable: trả về null thay vì throw nếu tài khoản chưa tồn tại
    const reserveBefore = await program.account.userReserve.fetchNullable(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    const balanceBefore = reserveBefore ? reserveBefore.depositedAmount : new BN(0); // Nếu chưa có sổ cái → số dư = 0

    // Gọi instruction deposit để chuyển 1 SOL từ ví vào BankVault
    await program.methods.deposit(depositAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,                        // Đọc is_paused và context
        bankVault: BANK_APP_ACCOUNTS.bankVault,                      // Nơi nhận SOL
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey), // Sổ cái SOL của user (tự tạo nếu chưa có)
        user: provider.publicKey,                                    // Người ký = người gửi tiền
        systemProgram: SystemProgram.programId                       // Cần để chuyển SOL native
      }).rpc();

    // Đọc lại sổ cái sau khi nạp và kiểm tra số tiền tăng đúng
    const reserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    expect(reserveAfter.depositedAmount.toString()).to.equal(balanceBefore.add(depositAmount).toString());
    console.log("✓ Deposited 1 SOL successfully.");
  });

  // ================================================================
  // TEST 3: Rút 0.5 SOL từ ngân hàng, kiểm tra sổ cái giảm đúng số
  // ================================================================
  it("Withdraw SOL", async () => {
    const withdrawAmount = new BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL = 500_000_000 lamports

    // Đọc số dư trong sổ cái trước khi rút
    const reserveBefore = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    const balanceBefore = reserveBefore.depositedAmount;

    // Gọi instruction withdraw: chương trình dùng PDA Signing để "ký thay" BankVault
    await program.methods.withdraw(withdrawAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,                        // Lấy bump để ký, kiểm tra is_paused
        bankVault: BANK_APP_ACCOUNTS.bankVault,                      // Két sắt bị rút tiền ra
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey), // Sổ cái bị trừ số dư
        user: provider.publicKey,                                    // Ví nhận tiền về
        systemProgram: SystemProgram.programId
      }).rpc();

    // Kiểm tra số dư giảm đúng 0.5 SOL
    const reserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey));
    expect(reserveAfter.depositedAmount.toString()).to.equal(balanceBefore.sub(withdrawAmount).toString());
    console.log("✓ Withdrew 0.5 SOL successfully.");
  });

  // ================================================================
  // TEST 4: Nạp 2 SPL Token vào ngân hàng (tính năng mới của phần 04)
  // ================================================================
  it("Deposit Token", async () => {
    const depositAmount = new BN(2_000_000_000); // 2 tokens (2 * 10^9 vì 9 decimals)

    // Đọc sổ cái token của user trước khi nạp (sổ cái riêng cho loại tokenMint này)
    const reserveBefore = await program.account.userReserve.fetchNullable(BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint));
    const balanceBefore = reserveBefore ? reserveBefore.depositedAmount : new BN(0);

    // Kiểm tra bankAta (hòm token của ngân hàng) đã tồn tại chưa
    // Nếu chưa có → phải tạo thủ công trước khi gọi depositToken
    let preInstructions: TransactionInstruction[] = []
    if (await provider.connection.getAccountInfo(bankAta) == null) {
      // bankAta chưa tồn tại → tạo ATA cho BankVault với loại tokenMint này
      preInstructions.push(createAssociatedTokenAccountInstruction(
        provider.publicKey,              // Người trả phí tạo ATA
        bankAta,                         // Địa chỉ ATA sẽ được tạo ra
        BANK_APP_ACCOUNTS.bankVault,     // Chủ sở hữu ATA = BankVault (PDA)
        tokenMint                        // Loại token hòm này sẽ chứa
      ))
    }

    // Gọi instruction depositToken: token chuyển từ userAta → bankAta
    // preInstructions sẽ được gắn kèm trước nếu cần tạo bankAta
    await program.methods.depositToken(depositAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,
        tokenMint,                                                            // Loại token đang giao dịch
        userAta,                                                              // Nguồn: hòm token của user bị trừ
        bankAta,                                                              // Đích: hòm token của bank nhận vào
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint), // Sổ cái token của user
        user: provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,   // Chương trình SPL xử lý chuyển token
        systemProgram: SystemProgram.programId
      }).preInstructions(preInstructions).rpc(); // Gắn thêm lệnh tạo ATA nếu có

    // Kiểm tra sổ cái token tăng đúng 2 token
    const reserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint));
    expect(reserveAfter.depositedAmount.toString()).to.equal(balanceBefore.add(depositAmount).toString());
    console.log("✓ Deposited 2 Tokens successfully.");
  });

  // ================================================================
  // TEST 5: Rút 1 SPL Token từ ngân hàng về ví người dùng
  // ================================================================
  it("Withdraw Token", async () => {
    const withdrawAmount = new BN(1_000_000_000); // 1 token (1 * 10^9)

    // Đọc sổ cái token trước khi rút
    const reserveBefore = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint));
    const balanceBefore = reserveBefore.depositedAmount;

    // Gọi instruction withdrawToken: token chuyển từ bankAta → userAta
    // Chương trình dùng PDA Signing (BankVault) vì BankVault là authority của bankAta
    await program.methods.withdrawToken(withdrawAmount)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        bankVault: BANK_APP_ACCOUNTS.bankVault,                            // PDA ký để Token Program chấp thuận lệnh rút
        tokenMint,
        userAta,                                                            // Đích: hòm token của user nhận về
        bankAta,                                                            // Nguồn: hòm token của bank bị rút
        userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint), // Sổ cái token bị trừ
        user: provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

    // Kiểm tra sổ cái token giảm đúng 1 token
    const reserveAfter = await program.account.userReserve.fetch(BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint));
    expect(reserveAfter.depositedAmount.toString()).to.equal(balanceBefore.sub(withdrawAmount).toString());
    console.log("✓ Withdrew 1 Token successfully.");
  });

  // ================================================================
  // TEST 6: Admin tạm dừng ngân hàng (Pause)
  // ================================================================
  it("Pause Bank", async () => {
    // Gọi instruction pause(true) = đóng băng mọi hoạt động nạp/rút
    // Chỉ authority (Admin đã đăng ký lúc initialize) mới gọi được
    await program.methods.pause(true)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo, // Anchor kiểm tra has_one = authority ở đây
        authority: provider.publicKey,        // Phải khớp với authority đã lưu trong BankInfo
      }).rpc();

    // Đọc lại BankInfo và xác nhận cờ isPaused đã được bật
    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isTrue(bankInfo.isPaused); // Phải là true, nếu false → test fail
    console.log("✓ Bank successfully paused.");
  });

  // ================================================================
  // TEST 7: Kiểm tra bảo mật - mọi giao dịch phải bị chặn khi Paused
  // ================================================================
  it("Cannot deposit/withdraw when Paused", async () => {
    // --- CASE 1: Thử nạp SOL khi đang Paused ---
    try {
      await program.methods.deposit(new BN(100))
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey),
          user: provider.publicKey,
          systemProgram: SystemProgram.programId
        }).rpc();
      // Nếu chạy đến đây = lệnh không bị chặn = BUG → ép test fail thủ công
      assert.fail("SOL deposit should have been blocked");
    } catch (e: any) {
      // Đúng rồi: lệnh bị chặn. Kiểm tra thêm lỗi phải đúng loại BankAppPaused
      assert.include(e.message, "BankAppPaused");
    }

    // --- CASE 2: Thử rút Token khi đang Paused ---
    try {
      await program.methods.withdrawToken(new BN(100))
        .accounts({
          bankInfo: BANK_APP_ACCOUNTS.bankInfo,
          bankVault: BANK_APP_ACCOUNTS.bankVault,
          tokenMint,
          userAta,
          bankAta,
          userReserve: BANK_APP_ACCOUNTS.userReserve(provider.publicKey, tokenMint),
          user: provider.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc();
      // Nếu chạy đến đây = lệnh không bị chặn = BUG → ép test fail thủ công
      assert.fail("Token withdrawal should have been blocked");
    } catch (e: any) {
      // Đúng rồi: lệnh bị chặn. Kiểm tra lỗi đúng loại BankAppPaused
      assert.include(e.message, "BankAppPaused");
    }
    console.log("✓ Successfully blocked transactions when Paused.");
  });

  // ================================================================
  // TEST 8: Admin mở lại ngân hàng (Unpause)
  // ================================================================
  it("Unpause Bank", async () => {
    // Gọi instruction pause(false) = mở lại ngân hàng hoạt động bình thường
    await program.methods.pause(false)
      .accounts({
        bankInfo: BANK_APP_ACCOUNTS.bankInfo,
        authority: provider.publicKey,
      }).rpc();

    // Đọc lại BankInfo và xác nhận cờ isPaused đã tắt
    const bankInfo = await program.account.bankInfo.fetch(BANK_APP_ACCOUNTS.bankInfo);
    assert.isFalse(bankInfo.isPaused); // Phải là false, nếu true → test fail
    console.log("✓ Bank is unpaused and active again.");
  });
});
