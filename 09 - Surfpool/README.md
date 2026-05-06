# Phần IX — Surfpool: Fork Mainnet về Local & Debug gần Production

Ở các phần trước, bạn đã đi qua transaction, PDA, ATA, CPI, versioned transaction và IDL. Phần này không thêm một opcode on-chain mới — mà tập trung vào **cách làm việc đúng hơn** trong vòng đời phát triển Solana: **debug và test trong bối cảnh gần Mainnet**.

- `solana-test-validator` rất tốt cho localnet, nhưng **state** thường “đồ chơi” (mint/pool/program bên thứ ba không giống thực tế).
- Devnet/Mainnet thì chậm, tốn setup, hoặc rủi ro khi test bằng tiền thật.

**Surfpool** (Solana Foundation) lấp khoảng trống đó: thay thế `solana-test-validator`, **fork program + account từ mainnet/devnet theo nhu cầu (lazy / just-in-time)**, kèm **Surfpool Studio** để quan sát transaction và **Surfnet RPC cheatcodes** để tạo edge-case nhanh — cộng thêm hướng **Infrastructure as Code (IaC)** cho deploy có thể lặp lại và kiểm toán được.

---

## Kết thúc bài học, bạn sẽ

- Hiểu vì sao localnet/devnet/mainnet đều có giới hạn khi test tích hợp thật
- Hiểu Surfpool/Surfnet là gì, khác gì `solana-test-validator`, và **khi nên / không nên** dùng
- Chạy Surfnet local, fork state từ mainnet/devnet (copy-on-read), cấu hình RPC qua `Surfpool.toml` nếu cần
- Dùng **Surfpool Studio** và checklist debug (instruction, account, logs, CU)
- Dùng **cheatcodes** (reset, time travel, set SOL/SPL, clone program, profile transaction) — qua `curl` hoặc `fetch` trong script
- Nắm các tuỳ chọn CLI thực tế (port, slot-time, block production, watch, snapshot, CI)
- Áp dụng vào worlflow debug bug “chỉ xảy ra trên mainnet state”; qua bài tập (mục **10**) thực hành **transfer SOL/USDC** trên Surfpool và chạy `**jupiter-earn-demo`** (Jupiter Earn / CPI)

---

## 1. Vấn đề với môi trường test quen thuộc

```
Localnet          Devnet            Mainnet
─────────         ──────────        ────────
✅ Nhanh          ✅ Gần mainnet    ✅ Thật 100%
✅ Kiểm soát      ⚠️  Không ổn định  ❌ Tốn SOL thật
❌ Không có       ❌ Faucet chậm     ❌ Rủi ro thật
   data thật         / giới hạn
❌ Phải mock       ❌ Program bên    ❌ Không reset
   nhiều             thứ ba khác      state tùy ý
                     mainnet
```

**Tình huống điển hình:** bạn tích hợp DeFi (ví dụ Jupiter). Trên localnet program đó không có — mock tốn thời gian. Trên devnet state khác mainnet (pool, giá). Trên mainnet không muốn thử nghiệm bừa bãi.

**Surfpool** nhắm đúng chỗ đó: **data mainnet thật**, **cô lập hoàn toàn** (mọi write chỉ ở local), **reset / chỉnh state** bằng cheatcodes.

### Khi nên dùng Surfpool

- Test với **state thật** (USDC, program bên thứ ba, layout account “lạ”)
- Debug nhanh: instruction decode, byte diff, CPI, **compute profiling**
- Tạo edge-case (thiếu balance, frozen ATA, logic phụ thuộc thời gian) ít boilerplate

### Khi không bắt buộc

- Unit test đơn giản, tự dựng state → `solana-test-validator` / Anchor test thường đủ
- CI cực tối giản → cân nhắc `surfpool start --ci` hoặc validator cổ điển

---

## 2. Surfpool là gì?

Surfpool là **drop-in replacement** cho `solana-test-validator`: **full RPC tương thích**, cùng cổng mặc định — hầu hết tooling (Anchor, web3.js, Solana CLI, ví) **gần như không đổi**.

