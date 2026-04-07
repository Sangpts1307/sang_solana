# Phần Ba - Địa chỉ do Chương trình Tạo ra (Program Derived Address - PDA)

Bây giờ bạn đã quen với việc viết các chương trình Solana cơ bản, đã đến lúc giới thiệu một trong những khái niệm quan trọng nhất trong phát triển Solana — Program Derived Addresses (PDAs). Những tài khoản đặc biệt này là chìa khóa để xây dựng các chương trình an toàn, có trạng thái (stateful), có thể lưu trữ dữ liệu người dùng, quản lý kho quỹ (vault), kiểm soát quyền hạn và hơn thế nữa.

### Trong phần này, bạn sẽ:
✅ Hiểu PDA là gì và chúng hoạt động như thế nào
✅ Khởi tạo tài khoản sử dụng PDA với hạt giống (seeds) và bump
✅ Học cách tính toán (derive) PDA trong Anchor TypeScript Client
✅ Hoàn thành ví dụ thực tế đầu tiên: Ứng dụng Ngân hàng (Bank App)

Vào cuối phần này, bạn sẽ có thể tự tin tạo và quản lý các tài khoản PDA trong chương trình Solana của mình, mở khóa khả năng xây dựng các hợp đồng thông minh mạnh mẽ và phức tạp hơn.
Hãy cùng bắt đầu nào! 🧠✨

### Hãy bắt đầu với một ví dụ thực tế: Ứng dụng Ngân hàng (Bank App) 🏦
Để hiểu cách PDA hoạt động trong thực tế, hãy xem một chương trình ngân hàng đơn giản trên Solana.
Trong ứng dụng này:

👤 Người dùng có thể gửi và rút SOL
🛑 Người có thẩm quyền (authority) có thể tạm dừng chương trình để dừng mọi hoạt động trong trường hợp khẩn cấp
💾 Chương trình cần lưu trữ:
- Trạng thái toàn cục trong một tài khoản PDA đặc biệt gọi là `BankInfo`
- Số dư tiền gửi của mỗi người dùng trong các tài khoản PDA riêng lẻ gọi là `UserReserve`


### 1. PDA là gì?
Program Derived Address (PDA) là một loại tài khoản Solana đặc biệt do chương trình sở hữu, không phải bởi một ví trên chuỗi (ví người dùng) có khóa bí mật (private key). Điều này khiến PDA trở thành xương sống của hầu hết các hợp đồng thông minh trên Solana — chúng cho phép chương trình của bạn quản lý trạng thái, tài sản và quyền hạn một cách an toàn mà không phụ thuộc vào các ví do bên ngoài sở hữu.

PDA là:
🔐 *Được kiểm soát bởi chương trình của bạn* — không có khóa bí mật, chỉ chương trình mới có thể truy cập PDA của nó và không ai có thể giả mạo chữ ký của nó.
🧠 *Có tính xác định (Deterministic)* — chúng được tạo ra bằng cách sử dụng các đầu vào cố định (gọi là `seeds`) cộng với ID chương trình của bạn.
✍️ *Có khả năng ký các giao dịch* — nhưng chỉ bằng cách sử dụng `invoke_signed()` với các `seeds` của PDA bên trong chương trình của bạn.

Trong chương trình ngân hàng của chúng ta, chúng ta sử dụng hai PDA để lưu trữ dữ liệu trong `state.rs`:
```rust
#[account]
#[derive(Default)]
pub struct BankInfo {
    pub authority: Pubkey,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct UserReserve {
    pub deposited_amount: u64,
}
```

- `BankInfo` là một PDA toàn cục lưu trữ trạng thái của chương trình: ai là `authority`, liệu chương trình có `is_paused` hay không, và giá trị `bump` của Bank Vault.
- `UserReserve` là một PDA riêng biệt cho từng người dùng để theo dõi lượng SOL mà mỗi người đã gửi.

Các PDA này được tính toán bằng cách sử dụng các hạt giống (seeds) và một thứ gọi là bump. Nhưng chính xác bump là gì — và tại sao chúng ta lại lưu trữ nó?

Khi tạo một PDA, Solana yêu cầu địa chỉ được tạo ra không nằm trên đường cong ed25519 (vì nếu không, ai đó có thể tìm thấy khóa bí mật cho nó). Tuy nhiên, không phải mọi sự kết hợp hạt giống đều tạo ra một địa chỉ hợp lệ nằm ngoài đường cong.

