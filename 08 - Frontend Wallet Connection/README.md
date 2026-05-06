# Phần VIII – Kết Nối Frontend với Solana: Phantom Wallet & Bank App UI

Đã đến lúc đưa những gì bạn xây dựng lên màn hình thực sự! Cho đến giờ bạn luôn tương tác với bank-app qua terminal và test script. Trong bài này, chúng ta sẽ xây dựng một giao diện React để người dùng thực sự có thể kết nối ví, xem số dư, và thực hiện deposit/withdraw — đúng như một ứng dụng DeFi thực tế.

---

## Yêu Cầu Kiến Thức

Trước khi bắt đầu bài học này, bạn cần nắm vững:

- **bank-app đã deploy lên devnet** — program on-chain đã sẵn sàng
- **IDL của bank-app** — bạn biết cách dùng IDL để tạo Program instance (Phần VII)
- **PDA** — bạn hiểu seeds để derive đúng địa chỉ (Phần II)
- **React cơ bản** — component, state, hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- **TypeScript cơ bản** — type, interface

---

## Kết Thúc Bài Học, Bạn Sẽ:

✅ Hiểu Phantom wallet hoạt động như thế nào trong trình duyệt  
✅ Biết cách tổ chức dự án: `polyfill` → `providers/` → `contracts/` → `components/`  
✅ Bọc React app bằng `ConnectionProvider`, `WalletProvider`, `WalletModalProvider`  
✅ Kết nối và ngắt kết nối ví Phantom  
✅ Đọc và hiển thị số dư SOL trực tiếp trong form giao dịch  
✅ Tạo lớp `BankAppContract` tập trung logic on-chain  
✅ Gọi instruction `deposit` từ UI — Phantom hiện popup xác nhận  
✅ Xây giao diện nạp/rút dạng tab giống các DeFi app thực tế  
✅ Tự động cập nhật số dư qua WebSocket subscription  

---

## 1. Bức Tranh Tổng Thể

Trước khi code, hãy hiểu luồng hoạt động của một dApp:

```
Người dùng
    ↓ click "Connect Wallet"
Phantom Extension (trong trình duyệt)
    ↓ inject window.solana
React App  (WalletProvider nhận thông tin ví)
    ↓ useWallet() → publicKey, signTransaction
    ↓ tạo AnchorProvider + Program từ IDL
    ↓ gọi program.methods.deposit(...).rpc()
    ↓ Phantom hiện popup xác nhận
Solana Devnet
    ↓ xử lý transaction, cập nhật BankInfo/UserReserve
    ↓ trả về signature
React App
    ↓ hiển thị link Explorer
    ↓ fetch lại UserReserve + SOL balance → cập nhật UI
```

Điểm mấu chốt: trên **terminal test**, bạn tự ký bằng keypair file. Trên **frontend**, private key nằm trong Phantom — bạn phải yêu cầu Phantom ký thay. Cú pháp `program.methods.deposit(...).rpc()` giống hệt, nhưng **người ký** khác nhau.

---

## 2. Cấu Trúc Dự Án

Dự án mẫu đặt tại `bank-app-frontend/`. Cây thư mục:

```
bank-app-frontend/src/
├── polyfill.ts              ← Buffer polyfill cho trình duyệt
├── main.tsx                 ← import polyfill + CSS ví + mount SolanaProvider
├── App.tsx                  ← Layout: header (nút ví ở góc phải) + BankAppInteract
├── App.css                  ← toàn bộ style, thiết kế glass-panel
├── vite-env.d.ts            ← khai báo biến môi trường VITE_SOLANA_RPC_URL
├── providers/
│   └── SolanaProvider.tsx   ← ConnectionProvider → WalletProvider → WalletModalProvider
├── contracts/
│   └── BankAppContract.ts   ← Anchor Program, PDA, deposit, đọc UserReserve
├── components/
│   ├── WalletConnect.tsx    ← WalletMultiButton
│   └── BankAppInteract.tsx  ← form nạp/rút dạng tab + state React + gọi BankAppContract
└── idl/
    └── bank_app.json        ← copy từ target/idl/ sau anchor build
```

