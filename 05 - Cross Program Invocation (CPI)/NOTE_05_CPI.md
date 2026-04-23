# Ghi chú Chương 05: Cross Program Invocation (CPI)

Chương này tập trung vào khả năng "giao tiếp" giữa các chương trình trên Solana. Đây là nền tảng để xây dựng các hệ thống DeFi phức tạp.

---

## 1. Nội dung cốt lõi (Core Concepts)

### CPI là gì?

- Là việc **Program A** gọi một hàm của **Program B**.
- Giúp các chương trình có thể sử dụng lại logic của nhau (ví dụ: gọi Token Program để chuyển tiền).

### Các thành phần quan trọng:

1.  **CpiContext:** Chứa thông tin về chương trình mục tiêu và các tài khoản cần thiết.
2.  **new_with_signer:** Dùng khi chương trình hiện tại cần ký thay cho một PDA của nó để gọi chương trình khác.
3.  **Composability:** Khả năng lắp ghép các giao thức lại với nhau (như xếp hình Lego).

---

## 2. Dự án thực hành: Bank App & Staking App

Mô hình:

- **Bank App:** Đóng vai trò là người quản lý quỹ.
- **Staking App:** Đóng vai trò là nơi đầu tư sinh lãi.
- **Luồng đi:** Admin Bank gọi lệnh `invest` -> Bank App thực hiện **CPI** sang Staking App để gửi tiền vào lấy lãi.

---

## 3. Các bài tập cần thực hiện (TODO List)

### ✅ Bài tập 1: Đầu tư SPL Token (`invest_token`)

- [x] **Staking App:** Thêm lệnh `stake_token` để nhận và trả Token.
- [x] **Bank App:** Thêm lệnh `invest_token` để chuyển Token từ kho ngân hàng sang kho staking.
- [x] **CPI Logic:** Sử dụng `CpiContext::new_with_signer` để PDA `bank_vault` có quyền ký lệnh chuyển Token.

### ✅ Bài tập 2: Tính lãi suất chính xác theo thời gian

- [x] **Timestamp:** Sử dụng `Clock::get()?.unix_timestamp` để lấy thời gian thực trên blockchain.
- [x] **Logic lãi suất:**
  - Tính thời gian trôi qua kể từ lần tương tác cuối (`pass_time`).
  - Công thức: `Interest = Balance * APR * pass_time / (100 * Seconds_Per_Year)`.
- [x] **Độ chính xác:** Tính toán dựa trên tài khoản cá nhân (`UserInfo`) của từng ví, đảm bảo ai gửi lúc nào thì tính lãi từ lúc đó.
- [x] **APR cao:** Thiết lập APR 5000% để dễ dàng quan sát sự thay đổi số dư trong vài giây.

### ✅ Bài tập 3: Ghi Log theo dõi (Logging)

- [x] **msg!:** Thêm các dòng lệnh ghi log về:
  - Thời gian trôi qua (Pass time).
  - Tiền lãi phát sinh (Interest earned).
  - Số dư mới sau khi cộng lãi.

---

## 4. Hướng dẫn Kiểm tra (Verification)

1.  **Deploy:** Cần deploy cả 2 chương trình `bank_app` và `staking_app` lên Devnet/Localnet.
2.  **Giao dịch:** Thực hiện gửi tiền cách nhau 30s giữa 2 ví khác nhau.
3.  **Xem Log:**
    - Truy cập **Solscan.io** (chọn mạng tương ứng).
    - Dán mã giao dịch (Signature).
    - Kéo xuống phần **Program Logs** để xem các dòng `msg!` mà chương trình đã in ra.