Điểm cốt lõi: **fork mainnet/devnet theo kiểu lazy** — không tải cả blockchain; chỉ **fetch account/program khi transaction thực sự cần đọc**, rồi cache local.

```
solana-test-validator (cũ)       Surfpool / Surfnet (mới)
────────────────────────         ────────────────────────
Local state trống                Fork state on-demand
Phải mock CPI / bên thứ 3        Jupiter, vault… có khi cần
Faucet/token hạn chế             Cheatcode: nạp SOL/SPL, warp thời gian
Khó profile CU / diff chi tiết   Studio + surfnet_profileTransaction
Không có IaC chính thức         Runbook (surfpool.tx) — deploy có version
```

> **Surfpool = Surfnet (mạng local) + Cheatcodes + Studio + tooling IaC.**  
> **Surfnet** là tên mạng local do Surfpool tạo ra.

### Copy-on-read (cơ chế fork)

```
Transaction cần đọc account X
         ↓
Surfnet kiểm tra cache local
         ↓ (chưa có)
Fetch từ RPC mainnet/devnet (theo cấu hình)
         ↓
Cache locally — mọi ghi chỉ ảnh hưởng local
```

---

## 3. Cài đặt

Cách phổ biến (theo docs / trang cài đặt):

```bash
# Một trong hai (tùy phiên bản docs hiện tại)
curl -fsSL https://docs.surfpool.run/install.sh | sh
# hoặc
curl -sL https://run.surfpool.run/ | bash
```

Kiểm tra:

```bash
surfpool --version
surfpool --help
surfpool start --help
```

---

## 4. Chạy Surfnet local

```bash
surfpool start
```

**Mặc định thường gặp:**

- RPC: `http://127.0.0.1:8899`
- WebSocket: `ws://127.0.0.1:8900`
- **Surfpool Studio:** `http://127.0.0.1:18488` (xem output `surfpool start` nếu cổng khác trên máy bạn)

### 4.1 Chọn nguồn fork

```bash
surfpool start --network mainnet
surfpool start --network devnet
surfpool start --rpc-url <YOUR_RPC_URL>
```

### 4.2 Slot time & chế độ tạo block

```bash
surfpool start --slot-time 200
```

- `clock` (mặc định): theo thời gian thật
- `transaction`: tạo block khi có giao dịch (test đỡ chờ)
- `manual`: điều khiển tay (nâng cao)

```bash
surfpool start --block-production-mode transaction
```

### 4.3 RPC để fetch dữ liệu mainnet (Surfpool.toml)

Surfnet cần endpoint RPC khi pull account từ mạng ngoài. Cấu hình ví dụ:

```toml
[network]
rpc_url = "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
# hoặc QuickNode, Alchemy, Triton…
```

---

## 5. Kết nối Anchor / web3.js / Solana CLI

### Anchor

```bash
surfpool start   # hoặc surfpool start --network mainnet

anchor deploy --provider.cluster localnet
anchor test --skip-local-validator
```

(Surfnet có thể gợi ý IaC khi phát hiện workspace Anchor — tuỳ phiên bản.)

### web3.js

```ts
import { Connection } from "@solana/web3.js";

const connection = new Connection("http://127.0.0.1:8899", "confirmed");
```

### Solana CLI

```bash
solana config set --url http://127.0.0.1:8899
solana config get
```

### Luồng nhanh

1. `surfpool start --network devnet` (hoặc mainnet)
2. Gửi một transaction (Anchor test hoặc script)
3. Mở Studio, tìm transaction và áp checklist mục 6

---

## 6. Surfpool Studio & checklist debug

Studio giúp:

- **Decoded instructions**, accounts, logs
- **Byte-level diffs** (data trước/sau)
- **CU profiling** theo transaction / instruction
- UI hỗ trợ faucet / thao tác (tuỳ phiên bản)

**Checklist nhanh khi fail:**