Để khắc phục điều này, họ thêm một con số nhỏ — bump (một số nguyên không dấu 8-bit từ 0–255) — số này được điều chỉnh tự động trong quá trình tạo PDA để đảm bảo địa chỉ hợp lệ. Anchor xử lý việc tính toán bump tự động khi bạn khởi tạo PDA. Nhưng nếu chương trình của bạn cần tạo lại hoặc ký thay mặt cho PDA đó, bạn phải lưu trữ bump để có thể tái tạo các hạt giống hoặc địa chỉ chính xác đó.

👉 Trong ví dụ của chúng ta, chúng ta lưu trữ bump trong `BankInfo` vì chương trình sẽ cần PDA của Bank Vault để ký các chỉ lệnh sau này.

### 2. Khởi tạo một PDA
Bây giờ chúng ta đã hiểu PDA là gì, hãy cùng tìm hiểu cách tạo và khởi tạo một PDA trong Anchor.
Trong ứng dụng ngân hàng của chúng ta, chúng ta khởi tạo PDA `BankInfo` toàn cục khi chương trình được thiết lập lần đầu. Đây là cách thực hiện trong `instructions/initialize.rs`:
```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [BANK_INFO_SEED],
        bump,
        payer = authority,
        space = 8 + std::mem::size_of::<BankInfo>(),
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,
}
```

##### 🧪 Hãy cùng phân tích:
- `init`: Yêu cầu Anchor tạo một tài khoản PDA mới. Bạn chỉ có thể khởi tạo một PDA một lần — nếu nó đã tồn tại, giao dịch sẽ thất bại và bị hoàn tác. Nếu bạn cần sử dụng lại cùng một địa chỉ PDA, trước tiên bạn sẽ phải đóng tài khoản hiện có.
- `seeds` = [...]: Đây là các giá trị được sử dụng để tính toán địa chỉ PDA một cách xác định. Bạn có thể bao gồm nhiều giá trị hạt giống tùy thuộc vào trường hợp sử dụng của mình. Trong ví dụ này, chúng ta đang khởi tạo một tài khoản trạng thái toàn cục duy nhất, vì vậy chúng ta chỉ sử dụng một hạt giống tĩnh: `BANK_INFO_SEED`.
- `bump`: Hướng dẫn Anchor tự động tính toán một giá trị bump hợp lệ cho sự kết hợp hạt giống này.
- `payer`: Việc tạo một PDA yêu cầu không gian lưu trữ, và trên Solana, lưu trữ đi kèm với chi phí thuê (rent). Trường payer chỉ định người ký nào sẽ chi trả chi phí tạo tài khoản — trong trường hợp này là `authority`.
- `space`: Bao nhiêu không gian (tính bằng byte) để cấp phát cho tài khoản. Càng nhiều không gian PDA cần, payer càng phải trả nhiều chi phí.

Bank Vault được khởi tạo ngay sau tài khoản `BankInfo`, nhưng có một vài điểm khác biệt chính đáng lưu ý:
```rust
    #[account(
        init,
        seeds = [BANK_VAULT_SEED],
        bump,
        payer = authority,
        space = 0,
        owner = system_program::ID
    )]
    pub bank_vault: UncheckedAccount<'info>,
```
##### 🧩 Điểm khác biệt ở đây là gì?
+ *Không lưu trữ dữ liệu*: Không giống như `BankInfo`, PDA này không lưu trữ bất kỳ dữ liệu nào — do đó `space = 0`, và chúng ta không định nghĩa struct cho nó.
+ *Hệ thống sở hữu*: Tài khoản được tạo với `owner = system_program::ID`, có nghĩa là nó do Chương trình Hệ thống (System Program) sở hữu, không phải chương trình Anchor của bạn. Điều này nghe có vẻ lạ lúc đầu, nhưng đó là có chủ đích.
+ *Tại sao lại tạo PDA này?*
Vault này hoạt động như một bên giữ quỹ tập trung cho toàn bộ ứng dụng của bạn. Vì nó là một PDA được tính toán bằng cách sử dụng ID chương trình của bạn và một hạt giống đã biết, chương trình của bạn vẫn có thể ký thay cho nó và kiểm soát số dư SOL của nó.

**⚠️ Lưu ý quan trọng**: Lý do chúng ta sử dụng một PDA do Chương trình Hệ thống sở hữu là vì chỉ các tài khoản do Chương trình Hệ thống sở hữu mới có thể tham gia vào các giao dịch chuyển SOL gốc (native SOL transfers). Khi chuyển SOL bằng lệnh transfer, cả người gửi và người nhận đều phải là các tài khoản do hệ thống sở hữu. Đó là lý do tại sao chúng ta cấu trúc vault theo cách này — để phục vụ như một bể chứa SOL an toàn, do chương trình kiểm soát mà người dùng có thể gửi tiền vào hoặc rút tiền ra. Chúng ta sẽ tìm hiểu sâu hơn về cách thức hoạt động của nó khi chúng ta triển khai logic chuyển SOL thực tế trong phần tiếp theo.