### Tại sao tổ chức như vậy?

Trong các dApp lớn, logic gọi on-chain program nằm trong **lớp contract** (class riêng), không nhồi vào hook hay component. Component chỉ cần `useWallet()`, sau đó `new BankAppContract(connection, wallet)` và gọi method.

Bài này áp dụng tinh thần đó:

- `**contracts/BankAppContract.ts`** — một class duy nhất, tập trung toàn bộ Anchor (Program, PDA, deposit, fetch).
- `**BankAppInteract.tsx**` — chỉ chứa state React (`amount`, `loading`, `error`, `tab`, …), gọi contract method, và render UI.
- **Không dùng React Query** — chỉ `useState`, `useEffect`, `useCallback`, `useMemo`. Đủ cho dApp nhỏ.

---

## 3. Thiết Lập Project

### Bước 1 — Tạo project Vite

```bash
npm create vite@latest bank-app-frontend -- --template react-ts
cd bank-app-frontend
npm install
```

### Bước 2 — Cài dependencies Solana

```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
  @solana/wallet-adapter-phantom @solana/wallet-adapter-base \
  @solana/web3.js @coral-xyz/anchor buffer
```

Giải thích:


| Package                           | Vai trò                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `@solana/wallet-adapter-react`    | React Context + hooks: `useWallet()`, `useConnection()`, `useAnchorWallet()` |
| `@solana/wallet-adapter-react-ui` | Component sẵn có: `WalletMultiButton` + CSS style                            |
| `@solana/wallet-adapter-phantom`  | Adapter riêng cho ví Phantom                                                 |
| `@solana/wallet-adapter-base`     | Base types cho wallet adapter                                                |
| `@solana/web3.js`                 | SDK cốt lõi: `Connection`, `PublicKey`, `SystemProgram`, ...                 |
| `@coral-xyz/anchor`               | SDK Anchor để tạo `Program` từ IDL                                           |
| `buffer`                          | Polyfill `Buffer` trong trình duyệt                                          |


### Bước 3 — Cấu hình `vite.config.ts`

SDK Solana kỳ vọng `global` và `process.env` giống Node. Cần thêm:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
  },
})
```

**Tại sao cần `define`?** Nhiều thư viện Solana được viết cho Node.js, sử dụng `global` (biến toàn cục của Node) và `process.env`. Trình duyệt không có hai thứ này. `define` bảo Vite thay thế chúng tại build-time:

- `global: 'globalThis'` → mỗi khi code dùng `global`, Vite thay bằng `globalThis` (biến toàn cục chuẩn của trình duyệt).
- `'process.env': {}` → tránh lỗi `process is not defined`.

`optimizeDeps.esbuildOptions` áp dụng cùng rule cho các dependency được esbuild pre-bundle (ví dụ `@solana/web3.js`).

### Bước 4 — Copy IDL

Sau khi `anchor build` ở thư mục bank-app:

```bash
cp ../bank-app/target/idl/bank_app.json src/idl/bank_app.json
```

IDL chứa program ID, tên instruction, cấu trúc account — là "bản đặc tả" để Anchor SDK biết cách serialize/deserialize. Đây chính là thứ bạn đã học ở **Phần VII**.

> **Quan trọng:** Mỗi lần sửa program Rust và `anchor build` lại, bạn cần copy lại IDL mới. Nếu IDL frontend không khớp với program đã deploy, giao dịch sẽ thất bại.

---

## 4. Buffer Polyfill — Giải Quyết "Buffer is not defined"

Solana SDK dùng `Buffer` — một API của Node không có trong trình duyệt. Đây là nguồn lỗi phổ biến nhất khi xây frontend Solana. Giải pháp: tạo file `polyfill.ts` riêng và import nó **đầu tiên**.

```ts
// src/polyfill.ts
import { Buffer } from 'buffer';

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}
```

**Tại sao tách file riêng?** Vì thứ tự import quan trọng. Khi `main.tsx` import `polyfill.ts` ở dòng đầu tiên, JavaScript engine thực thi toàn bộ `polyfill.ts` **trước** khi chạy bất kỳ import nào phía dưới. Điều này đảm bảo `Buffer` tồn tại trước khi Solana SDK (qua các import gián tiếp như `@coral-xyz/anchor`, `@solana/web3.js`) cần nó.

**Kiểm tra `if (!globalThis.Buffer)`** — trong môi trường Node (ví dụ SSR), `Buffer` đã có sẵn; check này tránh ghi đè không cần thiết.

```
❌ Lỗi thường gặp: đặt polyfill SAU các import Solana
   import React from 'react';
   import SolanaProvider from './providers/SolanaProvider'; // ← đã dùng Buffer!
   import { Buffer } from 'buffer';
   globalThis.Buffer = Buffer;  // ← quá muộn

