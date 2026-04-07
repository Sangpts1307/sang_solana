# Giải thích Logic & Luồng hoạt động của Bank App (PDA)

Tài liệu này giải thích chi tiết cách thức hoạt động của chương trình Ngân hàng (Bank App) sử dụng **Program Derived Address (PDA)** trên Solana.

---

## 1. Kiến trúc Tài khoản (Account Architecture)

Trong ứng dụng này, thay vì sử dụng ví cá nhân để giữ tiền của hệ thống, chúng ta sử dụng **PDA** (Tài khoản do chương trình làm chủ) để đảm bảo tính minh bạch và an toàn.

### A. PDA Toàn cục (Global PDA)
1.  **BankInfo (Trạng thái):** 
    - Lưu trữ: Khóa ví Admin (`authority`), trạng thái tạm dừng (`is_paused`), và giá trị `bump` của Vault.
    - Seed: `b"BANK_INFO_SEED"`.
2.  **BankVault (Kho quỹ):** 
    - Đây là nơi thực sự chứa SOL của toàn bộ ngân hàng. 
    - Nó là một PDA do hệ thống sở hữu (`SystemProgram`), giúp việc chuyển SOL gốc trực tiếp trở nên dễ dàng.
    - Seed: `b"BANK_VAULT_SEED"`.

### B. PDA Cá nhân (User-specific PDA)
1.  **UserReserve (Sổ cái người dùng):** 
    - Mỗi người dùng sẽ có một UserReserve riêng để theo dõi số tiền họ đã gửi.
    - Seed: `b"USER_RESERVE_SEED"` + `khóa_ví_người_dùng.to_bytes()`.
    - Điều này đảm bảo mỗi ví chỉ có duy nhất một sổ cái trong ứng dụng này.

---

## 2. Giải thích các luồng Logic (Instruction Flows)

### 🟢 Initialize (Khởi tạo)
- **Mục đích:** Thiết lập ngân hàng lần đầu tiên.
- **Luồng:**
    1. Tạo tài khoản `BankInfo`.
    2. Chỉ định người gọi lệnh này là `authority` (Admin).
    3. Đặt `is_paused = false`.
    4. Lưu giá trị `bump` để sau này chương trình có thể "ký" thay cho kho quỹ.

### 💰 Deposit (Nạp tiền)
- **Kiểm tra (Guards):**
    1. Tài khoản ngân hàng có đang bị tạm dừng (Paused) không?
    2. Số tiền nạp có nằm trong khoảng cho phép không (**0.01 SOL - 100 SOL**)?
- **Hành động:**
    1. Sử dụng helper `sol_transfer_from_user` để chuyển SOL từ ví người dùng vào `BankVault`.
    2. Cập nhật số dư trong `UserReserve` tương ứng với địa chỉ ví của người dùng đó.
    3. Ghi log `msg!` để theo dõi giao dịch.

### 💸 Withdraw (Rút tiền)
- **Kiểm tra (Guards):**
    1. Ngân hàng có đang bị tạm dừng không?
    2. Sổ cái `UserReserve` của người dùng đã được khởi tạo chưa?
    3. Số dư trong sổ cái có đủ để rút không?
- **Điểm mấu chốt (PDA Signature):**
    - Vì `BankVault` là tài khoản do chương trình làm chủ, không ai có private key của nó.
    - Để chuyển tiền ra (Withdraw), chương trình phải sử dụng kỹ thuật **PDA Signing** thông qua lệnh `invoke_signed`.
    - Chương trình cung cấp các `seeds` và `bump` để chứng minh quyền sở hữu tài khoản Vault.
- **Hành động:**
    1. Chuyển SOL từ `BankVault` về ví người dùng.
    2. Trừ số dư tương ứng trong `UserReserve`.

### ⏸️ Pause/Unpause (Quản trị)
- **Kiểm tra:** Người gọi lệnh có phải là `authority` đã lưu trong `BankInfo` không?
- **Hành động:** Thay đổi giá trị `is_paused` trong `BankInfo`. Khi biến này là `true`, mọi lệnh nạp/rút tiền sẽ bị từ chối ngay lập tức.

---

## 3. Tại sao PDA lại quan trọng?

1.  **Tính xác định (Deterministic):** Bất kỳ ai (frontend, script test) cũng có thể tính toán được địa chỉ ví của kho quỹ hoặc sổ cái người dùng chỉ dựa vào các `seeds` cố định.
2.  **Bảo mật:** Tiền trong `BankVault` chỉ có thể được chuyển ra nếu code của chương trình cho phép (thông qua lệnh Rút tiền). Không một cá nhân nào có thể can thiệp vào số dư SOL này.
3.  **Tự động hóa:** Chương trình có thể tự động khởi tạo sổ cái cho người dùng mới ngay khi họ thực hiện lệnh nạp tiền đầu tiên (`init_if_needed`).

---

## 4. Các hàm trợ giúp (Helpers)

-   `sol_transfer_from_user`: Sử dụng `invoke` bình thường vì người dùng là người ký tên (Signer) vào giao dịch.
-   `sol_transfer_from_pda`: Sử dụng `invoke_signed` vì PDA không có private key, nó cần chương trình "ký" thay bằng cách cung cấp hạt giống (seeds).

---
*Tài liệu này được soạn thảo để giúp bạn nắm vững kiến thức về Program Derived Address trong thực tế phát hành ứng dụng Solana.*