- Instruction decode: args đúng chưa?
- Danh sách account: thiếu / sai thứ tự?
- Writable: account nào bị mutate, có sai không?
- Logs: Anchor constraint, token error, CPI?
- Compute: instruction/CPI nào ăn CU bất thường?

---

## 7. Tuỳ chọn CLI hữu ích

```bash
surfpool start --port 8899 --ws-port 8900 --studio-port 18488
surfpool start --no-studio --no-tui
surfpool start --watch
surfpool start --snapshot ./snapshots/accounts.json
surfpool start --ci
```

---

## 8. Cheatcodes (Surfnet-only)

Các RPC method **chỉ có trên Surfnet** (không có trên mainnet/devnet thật). Dưới đây mỗi mục có **cả `curl` và script TypeScript** để bạn dùng trong Anchor test, script Node, hoặc frontend.

**Bảng tham khảo nhanh:**


| Cheatcode                        | Dùng để                                          |
| -------------------------------- | ------------------------------------------------ |
| `surfnet_resetNetwork`           | Reset mạng local                                 |
| `surfnet_timeTravel`             | Nhảy slot / thời gian                            |
| `surfnet_setAccount`             | Lamports, owner, data…                           |
| `surfnet_setTokenAccount`        | Số dư SPL theo owner + mint                      |
| `surfnet_cloneProgramAccount`    | Nhân bản program account                         |
| `surfnet_profileTransaction`     | Profile CU trước khi gửi thật                    |
| `surfnet_getProfileResultsByTag` | Lấy kết quả profile theo tag                     |
| `surfnet_setProgramAuthority`    | (tuỳ phiên bản) upgrade authority                |
| `surfnet_setSupply`              | (tuỳ phiên bản) điều chỉnh cung SOL trên surfnet |


Tham số chi tiết từng method nằm dưới — lấy theo [Cheatcodes | Surfpool Docs](https://docs.surfpool.run/rpc/cheatcodes) .

---

### 8.1 `surfnet_resetNetwork`

Đặt lại toàn bộ mạng local về trạng thái ban đầu.


| Tham số | Kiểu | Bắt buộc | Mô tả                      |
| ------- | ---- | -------- | -------------------------- |
| —       | —    | —        | `params` là mảng rỗng `[]` |


**Kết quả (`result`):** có `context` (apiVersion, slot); `value` thường là `null`.

**curl**

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"surfnet_resetNetwork","params":[]}'
```

**script**

```ts
await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_resetNetwork",
    params: [],
  }),
});
```

---

### 8.2 Nạp SOL (airdrop) + `surfnet_setTokenAccount`

Trên Surfnet bạn vẫn có thể **airdrop SOL** bằng **RPC Solana chuẩn** (`requestAirdrop`) — đây **không phải** cheatcode. **Token SPL** dùng `**surfnet_setTokenAccount`**: set balance / state / delegate… không cần faucet.

#### `surfnet_setTokenAccount` — tham số (theo docs)


| Tham số        | Kiểu   | Bắt buộc | Mô tả                                                                     |
| -------------- | ------ | -------- | ------------------------------------------------------------------------- |
| `owner`        | string | ✓        | Pubkey owner ví (base58) — ví sở hữu token account                        |
| `mint`         | string | ✓        | Pubkey mint (base58)                                                      |
| `update`       | object | ✓        | Các field cần cập nhật (xem bảng con)                                     |
| `tokenProgram` | string |          | Pubkey program token (base58). *Không truyền thì mặc định SPL Token* |


**Trong object `update`:**


| Field             | Kiểu    | Mô tả                                         |
| ----------------- | ------- | --------------------------------------------- |
| `amount`          | integer | Số dư đơn vị nhỏ nhất (ví dụ USDC 6 decimals) |
| `state`           | string  | Ví dụ `initialized`, `frozen`, `closed`       |
| `delegate`        | string  | Pubkey delegate (base58)                      |
| `delegatedAmount` | integer | Số delegate được phép chi                     |
| `closeAuthority`  | string  | Pubkey close authority (base58)               |


**Thứ tự `params` trên dây:** `[ owner, mint, update, tokenProgram? ]` — xem ví dụ tại [surfnet_setTokenAccount](https://docs.surfpool.run/rpc/cheatcodes#surfnet_settokenaccount).

**SOL — script (`@solana/web3.js`)**

```ts
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const wallet = new PublicKey("..."); // hoặc keypair.publicKey