✅ Đúng: polyfill phải là import ĐẦU TIÊN
   import './polyfill';          // ← Buffer có sẵn từ đây
   import React from 'react';
   import SolanaProvider from './providers/SolanaProvider';
```

---

## 5. `providers/SolanaProvider.tsx` — Bọc App Bằng Wallet Adapter

Wallet Adapter dùng React Context để chia sẻ trạng thái ví cho mọi component con. Bạn cần wrap toàn bộ app bằng 3 provider lồng nhau:

```tsx
// src/providers/SolanaProvider.tsx
import { useMemo, type PropsWithChildren } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { clusterApiUrl } from '@solana/web3.js';

export default function SolanaProvider({ children }: PropsWithChildren) {
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL ?? clusterApiUrl('devnet');
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### Ba lớp provider:


| Provider              | Cung cấp                                 | Hook để dùng                            |
| --------------------- | ---------------------------------------- | --------------------------------------- |
| `ConnectionProvider`  | RPC `Connection` đến devnet              | `useConnection()`                       |
| `WalletProvider`      | Trạng thái ví, public key, `autoConnect` | `useWallet()`, `useAnchorWallet()`      |
| `WalletModalProvider` | Modal chọn ví khi click nút              | (tự động, dùng bởi `WalletMultiButton`) |


### Giải thích chi tiết:

`**endpoint**` — `clusterApiUrl('devnet')` trả về `https://api.devnet.solana.com`. Nếu bạn tạo file `.env` với `VITE_SOLANA_RPC_URL`, app sẽ dùng RPC tùy chỉnh (Helius, QuickNode, ...) thay vì RPC công khai hay bị giới hạn.

`**wallets**` — mảng adapter được bọc trong `useMemo` để tránh tạo instance mới mỗi lần render. Ở đây chỉ dùng `PhantomWalletAdapter`; trong dự án thật bạn có thể thêm `SolflareWalletAdapter`, `WalletConnectWalletAdapter`, v.v.

`**autoConnect**` — khi người dùng đã kết nối ví trước đó, app sẽ tự kết nối lại khi load mà không cần bấm nút.

---

## 6. `main.tsx` — Entry Point

```tsx
// src/main.tsx
import './polyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import SolanaProvider from './providers/SolanaProvider';
import App from './App';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SolanaProvider>
      <App />
    </SolanaProvider>
  </React.StrictMode>
);
```

Ba điểm quan trọng:

1. `**import './polyfill'**` ở dòng đầu tiên — đảm bảo `Buffer` có sẵn trước mọi thứ.
2. `**import '@solana/wallet-adapter-react-ui/styles.css'**` — nếu thiếu, nút `WalletMultiButton` sẽ không có style.
3. `**<SolanaProvider>` bọc `<App />**` — mọi component con đều truy cập được `useWallet()`, `useConnection()`.

---

## 7. `App.tsx` — Layout Chính

```tsx
// src/App.tsx
import { useWallet } from '@solana/wallet-adapter-react';
import WalletConnect from './components/WalletConnect';
import BankAppInteract from './components/BankAppInteract';

function App() {
  const { connected } = useWallet();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <WalletConnect />
        </div>
        <div className="app-brand">
          <h1>🏦 Bank App</h1>
          <p className="app-subtitle">Solana dApp on Devnet</p>
        </div>
      </header>

      <main className="app-main">
        {connected ? (
          <BankAppInteract />
        ) : (
          <div className="connect-prompt">
            <h2>Chào mừng đến với Bank App</h2>
            <p>Kết nối ví Phantom của bạn để xem số dư, nạp SOL vào Bank App...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

### Phân tích:

- `**useWallet().connected**` — `true` khi ví đã kết nối. Logic đơn giản: chưa kết nối → lời chào; đã kết nối → hiển thị form giao dịch.
- **Nút ví ở góc phải trên** — `app-header-top` dùng `display: flex; justify-content: flex-end` để đẩy `WalletConnect` sang bên phải, giống layout các dApp thực tế (Raydium, Jupiter, ...).
- **Không có `WalletInfo` riêng** — số dư SOL và số dư bank đã được tích hợp trực tiếp trong `BankAppInteract`.

---

## 8. `components/WalletConnect.tsx` — Nút Kết Nối Ví

```tsx
// src/components/WalletConnect.tsx
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function WalletConnect() {
  return (
    <div className="wallet-connect">
      <WalletMultiButton />
    </div>
  );
}

export default WalletConnect;
```

`WalletMultiButton` là component của wallet-adapter tự xử lý toàn bộ luồng:

- **Chưa kết nối** → hiển thị "Select Wallet", click mở modal chọn ví
- **Đang kết nối** → hiển thị "Connecting..."
- **Đã kết nối** → hiển thị địa chỉ rút gọn (`AbCd...XyZw`), click mở menu disconnect

Bạn không cần tự viết logic kết nối/ngắt kết nối — `WalletMultiButton` lo hết.

---

## 9. `contracts/BankAppContract.ts` — Lớp Tương Tác On-Chain

Đây là phần cốt lõi của bài. Thay vì rải logic Anchor ở nhiều nơi, ta đặt hết vào một class.

### 9.1. Helper: chuyển đổi SOL → lamport an toàn

```ts
import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';
import idl from '../idl/bank_app.json';

export function parseSolInputToLamports(value: string): BN {
  const normalizedValue = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(normalizedValue)) {
    throw new Error('Số lượng SOL không hợp lệ. Dùng tối đa 9 chữ số thập phân.');
  }

  const [wholePart, fractionalPart = ''] = normalizedValue.split('.');
  const lamports =
    BigInt(wholePart) * BigInt(LAMPORTS_PER_SOL) + BigInt(fractionalPart.padEnd(9, '0'));

  if (lamports <= 0) {
    throw new Error('Số lượng SOL phải lớn hơn 0.');
  }

  return new BN(lamports.toString());
}
```

**Tại sao không đơn giản dùng `parseFloat(value) * LAMPORTS_PER_SOL`?**

```
parseFloat("0.1") * 1_000_000_000 = 100_000_000.00000001  ← sai!
```

Số thực dấu phẩy động (IEEE 754) **không chính xác** với phân số thập phân. Trên blockchain, amount phải chính xác đến từng lamport (1 SOL = 10^9 lamport). Hàm `parseSolInputToLamports` xử lý hoàn toàn bằng `BigInt` (số nguyên) nên tránh được lỗi làm tròn:

```
"0.1" → wholePart = "0", fractionalPart = "1"
       → BigInt("0") * BigInt(1_000_000_000) + BigInt("100000000")
       → 100_000_000n  ← chính xác!