Bây giờ cả hai PDA đã được tạo, hãy chuyển sang hàm xử lý (process) nơi chúng ta khởi tạo các trường của tài khoản `BankInfo`:
```rust
pub fn process(ctx: Context<Initialize>) -> Result<()> {
    let bank_info = &mut ctx.accounts.bank_info;

    bank_info.authority = ctx.accounts.authority.key();
    bank_info.is_paused = false;
    bank_info.bump = ctx.bumps.bank_vault;

    msg!("Bank initialized!");
    Ok(())
}
```
Ở đây chúng ta đang:
- Lưu khóa công khai của authority
- Đặt is_paused thành false theo mặc định
- Lưu trữ giá trị bump để ký PDA và tính toán lại địa chỉ trong tương lai

Đó là nội dung của chỉ lệnh `Initialize`.

Bây giờ, hãy xem cách chúng ta tạo các tài khoản PDA riêng cho từng người dùng — cụ thể là `UserReserve` — được xử lý trong file `instructions/deposit.rs`:
```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        init_if_needed,
        seeds = [USER_RESERVE_SEED, user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + std::mem::size_of::<UserReserve>(),
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,
}
```
Nhìn thoáng qua, điều này trông giống như cách chúng ta đã khởi tạo `BankInfo` phải không? Nhưng có một số khác biệt chính:
- `init_if_needed`: Chỉ thị này kiểm tra xem PDA đã tồn tại chưa. Nếu chưa, Anchor sẽ tự động tạo nó; nếu rồi, PDA hiện có sẽ được tải vào với quyền thay đổi (mutable). Điều này hoàn hảo cho một chỉ lệnh như `Deposit`, vốn có thể được gọi nhiều lần bởi cùng một người dùng - không cần phải viết thêm logic để kiểm tra xem tài khoản có tồn tại hay không trước khi sử dụng.
- `seeds`: Lần này, chúng ta sử dụng hai hạt giống - một hạt giống không đổi `USER_RESERVE_SEED` và khóa công khai của người dùng `user.key().as_ref()` (được chuyển đổi thành `&[u8]`). Mô hình này đảm bảo rằng mỗi người dùng có một PDA duy nhất của riêng họ — vì vậy không có hai người dùng nào dùng chung một tài khoản UserReserve. Nó cũng có nghĩa là mỗi người dùng chỉ có thể có một PDA UserReserve duy nhất được tính toán theo cách này, điều này giúp đảm bảo tính nhất quán và bảo mật.

Sau đó, chúng ta xử lý logic gửi tiền trong hàm `process` như thế này:
```rust
pub fn process(ctx: Context<Deposit>, deposit_amount: u64) -> Result<()> {
    if ctx.accounts.bank_info.is_paused {
        return Err(BankAppError::BankAppPaused.into());
    }

    let user_reserve = &mut ctx.accounts.user_reserve;

    sol_transfer_from_user(
        &ctx.accounts.user,
        ctx.accounts.bank_info.to_account_info(),
        &ctx.accounts.system_program,
        deposit_amount,
    )?;

    user_reserve.deposited_amount += deposit_amount;

    Ok(())
}
```

Trong hàm này, trước khi cho phép bất kỳ khoản tiền gửi nào, chương trình trước tiên sẽ kiểm tra trạng thái của `BankInfo`:
```rust
if ctx.accounts.bank_info.is_paused {
    return Err(BankAppError::BankAppPaused.into());
}
```
Nếu ngân hàng đang bị tạm dừng (có thể do trường hợp khẩn cấp hoặc nâng cấp), giao dịch sẽ bị từ chối với lỗi thích hợp.

Sau đó, chúng ta chuyển SOL từ người dùng sang PDA `BankInfo` — PDA này đóng vai trò là kho quỹ toàn cục chứa tất cả số tiền đã gửi.
Việc chuyển tiền thực tế được xử lý bằng một hàm trợ giúp được định nghĩa trong `transfer_helper.rs`:
```rust
// Chuyển SOL từ người dùng
pub fn sol_transfer_from_user<'info>(
    signer: &Signer<'info>,
    destination: AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let ix = transfer(signer.key, destination.key, amount);
    invoke(
        &ix,
        &[
            signer.to_account_info(),
            destination,
            system_program.to_account_info(),
        ],
    )?;
    Ok(())
}
```
Vì người dùng là người ký trong trường hợp này, chúng ta chỉ cần sử dụng `invoke()` để thực hiện chuyển khoản.
Sau này, khi chúng ta thực hiện rút tiền, chương trình sẽ cần ký thay mặt cho PDA Bank Vault — và đối với việc đó, chúng ta sẽ sử dụng `invoke_signed()`.

