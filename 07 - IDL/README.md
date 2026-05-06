# Phần VII - Làm việc với Anchor IDL

Sau những bài học nặng về runtime constraint và tối ưu hóa, bài này sẽ nhẹ nhàng hơn nhiều. Chúng ta sẽ tìm hiểu về **IDL (Interface Description Language)** — thành phần kết nối giữa on-chain program và off-chain client.

Đến cuối bài học, bạn sẽ:

✅ Hiểu IDL là gì, tại sao nó tồn tại, và nó chứa những gì
✅ Biết cách Anchor sinh IDL từ mã nguồn Rust
✅ Hiểu cơ chế discriminator của Anchor
✅ Biết cách tìm IDL của program bên thứ ba khi không có source code
✅ Biết cách tạo CPI crate từ IDL bằng `anchor-gen`
✅ Biết cách sử dụng IDL từ TypeScript client mà không cần source code
✅ Hiểu `**invoke` và `invoke_signed`** trong CPI khi bạn tự build instruction từ IDL (hoặc raw), và **khi nào** gọi trực tiếp thay vì Anchor CPI wrapper

---

## 1. IDL là gì?

Khi bạn viết một Anchor program, mã nguồn Rust định nghĩa tất cả: instruction, account struct, tham số, error code. Nhưng client (TypeScript, Python, mobile app...) không đọc được Rust. Vậy làm sao client biết:

- Program có những instruction nào?
- Mỗi instruction cần tài khoản gì, tham số gì?
- Dữ liệu account trông như thế nào?
- Program có những error code gì?

**IDL** giải quyết vấn đề này. Nó là một file JSON mô tả **giao diện công khai** (public interface) của program — giống khái niệm ABI trong Ethereum hoặc `.proto` file trong gRPC.