```

### 9.2. Helper: lấy thông báo lỗi

```ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Giao dịch thất bại.';
}
```

### 9.3. PDA Derivation

```ts
export type BankPdas = {
  bankInfo: PublicKey;
  bankVault: PublicKey;
  userReserve: PublicKey;
};

export function getBankPdas(program: Program<Idl>, userPublicKey: PublicKey): BankPdas {
  const [bankInfo] = PublicKey.findProgramAddressSync(
    [Buffer.from('BANK_INFO_SEED')],
    program.programId
  );
  const [bankVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('BANK_VAULT_SEED')],
    program.programId
  );
  const [userReserve] = PublicKey.findProgramAddressSync(
    [Buffer.from('USER_RESERVE_SEED'), userPublicKey.toBuffer()],
    program.programId
  );

  return { bankInfo, bankVault, userReserve };
}
```

Chính xác cùng seeds như trong code Rust. PDA có tính **deterministic** — cùng seeds + program ID → cùng địa chỉ, dù bạn gọi từ test hay frontend. Đây là điều bạn đã học ở **Phần II**.

Chú ý `userReserve` có thêm seed `userPublicKey.toBuffer()` — mỗi ví sẽ có PDA `UserReserve` riêng.

### 9.4. Class `BankAppContract`

```ts
export class BankAppContract {
  readonly program: Program<Idl>;
  private readonly wallet: AnchorWallet;