const sig = await connection.requestAirdrop(wallet, 10 * LAMPORTS_PER_SOL);
await connection.confirmTransaction(sig, "confirmed");
```

**USDC — curl** (`100` USDC, 6 decimals → `amount` = `100_000_000`). Mint mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"surfnet_setTokenAccount",
    "params":[
      "<OWNER_PUBKEY>",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      {"amount": 100000000, "state": "initialized"},
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    ]
  }'
```

**USDC — script** 

```ts
import { PublicKey } from "@solana/web3.js";

const wallet = new PublicKey("..."); // hoặc keypair.publicKey
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_setTokenAccount",
    params: [
      wallet.toString(),
      USDC_MINT.toString(),
      { amount: 100_000_000, state: "initialized" },
      TOKEN_PROGRAM.toString(),
    ],
  }),
});
```

---

### 8.3 `surfnet_timeTravel`

Đưa mạng local tới **epoch / slot / thời điểm** tương lai (hoặc cấu hình tương đương theo docs) — hữu ích cho vesting, cooldown, deadline mà không phải chờ thật.


| Tham số  | Kiểu   | Bắt buộc | Mô tả                                                                                                                                                                                                                                    |
| -------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config` | object | ✓        | Một object trong `params[0]`. Docs mô tả có thể nhảy theo **epoch**, **slot**, hoặc **timestamp**; field cụ thể xem [surfnet_timeTravel](https://docs.surfpool.run/rpc/cheatcodes#surfnet_timetravel) (ví dụ dưới dùng `absoluteEpoch`). |


**Kết quả (`result`):** thường gồm `absoluteSlot`, `blockHeight`, `epoch`, `slotIndex`, `slotsInEpoch`, `transactionCount` (theo bảng Result trên docs).

**curl** — ví dụ nhảy tới epoch 100 (thay bằng giá trị bạn cần):

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"surfnet_timeTravel",
    "params":[{"absoluteEpoch":100}]
  }'
```

**script**

```ts
const response = await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_timeTravel",
    params: [{ absoluteEpoch: 100 }],
  }),
});

const json = await response.json();
console.log(json.result);
```

Nếu bạn cần nhảy theo **slot** hoặc **unix timestamp**, mở đúng anchor `#surfnet_timetravel` trên trang cheatcodes và dùng field tương ứng trong object `params[0]`.

---

### 8.4 `surfnet_setAccount`

Ghi đè **lamports**, **data** (hex), **owner**, **executable**, **rentEpoch** của một account — ví dụ set SOL cho pubkey hoặc dựng account test.


| Tham số  | Kiểu   | Bắt buộc | Mô tả                           |
| -------- | ------ | -------- | ------------------------------- |
| `pubkey` | string | ✓        | Pubkey account cần sửa (base58) |
| `update` | object | ✓        | Giá trị mới (xem bảng con)      |


**Trong object `update`:**


| Field        | Kiểu    | Mô tả                                                             |
| ------------ | ------- | ----------------------------------------------------------------- |
| `data`       | string  | Dữ liệu account, **chuỗi hex** (theo docs; ví dụ có tiền tố `0x`) |
| `executable` | boolean | `true` nếu là program account                                     |
| `lamports`   | integer | Số lamports (1 SOL = 1_000_000_000)                               |
| `owner`      | string  | Program owner (base58)                                            |
| `rentEpoch`  | integer | Rent epoch                                                        |


**curl**

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"surfnet_setAccount",
    "params":[
      "<OWNER_PUBKEY>",
      {
        "lamports": 2000000000,
        "owner": "11111111111111111111111111111111",
        "executable": false,
        "rentEpoch": 0,
        "data": "0x"
      }
    ]
  }'
```

**script** 

```ts
import { PublicKey } from "@solana/web3.js";