Cuối cùng, chúng ta cập nhật PDA UserReserve của người dùng để phản ánh số tiền mới đã gửi:
```rust
user_reserve.deposited_amount += deposit_amount;
```
Bây giờ bạn đã biết cách tạo, khởi tạo và tương tác với PDA bên trong chương trình, hãy chuyển sang phía Client.
➡️ Trong phần tiếp theo, chúng ta sẽ tìm hiểu cách tính toán địa chỉ PDA từ Anchor TypeScript client để có thể gọi các chỉ lệnh này đúng cách từ frontend hoặc script.

### 3. Tính toán PDA ở Client
Để tương tác với chương trình từ frontend hoặc script (như gọi `initialize` hoặc `deposit`), bạn cần tính toán cùng một địa chỉ PDA mà chương trình mong đợi. May mắn thay, Anchor làm điều này rất dễ dàng ở phía TypeScript client.

Hãy xem cách thực hiện bằng chính logic chúng ta đã sử dụng trong chương trình.
Địa chỉ PDA được tính toán bằng công thức sau:
```ts
PublicKey.findProgramAddressSync([SEEDS], PROGRAM_ID)
```
- `SEEDS` là một mảng các byte (Buffer) phải khớp chính xác với những gì chương trình sử dụng.
- `PROGRAM_ID` là ID chương trình đã triển khai của bạn.

Trong bank-app của chúng ta, chúng ta tính toán hai PDA.
Đây là cách chúng được định nghĩa trong `tests/bank-app.ts`:
```ts
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
```
Lưu ý rằng `userReserve` là một hàm. Điều này cho phép bạn tạo động một PDA duy nhất cho mỗi người dùng dựa trên khóa công khai của họ.
Bằng cách tính toán PDA theo cách này, bạn đảm bảo client của mình luôn sử dụng đúng tài khoản — chính xác như chương trình của bạn mong đợi.

### 4. Đến lúc bắt tay vào xây dựng rồi! 💪 (Đến lượt bạn!)
Bây giờ bạn đã hiểu cách tạo và sử dụng PDA, đến lượt bạn đưa nó vào thực tế.

🛠️ Nhiệm vụ của bạn:
1. **Triển khai `sol_transfer_from_pda` trong `transfer_helper.rs`**
Hàm này sẽ chuyển SOL từ một PDA (như BankInfo) trở lại người dùng.
Vì PDA không thể tự ký, bạn sẽ cần sử dụng `invoke_signed()` và truyền vào đúng `signers_seeds`.

2. **Hoàn thành Chỉ lệnh `Withdraw` (Rút tiền)**
Cho phép người dùng rút số SOL đã gửi của họ từ vault (tức là từ PDA Bank Vault).
Chúng tôi đã cung cấp các hạt giống (seeds) của PDA cho chỉ lệnh này — bạn chỉ cần lắp chúng vào để sử dụng `invoke_signed()` một cách chính xác.

3. **Triển khai Chỉ lệnh `Pause` (Tạm dừng)**
Thêm logic để tạm dừng hoặc bỏ tạm dừng ứng dụng. Chỉ authority được định nghĩa trong BankInfo mới có quyền thực hiện việc này.
💡 Gợi ý: Sử dụng `#[account(address = ...)]` của Anchor để hạn chế quyền truy cập.

4. **Đừng quên viết Test trong `bank-app.ts`**
Tạo các bản kiểm thử cho các lệnh `Withdraw` và `Pause` mới của bạn.
Hãy nhớ:
- Rút đúng số tiền và xác minh số tiền cập nhật trong `UserReserve`.
- Kiểm tra việc tạm dừng và bỏ tạm dừng ứng dụng, đồng thời đảm bảo việc gửi/rút tiền bị chặn khi bị tạm dừng.

Khi bạn hoàn thành các nhiệm vụ này, bạn sẽ có kinh nghiệm thực tế trong việc quản lý quyền hạn PDA, bảo mật các tập lệnh và ký thay mặt cho một PDA — những khối xây dựng thiết yếu cho bất kỳ nhà phát triển Solana nghiêm túc nào.

🚀 Hãy cùng bắt đầu xây dựng nào!