  constructor(connection: Connection, wallet: AnchorWallet) {
    this.wallet = wallet;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    this.program = new Program(idl as Idl, provider);
  }

  async fetchUserReserveSol(): Promise<number> {
    const pdas = getBankPdas(this.program, this.wallet.publicKey);
    try {
      const data = await (this.program.account as any).userReserve.fetch(pdas.userReserve);
      if (!data) return 0;
      return data.depositedAmount.toNumber() / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  async deposit(amountInSol: string): Promise<string> {
    const amountInLamports = parseSolInputToLamports(amountInSol);
    const pdas = getBankPdas(this.program, this.wallet.publicKey);

    return this.program.methods
      .deposit(amountInLamports)
      .accounts({
        bankInfo: pdas.bankInfo,
        bankVault: pdas.bankVault,
        userReserve: pdas.userReserve,
        user: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
}
```

### Phân tích từng phần:

**Constructor:**

```ts
constructor(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  this.program = new Program(idl as Idl, provider);
}
```

Giống với cách test Anchor dùng `anchor.AnchorProvider.env()`, nhưng ở đây `wallet` đến từ Phantom (qua `useAnchorWallet()`). `AnchorWallet` là interface Anchor cần: `publicKey` + `signTransaction` + `signAllTransactions`.

`**fetchUserReserveSol`:**

Đọc account `UserReserve` on-chain và chuyển lamport → SOL. Block `try-catch` trả `0` nếu account chưa tồn tại (user chưa deposit lần nào) thay vì throw error.

`**deposit`:**

```ts
return this.program.methods
  .deposit(amountInLamports)
  .accounts({ bankInfo, bankVault, userReserve, user, systemProgram })
  .rpc();
```

Cú pháp **giống hệt** test Anchor ở Phần II. Khác biệt duy nhất: khi `.rpc()` được gọi, Anchor SDK xây transaction và gửi cho Phantom ký — Phantom hiện popup xác nhận. Sau khi người dùng xác nhận, transaction được gửi lên Devnet. Hàm trả về transaction signature (string).

---

## 10. `components/BankAppInteract.tsx` — Form Nạp/Rút Token

Đây là component lớn nhất, tích hợp giao diện nạp/rút dạng tab (giống giao diện Jupiter, Raydium) và quản lý toàn bộ state.

### 10.1. State và khởi tạo

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { BankAppContract, getErrorMessage } from '../contracts/BankAppContract';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

function BankAppInteract() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [userReserve, setUserReserve] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contract = useMemo(() => {
    if (!wallet) return null;
    return new BankAppContract(connection, wallet);
  }, [connection, wallet]);
```


| State           | Vai trò                                        |
| --------------- | ---------------------------------------------- |
| `tab`           | Tab đang active: `'deposit'` hoặc `'withdraw'` |
| `amount`        | Giá trị input người dùng nhập (string)         |
| `userReserve`   | Số SOL đã gửi vào bank (đọc từ on-chain)       |
| `walletBalance` | Số SOL trong ví (đọc từ RPC `getBalance`)      |
| `loading`       | Đang xử lý giao dịch                           |
| `txSignature`   | Signature sau khi giao dịch thành công         |
| `error`         | Thông báo lỗi                                  |
| `contract`      | Instance `BankAppContract`, tạo bằng `useMemo` |


**Tại sao dùng `useMemo` cho `contract`?**

```ts
// ✅ Đúng — chỉ tạo khi connection hoặc wallet thay đổi
const contract = useMemo(() => {
  if (!wallet) return null;
  return new BankAppContract(connection, wallet);
}, [connection, wallet]);

// ❌ Sai — tạo mới mỗi render → tốn bộ nhớ, vòng lặp useEffect
const contract = new BankAppContract(connection, wallet);
```

### 10.2. Fetch dữ liệu và WebSocket subscription

```tsx
  const refreshReserve = useCallback(async () => {
    if (!contract) return;
    try {
      const sol = await contract.fetchUserReserveSol();
      setUserReserve(sol);
    } catch (fetchError) {
      console.error('fetchUserReserve error:', fetchError);
      setUserReserve(0);
    }
  }, [contract]);

  const refreshWalletBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      const lamports = await connection.getBalance(wallet.publicKey);
      setWalletBalance(lamports / LAMPORTS_PER_SOL);
    } catch (fetchError) {
      console.error('fetchWalletBalance error:', fetchError);
      setWalletBalance(0);
    }
  }, [connection, wallet]);

  // Fetch khi wallet kết nối hoặc contract thay đổi
  useEffect(() => {
    void refreshReserve();
    void refreshWalletBalance();
  }, [refreshReserve, refreshWalletBalance]);

  // Tự động cập nhật số dư SOL qua WebSocket
  useEffect(() => {
    if (!wallet) return;

    const subscriptionId = connection.onAccountChange(wallet.publicKey, () => {
      void refreshWalletBalance();
    });

    return () => {
      void connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, refreshWalletBalance, wallet]);
```

**Giải thích `connection.onAccountChange`:**

Solana RPC hỗ trợ WebSocket subscription. `onAccountChange(publicKey, callback)` gọi `callback` mỗi khi account của ví thay đổi on-chain — ví dụ nhận SOL từ airdrop, trả phí giao dịch, hay deposit vào bank. Nhờ đó **số dư tự cập nhật real-time** mà không cần người dùng bấm nút refresh.

Khi component unmount, gọi `removeAccountChangeListener` để hủy subscription — tránh memory leak.

### 10.3. Xử lý deposit và withdraw

```tsx
  const handleDeposit = async () => {
    if (!contract) return;
    setLoading(true);
    setError(null);
    setTxSignature(null);
    try {
      const tx = await contract.deposit(amount);
      setTxSignature(tx);
      setAmount('');
      await Promise.all([refreshReserve(), refreshWalletBalance()]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    // Withdraw flow — bạn sẽ implement ở phần bài tập
  };
```

**Luồng `handleDeposit` chi tiết:**

1. `setLoading(true)` → nút chuyển thành "Đang xử lý...", input bị disabled.
2. `await contract.deposit(amount)` → Anchor build transaction → **Phantom hiện popup**.
3. Người dùng xác nhận trong Phantom → transaction gửi lên Devnet.
4. `.rpc()` chờ xác nhận với commitment `confirmed` → trả về signature.
5. `setTxSignature(tx)` → hiển thị link Explorer.
6. `**Promise.all([refreshReserve(), refreshWalletBalance()])`** → fetch đồng thời cả số dư bank và số dư ví. Dùng `Promise.all` thay vì gọi tuần tự để nhanh hơn.
7. `catch` → nếu người dùng từ chối trong Phantom hoặc transaction fail, hiển thị lỗi.
8. `finally` → `setLoading(false)` dù thành công hay thất bại.

### 10.4. Giao diện (JSX)

```tsx
  if (!wallet || !contract) {
    return (
      <div className="card">
        <p>Đang khởi tạo kết nối với program...</p>
      </div>
    );
  }

  return (
    <div className="card bank-interact">
      {/* Tab nạp / rút */}
      <div className="trade-tabs">
        <button
          className={`trade-tab ${tab === 'deposit' ? 'active' : ''}`}
          onClick={() => { setTab('deposit'); setError(null); setTxSignature(null); }}
          disabled={loading}
        >
          Nạp token
        </button>
        <button
          className={`trade-tab ${tab === 'withdraw' ? 'active' : ''}`}
          onClick={() => { setTab('withdraw'); setError(null); setTxSignature(null); }}
          disabled={loading}
        >
          Rút token
        </button>
      </div>

      <div className="trade-content">
        <div>
          <div className="trade-header-row">
            <label className="trade-label">Chọn Token & Số lượng</label>
            <span className="trade-balance">
              {tab === 'deposit' ? walletBalance.toFixed(4) : userReserve.toFixed(4)} SOL
            </span>
          </div>

          <div className="trade-form-grid">
            <button className="trade-token-button" disabled>
              <div className="trade-token-button-left">
                <div className="trade-token-icon">◎</div>
                <span className="trade-token-symbol">SOL</span>
              </div>
            </button>

            <div className="trade-amount-field">
              <input
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <button
          className="trade-submit-button"
          onClick={() => void (tab === 'deposit' ? handleDeposit() : handleWithdraw())}
          disabled={loading || amount.trim().length === 0}
        >
          {loading ? 'Đang xử lý...' : 'Xác nhận giao dịch'}
        </button>
      </div>

      {txSignature && (
        <div className="tx-result success">
          <p>Giao dịch thành công!</p>
          <a
            href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem trên Solana Explorer ↗
          </a>
        </div>
      )}

      {error && (
        <div className="tx-result error">
          <p>Lỗi: {error}</p>
        </div>
      )}
    </div>
  );
```

### Thiết kế UI:

Giao diện theo phong cách **glass-panel** thường thấy trong các DeFi app:

- **Tab nạp/rút** ở trên cùng — khi chuyển tab, số dư hiển thị thay đổi (tab "Nạp" → hiện số dư ví, tab "Rút" → hiện số dư trong bank).
- **Token selector** bên trái (hiện tại fixed = SOL), **input số lượng** bên phải với text căn phải.
- **Nút "Xác nhận giao dịch"** full-width ở dưới cùng.
- Kết quả giao dịch (thành công/lỗi) hiển thị bên dưới form.

---

## 11. `vite-env.d.ts` — Khai Báo Biến Môi Trường

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

File này cho TypeScript biết `import.meta.env.VITE_SOLANA_RPC_URL` là string hợp lệ. Nếu không có, TS sẽ cảnh báo `Property 'VITE_SOLANA_RPC_URL' does not exist on type 'ImportMetaEnv'`.

Bạn có thể tạo file `.env` ở thư mục gốc `bank-app-frontend/`:

```
VITE_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

Nếu không tạo, app tự dùng `clusterApiUrl('devnet')`.

---

## 12. Chạy Thử

```bash
cd bank-app-frontend
npm run dev
```

Vite in ra URL, thường `http://localhost:5173`. Mở trình duyệt và:

1. Cài extension **Phantom** (nếu chưa có): [https://phantom.app](https://phantom.app)
2. Trong Phantom, chuyển network sang **Devnet**: Settings → Developer Settings → Testnet Mode → Devnet.
3. Xin airdrop nếu số dư = 0:

```bash
solana airdrop 2 <your-address> --url devnet
```

1. **Kết nối ví** — bấm nút "Select Wallet" ở góc phải trên → chọn Phantom → Approve.
2. Giao diện hiện form nạp/rút. Nhập số SOL nhỏ (ví dụ `0.01`) → bấm "Xác nhận giao dịch" → xác nhận trong Phantom.
3. Kiểm tra link Explorer → thấy giao dịch đã confirmed.
4. Số dư SOL tự giảm, số dư bank tự tăng (nhờ WebSocket subscription).

### Build production:

```bash
npm run build
```

Lệnh này chạy `tsc` (kiểm tra TypeScript) rồi `vite build` (tạo bundle production). Output nằm trong `dist/`.

---

## 13. Những Điểm Cần Lưu Ý

### 13.1. useAnchorWallet vs useWallet

```ts
// useWallet() — dùng cho UI: connected, publicKey, disconnect
const { publicKey, connected } = useWallet();

// useAnchorWallet() — dùng cho Anchor: trả về AnchorWallet (có signTransaction)
const wallet = useAnchorWallet(); // có thể undefined nếu ví chưa sẵn sàng
```


| Hook                | Trả về                                      | Dùng khi                                           |
| ------------------- | ------------------------------------------- | -------------------------------------------------- |
| `useWallet()`       | `{ publicKey, connected, disconnect, ... }` | Hiển thị UI, kiểm tra trạng thái kết nối           |
| `useAnchorWallet()` | `AnchorWallet | undefined`                  | Tạo `AnchorProvider` → `Program` → gọi instruction |


`AnchorWallet` là interface mà Anchor cần: `publicKey` + `signTransaction` + `signAllTransactions`. Đó là lý do ta dùng nó trong `BankAppContract`.

### 13.2. useMemo, useCallback, useEffect — tại sao cần cả ba?

Trong `BankAppInteract`, ba hook này phối hợp chặt chẽ:

```
useMemo(contract)
    ↓ khi wallet/connection đổi → contract mới
useCallback(refreshReserve)
    ↓ khi contract đổi → hàm fetch mới
useEffect
    ↓ khi refreshReserve đổi → gọi fetch
```

Nếu không dùng `useMemo`, contract tạo mới mỗi render → `useCallback` phụ thuộc contract nên cũng tạo mới → `useEffect` phụ thuộc callback nên chạy lại → fetch liên tục → **vòng lặp vô hạn**.

### 13.3. Tại sao input dùng `type="text"` thay vì `type="number"`?

```tsx
<input type="text" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
```

`type="number"` trong HTML có nhiều vấn đề:

- Tự thêm nút spinner (mũi tên lên/xuống) — xấu trong DeFi UI.
- Một số trình duyệt làm tròn số khi submit.
- Không cho nhập dấu chấm ở đầu trên một số locale.

Dùng `type="text"` + validate bằng regex trong `parseSolInputToLamports` — kiểm soát tốt hơn.

### 13.4. Lỗi phổ biến: IDL không khớp

Nếu gặp lỗi khi deposit (ví dụ "Account discriminator mismatch", "Invalid account data"), nguyên nhân phổ biến nhất là IDL frontend không khớp với program đã deploy.

```bash
# Luôn copy lại IDL sau khi build
cd bank-app
anchor build
cp target/idl/bank_app.json ../bank-app-frontend/src/idl/bank_app.json
```

### 13.5. void trước async call trong event handler

```tsx
<button onClick={() => void handleDeposit()}>
```

`handleDeposit()` trả về `Promise<void>`. Nếu không xử lý promise (không `await`, không `.catch()`), ESLint cảnh báo "floating promise". `void` nói rõ: "ta biết đây là promise nhưng cố ý không xử lý giá trị trả về" — vì logic error handling đã nằm bên trong `handleDeposit` (block `try-catch`).

---

## 14. Thực Hành

### Bài 1 — Implement Withdraw

### Bài 2 — Bank-app hỗ trợ thêm nhiều loại token

### Bài 3 — Lịch sử deposit và withdraw tới bank-app gần nhất