const targetPubkey = new PublicKey("...");
const programId = new PublicKey("...");

await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_setAccount",
    params: [
      targetPubkey.toString(),
      {
        lamports: 1_000_000_000,
        data: "0x",
        owner: programId.toString(),
        executable: false,
      },
    ],
  }),
});
```

`data`: nối `"0x"` với hex từ `Buffer.from(bytes).toString("hex")` nếu bạn build data trong code.

---

### 8.5 `surfnet_profileTransaction` & `surfnet_getProfileResultsByTag`

Profile transaction **trước khi** gửi mainnet: ước lượng **compute units**, log, state trước/sau (theo payload Surfpool trả về).

#### `surfnet_profileTransaction`


| Tham số           | Kiểu   | Bắt buộc | Mô tả                                                                       |
| ----------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `transactionData` | string | ✓        | `VersionedTransaction` đã serialize, **base64** (hoặc encoding docs hỗ trợ) |
| `tag`             | string |          | Nhãn gom kết quả                                                            |
| `config`          | object |          | `depth`: `transaction`                                                      |


**Trong `result.value` (khi thành công):** có `computeUnits` (vd. `computeUnitsConsumed`), `logMessages`, `success`, `state` (`preExecution`, `postExecution`), … — xem [surfnet_profileTransaction](https://docs.surfpool.run/rpc/cheatcodes#surfnet_profiletransaction).

**curl — `surfnet_profileTransaction`**

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"surfnet_profileTransaction",
    "params":[
      "<BASE64_SERIALIZED_VERSIONED_TX>",
      "cu-hotspot-demo",
      {"depth":"instruction","encoding":"base64"}
    ]
  }'
```

#### `surfnet_getProfileResultsByTag`


| Tham số  | Kiểu   | Bắt buộc | Mô tả                                   |
| -------- | ------ | -------- | --------------------------------------- |
| `tag`    | string | ✓        | Cùng tag đã dùng khi profile            |
| `config` | object |          | Cùng kiểu `depth` / `encoding` như trên |


**curl — `surfnet_getProfileResultsByTag`**

```bash
curl -sS -X POST http://127.0.0.1:8899 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"surfnet_getProfileResultsByTag",
    "params":["cu-hotspot-demo",{"depth":"instruction","encoding":"base64"}]
  }'
```

**script (cả hai bước)**

```ts
import { VersionedTransaction } from "@solana/web3.js";

const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

const response = await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_profileTransaction",
    params: [
      serializedTx,
      "my-deposit-test",
      { depth: "instruction", encoding: "base64" },
    ],
  }),
});

const json = await response.json();
const profile = json.result?.value ?? json.result;

console.log("Compute units tiêu thụ:", profile?.computeUnits?.computeUnitsConsumed);
console.log("State trước:", profile?.state?.preExecution);
console.log("State sau:", profile?.state?.postExecution);

const response2 = await fetch("http://127.0.0.1:8899", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "surfnet_getProfileResultsByTag",
    params: ["my-deposit-test", { depth: "instruction", encoding: "base64" }],
  }),
});

const json2 = await response2.json();
console.log(json2.result?.value ?? json2.result);
```

---

## 9. So sánh nhanh với `solana-test-validator`


| Tính năng             | solana-test-validator    | Surfpool / Surfnet        |
| --------------------- | ------------------------ | ------------------------- |
| Boot                  | Tuỳ máy                  | Thường nhanh, gọn         |
| Mainnet data          | Không                    | Có (lazy fork)            |
| Faucet token          | Hạn chế (thường chỉ SOL) | Cheatcodes: SPL linh hoạt |
| Time travel           | Không                    | Có                        |
| CU profiling chi tiết | Không                    | Có (RPC + Studio)         |
| Drop-in RPC port      | 8899                     | 8899 (tương thích)        |


---

## 10. Bài tập

Trong bài tập này, bạn lần lượt dùng **Surfpool** để thao tác **SOL và USDC** trên Surfnet local, sau đó áp dụng cùng stack để chạy **tích hợp Jupiter Earn (CPI)** qua project mẫu và file test có sẵn.