IDL không phải program — nó là **bản đặc tả** (specification) để client biết cách giao tiếp với program. Theo [Anchor docs](https://www.anchor-lang.com/docs/basics/idl), IDL cung cấp:

- **Standardization**: Format nhất quán mô tả instruction và account
- **Client Generation**: Từ IDL, Anchor SDK tự động generate code để tương tác với program

### Một IDL chứa gì?

IDL có 5 phần chính:


| Phần           | Mô tả                                          | Tương ứng trong Rust           |
| -------------- | ---------------------------------------------- | ------------------------------ |
| `instructions` | Danh sách instruction: tên, tài khoản, tham số | Hàm trong `#[program]`         |
| `accounts`     | Định nghĩa struct cho dữ liệu on-chain         | Struct với `#[account]`        |
| `types`        | Các kiểu dữ liệu tùy chỉnh (enum, struct)      | Struct/enum dùng trong program |
| `events`       | Các event được emit qua `emit!()`              | Struct với `#[event]`          |
| `errors`       | Mã lỗi và thông báo                            | Enum với `#[error_code]`       |


Ví dụ IDL cho một instruction `initialize`:

```json
{
  "version": "0.1.0",
  "name": "bank_app",
  "instructions": [
    {
      "name": "initialize",
      "discriminator": [175, 175, 109, 31, 13, 152, 155, 237],
      "accounts": [
        { "name": "authority", "writable": true, "signer": true },
        { "name": "bankInfo", "writable": true, "signer": false }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "BankInfo",
      "discriminator": [34, 122, 58, 92, 210, 117, 48, 55],
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "isPaused", "type": "bool" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "You are not authorized to perform this action"
    }
  ]
}
```

---

## 2. Cách Anchor sinh IDL

Khi bạn chạy `anchor build` hoặc `anchor idl build`, Anchor thực hiện:

1. **Phân tích mã nguồn Rust**: Quét các macro `#[program]`, `#[derive(Accounts)]`, `#[account]`, `#[error_code]`, `#[event]`
2. **Sinh file IDL JSON**: Tại `target/idl/<program_name>.json`
3. **Sinh TypeScript types**: Tại `target/types/<program_name>.ts` — được suy ra từ IDL

TypeScript type file chính là thứ bạn import khi viết test:

```typescript
import { BankApp } from "../target/types/bank_app";
const program = anchor.workspace.BankApp as Program<BankApp>;
```

Anchor SDK dùng file type này để cung cấp autocomplete và type-checking khi gọi `program.methods.deposit(...)`.

---

## 3. Discriminator — Cách Anchor phân biệt Instruction và Account

Mỗi Anchor program có nhiều instruction và nhiều loại account. Khi runtime nhận được instruction data, làm sao nó biết đây là lệnh `deposit` hay `withdraw`? Khi đọc account data, làm sao biết đây là `BankInfo` hay `UserReserve`?

Câu trả lời: **discriminator** — 8 byte đầu tiên của instruction data hoặc account data.

### Instruction discriminator

Được tính bằng: `sha256("global:<instruction_name>")[0..8]`

Ví dụ cho instruction `initialize`:

```
sha256("global:initialize") = af af 6d 1f 0d 98 9b ed ...
discriminator = [175, 175, 109, 31, 13, 152, 155, 237]
```

Khi client gọi `program.methods.initialize().rpc()`, Anchor SDK tự động:

1. Tính discriminator từ tên instruction
2. Đặt 8 byte discriminator làm phần đầu của instruction data
3. Serialize các tham số phía sau discriminator

Khi program nhận instruction, Anchor macro tự động:

1. Đọc 8 byte đầu → xác định instruction nào
2. Deserialize phần còn lại → tham số

### Account discriminator

Tương tự, nhưng prefix khác: `sha256("account:<AccountName>")[0..8]`

8 byte đầu tiên của mọi Anchor account data luôn là discriminator. Đó là lý do `space` khi init account luôn có `8 + ...`:

```rust
#[account(init, payer = user, space = 8 + std::mem::size_of::<BankInfo>())]
pub bank_info: Account<'info, BankInfo>,
```

`8` byte đầu = discriminator, phần còn lại = dữ liệu struct.

### Thay đổi qua các phiên bản Anchor

Từ v0.30 trở đi, discriminator được **ghi rõ** trong IDL file. Ở phiên bản cũ (≤ 0.29), client phải tự tính. Ngoài ra, tên các trường account cũng thay đổi:


| Phiên bản Anchor | Trường tài khoản trong IDL |
| ---------------- | -------------------------- |
| ≤ 0.29.x         | `isSigner`, `isMut`        |
| ≥ 0.30.0         | `signer`, `writable`       |


Đây là lý do bạn có thể gặp lỗi khi dùng IDL từ program cũ với Anchor SDK mới (hoặc ngược lại).

---

## 4. IDL on-chain và cách tìm IDL

### Lưu IDL on-chain

Anchor cung cấp các lệnh CLI để quản lý IDL on-chain:

```bash
# Upload IDL lên on-chain lần đầu
anchor idl init -f target/idl/bank_app.json <PROGRAM_ID>

# Cập nhật IDL đã tồn tại
anchor idl upgrade <PROGRAM_ID> -f target/idl/bank_app.json

# Fetch IDL từ on-chain
anchor idl fetch <PROGRAM_ID>

# Xem authority của IDL account
anchor idl authority <PROGRAM_ID>
```

Tuy nhiên, **trên thực tế hầu hết protocol không upload IDL on-chain**. Lệnh `anchor deploy` không tự động upload IDL — developer phải chạy `anchor idl init` riêng, và hầu hết bỏ qua bước này.

### Cách tìm IDL khi không có source code

Đây là tình huống bạn gặp thường xuyên khi muốn tích hợp với protocol bên thứ ba. Thứ tự ưu tiên:

**1. Tìm trên GitHub của protocol**

Hầu hết các protocol DeFi lớn (Jupiter, Raydium, Marinade, Orca...) đều có repo public. IDL nằm trong thư mục `target/idl/` hoặc trong documentation.

Ví dụ: [Jupiter Earn - CPI docs](https://github.com/jup-ag/jupiter-lend/blob/main/docs/earn/cpi.md)

**2. Tìm trong documentation / Gitbook**

Nhiều protocol có trang doc riêng với hướng dẫn tích hợp kèm IDL.

**3. Fetch từ on-chain (nếu có)**

```bash
anchor idl fetch -p mainnet <PROGRAM_ID>
```

Nhưng như đã nói, đa số sẽ trả về lỗi:

```
Error: IDL not found
```

**4. Dùng IDL Extractor**

Nếu tất cả cách trên thất bại, bạn có thể thử [solana-idl-extractor](https://github.com/dvrvsimi/solana-idl-extractor) — tool này phân tích bytecode trên on-chain để tái tạo lại IDL. Lưu ý: kết quả không 100% chính xác, có thể thiếu tên trường hoặc sai kiểu dữ liệu.

---

## 5. Cấu trúc chi tiết IDL

### Phần Instructions

Mỗi instruction mô tả:

- `name`: tên instruction (khớp với tên hàm Rust)
- `discriminator`: 8 byte identifier (từ Anchor ≥ 0.30)
- `accounts`: danh sách tài khoản cần thiết, mỗi tài khoản có `name`, `writable`, `signer`, và tùy chọn `pda` (mô tả seeds)
- `args`: danh sách tham số với tên và kiểu dữ liệu
- `returns`: kiểu trả về (thường `null` cho Solana program)

```json
{
  "name": "deposit",
  "discriminator": [242, 35, 198, 137, 82, 225, 242, 182],
  "accounts": [
    {
      "name": "user",
      "writable": true,
      "signer": true,
      "docs": ["The user depositing SOL"]
    },
    {
      "name": "bankVault",
      "writable": true,
      "pda": {
        "seeds": [
          { "kind": "const", "value": [66, 65, 78, 75, 95, 86, 65, 85, 76, 84] }
        ]
      }
    }
  ],
  "args": [
    { "name": "amount", "type": "u64" }
  ]
}
```

Mỗi giá trị trong mảng `value` của PDA seed là mã ASCII. Ví dụ `[66, 65, 78, 75, ...]` = `"BANK_VAULT"`. Có hai loại seed:

- `"kind": "const"` — giá trị cố định, client có thể tính trực tiếp
- `"kind": "account"` — public key của một account khác, client phải tự cung cấp

### Phần Accounts

Mô tả cấu trúc dữ liệu được lưu trên các account do program tạo:

```json
{
  "accounts": [
    {
      "name": "BankInfo",
      "discriminator": [34, 122, 58, 92, 210, 117, 48, 55],
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "isPaused", "type": "bool" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ]
}
```

Client dùng thông tin này để deserialize data khi fetch account.

### Phần Types

Các struct/enum tùy chỉnh được dùng làm tham số hoặc dữ liệu:

```json
{
  "types": [
    {
      "name": "StakeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "minStake", "type": "u64" },
          { "name": "maxStake", "type": "u64" },
          { "name": "apr", "type": "u16" }
        ]
      }
    }
  ]
}
```

### Phần Errors

Custom error code bắt đầu từ 6000 (Anchor sử dụng 0-5999 cho lỗi nội bộ):

```json
{
  "errors": [
    { "code": 6000, "name": "Unauthorized", "msg": "Not authorized" },
    { "code": 6001, "name": "InsufficientFunds", "msg": "Insufficient funds" }
  ]
}
```

Client có thể match error code để hiển thị thông báo phù hợp thay vì hiện hex error.

---

## 6. Từ IDL tạo CPI Crate với `anchor-gen`

Khi bạn muốn gọi một program bên ngoài bằng CPI nhưng không có source code trong workspace (chỉ có IDL), tool `[anchor-gen](https://github.com/saber-hq/anchor-gen)` giúp sinh ra CPI crate từ file IDL.

### Các bước thực hiện

**1. Tạo crate mới:**

```bash
cargo init my-cpi-crate --lib
```

**2. Thêm dependency:**

```toml
# Cargo.toml
[dependencies]
anchor-gen = "0.4.1"  # Dùng 0.3.1 nếu Anchor ≤ 0.29
```

Chọn đúng phiên bản:


| Phiên bản Anchor | `anchor-gen` version | Lý do                                 |
| ---------------- | -------------------- | ------------------------------------- |
| ≤ 0.29.x         | `0.3.1`              | IDL format cũ (`isSigner`, `isMut`)   |
| ≥ 0.30.0         | `0.4.1`              | IDL format mới (`signer`, `writable`) |


**3. Trong `src/lib.rs`, gọi proc macro:**

```rust
anchor_gen::generate_cpi_crate!("../../path/to/idl.json");
```

**4. Build:**

```bash
cargo build
```

`anchor-gen` không sinh file Rust vào thư mục `src/` — nó generate code **nội bộ** qua proc macro. Muốn xem code được sinh ra, dùng:

```bash
cargo expand
```

**5. Import crate trong program của bạn:**

```toml
# Cargo.toml của bank-app
[dependencies]
my-cpi-crate = { path = "../my-cpi-crate", features = ["cpi"] }
```

Sau đó sử dụng CPI types giống như bình thường:

```rust
use my_cpi_crate::cpi;
use my_cpi_crate::cpi::accounts::Stake;

cpi::stake(
    CpiContext::new_with_signer(..., Stake { ... }, signer_seeds),
    amount,
    is_stake,
)?;
```

---

## 7. Điều gì xảy ra bên dưới mọi abstraction

Dù bạn dùng Anchor CPI helper, hay `anchor-gen`, hay gọi trực tiếp bằng `invoke` — tất cả đều làm **đúng 3 việc**:

1. **Tính discriminator**: `sha256("global:<instruction_name>")[0..8]`
2. **Serialize tham số**: Encode các argument theo Borsh format (little-endian)
3. **Xây dựng danh sách `AccountMeta`**: Đúng thứ tự, đúng flags (`is_writable`, `is_signer`)

Khi bạn hiểu 3 bước này, bạn có thể gọi **bất kỳ Anchor program nào** chỉ với IDL — không cần source code, không cần crate, không cần tool.

---

## 8. `invoke`, `invoke_signed` và CPI từ IDL

Sau khi bạn đã có **discriminator**, **args** và **danh sách account** đúng thứ tự từ IDL , bước cuối trên on-chain là **gửi instruction đó sang program đích** bằng runtime CPI. Hai API lõi của Solana là `solana_program::program::invoke` và `invoke_signed`.

### `invoke` vs `invoke_signed`

- `**invoke(&instruction, account_infos)`** — Dùng khi **mọi signer** mà instruction yêu cầu đã là signer của giao dịch (ví dụ user ký ngoài), hoặc không cần PDA của **chính program bạn** ký thay. Ví dụ: trong Phần VI, vòng lặp `multi_send` gọi System Program transfer với `sender` đã là signer.
- `**invoke_signed(&instruction, account_infos, signer_seeds)`** — Bắt buộc khi một account trong CPI phải ký với quyền **PDA** thuộc program của bạn: bạn truyền `&[&[seed1, seed2, …, bump]]` để runtime xác minh PDA và coi như signer trong frame CPI.

Khi bạn chỉ có IDL và tự `Instruction { program_id, accounts, data }`, bạn chọn một trong hai tùy instruction đó cần ai ký.

### Vấn đề: CPI depth khi dùng Anchor CPI helper

Khi dùng Anchor CPI helper (hoặc crate sinh từ `anchor-gen`), call stack thường sâu hơn cần thiết:

```
Your instruction handler
 → Anchor CPI wrapper method
   → SPL Token CPI module
     → invoke_signed()
       → SPL Token Program
```

Mỗi lớp wrapper thêm chi phí stack / depth. Nếu program của bạn đã ở CPI depth 2–3, thêm vài lớp có thể gần hoặc vượt giới hạn.

### Giải pháp: Gọi `invoke_signed` trực tiếp

Bỏ qua wrapper, tự xây instruction (từ IDL hoặc từ `spl_token::instruction::transfer`, v.v.) và gọi thẳng:

```rust
use solana_program::program::invoke_signed;

let transfer_ix = spl_token::instruction::transfer(
    &spl_token::ID,
    &ctx.accounts.source.key(),
    &ctx.accounts.destination.key(),
    &ctx.accounts.authority.key(),
    &[],
    amount,
)?;

invoke_signed(
    &transfer_ix,
    &[
        ctx.accounts.source.to_account_info(),
        ctx.accounts.destination.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ],
    &[signer_seeds],
)?;
```

Stack nông hơn:

```
Your instruction handler
 → invoke_signed()
   → SPL Token Program
```

**Khi nào cân nhắc:** program đã ở CPI depth sâu, hoặc CPI đơn giản chỉ chuyển tiếp một lệnh tới program khác. **Khi nào giữ Anchor wrapper:** instruction phức tạp, nhiều account cần validate — wrapper giúp an toàn và đỡ lỗi hơn.

Mối liên hệ với **Bài tập 3** (raw instruction từ IDL): phần TODO “gọi `invoke`” chính là bước nối sau khi bạn đã ghép `data` + `AccountMeta` đúng IDL.

---

## 9. Bài tập

### Bài tập 1: Tạo CPI Crate từ IDL

Bây giờ hãy tự thực hành. Sử dụng `anchor-gen`, chuyển đổi file idl.json (từ staking-app), sử dụng CPI được tạo ra đó, thay đổi phần import trong `bank-app`, và chạy thử nghiệm (test). Kết quả sẽ tương tự như phiên bản mã nguồn cũ của bạn, khi không sử dụng crate.

### Bài tập 2: Gọi Program Thông Qua Raw Instruction

Thay vì dùng Anchor CPI hay `anchor-gen`, bạn sẽ gọi staking-app hoàn toàn thủ công bằng cách tự build instruction data từ discriminator. Đây là cách duy nhất khi bạn chỉ có IDL và không có bất kỳ crate nào hỗ trợ.

#### 1. Tìm discriminator từ IDL

Anchor tính discriminator bằng `sha256("global:<instruction_name>")[0..8]`.
Tính discriminator của instruction `stake` trong TypeScript:

```typescript
import { utils } from "@coral-xyz/anchor";

const discriminator = utils.sha256.hash("global:stake").slice(0, 8);
```

Sau đó xác nhận lại bằng cách so sánh với discriminator trong `idl.json` (nếu có field này).

#### 2. Gọi từ on-chain program bằng `invoke`

Trong một program bank-app, dùng `invoke/invoked` để gọi staking-app với raw instruction data 

```rust
use solana_program::{
    account_info::AccountInfo,
    instruction::{AccountMeta, Instruction},
    program::invoke,
    pubkey::Pubkey,
};

pub fn call_stake_raw(
    accounts: &[AccountInfo],
    staking_program_id: &Pubkey,
    amount: u64,
    is_stake: bool,
) -> ProgramResult {
    // TODO: Build instruction data
    // - Discriminator: lấy từ IDL
    // - amount: to_le_bytes() → 8 bytes
    // - is_stake: 1 byte (1 hoặc 0)
    let mut data: Vec<u8> = vec![];
    // TODO

    // TODO: Build AccountMeta list theo đúng thứ tự IDL
    let account_metas = vec![
        // TODO
    ];

    let instruction = Instruction {
        program_id: *staking_program_id,
        accounts: account_metas,
        data,
    };

    // TODO: Gọi invoke với instruction và account_infos tương ứng

    Ok(())
}
```

#### 3. Viết test xác nhận

Từ TypeScript test, gọi program mới của bạn, program đó sẽ forward sang staking-app. Assert rằng kết quả giống hệt gọi với CPI.

---

**Điểm mấu chốt**: Mọi CPI của Anchor, mọi `anchor-gen`, cuối cùng đều làm đúng 3 việc — tính discriminator, serialize args, build `AccountMeta` list. Khi bạn làm thủ công một lần, bạn hiểu tất cả các abstraction bên trên đang làm gì.