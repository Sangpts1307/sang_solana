# Phần V - Versioned Transaction

Chúc mừng bạn đã hoàn thành 4 bài học cơ bản! Từ bài này trở đi, chúng ta sẽ đi sâu hơn vào các chủ đề nâng cao của Solana. Bài học đầu tiên trong chuỗi nâng cao này là **Versioned Transaction** — một nâng cấp quan trọng cho định dạng giao dịch của Solana, giúp mở rộng giới hạn số lượng tài khoản mà một giao dịch có thể sử dụng.

Trong phần này, bạn sẽ:  
✅ Hiểu cấu trúc giao dịch trên Solana và giới hạn của nó  
✅ Nắm được sự khác biệt giữa Legacy Transaction và Versioned Transaction  
✅ Tìm hiểu Address Lookup Table (ALT) — cơ chế nén địa chỉ tài khoản  
✅ Thực hành tạo ALT, xây dựng và gửi Versioned Transaction từ TypeScript client  
✅ Áp dụng vào Bank App để xử lý các thao tác hàng loạt

Bắt đầu thôi! 🚀

---

### 1. Cấu trúc Giao dịch trên Solana

Trước khi tìm hiểu Versioned Transaction, hãy ôn lại cấu trúc của một giao dịch Solana. Theo [tài liệu chính thức của Solana](https://solana.com/docs/core/transactions), một giao dịch bao gồm:

- **Signatures**: Danh sách chữ ký Ed25519 (mỗi chữ ký 64 byte) từ các tài khoản cần ký.
- **Message**: Nội dung giao dịch, bao gồm:
  - **Header**: Metadata mô tả số lượng signer, readonly account.
  - **Account Keys**: Danh sách tất cả các địa chỉ tài khoản tham gia giao dịch (mỗi địa chỉ 32 byte).
  - **Recent Blockhash**: Một blockhash gần đây (hợp lệ trong 150 slot) để đảm bảo giao dịch không bị replay.
  - **Instructions**: Danh sách các instruction cần thực thi.

Dưới đây là một số giới hạn quan trọng:

| Giới hạn | Giá trị | Ghi chú |
|---|---|---|
| Kích thước tối đa giao dịch | 1.232 byte | Dựa trên IPv6 MTU (1.280 byte) trừ 48 byte header mạng |
| Số tài khoản tối đa / giao dịch | 64 | Giới hạn bởi runtime |
| Kích thước mỗi địa chỉ | 32 byte | Khóa công khai Ed25519 |
| Kích thước mỗi chữ ký | 64 byte | Ed25519 signature |
| Thời hạn blockhash | 150 slot | Khoảng ~1 phút |

**Vấn đề thực tế**: Với giới hạn 1.232 byte, sau khi trừ đi chữ ký, header, blockhash, và dữ liệu instruction, bạn chỉ có thể đưa vào khoảng **35 địa chỉ tài khoản** trong một giao dịch legacy. Đối với các ứng dụng đơn giản, con số này là đủ. Nhưng khi bạn xây dựng:

- Giao thức DeFi cần swap qua nhiều pool
- Sàn giao dịch NFT xử lý nhiều item cùng lúc  
- Hệ thống thanh toán hàng loạt (batch payment)
- Bất kỳ ứng dụng nào cần tương tác với nhiều tài khoản

...thì giới hạn ~35 tài khoản nhanh chóng trở thành rào cản.

---

### 2. Legacy Transaction vs Versioned Transaction

Solana runtime hỗ trợ hai phiên bản giao dịch:

#### Legacy Transaction

Đây là định dạng giao dịch ban đầu của Solana. Tất cả các địa chỉ tài khoản phải được liệt kê trực tiếp trong trường `account_keys` của message. Điều này có nghĩa là mỗi tài khoản tiêu tốn 32 byte trong giao dịch.

```
Legacy Transaction
├── Signatures: [sig1, sig2, ...]         (64 byte x N)
└── Message (Legacy)
    ├── Header: { num_signers, num_readonly_signed, num_readonly_unsigned }
    ├── Account Keys: [addr1, addr2, ...]  (32 byte x M) ← tất cả phải liệt kê đầy đủ
    ├── Recent Blockhash
    └── Instructions: [ix1, ix2, ...]
```

Byte đầu tiên của message biểu thị `num_required_signatures`. Vì giá trị này luôn nhỏ (tối đa 19 signer cho giao dịch hợp lệ), **bit cao nhất (MSB) của byte đầu tiên luôn bằng 0** trong legacy transaction. Đặc điểm này được tận dụng để phân biệt với versioned transaction.

#### Versioned Transaction (v0)

Versioned Transaction được thiết kế để giải quyết giới hạn tài khoản. Điểm khác biệt lớn nhất: nó cho phép **tham chiếu tài khoản thông qua Address Lookup Table** thay vì phải liệt kê đầy đủ 32 byte.

```
Versioned Transaction
├── Signatures: [sig1, sig2, ...]
└── Message (v0)
    ├── Header
    ├── Account Keys: [addr1, addr2, ...]     ← chỉ chứa signer và các tài khoản quan trọng
    ├── Recent Blockhash
    ├── Instructions: [ix1, ix2, ...]
    └── Address Table Lookups: [              ← PHẦN MỚI
        {
          account_key: <ALT address>,
          writable_indexes: [0, 2, 5],        ← index trong ALT cho tài khoản writable
          readonly_indexes: [1, 3]            ← index trong ALT cho tài khoản readonly
        }
      ]
```

Khi runtime thực thi giao dịch v0, danh sách tài khoản đầy đủ được xây dựng bằng cách ghép nối:
1. `account_keys` từ message (liệt kê trực tiếp)
2. Các địa chỉ writable được tra cứu từ ALT
3. Các địa chỉ readonly được tra cứu từ ALT

Byte đầu tiên của versioned message có **MSB = 1**, 7 bit còn lại chứa số phiên bản (hiện tại là `0`). Đây là cách runtime phân biệt legacy vs versioned transaction.

<!-- **Tóm tắt sự khác biệt:**

| Đặc điểm | Legacy | Versioned (v0) |
|---|---|---|
| Tham chiếu tài khoản | Trực tiếp (32 byte / địa chỉ) | Qua ALT (1 byte index / địa chỉ) |
| Số tài khoản thực tế | ~35 | Lên tới 64 (với ALT) |
| Address Lookup Tables | Không hỗ trợ | Hỗ trợ |
| Kích thước giao dịch | Tối đa 1.232 byte | Tối đa 1.232 byte (nhưng chứa được nhiều tài khoản hơn) |
| Tương thích ngược | Luôn được hỗ trợ | Cần client hỗ trợ v0 | -->

> 📝 **Lưu ý quan trọng**: Các signer (tài khoản cần ký) **không thể** được tải qua ALT — địa chỉ đầy đủ của mỗi signer phải có trong `account_keys`. Điều này đảm bảo hiệu năng kiểm tra chữ ký không bị ảnh hưởng.

---

### 3. Address Lookup Table (ALT)

Address Lookup Table là một tài khoản on-chain lưu trữ danh sách các khóa công khai. Nó hoạt động giống một "danh bạ" — thay vì ghi đầy đủ địa chỉ 32 byte mỗi lần, bạn chỉ cần ghi số thứ tự (index) 1 byte trong bảng.

Mỗi ALT có thể lưu tối đa **256 địa chỉ** (vì index là `u8`, phạm vi 0-255).

#### Vòng đời của ALT

```
Tạo ALT → Thêm địa chỉ (Extend) → Sử dụng trong giao dịch → Hủy kích hoạt → Đóng (thu hồi rent)
```

Một số quy tắc quan trọng:

- **Warmup**: Sau khi thêm địa chỉ mới, cần đợi **ít nhất 1 slot** trước khi có thể sử dụng chúng trong giao dịch. Cụ thể, chỉ các địa chỉ được thêm trước slot hiện tại mới có thể được tra cứu.
- **Append-only**: ALT chỉ cho phép thêm, không cho phép sửa hay xóa địa chỉ. Thiết kế này ngăn chặn tấn công front-running (kẻ tấn công không thể thay đổi địa chỉ đã được tham chiếu).
- **Deactivation cooldown**: Khi hủy kích hoạt một ALT, nó vẫn có thể được sử dụng cho đến khi slot hủy kích hoạt không còn trong `SlotHashes` sysvar. Điều này đảm bảo các giao dịch đang xử lý không bị ảnh hưởng.
- **Địa chỉ duy nhất**: Mỗi ALT được khởi tạo tại một địa chỉ được derive từ một slot gần đây, nên không thể tạo lại ALT tại cùng một địa chỉ sau khi đóng.

#### Cấu trúc dữ liệu của ALT (on-chain)

```rust
pub struct LookupTableMeta {
    pub deactivation_slot: Slot,
    pub last_extended_slot: Slot,
    pub last_extended_slot_start_index: u8,
    pub authority: Option<Pubkey>,
    // Danh sách địa chỉ nằm ngay sau metadata trong data của account
}
```

- `authority`: Tài khoản có quyền thêm địa chỉ và hủy kích hoạt ALT. Nếu `None`, ALT trở thành bất biến (immutable).
- `deactivation_slot`: Slot mà ALT bị hủy kích hoạt. Mặc định là `u64::MAX` (chưa hủy).
- `last_extended_slot`: Slot cuối cùng mà ALT được mở rộng, dùng để enforce quy tắc warmup.

---

### 4. Thực hành: Xây dựng Versioned Transaction

Bây giờ chúng ta sẽ đi qua từng bước để tạo và sử dụng Versioned Transaction với `@solana/web3.js`.

#### Bước 1: Tạo ALT

```typescript
import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";

async function createLookupTable(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  const slot = await connection.getSlot();

  const [createIx, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: slot,
    });

  const tx = new Transaction().add(createIx);
  await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("ALT created:", lookupTableAddress.toBase58());
  return lookupTableAddress;
}
```

`createLookupTable` trả về cả instruction lẫn địa chỉ ALT. Địa chỉ được derive từ `authority` và `recentSlot`, vì vậy nó có tính xác định nhưng không thể tái tạo sau khi đóng (vì slot sẽ khác).

#### Bước 2: Thêm địa chỉ vào ALT

```typescript
async function extendLookupTable(
  connection: Connection,
  payer: Keypair,
  lookupTableAddress: PublicKey,
  addresses: PublicKey[]
): Promise<void> {
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lookupTableAddress,
    addresses: addresses,
  });

  const tx = new Transaction().add(extendIx);
  await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log(`Added ${addresses.length} addresses to ALT`);
}
```

> ⚠️ Do giới hạn kích thước giao dịch, mỗi lần extend chỉ thêm được khoảng **20 địa chỉ**. Nếu cần thêm nhiều hơn, hãy chia thành nhiều giao dịch extend.

#### Bước 3: Chờ warmup và lấy ALT

Sau khi extend, bạn cần đợi ít nhất 1 slot (~400ms) trước khi các địa chỉ mới có thể được sử dụng:

```typescript
async function fetchLookupTable(
  connection: Connection,
  lookupTableAddress: PublicKey
) {
  const result = await connection.getAddressLookupTable(lookupTableAddress);
  if (!result.value) {
    throw new Error("ALT not found or not yet activated");
  }

  console.log("ALT addresses:", result.value.state.addresses.length);
  return result.value;
}
```

`getAddressLookupTable` trả về một `AddressLookupTableAccount` chứa metadata và danh sách địa chỉ. Object này sẽ được truyền vào `compileToV0Message` ở bước tiếp theo.

#### Bước 4: Tạo và gửi Versioned Transaction

```typescript
import {
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";

async function sendV0Transaction(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  lookupTableAccounts: AddressLookupTableAccount[]
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: instructions,
  }).compileToV0Message(lookupTableAccounts);

  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([payer]);

  const signature = await connection.sendTransaction(transaction);
  await connection.confirmTransaction(signature);

  console.log("Transaction:", signature);
  return signature;
}
```

Lưu ý hai điểm khác biệt so với legacy transaction:
1. Sử dụng `TransactionMessage` + `compileToV0Message()` thay vì `new Transaction()`.
2. **Phải ký trước khi gửi**: `VersionedTransaction.sendTransaction()` không hỗ trợ truyền mảng `Signer` như tham số thứ hai (khác với legacy).

#### Ví dụ hoàn chỉnh: Chuyển SOL với Versioned Transaction

Dưới đây là ví dụ đơn giản nhất — chuyển SOL bằng Versioned Transaction mà không cần ALT:

```typescript
import * as web3 from "@solana/web3.js";

const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
const blockhash = (await connection.getLatestBlockhash()).blockhash;

const instructions = [
  web3.SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: receiver.publicKey,
    lamports: 1_000_000,
  }),
];

const messageV0 = new web3.TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const tx = new web3.VersionedTransaction(messageV0);
tx.sign([payer]);

const txId = await connection.sendTransaction(tx);
console.log(`https://explorer.solana.com/tx/${txId}?cluster=devnet`);
```

Bạn có thể gọi `compileToV0Message()` mà không truyền ALT — khi đó giao dịch vẫn là v0 nhưng hoạt động tương tự legacy (tất cả tài khoản được liệt kê trực tiếp).

---

### 5. Đọc Versioned Transaction từ RPC

Khi đọc giao dịch hoặc block từ RPC, bạn cần chỉ định `maxSupportedTransactionVersion` để cho phép nhận về versioned transaction. Nếu không, RPC mặc định chỉ trả về legacy transaction và sẽ **báo lỗi** khi gặp giao dịch v0.

```typescript
// Lấy block mới nhất (cho phép v0)
const slot = await connection.getSlot();
const block = await connection.getBlock(slot, {
  maxSupportedTransactionVersion: 0,
});

// Lấy một giao dịch cụ thể (cho phép v0)
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
});
```

Hoặc qua JSON RPC trực tiếp:

```bash
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d \
'{"jsonrpc":"2.0","id":1,"method":"getBlock","params":[430,{
  "encoding":"json",
  "maxSupportedTransactionVersion":0,
  "transactionDetails":"full",
  "rewards":false
}]}'
```

> ⚠️ Đây là một lỗi rất phổ biến. Nếu bạn gặp lỗi khi đọc giao dịch từ RPC mà không hiểu tại sao, hãy kiểm tra xem đã set `maxSupportedTransactionVersion: 0` chưa.

---

### 6. Áp dụng vào Bank App: Batch Token Deposit

Trong thực tế, Bank App của chúng ta có thể cần xử lý việc gửi nhiều loại token cùng lúc. Với legacy transaction, mỗi lần `depositToken` cần khoảng 10-12 tài khoản. Nếu gửi 3-4 token cùng lúc, bạn sẽ nhanh chóng vượt giới hạn.

Versioned Transaction + ALT giải quyết vấn đề này:

1. **Tạo ALT** chứa các địa chỉ dùng chung (program ID, bank accounts, token program, ...)
2. **Extend ALT** với các địa chỉ riêng cho từng token (mint, ATA, user reserve, ...)  
3. **Xây dựng nhiều instruction** `depositToken` trong cùng một giao dịch
4. **Compile sang v0 message** với ALT đã tạo
5. **Gửi giao dịch** — tất cả deposit được xử lý nguyên tử (tất cả thành công hoặc tất cả thất bại)

Dưới đây là ví dụ minh họa quy trình:

```typescript
import {
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  TransactionInstruction,
  Connection,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";

async function batchDepositTokens(
  connection: Connection,
  provider: AnchorProvider,
  program: Program,
  tokenMints: PublicKey[],
  amounts: BN[],
  bankAccounts: {
    bankInfo: PublicKey;
    bankVault: PublicKey;
    userReserve: (pubkey: PublicKey, tokenMint?: PublicKey) => PublicKey;
  }
) {
  const allAccounts: PublicKey[] = [];
  const instructions: TransactionInstruction[] = [];

  // Thu thập tất cả tài khoản duy nhất
  const addUnique = (key: PublicKey) => {
    if (!allAccounts.find((a) => a.equals(key))) {
      allAccounts.push(key);
    }
  };

  addUnique(program.programId);
  addUnique(SystemProgram.programId);
  addUnique(TOKEN_PROGRAM_ID);
  addUnique(bankAccounts.bankInfo);
  addUnique(bankAccounts.bankVault);

  for (let i = 0; i < tokenMints.length; i++) {
    const mint = tokenMints[i];
    const userAta = getAssociatedTokenAddressSync(mint, provider.publicKey);
    const bankAta = getAssociatedTokenAddressSync(
      mint,
      bankAccounts.bankVault,
      true
    );
    const userReserve = bankAccounts.userReserve(provider.publicKey, mint);

    [mint, userAta, bankAta, userReserve].forEach(addUnique);

    if ((await connection.getAccountInfo(bankAta)) == null) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          provider.publicKey,
          bankAta,
          bankAccounts.bankVault,
          mint
        )
      );
    }

    instructions.push(
      await program.methods
        .depositToken(amounts[i])
        .accounts({
          bankInfo: bankAccounts.bankInfo,
          bankVault: bankAccounts.bankVault,
          tokenMint: mint,
          userAta,
          bankAta,
          userReserve,
          user: provider.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
  }

  // 1. Tạo ALT
  const slot = await connection.getSlot();
  const [createAltIx, altAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: provider.publicKey,
      payer: provider.publicKey,
      recentSlot: slot,
    });

  const createAltTx = new Transaction().add(createAltIx);
  await provider.sendAndConfirm(createAltTx);

  // 2. Extend ALT với tất cả tài khoản
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: provider.publicKey,
    authority: provider.publicKey,
    lookupTable: altAddress,
    addresses: allAccounts,
  });
  const extendTx = new Transaction().add(extendIx);
  await provider.sendAndConfirm(extendTx);

  // 3. Đợi warmup (ít nhất 1 slot)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 4. Fetch ALT account
  const altAccount = await connection.getAddressLookupTable(altAddress);
  if (!altAccount.value) throw new Error("ALT not available");

  // 5. Compile và gửi v0 transaction
  const { blockhash } = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: provider.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message([altAccount.value]);

  const vTx = new VersionedTransaction(messageV0);
  vTx.sign([provider.wallet.payer]);

  const signature = await connection.sendTransaction(vTx);
  await connection.confirmTransaction(signature);

  console.log("Batch deposit tx:", signature);
  return signature;
}
```

---

### 7. Khi nào nên dùng Versioned Transaction?

**Nên dùng khi:**

- Giao dịch cần tương tác với nhiều tài khoản (> 30)
- Bạn đang xây dựng giao thức DeFi phức tạp (swap, lending, liquidation)
- Cần gộp nhiều thao tác vào một giao dịch nguyên tử
- Xây dựng sàn giao dịch NFT hoặc hệ thống batch processing

**Có thể dùng legacy khi:**

- Giao dịch đơn giản, ít tài khoản (< 30)
- Cần tương thích với các hệ thống cũ chưa hỗ trợ v0
- Hardware wallet chưa hỗ trợ hiển thị chi tiết tài khoản từ ALT

> 💡 **Thực tế**: Hầu hết các giao thức DeFi lớn trên Solana (Jupiter, Raydium, Orca, ...) đều sử dụng Versioned Transaction. Nếu bạn đang xây dựng ứng dụng Solana nghiêm túc, đây là kiến thức bắt buộc.

---

### 8. Lưu ý về bảo mật và hiệu năng

#### Append-only

ALT chỉ cho phép thêm địa chỉ, không thể sửa hoặc xóa. Nếu kẻ tấn công có thể thay đổi nội dung ALT, họ có thể khiến giao dịch tham chiếu đến tài khoản sai — dẫn đến mất tiền. Thiết kế append-only loại bỏ hoàn toàn rủi ro này.

#### Duplicate account

Một giao dịch **không được phép** tải cùng một tài khoản hai lần — dù trực tiếp qua `account_keys` hay gián tiếp qua ALT. Runtime sẽ từ chối giao dịch nếu phát hiện trùng lặp.

#### Chi phí

Sử dụng ALT có thêm overhead tính toán khi runtime tra cứu địa chỉ, nhưng bù lại giao dịch nhỏ hơn → block nhỏ hơn → truyền tải nhanh hơn. Đây là đánh đổi có lợi cho hầu hết trường hợp sử dụng.

#### Tái sử dụng ALT

Trong production, **đừng** tạo ALT mới cho mỗi giao dịch. Hãy tạo một vài ALT chứa các địa chỉ thường dùng (program ID, token program, system program, các PDA cố định, ...) và tái sử dụng chúng. Chỉ extend khi cần thêm địa chỉ mới.

---

### 9. Đến lúc bắt tay vào xây dựng 💪

Bây giờ là lúc áp dụng tất cả những gì bạn đã học! Bạn sẽ hoàn thành một bộ bài tập có hướng dẫn để thêm hỗ trợ giao dịch phiên bản vào Bank app của bạn. Bạn sẽ sử dụng program `bank-app` hiện có trong các bài học để thực hiện điều này.

🛠️ Nhiệm vụ của bạn:

1. **Tạo một Hàm Hỗ trợ cho các Bảng Tra cứu**
  Viết một hàm có thể tái sử dụng để:
  - Tạo một ALT nếu nó chưa tồn tại
  - Mở rộng nó với các tài khoản mới nếu cần
  - Trả về địa chỉ bảng tra cứu
  - Xử lý thời gian/chờ đợi cho việc kích hoạt ALT
2. **Triển khai Gửi Token Hàng loạt**
  Tạo một hàm cho phép người dùng gửi nhiều loại token trong một Versioned Transaction duy nhất:
  - Chấp nhận một mảng các mint token và số lượng
  - Tạo tất cả các instruction cần thiết
  - Sử dụng một bảng tra cứu để nén giao dịch
  - Gửi dưới dạng Versioned Transaction
3. **Thêm Gửi SOL Hàng loạt**
  Mở rộng chức năng hàng loạt để hỗ trợ gửi nhiều lần SOL từ những người dùng khác nhau hoặc các thao tác hàng loạt cho cùng một người dùng.
4. **Viết các bài kiểm thử**
  Như thường lệ, hãy viết các bài kiểm thử:
  - Kiểm thử việc gửi token hàng loạt với 2-3 loại token khác nhau
  - Xác minh tất cả các giao dịch gửi tiền thành công
  - Kiểm thử việc xử lý lỗi (ví dụ: số dư không đủ)
  - Thử nghiệm với các giao dịch cũ để so sánh
5. **Tối ưu hóa cho Sản phẩm**
  Cân nhắc các cải tiến:
  - Tái sử dụng các bảng tra cứu thay vì tạo mới
  - Lưu trữ (cache) các địa chỉ bảng tra cứu
  - Xử lý việc mở rộng bảng tra cứu hiệu quả hơn

Khi bạn đã hoàn thành các nhiệm vụ này, Bank App của bạn sẽ hỗ trợ các hoạt động hàng loạt hiệu quả bằng cách sử dụng Versioned Transaction — một tính năng then chốt cho các ứng dụng Solana sẵn sàng cho môi trường thực tế! 🚀