### Phần 1: Surfpool — chuyển SOL và USDC

Mục tiêu: làm quen Surfnet như RPC local, thực hiện **transfer SOL** và **transfer USDC (SPL)** có thể quan sát trong **Surfpool Studio**.

1. Cài Surfpool và chạy `surfpool start` (có thể bắt đầu với `--network devnet` hoặc `mainnet` tùy bạn muốn fork mint/program từ đâu).
2. Trỏ ví dụ và tooling về Surfnet: `solana config set --url http://127.0.0.1:8899`, và trong project Anchor (nếu dùng) đặt provider / `Anchor.toml` cluster `localnet` trùng endpoint Surfpool.
3. **SOL:** dùng `Connection.requestAirdrop` (hoặc `surfnet_setAccount` nếu bạn muốn luyện cheatcode ở mục 8) để có lamports, rồi gửi **ít nhất một giao dịch chuyển SOL** giữa hai pubkey (ví dụ `SystemProgram.transfer` hoặc flow tương đương). Xác nhận số dư thay đổi đúng kỳ vọng.
4. **USDC:** dùng `surfnet_setTokenAccount` (tham khảo mục **8.2**) để cấp USDC cho ví test (mint mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` nếu bạn fork mainnet). Tạo hoặc dùng **ATA** đúng owner/mint, rồi gửi **ít nhất một giao dịch chuyển USDC** (ví dụ `spl-token` / `createTransferInstruction` + transaction) sang một owner khác hoặc sang một ATA đích do bạn chọn.
5. Mở **Surfpool Studio**, tìm các signature vừa gửi: kiểm tra instruction được decode, account liên quan, và (nếu có) diff balance — áp checklist ở mục **6**.

### Phần 2: Surfpool + Jupiter Earn — `jupiter-earn-demo`

Mục tiêu: chạy và hiểu test tích hợp **Jupiter Lend / Earn** trên Surfnet, nơi state on-chain được fork và cheatcode bổ sung token khi cần.

Làm việc trong thư mục project mẫu:

`09 - Surfpool/jupiter-earn-demo/tests/jupiter-earn-demo.ts`

1. Đọc sơ bộ program và test: test gọi `getDepositContext` và `getUserLendingPositionByAsset` từ `**@jup-ag/lend/earn`**, dựng ATA cho USDC và f-token mint từ context, rồi gọi instruction Anchor `**depositToEarn`** với đủ account lấy từ `depositContext` (vault, liquidity, lending, v.v.). Sau khi xác nhận transaction, test assert `**lendingTokenShares**` và `**underlyingAssets**` tăng so với trước deposit.
2. Hàm `**surfpoolSetTokenAccount**` trong file test là ví dụ gọi cheatcode qua `fetch` tới `provider.connection.rpcEndpoint` — đối chiếu với mục **8.2**; bật hoặc điều chỉnh lượng USDC nạp nếu bạn cần đủ balance trước khi deposit.
3. **Điều kiện môi trường:** block `before` trong test yêu cầu RPC provider phải là **local** (`127.0.0.1` / `localhost`). Giữ Surfpool chạy, cấu hình `ANCHOR_PROVIDER_URL` (hoặc tương đương) trỏ tới `http://127.0.0.1:8899`, rồi chạy test kiểu `anchor test --skip-local-validator` hoặc lệnh test đã khai báo trong `Anchor.toml` của project (ví dụ `anchor run test`).
4. Fork **mainnet** (hoặc datasource có đủ account Jupiter Lend mà test cần), ví dụ `surfpool start --network mainnet`, để `getDepositContext` resolve đúng vault/state thật; nếu test fail thiếu account, dùng Studio và mục **8** để gỡ (thiếu balance → `surfnet_setTokenAccount`, v.v.).
5. (Tuỳ chọn) Dùng `surfnet_profileTransaction` (mục **8.6**) cho transaction `depositToEarn` để xem phân bổ compute theo instruction.

---

